import re
from datetime import timedelta

from bson import ObjectId
from flask import current_app

from services.sms_provider_service import SmsProviderError, get_sms_provider_by_name, normalize_sms_settings
from utils.security import clean_string, now_utc


MAX_SENDER_ID_LENGTH = 11
SENDER_ID_RE = re.compile(r"^[A-Za-z0-9 ]{1,11}$")
RESERVED_NORMALIZED = {"VIRESEND", "VIRESENDER", "ADMIN", "SUPPORT"}
CUSTOMER_REFRESH_COOLDOWN_SECONDS = 60


class SenderIdError(Exception):
    def __init__(self, code: str, message: str, status_code: int = 400):
        super().__init__(message)
        self.code = code
        self.message = message
        self.status_code = status_code


def sender_ids_collection():
    return current_app.config["DB"].sms_sender_ids


def audit_collection():
    return current_app.config["DB"].sms_sender_id_audit_logs


def unlinked_collection():
    return current_app.config["DB"].moolre_unlinked_sender_ids


def normalize_sender_id(value: str) -> str:
    return re.sub(r"\s+", " ", clean_string(value or "")).strip().upper()


def display_sender_id(value: str) -> str:
    return re.sub(r"\s+", " ", clean_string(value or "")).strip()


def validate_sender_id(value: str) -> str:
    sender_id = display_sender_id(value)
    if not sender_id:
        raise SenderIdError("sender_id_required", "Sender ID is required.")
    if len(sender_id) > MAX_SENDER_ID_LENGTH:
        raise SenderIdError("sender_id_too_long", "Sender ID must be 11 characters or fewer.")
    if not SENDER_ID_RE.match(sender_id):
        raise SenderIdError("sender_id_invalid", "Sender ID may contain only letters, numbers, and spaces.")
    if normalize_sender_id(sender_id).replace(" ", "") in RESERVED_NORMALIZED:
        raise SenderIdError("sender_id_reserved", "This Sender ID is reserved.")
    return sender_id


def provider_status_to_local(approval: str | None) -> str:
    value = clean_string(approval or "").lower()
    if value == "approved":
        return "approved"
    if value == "pending":
        return "pending"
    if value == "rejected":
        return "rejected"
    return "status_unknown"


def safe_sender_record(record: dict) -> dict:
    return {
        "id": str(record.get("_id")),
        "user_id": str(record.get("user_id")) if record.get("user_id") else None,
        "sender_id": record.get("sender_id", ""),
        "normalized_sender_id": record.get("normalized_sender_id", ""),
        "provider": record.get("provider", "arkesel"),
        "status": record.get("status", "approved" if record.get("provider") != "moolre" else "pending"),
        "provider_sender_id": record.get("provider_sender_id"),
        "provider_approval": record.get("provider_approval", ""),
        "provider_code": record.get("provider_code", ""),
        "provider_message": record.get("provider_message", ""),
        "whitelisted": bool(record.get("whitelisted", False)),
        "enabled": record.get("enabled", True) is not False,
        "provider_sync_status": record.get("provider_sync_status", ""),
        "rejection_reason": record.get("rejection_reason", ""),
        "can_send": record.get("status") == "approved" and record.get("enabled", True) is not False,
        "submitted_at": iso(record.get("submitted_at")),
        "approved_at": iso(record.get("approved_at")),
        "rejected_at": iso(record.get("rejected_at")),
        "last_status_check_at": iso(record.get("last_status_check_at")),
        "last_sync_at": iso(record.get("last_sync_at")),
        "created_at": iso(record.get("created_at")),
        "updated_at": iso(record.get("updated_at")),
    }


def safe_unlinked_record(record: dict) -> dict:
    return {
        "id": str(record.get("_id")),
        "provider_sender_id": record.get("provider_sender_id"),
        "sender_id": record.get("sender_id", ""),
        "normalized_sender_id": record.get("normalized_sender_id", ""),
        "provider_approval": record.get("provider_approval", ""),
        "status": record.get("status", "unlinked"),
        "whitelisted": bool(record.get("whitelisted", False)),
        "last_sync_at": iso(record.get("last_sync_at")),
    }


def iso(value):
    return value.isoformat() if value else None


def audit(action: str, actor_id=None, user_id=None, sender_id="", old_status="", new_status="", provider_code="", metadata=None):
    safe_metadata = dict(metadata or {})
    for key in ("vas_key", "headers", "X-API-VASKEY"):
        safe_metadata.pop(key, None)
    audit_collection().insert_one({
        "action": action,
        "actor_id": str(actor_id) if actor_id else None,
        "user_id": str(user_id) if user_id else None,
        "sender_id": sender_id,
        "old_status": old_status,
        "new_status": new_status,
        "provider": "moolre",
        "provider_code": provider_code,
        "metadata": safe_metadata,
        "created_at": now_utc(),
    })


