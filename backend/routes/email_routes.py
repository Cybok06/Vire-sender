import base64
import csv
import hashlib
import hmac
import io
import json
import mimetypes
import os
import re
import secrets
import smtplib
import ssl
import threading
import uuid
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timedelta
from email.message import EmailMessage
from email.utils import make_msgid, parseaddr
from html import escape, unescape
from urllib.parse import urlencode

import requests
from bson import ObjectId
from flask import Blueprint, current_app, jsonify, redirect, request
from pymongo import ReturnDocument
from werkzeug.utils import secure_filename

from config import Config
from utils.auth import require_admin, require_auth, users_collection
from utils.notifications import create_notification
from utils.security import clean_string, decode_jwt, generate_jwt, is_valid_email, now_utc
from utils.service_control import check_service_available
from utils.abuse import abuse_check_message, abuse_check_user_allowed

email_bp = Blueprint("email", __name__, url_prefix="/api/email")
gmail_bp = Blueprint("gmail", __name__, url_prefix="/api/gmail")
google_chat_bp = Blueprint("google_chat", __name__, url_prefix="/api/google-chat")
admin_email_bp = Blueprint("admin_email", __name__, url_prefix="/api/admin/email")

DEFAULT_EMAIL_COST = 0.001
DEFAULT_BATCH_SIZE = 100
GMAIL_SEND_SCOPE = "https://www.googleapis.com/auth/gmail.send"
GMAIL_READONLY_SCOPE = "https://www.googleapis.com/auth/gmail.readonly"
GMAIL_OAUTH_SCOPES = (GMAIL_SEND_SCOPE, GMAIL_READONLY_SCOPE)
GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
GMAIL_SEND_URL = "https://gmail.googleapis.com/gmail/v1/users/me/messages/send"
GMAIL_PROFILE_URL = "https://gmail.googleapis.com/gmail/v1/users/me/profile"
GMAIL_MESSAGES_URL = "https://gmail.googleapis.com/gmail/v1/users/me/messages"
GOOGLE_CHAT_BASE_URL = "https://chat.googleapis.com/v1"
GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v2/userinfo"
GOOGLE_CHAT_SPACES_READONLY_SCOPE = "https://www.googleapis.com/auth/chat.spaces.readonly"
GOOGLE_CHAT_MESSAGES_SCOPE = "https://www.googleapis.com/auth/chat.messages"
GOOGLE_CHAT_MEMBERSHIPS_READONLY_SCOPE = "https://www.googleapis.com/auth/chat.memberships.readonly"
GOOGLE_CHAT_SPACES_CREATE_SCOPE = "https://www.googleapis.com/auth/chat.spaces.create"
GOOGLE_OPENID_SCOPES = ("openid", "email", "profile")
VARIABLE_RE = re.compile(r"\{\{\s*([a-zA-Z][a-zA-Z0-9_]*)\s*\}\}")
SCRIPT_RE = re.compile(r"<\s*script\b[^>]*>.*?<\s*/\s*script\s*>", re.IGNORECASE | re.DOTALL)
MAX_ATTACHMENT_SIZE = 10 * 1024 * 1024
MAX_TOTAL_ATTACHMENT_SIZE = 20 * 1024 * 1024
ALLOWED_ATTACHMENT_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp", ".pdf", ".doc", ".docx", ".xls", ".xlsx", ".csv"}
BLOCKED_ATTACHMENT_EXTENSIONS = {".exe", ".bat", ".cmd", ".js", ".php", ".sh", ".zip"}
ALLOWED_ATTACHMENT_MIME_PREFIXES = ("image/png", "image/jpeg", "image/webp")
ALLOWED_ATTACHMENT_MIME_TYPES = {
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "text/csv",
    "application/csv",
    "application/octet-stream",
}


def iso(value):
    return value.isoformat() if value else None


def db():
    return current_app.config["DB"]


def email_accounts():
    return db().email_accounts


def email_logs():
    return db().email_logs


def email_campaigns():
    return db().email_campaigns


def copy_paste_drafts():
    return db().email_copy_paste_drafts


def email_send_jobs():
    return db().email_send_jobs


def email_send_queue():
    return db().email_send_queue


def platform_settings():
    return db().platform_settings


def contacts_collection():
    return db().contacts


def wallet_transactions():
    return db().wallet_transactions


def to_float(value, fallback=0.0):
    try:
        return round(float(value), 4)
    except (TypeError, ValueError):
        return fallback


def get_current_user(payload):
    user_id = payload.get("user_id") or payload.get("sub")
    try:
        object_id = ObjectId(user_id)
    except Exception:
        return None
    return users_collection().find_one({"_id": object_id})


def require_active_user(payload):
    user = get_current_user(payload)
    if not user:
        return None, ({"success": False, "message": "User account not found."}, 404)
    if user.get("account_status") != "active":
        return None, ({"success": False, "message": "Your account is not active."}, 403)
    restriction = abuse_check_user_allowed(user, "email")
    if restriction:
        return None, restriction
    return user, None


def encrypt_secret(value: str) -> str:
    if not value:
        return ""
    key = hashlib.sha256(Config.JWT_SECRET.encode("utf-8")).digest()
    raw = value.encode("utf-8")
    encrypted = bytes(byte ^ key[index % len(key)] for index, byte in enumerate(raw))
    signature = hmac.new(key, encrypted, hashlib.sha256).digest()[:16]
    return base64.urlsafe_b64encode(signature + encrypted).decode("utf-8")


def decrypt_secret(value: str) -> str:
    if not value:
        return ""
    try:
        key = hashlib.sha256(Config.JWT_SECRET.encode("utf-8")).digest()
        payload = base64.urlsafe_b64decode(value.encode("utf-8"))
        signature, encrypted = payload[:16], payload[16:]
        expected = hmac.new(key, encrypted, hashlib.sha256).digest()[:16]
        if not hmac.compare_digest(signature, expected):
            return ""
        raw = bytes(byte ^ key[index % len(key)] for index, byte in enumerate(encrypted))
        return raw.decode("utf-8")
    except Exception:
        return ""


def variable_key(value: str) -> str:
    key = re.sub(r"[^a-zA-Z0-9]+", "_", clean_string(value or "").lower()).strip("_")
    if key and key[0].isdigit():
        key = f"field_{key}"
    return key


def contact_values(contact: dict | None, email: str = "") -> dict:
    contact = contact or {}
    values = {
        "contact_name": contact.get("contact_name") or contact.get("name", ""),
        "sender_id": contact.get("sender_id", ""),
        "phone": contact.get("phone", ""),
        "email": contact.get("email") or email,
        "age": contact.get("age", ""),
        "group": contact.get("group", ""),
        "location": contact.get("location", ""),
        "occupation": contact.get("occupation", ""),
        "region": contact.get("region", ""),
        "business_type": contact.get("business_type", ""),
        "company": contact.get("company", ""),
        "customer_type": contact.get("customer_type", ""),
        "gender": contact.get("gender", ""),
    }
    for field in contact.get("custom_fields") or []:
        if isinstance(field, dict):
            key = variable_key(field.get("key", ""))
            if key:
                values[key] = field.get("value", "")
    return values


def render_template_text(message: str, values: dict) -> str:
    return VARIABLE_RE.sub(lambda match: str(values.get(match.group(1), "")), message or "")


def sanitize_html(value: str) -> str:
    return SCRIPT_RE.sub("", value or "")


def get_email_settings():
    settings = platform_settings().find_one({"key": "email_settings"}) or {}
    free_pricing = bool(settings.get("free_pricing") or settings.get("email_free"))
    cost_per_email = 0 if free_pricing else to_float(settings.get("cost_per_email"), DEFAULT_EMAIL_COST)
    return {
        "email_enabled": bool(settings.get("email_enabled", True)),
        "free_pricing": free_pricing,
        "email_free": free_pricing,
        "cost_per_email": cost_per_email,
        "provider_cost_per_email": to_float(settings.get("provider_cost_per_email"), 0),
        "daily_send_limit_per_user": int(settings.get("daily_send_limit_per_user", 1000) or 1000),
        "bulk_batch_size": int(settings.get("bulk_batch_size", DEFAULT_BATCH_SIZE) or DEFAULT_BATCH_SIZE),
        "updated_at": iso(settings.get("updated_at")),
    }


def account_bounce_tracking(account: dict) -> str:
    if account.get("provider") != "gmail":
        return "off"
    scopes = set(str(account.get("scopes", "")).split())
    return "active" if GMAIL_READONLY_SCOPE in scopes else "reconnect_required"


def gmail_scope_string() -> str:
    return " ".join(GMAIL_OAUTH_SCOPES)


def safe_account(account: dict, admin=False) -> dict:
    payload = {
        "id": account.get("account_id"),
        "account_id": account.get("account_id"),
        "user_id": str(account.get("user_id")) if account.get("user_id") else None,
        "provider": account.get("provider"),
        "email": account.get("email_address"),
        "email_address": account.get("email_address"),
        "displayName": account.get("display_name") or account.get("email_address"),
        "display_name": account.get("display_name") or account.get("email_address"),
        "status": account.get("status", "connected"),
        "isDefault": bool(account.get("is_default")),
        "is_default": bool(account.get("is_default")),
        "lastSynced": iso(account.get("last_synced_at")) or "Never",
        "last_synced_at": iso(account.get("last_synced_at")),
        "last_status_sync_at": iso(account.get("last_status_sync_at")),
        "sending_status": "ready" if account.get("status") == "connected" else account.get("status", "unknown"),
        "bounce_tracking": account_bounce_tracking(account),
        "sentToday": int(account.get("sent_today", 0) or 0),
        "sent_today": int(account.get("sent_today", 0) or 0),
        "totalSent": int(account.get("total_sent", 0) or 0),
        "total_sent": int(account.get("total_sent", 0) or 0),
        "host": account.get("smtp_host", ""),
        "smtp_host": account.get("smtp_host", ""),
        "port": account.get("smtp_port"),
        "smtp_port": account.get("smtp_port"),
        "smtp_secure": bool(account.get("smtp_secure")),
        "errorMsg": account.get("error_message", ""),
        "error_message": account.get("error_message", ""),
        "created_at": iso(account.get("created_at")),
        "updated_at": iso(account.get("updated_at")),
    }
    if admin:
        user = users_collection().find_one({"_id": account.get("user_id")})
        payload["user"] = user.get("full_name") or user.get("email") if user else "Unknown"
        payload["user_email"] = user.get("email") if user else ""
    return payload


def safe_log(log: dict, admin=False) -> dict:
    payload = {
        "id": str(log.get("_id")),
        "email_id": log.get("email_id"),
        "user_id": str(log.get("user_id")) if log.get("user_id") else None,
        "account_id": log.get("account_id", ""),
        "provider": log.get("provider", ""),
        "from_email": log.get("from_email", ""),
        "to_email": log.get("to_email", ""),
        "recipients": log.get("recipients", []),
        "recipient_count": int(log.get("recipient_count", 0) or 0),
        "subject": log.get("subject", ""),
        "message_preview": log.get("message_preview", ""),
        "format": log.get("format", "plain"),
        "type": log.get("type", "single"),
        "status": log.get("status", "sent"),
        "delivery_status": log.get("delivery_status", "accepted" if log.get("status") == "sent" else "unknown"),
        "bounce_reason": log.get("bounce_reason", ""),
        "rfc_message_id": log.get("rfc_message_id", ""),
        "cost_per_email": to_float(log.get("cost_per_email")),
        "total_cost": to_float(log.get("total_cost")),
        "wallet_before": to_float(log.get("wallet_before")),
        "wallet_after": to_float(log.get("wallet_after")),
        "provider_message_id": log.get("provider_message_id", ""),
        "error_message": log.get("error_message", ""),
        "attachments": log.get("attachments", []),
        "source": log.get("source", ""),
        "attachment_count": int(log.get("attachment_count", len(log.get("attachments", []) or [])) or 0),
        "sent_at": iso(log.get("sent_at")),
        "failed_at": iso(log.get("failed_at")),
        "bounced_at": iso(log.get("bounced_at")),
        "created_at": iso(log.get("created_at")),
        "updated_at": iso(log.get("updated_at")),
    }
    if admin:
        user = users_collection().find_one({"_id": log.get("user_id")})
        payload["user"] = user.get("full_name") or user.get("email") if user else "Unknown"
        payload["user_email"] = user.get("email") if user else ""
    return payload


