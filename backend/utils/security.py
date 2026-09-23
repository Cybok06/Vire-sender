import base64
import hashlib
import hmac
import json
import re
import secrets
from datetime import datetime, timedelta
from hmac import compare_digest

from werkzeug.security import check_password_hash, generate_password_hash


EMAIL_RE = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")
PASSWORD_RE = re.compile(r"^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$")


def now_utc() -> datetime:
    return datetime.utcnow()


def normalize_email(email: str) -> str:
    return (email or "").strip().lower()


def clean_string(value: str) -> str:
    return " ".join((value or "").strip().split())


def is_valid_email(email: str) -> bool:
    return bool(EMAIL_RE.match(email or ""))


def is_strong_password(password: str) -> bool:
    return bool(PASSWORD_RE.match(password or ""))


def hash_password(password: str) -> str:
    return generate_password_hash(password, method="pbkdf2:sha256", salt_length=16)


def check_password(password_hash: str, password: str) -> bool:
    if not password_hash or not password:
        return False
    return check_password_hash(password_hash, password)


def check_plain_secret(expected: str | None, provided: str) -> bool:
    if not expected or not provided:
        return False
    return compare_digest(expected, provided)


def generate_jwt(payload: dict, secret: str, expires_hours: int) -> str:
    header = {
        "alg": "HS256",
        "typ": "JWT",
    }
    token_payload = {
        **payload,
        "exp": int((now_utc() + timedelta(hours=expires_hours)).timestamp()),
    }

    encoded_header = base64url_encode(json.dumps(header, separators=(",", ":")).encode("utf-8"))
    encoded_payload = base64url_encode(json.dumps(token_payload, separators=(",", ":")).encode("utf-8"))
    signing_input = f"{encoded_header}.{encoded_payload}".encode("utf-8")
    signature = hmac.new(secret.encode("utf-8"), signing_input, hashlib.sha256).digest()

    return f"{encoded_header}.{encoded_payload}.{base64url_encode(signature)}"


def base64url_encode(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).decode("utf-8").rstrip("=")


def base64url_decode(value: str) -> bytes:
    padded = value + "=" * (-len(value) % 4)
    return base64.urlsafe_b64decode(padded.encode("utf-8"))


def decode_jwt(token: str, secret: str) -> dict | None:
    try:
        encoded_header, encoded_payload, encoded_signature = token.split(".")
        signing_input = f"{encoded_header}.{encoded_payload}".encode("utf-8")
        expected_signature = hmac.new(secret.encode("utf-8"), signing_input, hashlib.sha256).digest()
        actual_signature = base64url_decode(encoded_signature)

        if not hmac.compare_digest(expected_signature, actual_signature):
            return None

        payload = json.loads(base64url_decode(encoded_payload))
        if int(payload.get("exp", 0)) < int(now_utc().timestamp()):
            return None

        return payload
    except (ValueError, json.JSONDecodeError, TypeError):
        return None


def hash_verification_code(code: str) -> str:
    return generate_password_hash(code, method="pbkdf2:sha256", salt_length=16)


def check_verification_code(code_hash: str, code: str) -> bool:
    if not code_hash or not code:
        return False
    return check_password_hash(code_hash, code)


def generate_verification_code() -> str:
    return f"{secrets.randbelow(1_000_000):06d}"


def verification_expiry(minutes: int) -> datetime:
    return now_utc() + timedelta(minutes=minutes)


def generate_reset_token() -> str:
    return secrets.token_urlsafe(48)


def hash_reset_token(token: str, secret: str) -> str:
    return hmac.new(secret.encode("utf-8"), token.encode("utf-8"), hashlib.sha256).hexdigest()


def validate_registration_payload(data: dict) -> dict[str, str]:
    errors: dict[str, str] = {}
    full_name = clean_string(data.get("full_name", ""))
    email = normalize_email(data.get("email", ""))
    phone = clean_string(data.get("phone", ""))
    password = data.get("password", "")
    confirm_password = data.get("confirm_password", "")

    if not full_name:
        errors["full_name"] = "Full name is required."
    if not email:
        errors["email"] = "Email is required."
    elif not is_valid_email(email):
        errors["email"] = "Enter a valid email address."
    if not phone:
        errors["phone"] = "Phone number is required."
    if not password:
        errors["password"] = "Password is required."
    elif not is_strong_password(password):
        errors["password"] = "Password must be at least 8 characters and include uppercase, lowercase, number, and special character."
    if confirm_password != password:
        errors["confirm_password"] = "Passwords do not match."

    return errors
