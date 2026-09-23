from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import timedelta
import re
import random
import secrets

import requests
from bson import ObjectId
from flask import Blueprint, current_app, jsonify, request

from config import Config
from services.smsman_provider import SmsmanError, check_limits, get_sms, live_purchase_enabled, public_error_message, request_number, set_status
from utils.auth import require_auth
from utils.notifications import create_notification
from utils.security import clean_string, now_utc


otp_bp = Blueprint("otp", __name__, url_prefix="/api/otp")
PROVIDER = "smsman"
SMSMAN_BASE_URL = "https://api.sms-man.com/control"
CACHE_MINUTES = 5
COUNTRY_PRICE_TIMEOUT = 8
PRICE_FETCH_WORKERS = 12
DEFAULT_PRICE_COUNTRY_LIMIT = 20
POPULAR_NAMES = [
    "whatsapp", "telegram", "gmail", "google", "youtube", "facebook", "instagram", "tiktok",
    "discord", "netflix", "microsoft", "paypal", "binance", "snapchat", "uber", "amazon",
    "linkedin", "spotify",
]
POPULAR_ALIASES = {
    "x": {"x", "twitter"},
    "google": {"google", "gmail", "youtube"},
    "microsoft": {"microsoft", "outlook", "hotmail"},
    "openai": {"openai", "chatgpt"},
}
POPULAR_COUNTRY_CODES = [
    "US", "GB", "DE", "FR", "CA", "AU", "NL", "ES", "IT", "SE",
    "GH", "NG", "ZA", "KE", "IN", "BR", "MX", "TR", "AE", "PL",
    "PT", "BE", "CH", "IE", "NO", "DK", "FI", "AT", "CZ", "RO",
]


def db():
    return current_app.config["DB"]


def services_collection():
    return db().smsman_services


def countries_collection():
    return db().smsman_countries


def pricing_rules_collection():
    return db().smsman_pricing_rules


def price_cache_collection():
    return db().smsman_price_cache


def users_collection():
    return db().users


def otp_orders_collection():
    return db().otp_orders


def wallet_transactions_collection():
    return db().wallet_transactions


def user_object_id(value):
    try:
        return ObjectId(value)
    except Exception:
        return value


def to_float(value, default=0.0):
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def to_money(value, default=0.0):
    return round(to_float(value, default), 2)


def to_int(value, default=0):
    try:
        return int(float(value))
    except (TypeError, ValueError):
        return default


def page_params():
    page = max(1, to_int(request.args.get("page"), 1))
    limit = min(max(1, to_int(request.args.get("limit"), 24)), 50)
    return page, limit


def is_popular_service(service):
    text = " ".join([
        str(service.get("title") or ""),
        str(service.get("name") or ""),
        str(service.get("code") or ""),
    ]).lower()
    words = set(re.findall(r"[a-z0-9]+", text))
    return any(name in words or name in text for name in POPULAR_NAMES) or any(
        bool(words & aliases) for aliases in POPULAR_ALIASES.values()
    )


def popularity_rank(service):
    text = " ".join([
        str(service.get("title") or ""),
        str(service.get("name") or ""),
        str(service.get("code") or ""),
    ]).lower()
    for index, name in enumerate(POPULAR_NAMES):
        if name in text:
            return index
    return len(POPULAR_NAMES) + 1


def safe_service(service):
    title = service.get("title") or service.get("name") or ""
    image_url = service.get("image_url") or service.get("image") or ""
    return {
        "service_id": str(service.get("provider_id") or service.get("service_id") or ""),
        "title": title,
        "name": service.get("name") or title,
        "code": service.get("code") or "",
        "image_url": image_url,
        "is_popular": is_popular_service(service),
    }


def safe_country(country, price_info):
    final_price = to_float(price_info.get("final_price"))
    return {
        "country_id": str(country.get("country_id") or country.get("provider_id") or ""),
        "title": country.get("title") or "",
        "code": country.get("code") or "",
        "flag": country.get("flag") or country.get("flag_url") or "",
        "flag_url": country.get("flag_url") or country.get("flag") or "",
        "available_count": to_int(price_info.get("available_count")),
        "price": final_price,
        "currency": "GHS",
    }


def flag_emoji(country_code):
    code = str(country_code or "").strip().upper()
    if len(code) != 2 or not code.isalpha():
        return ""
    return "".join(chr(ord(char) + 127397) for char in code)


def flag_image_url(country_code):
    code = str(country_code or "").strip().lower()
    if len(code) != 2 or not code.isalpha():
        return ""
    return f"https://flagcdn.com/w40/{code}.png"


def safe_country_list_item(country):
    code = country.get("code") or ""
    return {
        "country_id": str(country.get("country_id") or country.get("provider_id") or ""),
        "title": country.get("title") or "",
        "code": code,
        "flag_image": flag_image_url(code),
        "flag_emoji": flag_emoji(code),
        "flag": country.get("flag") or country.get("flag_url") or "",
        "flag_url": country.get("flag_url") or country.get("flag") or "",
    }


def iso(value):
    return value.isoformat() if value else None


def current_user(payload):
    user_id = payload.get("user_id") or payload.get("sub")
    try:
        return users_collection().find_one({"_id": ObjectId(user_id)})
    except Exception:
        return None


def country_flag_image(country):
    code = country.get("code") or ""
    return country.get("flag_url") or country.get("flag") or flag_image_url(code)


