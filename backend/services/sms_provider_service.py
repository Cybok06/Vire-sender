import re
import secrets
from dataclasses import dataclass

import requests
from flask import current_app

from config import Config
from services.arkesel_service import send_sms as send_arkesel_sms
from services.smsman_provider import decrypt_secret, encrypt_secret, token_mask
from utils.security import clean_string, now_utc


DEFAULT_SMS_COST = 0.04
DEFAULT_PROVIDER_COST = 0.02
MOOLRE_BASE_URL = "https://api.moolre.com"
ALLOWED_MOOLRE_BASE_URLS = {MOOLRE_BASE_URL}
MOOLRE_SEND_PATH = "/open/sms/send"
MOOLRE_QUERY_PATH = "/open/sms/query"
MOOLRE_STATUS_PATH = "/open/sms/status"
MOOLRE_BATCH_SIZE = int(getattr(Config, "MOOLRE_SMS_BATCH_SIZE", 100) or 100)
BIRD_REGION_RE = re.compile(r"^bk_([a-z]{2}\d)_", re.IGNORECASE)
BIRD_REGION_VALUE_RE = re.compile(r"^[a-z]{2}\d$")


def provider_error_text(value, depth=0) -> str:
    """Return readable text from provider errors without assuming a string shape."""
    if value is None or depth > 4:
        return ""
    if isinstance(value, str):
        return clean_string(value)
    if isinstance(value, (int, float, bool)):
        return str(value)
    if isinstance(value, dict):
        preferred = ("message", "detail", "error", "description", "title", "code")
        parts = [provider_error_text(value.get(key), depth + 1) for key in preferred if key in value]
        parts = [part for part in parts if part]
        if parts:
            return " - ".join(dict.fromkeys(parts))
        for nested_value in value.values():
            text = provider_error_text(nested_value, depth + 1)
            if text:
                return text
        return ""
    if isinstance(value, (list, tuple)):
        parts = [provider_error_text(item, depth + 1) for item in value]
        return "; ".join(dict.fromkeys(part for part in parts if part))
    return clean_string(str(value))


class SmsProviderError(Exception):
    def __init__(self, code: str, message: str, status_code: int = 400, raw=None):
        super().__init__(message)
        self.code = code
        self.message = message
        self.status_code = status_code
        self.raw = raw or {}


class SmsSendingDisabledError(SmsProviderError):
    pass


class SmsProviderConfigurationError(SmsProviderError):
    pass


def platform_settings():
    return current_app.config["DB"].platform_settings


def iso(value):
    return value.isoformat() if value else None


def to_float(value, fallback=0.0):
    try:
        return round(float(value), 4)
    except (TypeError, ValueError):
        return fallback


def create_sms_reference(prefix="SMSMSG"):
    return f"{prefix}-{now_utc().strftime('%Y%m%d%H%M%S')}-{secrets.token_hex(4).upper()}"


def _settings_doc():
    return platform_settings().find_one({"key": "sms_settings"}) or {}


def _legacy_arkesel_key(doc: dict) -> str:
    encrypted = doc.get("arkesel_api_key_encrypted", "")
    return decrypt_secret(encrypted) if encrypted else clean_string(doc.get("arkesel_api_key", ""))


def _moolre_vas_key(doc: dict) -> str:
    encrypted = doc.get("moolre_vas_key_encrypted", "")
    return decrypt_secret(encrypted) if encrypted else clean_string(getattr(Config, "MOOLRE_SMS_VAS_KEY", ""))


def _bird_api_key(doc: dict) -> str:
    encrypted = doc.get("bird_api_key_encrypted", "")
    return decrypt_secret(encrypted) if encrypted else clean_string(getattr(Config, "BIRD_API_KEY", ""))


def bird_region_for_key(api_key: str, configured_region: str | None = None) -> str:
    configured = clean_string(configured_region or "").lower()
    match = BIRD_REGION_RE.match(clean_string(api_key))
    region = match.group(1).lower() if match else configured or "us1"
    if not BIRD_REGION_VALUE_RE.fullmatch(region):
        raise SmsProviderConfigurationError("invalid_bird_region", "Select a supported Bird API region.")
    return region


