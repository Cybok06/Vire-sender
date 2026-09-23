from datetime import timedelta

from bson import ObjectId
from flask import Blueprint, current_app, jsonify, request

from services.smsman_provider import SmsmanError, encrypt_secret, get_balance, get_sms, set_status, token_mask
from utils.auth import require_admin, users_collection
from utils.security import clean_string, now_utc

admin_bp = Blueprint("admin", __name__, url_prefix="/api/admin")


def iso(value):
    return value.isoformat() if value else None


def safe_admin_user(user: dict) -> dict:
    return {
        "id": str(user["_id"]),
        "full_name": user.get("full_name", ""),
        "email": user.get("email"),
        "phone": user.get("phone") or "",
        "role": user.get("role", "user"),
        "auth_provider": user.get("auth_provider", "local"),
        "profile_picture": user.get("profile_picture"),
        "email_verified": bool(user.get("email_verified")),
        "account_status": user.get("account_status", "active"),
        "wallet_balance": float(user.get("wallet_balance", 0) or 0),
        "created_at": iso(user.get("created_at")),
        "updated_at": iso(user.get("updated_at")),
        "last_login": iso(user.get("last_login")),
    }


def get_user_or_error(user_id: str):
    try:
        object_id = ObjectId(user_id)
    except Exception:
        return None, ({"success": False, "message": "Invalid user id."}, 400)

    user = users_collection().find_one({"_id": object_id})
    if not user:
        return None, ({"success": False, "message": "User not found."}, 404)
    return user, None


def log_admin_activity(admin_id: str, action: str, target_user_id: str, metadata: dict | None = None):
    current_app.config["DB"].admin_activity_logs.insert_one({
        "admin_id": admin_id,
        "action": action,
        "target_user_id": target_user_id,
        "metadata": metadata or {},
        "created_at": now_utc(),
    })


def count_collection(name: str, query: dict) -> int:
    if name not in current_app.config["DB"].list_collection_names():
        return 0
    return current_app.config["DB"][name].count_documents(query)


def collection_exists(name: str) -> bool:
    return name in current_app.config["DB"].list_collection_names()


def to_float(value, fallback=0.0):
    try:
        return round(float(value or 0), 4)
    except (TypeError, ValueError):
        return fallback


def to_int(value, fallback=0):
    try:
        return int(value or 0)
    except (TypeError, ValueError):
        return fallback


def day_start(value):
    return value.replace(hour=0, minute=0, second=0, microsecond=0)


def month_start(value):
    return value.replace(day=1, hour=0, minute=0, second=0, microsecond=0)


def add_months(value, months: int):
    month_index = value.month - 1 + months
    year = value.year + month_index // 12
    month = month_index % 12 + 1
    return value.replace(year=year, month=month, day=1)


def count_in_range(collection, query: dict, start, end) -> int:
    return collection.count_documents({**query, "created_at": {"$gte": start, "$lt": end}})


def sum_field(collection, query: dict, field: str) -> float:
    pipeline = [
        {"$match": query},
        {"$group": {"_id": None, "total": {"$sum": {"$ifNull": [f"${field}", 0]}}}},
    ]
    result = list(collection.aggregate(pipeline))
    return to_float(result[0]["total"]) if result else 0


def user_name_map(user_ids):
    object_ids = [user_id for user_id in user_ids if isinstance(user_id, ObjectId)]
    if not object_ids:
        return {}
    return {
        user["_id"]: user.get("full_name") or user.get("name") or user.get("email") or "Unknown user"
        for user in users_collection().find({"_id": {"$in": object_ids}}, {"password_hash": 0})
    }


def activity_date(value):
    if not value:
        return ""
    today = day_start(now_utc())
    if value >= today:
        return f"Today {value.strftime('%H:%M')}"
    return value.strftime("%b %d, %H:%M")


def safe_activity(item: dict) -> dict:
    return {key: value for key, value in item.items() if key != "_created_at"}


def provider_settings_collection():
    return current_app.config["DB"].provider_settings


def safe_smsman_settings(settings: dict) -> dict:
    return {
        "provider": "smsman",
        "is_active": bool(settings.get("is_active", False)),
        "live_purchase_enabled": bool(settings.get("live_purchase_enabled", False)),
        "has_api_token": bool(settings.get("api_token_encrypted")),
        "token_masked": settings.get("token_masked", ""),
        "last_balance": settings.get("last_balance"),
        "last_balance_checked_at": iso(settings.get("last_balance_checked_at")),
        "last_test_status": settings.get("last_test_status"),
        "last_test_error": settings.get("last_test_error"),
        "updated_at": iso(settings.get("updated_at")),
    }


@admin_bp.get("/provider-settings/smsman")
@require_admin
def admin_get_smsman_provider_settings(payload):
    settings = provider_settings_collection().find_one({"provider": "smsman"}) or {"provider": "smsman", "is_active": False}
    return jsonify({"success": True, "settings": safe_smsman_settings(settings)})


