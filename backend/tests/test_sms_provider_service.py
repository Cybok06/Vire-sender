import unittest
from pathlib import Path
import sys
from unittest.mock import Mock, patch


sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from services.sms_provider_service import (
    MOOLRE_BASE_URL,
    BirdSmsProvider,
    MoolreSmsProvider,
    SmsProviderConfigurationError,
    SmsProviderError,
    validate_moolre_base_url,
)
from services.moolre_sender_id_service import SenderIdError, provider_status_to_local, validate_sender_id


class MoolreSmsProviderTests(unittest.TestCase):
    def response(self, ok=True, status_code=200, payload=None, content=b"{}"):
        response = Mock()
        response.ok = ok
        response.status_code = status_code
        response.content = content
        response.json.return_value = payload if payload is not None else {"status": 1, "code": "SMS01", "message": "Success"}
        return response

    def test_bird_uses_regional_simplified_api_with_bearer_key(self):
        provider = BirdSmsProvider("bk_eu1_12345678901234567890")
        payload = {"id": "bird-message-1", "status": "accepted"}
        with patch("services.sms_provider_service.requests.post", return_value=self.response(payload=payload)) as post:
            result = provider.send_single("VireSend", "+447700900123", "Hello UK", "ref-bird-1")
        self.assertTrue(result["success"])
        self.assertEqual(result["provider_status"], "accepted")
        self.assertEqual(post.call_args.args[0], "https://eu1.platform.bird.com/v1/sms/messages")
        self.assertEqual(post.call_args.kwargs["headers"]["Authorization"], "Bearer bk_eu1_12345678901234567890")
        self.assertEqual(post.call_args.kwargs["json"], {"to": "+447700900123", "text": "Hello UK", "category": "transactional", "from": "VireSend"})
        self.assertEqual(post.call_args.kwargs["headers"]["Idempotency-Key"], "ref-bird-1")

    def test_bird_shared_sender_omits_from(self):
        provider = BirdSmsProvider("bk_us1_12345678901234567890")
        payload = {"id": "bird-message-us", "status": "accepted"}
        messages = [{"recipient": "+12025550123", "message": "Account update", "category": "service", "shared_sender": True, "ref": "ref-bird-us"}]
        with patch("services.sms_provider_service.requests.post", return_value=self.response(payload=payload)) as post:
            result = provider.send_bulk("MyBrand", messages)
        self.assertTrue(result["success"])
        self.assertEqual(post.call_args.kwargs["json"], {"to": "+12025550123", "text": "Account update", "category": "service"})

    def test_bird_auth_error_is_safe(self):
        provider = BirdSmsProvider("bk_us1_12345678901234567890")
        with patch("services.sms_provider_service.requests.post", return_value=self.response(False, 401, {"message": "secret provider detail"})):
            with self.assertRaises(SmsProviderError) as ctx:
                provider.send_single("VireSend", "+12025550123", "Hello", "ref-bird-2")
        self.assertEqual(ctx.exception.message, "International SMS is currently unavailable.")
        self.assertNotIn("secret provider detail", ctx.exception.message)

    def test_bird_nested_error_response_does_not_crash(self):
        provider = BirdSmsProvider("bk_us1_12345678901234567890")
        payload = {
            "code": "invalid_request",
            "message": {"detail": "Receiver is not supported", "field": "receiver"},
        }
        with patch("services.sms_provider_service.requests.post", return_value=self.response(False, 422, payload)):
            with self.assertRaises(SmsProviderError) as ctx:
                provider.send_single("VireSend", "+12025550123", "Hello", "ref-bird-3")
        self.assertEqual(ctx.exception.code, "invalid_request")
        self.assertEqual(ctx.exception.status_code, 422)
        self.assertEqual(ctx.exception.raw["bird_error"], "Receiver is not supported")
        self.assertEqual(ctx.exception.message, "SMS sending to this destination is currently unavailable.")

    def test_send_single_uses_official_endpoint_header_and_body(self):
        provider = MoolreSmsProvider("vas-key")
        with patch("services.sms_provider_service.requests.post", return_value=self.response()) as post:
            result = provider.send_single("VireSender", "233241234567", "Hello", "ref-1")
        self.assertTrue(result["success"])
        args, kwargs = post.call_args
        self.assertEqual(args[0], f"{MOOLRE_BASE_URL}/open/sms/send")
        self.assertEqual(kwargs["headers"]["X-API-VASKEY"], "vas-key")
        self.assertEqual(kwargs["json"], {
            "type": 1,
            "senderid": "VireSender",
            "messages": [{"recipient": "233241234567", "message": "Hello", "ref": "ref-1"}],
        })

    def test_bulk_success_keeps_unique_references(self):
        provider = MoolreSmsProvider("vas-key", batch_size=1)
        messages = [
            {"recipient": "233241234567", "message": "One", "ref": "ref-1"},
            {"recipient": "233501234567", "message": "Two", "ref": "ref-2"},
        ]
        with patch("services.sms_provider_service.requests.post", return_value=self.response()) as post:
            result = provider.send_bulk("BUSINESS", messages)
        self.assertTrue(result["success"])
        self.assertEqual(result["references"], ["ref-1", "ref-2"])
        self.assertEqual(post.call_count, 2)

    def test_application_failure_inside_http_200_is_not_success(self):
        provider = MoolreSmsProvider("vas-key")
        payload = {"status": 0, "code": "ASMS07", "message": "Sender ID is not approved"}
        with patch("services.sms_provider_service.requests.post", return_value=self.response(payload=payload)):
            result = provider.send_single("BAD", "233241234567", "Hello", "ref-1")
        self.assertFalse(result["success"])
        self.assertEqual(result["provider_code"], "ASMS07")
        self.assertEqual(result["provider_error"], "Sender ID is not approved for Moolre SMS.")

    def test_http_auth_failure_returns_safe_error(self):
        provider = MoolreSmsProvider("vas-key")
        payload = {"status": 0, "code": "AIN01", "message": "Authentication Error"}
        with patch("services.sms_provider_service.requests.post", return_value=self.response(False, 401, payload)):
            with self.assertRaises(SmsProviderError) as ctx:
                provider.send_single("VireSender", "233241234567", "Hello", "ref-1")
        self.assertEqual(ctx.exception.code, "AIN01")
        self.assertIn("VAS key", ctx.exception.message)
        self.assertNotIn("vas-key", ctx.exception.message)

    def test_invalid_json_is_rejected(self):
        provider = MoolreSmsProvider("vas-key")
        response = self.response()
        response.json.side_effect = ValueError("bad json")
        with patch("services.sms_provider_service.requests.post", return_value=response):
            with self.assertRaises(SmsProviderError) as ctx:
                provider.send_single("VireSender", "233241234567", "Hello", "ref-1")
        self.assertEqual(ctx.exception.code, "invalid_json")

    def test_only_official_moolre_url_allowed(self):
        self.assertEqual(validate_moolre_base_url("https://api.moolre.com"), MOOLRE_BASE_URL)
        with self.assertRaises(SmsProviderConfigurationError):
            validate_moolre_base_url("http://127.0.0.1:5000")

    def test_status_request_keeps_raw_numeric_status(self):
        provider = MoolreSmsProvider("vas-key")
        payload = {"status": 1, "code": "ASMQ10", "message": "SMS Status", "data": [{"ref": "ref-1", "status": 3}]}
        with patch("services.sms_provider_service.requests.post", return_value=self.response(payload=payload)) as post:
            result = provider.check_delivery_status(["ref-1"])
        self.assertTrue(result["success"])
        self.assertEqual(result["statuses"][0]["status"], 3)
        self.assertEqual(post.call_args.kwargs["json"], {"type": 5, "ref": ["ref-1"]})

    def test_account_status_test_connection_uses_documented_endpoint(self):
        provider = MoolreSmsProvider("vas-key")
        payload = {"status": 1, "code": "ASMQ03", "message": "Account Status", "data": {"balance": 857}}
        with patch("services.sms_provider_service.requests.post", return_value=self.response(payload=payload)) as post:
            result = provider.test_connection()
        self.assertTrue(result["connected"])
        self.assertEqual(result["balance"], 857)
        self.assertEqual(post.call_args.args[0], f"{MOOLRE_BASE_URL}/open/sms/status")
        self.assertEqual(post.call_args.kwargs["json"], {"type": 2})

    def test_create_sender_id_records_pending_submission_not_approval(self):
        provider = MoolreSmsProvider("vas-key")
        payload = {"status": 1, "code": "ASMQ12", "message": "Sender IDs Created Successfully.", "data": None}
        with patch("services.sms_provider_service.requests.post", return_value=self.response(payload=payload)) as post:
            result = provider.create_sender_id("SmartBiz")
        self.assertTrue(result["success"])
        self.assertEqual(result["provider_code"], "ASMQ12")
        self.assertEqual(post.call_args.args[0], f"{MOOLRE_BASE_URL}/open/sms/query")
        self.assertEqual(post.call_args.kwargs["json"], {"type": 3, "senderids": [{"senderid": "SmartBiz"}]})

    def test_sender_id_status_keeps_provider_approval_value(self):
        provider = MoolreSmsProvider("vas-key")
        payload = {"status": 1, "code": "ASMQ01", "message": "Sender ID Status", "data": {"senderid": "SmartSMS", "approval": "Approved", "whitelisted": False}}
        with patch("services.sms_provider_service.requests.post", return_value=self.response(payload=payload)) as post:
            result = provider.check_sender_id_status("SmartSMS")
        self.assertEqual(result["data"]["approval"], "Approved")
        self.assertEqual(post.call_args.kwargs["json"], {"type": 1, "senderid": "SmartSMS"})

    def test_list_sender_ids_uses_documented_type_7(self):
        provider = MoolreSmsProvider("vas-key")
        payload = {"status": 1, "code": "ASMQ08", "message": "List of Your Sender IDs.", "data": [{"id": 13, "senderid": "SmartSMS", "approval": "Approved", "whitelisted": False}]}
        with patch("services.sms_provider_service.requests.post", return_value=self.response(payload=payload)) as post:
            result = provider.list_sender_ids()
        self.assertEqual(result["sender_ids"][0]["senderid"], "SmartSMS")
        self.assertEqual(post.call_args.kwargs["json"], {"type": 7})

    def test_sender_id_local_validation_and_status_mapping(self):
        self.assertEqual(validate_sender_id(" SmartBiz "), "SmartBiz")
        self.assertEqual(provider_status_to_local("Approved"), "approved")
        self.assertEqual(provider_status_to_local("Pending"), "pending")
        self.assertEqual(provider_status_to_local("Rejected"), "rejected")
        self.assertEqual(provider_status_to_local("Something Else"), "status_unknown")
        with self.assertRaises(SenderIdError):
            validate_sender_id("TooLongSender")
        with self.assertRaises(SenderIdError):
            validate_sender_id("Bad*Name")


if __name__ == "__main__":
    unittest.main()
