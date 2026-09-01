from datetime import datetime
from bson import ObjectId
import re

from flask import Blueprint, current_app, jsonify, request

from services.smsman_provider import SmsmanError, sync_countries, sync_services
from utils.auth import require_admin
from utils.security import clean_string, now_utc


admin_smsman_bp = Blueprint("admin_smsman", __name__, url_prefix="/api/admin/smsman")
PROVIDER = "smsman"


def db():
    return current_app.config["DB"]


def countries_collection():
    return db().smsman_countries


def services_collection():
    return db().smsman_services


def pricing_rules_collection():
    return db().smsman_pricing_rules


def request_logs_collection():
    return db().smsman_request_logs


def to_float(value, default=0.0):
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def to_int(value, default=0):
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def page_params():
    page = max(1, to_int(request.args.get("page"), 1))
    limit = min(max(1, to_int(request.args.get("limit"), 30)), 100)
    return page, limit


def paginated_response(collection, query, sort_field, serializer, result_key):
    page, limit = page_params()
    skip = (page - 1) * limit
    total = collection.count_documents(query)
    cursor = collection.find(query).sort(sort_field, 1).skip(skip).limit(limit)
    return jsonify({
        "success": True,
        result_key: [serializer(item) for item in cursor],
        "pagination": {
            "page": page,
            "limit": limit,
            "total": total,
            "has_more": skip + limit < total,
        },
    })


def safe_country(country):
    return {
        "country_id": str(country.get("country_id") or country.get("provider_id") or ""),
        "title": country.get("title") or "",
        "code": country.get("code") or "",
        "flag": country.get("flag") or country.get("flag_url") or "",
        "flag_url": country.get("flag_url") or country.get("flag") or "",
        "flag_svg_url": country.get("flag_svg_url") or "",
        "flag_png_url": country.get("flag_png_url") or "",
    }


def safe_service(service):
    title = service.get("title") or service.get("name") or ""
    return {
        "service_id": str(service.get("provider_id") or service.get("service_id") or ""),
        "title": title,
        "name": service.get("name") or title,
        "code": service.get("code") or "",
        "icon_code": service.get("icon_code") or "",
        "image": service.get("image") or service.get("image_url") or "",
        "image_url": service.get("image_url") or service.get("image") or "",
    }


def safe_rule(rule):
    return {
        "id": str(rule.get("_id")),
        "provider": rule.get("provider", PROVIDER),
        "scope": rule.get("scope"),
        "country_id": rule.get("country_id"),
        "country_title": rule.get("country_title"),
        "country_code": rule.get("country_code"),
        "country_flag_url": rule.get("country_flag_url"),
        "service_id": rule.get("service_id"),
        "service_title": rule.get("service_title"),
        "service_code": rule.get("service_code"),
        "service_image_url": rule.get("service_image_url"),
        "price": to_float(rule.get("price")),
        "currency": rule.get("currency", "GHS"),
        "is_active": bool(rule.get("is_active", True)),
        "created_at": rule.get("created_at").isoformat() if rule.get("created_at") else None,
        "updated_at": rule.get("updated_at").isoformat() if rule.get("updated_at") else None,
    }


def iso(value):
    return value.isoformat() if value else None


def parse_date(value, end_of_day=False):
    value = clean_string(value)
    if not value:
        return None
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        try:
            parsed = datetime.strptime(value, "%Y-%m-%d")
        except ValueError:
            return None
    if end_of_day and len(value) == 10:
        parsed = parsed.replace(hour=23, minute=59, second=59, microsecond=999000)
    return parsed


def safe_request_log(log, include_detail=False):
    payload = {
        "id": str(log.get("_id")),
        "provider": log.get("provider", PROVIDER),
        "action": log.get("action", ""),
        "method": log.get("method", "GET"),
        "endpoint": log.get("endpoint", ""),
        "request_id": log.get("request_id") or "",
        "otp_order_id": str(log.get("otp_order_id")) if log.get("otp_order_id") else "",
        "order_id": str(log.get("order_id") or log.get("otp_order_id") or "") if (log.get("order_id") or log.get("otp_order_id")) else "",
        "user_id": str(log.get("user_id")) if log.get("user_id") else "",
        "admin_id": str(log.get("admin_id")) if log.get("admin_id") else "",
        "status": log.get("status", ""),
        "error_code": log.get("error_code") or "",
        "error_msg": log.get("error_msg") or "",
        "duration_ms": int(log.get("duration_ms", 0) or 0),
        "created_at": iso(log.get("created_at")),
        "request_params_safe": log.get("request_params_safe") or {},
    }
    if include_detail:
        payload["response_safe"] = log.get("response_safe") or {}
    return payload