@admin_bp.post("/provider-settings/smsman")
@require_admin
def admin_save_smsman_provider_settings(payload):
    data = request.get_json(silent=True) or {}
    token = clean_string(data.get("api_token", ""))
    live_purchase_enabled = bool(data.get("live_purchase_enabled", data.get("is_active", False)))
    now = now_utc()
    update = {
        "provider": "smsman",
        "is_active": live_purchase_enabled,
        "live_purchase_enabled": live_purchase_enabled,
        "updated_at": now,
        "updated_by": payload.get("user_id", "admin"),
    }
    if token:
        update["api_token_encrypted"] = encrypt_secret(token)
        update["token_masked"] = token_mask(token)
    provider_settings_collection().update_one(
        {"provider": "smsman"},
        {"$set": update, "$setOnInsert": {"created_at": now}},
        upsert=True,
    )
    settings = provider_settings_collection().find_one({"provider": "smsman"}) or {}
    return jsonify({"success": True, "message": "SMS-MAN provider settings saved.", "settings": safe_smsman_settings(settings)})


@admin_bp.post("/provider-settings/smsman/test-balance")
@require_admin
def admin_test_smsman_provider_settings(payload):
    data = request.get_json(silent=True) or {}
    token_override = clean_string(data.get("api_token", ""))
    now = now_utc()
    try:
        balance_data = get_balance(token_override=token_override or None, context={"admin_id": payload.get("user_id", "admin")})
    except SmsmanError as exc:
        provider_settings_collection().update_one(
            {"provider": "smsman"},
            {"$set": {
                "provider": "smsman",
                "last_test_status": "failed",
                "last_test_error": exc.message,
                "updated_at": now,
            }, "$setOnInsert": {"created_at": now}},
            upsert=True,
        )
        return {"success": False, "message": exc.message, "code": exc.code}, 400
    balance_value = balance_data.get("balance") if isinstance(balance_data, dict) else balance_data
    try:
        balance_number = float(balance_value)
    except (TypeError, ValueError):
        balance_number = balance_value
    provider_settings_collection().update_one(
        {"provider": "smsman"},
        {"$set": {
            "provider": "smsman",
            "last_balance": balance_number,
            "last_balance_checked_at": now,
            "last_test_status": "success",
            "last_test_error": None,
            "is_active": True,
            "updated_at": now,
        }, "$setOnInsert": {"created_at": now}},
        upsert=True,
    )
    return jsonify({"success": True, "message": "SMS-MAN balance fetched.", "balance": balance_number})


@admin_bp.post("/provider-settings/smsman/test")
@require_admin
def admin_test_smsman_provider_settings_legacy(payload):
    return admin_test_smsman_provider_settings()


def extract_sms_code_from_provider(data):
    if not isinstance(data, dict):
        return ""
    for key in ("sms_code", "code", "otp_code", "sms"):
        if data.get(key):
            return str(data.get(key))
    for value in data.values():
        if isinstance(value, dict):
            code = extract_sms_code_from_provider(value)
            if code:
                return code
    return ""


def poll_waiting_smsman_orders(limit=50):
    db = current_app.config["DB"]
    now = now_utc()
    summary = {"checked": 0, "received": 0, "expired": 0, "waiting": 0, "errors": 0}
    orders = list(db.otp_orders.find({
        "provider": "smsman",
        "status": "waiting",
    }).sort("created_at", 1).limit(limit))

    for order in orders:
        summary["checked"] += 1
        request_id = order.get("provider_request_id")
        if order.get("expires_at") and order["expires_at"] <= now:
            if request_id:
                try:
                    set_status(request_id, "reject", context={"otp_order_id": order["_id"]})
                except SmsmanError:
                    pass
            db.otp_orders.update_one(
                {"_id": order["_id"]},
                {"$set": {"status": "expired", "provider_status": "expired", "updated_at": now}},
            )
            summary["expired"] += 1
            continue
        if not request_id:
            summary["errors"] += 1
            continue
        try:
            sms_data = get_sms(request_id, context={"otp_order_id": order["_id"], "user_id": order.get("user_id")})
        except SmsmanError as exc:
            if exc.code == "wait_sms":
                db.otp_orders.update_one(
                    {"_id": order["_id"]},
                    {"$set": {"provider_status": "wait_sms", "provider_raw_sms": exc.raw, "updated_at": now_utc()}},
                )
                summary["waiting"] += 1
                continue
            db.otp_orders.update_one(
                {"_id": order["_id"]},
                {"$set": {"provider_status": exc.code, "failure_message": exc.message, "updated_at": now_utc()}},
            )
            summary["errors"] += 1
            continue
        otp_code = extract_sms_code_from_provider(sms_data)
        if not otp_code:
            db.otp_orders.update_one(
                {"_id": order["_id"]},
                {"$set": {"provider_status": "wait_sms", "provider_raw_sms": sms_data, "updated_at": now_utc()}},
            )
            summary["waiting"] += 1
            continue
        received_at = now_utc()
        db.otp_orders.update_one(
            {"_id": order["_id"]},
            {"$set": {
                "otp_code": otp_code,
                "status": "received",
                "provider_status": "received",
                "provider_raw_sms": sms_data,
                "received_at": received_at,
                "updated_at": received_at,
            }},
        )
        try:
            set_status(request_id, "used", context={"otp_order_id": order["_id"], "user_id": order.get("user_id")})
        except SmsmanError:
            pass
        summary["received"] += 1
    return summary


