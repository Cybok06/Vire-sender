import secrets

from bson import ObjectId
from flask import current_app

from utils.security import clean_string, now_utc

VALID_TYPES = {"sms", "email", "wallet", "api", "contacts", "templates", "otp", "system", "support"}
VALID_SEVERITIES = {"info", "success", "warning", "error"}


def notifications_collection():
    return current_app.config["DB"].notifications


def notification_id():
    return f"NTF-{now_utc().strftime('%Y%m%d%H%M%S')}-{secrets.token_hex(3).upper()}"


def normalize_user_id(user_id):
    if isinstance(user_id, ObjectId):
        return user_id
    try:
        return ObjectId(str(user_id))
    except Exception:
        return user_id


def create_notification(user_id, type, title, message, severity="info", related_module="", related_id="", action_url="", metadata=None):
    if not user_id:
        return None
    notif_type = clean_string(type or "system").lower()
    if notif_type not in VALID_TYPES:
        notif_type = "system"
    level = clean_string(severity or "info").lower()
    if level not in VALID_SEVERITIES:
        level = "info"

    now = now_utc()
    doc = {
        "notification_id": notification_id(),
        "user_id": normalize_user_id(user_id),
        "type": notif_type,
        "title": clean_string(title or "")[:160],
        "message": clean_string(message or "")[:500],
        "status": "unread",
        "severity": level,
        "related_module": clean_string(related_module or "")[:80],
        "related_id": clean_string(str(related_id or ""))[:120],
        "action_url": clean_string(action_url or "")[:240],
        "metadata": metadata if isinstance(metadata, dict) else {},
        "created_at": now,
        "read_at": None,
    }
    if not doc["title"] or not doc["message"]:
        return None
    notifications_collection().insert_one(doc)
    return doc