def create_reference(prefix="EML"):
    return f"{prefix}-{now_utc().strftime('%Y%m%d%H%M%S')}-{secrets.token_hex(3).upper()}"


def attachment_metadata(attachments: list[dict]) -> list[dict]:
    sent_at = iso(now_utc())
    return [
        {
            "filename": item["filename"],
            "size": item["size"],
            "mime_type": item["mime_type"],
            "sent_at": sent_at,
        }
        for item in attachments or []
    ]


def validate_attachments(files) -> tuple[list[dict], str]:
    attachments = []
    total_size = 0
    for file in files or []:
        if not file or not file.filename:
            continue
        original_name = file.filename
        filename = secure_filename(original_name)[:180]
        _, ext = os.path.splitext(filename.lower())
        if ext in BLOCKED_ATTACHMENT_EXTENSIONS or ext not in ALLOWED_ATTACHMENT_EXTENSIONS:
            return [], f"Attachment type is not allowed: {original_name}"
        data = file.read()
        size = len(data)
        if size <= 0:
            return [], f"Attachment is empty: {original_name}"
        if size > MAX_ATTACHMENT_SIZE:
            return [], f"{original_name} is larger than the 10MB per-file limit."
        total_size += size
        if total_size > MAX_TOTAL_ATTACHMENT_SIZE:
            return [], "Total attachments cannot exceed 20MB per email."
        guessed_mime = mimetypes.guess_type(filename)[0]
        mime_type = file.mimetype or guessed_mime or "application/octet-stream"
        if mime_type == "application/octet-stream" and guessed_mime:
            mime_type = guessed_mime
        if not (mime_type in ALLOWED_ATTACHMENT_MIME_TYPES or mime_type in ALLOWED_ATTACHMENT_MIME_PREFIXES):
            return [], f"Attachment MIME type is not allowed: {original_name}"
        attachments.append({
            "filename": filename or "attachment",
            "mime_type": mime_type,
            "size": size,
            "data": data,
        })
    return attachments, ""


def request_data_and_attachments() -> tuple[dict, list[dict], str]:
    if request.content_type and request.content_type.startswith("multipart/form-data"):
        data = request.form.to_dict(flat=True)
        attachments, error = validate_attachments(request.files.getlist("attachments"))
        return data, attachments, error
    return request.get_json(silent=True) or {}, [], ""


def build_email_message(account: dict, to_email: str, subject: str, body: str, fmt: str, rfc_message_id: str | None = None, attachments: list[dict] | None = None) -> EmailMessage:
    message = EmailMessage()
    display_name = clean_string(account.get("display_name", ""))
    from_email = account.get("email_address")
    message["Subject"] = subject
    message["From"] = f"{display_name} <{from_email}>" if display_name else from_email
    message["To"] = to_email
    message["Message-ID"] = rfc_message_id or make_msgid(domain=(from_email or "viresender.com").split("@")[-1])
    if fmt == "html":
        message.set_content("This email requires an HTML-capable email client.")
        message.add_alternative(sanitize_html(body), subtype="html")
    else:
        message.set_content(body or "")
    for attachment in attachments or []:
        maintype, _, subtype = attachment["mime_type"].partition("/")
        message.add_attachment(
            attachment["data"],
            maintype=maintype or "application",
            subtype=subtype or "octet-stream",
            filename=attachment["filename"],
        )
    return message


def send_via_smtp(account: dict, to_email: str, subject: str, body: str, fmt: str, rfc_message_id: str, attachments: list[dict] | None = None) -> dict:
    password = decrypt_secret(account.get("smtp_password_encrypted", ""))
    if not password:
        return {"success": False, "message": "SMTP password is missing or invalid."}

    message = build_email_message(account, to_email, subject, body, fmt, rfc_message_id, attachments)
    context = ssl.create_default_context()
    host = account.get("smtp_host")
    port = int(account.get("smtp_port") or 587)
    username = account.get("smtp_username") or account.get("email_address")

    try:
        if account.get("smtp_secure") and port == 465:
            with smtplib.SMTP_SSL(host, port, context=context, timeout=20) as smtp:
                smtp.login(username, password)
                response = smtp.send_message(message)
        else:
            with smtplib.SMTP(host, port, timeout=20) as smtp:
                smtp.ehlo()
                if account.get("smtp_secure", True):
                    smtp.starttls(context=context)
                    smtp.ehlo()
                smtp.login(username, password)
                response = smtp.send_message(message)
        return {"success": True, "provider_message_id": create_reference("SMTP"), "rfc_message_id": message["Message-ID"], "provider_response": response}
    except Exception as exc:
        return {"success": False, "message": str(exc)}


def refresh_gmail_token(account: dict) -> str:
    token_expiry = account.get("token_expiry")
    access_token = decrypt_secret(account.get("access_token_encrypted", ""))
    if access_token and token_expiry and token_expiry > now_utc() + timedelta(minutes=2):
        return access_token

    refresh_token = decrypt_secret(account.get("refresh_token_encrypted", ""))
    if not refresh_token:
        return ""

    response = requests.post(GOOGLE_TOKEN_URL, data={
        "client_id": Config.GOOGLE_CLIENT_ID,
        "client_secret": Config.GOOGLE_CLIENT_SECRET,
        "refresh_token": refresh_token,
        "grant_type": "refresh_token",
    }, timeout=20)
    if not response.ok:
        return ""
    token_data = response.json()
    access_token = token_data.get("access_token", "")
    expires_in = int(token_data.get("expires_in", 3600) or 3600)
    email_accounts().update_one(
        {"_id": account["_id"]},
        {"$set": {
            "access_token_encrypted": encrypt_secret(access_token),
            "token_expiry": now_utc() + timedelta(seconds=expires_in),
            "updated_at": now_utc(),
            "status": "connected",
            "error_message": "",
        }},
    )
    return access_token


def send_via_gmail(account: dict, to_email: str, subject: str, body: str, fmt: str, rfc_message_id: str, attachments: list[dict] | None = None) -> dict:
    access_token = refresh_gmail_token(account)
    if not access_token:
        return {"success": False, "message": "Gmail token is expired. Please reconnect the account."}
    message = build_email_message(account, to_email, subject, body, fmt, rfc_message_id, attachments)
    raw = base64.urlsafe_b64encode(message.as_bytes()).decode("utf-8")
    response = requests.post(
        GMAIL_SEND_URL,
        headers={"Authorization": f"Bearer {access_token}", "Content-Type": "application/json"},
        json={"raw": raw},
        timeout=30,
    )
    if response.ok:
        data = response.json()
        return {"success": True, "provider_message_id": data.get("id", ""), "rfc_message_id": message["Message-ID"], "provider_response": data}
    return {"success": False, "message": response.text[:300]}


def send_one(account: dict, to_email: str, subject: str, body: str, fmt: str, rfc_message_id: str, attachments: list[dict] | None = None) -> dict:
    if account.get("provider") == "gmail":
        return send_via_gmail(account, to_email, subject, body, fmt, rfc_message_id, attachments)
    return send_via_smtp(account, to_email, subject, body, fmt, rfc_message_id, attachments)


def gmail_headers(payload: dict) -> dict:
    return {item.get("name", "").lower(): item.get("value", "") for item in payload.get("headers", [])}


def gmail_body_text(part: dict) -> str:
    chunks = []
    data = part.get("body", {}).get("data")
    if data:
        try:
            chunks.append(base64.urlsafe_b64decode(data + "=" * (-len(data) % 4)).decode("utf-8", "ignore"))
        except Exception:
            pass
    for child in part.get("parts", []) or []:
        chunks.append(gmail_body_text(child))
    return "\n".join(chunks)


def readable_gmail_body(value: str) -> str:
    text = value or ""
    if re.search(r"<[a-zA-Z][^>]*>", text):
        text = re.sub(r"<\s*(br|/p|/div|/tr)\s*/?>", "\n", text, flags=re.IGNORECASE)
        text = re.sub(r"<[^>]+>", " ", text)
        text = unescape(text)
    return re.sub(r"\n{3,}", "\n\n", text).strip()


def looks_like_bounce(headers: dict, payload: dict) -> bool:
    sender = headers.get("from", "").lower()
    subject = headers.get("subject", "").lower()
    mime_type = payload.get("mimeType", "").lower()
    bounce_subjects = [
        "delivery status notification",
        "mail delivery subsystem",
        "undelivered mail returned to sender",
        "delivery incomplete",
        "message not delivered",
        "address not found",
    ]
    return (
        "mailer-daemon" in sender
        or "postmaster" in sender
        or any(marker in subject for marker in bounce_subjects)
        or "message/delivery-status" in mime_type
    )


def parse_bounce_details(message: dict) -> dict:
    payload = message.get("payload", {})
    headers = gmail_headers(payload)
    text = gmail_body_text(payload)
    snippet = message.get("snippet", "")
    body = f"{headers.get('subject', '')}\n{snippet}\n{text}"
    email_match = re.search(r"[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}", body, re.IGNORECASE)
    msg_id_match = re.search(r"<[^<>\s]+@[^<>\s]+>", body)
    reason_patterns = [
        r"(?:reason|diagnostic-code|status):\s*([^\n\r]+)",
        r"(address not found[^\n\r]*)",
        r"(message not delivered[^\n\r]*)",
        r"(delivery incomplete[^\n\r]*)",
    ]
    reason = ""
    for pattern in reason_patterns:
        match = re.search(pattern, body, re.IGNORECASE)
        if match:
            reason = clean_string(match.group(1))
            break
    return {
        "recipient": clean_string(email_match.group(0)).lower() if email_match else "",
        "rfc_message_id": msg_id_match.group(0) if msg_id_match else "",
        "subject": headers.get("subject", ""),
        "reason": reason or clean_string(snippet)[:220] or "Bounce detected by Gmail.",
    }


def match_bounced_log(account: dict, details: dict):
    query_options = []
    base = {
        "user_id": account.get("user_id"),
        "account_id": account.get("account_id"),
        "status": {"$in": ["sent", "unknown", "queued"]},
    }
    if details.get("rfc_message_id"):
        query_options.append({**base, "rfc_message_id": details["rfc_message_id"]})
    if details.get("recipient"):
        query_options.append({**base, "recipients": details["recipient"]})
        query_options.append({**base, "to_email": details["recipient"]})
    for query in query_options:
        log = email_logs().find_one(query, sort=[("sent_at", -1), ("created_at", -1)])
        if log:
            return log
    return None


def sync_gmail_bounces_for_account(account: dict) -> dict:
    if account.get("provider") != "gmail":
        return {"updated": 0, "errors": 0, "message": "Not a Gmail account."}
    if account_bounce_tracking(account) != "active":
        return {"updated": 0, "errors": 0, "message": "Reconnect required for bounce tracking."}
    access_token = refresh_gmail_token(account)
    if not access_token:
        return {"updated": 0, "errors": 1, "message": "Could not refresh Gmail token."}

    since = account.get("last_status_sync_at") or (now_utc() - timedelta(days=7))
    query = (
        "newer_than:14d "
        "(from:mailer-daemon OR from:postmaster OR subject:\"Delivery Status Notification\" "
        "OR subject:\"Mail Delivery Subsystem\" OR subject:\"Undelivered Mail Returned to Sender\" "
        "OR subject:\"Delivery incomplete\" OR subject:\"Message not delivered\" OR subject:\"Address not found\")"
    )
    response = requests.get(
        GMAIL_MESSAGES_URL,
        headers={"Authorization": f"Bearer {access_token}"},
        params={"q": query, "maxResults": 50},
        timeout=20,
    )
    if not response.ok:
        return {"updated": 0, "errors": 1, "message": response.text[:200]}

    updated = 0
    errors = 0
    for item in response.json().get("messages", []) or []:
        message_id = item.get("id")
        if not message_id:
            continue
        detail_response = requests.get(
            f"{GMAIL_MESSAGES_URL}/{message_id}",
            headers={"Authorization": f"Bearer {access_token}"},
            params={"format": "full"},
            timeout=20,
        )
        if not detail_response.ok:
            errors += 1
            continue
        message = detail_response.json()
        payload = message.get("payload", {})
        headers = gmail_headers(payload)
        if not looks_like_bounce(headers, payload):
            continue
        details = parse_bounce_details(message)
        log = match_bounced_log(account, details)
        if not log:
            continue
        result = email_logs().update_one(
            {"_id": log["_id"], "status": {"$ne": "bounced"}},
            {"$set": {
                "status": "bounced",
                "delivery_status": "undelivered",
                "bounce_reason": details.get("reason", "Bounce detected."),
                "bounced_at": now_utc(),
                "updated_at": now_utc(),
            }},
        )
        if result.modified_count:
            create_notification(
                log.get("user_id"), "email", "Email bounced",
                f"Email to {log.get('to_email') or details.get('recipient') or 'recipient'} was undelivered.",
                "warning", "email", log.get("email_id", ""), "/user/email-message-logs",
                {"bounce_reason": details.get("reason", "Bounce detected.")},
            )
        updated += result.modified_count

    email_accounts().update_one(
        {"_id": account["_id"]},
        {"$set": {"last_status_sync_at": now_utc(), "updated_at": now_utc()}, "$inc": {"status_sync_errors": errors}},
    )
    return {"updated": updated, "errors": errors, "message": "Status sync completed.", "since": iso(since)}


