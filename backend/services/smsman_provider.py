import base64
import hashlib
import hmac
import time

import requests
from flask import current_app

from config import Config
from utils.security import now_utc


BASE_URL = "https://api.sms-man.com/control"
TIMEOUT = 20
GET_NUMBER_TIMEOUT = (10, 60)
TRANSIENT_STATUS_CODES = {502, 503, 504}


class SmsmanError(Exception):
    def __init__(self, code: str, message: str, raw=None):
        super().__init__(message)
        self.code = code
        self.message = message
        self.raw = raw


def _secret_key():
    return hashlib.sha256(Config.JWT_SECRET.encode("utf-8")).digest()


def encrypt_secret(value: str) -> str:
    if not value:
        return ""
    key = _secret_key()
    raw = value.encode("utf-8")
    encrypted = bytes(byte ^ key[index % len(key)] for index, byte in enumerate(raw))
    signature = hmac.new(key, encrypted, hashlib.sha256).digest()[:16]
    return base64.urlsafe_b64encode(signature + encrypted).decode("utf-8")


def decrypt_secret(value: str) -> str:
    if not value:
        return ""
    try:
        key = _secret_key()
        payload = base64.urlsafe_b64decode(value.encode("utf-8"))
        signature, encrypted = payload[:16], payload[16:]
        expected = hmac.new(key, encrypted, hashlib.sha256).digest()[:16]
        if not hmac.compare_digest(signature, expected):
            return ""
        raw = bytes(byte ^ key[index % len(key)] for index, byte in enumerate(encrypted))
        return raw.decode("utf-8")
    except Exception:
        return ""


def provider_settings_collection():
    return current_app.config["DB"].provider_settings


def request_logs_collection():
    return current_app.config["DB"].smsman_request_logs


def get_provider_settings():
    try:
        return provider_settings_collection().find_one({"provider": "smsman"}) or {}
    except RuntimeError:
        return {}


def token_mask(value: str) -> str:
    if not value:
        return ""
    if len(value) <= 8:
        return f"{value[:2]}****"
    return f"{value[:4]}...{value[-4:]}"


def get_smsman_token(token_override: str | None = None, require_active: bool = True):
    if token_override:
        return token_override
    settings = get_provider_settings()
    if require_active and settings and settings.get("is_active") is False:
        raise SmsmanError("provider_inactive", "SMS-MAN provider is disabled.")

    token = decrypt_secret(settings.get("api_token_encrypted", "")) if settings else ""
    token = token or Config.SMSMAN_API_TOKEN
    if not token:
        raise SmsmanError("missing_token", "SMS-MAN API token is not configured.")
    return token


def live_purchase_enabled():
    settings = get_provider_settings()
    return bool(settings.get("is_active") and settings.get("live_purchase_enabled"))


def normalize_error(data, fallback="SMS-MAN request failed."):
    if isinstance(data, str):
        text = data.strip()
        lowered = text.lower()
        if "wrong_token" in lowered or "wrong token" in lowered or "bad token" in lowered or "invalid token" in lowered:
            return "wrong_token", "SMS-MAN token is invalid."
        if "request timeout" in lowered or "timed out" in lowered:
            return "request_timeout", "SMS-MAN request timed out."
        if "wait_sms" in lowered:
            return "wait_sms", "SMS has not arrived yet."
        if "no numbers" in lowered or "no_number" in lowered or "no free phones" in lowered:
            return "no_numbers", "No SMS-MAN numbers are available for this service and country."
        if "balance" in lowered or "not enough" in lowered:
            return "insufficient_provider_balance", "SMS-MAN provider balance is insufficient."
        return "provider_error", text or fallback

    if isinstance(data, dict):
        code = str(data.get("error_code") or data.get("errorCode") or data.get("code") or "").strip()
        message = str(
            data.get("message")
            or data.get("error_msg")
            or data.get("error_message")
            or data.get("error_text")
            or data.get("error")
            or data.get("msg")
            or fallback
        ).strip()
        lowered = f"{code} {message}".lower()
        if "wrong_token" in lowered or "wrong token" in lowered or "bad token" in lowered or "invalid token" in lowered:
            return "wrong_token", "SMS-MAN token is invalid."
        if "request timeout" in lowered or "timed out" in lowered:
            return "request_timeout", "SMS-MAN request timed out."
        if "wait_sms" in lowered:
            return "wait_sms", "SMS has not arrived yet."
        if "no numbers" in lowered or "no_number" in lowered or "no free phones" in lowered:
            return "no_numbers", "No SMS-MAN numbers are available for this service and country."
        if "balance" in lowered or "not enough" in lowered:
            return "insufficient_provider_balance", "SMS-MAN provider balance is insufficient."
        if code:
            return code, message or fallback
        return "provider_error", message or fallback
    return "provider_error", fallback


