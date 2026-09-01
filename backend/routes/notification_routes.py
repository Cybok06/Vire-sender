from bson import ObjectId
from flask import Blueprint, jsonify, request

from utils.auth import require_auth
from utils.notifications import VALID_TYPES, notifications_collection
from utils.security import clean_string, now_utc

notifications_bp = Blueprint("notifications", __name__, url_prefix="/api/notifications")


def iso(value):
    return value.isoformat() if value else None


def current_user_id(payload):
    try:
        return ObjectId(payload.get("user_id") or payload.get("sub"))
    except Exception:
        return payload.get("user_id") or payload.get("sub")


def safe_notification(item):
    return {
        "id": item.get("notification_id") or str(item.get("_id")),
        "notification_id": item.get("notification_id") or str(item.get("_id")),
        "user_id": str(item.get("user_id")) if item.get("user_id") else "",
        "type": item.get("type", "system"),
        "title": item.get("title", ""),
        "message": item.get("message", ""),
        "status": item.get("status", "unread"),
        "severity": item.get("severity", "info"),
        "related_module": item.get("related_module", ""),
        "related_id": item.get("related_id", ""),
        "action_url": item.get("action_url", ""),
        "metadata": item.get("metadata", {}),
        "is_read": item.get("status") == "read",
        "created_at": iso(item.get("created_at")),
        "read_at": iso(item.get("read_at")),
    }


def notification_query(user_id):
    query = {"user_id": user_id}
    notif_type = clean_string(request.args.get("type", "")).lower()
    status = clean_string(request.args.get("status", "")).lower()
    search = clean_string(request.args.get("search", ""))
    if notif_type in VALID_TYPES:
        query["type"] = notif_type
    if status in {"read", "unread"}:
        query["status"] = status
    if search:
        query["$or"] = [
            {"title": {"$regex": search, "$options": "i"}},
            {"message": {"$regex": search, "$options": "i"}},
            {"related_module": {"$regex": search, "$options": "i"}},
        ]
    return query


@notifications_bp.get("")
@require_auth
def list_notifications(payload):
    user_id = current_user_id(payload)
    page = max(1, int(request.args.get("page", "1") or 1))
    limit = min(100, max(1, int(request.args.get("limit", "50") or 50)))
    query = notification_query(user_id)
    total = notifications_collection().count_documents(query)
    items = notifications_collection().find(query).sort("created_at", -1).skip((page - 1) * limit).limit(limit)
    return jsonify({
        "success": True,
        "notifications": [safe_notification(item) for item in items],
        "pagination": {"page": page, "limit": limit, "total": total},
    })


@notifications_bp.get("/stats")
@require_auth
def notification_stats(payload):
    user_id = current_user_id(payload)
    items = list(notifications_collection().find({"user_id": user_id}, {"type": 1, "status": 1}))
    by_type = {key: 0 for key in ["sms", "email", "wallet", "api", "contacts", "templates", "otp", "system", "support"]}
    for item in items:
        notif_type = item.get("type", "system")
        if notif_type in by_type:
            by_type[notif_type] += 1
    unread = sum(1 for item in items if item.get("status") == "unread")
    return jsonify({"success": True, "stats": {
        "total": len(items),
        "unread": unread,
        "read": len(items) - unread,
        "by_type": by_type,
    }})


@notifications_bp.post("/<notification_id>/read")
@require_auth
def mark_read(payload, notification_id):
    user_id = current_user_id(payload)
    result = notifications_collection().update_one(
        {"user_id": user_id, "notification_id": clean_string(notification_id)},
        {"$set": {"status": "read", "read_at": now_utc()}},
    )
    if not result.matched_count:
        return {"success": False, "message": "Notification not found."}, 404
    return jsonify({"success": True, "message": "Notification marked as read."})


@notifications_bp.post("/mark-all-read")
@require_auth
def mark_all_read(payload):
    user_id = current_user_id(payload)
    notifications_collection().update_many(
        {"user_id": user_id, "status": "unread"},
        {"$set": {"status": "read", "read_at": now_utc()}},
    )
    return jsonify({"success": True, "message": "All notifications marked as read."})


@notifications_bp.delete("/<notification_id>")
@require_auth
def delete_notification(payload, notification_id):
    user_id = current_user_id(payload)
    result = notifications_collection().delete_one({"user_id": user_id, "notification_id": clean_string(notification_id)})
    if not result.deleted_count:
        return {"success": False, "message": "Notification not found."}, 404
    return jsonify({"success": True, "message": "Notification deleted."})


@notifications_bp.delete("/clear-read")
@require_auth
def clear_read(payload):
    user_id = current_user_id(payload)
    result = notifications_collection().delete_many({"user_id": user_id, "status": "read"})
    return jsonify({"success": True, "message": "Read notifications cleared.", "deleted": result.deleted_count})