def mock_phone_number(country_code):
    prefixes = {
        "GH": "+233", "US": "+1", "CA": "+1", "GB": "+44", "UK": "+44",
        "DE": "+49", "FR": "+33", "AU": "+61", "NG": "+234", "ZA": "+27",
        "KE": "+254", "IN": "+91", "BR": "+55", "MX": "+52",
    }
    prefix = prefixes.get(str(country_code or "").upper(), "+999")
    return f"{prefix}{random.randint(100000000, 999999999)}"


def mock_otp_code():
    return str(random.randint(100000, 999999))


def safe_order(order):
    return {
        "id": str(order.get("_id")),
        "user_id": str(order.get("user_id")) if order.get("user_id") else "",
        "provider": order.get("provider", PROVIDER),
        "mode": order.get("mode", "mock"),
        "provider_request_id": order.get("provider_request_id", ""),
        "provider_status": order.get("provider_status", ""),
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
        "price": to_money(order.get("price")),
        "currency": order.get("currency", "GHS"),
        "status": order.get("status", "waiting"),
        "expires_at": iso(order.get("expires_at")),
        "received_at": iso(order.get("received_at")),
        "created_at": iso(order.get("created_at")),
        "updated_at": iso(order.get("updated_at")),
    }


def extract_purchase_id(data):
    if not isinstance(data, dict):
        return ""
    return str(data.get("request_id") or data.get("id") or "")


def extract_purchase_number(data):
    if not isinstance(data, dict):
        return ""
    return str(data.get("number") or data.get("phone") or data.get("phone_number") or "")


def extract_sms_code(data):
    if not isinstance(data, dict):
        return ""
    for key in ("sms_code", "code", "otp_code", "sms"):
        value = data.get(key)
        if value:
            return str(value)
    for value in data.values():
        if isinstance(value, dict):
            code = extract_sms_code(value)
            if code:
                return code
    return ""


def refund_wallet(user, order, reason="OTP refund"):
    refund = to_money(order.get("price"))
    if refund <= 0:
        return to_money(user.get("wallet_balance") if user.get("wallet_balance") is not None else user.get("balance"))
    fresh_user = users_collection().find_one({"_id": user["_id"]}) or user
    current_balance = to_money(fresh_user.get("wallet_balance") if fresh_user.get("wallet_balance") is not None else fresh_user.get("balance"))
    new_balance = round(current_balance + refund, 2)
    now = now_utc()
    users_collection().update_one({"_id": user["_id"]}, {"$set": {"wallet_balance": new_balance, "updated_at": now}})
    wallet_transactions_collection().insert_one({
        "user_id": user["_id"],
        "type": "refund",
        "label": f"{reason} - {order.get('service_name')} {order.get('country_name')}",
        "description": f"{reason} - {order.get('service_name')} {order.get('country_name')}",
        "method": "Wallet",
        "provider": order.get("provider", PROVIDER),
        "amount": refund,
        "currency": order.get("currency", "GHS"),
        "status": "completed",
        "reference": f"OTPR-{now.strftime('%Y%m%d%H%M%S')}-{secrets.token_hex(3).upper()}",
        "balance_before": current_balance,
        "balance_after": new_balance,
        "order_id": order.get("_id"),
        "created_at": now,
        "updated_at": now,
    })
    return new_balance


def mark_order_expired(order):
    now = now_utc()
    if order.get("status") == "waiting" and order.get("expires_at") and order["expires_at"] <= now:
        request_id = order.get("provider_request_id")
        if request_id:
            try:
                set_status(request_id, "reject", context={"otp_order_id": order.get("_id")})
            except SmsmanError:
                pass
        otp_orders_collection().update_one(
            {"_id": order["_id"], "status": "waiting"},
            {"$set": {"status": "expired", "provider_status": "expired", "updated_at": now}},
        )
        order["status"] = "expired"
        order["provider_status"] = "expired"
        order["updated_at"] = now
    return order


def get_service(service_id):
    return services_collection().find_one({
        "provider": PROVIDER,
        "is_active": True,
        "$or": [
            {"provider_id": service_id},
            {"service_id": service_id},
        ],
    })


def global_price_rule():
    return pricing_rules_collection().find_one({
        "provider": PROVIDER,
        "scope": "global",
        "is_active": True,
    })


def override_price_rules(service_id):
    rules = pricing_rules_collection().find({
        "provider": PROVIDER,
        "scope": "country_service",
        "service_id": service_id,
        "is_active": True,
    })
    return {str(rule.get("country_id")): rule for rule in rules}


def final_price_for_country(country_id, global_rule, overrides):
    override = overrides.get(str(country_id))
    if override:
        return to_float(override.get("price"))
    if global_rule:
        return to_float(global_rule.get("price"))
    return None


def extract_service_price(country_prices, service_id):
    if not isinstance(country_prices, dict):
        return None
    if service_id in country_prices and isinstance(country_prices[service_id], dict):
        return country_prices[service_id]
    for value in country_prices.values():
        if isinstance(value, dict):
            if service_id in value and isinstance(value[service_id], dict):
                return value[service_id]
            nested = extract_service_price(value, service_id)
            if nested:
                return nested
    return None