def validate_moolre_base_url(value: str | None) -> str:
    base_url = clean_string(value or MOOLRE_BASE_URL).rstrip("/")
    if base_url not in ALLOWED_MOOLRE_BASE_URLS:
        raise SmsProviderConfigurationError("invalid_moolre_url", "Only the official Moolre SMS API URL is allowed.")
    return base_url


def normalize_sms_settings(doc: dict | None = None, include_secret=False) -> dict:
    doc = doc or _settings_doc()
    active_provider = clean_string(doc.get("active_sms_provider") or doc.get("active_provider") or "arkesel").lower()
    if active_provider not in {"arkesel", "moolre"}:
        active_provider = "arkesel"

    arkesel_key = _legacy_arkesel_key(doc)
    moolre_vas_key = _moolre_vas_key(doc)
    bird_api_key = _bird_api_key(doc)
    sms_enabled = bool(doc.get("sms_enabled", False))

    arkesel_enabled = bool(doc.get("arkesel_enabled", sms_enabled))
    moolre_enabled = bool(doc.get("moolre_sms_enabled", False))
    arkesel_price = to_float(doc.get("arkesel_user_price_per_sms", doc.get("sms_cost_per_message")), DEFAULT_SMS_COST)
    arkesel_cost = to_float(doc.get("arkesel_provider_cost_per_sms", doc.get("sms_provider_cost_per_message")), DEFAULT_PROVIDER_COST)
    moolre_price = to_float(doc.get("moolre_user_price_per_sms"), 0.0)
    moolre_cost = to_float(doc.get("moolre_provider_cost_per_sms"), 0.0)

    base_url = doc.get("moolre_base_url") or MOOLRE_BASE_URL
    try:
        base_url = validate_moolre_base_url(base_url)
    except SmsProviderConfigurationError:
        base_url = MOOLRE_BASE_URL

    active_price = moolre_price if active_provider == "moolre" else arkesel_price
    active_cost = moolre_cost if active_provider == "moolre" else arkesel_cost
    payload = {
        "sms_enabled": sms_enabled,
        "active_sms_provider": active_provider,
        "active_provider": active_provider,
        "sms_cost_per_message": active_price,
        "sms_provider_cost_per_message": active_cost,
        "has_arkesel_api_key": bool(arkesel_key),
        "arkesel_api_key_masked": token_mask(arkesel_key),
        "arkesel_enabled": arkesel_enabled,
        "arkesel_configured": bool(arkesel_key),
        "arkesel_user_price_per_sms": arkesel_price,
        "arkesel_provider_cost_per_sms": arkesel_cost,
        "moolre_sms_enabled": moolre_enabled,
        "moolre_enabled": moolre_enabled,
        "moolre_configured": bool(moolre_vas_key),
        "moolre_vas_key_masked": token_mask(moolre_vas_key),
        "moolre_base_url": base_url,
        "moolre_user_price_per_sms": moolre_price,
        "moolre_provider_cost_per_sms": moolre_cost,
        "moolre_last_test_status": doc.get("moolre_last_test_status", ""),
        "moolre_last_test_message": doc.get("moolre_last_test_message", ""),
        "moolre_last_test_at": iso(doc.get("moolre_last_test_at")),
        "moolre_last_balance_check_at": iso(doc.get("moolre_last_balance_check_at")),
        "moolre_last_known_provider_balance": doc.get("moolre_last_known_provider_balance"),
        "moolre_provider_connection_status": doc.get("moolre_provider_connection_status", ""),
        "bird_enabled": bool(doc.get("bird_enabled", False)),
        "bird_configured": bool(bird_api_key),
        "has_bird_api_key": bool(bird_api_key),
        "bird_api_key_masked": token_mask(bird_api_key),
        "bird_region": clean_string(doc.get("bird_region", "")) or (bird_region_for_key(bird_api_key) if bird_api_key else "us1"),
        "bird_connection_status": doc.get("bird_connection_status", ""),
        "bird_last_test_status": doc.get("bird_last_test_status", ""),
        "bird_last_test_message": doc.get("bird_last_test_message", ""),
        "bird_last_test_at": iso(doc.get("bird_last_test_at")),
        "updated_at": iso(doc.get("updated_at")),
    }
    if include_secret:
        payload["arkesel_api_key"] = arkesel_key
        payload["moolre_vas_key"] = moolre_vas_key
        payload["bird_api_key"] = bird_api_key
    return payload


