import secrets
from datetime import timedelta

from bson import ObjectId
from flask import Blueprint, current_app, jsonify, request

from config import Config
from routes.sms_routes import (
    cost_preview,
    get_sms_settings,
    parse_numbers,
    safe_log,
    sanitize_sender_id,
    send_sms_flow,
    sms_logs,
    to_float,
)
from services.sms_credit_service import sms_credit_balance
from services.moolre_sender_id_service import approved_sender_ids_for_user
from utils.auth import require_admin, require_auth, users_collection
from utils.notifications import create_notification
from utils.security import clean_string, hash_reset_token, now_utc
from utils.service_control import check_service_available
from utils.abuse import abuse_check_message, abuse_check_user_allowed


developer_bp = Blueprint("developer_api", __name__, url_prefix="/api/developer")
admin_developer_bp = Blueprint("admin_developer_api", __name__, url_prefix="/api/admin/developer-api")
public_api_bp = Blueprint("public_sms_api", __name__, url_prefix="/v1")

DEFAULT_RATE_LIMIT_PER_MINUTE = 60
LIMITED_RATE_LIMIT_PER_MINUTE = 10
API_KEY_PREFIX = "vire_sk_live_"


def iso(value):
    return value.isoformat() if value else None


def api_keys():
    return current_app.config["DB"].api_keys


def api_logs():
    return current_app.config["DB"].api_request_logs


def sender_ids_collection():
    return current_app.config["DB"].sms_sender_ids


def platform_settings():
    return current_app.config["DB"].platform_settings


def api_settings():
    settings = platform_settings().find_one({"key": "api_settings"}) or {}
    try:
        rate_limit = int(settings.get("rate_limit_per_minute", DEFAULT_RATE_LIMIT_PER_MINUTE))
    except (TypeError, ValueError):
        rate_limit = DEFAULT_RATE_LIMIT_PER_MINUTE
    return {"rate_limit_per_minute": max(1, rate_limit)}


def generate_api_key():
    token = secrets.token_urlsafe(36).replace("-", "").replace("_", "")[:40]
    return f"{API_KEY_PREFIX}{token}"


def key_hash(value: str):
    return hash_reset_token(value, Config.JWT_SECRET)


def key_prefix(value: str):
    return value[:24]


def masked_key(record: dict | None):
    if not record:
        return ""
    prefix = record.get("api_key_prefix", API_KEY_PREFIX)
    return f"{prefix}{'*' * 18}"


def safe_key(record: dict | None, include_plain: str | None = None):
    if not record:
        return None
    payload = {
        "id": str(record["_id"]),
        "masked_key": masked_key(record),
        "api_key_prefix": record.get("api_key_prefix", ""),
        "status": record.get("status", "active"),
        "total_requests": int(record.get("total_requests", 0) or 0),
        "successful_requests": int(record.get("successful_requests", 0) or 0),
        "failed_requests": int(record.get("failed_requests", 0) or 0),
        "last_used_at": iso(record.get("last_used_at")),
        "created_at": iso(record.get("created_at")),
        "updated_at": iso(record.get("updated_at")),
        "revoked_at": iso(record.get("revoked_at")),
        "delivery_callback_url": record.get("delivery_callback_url", ""),
        "has_webhook_secret": bool(record.get("webhook_secret_hash")),
    }
    if include_plain:
        payload["api_key"] = include_plain
    return payload


def today_start():
    now = now_utc()
    return now.replace(hour=0, minute=0, second=0, microsecond=0)