def account_for_user(user_id: ObjectId, account_id: str):
    return email_accounts().find_one({"user_id": user_id, "account_id": account_id})


def default_gmail_account_for_user(user_id: ObjectId):
    base_query = {"user_id": user_id, "provider": "gmail", "status": "connected"}
    return (
        email_accounts().find_one({**base_query, "is_default": True})
        or email_accounts().find_one(base_query, sort=[("updated_at", -1), ("created_at", -1)])
    )


def account_has_gmail_scope(account: dict, scope: str) -> bool:
    return scope in set(str(account.get("scopes", "")).split())


def gmail_error_message(response) -> str:
    try:
        data = response.json()
        message = data.get("error", {}).get("message") or data.get("message")
        if message:
            return clean_string(message)[:300]
    except Exception:
        pass
    return response.text[:300] or "Gmail request failed."


def gmail_metadata_headers(message: dict) -> dict:
    return gmail_headers(message.get("payload", {}))


def safe_gmail_inbox_message(message: dict) -> dict:
    headers = gmail_metadata_headers(message)
    labels = set(message.get("labelIds", []) or [])
    return {
        "id": message.get("id", ""),
        "threadId": message.get("threadId", ""),
        "from": headers.get("from", ""),
        "subject": headers.get("subject", ""),
        "date": headers.get("date", ""),
        "snippet": message.get("snippet", ""),
        "unread": "UNREAD" in labels,
    }


def user_and_gmail_account(payload):
    user, error = require_active_user(payload)
    if error:
        return None, None, error
    account = default_gmail_account_for_user(user["_id"])
    if not account:
        return user, None, ({"success": False, "message": "Connect a Gmail account to view inbox messages."}, 404)
    return user, account, None


@gmail_bp.get("/inbox/unread")
@require_auth
def gmail_unread_inbox(payload):
    user, account, error = user_and_gmail_account(payload)
    if error:
        return error
    if not account_has_gmail_scope(account, GMAIL_READONLY_SCOPE):
        return {"success": False, "message": "Reconnect Gmail with inbox read permission."}, 403
    access_token = refresh_gmail_token(account)
    if not access_token:
        return {"success": False, "message": "Gmail token is expired. Please reconnect the account."}, 401

    list_response = requests.get(
        GMAIL_MESSAGES_URL,
        headers={"Authorization": f"Bearer {access_token}"},
        params={"q": "in:inbox is:unread", "maxResults": 20},
        timeout=20,
    )
    if not list_response.ok:
        return {"success": False, "message": gmail_error_message(list_response)}, list_response.status_code

    messages = []
    for item in list_response.json().get("messages", []) or []:
        message_id = item.get("id")
        if not message_id:
            continue
        detail_response = requests.get(
            f"{GMAIL_MESSAGES_URL}/{message_id}",
            headers={"Authorization": f"Bearer {access_token}"},
            params=[
                ("format", "metadata"),
                ("metadataHeaders", "From"),
                ("metadataHeaders", "Subject"),
                ("metadataHeaders", "Date"),
            ],
            timeout=20,
        )
        if detail_response.ok:
            messages.append(safe_gmail_inbox_message(detail_response.json()))

    return jsonify({"success": True, "messages": messages, "account": safe_account(account)})


@gmail_bp.get("/message/<message_id>")
@require_auth
def gmail_message(payload, message_id):
    user, account, error = user_and_gmail_account(payload)
    if error:
        return error
    if not account_has_gmail_scope(account, GMAIL_READONLY_SCOPE):
        return {"success": False, "message": "Reconnect Gmail with inbox read permission."}, 403
    access_token = refresh_gmail_token(account)
    if not access_token:
        return {"success": False, "message": "Gmail token is expired. Please reconnect the account."}, 401

    response = requests.get(
        f"{GMAIL_MESSAGES_URL}/{clean_string(message_id)}",
        headers={"Authorization": f"Bearer {access_token}"},
        params={"format": "full"},
        timeout=20,
    )
    if not response.ok:
        return {"success": False, "message": gmail_error_message(response)}, response.status_code

    message = response.json()
    payload_data = message.get("payload", {})
    headers = gmail_headers(payload_data)
    body = readable_gmail_body(gmail_body_text(payload_data))
    return jsonify({
        "success": True,
        "message": {
            "id": message.get("id", ""),
            "threadId": message.get("threadId", ""),
            "from": headers.get("from", ""),
            "to": headers.get("to", ""),
            "subject": headers.get("subject", ""),
            "date": headers.get("date", ""),
            "body": body or message.get("snippet", ""),
            "snippet": message.get("snippet", ""),
            "messageId": headers.get("message-id", ""),
            "references": headers.get("references", ""),
        },
    })


@gmail_bp.post("/reply")
@require_auth
def gmail_reply(payload):
    user, account, error = user_and_gmail_account(payload)
    if error:
        return error
    if not account_has_gmail_scope(account, GMAIL_SEND_SCOPE):
        return {"success": False, "message": "Reconnect Gmail with send permission."}, 403
    access_token = refresh_gmail_token(account)
    if not access_token:
        return {"success": False, "message": "Gmail token is expired. Please reconnect the account."}, 401

    data = request.get_json(silent=True) or {}
    thread_id = clean_string(data.get("threadId", ""))
    to_email = clean_string(data.get("to", ""))
    _, parsed_to = parseaddr(to_email)
    subject = clean_string(data.get("subject", ""))[:180]
    body = data.get("body", "")
    in_reply_to = clean_string(data.get("inReplyTo", ""))
    references = clean_string(data.get("references", ""))
    if not thread_id or not parsed_to or not subject or not clean_string(body):
        return {"success": False, "message": "Reply needs threadId, to, subject, and body."}, 400

    reply = EmailMessage()
    display_name = clean_string(account.get("display_name", ""))
    from_email = account.get("email_address")
    reply["From"] = f"{display_name} <{from_email}>" if display_name else from_email
    reply["To"] = to_email
    reply["Subject"] = subject if subject.lower().startswith("re:") else f"Re: {subject}"
    reply["Message-ID"] = make_msgid(domain=(from_email or "viresender.com").split("@")[-1])
    if in_reply_to:
        reply["In-Reply-To"] = in_reply_to
        reply["References"] = f"{references} {in_reply_to}".strip() if references else in_reply_to
    elif references:
        reply["References"] = references
    reply.set_content(body)

    raw = base64.urlsafe_b64encode(reply.as_bytes()).decode("utf-8")
    response = requests.post(
        GMAIL_SEND_URL,
        headers={"Authorization": f"Bearer {access_token}", "Content-Type": "application/json"},
        json={"raw": raw, "threadId": thread_id},
        timeout=30,
    )
    if not response.ok:
        return {"success": False, "message": gmail_error_message(response)}, response.status_code
    result = response.json()
    return jsonify({
        "success": True,
        "message": "Reply sent.",
        "id": result.get("id", ""),
        "threadId": result.get("threadId", thread_id),
        "rfc_message_id": reply["Message-ID"],
    })


def google_chat_scope_string() -> str:
    return " ".join((
        *GOOGLE_OPENID_SCOPES,
        GOOGLE_CHAT_SPACES_READONLY_SCOPE,
        GOOGLE_CHAT_MESSAGES_SCOPE,
        GOOGLE_CHAT_MEMBERSHIPS_READONLY_SCOPE,
        GOOGLE_CHAT_SPACES_CREATE_SCOPE,
    ))


def google_chat_connection(user: dict) -> dict:
    return user.get("google_chat") or {}


def safe_google_chat_status(user: dict) -> dict:
    connection = google_chat_connection(user)
    connected = connection.get("status") == "connected" and bool(connection.get("refresh_token_encrypted"))
    return {
        "success": True,
        "connected": connected,
        "email": connection.get("email", ""),
        "status": connection.get("status", "disconnected"),
        "scopes": connection.get("scopes", ""),
        "error_message": connection.get("error_message", ""),
        "updated_at": iso(connection.get("updated_at")),
    }


def refresh_google_chat_token(user: dict) -> str:
    connection = google_chat_connection(user)
    token_expiry = connection.get("token_expiry")
    access_token = decrypt_secret(connection.get("access_token_encrypted", ""))
    if access_token and token_expiry and token_expiry > now_utc() + timedelta(minutes=2):
        return access_token

    refresh_token = decrypt_secret(connection.get("refresh_token_encrypted", ""))
    if not refresh_token:
        return ""

    response = requests.post(GOOGLE_TOKEN_URL, data={
        "client_id": Config.GOOGLE_CLIENT_ID,
        "client_secret": Config.GOOGLE_CLIENT_SECRET,
        "refresh_token": refresh_token,
        "grant_type": "refresh_token",
    }, timeout=20)
    if not response.ok:
        users_collection().update_one(
            {"_id": user["_id"]},
            {"$set": {"google_chat.status": "error", "google_chat.error_message": gmail_error_message(response), "google_chat.updated_at": now_utc()}},
        )
        return ""

    token_data = response.json()
    access_token = token_data.get("access_token", "")
    expires_in = int(token_data.get("expires_in", 3600) or 3600)
    users_collection().update_one(
        {"_id": user["_id"]},
        {"$set": {
            "google_chat.access_token_encrypted": encrypt_secret(access_token),
            "google_chat.token_expiry": now_utc() + timedelta(seconds=expires_in),
            "google_chat.status": "connected",
            "google_chat.error_message": "",
            "google_chat.updated_at": now_utc(),
        }},
    )
    return access_token


def google_chat_auth_headers(user: dict) -> tuple[dict, tuple | None]:
    access_token = refresh_google_chat_token(user)
    if not access_token:
        return {}, ({"success": False, "message": "Google Chat token is expired. Please reconnect Google Chat."}, 401)
    return {"Authorization": f"Bearer {access_token}", "Content-Type": "application/json"}, None


def chat_space_name(space_id: str) -> str:
    clean_value = clean_string(space_id)
    return clean_value if clean_value.startswith("spaces/") else f"spaces/{clean_value}"


def safe_chat_space(space: dict) -> dict:
    name = space.get("name", "")
    return {
        "id": name.removeprefix("spaces/"),
        "name": name,
        "displayName": space.get("displayName") or ("Direct message" if space.get("spaceType") == "DIRECT_MESSAGE" else name),
        "spaceType": space.get("spaceType", ""),
        "lastActiveTime": space.get("lastActiveTime", ""),
    }


def safe_chat_message(message: dict, current_email: str = "") -> dict:
    sender = message.get("sender") or {}
    sender_email = sender.get("email", "")
    return {
        "id": message.get("name", ""),
        "senderName": sender.get("displayName") or sender_email or "Google Chat user",
        "senderEmail": sender_email,
        "text": message.get("text", ""),
        "createTime": message.get("createTime", ""),
        "avatar": sender.get("avatarUrl", ""),
        "isMine": bool(current_email and sender_email and sender_email.lower() == current_email.lower()),
    }