def _provider_ready(settings: dict, provider: str) -> bool:
    if provider == "arkesel":
        return bool(settings.get("arkesel_enabled") and settings.get("arkesel_configured"))
    if provider == "moolre":
        return bool(settings.get("moolre_enabled") and settings.get("moolre_configured"))
    return False


def save_sms_settings(data: dict, admin_id: str) -> dict:
    existing_doc = _settings_doc()
    existing = normalize_sms_settings(existing_doc, include_secret=True)
    active_provider = clean_string(data.get("active_sms_provider", existing["active_sms_provider"])).lower() or "arkesel"
    if active_provider not in {"arkesel", "moolre"}:
        raise ValueError("Select a valid active SMS provider.")

    sms_enabled = bool(data.get("sms_enabled", existing.get("sms_enabled", False)))
    arkesel_enabled = bool(data.get("arkesel_enabled", data.get("sms_enabled", existing.get("arkesel_enabled", False))))
    moolre_enabled = bool(data.get("moolre_sms_enabled", data.get("moolre_enabled", existing.get("moolre_enabled", False))))
    bird_enabled = bool(data.get("bird_enabled", existing.get("bird_enabled", False)))
    arkesel_price = to_float(data.get("arkesel_user_price_per_sms", data.get("sms_cost_per_message", existing.get("arkesel_user_price_per_sms"))), DEFAULT_SMS_COST)
    arkesel_cost = to_float(data.get("arkesel_provider_cost_per_sms", data.get("sms_provider_cost_per_message", existing.get("arkesel_provider_cost_per_sms"))), DEFAULT_PROVIDER_COST)
    moolre_price = to_float(data.get("moolre_user_price_per_sms", existing.get("moolre_user_price_per_sms")), 0.0)
    moolre_cost = to_float(data.get("moolre_provider_cost_per_sms", existing.get("moolre_provider_cost_per_sms")), 0.0)
    if arkesel_price <= 0 or arkesel_cost < 0 or moolre_price < 0 or moolre_cost < 0:
        raise ValueError("Enter valid SMS pricing.")
    if moolre_enabled and moolre_price <= 0:
        raise ValueError("Moolre User Price per SMS is required before enabling Moolre.")

    base_url = validate_moolre_base_url(data.get("moolre_base_url", existing.get("moolre_base_url", MOOLRE_BASE_URL)))
    arkesel_key = clean_string(data.get("arkesel_api_key", ""))
    moolre_vas_key = clean_string(data.get("moolre_vas_key", ""))
    bird_api_key = clean_string(data.get("bird_api_key", ""))
    bird_region = bird_region_for_key(bird_api_key or existing.get("bird_api_key", ""), data.get("bird_region", existing.get("bird_region", "us1")))
    if bird_enabled and not (bird_api_key or existing.get("bird_api_key")):
        raise ValueError("Configure the Bird API key before enabling international SMS.")
    merged = {
        **existing,
        "sms_enabled": sms_enabled,
        "active_sms_provider": active_provider,
        "arkesel_enabled": arkesel_enabled,
        "moolre_enabled": moolre_enabled,
        "bird_enabled": bird_enabled,
        "bird_region": bird_region,
        "arkesel_configured": bool(arkesel_key or existing.get("arkesel_api_key")),
        "moolre_configured": bool(moolre_vas_key or existing.get("moolre_vas_key")),
    }
    if sms_enabled and not _provider_ready(merged, active_provider):
        name = "Moolre" if active_provider == "moolre" else "Arkesel"
        raise ValueError(f"Configure and enable {name} before selecting it.")
    if existing.get("sms_enabled") and existing.get("active_sms_provider") == "arkesel" and not arkesel_enabled and active_provider == "arkesel":
        raise ValueError("Select another provider before disabling the active provider.")
    if existing.get("sms_enabled") and existing.get("active_sms_provider") == "moolre" and not moolre_enabled and active_provider == "moolre":
        raise ValueError("Select another provider before disabling the active provider.")

    update = {
        "key": "sms_settings",
        "sms_enabled": sms_enabled,
        "active_sms_provider": active_provider,
        "active_provider": active_provider,
        "arkesel_enabled": arkesel_enabled,
        "moolre_sms_enabled": moolre_enabled,
        "moolre_enabled": moolre_enabled,
        "sms_cost_per_message": arkesel_price if active_provider == "arkesel" else moolre_price,
        "sms_provider_cost_per_message": arkesel_cost if active_provider == "arkesel" else moolre_cost,
        "arkesel_user_price_per_sms": arkesel_price,
        "arkesel_provider_cost_per_sms": arkesel_cost,
        "moolre_user_price_per_sms": moolre_price,
        "moolre_provider_cost_per_sms": moolre_cost,
        "moolre_base_url": base_url,
        "bird_enabled": bird_enabled,
        "bird_region": bird_region,
        "updated_by": admin_id,
        "updated_at": now_utc(),
    }
    if arkesel_key:
        update["arkesel_api_key_encrypted"] = encrypt_secret(arkesel_key)
        update["arkesel_api_key"] = arkesel_key
    elif existing_doc.get("arkesel_api_key") and not existing_doc.get("arkesel_api_key_encrypted"):
        update["arkesel_api_key_encrypted"] = encrypt_secret(existing_doc.get("arkesel_api_key", ""))
    if moolre_vas_key:
        update["moolre_vas_key_encrypted"] = encrypt_secret(moolre_vas_key)
    if bird_api_key:
        update["bird_api_key_encrypted"] = encrypt_secret(bird_api_key)

    platform_settings().update_one({"key": "sms_settings"}, {"$set": update, "$setOnInsert": {"created_at": now_utc()}}, upsert=True)
    return normalize_sms_settings(include_secret=False)