def fetch_country_prices(country_id):
    if not Config.SMSMAN_API_TOKEN:
        raise RuntimeError("SMSMAN_API_TOKEN is not configured.")
    response = requests.get(
        f"{SMSMAN_BASE_URL}/get-prices",
        params={"token": Config.SMSMAN_API_TOKEN, "country_id": country_id},
        timeout=COUNTRY_PRICE_TIMEOUT,
    )
    response.raise_for_status()
    data = response.json()
    if isinstance(data, dict) and data.get("success") is False:
        raise RuntimeError(data.get("error") or data.get("message") or "SMS-MAN price request failed.")
    return data


def country_identity(country):
    return str(country.get("country_id") or country.get("provider_id") or "")


def country_projection():
    return {
        "country_id": 1,
        "provider_id": 1,
        "title": 1,
        "code": 1,
        "flag": 1,
        "flag_url": 1,
        "is_active": 1,
        "provider": 1,
    }


def country_search_query(q):
    query = {"provider": PROVIDER, "is_active": True}
    if q:
        pattern = re.escape(q)
        query["$or"] = [
            {"title": {"$regex": pattern, "$options": "i"}},
            {"code": {"$regex": pattern, "$options": "i"}},
            {"country_id": {"$regex": pattern, "$options": "i"}},
            {"provider_id": {"$regex": pattern, "$options": "i"}},
        ]
    return query


def popular_country_rank(country):
    code = str(country.get("code") or "").upper()
    try:
        return POPULAR_COUNTRY_CODES.index(code)
    except ValueError:
        return len(POPULAR_COUNTRY_CODES) + 1


def get_country_candidates(q, page, limit):
    if q:
        query = country_search_query(q)
        total = countries_collection().count_documents(query)
        countries = list(
            countries_collection()
            .find(query, country_projection())
            .sort("title", 1)
            .skip((page - 1) * limit)
            .limit(limit)
        )
        return countries, total

    base_query = {"provider": PROVIDER, "is_active": True}
    total = countries_collection().count_documents(base_query)
    popular_query = {
        **base_query,
        "code": {"$in": POPULAR_COUNTRY_CODES},
    }
    popular = list(countries_collection().find(popular_query, country_projection()))
    popular.sort(key=lambda country: (popular_country_rank(country), (country.get("title") or "").lower()))
    popular_ids = [country_identity(country) for country in popular if country_identity(country)]

    popular_start = (page - 1) * limit
    popular_page = popular[popular_start:popular_start + limit]
    if popular_page:
        page_items = list(popular_page)
        alpha_fill = limit - len(page_items)
        if alpha_fill <= 0:
            return page_items, total
        alpha_skip = 0
    else:
        consumed_popular_pages = (len(popular) + limit - 1) // limit
        last_popular_page_fill = 0 if len(popular) % limit == 0 else limit - (len(popular) % limit)
        alpha_fill = limit
        alpha_skip = last_popular_page_fill + max(0, (page - consumed_popular_pages - 1) * limit)

    alpha_query = {
        **base_query,
        "$and": [
            {"code": {"$nin": POPULAR_COUNTRY_CODES}},
            {"country_id": {"$nin": popular_ids}},
        ],
    }
    alpha_countries = list(
        countries_collection()
        .find(alpha_query, country_projection())
        .sort("title", 1)
        .skip(max(0, alpha_skip))
        .limit(alpha_fill)
    )
    if popular_page:
        page_items.extend(alpha_countries)
        return page_items, total
    return alpha_countries, total


def get_cached_prices_for_countries(service_id, countries):
    now = now_utc()
    cached = price_cache_collection().find_one({
        "provider": PROVIDER,
        "service_id": service_id,
        "expires_at": {"$gt": now},
    })
    prices_by_country = cached.get("prices_by_country") if cached else {}
    failed_country_ids = cached.get("failed_country_ids") if cached else []
    if not isinstance(prices_by_country, dict):
        prices_by_country = {}
    if not isinstance(failed_country_ids, list):
        failed_country_ids = []

    requested_ids = [country_identity(country) for country in countries if country_identity(country)]
    missing_ids = [country_id for country_id in requested_ids if country_id not in prices_by_country and country_id not in failed_country_ids]

    for country in countries:
        country_id = country_identity(country)
        if not country_id or country_id not in missing_ids:
            continue
        try:
            country_prices = fetch_country_prices(country_id)
            service_price = extract_service_price(country_prices, service_id)
            if service_price:
                count = to_int(service_price.get("count"))
                if count > 0:
                    prices_by_country[country_id] = {
                        "base_cost": to_float(service_price.get("cost")),
                        "available_count": count,
                    }
        except Exception as exc:
            if country_id not in failed_country_ids:
                failed_country_ids.append(country_id)

    expires_at = now + timedelta(minutes=CACHE_MINUTES)
    price_cache_collection().update_one(
        {"provider": PROVIDER, "service_id": service_id},
        {
            "$set": {
                "provider": PROVIDER,
                "service_id": service_id,
                "prices_by_country": prices_by_country,
                "failed_country_ids": failed_country_ids[-500:],
                "fetched_at": now,
                "expires_at": expires_at,
            },
            "$unset": {"raw": ""},
        },
        upsert=True,
    )
    return {country_id: prices_by_country[country_id] for country_id in requested_ids if country_id in prices_by_country}


def active_countries():
    return list(
        countries_collection()
        .find({"provider": PROVIDER, "is_active": True}, country_projection())
        .sort("title", 1)
    )