def safe_params(params):
    clean = dict(params or {})
    clean.pop("token", None)
    return clean


def response_safe(data):
    if isinstance(data, dict):
        safe = dict(data)
        safe.pop("token", None)
        return safe
    if isinstance(data, list):
        return data[:25]
    return {"value": str(data)[:1000]}


def public_error_message(code: str) -> str:
    if code == "request_timeout":
        return "SMS-MAN took too long to respond. Your wallet has been refunded. Please try another country or service."
    if code == "no_numbers":
        return "No numbers available for this service/country."
    if code == "wrong_token":
        return "SMS-MAN provider authentication failed. Please contact support."
    if code == "insufficient_provider_balance":
        return "SMS-MAN provider balance is insufficient. Please contact support."
    return "SMS-MAN could not complete this request. Please try again."


def log_request(action, endpoint, params, status, duration_ms, data=None, error_code=None, error_msg=None, context=None):
    context = context or {}
    response_request_id = ""
    if isinstance(data, dict):
        response_request_id = str(data.get("request_id") or data.get("id") or "")
    otp_order_id = context.get("otp_order_id") or context.get("order_id")
    try:
        request_logs_collection().insert_one({
            "provider": "smsman",
            "action": action,
            "method": "GET",
            "endpoint": f"{BASE_URL}/{endpoint.strip('/')}",
            "request_params_safe": safe_params(params),
            "request_id": str((params or {}).get("request_id") or context.get("request_id") or response_request_id or "") or None,
            "otp_order_id": otp_order_id,
            "order_id": otp_order_id,
            "user_id": context.get("user_id"),
            "admin_id": context.get("admin_id"),
            "status": status,
            "error_code": error_code,
            "error_msg": error_msg,
            "response_safe": response_safe(data or {}),
            "duration_ms": duration_ms,
            "created_at": now_utc(),
        })
    except Exception:
        current_app.logger.exception("Failed to write SMS-MAN request log")