def request_stats(user_id: ObjectId):
    start = today_start()
    query = {"user_id": user_id}
    today_query = {**query, "created_at": {"$gte": start}}
    wallet_used_today = sum(
        to_float(log.get("cost"))
        for log in api_logs().find({**today_query, "status": "success"}, {"cost": 1})
    )
    recent = list(api_logs().find(query).sort("created_at", -1).limit(200))
    chart = []
    now = now_utc()
    for offset in range(6, -1, -1):
        day = (now - timedelta(days=offset)).replace(hour=0, minute=0, second=0, microsecond=0)
        next_day = day + timedelta(days=1)
        day_query = {**query, "created_at": {"$gte": day, "$lt": next_day}}
        chart.append({
            "day": day.strftime("%b %d"),
            "total": api_logs().count_documents(day_query),
            "success": api_logs().count_documents({**day_query, "status": "success"}),
            "failed": api_logs().count_documents({**day_query, "status": "failed"}),
        })
    return {
        "requests_today": api_logs().count_documents(today_query),
        "successful_today": api_logs().count_documents({**today_query, "status": "success"}),
        "failed_today": api_logs().count_documents({**today_query, "status": "failed"}),
        "wallet_used_today": round(wallet_used_today, 4),
        "chart": chart,
        "logs": [safe_api_log(item) for item in recent],
    }


def safe_api_log(log: dict):
    return {
        "id": str(log.get("_id")),
        "request_id": log.get("request_id"),
        "api_key_prefix": log.get("api_key_prefix", ""),
        "endpoint": log.get("endpoint", ""),
        "method": log.get("method", ""),
        "recipient": log.get("recipient", ""),
        "recipient_count": int(log.get("recipient_count", 0) or 0),
        "sender_id": log.get("sender_id", ""),
        "message_preview": log.get("message_preview", ""),
        "status": log.get("status", "failed"),
        "http_code": int(log.get("http_code", 0) or 0),
        "cost": to_float(log.get("cost")),
        "wallet_before": to_float(log.get("wallet_before")),
        "wallet_after": to_float(log.get("wallet_after")),
        "error_message": log.get("error_message", ""),
        "created_at": iso(log.get("created_at")),
    }


def get_current_user(payload):
    user_id = payload.get("user_id") or payload.get("sub")
    try:
        object_id = ObjectId(user_id)
    except Exception:
        return None
    return users_collection().find_one({"_id": object_id})


def active_key_for_user(user_id: ObjectId):
    return api_keys().find_one({"user_id": user_id, "status": {"$ne": "revoked"}}, sort=[("created_at", -1)])


def create_key_for_user(user_id: ObjectId):
    plain = generate_api_key()
    now = now_utc()
    record = {
        "user_id": user_id,
        "api_key_hash": key_hash(plain),
        "api_key_prefix": key_prefix(plain),
        "status": "active",
        "total_requests": 0,
        "successful_requests": 0,
        "failed_requests": 0,
        "last_used_at": None,
        "created_at": now,
        "updated_at": now,
        "revoked_at": None,
    }
    result = api_keys().insert_one(record)
    record["_id"] = result.inserted_id
    return record, plain


def update_key_counter(record: dict, success: bool):
    api_keys().update_one(
        {"_id": record["_id"]},
        {
            "$inc": {
                "total_requests": 1,
                "successful_requests" if success else "failed_requests": 1,
            },
            "$set": {"last_used_at": now_utc(), "updated_at": now_utc()},
        },
    )


def log_api_request(record: dict | None, user: dict | None, http_code: int, status: str, error_message="", cost=0, wallet_before=0, wallet_after=0, provider_response=None, recipient="", recipient_count=0, sender_id="", message=""):
    log = {
        "request_id": f"REQ-{now_utc().strftime('%Y%m%d%H%M%S')}-{secrets.token_hex(3).upper()}",
        "user_id": user.get("_id") if user else None,
        "api_key_prefix": record.get("api_key_prefix") if record else "",
        "endpoint": request.path,
        "method": request.method,
        "recipient": recipient,
        "recipient_count": recipient_count,
        "sender_id": sender_id,
        "message_preview": (message or "")[:120],
        "status": status,
        "http_code": http_code,
        "cost": cost,
        "wallet_before": wallet_before,
        "wallet_after": wallet_after,
        "ip_address": request.headers.get("X-Forwarded-For", request.remote_addr),
        "user_agent": request.headers.get("User-Agent", ""),
        "error_message": error_message,
        "provider_response": provider_response or {},
        "created_at": now_utc(),
    }
    api_logs().insert_one(log)