def get_country(country_id):
    return countries_collection().find_one({
        "provider": PROVIDER,
        "is_active": True,
        "$or": [
            {"country_id": country_id},
            {"provider_id": country_id},
        ],
    })


def get_service(service_id):
    return services_collection().find_one({
        "provider": PROVIDER,
        "is_active": True,
        "$or": [
            {"provider_id": service_id},
            {"service_id": service_id},
        ],
    })


@admin_smsman_bp.get("/countries")
@require_admin
def get_smsman_countries(payload):
    q = clean_string(request.args.get("q", ""))
    query = {"provider": PROVIDER, "is_active": True}
    if q:
        pattern = re.escape(q)
        query["$or"] = [
            {"title": {"$regex": pattern, "$options": "i"}},
            {"code": {"$regex": pattern, "$options": "i"}},
            {"country_id": {"$regex": pattern, "$options": "i"}},
            {"provider_id": {"$regex": pattern, "$options": "i"}},
        ]
    return paginated_response(countries_collection(), query, "title", safe_country, "countries")


@admin_smsman_bp.get("/services")
@require_admin
def get_smsman_services(payload):
    q = clean_string(request.args.get("q", ""))
    query = {"provider": PROVIDER, "is_active": True}
    if q:
        pattern = re.escape(q)
        query["$or"] = [
            {"title": {"$regex": pattern, "$options": "i"}},
            {"name": {"$regex": pattern, "$options": "i"}},
            {"code": {"$regex": pattern, "$options": "i"}},
            {"provider_id": {"$regex": pattern, "$options": "i"}},
            {"service_id": {"$regex": pattern, "$options": "i"}},
        ]
    return paginated_response(services_collection(), query, "title", safe_service, "services")


@admin_smsman_bp.get("/pricing")
@require_admin
def get_smsman_pricing(payload):
    global_rule = pricing_rules_collection().find_one({
        "provider": PROVIDER,
        "scope": "global",
        "is_active": True,
    })
    overrides = pricing_rules_collection().find({
        "provider": PROVIDER,
        "scope": "country_service",
        "is_active": True,
    }).sort([("service_title", 1), ("country_title", 1)])
    return jsonify({
        "success": True,
        "global_rule": safe_rule(global_rule) if global_rule else None,
        "overrides": [safe_rule(rule) for rule in overrides],
    })


@admin_smsman_bp.post("/pricing/global")
@require_admin
def save_smsman_global_pricing(payload):
    data = request.get_json(silent=True) or {}
    price = to_float(data.get("price"), -1)
    currency = clean_string(data.get("currency", "GHS")) or "GHS"
    if price <= 0:
        return {"success": False, "message": "Enter a valid fixed price."}, 400

    now = now_utc()
    update = {
        "provider": PROVIDER,
        "scope": "global",
        "country_id": None,
        "country_title": None,
        "country_code": None,
        "service_id": None,
        "service_title": None,
        "service_code": None,
        "price": price,
        "currency": currency,
        "is_active": True,
        "updated_at": now,
    }
    pricing_rules_collection().update_many(
        {"provider": PROVIDER, "scope": "global", "is_active": True},
        {"$set": {"is_active": False, "updated_at": now}},
    )
    pricing_rules_collection().update_one(
        {"provider": PROVIDER, "scope": "global"},
        {"$set": update, "$setOnInsert": {"created_at": now}},
        upsert=True,
    )
    rule = pricing_rules_collection().find_one({"provider": PROVIDER, "scope": "global", "is_active": True})
    return jsonify({"success": True, "message": "Global SMS-MAN price saved.", "global_rule": safe_rule(rule)})