def _moolre_provider():
    settings = normalize_sms_settings(include_secret=True)
    if not settings.get("moolre_vas_key"):
        raise SenderIdError("moolre_not_configured", "Moolre SMS provider is not configured.")
    return get_sms_provider_by_name("moolre", settings)


def submit_sender_id(user: dict, value: str, actor_id=None) -> dict:
    sender_id = validate_sender_id(value)
    normalized = normalize_sender_id(sender_id)
    existing = sender_ids_collection().find_one({
        "normalized_sender_id": normalized,
        "provider": "moolre",
        "status": {"$nin": ["rejected", "submission_failed"]},
    })
    if existing:
        if existing.get("user_id") == user.get("_id"):
            raise SenderIdError("duplicate_sender_id", "This Sender ID has already been submitted.")
        raise SenderIdError("sender_id_owned_by_another_user", "This Sender ID is already registered by another customer.")

    now = now_utc()
    record = {
        "user_id": user["_id"],
        "sender_id": sender_id,
        "normalized_sender_id": normalized,
        "provider": "moolre",
        "status": "submitting",
        "provider_sender_id": None,
        "provider_approval": "Pending",
        "provider_code": "",
        "provider_message": "",
        "whitelisted": False,
        "enabled": True,
        "created_at": now,
        "updated_at": now,
    }
    result = sender_ids_collection().insert_one(record)
    record["_id"] = result.inserted_id
    audit("sender_id_created_locally", actor_id or user["_id"], user["_id"], sender_id, "", "submitting")
    try:
        response = _moolre_provider().create_sender_id(sender_id)
    except SmsProviderError as exc:
        update = {
            "status": "submission_failed",
            "provider_code": exc.code,
            "provider_message": exc.message,
            "provider_response": exc.raw,
            "updated_at": now_utc(),
        }
        sender_ids_collection().update_one({"_id": record["_id"]}, {"$set": update})
        audit("sender_id_submission_failed", actor_id or user["_id"], user["_id"], sender_id, "submitting", "submission_failed", exc.code)
        record.update(update)
        return safe_sender_record(record)

    update = {
        "status": "pending",
        "provider_code": response.get("provider_code", ""),
        "provider_message": response.get("provider_message", ""),
        "provider_response": response.get("provider_response", {}),
        "submitted_at": now_utc(),
        "updated_at": now_utc(),
    }
    sender_ids_collection().update_one({"_id": record["_id"]}, {"$set": update})
    audit("sender_id_submission_succeeded", actor_id or user["_id"], user["_id"], sender_id, "submitting", "pending", response.get("provider_code", ""))
    record.update(update)
    return safe_sender_record(record)


def apply_provider_status(record: dict, provider_item: dict, sync_field="last_status_check_at", actor_id=None) -> dict:
    old_status = record.get("status", "pending")
    approval = clean_string(provider_item.get("approval", ""))
    new_status = provider_status_to_local(approval)
    now = now_utc()
    update = {
        "provider_sender_id": provider_item.get("id", record.get("provider_sender_id")),
        "provider_approval": approval or record.get("provider_approval", ""),
        "whitelisted": bool(provider_item.get("whitelisted", record.get("whitelisted", False))),
        "status": new_status,
        sync_field: now,
        "updated_at": now,
        "provider_sync_status": "matched",
    }
    if provider_item.get("code"):
        update["provider_code"] = provider_item.get("code")
    if provider_item.get("message"):
        update["provider_message"] = provider_item.get("message")
    if new_status == "approved" and old_status != "approved":
        update["approved_at"] = now
        update["rejected_at"] = None
    if new_status == "rejected" and old_status != "rejected":
        update["rejected_at"] = now
        update["rejection_reason"] = update.get("provider_message", "Rejected by provider.")
    sender_ids_collection().update_one({"_id": record["_id"]}, {"$set": update})
    if old_status != new_status:
        audit("sender_id_status_changed", actor_id, record.get("user_id"), record.get("sender_id", ""), old_status, new_status, update.get("provider_code", ""))
    return safe_sender_record({**record, **update})


def refresh_sender_id(record_id: str, user: dict | None = None, actor_id=None, enforce_cooldown=False) -> dict:
    try:
        oid = ObjectId(record_id)
    except Exception as exc:
        raise SenderIdError("invalid_sender_id_record", "Invalid Sender ID record.") from exc
    query = {"_id": oid, "provider": "moolre"}
    if user:
        query["user_id"] = user["_id"]
    record = sender_ids_collection().find_one(query)
    if not record:
        raise SenderIdError("sender_id_not_found", "Sender ID record not found.", 404)
    if enforce_cooldown and record.get("last_status_check_at"):
        if now_utc() - record["last_status_check_at"] < timedelta(seconds=CUSTOMER_REFRESH_COOLDOWN_SECONDS):
            raise SenderIdError("refresh_throttled", "Please wait before refreshing this Sender ID again.", 429)
    try:
        response = _moolre_provider().check_sender_id_status(record["sender_id"])
    except SmsProviderError as exc:
        update = {"status": "status_unknown", "provider_code": exc.code, "provider_message": exc.message, "last_status_check_at": now_utc(), "updated_at": now_utc()}
        sender_ids_collection().update_one({"_id": record["_id"]}, {"$set": update})
        audit("sender_id_status_check_failed", actor_id or (user or {}).get("_id"), record.get("user_id"), record.get("sender_id", ""), record.get("status", ""), "status_unknown", exc.code)
        return safe_sender_record({**record, **update})
    item = response.get("data") or {}
    item["code"] = response.get("provider_code")
    item["message"] = response.get("provider_message")
    return apply_provider_status(record, item, "last_status_check_at", actor_id or (user or {}).get("_id"))


