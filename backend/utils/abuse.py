import secrets
from datetime import timedelta

from bson import ObjectId
from flask import current_app

from utils.notifications import create_notification
from utils.security import clean_string, now_utc


DEFAULT_SETTINGS = {
    "max_sms_per_day_per_user": 1000,
    "max_email_per_day_per_user": 1000,
    "max_api_calls_per_day_per_user": 2000,
    "max_failed_sms_per_day": 100,
    "max_failed_email_per_day": 100,
    "max_api_failure_rate_percent": 50,
    "max_campaign_failure_rate_percent": 50,
    "max_widget_failures_per_day": 50,
    "auto_pause_campaigns": True,
    "auto_limit_api_on_high_failure": True,
    "auto_suspend_on_extreme_abuse": False,
    "blocked_keywords": ["win $", "click here", "free money", "limited offer", "act now", "urgent!!!"],
    "blocked_keyword_mode": "block",
}


def db():
    return current_app.config["DB"]


def abuse_settings():
    existing = db().abuse_settings.find_one({})
    if existing:
        settings = {**DEFAULT_SETTINGS, **existing}
        return settings
    doc = {**DEFAULT_SETTINGS, "created_at": now_utc(), "updated_at": now_utc()}
    db().abuse_settings.insert_one(doc)
    return doc


def event_id():
    return f"ABU-{now_utc().strftime('%Y%m%d%H%M%S')}-{secrets.token_hex(3).upper()}"


def safe_user(user):
    return {
        "id": str(user.get("_id", "")),
        "name": user.get("full_name") or user.get("name") or user.get("email") or "Unknown",
        "email": user.get("email", ""),
        "status": user.get("account_status") or user.get("status") or "active",
    }


def admin_ids():
    return [admin["_id"] for admin in db().users.find({"role": "admin"}, {"_id": 1})]


def notify_admins(title, message, severity="warning", metadata=None):
    for admin_id in admin_ids():
        create_notification(admin_id, "system", title, message, severity, "abuse", "", "/admin/abuse", metadata or {})


def record_event(user_id, type, severity, module, title, description, evidence=None):
    try:
        oid = user_id if isinstance(user_id, ObjectId) else ObjectId(str(user_id))
    except Exception:
        oid = user_id
    user = db().users.find_one({"_id": oid}) or {}
    now = now_utc()
    existing = db().abuse_events.find_one({
        "user_id": oid,
        "type": type,
        "module": module,
        "status": "open",
        "title": title,
        "created_at": {"$gte": now - timedelta(hours=24)},
    })
    if existing:
        return existing
    doc = {
        "event_id": event_id(),
        "user_id": oid,
        "user_name": safe_user(user)["name"],
        "user_email": safe_user(user)["email"],
        "type": type,
        "severity": severity,
        "module": module,
        "title": clean_string(title)[:180],
        "description": clean_string(description)[:1000],
        "evidence": evidence or {},
        "status": "open",
        "action_taken": "",
        "created_at": now,
        "updated_at": now,
    }
    db().abuse_events.insert_one(doc)
    notify_admins(title, description, "error" if severity in {"high", "critical"} else "warning", {"event_id": doc["event_id"], "module": module})
    return doc


def message_contains_blocked_keyword(message):
    settings = abuse_settings()
    lower = (message or "").lower()
    for keyword in settings.get("blocked_keywords", []):
        kw = clean_string(keyword).lower()
        if kw and kw in lower:
            return keyword
    return ""


def abuse_check_message(message, user_id, module):
    keyword = message_contains_blocked_keyword(message)
    if not keyword:
        return None
    settings = abuse_settings()
    record_event(
        user_id, "blocked_keyword", "high", module,
        "Blocked keyword detected",
        f"Message contains restricted content: {keyword}",
        {"keyword": keyword, "mode": settings.get("blocked_keyword_mode", "block")},
    )
    if settings.get("blocked_keyword_mode", "block") == "block":
        return {
            "success": False,
            "message": "This message contains restricted content and requires review.",
            "error": "This message contains restricted content and requires review.",
            "code": "BLOCKED_KEYWORD",
        }, 400
    return None


def abuse_check_user_allowed(user, module):
    status = user.get("account_status") or user.get("status") or "active"
    if status == "suspended":
        return {"success": False, "message": "Your account has been suspended. Please contact support.", "code": "ACCOUNT_SUSPENDED"}, 403
    return None


def today_range():
    now = now_utc()
    start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    return start, now