@dataclass
class SmsSendResult:
    success: bool
    message: str
    provider: str
    provider_response: dict
    provider_code: str = ""
    provider_status: str = ""
    provider_status_code: str | int | None = None
    provider_error: str = ""
    references: list[str] | None = None
    results: list[dict] | None = None

    def as_dict(self):
        return {
            "success": self.success,
            "message": self.message,
            "provider": self.provider,
            "provider_response": self.provider_response or {},
            "provider_code": self.provider_code,
            "provider_status": self.provider_status,
            "provider_status_code": self.provider_status_code,
            "provider_error": self.provider_error,
            "references": self.references or [],
            "results": self.results or [],
        }


class SmsProvider:
    provider = "base"

    def send_single(self, sender_id, recipient, message, reference=None):
        return self.send_bulk(sender_id, [{"recipient": recipient, "message": message, "ref": reference or create_sms_reference()}])

    def send_bulk(self, sender_id, messages):
        raise NotImplementedError

    def test_connection(self):
        raise NotImplementedError

    def check_delivery_status(self, references):
        raise NotImplementedError


class ArkeselSmsProvider(SmsProvider):
    provider = "arkesel"

    def __init__(self, api_key: str):
        self.api_key = api_key

    def send_bulk(self, sender_id, messages):
        recipients = [item["recipient"] for item in messages]
        rendered_messages = {item["message"] for item in messages}
        if len(rendered_messages) == 1:
            result = send_arkesel_sms(self.api_key, sender_id, messages[0]["message"], recipients)
        else:
            result = {"success": True, "provider_response": {}, "message": "Personalized SMS accepted by Arkesel."}
            responses = []
            for item in messages:
                response = send_arkesel_sms(self.api_key, sender_id, item["message"], [item["recipient"]])
                responses.append({"recipient": item["recipient"], "ref": item.get("ref"), **response})
                if not response.get("success"):
                    result = response
                    break
            result["provider_response"] = {"personalized": responses}
        code = str((result.get("provider_response") or {}).get("code") or "")
        return SmsSendResult(
            success=bool(result.get("success")),
            message=result.get("message", "SMS request processed by Arkesel."),
            provider=self.provider,
            provider_response=result.get("provider_response") or {},
            provider_code=code,
            provider_status="accepted" if result.get("success") else "failed",
            provider_error="" if result.get("success") else result.get("message", "Arkesel rejected the SMS request."),
            references=[item.get("ref") for item in messages],
            results=[{"recipient": item["recipient"], "ref": item.get("ref"), "status": "accepted" if result.get("success") else "failed"} for item in messages],
        ).as_dict()

    def test_connection(self):
        if not self.api_key:
            raise SmsProviderConfigurationError("missing_arkesel_key", "Arkesel API key is required.")
        return {"success": True, "connected": True, "message": "Arkesel API key is configured."}

    def check_delivery_status(self, references):
        return {"success": False, "message": "Arkesel delivery status checking is not configured in this installation.", "references": references}