def auth_api_key():
    header = request.headers.get("Authorization", "")
    if not header.startswith("Bearer "):
        return None, None, api_error("Invalid or revoked API key", "INVALID_API_KEY", 401)
    provided = header.removeprefix("Bearer ").strip()
    if not provided.startswith(API_KEY_PREFIX):
        return None, None, api_error("Invalid or revoked API key", "INVALID_API_KEY", 401)
    record = api_keys().find_one({"api_key_hash": key_hash(provided)})
    if not record or record.get("status") in {"revoked", "suspended"}:
        return None, None, api_error("Invalid or revoked API key", "INVALID_API_KEY", 401)
    user = users_collection().find_one({"_id": record.get("user_id")})
    if not user or user.get("account_status") != "active":
        return record, user, api_error("Invalid or revoked API key", "INVALID_API_KEY", 401)
    return record, user, None


def rate_limit_error(record: dict):
    limit = LIMITED_RATE_LIMIT_PER_MINUTE if record.get("status") == "limited" else api_settings()["rate_limit_per_minute"]
    since = now_utc() - timedelta(seconds=60)
    used = api_logs().count_documents({"api_key_prefix": record.get("api_key_prefix"), "created_at": {"$gte": since}})
    if used >= limit:
        return api_error("Rate limit exceeded", "RATE_LIMIT_EXCEEDED", 429)
    return None


def api_error(error: str, code: str, status: int):
    return jsonify({"success": False, "error": error, "code": code}), status


def external_send(payload: dict, bulk=False):
    record, user, auth_error = auth_api_key()
    if auth_error:
        return auth_error
    restriction = abuse_check_user_allowed(user, "api")
    if restriction:
        return jsonify(restriction[0]), restriction[1]
    limit_error = rate_limit_error(record)
    if limit_error:
        log_api_request(record, user, 429, "failed", "Rate limit exceeded")
        update_key_counter(record, False)
        return limit_error

    sender_id = sanitize_sender_id(payload.get("sender_id", ""))
    message = clean_string(payload.get("message", ""))
    abuse_error = abuse_check_message(message, user.get("_id"), "api")
    if abuse_error:
        return jsonify(abuse_error[0]), abuse_error[1]
    recipients = parse_numbers(payload.get("recipients") if bulk else payload.get("to"))
    recipient_label = f"{len(recipients)} recipients" if len(recipients) > 1 else (recipients[0] if recipients else "")
    try:
        preview = cost_preview(len(recipients), message, recipients=recipients)
    except Exception as exc:
        message_text = getattr(exc, "message", "SMS sending to this destination is currently unavailable.")
        log_api_request(record, user, 400, "failed", message_text, 0, to_float(user.get("wallet_balance")), to_float(user.get("wallet_balance")), recipient=recipient_label, recipient_count=len(recipients), sender_id=sender_id, message=message)
        update_key_counter(record, False)
        return api_error(message_text, getattr(exc, "code", "DESTINATION_UNAVAILABLE").upper(), getattr(exc, "status_code", 400))
    wallet_before = sms_credit_balance(current_app.config["DB"], user["_id"])

    if not sender_id:
        log_api_request(record, user, 400, "failed", "Invalid sender ID", 0, wallet_before, wallet_before, recipient=recipient_label, recipient_count=len(recipients), sender_id=sender_id, message=message)
        update_key_counter(record, False)
        return api_error("Invalid sender ID", "INVALID_SENDER_ID", 400)
    if not recipients:
        log_api_request(record, user, 400, "failed", "At least one valid recipient is required", 0, wallet_before, wallet_before, recipient=recipient_label, recipient_count=0, sender_id=sender_id, message=message)
        update_key_counter(record, False)
        return api_error("At least one valid recipient is required", "INVALID_RECIPIENT", 400)
    if not message:
        log_api_request(record, user, 400, "failed", "Message is required", 0, wallet_before, wallet_before, recipient=recipient_label, recipient_count=len(recipients), sender_id=sender_id, message=message)
        update_key_counter(record, False)
        return api_error("Message is required", "INVALID_MESSAGE", 400)
    if wallet_before < preview["sms_units"]:
        log_api_request(record, user, 402, "failed", "Insufficient SMS balance", 0, wallet_before, wallet_before, recipient=recipient_label, recipient_count=len(recipients), sender_id=sender_id, message=message)
        update_key_counter(record, False)
        return api_error("Insufficient SMS balance", "INSUFFICIENT_SMS_BALANCE", 402)

    response, status = send_sms_flow(
        user,
        recipients,
        sender_id,
        message,
        "bulk" if bulk else "single",
        wallet_category="api_sms",
        description_prefix="API SMS",
    )
    success = bool(response.get("success"))
    log = response.get("log") or {}
    log_api_request(
        record,
        user,
        status,
        "success" if success else "failed",
        "" if success else response.get("message", "SMS request failed."),
        response.get("preview", {}).get("total_cost", 0) if success else 0,
        response.get("log", {}).get("wallet_before", wallet_before),
        response.get("log", {}).get("wallet_after", wallet_before),
        provider_response=response.get("provider_response"),
        recipient=recipient_label,
        recipient_count=len(recipients),
        sender_id=sender_id,
        message=message,
    )
    update_key_counter(record, success)
    if not success:
        create_notification(
            user["_id"], "api", "API SMS request failed",
            response.get("message", "API SMS request failed."),
            "error", "developer_api", record.get("api_key_prefix", ""), "/user/api-access",
            {"recipient_count": len(recipients)},
        )
        return api_error(response.get("message", "SMS request failed."), "SMS_SEND_FAILED", status)
    create_notification(
        user["_id"], "api", "API SMS request completed",
        f"API SMS request accepted for {len(recipients)} recipient(s).",
        "success", "developer_api", log.get("sms_id", ""), "/user/logs",
        {"recipient_count": len(recipients), "cost": response.get("preview", {}).get("total_cost", 0)},
    )

    return jsonify({
        "success": True,
        "sms_id": log.get("sms_id"),
        "status": "sent",
        "recipient_count": len(recipients),
        "sms_units": response.get("preview", {}).get("sms_units", 0),
        "cost": response.get("preview", {}).get("total_cost", 0),
        "currency": "GHS",
        "sms_balance": response.get("sms_balance", 0),
        "wallet_balance": to_float(user.get("wallet_balance")),
    })