def fetch_service_prices_for_countries(service_id, country_ids):
    now = now_utc()
    cached = price_cache_collection().find_one({
        "provider": PROVIDER,
        "service_id": service_id,
        "expires_at": {"$gt": now},
    })
    prices_by_country = cached.get("prices_by_country") if cached else {}
    failed_country_ids = cached.get("failed_country_ids") if cached else []
    if not isinstance(prices_by_country, dict):
        prices_by_country = {}
    if not isinstance(failed_country_ids, list):
        failed_country_ids = []

    requested_ids = [str(country_id) for country_id in country_ids if str(country_id)]
    cached_subset = {
        country_id: prices_by_country[country_id]
        for country_id in requested_ids
        if country_id in prices_by_country
    }
    missing_ids = [
        country_id
        for country_id in requested_ids
        if country_id not in prices_by_country and country_id not in failed_country_ids
    ]
    if not missing_ids:
        return cached_subset

    country_lookup = {
        country_identity(country): country
        for country in countries_collection().find({
            "provider": PROVIDER,
            "is_active": True,
            "$or": [
                {"country_id": {"$in": missing_ids}},
                {"provider_id": {"$in": missing_ids}},
            ],
        }, country_projection())
    }

    def fetch_one(country_id):
        if not country_id:
            return None, None, True
        try:
            country_prices = fetch_country_prices(country_id)
            service_price = extract_service_price(country_prices, service_id)
            if not service_price:
                return country_id, None, True
            count = to_int(service_price.get("count"))
            if count <= 0:
                return country_id, None, True
            return country_id, {
                "base_cost": to_float(service_price.get("cost")),
                "available_count": count,
            }, False
        except Exception:
            return country_id, None, True

    with ThreadPoolExecutor(max_workers=PRICE_FETCH_WORKERS) as executor:
        futures = [executor.submit(fetch_one, country_id) for country_id in missing_ids if country_id in country_lookup]
        for future in as_completed(futures):
            country_id, price_info, failed = future.result()
            if not country_id:
                continue
            if price_info:
                prices_by_country[country_id] = price_info
                cached_subset[country_id] = price_info
            elif failed and country_id not in failed_country_ids:
                failed_country_ids.append(country_id)

    price_cache_collection().update_one(
        {"provider": PROVIDER, "service_id": service_id},
        {
            "$set": {
                "provider": PROVIDER,
                "service_id": service_id,
                "prices_by_country": prices_by_country,
                "failed_country_ids": failed_country_ids[-500:],
                "fetched_at": now,
                "expires_at": now + timedelta(minutes=CACHE_MINUTES),
            },
            "$unset": {"raw": ""},
        },
        upsert=True,
    )
    return cached_subset


def default_price_country_ids(limit=DEFAULT_PRICE_COUNTRY_LIMIT):
    countries = get_country_candidates("", 1, limit)[0]
    return [country_identity(country) for country in countries if country_identity(country)]


def final_price_map_for_service(service_id, prices_by_country):
    global_rule = global_price_rule()
    overrides = override_price_rules(service_id)
    result = {}
    for country_id, price_info in prices_by_country.items():
        final_price = final_price_for_country(country_id, global_rule, overrides)
        if final_price is None or final_price <= 0:
            continue
        result[str(country_id)] = {
            "final_price": final_price,
            "available_count": to_int(price_info.get("available_count")),
        }
    return result


def fixed_price_map_for_countries(service_id, country_ids):
    global_rule = global_price_rule()
    overrides = override_price_rules(service_id)
    result = {}
    for country_id in country_ids:
        final_price = final_price_for_country(country_id, global_rule, overrides)
        if final_price is None or final_price <= 0:
            continue
        result[str(country_id)] = {"final_price": final_price}
    return result


@otp_bp.get("/services")
@require_auth
def otp_services(payload):
    page, limit = page_params()
    q = clean_string(request.args.get("q", ""))
    popular_only = str(request.args.get("popular", "")).lower() in {"1", "true", "yes"}

    query = {"provider": PROVIDER, "is_active": True}
    if q:
        query["$or"] = [
            {"title": {"$regex": re.escape(q), "$options": "i"}},
            {"name": {"$regex": re.escape(q), "$options": "i"}},
            {"code": {"$regex": re.escape(q), "$options": "i"}},
            {"provider_id": {"$regex": re.escape(q), "$options": "i"}},
            {"service_id": {"$regex": re.escape(q), "$options": "i"}},
        ]

    services = list(services_collection().find(query))
    if popular_only:
        services = [service for service in services if is_popular_service(service)]
    services.sort(key=lambda service: (0 if is_popular_service(service) else 1, popularity_rank(service), (service.get("title") or service.get("name") or "").lower()))

    total = len(services)
    start = (page - 1) * limit
    page_items = services[start:start + limit]
    return jsonify({
        "ok": True,
        "success": True,
        "data": [safe_service(service) for service in page_items],
        "pagination": {
            "page": page,
            "limit": limit,
            "total": total,
            "has_more": start + limit < total,
        },
    })


@otp_bp.get("/countries-list")
@require_auth
def otp_countries_list(payload):
    countries = [
        safe_country_list_item(country)
        for country in active_countries()
        if country_identity(country)
    ]
    response = jsonify({
        "ok": True,
        "success": True,
        "data": countries,
    })
    response.headers["Cache-Control"] = "public, max-age=86400"
    return response