@google_chat_bp.get("/connect")
def google_chat_connect():
    auth_header = request.headers.get("Authorization", "")
    token = request.args.get("token", "")
    if auth_header.startswith("Bearer "):
        token = auth_header.removeprefix("Bearer ").strip()
    payload = decode_jwt(token, Config.JWT_SECRET)
    if not payload:
        return {"success": False, "message": "Authentication required."}, 401
    user, error = require_active_user(payload)
    if error:
        return error
    if not Config.GOOGLE_CLIENT_ID or not Config.GOOGLE_CLIENT_SECRET:
        return {"success": False, "message": "Google OAuth is not configured."}, 500
    if not Config.GOOGLE_CHAT_REDIRECT_URI:
        return {"success": False, "message": "Google Chat OAuth redirect URI is not configured."}, 500

    state = generate_jwt({"user_id": str(user["_id"]), "purpose": "google_chat_connect"}, Config.JWT_SECRET, 1)
    query = urlencode({
        "client_id": Config.GOOGLE_CLIENT_ID,
        "redirect_uri": Config.GOOGLE_CHAT_REDIRECT_URI,
        "response_type": "code",
        "scope": google_chat_scope_string(),
        "access_type": "offline",
        "prompt": "consent",
        "include_granted_scopes": "true",
        "state": state,
    })
    return redirect(f"{GOOGLE_AUTH_URL}?{query}")


@google_chat_bp.get("/callback")
def google_chat_callback():
    state = request.args.get("state", "")
    code = request.args.get("code", "")
    frontend_url = f"{Config.FRONTEND_URL.rstrip('/')}/user/email/copy-paste-mode"
    payload = decode_jwt(state, Config.JWT_SECRET)
    if not payload or payload.get("purpose") != "google_chat_connect" or not code:
        return redirect(f"{frontend_url}?google_chat=error")
    try:
        user_id = ObjectId(payload["user_id"])
    except Exception:
        return redirect(f"{frontend_url}?google_chat=error")

    token_response = requests.post(GOOGLE_TOKEN_URL, data={
        "code": code,
        "client_id": Config.GOOGLE_CLIENT_ID,
        "client_secret": Config.GOOGLE_CLIENT_SECRET,
        "redirect_uri": Config.GOOGLE_CHAT_REDIRECT_URI,
        "grant_type": "authorization_code",
    }, timeout=20)
    if not token_response.ok:
        return redirect(f"{frontend_url}?google_chat=error")

    token_data = token_response.json()
    access_token = token_data.get("access_token", "")
    refresh_token = token_data.get("refresh_token", "")
    expires_in = int(token_data.get("expires_in", 3600) or 3600)
    granted_scopes = token_data.get("scope") or google_chat_scope_string()
    if not access_token:
        return redirect(f"{frontend_url}?google_chat=error")

    user = users_collection().find_one({"_id": user_id}) or {}
    existing = google_chat_connection(user)
    if not refresh_token and existing.get("refresh_token_encrypted"):
        refresh_token_encrypted = existing.get("refresh_token_encrypted")
    elif refresh_token:
        refresh_token_encrypted = encrypt_secret(refresh_token)
    else:
        return redirect(f"{frontend_url}?google_chat=missing_refresh_token")

    email_address = existing.get("email", "")
    profile_response = requests.get(GOOGLE_USERINFO_URL, headers={"Authorization": f"Bearer {access_token}"}, timeout=20)
    if profile_response.ok:
        email_address = clean_string(profile_response.json().get("email", "")).lower() or email_address
    if not email_address:
        email_address = clean_string(user.get("email", "")).lower()

    now = now_utc()
    users_collection().update_one(
        {"_id": user_id},
        {"$set": {
            "google_chat.email": email_address,
            "google_chat.status": "connected",
            "google_chat.access_token_encrypted": encrypt_secret(access_token),
            "google_chat.refresh_token_encrypted": refresh_token_encrypted,
            "google_chat.token_expiry": now + timedelta(seconds=expires_in),
            "google_chat.scopes": granted_scopes,
            "google_chat.error_message": "",
            "google_chat.connected_at": existing.get("connected_at") or now,
            "google_chat.updated_at": now,
        }},
    )
    create_notification(
        user_id, "google_chat", "Google Chat connected",
        f"Google Chat account {email_address or 'Google account'} is connected.",
        "success", "google_chat", "", "/user/email/copy-paste-mode",
        {"provider": "google_chat"},
    )
    return redirect(f"{frontend_url}?google_chat=connected")


@google_chat_bp.get("/status")
@require_auth
def google_chat_status(payload):
    user, error = require_active_user(payload)
    if error:
        return error
    return jsonify(safe_google_chat_status(user))


@google_chat_bp.get("/spaces")
@require_auth
def google_chat_spaces(payload):
    user, error = require_active_user(payload)
    if error:
        return error
    headers, auth_error = google_chat_auth_headers(user)
    if auth_error:
        return auth_error
    response = requests.get(
        f"{GOOGLE_CHAT_BASE_URL}/spaces",
        headers=headers,
        params={"pageSize": 100},
        timeout=20,
    )
    if not response.ok:
        return {"success": False, "message": gmail_error_message(response)}, response.status_code
    spaces = [safe_chat_space(space) for space in response.json().get("spaces", []) or []]
    return jsonify({"success": True, "spaces": spaces})


@google_chat_bp.get("/spaces/<path:space_id>/messages")
@require_auth
def google_chat_messages(payload, space_id):
    user, error = require_active_user(payload)
    if error:
        return error
    headers, auth_error = google_chat_auth_headers(user)
    if auth_error:
        return auth_error
    space_name = chat_space_name(space_id)
    response = requests.get(
        f"{GOOGLE_CHAT_BASE_URL}/{space_name}/messages",
        headers=headers,
        params={"pageSize": 50},
        timeout=20,
    )
    if not response.ok:
        return {"success": False, "message": gmail_error_message(response)}, response.status_code
    current_email = google_chat_connection(user).get("email", "")
    messages = [safe_chat_message(message, current_email) for message in response.json().get("messages", []) or []]
    messages.sort(key=lambda item: item.get("createTime", ""))
    return jsonify({"success": True, "messages": messages})


@google_chat_bp.get("/messages")
@require_auth
def google_chat_messages_alias(payload):
    space_id = request.args.get("space") or request.args.get("spaceId") or request.args.get("spaceName") or ""
    if not space_id:
        return {"success": False, "message": "space query parameter is required."}, 400
    return google_chat_messages(payload, space_id)


@google_chat_bp.post("/spaces/<path:space_id>/messages")
@require_auth
def google_chat_send_message(payload, space_id):
    user, error = require_active_user(payload)
    if error:
        return error
    headers, auth_error = google_chat_auth_headers(user)
    if auth_error:
        return auth_error
    data = request.get_json(silent=True) or {}
    text = clean_string(data.get("text", ""))
    if not text:
        return {"success": False, "message": "Message text is required."}, 400
    response = requests.post(
        f"{GOOGLE_CHAT_BASE_URL}/{chat_space_name(space_id)}/messages",
        headers=headers,
        json={"text": text},
        timeout=20,
    )
    if not response.ok:
        return {"success": False, "message": gmail_error_message(response)}, response.status_code
    return jsonify({"success": True, "message": safe_chat_message(response.json(), google_chat_connection(user).get("email", ""))})


@google_chat_bp.post("/start-chat")
@require_auth
def google_chat_start_chat(payload):
    user, error = require_active_user(payload)
    if error:
        return error
    headers, auth_error = google_chat_auth_headers(user)
    if auth_error:
        return auth_error
    data = request.get_json(silent=True) or {}
    email_address = clean_string(data.get("email", "")).lower()
    if not is_valid_email(email_address):
        return {"success": False, "message": "Enter a valid Gmail address."}, 400

    response = requests.post(
        f"{GOOGLE_CHAT_BASE_URL}/spaces:setup",
        headers=headers,
        json={
            "space": {"spaceType": "DIRECT_MESSAGE", "singleUserBotDm": False},
            "memberships": [{"member": {"name": f"users/{email_address}", "type": "HUMAN"}}],
            "requestId": str(uuid.uuid4()),
        },
        timeout=20,
    )
    if not response.ok:
        current_app.logger.warning("Google Chat start-chat failed for user=%s target=%s error=%s", user.get("_id"), email_address, response.text[:500])
        return {
            "success": False,
            "message": "Unable to start a chat with this user. The user may not have Google Chat enabled or may not allow direct messages.",
        }, response.status_code
    space = safe_chat_space(response.json())
    return jsonify({"success": True, "spaceId": space["id"], "displayName": space["displayName"], "space": space})


def validate_account_payload(data: dict, partial=False) -> tuple[dict, dict]:
    errors = {}
    email_address = clean_string(data.get("email") or data.get("email_address", "")).lower()
    display_name = clean_string(data.get("display_name") or data.get("displayName", ""))
    smtp_host = clean_string(data.get("smtp_host") or data.get("host", ""))
    smtp_username = clean_string(data.get("smtp_username") or data.get("username", ""))
    password = data.get("smtp_password") or data.get("password", "")
    try:
        smtp_port = int(data.get("smtp_port") or data.get("port") or 587)
    except (TypeError, ValueError):
        smtp_port = 587
    smtp_secure = bool(data.get("smtp_secure", data.get("secure", True)))

    if not partial or email_address:
        if not is_valid_email(email_address):
            errors["email"] = "Enter a valid from email address."
    if not partial or smtp_host:
        if not smtp_host:
            errors["smtp_host"] = "SMTP host is required."
    if not partial or smtp_username:
        if not smtp_username:
            errors["smtp_username"] = "SMTP username is required."
    if not partial or password:
        if not password:
            errors["smtp_password"] = "SMTP password is required."
    if smtp_port <= 0 or smtp_port > 65535:
        errors["smtp_port"] = "Enter a valid SMTP port."

    return {
        "email_address": email_address,
        "display_name": display_name or email_address,
        "smtp_host": smtp_host,
        "smtp_port": smtp_port,
        "smtp_username": smtp_username,
        "smtp_password": password,
        "smtp_secure": smtp_secure,
    }, errors


def test_smtp_connection(settings: dict) -> tuple[bool, str]:
    context = ssl.create_default_context()
    try:
        if settings["smtp_secure"] and settings["smtp_port"] == 465:
            with smtplib.SMTP_SSL(settings["smtp_host"], settings["smtp_port"], context=context, timeout=20) as smtp:
                smtp.login(settings["smtp_username"], settings["smtp_password"])
        else:
            with smtplib.SMTP(settings["smtp_host"], settings["smtp_port"], timeout=20) as smtp:
                smtp.ehlo()
                if settings["smtp_secure"]:
                    smtp.starttls(context=context)
                    smtp.ehlo()
                smtp.login(settings["smtp_username"], settings["smtp_password"])
        return True, ""
    except Exception as exc:
        return False, str(exc)


def parse_manual_emails(value) -> list[str]:
    raw = value if isinstance(value, list) else re.split(r"[\n,;]+", str(value or ""))
    seen = set()
    emails = []
    for item in raw:
        email = clean_string(str(item)).lower()
        if is_valid_email(email) and email not in seen:
            seen.add(email)
            emails.append(email)
    return emails


def contact_contexts_by_group(user_id: ObjectId, group: str) -> list[dict]:
    if not group:
        return []
    return list(contacts_collection().find({"user_id": user_id, "group": group, "email": {"$ne": ""}}))


def records_from_csv_rows(rows) -> list[dict]:
    records = []
    if not isinstance(rows, list):
        return records
    for row in rows:
        if not isinstance(row, dict):
            continue
        email = clean_string(row.get("email", "")).lower()
        if not is_valid_email(email):
            continue
        custom_fields = []
        for key, value in row.items():
            safe_key = variable_key(key)
            if safe_key and safe_key not in {"email", "contact_name", "name"}:
                custom_fields.append({"key": key, "value": clean_string(str(value or ""))})
        records.append({
            "email": email,
            "contact_name": clean_string(row.get("contact_name") or row.get("name", "")),
            "custom_fields": custom_fields,
        })
    return records


def build_recipients(user_id: ObjectId, data: dict) -> tuple[list[dict], dict]:
    records = []
    for email in parse_manual_emails(data.get("recipients") or data.get("emails") or data.get("manual_emails", "")):
        records.append({"email": email})
    for contact in contact_contexts_by_group(user_id, clean_string(data.get("group", ""))):
        records.append(contact)
    records.extend(records_from_csv_rows(data.get("csv_rows") or data.get("csvRows")))

    seen = set()
    unique = []
    duplicates = 0
    for record in records:
        email = clean_string(record.get("email", "")).lower()
        if not is_valid_email(email):
            continue
        if email in seen:
            duplicates += 1
            continue
        seen.add(email)
        unique.append(record)
    return unique, {"duplicates_removed": duplicates, "recipient_count": len(unique)}


