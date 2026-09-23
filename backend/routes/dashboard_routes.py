from datetime import timedelta

from bson import ObjectId
from flask import Blueprint, current_app, jsonify

from utils.auth import require_auth, users_collection
from utils.security import now_utc
from utils.service_control import get_service_control, safe_service


dashboard_bp = Blueprint("dashboard", __name__, url_prefix="/api/user")

SMS_SUCCESS_STATUSES = {"successful", "success", "sent", "submitted", "accepted", "processing", "delivered"}
EMAIL_SUCCESS_STATUSES = {"sent", "accepted", "delivered"}


def iso(value):
    return value.isoformat() if value else None


def to_float(value, fallback=0.0):
    try:
        return round(float(value), 2)
    except (TypeError, ValueError):
        return fallback


def to_int(value, fallback=0):
    try:
        return int(value or 0)
    except (TypeError, ValueError):
        return fallback


def get_current_user(payload):
    user_id = payload.get("user_id") or payload.get("sub")
    try:
        object_id = ObjectId(user_id)
    except Exception:
        return None
    return users_collection().find_one({"_id": object_id})


def initials_for(name: str, email: str = "") -> str:
    parts = [part[0] for part in (name or "").split() if part]
    if parts:
        return "".join(parts).upper()[:2]
    return (email[:1] or "U").upper()


def date_range(days=7):
    today = now_utc().replace(hour=0, minute=0, second=0, microsecond=0)
    return [today - timedelta(days=offset) for offset in range(days - 1, -1, -1)]


def collection_exists(name: str) -> bool:
    return name in current_app.config["DB"].list_collection_names()


def count_by_created_at(collection, base_query: dict, start, end=None) -> int:
    query = {**base_query, "created_at": {"$gte": start}}
    if end:
        query["created_at"]["$lt"] = end
    return collection.count_documents(query)


def service_payload(service_key: str, fallback_message: str, force_unavailable=False):
    service = get_service_control(service_key)
    if service:
        payload = safe_service(service)
        status = payload.get("status", "available")
        message = payload.get("unavailable_message") or fallback_message
    else:
        status = "available"
        message = fallback_message

    if force_unavailable and status == "available":
        status = "unavailable"
        message = fallback_message

    return {
        "status": status,
        "unavailable_message": "" if status == "available" else message,
    }


def latest_sms_activity(user_id: ObjectId, limit=5):
    items = []
    for log in current_app.config["DB"].sms_logs.find({"user_id": user_id}).sort("created_at", -1).limit(limit):
        items.append({
            "id": log.get("sms_id") or str(log.get("_id")),
            "type": "sms",
            "recipient": log.get("recipient") or ", ".join((log.get("recipients") or [])[:2]),
            "message": log.get("message_preview") or (log.get("message") or "")[:120],
            "status": log.get("status", "pending"),
            "cost": to_float(log.get("total_cost")),
            "currency": "GHS",
            "date": iso(log.get("created_at")),
            "created_at": log.get("created_at"),
        })
    return items


def latest_email_activity(user_id: ObjectId, limit=5):
    items = []
    for log in current_app.config["DB"].email_logs.find({"user_id": user_id}).sort("created_at", -1).limit(limit):
        items.append({
            "id": log.get("email_id") or str(log.get("_id")),
            "type": "email",
            "recipient": log.get("to_email") or ", ".join((log.get("recipients") or [])[:2]),
            "message": log.get("subject") or log.get("message_preview", ""),
            "status": log.get("status", "pending"),
            "cost": to_float(log.get("total_cost")),
            "currency": "GHS",
            "date": iso(log.get("created_at")),
            "created_at": log.get("created_at"),
        })
    return items


def latest_api_activity(user_id: ObjectId, limit=5):
    items = []
    for log in current_app.config["DB"].api_request_logs.find({"user_id": user_id}).sort("created_at", -1).limit(limit):
        items.append({
            "id": log.get("request_id") or str(log.get("_id")),
            "type": "api",
            "recipient": log.get("endpoint", "API request"),
            "message": log.get("message_preview") or log.get("error_message", ""),
            "status": "sent" if log.get("status") == "success" else log.get("status", "pending"),
            "cost": to_float(log.get("cost")),
            "currency": "GHS",
            "date": iso(log.get("created_at")),
            "created_at": log.get("created_at"),
        })
    return items


def latest_wallet_activity(user_id: ObjectId, limit=5):
    items = []
    for txn in current_app.config["DB"].wallet_transactions.find({"user_id": user_id}).sort("created_at", -1).limit(limit):
        txn_type = txn.get("type", "credit")
        items.append({
            "id": txn.get("reference") or str(txn.get("_id")),
            "type": "wallet",
            "recipient": "Wallet",
            "message": txn.get("label") or txn.get("description") or txn.get("reason") or "Wallet transaction",
            "status": txn.get("status", "success"),
            "cost": to_float(txn.get("amount")),
            "currency": txn.get("currency", "GHS"),
            "date": iso(txn.get("created_at")),
            "created_at": txn.get("created_at"),
            "direction": "credit" if txn_type in {"credit", "deposit", "refund"} else "debit",
        })
    return items