def list_user_sender_ids(user: dict) -> list[dict]:
    records = sender_ids_collection().find({"user_id": user["_id"], "provider": "moolre"}).sort("created_at", -1)
    return [safe_sender_record(record) for record in records]


def approved_sender_ids_for_user(user_id) -> list[str]:
    rows = sender_ids_collection().find({
        "$or": [{"user_id": user_id}, {"platform_shared": True}],
        "provider": "moolre",
        "status": "approved",
        "enabled": {"$ne": False},
    }).sort("sender_id", 1)
    return [row.get("sender_id", "") for row in rows if row.get("sender_id")]


def enforce_approved_moolre_sender_id(user_id, sender_id: str) -> dict:
    normalized = normalize_sender_id(sender_id)
    record = sender_ids_collection().find_one({
        "normalized_sender_id": normalized,
        "provider": "moolre",
        "$or": [{"user_id": user_id}, {"platform_shared": True}],
    })
    if not record:
        raise SenderIdError("sender_id_not_registered", "Register this Sender ID before sending through Moolre.")
    if record.get("enabled", True) is False:
        raise SenderIdError("sender_id_disabled", "This Sender ID is not available for sending.")
    status = record.get("status", "pending")
    if status == "approved":
        return record
    if status == "pending":
        raise SenderIdError("sender_id_pending", "This Sender ID is still pending approval.")
    if status == "rejected":
        raise SenderIdError("sender_id_rejected", "This Sender ID was rejected and cannot be used.")
    raise SenderIdError("sender_id_not_approved", "Your Sender ID has not yet been approved for Moolre.")


def sync_all_sender_ids(actor_id=None) -> dict:
    result = _moolre_provider().list_sender_ids()
    provider_items = result.get("sender_ids", [])
    matched = 0
    unlinked = 0
    seen = set()
    for item in provider_items:
        sender_id = clean_string(item.get("senderid", ""))
        normalized = normalize_sender_id(sender_id)
        if not normalized:
            continue
        seen.add(normalized)
        record = sender_ids_collection().find_one({"normalized_sender_id": normalized, "provider": "moolre"})
        if record:
            apply_provider_status(record, item, "last_sync_at", actor_id)
            matched += 1
        else:
            unlinked_collection().update_one(
                {"normalized_sender_id": normalized, "provider": "moolre"},
                {"$set": {
                    "provider": "moolre",
                    "provider_sender_id": item.get("id"),
                    "sender_id": sender_id,
                    "normalized_sender_id": normalized,
                    "provider_approval": item.get("approval", ""),
                    "whitelisted": bool(item.get("whitelisted", False)),
                    "status": "unlinked",
                    "last_sync_at": now_utc(),
                    "updated_at": now_utc(),
                }, "$setOnInsert": {"created_at": now_utc()}},
                upsert=True,
            )
            unlinked += 1
    missing = 0
    for record in sender_ids_collection().find({"provider": "moolre", "status": {"$in": ["pending", "approved"]}}):
        if record.get("normalized_sender_id") not in seen:
            sender_ids_collection().update_one({"_id": record["_id"]}, {"$set": {"provider_sync_status": "not_found", "last_sync_at": now_utc(), "updated_at": now_utc()}})
            missing += 1
    audit("sender_id_sync_all", actor_id, None, "", "", "", result.get("provider_response", {}).get("code", ""), {"matched": matched, "unlinked": unlinked, "missing": missing})
    return {"success": True, "matched": matched, "unlinked": unlinked, "missing": missing, "provider_count": len(provider_items)}


def admin_sender_ids(status="all") -> dict:
    query = {"provider": "moolre"}
    if status and status not in {"all", "unlinked"}:
        query["status"] = status
    records = list(sender_ids_collection().find(query).sort("created_at", -1).limit(500)) if status != "unlinked" else []
    unlinked = list(unlinked_collection().find({"provider": "moolre"}).sort("last_sync_at", -1).limit(500)) if status in {"all", "unlinked"} else []
    return {"sender_ids": [safe_sender_record(record) for record in records], "unlinked": [safe_unlinked_record(record) for record in unlinked]}