def insert_email_log(user, account, recipients, subject, message, fmt, send_type, status, cost, wallet_before, wallet_after, reference, provider_id="", rfc_message_id="", error_message="", bounce_reason="", attachments=None):
    now = now_utc()
    delivery_status = "accepted" if status == "sent" else "undelivered" if status in {"failed", "bounced"} else "unknown"
    log = {
        "email_id": reference,
        "user_id": user["_id"],
        "account_id": account.get("account_id"),
        "provider": account.get("provider"),
        "from_email": account.get("email_address"),
        "to_email": recipients[0] if len(recipients) == 1 else "",
        "recipients": recipients[:500],
        "recipient_count": len(recipients),
        "subject": subject,
        "message_preview": clean_string(re.sub(r"<[^>]+>", " ", message))[:180],
        "format": fmt,
        "type": send_type,
        "status": status,
        "delivery_status": delivery_status,
        "bounce_reason": bounce_reason,
        "rfc_message_id": rfc_message_id,
        "cost_per_email": cost["cost_per_email"],
        "total_cost": cost["total_cost"],
        "wallet_before": wallet_before,
        "wallet_after": wallet_after,
        "provider_message_id": provider_id,
        "error_message": error_message,
        "attachments": attachment_metadata(attachments or []),
        "sent_at": now if status == "sent" else None,
        "failed_at": now if status == "failed" else None,
        "bounced_at": now if status == "bounced" else None,
        "created_at": now,
        "updated_at": now,
    }
    email_logs().insert_one(log)
    return log


def email_cost(recipient_count: int, settings: dict | None = None):
    active = settings or get_email_settings()
    unit = to_float(active.get("cost_per_email"), DEFAULT_EMAIL_COST)
    provider_unit = to_float(active.get("provider_cost_per_email"), 0)
    return {
        "recipient_count": recipient_count,
        "cost_per_email": unit,
        "provider_cost_per_email": provider_unit,
        "total_cost": round(recipient_count * unit, 4),
        "provider_total_cost": round(recipient_count * provider_unit, 4),
        "email_enabled": bool(active.get("email_enabled")),
    }


def send_email_flow(user, account, recipient_records, subject, message, fmt, send_type, attachments=None, wallet_category="email", description_prefix="Email"):
    abuse_error = abuse_check_message(f"{subject}\n{message}", user.get("_id"), "email")
    if abuse_error:
        return abuse_error
    settings = get_email_settings()
    if not settings["email_enabled"]:
        return {"success": False, "message": "Email sending is currently disabled."}, 403
    if account.get("status") != "connected":
        return {"success": False, "message": "Selected email account is not connected."}, 400
    if not recipient_records:
        return {"success": False, "message": "Add at least one valid recipient email."}, 400

    cost = email_cost(len(recipient_records), settings)
    wallet_before = to_float(user.get("wallet_balance"))
    if wallet_before < cost["total_cost"]:
        create_notification(
            user["_id"], "wallet", "Insufficient wallet balance",
            f"Email sending was blocked. Required GHS {cost['total_cost']:.4f}.",
            "warning", "wallet", "", "/user/wallet",
            {"required": cost["total_cost"], "balance": wallet_before},
        )
        return {"success": False, "message": "Insufficient wallet balance.", "preview": cost}, 400

    successful = []
    failed = []
    accepted_logs = []
    failed_logs = []
    for record in recipient_records:
        recipient = clean_string(record.get("email", "")).lower()
        values = contact_values(record, recipient)
        personalized_subject = render_template_text(subject, values)
        personalized_message = render_template_text(message, values)
        rfc_message_id = make_msgid(domain=(account.get("email_address") or "viresender.com").split("@")[-1])
        result = send_one(account, recipient, personalized_subject, personalized_message, fmt, rfc_message_id, attachments)
        if result.get("success"):
            successful.append(recipient)
            accepted_logs.append({
                "recipient": recipient,
                "subject": personalized_subject,
                "message": personalized_message,
                "provider_message_id": result.get("provider_message_id", ""),
                "rfc_message_id": result.get("rfc_message_id") or rfc_message_id,
            })
        else:
            error = result.get("message", "Email failed.")
            failed.append({"email": recipient, "error": error})
            failed_logs.append({
                "recipient": recipient,
                "subject": personalized_subject,
                "message": personalized_message,
                "error": error,
                "rfc_message_id": rfc_message_id,
            })

    if not successful:
        log = None
        for item in failed_logs:
            log = insert_email_log(user, account, [item["recipient"]], item["subject"], item["message"], fmt, send_type, "failed", email_cost(1, settings), wallet_before, wallet_before, create_reference("EML"), "", item["rfc_message_id"], item["error"], "", attachments)
        email_accounts().update_one({"_id": account["_id"]}, {"$set": {"status": "error", "error_message": log["error_message"], "updated_at": now_utc()}})
        create_notification(
            user["_id"], "email", "Email failed",
            f"Email failed before acceptance: {log['error_message']}",
            "error", "email", log.get("email_id", ""), "/user/email-message-logs",
            {"type": send_type},
        )
        return {"success": False, "message": log["error_message"], "log": safe_log(log), "failed": failed}, 502

    actual_cost = email_cost(len(successful), settings)
    wallet_after = wallet_before
    reference = create_reference("EML")
    if actual_cost["total_cost"] > 0:
        updated_user = users_collection().find_one_and_update(
            {"_id": user["_id"], "wallet_balance": {"$gte": actual_cost["total_cost"]}},
            {
                "$inc": {"wallet_balance": -actual_cost["total_cost"]},
                "$set": {"updated_at": now_utc()},
            },
            return_document=ReturnDocument.AFTER,
        )
        if not updated_user:
            return {"success": False, "message": "Insufficient wallet balance."}, 400
        wallet_after = to_float(updated_user.get("wallet_balance"))
        wallet_transactions().insert_one({
            "user_id": user["_id"],
            "type": "debit",
            "category": wallet_category,
            "amount": actual_cost["total_cost"],
            "description": f"{description_prefix} sent to {len(successful)} recipient(s)",
            "reference": reference,
            "status": "completed",
            "balance_before": wallet_before,
            "balance_after": wallet_after,
            "created_at": now_utc(),
            "updated_at": now_utc(),
        })
    logs = []
    per_email_cost = email_cost(1, settings)
    for item in accepted_logs:
        logs.append(insert_email_log(
            user, account, [item["recipient"]], item["subject"], item["message"], fmt, send_type,
            "sent", per_email_cost, wallet_before, wallet_after, create_reference("EML"),
            item["provider_message_id"], item["rfc_message_id"], "", "", attachments,
        ))
    for item in failed_logs:
        insert_email_log(
            user, account, [item["recipient"]], item["subject"], item["message"], fmt, send_type,
            "failed", per_email_cost, wallet_before, wallet_after, create_reference("EML"),
            "", item["rfc_message_id"], item["error"], "", attachments,
        )
    email_accounts().update_one(
        {"_id": account["_id"]},
        {"$inc": {"sent_today": len(successful), "total_sent": len(successful)}, "$set": {"last_synced_at": now_utc(), "status": "connected", "error_message": "", "updated_at": now_utc()}},
    )
    title = "Email campaign completed" if send_type == "campaign" else "Bulk email completed" if send_type == "bulk" else "Widget email sent" if send_type == "widget" else "Email sent"
    create_notification(
        user["_id"], "email", title,
        f"Email accepted for {len(successful)} recipient(s). {'No wallet charge applied.' if actual_cost['total_cost'] <= 0 else 'Delivery status will update if a bounce is detected.'}",
        "success", "email", logs[0].get("email_id", "") if logs else "", "/user/email-message-logs",
        {"recipient_count": len(successful), "failed_count": len(failed), "type": send_type},
    )
    message_text = "Email sent free. Delivery status will update if a bounce is detected." if actual_cost["total_cost"] <= 0 else "Email sent. Delivery status will update if a bounce is detected."
    return {"success": True, "message": message_text, "logs": [safe_log(log) for log in logs], "log": safe_log(logs[0]) if logs else None, "wallet_balance": wallet_after, "preview": actual_cost, "failed": failed}, 200


@email_bp.get("/accounts")
@require_auth
def get_accounts(payload):
    user, error = require_active_user(payload)
    if error:
        return error
    accounts = list(email_accounts().find({"user_id": user["_id"]}).sort("created_at", -1))
    return jsonify({"success": True, "accounts": [safe_account(account) for account in accounts], "settings": get_email_settings()})


@email_bp.post("/accounts/smtp")
@require_auth
def create_smtp_account(payload):
    user, error = require_active_user(payload)
    if error:
        return error
    settings, errors = validate_account_payload(request.get_json(silent=True) or {})
    if errors:
        return {"success": False, "message": "Please check the SMTP details.", "errors": errors}, 400
    ok, message = test_smtp_connection(settings)
    if not ok:
        return {"success": False, "message": f"SMTP connection failed: {message}"}, 400

    now = now_utc()
    has_default = email_accounts().find_one({"user_id": user["_id"], "is_default": True})
    account = {
        "account_id": create_reference("ACC"),
        "user_id": user["_id"],
        "provider": "smtp",
        "email_address": settings["email_address"],
        "display_name": settings["display_name"],
        "status": "connected",
        "is_default": not bool(has_default),
        "smtp_host": settings["smtp_host"],
        "smtp_port": settings["smtp_port"],
        "smtp_username": settings["smtp_username"],
        "smtp_password_encrypted": encrypt_secret(settings["smtp_password"]),
        "smtp_secure": settings["smtp_secure"],
        "sent_today": 0,
        "total_sent": 0,
        "last_synced_at": now,
        "error_message": "",
        "created_at": now,
        "updated_at": now,
    }
    email_accounts().insert_one(account)
    create_notification(
        user["_id"], "email", "SMTP account connected",
        f"SMTP account {settings['email_address']} is connected and ready for sending.",
        "success", "email_accounts", account["account_id"], "/user/email-accounts",
        {"provider": "smtp"},
    )
    return jsonify({"success": True, "message": "SMTP account connected.", "account": safe_account(account)})


@email_bp.post("/accounts/<account_id>/test")
@require_auth
def test_account(payload, account_id):
    user, error = require_active_user(payload)
    if error:
        return error
    account = account_for_user(user["_id"], account_id)
    if not account:
        return {"success": False, "message": "Email account not found."}, 404
    if account.get("provider") == "gmail":
        token = refresh_gmail_token(account)
        ok = bool(token)
        message = "Gmail connection is valid." if ok else "Gmail needs to be reconnected."
    else:
        password = decrypt_secret(account.get("smtp_password_encrypted", ""))
        ok, detail = test_smtp_connection({
            "smtp_host": account.get("smtp_host"),
            "smtp_port": int(account.get("smtp_port") or 587),
            "smtp_username": account.get("smtp_username"),
            "smtp_password": password,
            "smtp_secure": bool(account.get("smtp_secure")),
        })
        message = "SMTP connection is valid." if ok else detail
    email_accounts().update_one({"_id": account["_id"]}, {"$set": {"status": "connected" if ok else "error", "error_message": "" if ok else message, "last_synced_at": now_utc(), "updated_at": now_utc()}})
    return jsonify({"success": ok, "message": message})


@email_bp.put("/accounts/<account_id>")
@require_auth
def update_account(payload, account_id):
    user, error = require_active_user(payload)
    if error:
        return error
    account = account_for_user(user["_id"], account_id)
    if not account:
        return {"success": False, "message": "Email account not found."}, 404
    data = request.get_json(silent=True) or {}
    updates = {
        "display_name": clean_string(data.get("display_name") or data.get("displayName") or account.get("display_name", "")),
        "updated_at": now_utc(),
    }
    if account.get("provider") == "smtp":
        settings, errors = validate_account_payload(data, partial=True)
        if errors:
            return {"success": False, "message": "Please check the SMTP details.", "errors": errors}, 400
        for key in ("email_address", "smtp_host", "smtp_port", "smtp_username", "smtp_secure"):
            if settings.get(key) not in ("", None):
                updates[key] = settings[key]
        if settings.get("smtp_password"):
            updates["smtp_password_encrypted"] = encrypt_secret(settings["smtp_password"])
    email_accounts().update_one({"_id": account["_id"]}, {"$set": updates})
    refreshed = email_accounts().find_one({"_id": account["_id"]})
    return jsonify({"success": True, "message": "Account updated.", "account": safe_account(refreshed)})