class MoolreSmsProvider(SmsProvider):
    provider = "moolre"

    def __init__(self, vas_key: str, base_url: str = MOOLRE_BASE_URL, batch_size: int | None = None):
        self.vas_key = vas_key
        self.base_url = validate_moolre_base_url(base_url)
        self.batch_size = max(1, int(batch_size or MOOLRE_BATCH_SIZE))

    def _headers(self):
        return {"Content-Type": "application/json", "X-API-VASKEY": self.vas_key}

    def _post(self, path: str, payload: dict, timeout=30):
        if not self.vas_key:
            raise SmsProviderConfigurationError("missing_moolre_vas_key", "Moolre VAS key is required.")
        try:
            response = requests.post(f"{self.base_url}{path}", headers=self._headers(), json=payload, timeout=timeout)
            try:
                data = response.json() if response.content else {}
            except ValueError as exc:
                raise SmsProviderError("invalid_json", "Moolre returned an invalid response.", 502) from exc
        except requests.Timeout as exc:
            raise SmsProviderError("timeout", "Moolre SMS request timed out.", 504) from exc
        except requests.RequestException as exc:
            raise SmsProviderError("network_error", "Unable to reach Moolre SMS service.", 502) from exc
        if not isinstance(data, dict):
            raise SmsProviderError("invalid_response", "Moolre returned an invalid response.", 502)
        if not response.ok:
            code = clean_string(data.get("code", "")) or f"http_{response.status_code}"
            message = safe_moolre_error_message(code, data.get("message"), response.status_code)
            raise SmsProviderError(code, message, response.status_code, data)
        return data

    def send_bulk(self, sender_id, messages):
        all_results = []
        last_data = {}
        for start in range(0, len(messages), self.batch_size):
            chunk = messages[start:start + self.batch_size]
            payload = {
                "type": 1,
                "senderid": sender_id,
                "messages": [{"recipient": item["recipient"], "message": item["message"], "ref": item.get("ref") or create_sms_reference()} for item in chunk],
            }
            data = self._post(MOOLRE_SEND_PATH, payload)
            last_data = data
            if data.get("status") != 1 or data.get("code") != "SMS01":
                code = clean_string(data.get("code", "")) or "moolre_rejected"
                return SmsSendResult(False, safe_moolre_error_message(code, data.get("message")), self.provider, data, code, "failed", None, safe_moolre_error_message(code, data.get("message")), [item.get("ref") for item in messages], all_results).as_dict()
            all_results.extend({"recipient": item["recipient"], "ref": item.get("ref"), "status": "accepted"} for item in chunk)
        return SmsSendResult(True, last_data.get("message") or "SMS accepted by Moolre.", self.provider, last_data, "SMS01", "accepted", None, "", [item.get("ref") for item in messages], all_results).as_dict()

    def test_connection(self):
        if not self.vas_key:
            raise SmsProviderConfigurationError("missing_moolre_vas_key", "Moolre VAS key is required.")
        data = self._post(MOOLRE_STATUS_PATH, {"type": 2}, timeout=20)
        if data.get("status") != 1 or data.get("code") != "ASMQ03":
            code = clean_string(data.get("code", "")) or "moolre_account_status_failed"
            raise SmsProviderError(code, safe_moolre_error_message(code, data.get("message")), 502, data)
        return {"success": True, "connected": True, "message": "Moolre SMS connection verified.", "balance": (data.get("data") or {}).get("balance"), "provider_response": data}

    def check_delivery_status(self, references):
        data = self._post(MOOLRE_STATUS_PATH, {"type": 5, "ref": references}, timeout=20)
        if data.get("status") != 1 or data.get("code") != "ASMQ10":
            code = clean_string(data.get("code", "")) or "moolre_status_failed"
            raise SmsProviderError(code, safe_moolre_error_message(code, data.get("message")), 502, data)
        return {"success": True, "provider": self.provider, "provider_response": data, "statuses": data.get("data") or []}

    def create_sender_id(self, sender_id: str):
        data = self._post(MOOLRE_QUERY_PATH, {"type": 3, "senderids": [{"senderid": sender_id}]}, timeout=30)
        if data.get("status") != 1:
            code = clean_string(data.get("code", "")) or "moolre_sender_id_create_failed"
            raise SmsProviderError(code, safe_moolre_error_message(code, data.get("message")), 400, data)
        return {"success": True, "provider_response": data, "provider_code": clean_string(data.get("code", "")), "provider_message": clean_string(data.get("message", ""))}

    def check_sender_id_status(self, sender_id: str):
        data = self._post(MOOLRE_STATUS_PATH, {"type": 1, "senderid": sender_id}, timeout=20)
        if data.get("status") != 1:
            code = clean_string(data.get("code", "")) or "moolre_sender_id_status_failed"
            raise SmsProviderError(code, safe_moolre_error_message(code, data.get("message")), 400, data)
        return {"success": True, "provider_response": data, "provider_code": clean_string(data.get("code", "")), "provider_message": clean_string(data.get("message", "")), "data": data.get("data") or {}}

    def list_sender_ids(self):
        data = self._post(MOOLRE_STATUS_PATH, {"type": 7}, timeout=30)
        if data.get("status") != 1 or data.get("code") != "ASMQ08":
            code = clean_string(data.get("code", "")) or "moolre_sender_id_list_failed"
            raise SmsProviderError(code, safe_moolre_error_message(code, data.get("message")), 400, data)
        return {"success": True, "provider_response": data, "sender_ids": data.get("data") or []}

    def approve_sender_id(self, sender_id: str, approval: int):
        data = self._post(MOOLRE_STATUS_PATH, {"type": 6, "senderids": [{"senderid": sender_id, "approve": approval}]}, timeout=30)
        if data.get("status") != 1:
            code = clean_string(data.get("code", "")) or "moolre_sender_id_approval_failed"
            raise SmsProviderError(code, safe_moolre_error_message(code, data.get("message")), 403 if code == "ASMQ09" else 400, data)
        return {"success": True, "provider_response": data, "provider_code": clean_string(data.get("code", "")), "provider_message": clean_string(data.get("message", ""))}