@developer_bp.get("/api-key")
@require_auth
def get_api_key(payload):
    user = get_current_user(payload)
    if not user:
        return {"success": False, "message": "User account not found."}, 404
    record = active_key_for_user(user["_id"])
    return jsonify({"success": True, "api_key": safe_key(record), "stats": request_stats(user["_id"])})


@developer_bp.post("/api-key")
@require_auth
def generate_user_api_key(payload):
    locked = check_service_available("developer_api")
    if locked:
        return locked
    user = get_current_user(payload)
    if not user:
        return {"success": False, "message": "User account not found."}, 404
    existing = active_key_for_user(user["_id"])
    if existing:
        return jsonify({"success": True, "api_key": safe_key(existing), "message": "API key already exists."})
    record, plain = create_key_for_user(user["_id"])
    create_notification(user["_id"], "api", "API key generated", "A Developer SMS API key was generated.", "success", "developer_api", record.get("api_key_prefix", ""), "/user/api-access", {})
    return jsonify({"success": True, "message": "API key generated. Copy it now; it will only be shown once.", "api_key": safe_key(record, plain)})


@developer_bp.post("/api-key/regenerate")
@require_auth
def regenerate_user_api_key(payload):
    locked = check_service_available("developer_api")
    if locked:
        return locked
    user = get_current_user(payload)
    if not user:
        return {"success": False, "message": "User account not found."}, 404
    now = now_utc()
    api_keys().update_many({"user_id": user["_id"], "status": {"$ne": "revoked"}}, {"$set": {"status": "revoked", "revoked_at": now, "updated_at": now}})
    record, plain = create_key_for_user(user["_id"])
    create_notification(user["_id"], "api", "API key regenerated", "Your Developer SMS API key was regenerated.", "warning", "developer_api", record.get("api_key_prefix", ""), "/user/api-access", {})
    return jsonify({"success": True, "message": "API key regenerated. Copy it now; it will only be shown once.", "api_key": safe_key(record, plain)})