@email_bp.delete("/accounts/<account_id>")
@require_auth
def delete_account(payload, account_id):
    user, error = require_active_user(payload)
    if error:
        return error
    result = email_accounts().delete_one({"user_id": user["_id"], "account_id": account_id})
    if result.deleted_count != 1:
        return {"success": False, "message": "Email account not found."}, 404
    next_account = email_accounts().find_one({"user_id": user["_id"]})
    if next_account:
        email_accounts().update_one({"_id": next_account["_id"]}, {"$set": {"is_default": True, "updated_at": now_utc()}})
    return jsonify({"success": True, "message": "Email account disconnected."})


@email_bp.post("/accounts/<account_id>/default")
@require_auth
def set_default_account(payload, account_id):
    user, error = require_active_user(payload)
    if error:
        return error
    account = account_for_user(user["_id"], account_id)
    if not account:
        return {"success": False, "message": "Email account not found."}, 404
    email_accounts().update_many({"user_id": user["_id"]}, {"$set": {"is_default": False, "updated_at": now_utc()}})
    email_accounts().update_one({"_id": account["_id"]}, {"$set": {"is_default": True, "updated_at": now_utc()}})
    return jsonify({"success": True, "message": "Default email account updated."})


@email_bp.get("/google/connect")
def google_connect():
    auth_header = request.headers.get("Authorization", "")
    token = request.args.get("token", "")
    if auth_header.startswith("Bearer "):
        token = auth_header.removeprefix("Bearer ").strip()
    payload = decode_jwt(token, Config.JWT_SECRET)
    if not payload:
        return {"success": False, "message": "Authentication required."}, 401
    user, error = require_active_user(payload)
    if error:
        return error
    if not Config.GOOGLE_CLIENT_ID or not Config.GOOGLE_CLIENT_SECRET:
        return {"success": False, "message": "Google OAuth is not configured."}, 500
    if not Config.GMAIL_OAUTH_REDIRECT_URI:
        return {"success": False, "message": "Gmail OAuth redirect URI is not configured."}, 500
    state = generate_jwt({"user_id": str(user["_id"]), "purpose": "email_gmail_connect"}, Config.JWT_SECRET, 1)
    query = urlencode({
        "client_id": Config.GOOGLE_CLIENT_ID,
        "redirect_uri": Config.GMAIL_OAUTH_REDIRECT_URI,
        "response_type": "code",
        "scope": gmail_scope_string(),
        "access_type": "offline",
        "prompt": "consent",
        "include_granted_scopes": "true",
        "state": state,
    })
    return redirect(f"{GOOGLE_AUTH_URL}?{query}")


@email_bp.get("/google/callback")
def google_callback():
    state = request.args.get("state", "")
    code = request.args.get("code", "")
    frontend_url = f"{Config.FRONTEND_URL.rstrip('/')}/user/email-accounts"
    payload = decode_jwt(state, Config.JWT_SECRET)
    if not payload or payload.get("purpose") != "email_gmail_connect" or not code:
        return redirect(f"{frontend_url}?email_status=error")
    try:
        user_id = ObjectId(payload["user_id"])
    except Exception:
        return redirect(f"{frontend_url}?email_status=error")

    token_response = requests.post(GOOGLE_TOKEN_URL, data={
        "code": code,
        "client_id": Config.GOOGLE_CLIENT_ID,
        "client_secret": Config.GOOGLE_CLIENT_SECRET,
        "redirect_uri": Config.GMAIL_OAUTH_REDIRECT_URI,
        "grant_type": "authorization_code",
    }, timeout=20)
    if not token_response.ok:
        return redirect(f"{frontend_url}?email_status=error")
    token_data = token_response.json()
    access_token = token_data.get("access_token", "")
    refresh_token = token_data.get("refresh_token", "")
    expires_in = int(token_data.get("expires_in", 3600) or 3600)
    granted_scopes = token_data.get("scope") or gmail_scope_string()
    if not access_token:
        return redirect(f"{frontend_url}?email_status=error")

    email_address = ""
    profile_response = requests.get(GMAIL_PROFILE_URL, headers={"Authorization": f"Bearer {access_token}"}, timeout=20)
    if profile_response.ok:
        email_address = clean_string(profile_response.json().get("emailAddress", "")).lower()
    if not is_valid_email(email_address):
        return redirect(f"{frontend_url}?email_status=error")

    now = now_utc()
    existing = email_accounts().find_one({"user_id": user_id, "provider": "gmail", "email_address": email_address})
    has_default = email_accounts().find_one({"user_id": user_id, "is_default": True})
    updates = {
        "provider": "gmail",
        "email_address": email_address,
        "display_name": email_address,
        "status": "connected",
        "access_token_encrypted": encrypt_secret(access_token),
        "token_expiry": now + timedelta(seconds=expires_in),
        "scopes": granted_scopes,
        "bounce_tracking_enabled": GMAIL_READONLY_SCOPE in granted_scopes,
        "last_synced_at": now,
        "error_message": "",
        "updated_at": now,
    }
    if refresh_token:
        updates["refresh_token_encrypted"] = encrypt_secret(refresh_token)
    if existing:
        if not refresh_token and existing.get("refresh_token_encrypted"):
            updates["refresh_token_encrypted"] = existing.get("refresh_token_encrypted")
        email_accounts().update_one({"_id": existing["_id"]}, {"$set": updates})
        account_id = existing.get("account_id", "")
    else:
        if not refresh_token:
            return redirect(f"{frontend_url}?email_status=missing_refresh_token")
        updates.update({
            "account_id": create_reference("ACC"),
            "user_id": user_id,
            "is_default": not bool(has_default),
            "sent_today": 0,
            "total_sent": 0,
            "created_at": now,
        })
        email_accounts().insert_one(updates)
        account_id = updates.get("account_id", "")
    create_notification(
        user_id, "email", "Gmail account connected",
        f"Gmail account {email_address} is connected and ready for sending.",
        "success", "email_accounts", account_id, "/user/email-accounts",
        {"provider": "gmail"},
    )
    return redirect(f"{frontend_url}?email_status=connected")


@email_bp.post("/send-single")
@require_auth
def send_single(payload):
    locked = check_service_available("email_sender")
    if locked:
        return locked
    user, error = require_active_user(payload)
    if error:
        return error
    data, attachments, attachment_error = request_data_and_attachments()
    if attachment_error:
        return {"success": False, "message": attachment_error}, 400
    account = account_for_user(user["_id"], clean_string(data.get("account_id") or data.get("accountId") or ""))
    if not account:
        return {"success": False, "message": "Select a connected email account."}, 400
    to_email = clean_string(data.get("to_email") or data.get("toEmail") or "").lower()
    subject = clean_string(data.get("subject", ""))
    message = data.get("message", "")
    fmt = "html" if data.get("format") == "html" else "plain"
    if not is_valid_email(to_email):
        return {"success": False, "message": "Enter a valid recipient email."}, 400
    if not subject or not clean_string(re.sub(r"<[^>]+>", " ", message)):
        return {"success": False, "message": "Subject and message are required."}, 400
    record = contacts_collection().find_one({"user_id": user["_id"], "email": to_email}) or {"email": to_email}
    response, status = send_email_flow(user, account, [record], subject, sanitize_html(message) if fmt == "html" else message, fmt, "single", attachments)
    return response, status


@email_bp.post("/send-bulk")
@require_auth
def send_bulk(payload):
    locked = check_service_available("email_sender")
    if locked:
        return locked
    user, error = require_active_user(payload)
    if error:
        return error
    data, attachments, attachment_error = request_data_and_attachments()
    if attachment_error:
        return {"success": False, "message": attachment_error}, 400
    account = account_for_user(user["_id"], clean_string(data.get("account_id") or data.get("accountId") or ""))
    if not account:
        return {"success": False, "message": "Select a connected email account."}, 400
    subject = clean_string(data.get("subject", ""))
    message = data.get("message", "")
    fmt = "html" if data.get("format") == "html" else "plain"
    if not subject or not clean_string(re.sub(r"<[^>]+>", " ", message)):
        return {"success": False, "message": "Subject and message are required."}, 400
    recipients, summary = build_recipients(user["_id"], data)
    response, status = send_email_flow(user, account, recipients, subject, sanitize_html(message) if fmt == "html" else message, fmt, data.get("type") or "bulk", attachments)
    if response.get("success") and data.get("campaign_name"):
        email_campaigns().insert_one({
            "campaign_id": create_reference("ECMP"),
            "user_id": user["_id"],
            "name": clean_string(data.get("campaign_name")),
            "account_id": account.get("account_id"),
            "from_email": account.get("email_address"),
            "recipient_count": len(recipients),
            "sent": len(response.get("logs", [])),
            "failed": len(response.get("failed", [])),
            "bounced": 0,
            "unknown": 0,
            "subject": subject,
            "message_preview": clean_string(re.sub(r"<[^>]+>", " ", message))[:180],
            "format": fmt,
            "attachments": attachment_metadata(attachments),
            "status": "completed",
            "created_at": now_utc(),
            "updated_at": now_utc(),
        })
    response["summary"] = summary
    return response, status


def safe_copy_paste_draft(draft: dict) -> dict:
    return {
        "id": draft.get("draft_id"),
        "draft_id": draft.get("draft_id"),
        "name": draft.get("name", "Copy Paste Draft"),
        "account_id": draft.get("account_id", ""),
        "selected_domain": draft.get("selected_domain", "@gmail.com"),
        "recipients": draft.get("recipients", []),
        "subject": draft.get("subject", ""),
        "sender_name": draft.get("sender_name", ""),
        "message": draft.get("message", ""),
        "format": draft.get("format", "plain"),
        "attachments": draft.get("attachments", []),
        "settings": draft.get("settings", {}),
        "created_at": iso(draft.get("created_at")),
        "updated_at": iso(draft.get("updated_at")),
    }


@email_bp.get("/copy-paste-drafts")
@require_auth
def list_copy_paste_drafts(payload):
    user, error = require_active_user(payload)
    if error:
        return error
    drafts = copy_paste_drafts().find({"user_id": user["_id"]}).sort("updated_at", -1).limit(25)
    return jsonify({"success": True, "drafts": [safe_copy_paste_draft(draft) for draft in drafts]})


@email_bp.post("/copy-paste-drafts")
@require_auth
def create_copy_paste_draft(payload):
    locked = check_service_available("email_sender")
    if locked:
        return locked
    user, error = require_active_user(payload)
    if error:
        return error
    data = request.get_json(silent=True) or {}
    now = now_utc()
    draft = build_copy_paste_draft(user["_id"], data)
    draft.update({"draft_id": create_reference("CPD"), "created_at": now, "updated_at": now})
    copy_paste_drafts().insert_one(draft)
    create_notification(
        user["_id"], "email", "Copy & Paste draft saved",
        f"Draft {draft.get('name', 'Copy Paste Draft')} was saved.",
        "success", "email", draft["draft_id"], "/user/email/copy-paste-mode",
        {},
    )
    return jsonify({"success": True, "message": "Draft saved.", "draft": safe_copy_paste_draft(draft)})


@email_bp.put("/copy-paste-drafts/<draft_id>")
@require_auth
def update_copy_paste_draft(payload, draft_id):
    user, error = require_active_user(payload)
    if error:
        return error
    data = request.get_json(silent=True) or {}
    update = build_copy_paste_draft(user["_id"], data)
    update["updated_at"] = now_utc()
    result = copy_paste_drafts().find_one_and_update(
        {"user_id": user["_id"], "draft_id": draft_id},
        {"$set": update},
        return_document=ReturnDocument.AFTER,
    )
    if not result:
        return {"success": False, "message": "Draft not found."}, 404
    return jsonify({"success": True, "message": "Draft updated.", "draft": safe_copy_paste_draft(result)})


@email_bp.delete("/copy-paste-drafts/<draft_id>")
@require_auth
def delete_copy_paste_draft(payload, draft_id):
    user, error = require_active_user(payload)
    if error:
        return error
    result = copy_paste_drafts().delete_one({"user_id": user["_id"], "draft_id": draft_id})
    if not result.deleted_count:
        return {"success": False, "message": "Draft not found."}, 404
    return jsonify({"success": True, "message": "Draft deleted."})