class BirdSmsProvider(SmsProvider):
    provider = "bird"

    def __init__(self, api_key: str, region: str | None = None):
        self.api_key = clean_string(api_key)
        self.region = bird_region_for_key(self.api_key, region)
        self.base_url = f"https://{self.region}.platform.bird.com"

    def _headers(self):
        return {"Authorization": f"Bearer {self.api_key}", "Content-Type": "application/json", "Accept": "application/json"}

    def send_single(self, sender_id, recipient, message, reference=None, category="transactional", shared_sender=False):
        return self.send_bulk(sender_id, [{"recipient": recipient, "message": message, "category": category, "shared_sender": shared_sender, "ref": reference or create_sms_reference("BIRD")}])

    def _post(self, payload: dict, timeout=30, idempotency_key=""):
        if not self.api_key:
            raise SmsProviderConfigurationError("missing_bird_api_key", "International SMS is currently unavailable.")
        try:
            headers = self._headers()
            if idempotency_key:
                headers["Idempotency-Key"] = idempotency_key
            response = requests.post(f"{self.base_url}/v1/sms/messages", headers=headers, json=payload, timeout=timeout)
            try:
                data = response.json() if response.content else {}
            except ValueError:
                data = {}
        except requests.Timeout as exc:
            raise SmsProviderError("bird_timeout", "International SMS service timed out. Please try again.", 504) from exc
        except requests.RequestException as exc:
            raise SmsProviderError("bird_network_error", "International SMS service is temporarily unavailable.", 502) from exc
        if not response.ok:
            raw_message = provider_error_text(data.get("message") or data.get("detail") or data.get("error", "")) if isinstance(data, dict) else ""
            code = provider_error_text(data.get("code", "")) if isinstance(data, dict) else ""
            code = code or f"bird_http_{response.status_code}"
            if response.status_code in {401, 403}:
                user_message = "International SMS is currently unavailable."
            elif response.status_code == 429:
                user_message = "International SMS is busy. Please try again shortly."
            else:
                user_message = "SMS sending to this destination is currently unavailable."
            raise SmsProviderError(code, user_message, response.status_code, {"bird_error": raw_message, "status_code": response.status_code})
        if not isinstance(data, dict):
            raise SmsProviderError("bird_invalid_response", "International SMS service returned an invalid response.", 502)
        return data

    def send_bulk(self, sender_id, messages):
        results, references, responses = [], [], []
        for item in messages:
            reference = item.get("ref") or create_sms_reference("BIRD")
            payload = {
                "to": item["recipient"] if str(item["recipient"]).startswith("+") else f"+{item['recipient']}",
                "text": item["message"],
                "category": item["category"],
            }
            if sender_id and not item.get("shared_sender"):
                payload["from"] = sender_id
            data = self._post(payload, idempotency_key=reference)
            provider_id = clean_string(data.get("id") or data.get("messageId") or data.get("message_id") or reference)
            provider_status = clean_string(data.get("status") or "accepted").lower()
            references.append(provider_id)
            responses.append({"id": provider_id, "status": provider_status})
            results.append({"recipient": item["recipient"], "ref": provider_id, "status": provider_status})
        return SmsSendResult(True, "International SMS accepted for processing.", self.provider, {"messages": responses}, "", "accepted", None, "", references, results).as_dict()

    def test_connection(self):
        if not self.api_key:
            raise SmsProviderConfigurationError("missing_bird_api_key", "Bird API key is required.")
        # The simplified API has no credential-only endpoint. Validate key shape and region
        # without sending a billable message; live authentication occurs on the first send.
        if len(self.api_key) < 16:
            raise SmsProviderConfigurationError("invalid_bird_api_key", "Enter a valid Bird API key.")
        return {"success": True, "connected": True, "message": "Bird API key and regional endpoint are configured.", "region": self.region}

    def check_delivery_status(self, references):
        return {"success": False, "message": "Bird delivery status webhooks are not configured yet.", "references": references}


