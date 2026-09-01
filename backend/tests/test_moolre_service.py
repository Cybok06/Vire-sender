import unittest
from pathlib import Path
import sys
from unittest.mock import Mock, patch


sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from services.moolre_service import MoolreError, MoolreService, normalize_initiation, normalize_payment_link, normalize_status


class MoolreServiceTests(unittest.TestCase):
    def service(self):
        return MoolreService({
            "environment": "sandbox",
            "api_username": "demo",
            "account_number": "100000100002",
            "currency": "GHS",
        })

    def test_phone_normalization(self):
        svc = self.service()
        self.assertEqual(svc.normalize_phone_number("0241234567"), "233241234567")
        self.assertEqual(svc.normalize_phone_number("+233241234567"), "233241234567")

    def test_invalid_phone(self):
        with self.assertRaises(MoolreError):
            self.service().normalize_phone_number("123")

    def test_channel_mapping(self):
        svc = self.service()
        self.assertEqual(svc.resolve_channel("mtn"), "13")
        self.assertEqual(svc.resolve_channel("telecel"), "6")
        self.assertEqual(svc.resolve_channel("at"), "7")

    def test_otp_required_initiation(self):
        result = normalize_initiation({"status": 1, "code": "TP14", "message": "OTP required", "data": "all"})
        self.assertEqual(result["status"], "otp_required")

    def test_pending_initiation(self):
        result = normalize_initiation({"status": 1, "code": "TR099", "message": None, "data": "provider-ref"})
        self.assertEqual(result["status"], "pending")
        self.assertEqual(result["provider_reference"], "provider-ref")

    def test_successful_status(self):
        result = normalize_status({
            "status": 1,
            "code": "SS01",
            "message": "Transaction Successful",
            "data": {
                "txstatus": 1,
                "accountnumber": "100000100002",
                "amount": "100.00",
                "externalref": "VIRE-DEP-1",
                "transactionid": "123",
            },
        })
        self.assertEqual(result["status"], "successful")
        self.assertEqual(result["external_reference"], "VIRE-DEP-1")

    def test_payment_link_normalization_requires_https_url(self):
        result = normalize_payment_link({
            "status": 1,
            "code": "POS09",
            "message": "POS payment link successfully generated.",
            "data": {"authorization_url": "https://pos.moolre.com/test", "reference": "mref"},
        })
        self.assertEqual(result["authorization_url"], "https://pos.moolre.com/test")
        self.assertEqual(result["provider_reference"], "mref")
        with self.assertRaises(MoolreError):
            normalize_payment_link({"status": 1, "code": "POS09", "data": {"authorization_url": "http://pos.moolre.com/test"}})

    def test_generate_payment_link_uses_live_base_url_and_pubkey(self):
        response = Mock()
        response.ok = True
        response.status_code = 200
        response.json.return_value = {
            "status": 1,
            "code": "POS09",
            "message": "POS payment link successfully generated.",
            "data": {"authorization_url": "https://pos.moolre.com/link", "reference": "mref"},
        }
        svc = MoolreService({
            "environment": "live",
            "api_username": "api-user",
            "public_key": "pub-key",
            "private_key": "priv-key",
            "account_number": "100000100002",
        })
        with patch("services.moolre_service.requests.post", return_value=response) as post:
            result = svc.generate_payment_link(
                amount=100,
                email="customer@example.com",
                external_reference="VIRE-DEP-1",
                callback_url="https://viresender.com/api/payments/moolre/webhook",
                redirect_url="https://viresender.com/wallet/deposit/moolre/return",
                metadata={"purpose": "wallet_deposit"},
            )
        self.assertEqual(result["authorization_url"], "https://pos.moolre.com/link")
        args, kwargs = post.call_args
        self.assertEqual(args[0], "https://api.moolre.com/embed/link")
        self.assertEqual(kwargs["headers"]["X-API-USER"], "api-user")
        self.assertEqual(kwargs["headers"]["X-API-PUBKEY"], "pub-key")
        self.assertNotIn("X-API-KEY", kwargs["headers"])
        self.assertEqual(kwargs["json"]["accountnumber"], "100000100002")
        self.assertEqual(kwargs["json"]["callback"], "https://viresender.com/api/payments/moolre/webhook")
        self.assertEqual(kwargs["json"]["redirect"], "https://viresender.com/wallet/deposit/moolre/return")
        self.assertEqual(kwargs["json"]["reusable"], "0")

    def test_generate_payment_link_uses_sandbox_base_url_without_pubkey(self):
        response = Mock()
        response.ok = True
        response.status_code = 200
        response.json.return_value = {
            "status": 1,
            "code": "POS09",
            "data": {"authorization_url": "https://pos.moolre.com/link", "reference": "mref"},
        }
        svc = self.service()
        with patch("services.moolre_service.requests.post", return_value=response) as post:
            svc.generate_payment_link(10, "customer@example.com", "REF", "https://cb.test", "https://return.test")
        args, kwargs = post.call_args
        self.assertEqual(args[0], "https://sandbox.moolre.com/embed/link")
        self.assertEqual(kwargs["headers"]["X-API-USER"], "demo")
        self.assertNotIn("X-API-PUBKEY", kwargs["headers"])


if __name__ == "__main__":
    unittest.main()
