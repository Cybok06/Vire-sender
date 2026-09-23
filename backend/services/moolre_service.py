import time
from urllib.parse import urlparse

import requests


MOOLRE_CHANNELS = {
    "mtn": "13",
    "telecel": "6",
    "at": "7",
}
LIVE_BASE_URL = "https://api.moolre.com"
SANDBOX_BASE_URL = "https://sandbox.moolre.com"


class MoolreError(Exception):
    def __init__(self, code: str, message: str, raw=None):
        super().__init__(message)
        self.code = code
        self.message = message
        self.raw = raw


class MoolreService:
    def __init__(self, settings: dict, logger=None):
        self.settings = settings
        self.environment = (settings.get("environment") or "sandbox").lower()
        self.base_url = SANDBOX_BASE_URL if self.environment == "sandbox" else LIVE_BASE_URL
        self.api_username = settings.get("api_username", "")
        self.private_key = settings.get("private_key", "")
        self.public_key = settings.get("public_key", "")
        self.account_number = settings.get("account_number", "")
        self.currency = settings.get("currency", "GHS")
        self.logger = logger

    def headers(self, key_type="private"):
        headers = {"X-API-USER": self.api_username, "Content-Type": "application/json"}
        if self.environment != "sandbox":
            if key_type == "public":
                headers["X-API-PUBKEY"] = self.public_key
            else:
                headers["X-API-KEY"] = self.private_key
        return headers

    def _post(self, path, body, key_type="private", timeout=(8, 25)):
        started = time.perf_counter()
        try:
            response = requests.post(
                f"{self.base_url}{path}",
                headers=self.headers(key_type),
                json=body,
                timeout=timeout,
            )
            try:
                data = response.json()
            except ValueError:
                data = {"status": 0, "code": "invalid_json", "message": "Moolre returned an invalid response."}
        except requests.Timeout as exc:
            raise MoolreError("timeout", "Moolre request timed out.") from exc
        except requests.RequestException as exc:
            raise MoolreError("provider_unavailable", "Moolre is temporarily unavailable.") from exc

        if self.logger:
            duration_ms = int((time.perf_counter() - started) * 1000)
            self.logger.info("Moolre request path=%s status=%s duration_ms=%s code=%s", path, response.status_code, duration_ms, data.get("code") if isinstance(data, dict) else "")
        if not isinstance(data, dict):
            raise MoolreError("invalid_response", "Moolre returned an invalid response.", data)
        if not response.ok:
            raise MoolreError(str(data.get("code") or response.status_code), safe_message(data), data)
        return data

    def initiate_payment(self, amount, phone_number, network, external_reference, reference_text="VireSender wallet deposit", otp_code=None, session_id=None):
        """Direct mobile-money collection. Hosted wallet deposits should use generate_payment_link()."""
        channel = self.resolve_channel(network)
        payer = self.normalize_phone_number(phone_number)
        body = {
            "type": 1,
            "channel": channel,
            "currency": self.currency,
            "payer": payer,
            "amount": f"{float(amount):.2f}",
            "externalref": external_reference,
            "reference": reference_text,
            "accountnumber": self.account_number,
        }
        if otp_code:
            body["otpcode"] = str(otp_code)
        if session_id:
            body["sessionid"] = str(session_id)
        data = self._post("/open/transact/payment", body, key_type="private")
        return normalize_initiation(data)

    def generate_payment_link(
        self,
        amount,
        email,
        external_reference,
        callback_url,
        redirect_url,
        account_number=None,
        currency="GHS",
        expiration_time=30,
        metadata=None,
    ):
        body = {
            "type": 1,
            "amount": f"{float(amount):.2f}",
            "email": str(email or "").strip(),
            "externalref": str(external_reference),
            "callback": str(callback_url or "").strip(),
            "redirect": str(redirect_url or "").strip(),
            "reusable": "0",
            "expiration_time": int(expiration_time or 30),
            "currency": str(currency or self.currency or "GHS").upper(),
            "accountnumber": str(account_number or self.account_number),
            "metadata": metadata or {},
        }
        data = self._post("/embed/link", body, key_type="public", timeout=(8, 25))
        return normalize_payment_link(data)

    def check_payment_status(self, reference, idtype="1"):
        body = {
            "type": 1,
            "idtype": str(idtype),
            "id": str(reference),
            "accountnumber": self.account_number,
        }
        data = self._post("/open/transact/status", body, key_type="public")
        return normalize_status(data)

    def check_account_status(self):
        body = {
            "type": 1,
            "accountnumber": self.account_number,
        }
        data = self._post("/open/account/status", body, key_type="private", timeout=(8, 15))
        success = str(data.get("status")) == "1" and data.get("code") == "SW01"
        if not success:
            raise MoolreError(str(data.get("code") or "account_status_failed"), safe_message(data), data)
        account = data.get("data") if isinstance(data.get("data"), dict) else {}
        return {
            "success": True,
            "message": "Moolre connection verified.",
            "environment": self.environment,
            "account_name": account.get("accountname", ""),
            "callback_configured": bool(account.get("callback")),
            "balance": account.get("balance"),
            "raw": sanitize_response(data),
        }

    def normalize_phone_number(self, value):
        digits = "".join(ch for ch in str(value or "") if ch.isdigit())
        if digits.startswith("233") and len(digits) == 12:
            return digits
        if digits.startswith("0") and len(digits) == 10:
            return f"233{digits[1:]}"
        if len(digits) == 9 and digits[0] in {"2", "5"}:
            return f"233{digits}"
        raise MoolreError("invalid_phone", "Enter a valid mobile money number.")

    def resolve_channel(self, network):
        key = str(network or "").strip().lower()
        if key not in MOOLRE_CHANNELS:
            raise MoolreError("invalid_network", "Select a supported mobile money network.")
        return MOOLRE_CHANNELS[key]