@otp_bp.get("/service-prices")
@require_auth
def otp_service_prices(payload):
    service_id = clean_string(request.args.get("service_id", ""))
    if not service_id:
        return {"success": False, "ok": False, "message": "service_id is required."}, 400
    service = get_service(service_id)
    if not service:
        return {"success": False, "ok": False, "message": "Service not found."}, 404

    country_ids_param = clean_string(request.args.get("country_ids", ""))
    country_ids = [
        clean_string(country_id)
        for country_id in country_ids_param.split(",")
        if clean_string(country_id)
    ]
    if not country_ids:
        country_ids = default_price_country_ids()
    country_ids = country_ids[:50]

    now = now_utc()
    price_cache_collection().update_one(
        {"provider": PROVIDER, "service_id": service_id},
        {
            "$set": {
                "provider": PROVIDER,
                "service_id": service_id,
                "last_fixed_price_lookup_at": now,
            },
            "$unset": {"raw": ""},
        },
        upsert=True,
    )
    return jsonify({
        "ok": True,
        "success": True,
        "service_id": service_id,
        "requested_country_ids": country_ids,
        "data": fixed_price_map_for_countries(service_id, country_ids),
    })


@otp_bp.post("/mock-purchase")
@require_auth
def otp_mock_purchase(payload):
    user = current_user(payload)
    if not user:
        return {"success": False, "ok": False, "message": "User account not found."}, 404
    if user.get("account_status") != "active":
        return {"success": False, "ok": False, "message": "Your account is not active."}, 403

    data = request.get_json(silent=True) or {}
    service_id = clean_string(data.get("service_id", ""))
    country_id = clean_string(data.get("country_id", ""))
    currency = clean_string(data.get("currency", ""))
    max_price = data.get("maxPrice", data.get("max_price"))
    if not service_id or not country_id:
        return {"success": False, "ok": False, "message": "Service and country are required."}, 400

    service = get_service(service_id)
    if not service:
        return {"success": False, "ok": False, "message": "Service not found."}, 404
    country = countries_collection().find_one({
        "provider": PROVIDER,
        "is_active": True,
        "$or": [{"country_id": country_id}, {"provider_id": country_id}],
    })
    if not country:
        return {"success": False, "ok": False, "message": "Country not found."}, 404

    final_price = final_price_for_country(country_id, global_price_rule(), override_price_rules(service_id))
    price = to_money(final_price, -1)
    if price <= 0:
        return {"success": False, "ok": False, "message": "No price is configured for this OTP country."}, 400

    current_balance = to_money(user.get("wallet_balance") if user.get("wallet_balance") is not None else user.get("balance"))
    if current_balance < price:
        return {"success": False, "ok": False, "message": "Insufficient wallet balance."}, 400

    new_balance = round(current_balance - price, 2)
    now = now_utc()
    updated = users_collection().update_one(
        {"_id": user["_id"], "wallet_balance": {"$gte": price}},
        {"$set": {"wallet_balance": new_balance, "updated_at": now}},
    )
    if not updated.modified_count:
        return {"success": False, "ok": False, "message": "Insufficient wallet balance."}, 400

    safe_service_doc = safe_service(service)
    safe_country_doc = safe_country_list_item(country)
    order_doc = {
        "user_id": user["_id"],
        "provider": PROVIDER,
        "mode": "mock",
        "service_id": safe_service_doc["service_id"],
        "service_name": safe_service_doc["title"] or safe_service_doc["name"],
        "service_code": safe_service_doc["code"],
        "service_image_url": safe_service_doc["image_url"],
        "country_id": safe_country_doc["country_id"],
        "country_name": safe_country_doc["title"],
        "country_code": safe_country_doc["code"],
        "country_flag_image": safe_country_doc.get("flag_image") or country_flag_image(country),
        "phone_number": mock_phone_number(safe_country_doc["code"]),
        "otp_code": mock_otp_code(),
        "price": price,
        "currency": "GHS",
        "status": "received",
        "expires_at": now + timedelta(minutes=20),
        "received_at": now,
        "created_at": now,
        "updated_at": now,
    }
    result = otp_orders_collection().insert_one(order_doc)
    order_doc["_id"] = result.inserted_id

    wallet_transactions_collection().insert_one({
        "user_id": user["_id"],
        "type": "otp_purchase",
        "label": f"OTP number purchase - {order_doc['service_name']} {order_doc['country_name']}",
        "description": f"OTP number purchase - {order_doc['service_name']} {order_doc['country_name']}",
        "method": "Wallet",
        "provider": PROVIDER,
        "amount": price,
        "currency": "GHS",
        "status": "completed",
        "reference": f"OTP-{now.strftime('%Y%m%d%H%M%S')}-{secrets.token_hex(3).upper()}",
        "balance_before": current_balance,
        "balance_after": new_balance,
        "order_id": result.inserted_id,
        "created_at": now,
        "updated_at": now,
    })

    create_notification(
        user["_id"], "otp", "OTP number purchased",
        f"Your {order_doc['service_name']} number for {order_doc['country_name']} is ready.",
        "success", "otp_orders", str(result.inserted_id), "/user/otp-receives",
        {"order_id": str(result.inserted_id), "price": price},
    )
    create_notification(
        user["_id"], "otp", "OTP received",
        f"Demo OTP code {order_doc['otp_code']} was received for {order_doc['service_name']}.",
        "success", "otp_orders", str(result.inserted_id), "/user/otp-receives",
        {"order_id": str(result.inserted_id), "otp_code": order_doc["otp_code"]},
    )

    return jsonify({
        "ok": True,
        "success": True,
        "message": "Number purchased successfully",
        "order": safe_order(order_doc),
        "wallet_balance": new_balance,
    })