def build_copy_paste_draft(user_id, data: dict) -> dict:
    return {
        "user_id": user_id,
        "name": clean_string(data.get("name") or data.get("subject") or "Copy Paste Draft")[:120],
        "account_id": clean_string(data.get("account_id") or data.get("accountId") or ""),
        "selected_domain": clean_string(data.get("selected_domain") or data.get("selectedDomain") or "@gmail.com")[:80],
        "recipients": parse_manual_emails(data.get("recipients") or []),
        "subject": clean_string(data.get("subject", ""))[:180],
        "sender_name": clean_string(data.get("sender_name") or data.get("senderName") or "")[:120],
        "message": str(data.get("message") or "")[:20000],
        "format": "html" if data.get("format") == "html" else "plain",
        "attachments": data.get("attachments") if isinstance(data.get("attachments"), list) else [],
        "settings": data.get("settings") if isinstance(data.get("settings"), dict) else {},
    }


@email_bp.post("/copy-paste/validate-recipients")
@require_auth
def validate_copy_paste_recipients(payload):
    user, error = require_active_user(payload)
    if error:
        return error
    data = request.get_json(silent=True) or {}
    recipients = parse_manual_emails(data.get("recipients") or [])
    invalid = []
    raw = data.get("recipients") if isinstance(data.get("recipients"), list) else re.split(r"[\n,;]+", str(data.get("recipients") or ""))
    valid_set = set(recipients)
    for item in raw:
        email = clean_string(str(item)).lower()
        if email and email not in valid_set:
            invalid.append(email)
    return jsonify({"success": True, "valid": recipients, "invalid": invalid, "count": len(recipients)})


def safe_copy_paste_job(job: dict | None, include_items=False) -> dict:
    if not job:
        return {}
    data = {
        "job_id": job.get("job_id", ""),
        "status": job.get("status", "queued"),
        "total": int(job.get("total", 0) or 0),
        "queued": int(job.get("queued", 0) or 0),
        "sending": int(job.get("sending", 0) or 0),
        "sent": int(job.get("sent", 0) or 0),
        "failed": int(job.get("failed", 0) or 0),
        "current": job.get("current", ""),
        "message": job.get("message", ""),
        "created_at": iso(job.get("created_at")),
        "updated_at": iso(job.get("updated_at")),
        "completed_at": iso(job.get("completed_at")),
    }
    if include_items:
        items = email_send_queue().find({"job_id": job.get("job_id")}).sort("created_at", 1)
        data["items"] = [{
            "queue_id": item.get("queue_id", ""),
            "recipient": item.get("recipient", ""),
            "status": item.get("status", "queued"),
            "error_message": item.get("error_message", ""),
            "email_log_id": item.get("email_log_id", ""),
            "updated_at": iso(item.get("updated_at")),
        } for item in items]
    return data


def _send_queued_copy_paste_item(job: dict, item: dict) -> dict:
    now = now_utc()
    email_send_queue().update_one(
        {"_id": item["_id"], "status": {"$in": ["queued", "failed"]}},
        {"$set": {"status": "sending", "updated_at": now}, "$inc": {"attempts": 1}},
    )
    email_send_jobs().update_one(
        {"job_id": job["job_id"]},
        {"$set": {"current": item.get("recipient", ""), "updated_at": now_utc()}},
    )
    user = users_collection().find_one({"_id": job["user_id"]})
    account = account_for_user(job["user_id"], job.get("account_id", ""))
    if not user:
        return {"recipient": item.get("recipient", ""), "success": False, "message": "User account not found."}
    if not account:
        return {"recipient": item.get("recipient", ""), "success": False, "message": "Email account not found."}
    recipient = item.get("recipient", "")
    record = contacts_collection().find_one({"user_id": job["user_id"], "email": recipient}) or {"email": recipient}
    response, _status = send_email_flow(
        user,
        account,
        [record],
        job.get("subject", ""),
        job.get("message_body", ""),
        job.get("format", "plain"),
        "copy_paste",
        None,
        description_prefix="Copy & Paste email",
    )
    if response.get("success"):
        log_id = ""
        for log in response.get("logs", []):
            log_id = log.get("email_id") or log_id
            email_logs().update_one(
                {"email_id": log.get("email_id")},
                {"$set": {
                    "source": "copy_paste_mode",
                    "copy_paste_job_id": job["job_id"],
                    "attachment_count": 0,
                    "updated_at": now_utc(),
                }},
            )
        email_send_queue().update_one(
            {"_id": item["_id"]},
            {"$set": {"status": "sent", "email_log_id": log_id, "error_message": "", "updated_at": now_utc()}},
        )
        return {"recipient": recipient, "success": True, "email_log_id": log_id}

    message = response.get("message", "Failed to send email.")
    email_send_queue().update_one(
        {"_id": item["_id"]},
        {"$set": {"status": "failed", "error_message": message, "updated_at": now_utc()}},
    )
    return {"recipient": recipient, "success": False, "message": message}


def process_copy_paste_job(app, job_id: str) -> None:
    try:
        with app.app_context():
            job = email_send_jobs().find_one({"job_id": job_id})
            if not job or job.get("status") in {"completed", "failed", "cancelled"}:
                return
            if job.get("status") not in {"queued", "running"}:
                return

            claimed = email_send_jobs().update_one(
                {"job_id": job_id, "status": {"$in": ["queued", "running"]}},
                {"$set": {"status": "running", "started_at": job.get("started_at") or now_utc(), "updated_at": now_utc()}},
            )
            if claimed.modified_count != 1:
                return

            items = list(email_send_queue().find({"job_id": job_id, "status": {"$in": ["queued", "sending"]}}).sort("created_at", 1))
            if not items:
                email_send_jobs().update_one(
                    {"job_id": job_id},
                    {"$set": {"status": "completed", "completed_at": now_utc(), "updated_at": now_utc(), "message": "No pending recipients."}},
                )
                return

            max_workers = max(1, min(5, int(job.get("max_workers", 5) or 5), len(items)))
            sent = int(job.get("sent", 0) or 0)
            failed = int(job.get("failed", 0) or 0)
            with ThreadPoolExecutor(max_workers=max_workers) as executor:
                futures = [executor.submit(_send_queued_copy_paste_item, job, item) for item in items]
                for future in as_completed(futures):
                    try:
                        result = future.result()
                    except Exception as exc:
                        result = {"success": False, "message": str(exc)}
                    if result.get("success"):
                        sent += 1
                    else:
                        failed += 1
                    email_send_jobs().update_one(
                        {"job_id": job_id},
                        {"$set": {
                            "sent": sent,
                            "failed": failed,
                            "queued": max(0, len(items) - sent - failed),
                            "sending": 0,
                            "updated_at": now_utc(),
                        }},
                    )

            final_status = "completed" if sent else "failed"
            email_send_jobs().update_one(
                {"job_id": job_id},
                {"$set": {
                    "status": final_status,
                    "sent": sent,
                    "failed": failed,
                    "queued": 0,
                    "sending": 0,
                    "current": "",
                    "completed_at": now_utc(),
                    "updated_at": now_utc(),
                    "message": f"{sent} sent, {failed} failed.",
                }},
            )
            create_notification(
                job["user_id"], "email", "Copy & Paste send completed",
                f"{sent} email(s) sent, {failed} failed.",
                "success" if failed == 0 else "warning", "email", job_id, "/user/email-message-logs",
                {"source": "copy_paste_mode", "job_id": job_id, "sent": sent, "failed": failed},
            )
    except Exception as exc:
        with app.app_context():
            email_send_queue().update_many(
                {"job_id": job_id, "status": {"$in": ["queued", "sending"]}},
                {"$set": {"status": "failed", "error_message": str(exc), "updated_at": now_utc()}},
            )
            email_send_jobs().update_one(
                {"job_id": job_id},
                {"$set": {
                    "status": "failed",
                    "queued": 0,
                    "sending": 0,
                    "current": "",
                    "completed_at": now_utc(),
                    "updated_at": now_utc(),
                    "message": f"Copy & Paste worker failed: {str(exc)}",
                }},
            )
            current_app.logger.exception("Copy & Paste job failed: job_id=%s error=%s", job_id, str(exc))


def process_stale_copy_paste_jobs(app, limit=5) -> int:
    with app.app_context():
        stale_cutoff = now_utc() - timedelta(minutes=5)
        email_send_jobs().update_many(
            {"status": "running", "updated_at": {"$lt": stale_cutoff}},
            {"$set": {"status": "queued", "message": "Recovered stale Copy & Paste job.", "updated_at": now_utc()}},
        )
        email_send_queue().update_many(
            {"status": "sending", "updated_at": {"$lt": stale_cutoff}},
            {"$set": {"status": "queued", "updated_at": now_utc()}},
        )
        jobs = list(email_send_jobs().find({"status": "queued"}).sort("created_at", 1).limit(limit))
    for job in jobs:
        process_copy_paste_job(app, job["job_id"])
    return len(jobs)


@email_bp.post("/copy-paste/queue-send")
@require_auth
def queue_copy_paste_send(payload):
    locked = check_service_available("email_sender")
    if locked:
        return locked
    user, error = require_active_user(payload)
    if error:
        return error
    data = request.get_json(silent=True) or {}
    if data.get("has_attachments"):
        return {"success": False, "message": "Queued Copy & Paste sending does not support attachments yet. Use the normal send button for attachments."}, 400
    account = account_for_user(user["_id"], clean_string(data.get("account_id") or data.get("accountId") or ""))
    if not account:
        return {"success": False, "message": "Select a connected email account."}, 400
    subject = clean_string(data.get("subject", ""))[:180]
    message = data.get("message", "")
    fmt = "plain"
    recipients = parse_manual_emails(data.get("recipients") or data.get("emails") or "")
    if not recipients:
        return {"success": False, "message": "Add at least one valid recipient."}, 400
    if not subject or not clean_string(re.sub(r"<[^>]+>", " ", message)):
        return {"success": False, "message": "Subject and message are required."}, 400

    now = now_utc()
    job_id = create_reference("EMJ")
    job = {
        "job_id": job_id,
        "source": "copy_paste_mode",
        "user_id": user["_id"],
        "account_id": account.get("account_id"),
        "provider": account.get("provider"),
        "from_email": account.get("email_address"),
        "subject": subject,
        "message_body": message,
        "format": fmt,
        "status": "queued",
        "total": len(recipients),
        "queued": len(recipients),
        "sending": 0,
        "sent": 0,
        "failed": 0,
        "current": "",
        "max_workers": 5,
        "message": "Queued for fast background sending.",
        "created_at": now,
        "updated_at": now,
    }
    email_send_jobs().insert_one(job)
    email_send_queue().insert_many([{
        "queue_id": create_reference("EMQ"),
        "job_id": job_id,
        "user_id": user["_id"],
        "account_id": account.get("account_id"),
        "recipient": recipient,
        "subject": subject,
        "message_body": message,
        "format": fmt,
        "status": "queued",
        "attempts": 0,
        "email_log_id": "",
        "error_message": "",
        "created_at": now,
        "updated_at": now,
    } for recipient in recipients])

    app = current_app._get_current_object()
    threading.Thread(target=process_copy_paste_job, args=(app, job_id), daemon=True).start()
    return jsonify({"success": True, "message": "Emails queued for fast background sending.", "job": safe_copy_paste_job(job), "job_id": job_id})


@email_bp.get("/copy-paste/jobs/<job_id>")
@require_auth
def get_copy_paste_job(payload, job_id):
    user, error = require_active_user(payload)
    if error:
        return error
    job = email_send_jobs().find_one({"job_id": clean_string(job_id), "user_id": user["_id"]})
    if not job:
        return {"success": False, "message": "Copy & Paste job not found."}, 404
    return jsonify({"success": True, "job": safe_copy_paste_job(job, include_items=True)})


