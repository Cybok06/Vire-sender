from datetime import datetime

from flask import current_app

from utils.security import clean_string, now_utc


SERVICE_DEFINITIONS = [
    ("otp_virtual_numbers", "OTP / Virtual Numbers", "Purchase virtual phone numbers and receive OTP codes for service verification.", "OTP and Virtual Numbers are temporarily unavailable due to provider maintenance. Please try again later."),
    ("sms_sender", "SMS Sender", "Send individual SMS messages to any phone number worldwide.", "SMS sending is temporarily unavailable due to provider maintenance. Please try again later."),
    ("sms_campaigns", "Bulk SMS Campaigns", "Create and manage bulk SMS campaigns to large contact lists.", "SMS Campaigns are temporarily unavailable. We are working to restore this service shortly."),
    ("email_sender", "Email Sender", "Send individual emails using Gmail or SMTP accounts.", "Email sending is temporarily unavailable due to scheduled maintenance. Please try again later."),
    ("email_campaigns", "Bulk Email Campaigns", "Create and launch bulk email campaigns with custom templates.", "Email Campaigns are temporarily unavailable. We apologize for the inconvenience."),
    ("developer_api", "Developer API", "Programmatic SMS access via VireSend APIs.", "The Developer API is temporarily unavailable. Our engineering team is working on a fix."),
    ("embed_widgets", "Embed Widgets", "Embeddable SMS and email widgets for third-party websites.", "Embed Widgets are temporarily unavailable. Please check back soon."),
    ("buy_contacts", "Buy Contacts / Contact Marketplace", "Buy curated marketplace contact groups.", "Contact Marketplace is temporarily unavailable. Please try again later."),
    ("wallet_topup", "Wallet Top Up", "Add funds to your VireSend wallet.", "Wallet top up is temporarily paused. Existing balances remain available."),
    ("templates", "Templates", "Create and reuse SMS and email message templates.", "Templates are temporarily unavailable. Please try again later."),
    ("complaints_support", "Complaints / Support", "Create and manage support tickets.", "Support is temporarily unavailable. Please try again later."),
]

SERVICE_KEYS = {item[0] for item in SERVICE_DEFINITIONS}
SERVICE_ALIASES = {
    "otp_numbers": "otp_virtual_numbers",
    "wallet_deposits": "wallet_topup",
}


def normalize_service_key(service_key: str) -> str:
    key = clean_string(service_key or "")
    return SERVICE_ALIASES.get(key, key)


def service_controls_collection():
    return current_app.config["DB"].service_controls


def admin_activity_logs_collection():
    return current_app.config["DB"].admin_activity_logs


def default_service_doc(definition):
    key, name, description, message = definition
    now = now_utc()
    return {
        "service_key": key,
        "service_name": name,
        "description": description,
        "status": "available",
        "unavailable_message": message,
        "locked_by_admin_id": "",
        "locked_by_admin_name": "",
        "locked_at": None,
        "unlocked_at": now,
        "updated_by_admin_id": "",
        "updated_by_admin_name": "system",
        "updated_at": now,
        "created_at": now,
    }


def ensure_service_controls():
    collection = service_controls_collection()
    for definition in SERVICE_DEFINITIONS:
        key = definition[0]
        if not collection.find_one({"service_key": key}):
            collection.insert_one(default_service_doc(definition))


def safe_service(service: dict) -> dict:
    return {
        "service_key": service.get("service_key", ""),
        "key": service.get("service_key", ""),
        "service_name": service.get("service_name", ""),
        "name": service.get("service_name", ""),
        "description": service.get("description", ""),
        "status": service.get("status", "available"),
        "isEnabled": service.get("status", "available") != "locked",
        "unavailable_message": service.get("unavailable_message", ""),
        "unavailableMessage": service.get("unavailable_message", ""),
        "locked_by_admin_id": str(service.get("locked_by_admin_id", "") or ""),
        "locked_by_admin_name": service.get("locked_by_admin_name", ""),
        "locked_at": service.get("locked_at").isoformat() if service.get("locked_at") else None,
        "unlocked_at": service.get("unlocked_at").isoformat() if service.get("unlocked_at") else None,
        "updated_by_admin_id": str(service.get("updated_by_admin_id", "") or ""),
        "updated_by_admin_name": service.get("updated_by_admin_name", ""),
        "updatedBy": service.get("updated_by_admin_name", ""),
        "updated_at": service.get("updated_at").isoformat() if service.get("updated_at") else None,
        "updatedAt": service.get("updated_at").isoformat() if service.get("updated_at") else None,
        "created_at": service.get("created_at").isoformat() if service.get("created_at") else None,
    }


def get_service_control(service_key: str) -> dict | None:
    key = normalize_service_key(service_key)
    if key not in SERVICE_KEYS:
        return None
    ensure_service_controls()
    return service_controls_collection().find_one({"service_key": key})


def service_locked_response(service_key: str):
    service = get_service_control(service_key)
    if not service or service.get("status") != "locked":
        return None
    message = service.get("unavailable_message") or "This service is temporarily unavailable."
    return {
        "success": False,
        "error": message,
        "message": message,
        "code": "SERVICE_LOCKED",
        "service_key": service.get("service_key"),
    }, 423


def check_service_available(service_key: str):
    return service_locked_response(service_key)


def log_service_activity(admin: dict, action: str, service: dict, old_status: str, new_status: str, message: str = ""):
    admin_activity_logs_collection().insert_one({
        "admin_id": admin.get("admin_id") or admin.get("user_id") or "",
        "admin_name": admin.get("name") or admin.get("email") or "admin",
        "action": action,
        "service_key": service.get("service_key"),
        "service_name": service.get("service_name"),
        "old_status": old_status,
        "new_status": new_status,
        "message": message,
        "created_at": now_utc(),
    })