def safe_moolre_error_message(code: str, message: str | None = None, http_status: int | None = None) -> str:
    code = clean_string(code).upper()
    if code == "AIN01" or http_status == 401:
        return "Moolre SMS authentication failed. Check the VAS key."
    if code == "ASMS07":
        return "Sender ID is not approved for Moolre SMS."
    if http_status == 429:
        return "Moolre SMS rate limit reached. Try again later."
    if http_status and http_status >= 500:
        return "Moolre SMS service is temporarily unavailable."
    return clean_string(message or "Moolre could not send this SMS.")


def get_active_sms_provider(settings: dict | None = None, provider_name: str | None = None):
    settings = settings or normalize_sms_settings(include_secret=True)
    if not settings.get("sms_enabled"):
        raise SmsSendingDisabledError("sms_disabled", "SMS sending is currently disabled.", 400)
    provider_name = clean_string(provider_name or settings.get("active_sms_provider") or "arkesel").lower()
    if provider_name == "arkesel":
        if not settings.get("arkesel_enabled") or not settings.get("arkesel_api_key"):
            raise SmsProviderConfigurationError("arkesel_not_configured", "SMS provider is not configured yet.", 400)
        return ArkeselSmsProvider(settings["arkesel_api_key"]), settings
    if provider_name == "moolre":
        if not settings.get("moolre_enabled") or not settings.get("moolre_vas_key"):
            raise SmsProviderConfigurationError("moolre_not_configured", "SMS provider is not configured yet.", 400)
        return MoolreSmsProvider(settings["moolre_vas_key"], settings.get("moolre_base_url")), settings
    if provider_name == "bird":
        if not settings.get("bird_enabled") or not settings.get("bird_api_key"):
            raise SmsProviderConfigurationError("bird_not_configured", "International SMS is currently unavailable.", 400)
        return BirdSmsProvider(settings["bird_api_key"], settings.get("bird_region")), settings
    raise SmsProviderConfigurationError("invalid_sms_provider", "SMS provider is not configured yet.", 400)