@email_bp.post("/copy-paste/send")
@require_auth
def send_copy_paste(payload):
    locked = check_service_available("email_sender")
    if locked:
        return locked
    user, error = require_active_user(payload)
    if error:
        return error
    data, attachments, attachment_error = request_data_and_attachments()
    if attachment_error:
        return {"success": False, "message": attachment_error}, 400
    account = account_for_user(user["_id"], clean_string(data.get("account_id") or data.get("accountId") or ""))
    if not account:
        return {"success": False, "message": "Select a connected email account."}, 400
    subject = clean_string(data.get("subject", ""))[:180]
    message = data.get("message", "")
    fmt = "html" if data.get("format") == "html" else "plain"
    recipients = parse_manual_emails(data.get("recipients") or data.get("emails") or "")
    if not recipients:
        return {"success": False, "message": "Add at least one valid recipient."}, 400
    if not subject or not clean_string(re.sub(r"<[^>]+>", " ", message)):
        return {"success": False, "message": "Subject and message are required."}, 400

    sent_logs = []
    failed = []
    for recipient in recipients:
        record = contacts_collection().find_one({"user_id": user["_id"], "email": recipient}) or {"email": recipient}
        refreshed_user = users_collection().find_one({"_id": user["_id"]}) or user
        response, status = send_email_flow(
            refreshed_user,
            account,
            [record],
            subject,
            sanitize_html(message) if fmt == "html" else message,
            fmt,
            "copy_paste",
            attachments,
            description_prefix="Copy & Paste email",
        )
        if response.get("success"):
            for log in response.get("logs", []):
                email_logs().update_one(
                    {"email_id": log.get("email_id")},
                    {"$set": {
                        "source": "copy_paste_mode",
                        "attachment_count": len(attachments),
                        "updated_at": now_utc(),
                    }},
                )
            sent_logs.extend(response.get("logs", []))
        else:
            failed.append({"email": recipient, "error": response.get("message", "Failed")})

    severity = "success" if not failed else "warning"
    create_notification(
        user["_id"], "email", "Copy & Paste send completed",
        f"{len(sent_logs)} email(s) sent, {len(failed)} failed.",
        severity, "email", "", "/user/email-message-logs",
        {"source": "copy_paste_mode", "sent": len(sent_logs), "failed": len(failed)},
    )
    final_user = users_collection().find_one({"_id": user["_id"]}) or user
    return jsonify({
        "success": True,
        "message": f"Copy & Paste send completed. {len(sent_logs)} sent, {len(failed)} failed.",
        "sent": len(sent_logs),
        "failed_count": len(failed),
        "failed": failed,
        "logs": sent_logs,
        "wallet_balance": to_float(final_user.get("wallet_balance")),
    })


@email_bp.get("/logs")
@require_auth
def get_logs(payload):
    user, error = require_active_user(payload)
    if error:
        return error
    query = {"user_id": user["_id"]}
    status = clean_string(request.args.get("status", ""))
    log_type = clean_string(request.args.get("type", ""))
    date_from = clean_string(request.args.get("date_from", ""))
    date_to = clean_string(request.args.get("date_to", ""))
    if status and status != "all":
        query["status"] = status
    if log_type and log_type != "all":
        query["type"] = log_type
    if date_from or date_to:
        date_query = {}
        if date_from:
            try:
                from datetime import datetime
                date_query["$gte"] = datetime.fromisoformat(date_from)
            except ValueError:
                pass
        if date_to:
            try:
                from datetime import datetime
                date_query["$lt"] = datetime.fromisoformat(date_to)
            except ValueError:
                pass
        if date_query:
            query["created_at"] = date_query
    logs = list(email_logs().find(query).sort("created_at", -1).limit(500))
    return jsonify({"success": True, "logs": [safe_log(log) for log in logs]})


@email_bp.get("/stats")
@require_auth
def get_stats(payload):
    user, error = require_active_user(payload)
    if error:
        return error
    logs = list(email_logs().find({"user_id": user["_id"]}))
    accounts = list(email_accounts().find({"user_id": user["_id"]}))
    sent = [log for log in logs if log.get("status") == "sent"]
    bounced = [log for log in logs if log.get("status") == "bounced"]
    return jsonify({
        "success": True,
        "stats": {
            "total_sent": sum(int(log.get("recipient_count", 0) or 0) for log in sent),
            "failed": sum(1 for log in logs if log.get("status") == "failed"),
            "queued": sum(1 for log in logs if log.get("status") == "queued"),
            "bounced": sum(1 for log in bounced),
            "unknown": sum(1 for log in logs if log.get("status") == "unknown"),
            "spent": round(sum(to_float(log.get("total_cost")) for log in sent), 4),
            "connected_accounts": sum(1 for account in accounts if account.get("status") == "connected"),
            "cost_per_email": get_email_settings()["cost_per_email"],
            "email_enabled": get_email_settings()["email_enabled"],
        },
    })


@email_bp.post("/sync-status")
@require_auth
def sync_status(payload):
    user, error = require_active_user(payload)
    if error:
        return error
    now = now_utc()
    if user.get("last_email_status_sync_at") and user["last_email_status_sync_at"] > now - timedelta(seconds=30):
        return {"success": False, "message": "Please wait before syncing again."}, 429
    users_collection().update_one({"_id": user["_id"]}, {"$set": {"last_email_status_sync_at": now}})
    accounts = list(email_accounts().find({"user_id": user["_id"], "provider": "gmail", "status": "connected"}))
    results = [sync_gmail_bounces_for_account(account) for account in accounts]
    return jsonify({
        "success": True,
        "message": "Email status sync completed.",
        "updated": sum(item.get("updated", 0) for item in results),
        "errors": sum(item.get("errors", 0) for item in results),
        "results": results,
    })


@email_bp.post("/gmail/push")
def gmail_push():
    payload = request.get_json(silent=True) or {}
    email_address = ""
    message = payload.get("message") or {}
    data = message.get("data")
    if data:
        try:
            decoded = json.loads(base64.urlsafe_b64decode(data + "=" * (-len(data) % 4)).decode("utf-8"))
            email_address = clean_string(decoded.get("emailAddress", "")).lower()
        except Exception:
            email_address = ""
    query = {"provider": "gmail", "status": "connected"}
    if email_address:
        query["email_address"] = email_address
    updated = 0
    errors = 0
    for account in email_accounts().find(query).limit(25):
        result = sync_gmail_bounces_for_account(account)
        updated += result.get("updated", 0)
        errors += result.get("errors", 0)
    return jsonify({"success": True, "updated": updated, "errors": errors})


@email_bp.get("/campaigns")
@require_auth
def get_campaigns(payload):
    user, error = require_active_user(payload)
    if error:
        return error
    campaigns = list(email_campaigns().find({"user_id": user["_id"]}).sort("created_at", -1).limit(100))
    return jsonify({"success": True, "campaigns": [{
        "id": c.get("campaign_id"),
        "name": c.get("name", ""),
        "fromEmail": c.get("from_email", ""),
        "recipients": int(c.get("recipient_count", 0) or 0),
        "sent": int(c.get("sent", 0) or 0),
        "failed": int(c.get("failed", 0) or 0),
        "bounced": int(c.get("bounced", 0) or 0),
        "unknown": int(c.get("unknown", 0) or 0),
        "scheduledAt": iso(c.get("created_at")),
        "status": c.get("status", "completed"),
        "subject": c.get("subject", ""),
        "htmlPreview": escape(c.get("message_preview", "")),
    } for c in campaigns]})


def safe_admin_email_campaign(c: dict) -> dict:
    user = users_collection().find_one({"_id": c.get("user_id")}) if c.get("user_id") else None
    sent = int(c.get("sent", 0) or 0)
    failed = int(c.get("failed", 0) or 0)
    recipients = int(c.get("recipient_count", 0) or 0)
    settings = get_email_settings()
    actual_cost = round(sent * to_float(settings.get("cost_per_email"), DEFAULT_EMAIL_COST), 4)
    return {
        "id": c.get("campaign_id") or str(c.get("_id")),
        "name": c.get("name", ""),
        "user": user.get("full_name") or user.get("name") or user.get("email") if user else "Unknown",
        "user_email": user.get("email", "") if user else "",
        "channel": "Email",
        "fromEmail": c.get("from_email", ""),
        "recipients": recipients,
        "sent": sent,
        "delivered": sent,
        "failed": failed,
        "bounced": int(c.get("bounced", 0) or 0),
        "unknown": int(c.get("unknown", 0) or 0),
        "estCost": round(recipients * to_float(settings.get("cost_per_email"), DEFAULT_EMAIL_COST), 4),
        "actualCost": actual_cost,
        "status": c.get("status", "completed"),
        "subject": c.get("subject", ""),
        "created": iso(c.get("created_at")),
        "createdAt": iso(c.get("created_at")),
    }


@admin_email_bp.get("/settings")
@require_admin
def admin_get_settings(payload):
    return jsonify({"success": True, "settings": get_email_settings()})


@admin_email_bp.put("/settings")
@require_admin
def admin_update_settings(payload):
    data = request.get_json(silent=True) or {}
    free_pricing = bool(data.get("free_pricing") or data.get("email_free"))
    cost = 0 if free_pricing else to_float(data.get("cost_per_email"), DEFAULT_EMAIL_COST)
    provider_cost = to_float(data.get("provider_cost_per_email"), 0)
    daily_limit = int(data.get("daily_send_limit_per_user", 1000) or 1000)
    batch_size = int(data.get("bulk_batch_size", DEFAULT_BATCH_SIZE) or DEFAULT_BATCH_SIZE)
    if cost < 0 or provider_cost < 0 or daily_limit <= 0 or batch_size <= 0:
        return {"success": False, "message": "Enter valid email settings."}, 400
    now = now_utc()
    settings = {
        "key": "email_settings",
        "email_enabled": bool(data.get("email_enabled", True)),
        "free_pricing": free_pricing,
        "email_free": free_pricing,
        "cost_per_email": cost,
        "provider_cost_per_email": provider_cost,
        "daily_send_limit_per_user": daily_limit,
        "bulk_batch_size": batch_size,
        "updated_at": now,
    }
    platform_settings().update_one({"key": "email_settings"}, {"$set": settings, "$setOnInsert": {"created_at": now}}, upsert=True)
    return jsonify({"success": True, "message": "Email settings updated.", "settings": get_email_settings()})


@admin_email_bp.get("/logs")
@require_admin
def admin_get_logs(payload):
    logs = list(email_logs().find({}).sort("created_at", -1).limit(250))
    return jsonify({"success": True, "logs": [safe_log(log, admin=True) for log in logs]})


@admin_email_bp.get("/campaigns")
@require_admin
def admin_get_campaigns(payload):
    query = {}
    status = clean_string(request.args.get("status", ""))
    if status and status != "all":
        query["status"] = status
    campaigns = list(email_campaigns().find(query).sort("created_at", -1).limit(500))
    return jsonify({"success": True, "campaigns": [safe_admin_email_campaign(campaign) for campaign in campaigns]})


@admin_email_bp.get("/accounts")
@require_admin
def admin_get_accounts(payload):
    accounts = list(email_accounts().find({}).sort("created_at", -1).limit(250))
    return jsonify({"success": True, "accounts": [safe_account(account, admin=True) for account in accounts]})


@admin_email_bp.get("/stats")
@require_admin
def admin_get_stats(payload):
    logs = list(email_logs().find({}))
    accounts = list(email_accounts().find({}))
    sent_logs = [log for log in logs if log.get("status") == "sent"]
    bounced_logs = [log for log in logs if log.get("status") == "bounced"]
    revenue = sum(to_float(log.get("total_cost")) for log in sent_logs)
    settings = get_email_settings()
    provider_cost = sum(int(log.get("recipient_count", 0) or 0) * settings["provider_cost_per_email"] for log in sent_logs)
    by_user = {}
    for log in sent_logs:
        uid = str(log.get("user_id"))
        by_user[uid] = by_user.get(uid, 0) + int(log.get("recipient_count", 0) or 0)
    usage = []
    for uid, count in sorted(by_user.items(), key=lambda item: item[1], reverse=True)[:10]:
        try:
            user = users_collection().find_one({"_id": ObjectId(uid)})
        except Exception:
            user = None
        usage.append({"user": user.get("full_name") or user.get("email") if user else "Unknown", "emails": count})
    return jsonify({
        "success": True,
        "stats": {
            "total_sent": sum(int(log.get("recipient_count", 0) or 0) for log in sent_logs),
            "failed": sum(1 for log in logs if log.get("status") == "failed"),
            "queued": sum(1 for log in logs if log.get("status") == "queued"),
            "bounced": sum(1 for log in bounced_logs),
            "unknown": sum(1 for log in logs if log.get("status") == "unknown"),
            "bounce_rate": round((len(bounced_logs) / len(sent_logs)) * 100, 2) if sent_logs else 0,
            "revenue": round(revenue, 4),
            "cost": round(provider_cost, 4),
            "profit": round(revenue - provider_cost, 4),
            "connected_accounts": sum(1 for account in accounts if account.get("status") == "connected"),
            "error_accounts": sum(1 for account in accounts if account.get("status") == "error"),
            "usage_by_user": usage,
        },
    })