def smsman_request(
    endpoint,
    params=None,
    *,
    action=None,
    token_override=None,
    context=None,
    require_active=True,
    timeout=TIMEOUT,
    retry_transient=False,
):
    token = get_smsman_token(token_override, require_active=require_active)
    request_params = {"token": token, **(params or {})}
    endpoint = endpoint.strip("/")
    action = action or endpoint.replace("-", "_")
    attempts = 2 if retry_transient else 1
    last_error = None

    for attempt in range(1, attempts + 1):
        started = time.perf_counter()
        try:
            response = requests.get(f"{BASE_URL}/{endpoint}", params=request_params, timeout=timeout)
        except requests.Timeout as exc:
            duration_ms = int((time.perf_counter() - started) * 1000)
            last_error = SmsmanError("request_timeout", "SMS-MAN request timed out.", {"attempt": attempt})
            log_request(action, endpoint, request_params, "failed", duration_ms, data={"attempt": attempt}, error_code="request_timeout", error_msg=last_error.message, context=context)
            if attempt < attempts:
                continue
            raise last_error from exc
        except requests.RequestException as exc:
            duration_ms = int((time.perf_counter() - started) * 1000)
            last_error = SmsmanError("provider_unavailable", "SMS-MAN provider is unavailable.", {"attempt": attempt})
            log_request(action, endpoint, request_params, "failed", duration_ms, data={"attempt": attempt}, error_code="provider_unavailable", error_msg=last_error.message, context=context)
            raise last_error from exc

        raw_text = response.text.strip()
        try:
            data = response.json()
        except ValueError:
            data = raw_text
        duration_ms = int((time.perf_counter() - started) * 1000)

        if not response.ok:
            if response.status_code in TRANSIENT_STATUS_CODES and attempt < attempts:
                code = f"http_{response.status_code}"
                message = f"SMS-MAN HTTP {response.status_code}."
                log_request(action, endpoint, request_params, "failed", duration_ms, data=data, error_code=code, error_msg=message, context=context)
                last_error = SmsmanError(code, message, data)
                continue
            code, message = normalize_error(data, f"SMS-MAN HTTP {response.status_code}.")
            if response.status_code in TRANSIENT_STATUS_CODES:
                code = f"http_{response.status_code}"
                message = "SMS-MAN is temporarily unavailable."
            log_request(action, endpoint, request_params, "failed", duration_ms, data=data, error_code=code, error_msg=message, context=context)
            raise SmsmanError(code, message, data)

        if isinstance(data, dict):
            explicit_error = data.get("error_code") or data.get("error") or (data.get("success") is False)
            if explicit_error:
                code, message = normalize_error(data)
                log_status = "waiting" if code == "wait_sms" else "failed"
                log_request(action, endpoint, request_params, log_status, duration_ms, data=data, error_code=code, error_msg=message, context=context)
                raise SmsmanError(code, message, data)
        elif isinstance(data, str):
            lowered = data.lower()
            if any(flag in lowered for flag in ("wrong_token", "wait_sms", "no numbers", "no_number", "error", "request timeout", "timed out")):
                code, message = normalize_error(data)
                log_status = "waiting" if code == "wait_sms" else "failed"
                log_request(action, endpoint, request_params, log_status, duration_ms, data=data, error_code=code, error_msg=message, context=context)
                raise SmsmanError(code, message, data)

        log_request(action, endpoint, request_params, "success", duration_ms, data=data, context=context)
        return data

    raise last_error or SmsmanError("provider_error", "SMS-MAN request failed.")


def get_balance(token_override=None, context=None):
    return smsman_request("get-balance", action="get_balance", token_override=token_override, context=context, require_active=False)


def extract_available_count(data):
    if isinstance(data, dict):
        for key in ("numbers", "count", "available", "available_count", "qty"):
            if key in data:
                try:
                    return int(float(data.get(key) or 0))
                except (TypeError, ValueError):
                    pass
        for value in data.values():
            count = extract_available_count(value)
            if count is not None:
                return count
    if isinstance(data, list):
        total = 0
        found = False
        for value in data:
            count = extract_available_count(value)
            if count is not None:
                total += count
                found = True
        return total if found else None
    return None


def check_limits(country_id, application_id, context=None):
    params = {
        "country_id": str(country_id),
        "application_id": str(application_id),
    }
    data = smsman_request("limits", params, action="limits", context=context, retry_transient=True)
    available = extract_available_count(data)
    if available is not None and available <= 0:
        raise SmsmanError("no_numbers", "No numbers available for this service/country.", data)
    return data


def request_number(country_id, application_id, max_price=None, currency=None, context=None):
    params = {
        "country_id": str(country_id),
        "application_id": str(application_id),
    }
    if max_price not in (None, ""):
        params["maxPrice"] = max_price
    if currency:
        params["currency"] = currency
    data = smsman_request("get-number", params, action="get_number", context=context, timeout=GET_NUMBER_TIMEOUT, retry_transient=True)
    if not isinstance(data, dict):
        raise SmsmanError("invalid_json", "SMS-MAN returned an invalid purchase response.", data)
    request_id = data.get("request_id") or data.get("id")
    number = data.get("number") or data.get("phone") or data.get("phone_number")
    if not request_id or not number:
        raise SmsmanError("invalid_json", "SMS-MAN purchase response did not include request_id and number.", data)
    return data


def get_sms(request_id, context=None):
    return smsman_request("get-sms", {"request_id": str(request_id)}, action="get_sms", context={**(context or {}), "request_id": str(request_id)})


def set_status(request_id, status, context=None):
    return smsman_request("set-status", {"request_id": str(request_id), "status": str(status)}, action="set_status", context={**(context or {}), "request_id": str(request_id)})


def sync_countries(context=None):
    return smsman_request("countries", action="sync_countries", context=context)


def sync_services(context=None):
    return smsman_request("applications", action="sync_services", context=context)