@otp_bp.post("/purchase")
@require_auth
def otp_purchase(payload):
    user = current_user(payload)
    if not user:
        return {"success": False, "ok": False, "message": "User account not found."}, 404
    if user.get("account_status") != "active":
        return {"success": False, "ok": False, "message": "Your account is not active."}, 403
    if not live_purchase_enabled():
        return {"success": False, "ok": False, "message": "Live OTP purchase is currently disabled."}, 503

    data = request.get_json(silent=True) or {}
    service_id = clean_string(data.get("service_id", ""))
    country_id = clean_string(data.get("country_id", ""))
    currency = clean_string(data.get("currency", ""))
    max_price = data.get("maxPrice", data.get("max_price"))
    if not service_id or not country_id:
        return {"success": False, "ok": False, "message": "Service and country are required."}, 400

    service = get_service(service_id)
    if not service:
        return {"success": False, "ok": False, "message": "Service not found."}, 404
    country = countries_collection().find_one({
        "provider": PROVIDER,
        "is_active": True,
        "country_id": country_id,
    })
    if not country:
        return {"success": False, "ok": False, "message": "Country not found."}, 404

    price = to_money(final_price_for_country(country_id, global_price_rule(), override_price_rules(service_id)), -1)
    if price <= 0:
        return {"success": False, "ok": False, "message": "No price is configured for this OTP country."}, 400

    current_balance = to_money(user.get("wallet_balance") if user.get("wallet_balance") is not None else user.get("balance"))
    if current_balance < price:
        return {"success": False, "ok": False, "message": "Insufficient wallet balance."}, 400

    now = now_utc()
    safe_service_doc = safe_service(service)
    safe_country_doc = safe_country_list_item(country)
    if not safe_country_doc["country_id"].isdigit() or not safe_service_doc["service_id"].isdigit():
        return {"success": False, "ok": False, "message": "Invalid SMS-MAN service or country id."}, 400

    recent_processing = otp_orders_collection().find_one({
        "user_id": user["_id"],
        "provider": PROVIDER,
        "mode": "live",
        "service_id": safe_service_doc["service_id"],
        "country_id": safe_country_doc["country_id"],
        "status": "processing",
        "created_at": {"$gte": now - timedelta(minutes=2)},
    })
    if recent_processing:
        return {
            "success": False,
            "ok": False,
            "message": "A number purchase is already processing. Please wait a moment.",
            "order": safe_order(recent_processing),
            "wallet_balance": current_balance,
        }, 409

    order_doc = {
        "user_id": user["_id"],
        "provider": PROVIDER,
        "mode": "live",
        "provider_country_id": safe_country_doc["country_id"],
        "provider_application_id": safe_service_doc["service_id"],
        "service_id": safe_service_doc["service_id"],
        "service_name": safe_service_doc["title"] or safe_service_doc["name"],
        "service_code": safe_service_doc["code"],
        "service_image_url": safe_service_doc["image_url"],
        "country_id": safe_country_doc["country_id"],
        "country_name": safe_country_doc["title"],
        "country_code": safe_country_doc["code"],
        "country_flag_image": safe_country_doc.get("flag_image") or country_flag_image(country),
        "price": price,
        "currency": "GHS",
        "status": "processing",
        "provider_status": "precheck",
        "expires_at": now + timedelta(minutes=20),
        "received_at": None,
        "wallet_deducted": False,
        "created_at": now,
        "updated_at": now,
    }
    result = otp_orders_collection().insert_one(order_doc)
    order_doc["_id"] = result.inserted_id

    try:
        check_limits(
            safe_country_doc["country_id"],
            safe_service_doc["service_id"],
            context={"user_id": user["_id"], "otp_order_id": result.inserted_id},
        )
    except SmsmanError as exc:
        failed_at = now_utc()
        otp_orders_collection().update_one(
            {"_id": result.inserted_id},
            {"$set": {
                "status": "failed",
                "provider_status": exc.code,
                "failure_message": public_error_message(exc.code),
                "provider_raw_purchase": exc.raw,
                "updated_at": failed_at,
            }},
        )
        return {"success": False, "ok": False, "message": public_error_message(exc.code), "code": exc.code, "wallet_balance": current_balance}, 400

    new_balance = round(current_balance - price, 2)
    updated = users_collection().update_one(
        {"_id": user["_id"], "wallet_balance": {"$gte": price}},
        {"$set": {"wallet_balance": new_balance, "updated_at": now_utc()}},
    )
    if not updated.modified_count:
        otp_orders_collection().update_one(
            {"_id": result.inserted_id},
            {"$set": {"status": "failed", "provider_status": "insufficient_wallet", "failure_message": "Insufficient wallet balance.", "updated_at": now_utc()}},
        )
        return {"success": False, "ok": False, "message": "Insufficient wallet balance."}, 400
    otp_orders_collection().update_one(
        {"_id": result.inserted_id},
        {"$set": {"wallet_deducted": True, "provider_status": "purchase_requested", "updated_at": now_utc()}},
    )
    order_doc["wallet_deducted"] = True
    wallet_transactions_collection().insert_one({
        "user_id": user["_id"],
        "type": "otp_purchase",
        "label": f"OTP number purchase - {order_doc['service_name']} {order_doc['country_name']}",
        "description": f"OTP number purchase - {order_doc['service_name']} {order_doc['country_name']}",
        "method": "Wallet",
        "provider": PROVIDER,
        "amount": price,
        "currency": "GHS",
        "status": "completed",
        "reference": f"OTP-{now.strftime('%Y%m%d%H%M%S')}-{secrets.token_hex(3).upper()}",
        "balance_before": current_balance,
        "balance_after": new_balance,
        "order_id": result.inserted_id,
        "created_at": now,
        "updated_at": now,
    })

    try:
        purchase = request_number(
            safe_country_doc["country_id"],
            safe_service_doc["service_id"],
            max_price=max_price,
            currency=currency or None,
            context={"user_id": user["_id"], "otp_order_id": result.inserted_id},
        )
        request_id = extract_purchase_id(purchase)
        phone_number = extract_purchase_number(purchase)
        if not request_id or not phone_number:
            raise SmsmanError("invalid_json", "SMS-MAN did not return a usable number.", purchase)
    except SmsmanError as exc:
        failed_at = now_utc()
        otp_orders_collection().update_one(
            {"_id": result.inserted_id},
            {"$set": {
                "status": "failed",
                "provider_status": exc.code,
                "provider_raw_purchase": exc.raw,
                "failure_message": public_error_message(exc.code),
                "updated_at": failed_at,
            }},
        )
        failed_order = {**order_doc, "status": "failed", "provider_status": exc.code, "provider_raw_purchase": exc.raw, "updated_at": failed_at}
        refunded_balance = refund_wallet(user, failed_order, "OTP purchase refund")
        return {"success": False, "ok": False, "message": public_error_message(exc.code), "code": exc.code, "wallet_balance": refunded_balance}, 400

    otp_orders_collection().update_one(
        {"_id": result.inserted_id},
        {"$set": {
            "provider_request_id": request_id,
            "phone_number": phone_number,
            "status": "waiting",
            "provider_status": "waiting",
            "provider_raw_purchase": purchase,
            "updated_at": now_utc(),
        }},
    )
    order_doc.update({
        "provider_request_id": request_id,
        "phone_number": phone_number,
        "status": "waiting",
        "provider_status": "waiting",
        "provider_raw_purchase": purchase,
    })

    create_notification(
        user["_id"], "otp", "OTP number purchased",
        f"Your {order_doc['service_name']} number for {order_doc['country_name']} is waiting for SMS.",
        "success", "otp_orders", str(result.inserted_id), "/user/otp-receives",
        {"order_id": str(result.inserted_id), "price": price},
    )
    return jsonify({
        "ok": True,
        "success": True,
        "message": "Number purchased successfully. Waiting for SMS.",
        "order": safe_order(order_doc),
        "wallet_balance": new_balance,
    })