@dashboard_bp.get("/dashboard")
@require_auth
def user_dashboard(payload):
    user = get_current_user(payload)
    if not user:
        return {"success": False, "message": "User account not found."}, 404
    if user.get("account_status") != "active":
        return {"success": False, "message": "Your account is not active."}, 403

    db = current_app.config["DB"]
    user_id = user["_id"]
    today = now_utc().replace(hour=0, minute=0, second=0, microsecond=0)

    sms_base = {"user_id": user_id}
    sms_success_query = {**sms_base, "status": {"$in": list(SMS_SUCCESS_STATUSES)}}
    sms_sent_total = db.sms_logs.count_documents(sms_success_query)
    sms_sent_today = count_by_created_at(db.sms_logs, sms_success_query, today)
    sms_delivered = db.sms_logs.count_documents({**sms_base, "status": "delivered"})
    sms_delivery_rate = round((sms_delivered / sms_sent_total) * 100, 1) if sms_sent_total else 0

    email_base = {"user_id": user_id}
    email_success_query = {**email_base, "status": {"$in": list(EMAIL_SUCCESS_STATUSES)}}
    emails_sent_total = db.email_logs.count_documents(email_success_query)
    emails_sent_today = count_by_created_at(db.email_logs, email_success_query, today)
    email_attempted = db.email_logs.count_documents(email_base)
    email_success_rate = round((emails_sent_total / email_attempted) * 100, 1) if email_attempted else 0

    api_base = {"user_id": user_id}
    api_requests_total = db.api_request_logs.count_documents(api_base)
    api_requests_today = count_by_created_at(db.api_request_logs, api_base, today)

    otp_exists = collection_exists("otp_orders")
    otp_orders_total = 0
    otp_orders_today = 0
    otp_success_rate = 0
    if otp_exists:
        otp_base = {"user_id": user_id}
        otp_orders_total = db.otp_orders.count_documents(otp_base)
        otp_orders_today = count_by_created_at(db.otp_orders, otp_base, today)
        otp_successes = db.otp_orders.count_documents({**otp_base, "status": {"$in": ["completed", "success", "received"]}})
        otp_success_rate = round((otp_successes / otp_orders_total) * 100, 1) if otp_orders_total else 0

    message_analytics = []
    otp_chart = []
    for day in date_range(7):
        next_day = day + timedelta(days=1)
        message_analytics.append({
            "date": day.date().isoformat(),
            "day": day.strftime("%a"),
            "sms_count": count_by_created_at(db.sms_logs, sms_success_query, day, next_day),
            "email_count": count_by_created_at(db.email_logs, email_success_query, day, next_day),
            "api_count": count_by_created_at(db.api_request_logs, api_base, day, next_day),
        })
        otp_chart.append({
            "date": day.date().isoformat(),
            "day": day.strftime("%a"),
            "count": count_by_created_at(db.otp_orders, {"user_id": user_id}, day, next_day) if otp_exists else 0,
        })

    services = {
        "sms_sender": service_payload("sms_sender", "SMS sending is temporarily unavailable."),
        "email_sender": service_payload("email_sender", "Email sending is temporarily unavailable."),
        "otp_virtual_numbers": service_payload(
            "otp_virtual_numbers",
            "OTP and Virtual Numbers are not available yet. We will enable this once the module is complete.",
            force_unavailable=not otp_exists,
        ),
        "developer_api": service_payload("developer_api", "The Developer API is temporarily unavailable."),
        "sms_campaigns": service_payload("sms_campaigns", "SMS Campaigns are temporarily unavailable."),
        "email_campaigns": service_payload("email_campaigns", "Email Campaigns are temporarily unavailable."),
    }

    activity = (
        latest_sms_activity(user_id)
        + latest_email_activity(user_id)
        + latest_api_activity(user_id)
        + latest_wallet_activity(user_id)
    )
    activity.sort(key=lambda item: item.get("created_at") or today, reverse=True)
    recent_activity = [{key: value for key, value in item.items() if key != "created_at"} for item in activity[:5]]

    name = user.get("full_name") or user.get("name") or user.get("email") or "User"
    email = user.get("email", "")
    return jsonify({
        "success": True,
        "user": {
            "name": name,
            "email": email,
            "initials": initials_for(name, email),
            "avatar_url": user.get("profile_picture") or user.get("avatar_url") or "",
        },
        "wallet": {
            "balance": to_float(user.get("wallet_balance") if user.get("wallet_balance") is not None else user.get("balance")),
            "currency": "GHS",
        },
        "stats": {
            "sms_sent_total": sms_sent_total,
            "sms_sent_today": sms_sent_today,
            "emails_sent_total": emails_sent_total,
            "emails_sent_today": emails_sent_today,
            "api_requests_total": api_requests_total,
            "api_requests_today": api_requests_today,
            "otp_orders_total": otp_orders_total,
            "otp_orders_today": otp_orders_today,
        },
        "rates": {
            "sms_delivery_rate": sms_delivery_rate,
            "email_success_rate": email_success_rate,
            "otp_success_rate": otp_success_rate,
        },
        "charts": {
            "message_analytics": message_analytics,
            "otp_orders": otp_chart,
        },
        "services": services,
        "recent_activity": recent_activity,
    })