@admin_bp.post("/otp/poll-smsman")
@require_admin
def admin_poll_smsman(payload):
    summary = poll_waiting_smsman_orders()
    return jsonify({"success": True, "message": "SMS-MAN polling completed.", "summary": summary})


def otp_status_label(order: dict, now=None) -> str:
    status = order.get("status", "waiting")
    expires_at = order.get("expires_at")
    now = now or now_utc()
    if status in {"waiting", "received"} and expires_at and expires_at <= now:
        return "expired"
    return status


def safe_admin_otp_order(order: dict, user: dict | None = None) -> dict:
    user = user or {}
    return {
        "id": str(order.get("_id")),
        "user_id": str(order.get("user_id")) if order.get("user_id") else "",
        "user_name": user.get("full_name") or user.get("name") or user.get("email") or "Unknown user",
        "user_email": user.get("email", ""),
        "provider": order.get("provider", "smsman"),
        "mode": order.get("mode", "mock"),
        "service_id": order.get("service_id", ""),
        "service_name": order.get("service_name", ""),
        "service_code": order.get("service_code", ""),
        "service_image_url": order.get("service_image_url", ""),
        "country_id": order.get("country_id", ""),
        "country_name": order.get("country_name", ""),
        "country_code": order.get("country_code", ""),
        "country_flag_image": order.get("country_flag_image", ""),
        "phone_number": order.get("phone_number", ""),
        "otp_code": order.get("otp_code", ""),
        "price": to_float(order.get("price")),
        "currency": order.get("currency", "GHS"),
        "status": otp_status_label(order),
        "raw_status": order.get("status", "waiting"),
        "expires_at": iso(order.get("expires_at")),
        "received_at": iso(order.get("received_at")),
        "refunded_at": iso(order.get("refunded_at")),
        "created_at": iso(order.get("created_at")),
        "updated_at": iso(order.get("updated_at")),
    }


def otp_order_user_map(orders: list[dict]) -> dict:
    ids = [order.get("user_id") for order in orders if isinstance(order.get("user_id"), ObjectId)]
    if not ids:
        return {}
    return {
        user["_id"]: user
        for user in users_collection().find({"_id": {"$in": ids}}, {"password_hash": 0})
    }


def otp_order_query(q: str, status: str) -> dict:
    query = {}
    q = clean_string(q)
    if q:
        user_ids = [
            user["_id"]
            for user in users_collection().find(
                {
                    "$or": [
                        {"email": {"$regex": q, "$options": "i"}},
                        {"full_name": {"$regex": q, "$options": "i"}},
                        {"name": {"$regex": q, "$options": "i"}},
                    ]
                },
                {"_id": 1},
            ).limit(50)
        ]
        search_or = [
            {"service_name": {"$regex": q, "$options": "i"}},
            {"service_code": {"$regex": q, "$options": "i"}},
            {"country_name": {"$regex": q, "$options": "i"}},
            {"country_code": {"$regex": q, "$options": "i"}},
            {"phone_number": {"$regex": q, "$options": "i"}},
            {"otp_code": {"$regex": q, "$options": "i"}},
        ]
        try:
            search_or.append({"_id": ObjectId(q)})
        except Exception:
            pass
        if user_ids:
            search_or.append({"user_id": {"$in": user_ids}})
        query["$or"] = search_or

    if status in {"processing", "waiting", "received", "cancelled", "failed"}:
        query["status"] = status
    elif status == "active":
        query["status"] = {"$in": ["processing", "waiting", "received"]}
        query["expires_at"] = {"$gt": now_utc()}
    elif status == "expired":
        query["status"] = {"$in": ["waiting", "received"]}
        query["expires_at"] = {"$lte": now_utc()}
    return query


def admin_otp_stats(collection) -> dict:
    now = now_utc()
    total = collection.count_documents({})
    active_query = {"status": {"$in": ["processing", "waiting", "received"]}, "expires_at": {"$gt": now}}
    received_query = {"status": "received"}
    cancelled_query = {"status": "cancelled"}
    expired_query = {"status": {"$in": ["waiting", "received"]}, "expires_at": {"$lte": now}}
    revenue = sum_field(collection, {"status": {"$ne": "cancelled"}}, "price")
    return {
        "total": total,
        "active": collection.count_documents(active_query),
        "received": collection.count_documents(received_query),
        "expired": collection.count_documents(expired_query),
        "cancelled": collection.count_documents(cancelled_query),
        "revenue": round(revenue, 2),
    }