def safe_message(data):
    message = data.get("message") if isinstance(data, dict) else ""
    if isinstance(message, list):
        message = " ".join(str(item) for item in message)
    return str(message or "Moolre request failed.").strip()


def sanitize_response(data):
    if not isinstance(data, dict):
        return {"value": str(data)[:1000]}
    safe = dict(data)
    return safe


def normalize_initiation(data):
    status = str(data.get("status"))
    code = str(data.get("code") or "")
    if status == "1" and code == "TP14":
        return {
            "status": "otp_required",
            "provider_code": code,
            "provider_message": safe_message(data),
            "provider_reference": None,
            "raw": sanitize_response(data),
        }
    if status == "1" and code == "TR099":
        return {
            "status": "pending",
            "provider_code": code,
            "provider_message": safe_message(data) or "Payment request sent.",
            "provider_reference": str(data.get("data") or ""),
            "raw": sanitize_response(data),
        }
    if code == "TP13":
        raise MoolreError("duplicate_reference", "Duplicate Moolre payment reference.", data)
    raise MoolreError(code or "initiation_failed", safe_message(data), data)


def normalize_payment_link(data):
    status = str(data.get("status"))
    code = str(data.get("code") or "")
    payload = data.get("data") if isinstance(data.get("data"), dict) else {}
    authorization_url = str(payload.get("authorization_url") or "").strip()
    if code == "INP02":
        raise MoolreError("duplicate_reference", "Duplicate Moolre payment reference.", data)
    if status != "1" or code != "POS09" or not authorization_url:
        raise MoolreError(code or "payment_link_failed", safe_message(data) or "Unable to prepare the Moolre payment page.", data)
    parsed = urlparse(authorization_url)
    if parsed.scheme != "https" or not parsed.netloc:
        raise MoolreError("invalid_authorization_url", "The payment page could not be opened.", data)
    return {
        "status": "pending",
        "provider_code": code,
        "provider_message": safe_message(data),
        "provider_reference": str(payload.get("reference") or ""),
        "authorization_url": authorization_url,
        "raw": sanitize_response(data),
    }


def normalize_status(data):
    status = str(data.get("status"))
    code = str(data.get("code") or "")
    payload = data.get("data") if isinstance(data.get("data"), dict) else {}
    txstatus = str(payload.get("txstatus", ""))
    if status == "1" and code == "SS01" and txstatus == "1":
        internal_status = "successful"
    elif txstatus == "2":
        internal_status = "failed"
    else:
        internal_status = "pending"
    return {
        "status": internal_status,
        "provider_code": code,
        "provider_message": safe_message(data),
        "account_number": str(payload.get("accountnumber") or ""),
        "amount": payload.get("amount"),
        "currency": "GHS",
        "external_reference": str(payload.get("externalref") or ""),
        "provider_transaction_id": str(payload.get("transactionid") or ""),
        "third_party_reference": str(payload.get("thirdpartyref") or ""),
        "payer": str(payload.get("payer") or ""),
        "payee": str(payload.get("payee") or ""),
        "raw": sanitize_response(data),
    }


def mask_phone(value):
    text = str(value or "")
    if len(text) <= 6:
        return "***"
    return f"{text[:3]}***{text[-3:]}"