def get_sms_provider_by_name(provider_name: str, settings: dict | None = None):
    settings = settings or normalize_sms_settings(include_secret=True)
    provider_name = clean_string(provider_name or "arkesel").lower()
    if provider_name == "arkesel":
        if not settings.get("arkesel_api_key"):
            raise SmsProviderConfigurationError("arkesel_not_configured", "Arkesel SMS provider is not configured.", 400)
        return ArkeselSmsProvider(settings["arkesel_api_key"])
    if provider_name == "moolre":
        if not settings.get("moolre_vas_key"):
            raise SmsProviderConfigurationError("moolre_not_configured", "Moolre SMS provider is not configured.", 400)
        return MoolreSmsProvider(settings["moolre_vas_key"], settings.get("moolre_base_url"))
    if provider_name == "bird":
        if not settings.get("bird_enabled") or not settings.get("bird_api_key"):
            raise SmsProviderConfigurationError("bird_not_configured", "International SMS is currently unavailable.", 400)
        return BirdSmsProvider(settings["bird_api_key"], settings.get("bird_region"))
    raise SmsProviderConfigurationError("invalid_sms_provider", "SMS provider is not configured yet.", 400)


def test_moolre_connection(data: dict | None = None):
    settings = normalize_sms_settings(include_secret=True)
    data = data or {}
    vas_key = clean_string(data.get("moolre_vas_key", "")) or settings.get("moolre_vas_key", "")
    base_url = validate_moolre_base_url(data.get("moolre_base_url", settings.get("moolre_base_url")))
    provider = MoolreSmsProvider(vas_key, base_url)
    result = provider.test_connection()
    platform_settings().update_one(
        {"key": "sms_settings"},
        {"$set": {
            "moolre_last_test_status": "success",
            "moolre_last_test_message": result["message"],
            "moolre_last_test_at": now_utc(),
            "moolre_last_balance_check_at": now_utc(),
            "moolre_last_known_provider_balance": result.get("balance"),
            "moolre_provider_connection_status": "connected",
            "updated_at": now_utc(),
        }},
        upsert=True,
    )
    return result


def test_bird_connection(data: dict | None = None):
    settings = normalize_sms_settings(include_secret=True)
    data = data or {}
    api_key = clean_string(data.get("bird_api_key", "")) or settings.get("bird_api_key", "")
    region = data.get("bird_region") or settings.get("bird_region")
    result = BirdSmsProvider(api_key, region).test_connection()
    platform_settings().update_one(
        {"key": "sms_settings"},
        {"$set": {
            "bird_last_test_status": "success",
            "bird_last_test_message": result["message"],
            "bird_last_test_at": now_utc(),
            "bird_connection_status": "connected",
            "updated_at": now_utc(),
        }},
        upsert=True,
    )
    return result