@otp_bp.get("/orders")
@require_auth
def otp_orders(payload):
    user = current_user(payload)
    if not user:
        return {"success": False, "ok": False, "message": "User account not found."}, 404
    orders = otp_orders_collection().find({"user_id": user["_id"]}).sort("created_at", -1).limit(100)
    return jsonify({"ok": True, "success": True, "orders": [safe_order(order) for order in orders]})


@otp_bp.get("/orders/active")
@require_auth
def otp_active_orders(payload):
    user = current_user(payload)
    if not user:
        return {"success": False, "ok": False, "message": "User account not found."}, 404
    now = now_utc()
    orders = otp_orders_collection().find({
        "user_id": user["_id"],
        "status": {"$in": ["waiting", "received"]},
        "expires_at": {"$gt": now},
    }).sort("created_at", -1).limit(20)
    return jsonify({"ok": True, "success": True, "orders": [safe_order(order) for order in orders]})


@otp_bp.post("/orders/<order_id>/cancel")
@require_auth
def otp_cancel_order(payload, order_id):
    user = current_user(payload)
    if not user:
        return {"success": False, "ok": False, "message": "User account not found."}, 404
    try:
        object_id = ObjectId(order_id)
    except Exception:
        return {"success": False, "ok": False, "message": "Invalid order id."}, 400

    order = otp_orders_collection().find_one({"_id": object_id, "user_id": user["_id"]})
    if not order:
        return {"success": False, "ok": False, "message": "OTP order not found."}, 404
    if order.get("status") != "waiting" or order.get("received_at") or order.get("otp_code"):
        return {"success": False, "ok": False, "message": "This OTP order can no longer be cancelled."}, 400

    now = now_utc()
    if order.get("provider_request_id"):
        try:
            set_status(order.get("provider_request_id"), "reject", context={"user_id": user["_id"], "otp_order_id": object_id})
        except SmsmanError:
            pass
    otp_orders_collection().update_one(
        {"_id": object_id, "user_id": user["_id"], "status": "waiting"},
        {"$set": {"status": "cancelled", "provider_status": "cancelled", "updated_at": now}},
    )
    order["_id"] = object_id
    new_balance = refund_wallet(user, order, "OTP refund")
    updated_order = otp_orders_collection().find_one({"_id": object_id})
    return jsonify({
        "ok": True,
        "success": True,
        "message": "OTP order cancelled and refunded.",
        "order": safe_order(updated_order),
        "wallet_balance": new_balance,
    })