@developer_bp.post("/api-key/revoke")
@require_auth
def revoke_user_api_key(payload):
    user = get_current_user(payload)
    if not user:
        return {"success": False, "message": "User account not found."}, 404
    now = now_utc()
    api_keys().update_many({"user_id": user["_id"], "status": {"$ne": "revoked"}}, {"$set": {"status": "revoked", "revoked_at": now, "updated_at": now}})
    create_notification(user["_id"], "api", "API key revoked", "Your Developer SMS API key was revoked.", "warning", "developer_api", "", "/user/api-access", {})
    return jsonify({"success": True, "message": "API key revoked."})


@developer_bp.put("/webhook")
@require_auth
def save_webhook(payload):
    user = get_current_user(payload)
    if not user:
        return {"success": False, "message": "User account not found."}, 404
    record = active_key_for_user(user["_id"])
    if not record:
        return {"success": False, "message": "Generate an API key before saving webhook settings."}, 400
    data = request.get_json(silent=True) or {}
    callback_url = clean_string(data.get("delivery_callback_url", ""))
    webhook_secret = clean_string(data.get("webhook_secret", ""))
    update = {"delivery_callback_url": callback_url, "updated_at": now_utc()}
    if webhook_secret:
        update["webhook_secret_hash"] = key_hash(webhook_secret)
    api_keys().update_one({"_id": record["_id"]}, {"$set": update})
    record.update(update)
    return jsonify({"success": True, "message": "Webhook settings saved.", "api_key": safe_key(record)})


@developer_bp.get("/api-logs")
@require_auth
def get_user_api_logs(payload):
    user = get_current_user(payload)
    if not user:
        return {"success": False, "message": "User account not found."}, 404
    status = clean_string(request.args.get("status", ""))
    query = {"user_id": user["_id"]}
    if status and status != "all":
        query["status"] = status
    logs = api_logs().find(query).sort("created_at", -1).limit(200)
    return jsonify({"success": True, "logs": [safe_api_log(log) for log in logs]})


@public_api_bp.post("/sms/send")
def api_send_sms():
    locked = check_service_available("developer_api")
    if locked:
        return locked
    return external_send(request.get_json(silent=True) or {}, bulk=False)


@public_api_bp.post("/sms/bulk")
def api_send_bulk_sms():
    locked = check_service_available("developer_api")
    if locked:
        return locked
    return external_send(request.get_json(silent=True) or {}, bulk=True)


@public_api_bp.get("/sms/status/<sms_id>")
def api_sms_status(sms_id):
    record, user, auth_error = auth_api_key()
    if auth_error:
        return auth_error
    limit_error = rate_limit_error(record)
    if limit_error:
        log_api_request(record, user, 429, "failed", "Rate limit exceeded")
        update_key_counter(record, False)
        return limit_error
    log = sms_logs().find_one({"sms_id": clean_string(sms_id), "user_id": user["_id"]})
    if not log:
        log_api_request(record, user, 404, "failed", "SMS not found", recipient=clean_string(sms_id))
        update_key_counter(record, False)
        return api_error("SMS not found", "SMS_NOT_FOUND", 404)
    log_api_request(record, user, 200, "success", recipient=log.get("recipient", ""), recipient_count=log.get("recipient_count", 0))
    update_key_counter(record, True)
    safe = safe_log(log)
    return jsonify({"success": True, "sms": {
        "sms_id": safe["sms_id"],
        "status": safe["status"],
        "recipient_count": safe["recipient_count"],
        "cost": safe["total_cost"],
        "currency": "GHS",
        "created_at": safe["created_at"],
    }})


@public_api_bp.get("/balance")
def api_balance():
    record, user, auth_error = auth_api_key()
    if auth_error:
        return auth_error
    limit_error = rate_limit_error(record)
    if limit_error:
        log_api_request(record, user, 429, "failed", "Rate limit exceeded")
        update_key_counter(record, False)
        return limit_error
    log_api_request(record, user, 200, "success")
    update_key_counter(record, True)
    return jsonify({"success": True, "balance": sms_credit_balance(current_app.config["DB"], user["_id"]), "sms_balance": sms_credit_balance(current_app.config["DB"], user["_id"]), "wallet_balance": to_float(user.get("wallet_balance")), "unit": "SMS credits", "currency": "GHS"})


