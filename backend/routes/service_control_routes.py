from flask import Blueprint, current_app, jsonify, request

from utils.auth import require_admin, require_auth, users_collection
from utils.notifications import create_notification
from utils.security import clean_string, now_utc
from utils.service_control import (
    SERVICE_KEYS,
    admin_activity_logs_collection,
    ensure_service_controls,
    get_service_control,
    log_service_activity,
    normalize_service_key,
    safe_service,
    service_controls_collection,
)


admin_service_control_bp = Blueprint("admin_service_control", __name__, url_prefix="/api/admin/service-control")
service_status_bp = Blueprint("service_status", __name__, url_prefix="/api/service-status")


def admin_from_payload(payload: dict) -> dict:
    user = users_collection().find_one({"_id": payload.get("user_id")}) if payload.get("user_id") else None
    return {
        "admin_id": str(payload.get("user_id") or ""),
        "name": (user or {}).get("name") or payload.get("name") or payload.get("email") or "admin",
        "email": (user or {}).get("email") or payload.get("email") or "",
    }


def apply_service_update(service_key: str, data: dict, admin: dict, explicit_status: str | None = None):
    key = normalize_service_key(service_key)
    if key not in SERVICE_KEYS:
        return None, ({"success": False, "message": "Invalid service key."}, 404)

    ensure_service_controls()
    current = service_controls_collection().find_one({"service_key": key})
    if not current:
        return None, ({"success": False, "message": "Service not found."}, 404)

    old_status = current.get("status", "available")
    requested_status = explicit_status or clean_string(data.get("status") or "")
    if not requested_status and "isEnabled" in data:
        requested_status = "available" if data.get("isEnabled") else "locked"
    status = requested_status if requested_status in {"available", "locked"} else old_status
    message = clean_string(data.get("unavailable_message") or data.get("unavailableMessage") or current.get("unavailable_message", ""))[:500]
    now = now_utc()

    update = {
        "status": status,
        "unavailable_message": message,
        "updated_by_admin_id": admin["admin_id"],
        "updated_by_admin_name": admin["name"],
        "updated_at": now,
    }
    if status == "locked" and old_status != "locked":
        update.update({
            "locked_by_admin_id": admin["admin_id"],
            "locked_by_admin_name": admin["name"],
            "locked_at": now,
        })
    if status == "available" and old_status != "available":
        update["unlocked_at"] = now

    service_controls_collection().update_one({"service_key": key}, {"$set": update})
    updated = service_controls_collection().find_one({"service_key": key})

    action = "service_message_updated"
    if old_status != status:
        action = "service_locked" if status == "locked" else "service_unlocked"
    log_service_activity(admin, action, updated, old_status, status, message)
    create_notification(
        admin["admin_id"], "system",
        "Service locked" if status == "locked" else "Service unlocked" if old_status != status else "Service message updated",
        f"{updated.get('service_name')} is now {status}.",
        "warning" if status == "locked" else "success",
        "service_control", key, "/admin/service-control",
        {"service_key": key, "status": status},
    )
    return updated, None


@admin_service_control_bp.get("")
@require_admin
def list_service_controls(payload):
    ensure_service_controls()
    services = list(service_controls_collection().find({}).sort("service_name", 1))
    logs = list(admin_activity_logs_collection().find({"action": {"$in": ["service_locked", "service_unlocked", "service_message_updated"]}}).sort("created_at", -1).limit(100))
    return jsonify({
        "success": True,
        "services": [safe_service(service) for service in services],
        "activity_logs": [{
            "id": str(log.get("_id")),
            "adminId": str(log.get("admin_id", "")),
            "adminName": log.get("admin_name", "admin"),
            "action": log.get("action", ""),
            "serviceKey": log.get("service_key", ""),
            "serviceName": log.get("service_name", ""),
            "oldStatus": log.get("old_status"),
            "newStatus": log.get("new_status"),
            "message": log.get("message", ""),
            "createdAt": log.get("created_at").isoformat() if log.get("created_at") else None,
        } for log in logs],
    })


@admin_service_control_bp.get("/<service_key>")
@require_admin
def get_admin_service(payload, service_key):
    service = get_service_control(service_key)
    if not service:
        return {"success": False, "message": "Service not found."}, 404
    return jsonify({"success": True, "service": safe_service(service)})


@admin_service_control_bp.put("/<service_key>")
@require_admin
def update_admin_service(payload, service_key):
    service, error = apply_service_update(service_key, request.get_json(silent=True) or {}, admin_from_payload(payload))
    if error:
        return error
    return jsonify({"success": True, "message": "Service updated.", "service": safe_service(service)})


@admin_service_control_bp.post("/<service_key>/lock")
@require_admin
def lock_admin_service(payload, service_key):
    service, error = apply_service_update(service_key, request.get_json(silent=True) or {}, admin_from_payload(payload), "locked")
    if error:
        return error
    return jsonify({"success": True, "message": "Service locked.", "service": safe_service(service)})


@admin_service_control_bp.post("/<service_key>/unlock")
@require_admin
def unlock_admin_service(payload, service_key):
    service, error = apply_service_update(service_key, request.get_json(silent=True) or {}, admin_from_payload(payload), "available")
    if error:
        return error
    return jsonify({"success": True, "message": "Service unlocked.", "service": safe_service(service)})


@admin_service_control_bp.post("/bulk-update")
@require_admin
def bulk_update_services(payload):
    admin = admin_from_payload(payload)
    data = request.get_json(silent=True) or {}
    results = []
    for item in data.get("services", []):
        service, error = apply_service_update(item.get("service_key") or item.get("key"), item, admin)
        if not error:
            results.append(safe_service(service))
    return jsonify({"success": True, "services": results})


@service_status_bp.get("")
def public_service_status():
    ensure_service_controls()
    services = list(service_controls_collection().find({}).sort("service_name", 1))
    return jsonify({"success": True, "services": [safe_service(service) for service in services]})


@service_status_bp.get("/<service_key>")
def public_single_service_status(service_key):
    service = get_service_control(service_key)
    if not service:
        return {"success": False, "message": "Service not found."}, 404
    return jsonify({"success": True, "service": safe_service(service)})