@otp_bp.post("/orders/<order_id>/check-sms")
@require_auth
def otp_check_sms(payload, order_id):
    user = current_user(payload)
    if not user:
        return {"success": False, "ok": False, "message": "User account not found."}, 404
    try:
        object_id = ObjectId(order_id)
    except Exception:
        return {"success": False, "ok": False, "message": "Invalid order id."}, 400

    order = otp_orders_collection().find_one({"_id": object_id, "user_id": user["_id"]})
    if not order:
        return {"success": False, "ok": False, "message": "OTP order not found."}, 404
    order = mark_order_expired(order)
    if order.get("status") == "expired":
        return jsonify({"ok": True, "success": True, "status": "expired", "message": "OTP order expired.", "order": safe_order(order)})
    if order.get("status") == "received":
        return jsonify({"ok": True, "success": True, "status": "received", "otp_code": order.get("otp_code", ""), "order": safe_order(order)})
    if order.get("status") != "waiting":
        return jsonify({"ok": True, "success": True, "status": order.get("status"), "order": safe_order(order)})
    request_id = order.get("provider_request_id")
    if not request_id:
        return {"success": False, "ok": False, "message": "Provider request id is missing for this order."}, 400

    try:
        sms_data = get_sms(request_id, context={"user_id": user["_id"], "otp_order_id": object_id})
    except SmsmanError as exc:
        if exc.code == "wait_sms":
            otp_orders_collection().update_one(
                {"_id": object_id},
                {"$set": {"provider_status": "wait_sms", "provider_raw_sms": exc.raw, "updated_at": now_utc()}},
            )
            updated = otp_orders_collection().find_one({"_id": object_id})
            return jsonify({"ok": True, "success": True, "status": "waiting", "message": "Waiting for SMS.", "order": safe_order(updated)})
        return {"success": False, "ok": False, "message": exc.message, "code": exc.code}, 400

    otp_code = extract_sms_code(sms_data)
    if not otp_code:
        otp_orders_collection().update_one(
            {"_id": object_id},
            {"$set": {"provider_status": "wait_sms", "provider_raw_sms": sms_data, "updated_at": now_utc()}},
        )
        updated = otp_orders_collection().find_one({"_id": object_id})
        return jsonify({"ok": True, "success": True, "status": "waiting", "message": "Waiting for SMS.", "order": safe_order(updated)})

    now = now_utc()
    otp_orders_collection().update_one(
        {"_id": object_id, "user_id": user["_id"]},
        {"$set": {
            "otp_code": otp_code,
            "status": "received",
            "provider_status": "received",
            "provider_raw_sms": sms_data,
            "received_at": now,
            "updated_at": now,
        }},
    )
    try:
        set_status(request_id, "used", context={"user_id": user["_id"], "otp_order_id": object_id})
    except SmsmanError:
        pass
    create_notification(
        user["_id"], "otp", "OTP received",
        f"OTP code {otp_code} was received for {order.get('service_name', 'your service')}.",
        "success", "otp_orders", str(object_id), "/user/otp-receives",
        {"order_id": str(object_id), "otp_code": otp_code},
    )
    updated = otp_orders_collection().find_one({"_id": object_id})
    return jsonify({"ok": True, "success": True, "status": "received", "otp_code": otp_code, "order": safe_order(updated)})


@otp_bp.get("/countries")
@require_auth
def otp_countries(payload):
    service_id = clean_string(request.args.get("service_id", ""))
    if not service_id:
        return {"success": False, "ok": False, "message": "service_id is required."}, 400
    service = get_service(service_id)
    if not service:
        return {"success": False, "ok": False, "message": "Service not found."}, 404

    page, limit = page_params()
    q = clean_string(request.args.get("q", ""))
    sort = clean_string(request.args.get("sort", "name_asc")) or "name_asc"

    countries, total_countries = get_country_candidates(q, page, limit)
    prices_by_country = get_cached_prices_for_countries(service_id, countries)
    country_by_id = {country_identity(country): country for country in countries}

    global_rule = global_price_rule()
    overrides = override_price_rules(service_id)
    rows = []
    for country_id, price_info in prices_by_country.items():
        country = country_by_id.get(str(country_id))
        if not country:
            continue
        final_price = final_price_for_country(country_id, global_rule, overrides)
        if final_price is None or final_price <= 0:
            continue
        rows.append(safe_country(country, {**price_info, "final_price": final_price}))

    if sort == "price_asc":
        rows.sort(key=lambda row: (row["price"], row["title"].lower()))
    elif sort == "price_desc":
        rows.sort(key=lambda row: (-row["price"], row["title"].lower()))
    elif sort == "availability_desc":
        rows.sort(key=lambda row: (-row["available_count"], row["title"].lower()))
    else:
        rows.sort(key=lambda row: row["title"].lower())

    page_items = rows
    user = users_collection().find_one({"_id": user_object_id(payload.get("user_id"))})
    wallet_balance = to_float(user.get("wallet_balance") if user else 0)
    return jsonify({
        "ok": True,
        "success": True,
        "data": page_items,
        "wallet_balance": wallet_balance,
        "country_fetch_mode": "popular_first" if not q else "search",
        "pagination": {
            "page": page,
            "limit": limit,
            "total": total_countries,
            "has_more": page * limit < total_countries,
        },
    })