@public_api_bp.get("/senders")
def api_senders():
    record, user, auth_error = auth_api_key()
    if auth_error:
        return auth_error
    limit_error = rate_limit_error(record)
    if limit_error:
        log_api_request(record, user, 429, "failed", "Rate limit exceeded")
        update_key_counter(record, False)
        return limit_error
    settings = get_sms_settings()
    if settings.get("active_sms_provider") == "moolre":
        senders = approved_sender_ids_for_user(user["_id"])
    else:
        senders = [item.get("sender_id") for item in sender_ids_collection().find({"user_id": user["_id"], "provider": {"$ne": "moolre"}}).sort("updated_at", -1).limit(50)]
    log_api_request(record, user, 200, "success")
    update_key_counter(record, True)
    return jsonify({"success": True, "sender_ids": senders})


@admin_developer_bp.get("/stats")
@require_admin
def admin_api_stats(payload):
    start = today_start()
    keys = list(api_keys().find({"status": {"$ne": "revoked"}}))
    return jsonify({"success": True, "stats": {
        "api_users": len({str(key.get("user_id")) for key in keys}),
        "active": sum(1 for key in keys if key.get("status") == "active"),
        "suspended": sum(1 for key in keys if key.get("status") == "suspended"),
        "requests_today": api_logs().count_documents({"created_at": {"$gte": start}}),
        "failed_today": api_logs().count_documents({"created_at": {"$gte": start}, "status": "failed"}),
        "api_revenue": round(sum(to_float(log.get("cost")) for log in api_logs().find({"created_at": {"$gte": start}, "status": "success"}, {"cost": 1})), 4),
    }})


@admin_developer_bp.get("/users")
@require_admin
def admin_api_users(payload):
    start = today_start()
    records = list(api_keys().find({"status": {"$ne": "revoked"}}).sort("created_at", -1))
    user_ids = [item.get("user_id") for item in records if isinstance(item.get("user_id"), ObjectId)]
    users = {user["_id"]: user for user in users_collection().find({"_id": {"$in": user_ids}}, {"password_hash": 0})} if user_ids else {}
    rows = []
    for record in records:
        user = users.get(record.get("user_id"), {})
        today_query = {"api_key_prefix": record.get("api_key_prefix"), "created_at": {"$gte": start}}
        requests_today = api_logs().count_documents(today_query)
        failed_today = api_logs().count_documents({**today_query, "status": "failed"})
        success_today = api_logs().count_documents({**today_query, "status": "success"})
        total_spent = sum(to_float(log.get("cost")) for log in api_logs().find({"api_key_prefix": record.get("api_key_prefix"), "status": "success"}, {"cost": 1}))
        success_rate = round((success_today / requests_today) * 100, 1) if requests_today else 0
        rows.append({
            "id": str(record["_id"]),
            "user_id": str(record.get("user_id")),
            "user": user.get("full_name", "Unknown user"),
            "email": user.get("email", ""),
            "api_key": masked_key(record),
            "requests_today": requests_today,
            "success_rate": success_rate,
            "failed_requests": failed_today,
            "total_spent": round(total_spent, 4),
            "last_used": iso(record.get("last_used_at")),
            "status": record.get("status", "active"),
        })
    return jsonify({"success": True, "users": rows})


@admin_developer_bp.patch("/keys/<key_id>/status")
@require_admin
def admin_update_key_status(payload, key_id):
    try:
        object_id = ObjectId(key_id)
    except Exception:
        return {"success": False, "message": "Invalid API key id."}, 400
    data = request.get_json(silent=True) or {}
    status = clean_string(data.get("status", ""))
    if status not in {"active", "limited", "suspended", "revoked"}:
        return {"success": False, "message": "Status must be active, limited, suspended, or revoked."}, 400
    update = {"status": status, "updated_at": now_utc()}
    if status == "revoked":
        update["revoked_at"] = now_utc()
    result = api_keys().update_one({"_id": object_id}, {"$set": update})
    if not result.matched_count:
        return {"success": False, "message": "API key not found."}, 404
    return jsonify({"success": True, "message": f"API access set to {status}."})