@admin_smsman_bp.post("/pricing/override")
@require_admin
def save_smsman_override(payload):
    data = request.get_json(silent=True) or {}
    country_id = clean_string(data.get("country_id", ""))
    service_id = clean_string(data.get("service_id", ""))
    price = to_float(data.get("price"), -1)
    currency = clean_string(data.get("currency", "GHS")) or "GHS"

    if not country_id or not service_id:
        return {"success": False, "message": "Country and service are required."}, 400
    if price <= 0:
        return {"success": False, "message": "Enter a valid fixed price."}, 400

    country = get_country(country_id)
    if not country:
        return {"success": False, "message": "Country not found."}, 404
    service = get_service(service_id)
    if not service:
        return {"success": False, "message": "Service not found."}, 404

    safe_country_doc = safe_country(country)
    safe_service_doc = safe_service(service)
    now = now_utc()
    update = {
        "provider": PROVIDER,
        "scope": "country_service",
        "country_id": safe_country_doc["country_id"],
        "country_title": safe_country_doc["title"],
        "country_code": safe_country_doc["code"],
        "country_flag_url": safe_country_doc["flag_url"],
        "service_id": safe_service_doc["service_id"],
        "service_title": safe_service_doc["title"],
        "service_code": safe_service_doc["code"],
        "service_image_url": safe_service_doc["image_url"],
        "price": price,
        "currency": currency,
        "is_active": True,
        "updated_at": now,
    }
    pricing_rules_collection().update_one(
        {
            "provider": PROVIDER,
            "scope": "country_service",
            "country_id": safe_country_doc["country_id"],
            "service_id": safe_service_doc["service_id"],
        },
        {"$set": update, "$setOnInsert": {"created_at": now}},
        upsert=True,
    )
    rule = pricing_rules_collection().find_one({
        "provider": PROVIDER,
        "scope": "country_service",
        "country_id": safe_country_doc["country_id"],
        "service_id": safe_service_doc["service_id"],
        "is_active": True,
    })
    return jsonify({"success": True, "message": "SMS-MAN override saved.", "override": safe_rule(rule)})


@admin_smsman_bp.delete("/pricing/override/<rule_id>")
@require_admin
def delete_smsman_override(payload, rule_id):
    try:
        object_id = ObjectId(rule_id)
    except Exception:
        return {"success": False, "message": "Invalid override id."}, 400

    result = pricing_rules_collection().update_one(
        {"_id": object_id, "provider": PROVIDER, "scope": "country_service", "is_active": True},
        {"$set": {"is_active": False, "updated_at": now_utc()}},
    )
    if not result.matched_count:
        return {"success": False, "message": "Override not found."}, 404
    return jsonify({"success": True, "message": "SMS-MAN override deleted."})


@admin_smsman_bp.post("/sync-data")
@require_admin
def sync_smsman_data(payload):
    try:
        countries = sync_countries(context={"admin_id": payload.get("user_id", "admin")})
        services = sync_services(context={"admin_id": payload.get("user_id", "admin")})
    except SmsmanError as exc:
        return {"success": False, "message": exc.message, "code": exc.code}, 400
    country_count = len(countries) if isinstance(countries, list) else len(countries or {})
    service_count = len(services) if isinstance(services, list) else len(services or {})
    return jsonify({
        "success": True,
        "message": "SMS-MAN sync request completed.",
        "country_count": country_count,
        "service_count": service_count,
    })


@admin_smsman_bp.get("/request-logs")
@require_admin
def get_smsman_request_logs(payload):
    page, limit = page_params()
    limit = min(limit, 100)
    skip = (page - 1) * limit
    query = {"provider": PROVIDER}
    action = clean_string(request.args.get("action", ""))
    status = clean_string(request.args.get("status", ""))
    request_id = clean_string(request.args.get("request_id", ""))
    user_id = clean_string(request.args.get("user_id", ""))
    date_from = parse_date(request.args.get("date_from", ""))
    date_to = parse_date(request.args.get("date_to", ""), end_of_day=True)
    if action and action != "all":
        query["action"] = action
    if status and status != "all":
        query["status"] = status
    if request_id:
        query["request_id"] = {"$regex": re.escape(request_id), "$options": "i"}
    if user_id:
        try:
            query["user_id"] = ObjectId(user_id)
        except Exception:
            query["user_id"] = user_id
    if date_from or date_to:
        query["created_at"] = {}
        if date_from:
            query["created_at"]["$gte"] = date_from
        if date_to:
            query["created_at"]["$lte"] = date_to

    total = request_logs_collection().count_documents(query)
    logs = list(request_logs_collection().find(query).sort("created_at", -1).skip(skip).limit(limit))
    return jsonify({
        "success": True,
        "logs": [safe_request_log(log) for log in logs],
        "pagination": {
            "page": page,
            "limit": limit,
            "total": total,
            "pages": max(1, ((total + limit - 1) // limit) if total else 1),
        },
    })


@admin_smsman_bp.get("/request-logs/<log_id>")
@require_admin
def get_smsman_request_log(payload, log_id):
    try:
        object_id = ObjectId(log_id)
    except Exception:
        return {"success": False, "message": "Invalid request log id."}, 400
    log = request_logs_collection().find_one({"_id": object_id, "provider": PROVIDER})
    if not log:
        return {"success": False, "message": "Request log not found."}, 404
    return jsonify({"success": True, "log": safe_request_log(log, include_detail=True)})