@admin_bp.get("/otp-orders")
@require_admin
def admin_otp_orders(payload):
    db = current_app.config["DB"]
    page = max(1, to_int(request.args.get("page"), 1))
    limit = min(max(1, to_int(request.args.get("limit"), 25)), 100)
    status = clean_string(request.args.get("status", "all")).lower() or "all"
    q = clean_string(request.args.get("q", ""))
    query = otp_order_query(q, status)

    total = db.otp_orders.count_documents(query)
    orders = list(
        db.otp_orders.find(query)
        .sort("created_at", -1)
        .skip((page - 1) * limit)
        .limit(limit)
    )
    users = otp_order_user_map(orders)
    return jsonify({
        "success": True,
        "orders": [safe_admin_otp_order(order, users.get(order.get("user_id"))) for order in orders],
        "stats": admin_otp_stats(db.otp_orders),
        "pagination": {
            "page": page,
            "limit": limit,
            "total": total,
            "pages": max(1, ((total + limit - 1) // limit) if total else 1),
        },
    })


@admin_bp.post("/otp-orders/<order_id>/cancel")
@require_admin
def admin_cancel_otp_order(payload, order_id):
    db = current_app.config["DB"]
    try:
        object_id = ObjectId(order_id)
    except Exception:
        return {"success": False, "message": "Invalid order id."}, 400

    order = db.otp_orders.find_one({"_id": object_id})
    if not order:
        return {"success": False, "message": "OTP order not found."}, 404
    if order.get("status") == "cancelled":
        return {"success": False, "message": "OTP order is already cancelled."}, 400
    if order.get("status") == "received" or order.get("received_at") or order.get("otp_code"):
        return {"success": False, "message": "Received OTP orders cannot be cancelled. Use refund if needed."}, 400

    now = now_utc()
    db.otp_orders.update_one(
        {"_id": object_id},
        {"$set": {
            "status": "cancelled",
            "cancelled_at": now,
            "cancelled_by_admin_id": str(payload.get("user_id", "admin")),
            "updated_at": now,
        }},
    )
    log_admin_activity(payload.get("user_id", "admin"), "otp_order_cancelled", str(order.get("user_id", "")), {"order_id": order_id})
    updated = db.otp_orders.find_one({"_id": object_id})
    users = otp_order_user_map([updated])
    return jsonify({"success": True, "message": "OTP order cancelled.", "order": safe_admin_otp_order(updated, users.get(updated.get("user_id")))})


@admin_bp.post("/otp-orders/<order_id>/refund")
@require_admin
def admin_refund_otp_order(payload, order_id):
    db = current_app.config["DB"]
    try:
        object_id = ObjectId(order_id)
    except Exception:
        return {"success": False, "message": "Invalid order id."}, 400

    order = db.otp_orders.find_one({"_id": object_id})
    if not order:
        return {"success": False, "message": "OTP order not found."}, 404
    if order.get("refunded_at"):
        return {"success": False, "message": "OTP order has already been refunded."}, 400
    user_id = order.get("user_id")
    if not isinstance(user_id, ObjectId):
        return {"success": False, "message": "Order user cannot be refunded automatically."}, 400
    user = users_collection().find_one({"_id": user_id})
    if not user:
        return {"success": False, "message": "Order user not found."}, 404

    refund = round(to_float(order.get("price")), 2)
    if refund <= 0:
        return {"success": False, "message": "No refundable amount found."}, 400
    now = now_utc()
    current_balance = round(to_float(user.get("wallet_balance") if user.get("wallet_balance") is not None else user.get("balance")), 2)
    new_balance = round(current_balance + refund, 2)
    users_collection().update_one({"_id": user_id}, {"$set": {"wallet_balance": new_balance, "updated_at": now}})
    db.otp_orders.update_one(
        {"_id": object_id},
        {"$set": {
            "status": "cancelled",
            "refunded_at": now,
            "refunded_by_admin_id": str(payload.get("user_id", "admin")),
            "updated_at": now,
        }},
    )
    db.wallet_transactions.insert_one({
        "user_id": user_id,
        "type": "refund",
        "label": f"Admin OTP refund - {order.get('service_name')} {order.get('country_name')}",
        "description": f"Admin OTP refund - {order.get('service_name')} {order.get('country_name')}",
        "method": "Admin",
        "provider": order.get("provider", "smsman"),
        "amount": refund,
        "currency": order.get("currency", "GHS"),
        "status": "completed",
        "reference": f"ADMIN-OTPR-{now.strftime('%Y%m%d%H%M%S')}-{str(object_id)[-6:].upper()}",
        "balance_before": current_balance,
        "balance_after": new_balance,
        "order_id": object_id,
        "created_by": payload.get("user_id", "admin"),
        "created_at": now,
        "updated_at": now,
    })
    log_admin_activity(payload.get("user_id", "admin"), "otp_order_refunded", str(user_id), {"order_id": order_id, "amount": refund})
    updated = db.otp_orders.find_one({"_id": object_id})
    return jsonify({"success": True, "message": "OTP order refunded.", "order": safe_admin_otp_order(updated, user)})


@admin_bp.get("/dashboard")
@require_admin
def admin_dashboard(payload):
    db = current_app.config["DB"]
    now = now_utc()
    today = day_start(now)
    tomorrow = today + timedelta(days=1)
    week_start = today - timedelta(days=6)
    current_month = month_start(now)
    next_month = add_months(current_month, 1)
    previous_month = add_months(current_month, -1)

    users = list(users_collection().find({}, {"password_hash": 0}))
    non_admin_users = [user for user in users if user.get("role", "user") != "admin"]
    total_users = len(non_admin_users)
    users_this_week = sum(1 for user in non_admin_users if user.get("created_at") and user["created_at"] >= today - timedelta(days=7))
    wallet_balance = round(sum(to_float(user.get("wallet_balance")) for user in non_admin_users), 2)

    sms_logs = db.sms_logs
    email_logs = db.email_logs
    api_logs = db.api_request_logs
    wallet_txns = db.wallet_transactions
    otp_exists = collection_exists("otp_orders")
    otp_orders = db.otp_orders if otp_exists else None

    sms_success_statuses = ["successful", "success", "sent", "submitted", "accepted", "processing", "delivered"]
    email_success_statuses = ["sent", "accepted", "delivered"]
    sms_total = sms_logs.count_documents({"status": {"$in": sms_success_statuses}})
    sms_delivered = sms_logs.count_documents({"status": "delivered"})
    sms_failed = sms_logs.count_documents({"status": "failed"})
    sms_month = sms_logs.count_documents({"status": {"$in": sms_success_statuses}, "created_at": {"$gte": current_month, "$lt": next_month}})
    email_total = email_logs.count_documents({"status": {"$in": email_success_statuses}})
    email_failed = email_logs.count_documents({"status": {"$in": ["failed", "bounced"]}})
    email_month = email_logs.count_documents({"status": {"$in": email_success_statuses}, "created_at": {"$gte": current_month, "$lt": next_month}})

    otp_total = otp_orders.count_documents({}) if otp_exists else 0
    otp_success = otp_orders.count_documents({"status": {"$in": ["completed", "success", "received"]}}) if otp_exists else 0
    otp_today = otp_orders.count_documents({"created_at": {"$gte": today, "$lt": tomorrow}}) if otp_exists else 0
    otp_yesterday = otp_orders.count_documents({"created_at": {"$gte": today - timedelta(days=1), "$lt": today}}) if otp_exists else 0

    sms_revenue = sum_field(sms_logs, {"status": {"$in": sms_success_statuses}}, "total_cost")
    sms_cost = sum_field(sms_logs, {"status": {"$in": sms_success_statuses}}, "provider_total_cost")
    email_revenue = sum_field(email_logs, {"status": {"$in": email_success_statuses}}, "total_cost")
    email_provider_cost = 0
    if collection_exists("platform_settings"):
        email_settings = db.platform_settings.find_one({"key": "email_settings"}) or {}
        provider_unit = to_float(email_settings.get("provider_cost_per_email"))
        email_provider_cost = sum(
            to_int(log.get("recipient_count"), 1) * provider_unit
            for log in email_logs.find({"status": {"$in": email_success_statuses}}, {"recipient_count": 1})
        )
    api_revenue = sum_field(api_logs, {"status": "success"}, "cost")
    wallet_debits = sum_field(wallet_txns, {"status": "success", "type": "debit"}, "amount")
    revenue = round(sms_revenue + email_revenue + api_revenue, 2)
    cost = round(sms_cost + email_provider_cost, 2)
    profit = round(revenue - cost, 2)
    revenue_prev_month = (
        sum_field(sms_logs, {"status": {"$in": sms_success_statuses}, "created_at": {"$gte": previous_month, "$lt": current_month}}, "total_cost")
        + sum_field(email_logs, {"status": {"$in": email_success_statuses}, "created_at": {"$gte": previous_month, "$lt": current_month}}, "total_cost")
        + sum_field(api_logs, {"status": "success", "created_at": {"$gte": previous_month, "$lt": current_month}}, "cost")
    )
    revenue_change = round(((revenue - revenue_prev_month) / revenue_prev_month) * 100, 1) if revenue_prev_month else 0

    active_sms_campaigns = db.sms_campaigns.count_documents({"status": {"$in": ["draft", "scheduled", "running", "queued"]}}) if collection_exists("sms_campaigns") else 0
    active_email_campaigns = db.email_campaigns.count_documents({"status": {"$in": ["draft", "scheduled", "running", "queued"]}}) if collection_exists("email_campaigns") else 0
    active_campaigns = active_sms_campaigns + active_email_campaigns

    top_metrics = {
        "total_users": total_users,
        "users_this_week": users_this_week,
        "wallet_balance": wallet_balance,
        "otp_orders": otp_total,
        "otp_today": otp_today,
        "otp_change_vs_yesterday": round(((otp_today - otp_yesterday) / otp_yesterday) * 100, 1) if otp_yesterday else 0,
        "sms_sent_month": sms_month,
        "emails_sent_month": email_month,
        "total_revenue": revenue,
        "revenue_change_vs_last_month": revenue_change,
        "total_profit": profit,
        "profit_margin": round((profit / revenue) * 100, 1) if revenue else 0,
        "failed_deliveries": sms_failed + email_failed,
    }

    rates = {
        "otp_success_rate": round((otp_success / otp_total) * 100, 1) if otp_total else 0,
        "sms_delivery_rate": round((sms_delivered / sms_total) * 100, 1) if sms_total else 0,
        "email_success_rate": round((email_total / (email_total + email_failed)) * 100, 1) if (email_total + email_failed) else 0,
        "active_campaigns": active_campaigns,
    }

    revenue_trend = []
    channel_usage = []
    month_base = month_start(add_months(current_month, -6))
    for offset in range(7):
        start = add_months(month_base, offset)
        end = add_months(start, 1)
        month_sms = count_in_range(sms_logs, {"status": {"$in": sms_success_statuses}}, start, end)
        month_email = count_in_range(email_logs, {"status": {"$in": email_success_statuses}}, start, end)
        month_otp = count_in_range(otp_orders, {}, start, end) if otp_exists else 0
        month_revenue = (
            sum_field(sms_logs, {"status": {"$in": sms_success_statuses}, "created_at": {"$gte": start, "$lt": end}}, "total_cost")
            + sum_field(email_logs, {"status": {"$in": email_success_statuses}, "created_at": {"$gte": start, "$lt": end}}, "total_cost")
            + sum_field(api_logs, {"status": "success", "created_at": {"$gte": start, "$lt": end}}, "cost")
        )
        month_cost = sum_field(sms_logs, {"status": {"$in": sms_success_statuses}, "created_at": {"$gte": start, "$lt": end}}, "provider_total_cost")
        revenue_trend.append({"month": start.strftime("%b"), "revenue": round(month_revenue, 2), "profit": round(month_revenue - month_cost, 2)})
        channel_usage.append({"month": start.strftime("%b"), "sms": month_sms, "email": month_email, "otp": month_otp})

    delivery_outcomes = []
    for offset in range(7):
        start = week_start + timedelta(days=offset)
        end = start + timedelta(days=1)
        sms_success = count_in_range(sms_logs, {"status": {"$in": sms_success_statuses}}, start, end)
        email_success = count_in_range(email_logs, {"status": {"$in": email_success_statuses}}, start, end)
        sms_fail = count_in_range(sms_logs, {"status": "failed"}, start, end)
        email_fail = count_in_range(email_logs, {"status": {"$in": ["failed", "bounced"]}}, start, end)
        delivery_outcomes.append({"day": start.strftime("%a"), "success": sms_success + email_success, "failed": sms_fail + email_fail})

    channel_total = max(1, sms_total + email_total + otp_total)
    channel_breakdown = [
        {"name": "SMS", "value": round((sms_total / channel_total) * 100, 1), "color": "#3B82F6"},
        {"name": "Email", "value": round((email_total / channel_total) * 100, 1), "color": "#8B5CF6"},
        {"name": "OTP", "value": round((otp_total / channel_total) * 100, 1), "color": "#10B981"},
    ]

    recent_logs = []
    sms_recent = list(sms_logs.find({}).sort("created_at", -1).limit(6))
    email_recent = list(email_logs.find({}).sort("created_at", -1).limit(6))
    otp_recent = list(otp_orders.find({}).sort("created_at", -1).limit(6)) if otp_exists else []
    names = user_name_map([*(log.get("user_id") for log in sms_recent), *(log.get("user_id") for log in email_recent), *(log.get("user_id") for log in otp_recent)])
    for log in sms_recent:
        recent_logs.append({
            "id": log.get("sms_id") or str(log.get("_id")),
            "type": "SMS",
            "user": names.get(log.get("user_id"), log.get("user_name", "Unknown user")),
            "action": f"{log.get('type', 'SMS').title()} SMS - {log.get('recipient') or to_int(log.get('recipient_count'))}",
            "status": log.get("status", "pending"),
            "amount": to_float(log.get("total_cost")),
            "date": activity_date(log.get("created_at")),
            "_created_at": log.get("created_at") or now,
        })
    for log in email_recent:
        recent_logs.append({
            "id": log.get("email_id") or str(log.get("_id")),
            "type": "Email",
            "user": names.get(log.get("user_id"), "Unknown user"),
            "action": log.get("subject") or f"Email - {log.get('to_email') or to_int(log.get('recipient_count'))}",
            "status": log.get("status", "pending"),
            "amount": to_float(log.get("total_cost")),
            "date": activity_date(log.get("created_at")),
            "_created_at": log.get("created_at") or now,
        })
    for order in otp_recent:
        recent_logs.append({
            "id": str(order.get("_id")),
            "type": "OTP",
            "user": names.get(order.get("user_id"), "Unknown user"),
            "action": order.get("service") or order.get("service_name") or "OTP order",
            "status": order.get("status", "pending"),
            "amount": to_float(order.get("cost") or order.get("price")),
            "date": activity_date(order.get("created_at")),
            "_created_at": order.get("created_at") or now,
        })
    recent_logs.sort(key=lambda item: item["_created_at"], reverse=True)

    support = {"open": 0, "high_priority": 0, "resolved_today": 0, "recent_tickets": [], "unread_count": 0}
    if collection_exists("complaints"):
        tickets = list(db.complaints.find({}).sort("created_at", -1).limit(100))
        support["open"] = sum(1 for item in tickets if item.get("status") == "open")
        support["high_priority"] = sum(1 for item in tickets if item.get("priority") == "high" and item.get("status") in {"open", "in_review"})
        support["resolved_today"] = sum(1 for item in tickets if item.get("resolved_at") and item["resolved_at"] >= today)
        support["unread_count"] = sum(to_int(item.get("admin_unread_count")) for item in tickets)
        support["recent_tickets"] = [{
            "id": item.get("ticket_id") or str(item.get("_id")),
            "subject": item.get("subject", "Support ticket"),
            "user_name": item.get("user_name") or item.get("user_email") or "Unknown user",
            "status": item.get("status", "open"),
            "priority": item.get("priority", "medium"),
            "created_at": activity_date(item.get("created_at")),
        } for item in tickets if item.get("status") != "closed"][:5]

    return jsonify({
        "success": True,
        "top_metrics": top_metrics,
        "rates": rates,
        "charts": {
            "revenue_trend": revenue_trend,
            "channel_usage": channel_usage,
            "delivery_outcomes": delivery_outcomes,
            "channel_breakdown": channel_breakdown,
        },
        "support": support,
        "recent_activity": [safe_activity(item) for item in recent_logs[:6]],
        "widgets": {
            "active": db.embed_widgets.count_documents({"status": "active"}) if collection_exists("embed_widgets") else 0,
            "sends_today": count_in_range(db.embed_widget_logs, {}, today, tomorrow) if collection_exists("embed_widget_logs") else 0,
            "failed_today": count_in_range(db.embed_widget_logs, {"status": "failed"}, today, tomorrow) if collection_exists("embed_widget_logs") else 0,
        },
    })


def safe_admin_contact(contact: dict, user: dict | None = None) -> dict:
    return {
        "id": str(contact["_id"]),
        "user_id": str(contact.get("user_id")) if contact.get("user_id") else None,
        "user": user.get("full_name", "Unknown user") if user else contact.get("user_name", "Unknown user"),
        "user_email": user.get("email") if user else None,
        "name": contact.get("name", ""),
        "phone": contact.get("phone", ""),
        "email": contact.get("email", ""),
        "group": contact.get("group", "All Contacts"),
        "added": iso(contact.get("created_at")),
        "created_at": iso(contact.get("created_at")),
        "updated_at": iso(contact.get("updated_at")),
    }


@admin_bp.get("/users")
@require_admin
def list_users(payload):
    users = users_collection().find({}, {"password_hash": 0, "verification_code_hash": 0, "reset_token_hash": 0})
    return jsonify({"success": True, "users": [safe_admin_user(user) for user in users]})


@admin_bp.get("/contacts")
@require_admin
def list_contacts(payload):
    contacts = list(current_app.config["DB"].contacts.find({}).sort("created_at", -1).limit(1000))
    user_ids = [contact.get("user_id") for contact in contacts if isinstance(contact.get("user_id"), ObjectId)]
    users = {
        user["_id"]: user
        for user in users_collection().find({"_id": {"$in": user_ids}}, {"password_hash": 0})
    } if user_ids else {}
    groups = {contact.get("group", "All Contacts") for contact in contacts}
    return jsonify({
        "success": True,
        "contacts": [safe_admin_contact(contact, users.get(contact.get("user_id"))) for contact in contacts],
        "stats": {
            "total": len(contacts),
            "groups": len(groups),
            "users": len({str(contact.get("user_id")) for contact in contacts if contact.get("user_id")}),
        },
    })


@admin_bp.delete("/contacts/<contact_id>")
@require_admin
def delete_contact(payload, contact_id):
    try:
        object_id = ObjectId(contact_id)
    except Exception:
        return {"success": False, "message": "Invalid contact id."}, 400

    contact = current_app.config["DB"].contacts.find_one({"_id": object_id})
    if not contact:
        return {"success": False, "message": "Contact not found."}, 404

    current_app.config["DB"].contacts.delete_one({"_id": object_id})
    log_admin_activity(
        payload.get("user_id", "admin"),
        "contact_deleted",
        str(contact.get("user_id")) if contact.get("user_id") else None,
        {"contact_id": contact_id, "contact_name": contact.get("name", ""), "phone": contact.get("phone", "")},
    )
    return jsonify({"success": True, "message": "Contact deleted successfully."})


@admin_bp.get("/users/<user_id>")
@require_admin
def user_details(payload, user_id):
    user, error = get_user_or_error(user_id)
    if error:
        return error

    details = safe_admin_user(user)
    object_id = user["_id"]
    activity = list(
        current_app.config["DB"].admin_activity_logs.find({"target_user_id": user_id}).sort("created_at", -1).limit(10)
    )

    details.update({
        "wallet_summary": {
            "balance": details["wallet_balance"],
            "transactions": count_collection("wallet_transactions", {"user_id": object_id}),
        },
        "usage": {
            "otp_orders_count": count_collection("otp_orders", {"user_id": object_id}),
            "sms_sent_count": count_collection("sms_logs", {"user_id": object_id}),
            "emails_sent_count": count_collection("email_logs", {"user_id": object_id}),
            "api_requests_count": count_collection("api_request_logs", {"user_id": object_id}),
            "complaints_count": count_collection("complaints", {"user_id": object_id}),
        },
        "recent_activity": [
            {
                "action": item.get("action"),
                "metadata": item.get("metadata", {}),
                "created_at": iso(item.get("created_at")),
            }
            for item in activity
        ],
    })

    return jsonify({"success": True, "user": details})


@admin_bp.patch("/users/<user_id>/status")
@require_admin
def update_user_status(payload, user_id):
    user, error = get_user_or_error(user_id)
    if error:
        return error

    if str(user["_id"]) == payload.get("user_id"):
        return {"success": False, "message": "Admin cannot suspend himself."}, 400

    data = request.get_json(silent=True) or {}
    status = clean_string(data.get("account_status", ""))
    if status not in {"active", "suspended"}:
        return {"success": False, "message": "Status must be active or suspended."}, 400

    users_collection().update_one({"_id": user["_id"]}, {"$set": {"account_status": status, "updated_at": now_utc()}})
    log_admin_activity(payload.get("user_id", "admin"), "user_status_updated", user_id, {"account_status": status})
    user["account_status"] = status

    return jsonify({"success": True, "message": f"User {status} successfully.", "user": safe_admin_user(user)})


@admin_bp.post("/users/<user_id>/wallet-adjust")
@require_admin
def wallet_adjust(payload, user_id):
    user, error = get_user_or_error(user_id)
    if error:
        return error

    data = request.get_json(silent=True) or {}
    action_type = clean_string(data.get("type", ""))
    reason = clean_string(data.get("reason", "")) or "Manual admin adjustment"
    try:
        amount = float(data.get("amount", 0))
    except (TypeError, ValueError):
        amount = 0

    if action_type not in {"credit", "debit"}:
        return {"success": False, "message": "Type must be credit or debit."}, 400
    if amount <= 0:
        return {"success": False, "message": "Amount must be positive."}, 400

    current_balance = float(user.get("wallet_balance", 0) or 0)
    if action_type == "debit" and current_balance - amount < 0:
        return {"success": False, "message": "Debit cannot make wallet balance negative."}, 400

    new_balance = current_balance + amount if action_type == "credit" else current_balance - amount
    now = now_utc()

    users_collection().update_one(
        {"_id": user["_id"]},
        {"$set": {"wallet_balance": new_balance, "updated_at": now}},
    )
    current_app.config["DB"].wallet_transactions.insert_one({
        "user_id": user["_id"],
        "type": action_type,
        "label": "Manual admin adjustment",
        "method": "Admin",
        "provider": "admin",
        "amount": amount,
        "currency": "GHS",
        "status": "success",
        "balance_before": current_balance,
        "balance_after": new_balance,
        "reason": reason,
        "created_by": payload.get("user_id", "admin"),
        "created_at": now,
        "updated_at": now,
    })
    log_admin_activity(
        payload.get("user_id", "admin"),
        "wallet_adjusted",
        user_id,
        {"type": action_type, "amount": amount, "reason": reason, "balance_after": new_balance},
    )
    user["wallet_balance"] = new_balance

    return jsonify({"success": True, "message": "Wallet balance updated successfully.", "user": safe_admin_user(user)})
