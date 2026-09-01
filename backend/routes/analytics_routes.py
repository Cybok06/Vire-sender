import hashlib
import secrets
from datetime import timedelta

from flask import Blueprint, current_app, jsonify, request
from pymongo import ReturnDocument

from utils.auth import require_admin
from utils.security import clean_string, now_utc

analytics_bp = Blueprint("analytics", __name__, url_prefix="/api/analytics")
admin_analytics_bp = Blueprint("admin_analytics", __name__, url_prefix="/api/admin/analytics")

ALLOWED_CONSENT_TYPES = {"all", "custom", "essential"}
ALLOWED_EVENTS = {
    "page_view",
    "button_click",
    "cta_click",
    "scroll_depth",
    "session_end",
    "consent_saved",
    "location_permission_granted",
    "location_permission_denied",
}


def analytics_collection():
    return current_app.config["DB"].cookie_analytics


def iso(value):
    return value.isoformat() if value else None


def client_ip():
    forwarded = request.headers.get("X-Forwarded-For", "")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.remote_addr or ""


def hash_ip(value: str):
    if not value:
        return ""
    secret = current_app.config.get("JWT_SECRET", "viresend")
    return hashlib.sha256(f"{secret}:{value}".encode("utf-8")).hexdigest()


def clean_dict(value):
    if not isinstance(value, dict):
        return {}
    return {
        clean_string(str(key))[:80]: clean_string(str(item))[:300] if not isinstance(item, bool) else bool(item)
        for key, item in value.items()
        if key is not None
    }


def clean_list(value, limit=50):
    if not isinstance(value, list):
        return []
    return [clean_string(str(item))[:300] for item in value[:limit]]


def clean_float(value):
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def get_rate_key():
    return f"analytics:{hash_ip(client_ip())}:{now_utc().strftime('%Y%m%d%H%M')}"


def rate_limited(max_per_minute=120):
    db = current_app.config["DB"]
    key = get_rate_key()
    now = now_utc()
    result = db.analytics_rate_limits.find_one_and_update(
        {"key": key},
        {"$inc": {"count": 1}, "$setOnInsert": {"created_at": now, "expires_at": now + timedelta(minutes=2)}},
        upsert=True,
        return_document=ReturnDocument.AFTER,
    )
    return int(result.get("count", 0) or 0) > max_per_minute


def visitor_query(data):
    visitor_id = clean_string(data.get("visitor_id", ""))[:80]
    session_id = clean_string(data.get("session_id", ""))[:80]
    if not visitor_id or not session_id:
        return None, None
    return visitor_id, session_id


def base_payload(data, consent_type=None):
    preferences = data.get("consent_preferences") or {}
    utm = data.get("utm") or {}
    return {
        "visitor_id": clean_string(data.get("visitor_id", ""))[:80],
        "session_id": clean_string(data.get("session_id", ""))[:80],
        "consent_type": consent_type or clean_string(data.get("consent_type", ""))[:40],
        "consent_preferences": clean_dict(preferences),
        "page_url": clean_string(data.get("page_url", ""))[:800],
        "referrer": clean_string(data.get("referrer", ""))[:800],
        "browser": clean_string(data.get("browser", ""))[:120],
        "device_type": clean_string(data.get("device_type", ""))[:40],
        "operating_system": clean_string(data.get("operating_system", ""))[:120],
        "screen_size": clean_string(data.get("screen_size", ""))[:40],
        "language": clean_string(data.get("language", ""))[:40],
        "country": clean_string(data.get("country", "") or request.headers.get("CF-IPCountry", ""))[:80],
        "city": clean_string(data.get("city", "") or request.headers.get("X-Appengine-City", ""))[:120],
        "ip_address_hash": hash_ip(client_ip()),
        "user_agent": request.headers.get("User-Agent", "")[:500],
        "utm_source": clean_string(utm.get("utm_source") or data.get("utm_source", ""))[:160],
        "utm_medium": clean_string(utm.get("utm_medium") or data.get("utm_medium", ""))[:160],
        "utm_campaign": clean_string(utm.get("utm_campaign") or data.get("utm_campaign", ""))[:160],
        "latitude": clean_float(data.get("latitude")),
        "longitude": clean_float(data.get("longitude")),
        "location_accuracy": clean_float(data.get("location_accuracy")),
    }


def append_event(visitor_id, session_id, event_name, event_data=None):
    event_data = event_data or {}
    event = {
        "event_id": f"EVT-{now_utc().strftime('%Y%m%d%H%M%S')}-{secrets.token_hex(3).upper()}",
        "name": event_name,
        "data": clean_dict(event_data),
        "created_at": now_utc(),
    }
    location_update = {}
    if event_name == "location_permission_granted":
        latitude = clean_float(event_data.get("latitude"))
        longitude = clean_float(event_data.get("longitude"))
        accuracy = clean_float(event_data.get("location_accuracy"))
        if latitude is not None and longitude is not None:
            location_update = {
                "latitude": latitude,
                "longitude": longitude,
                "location_accuracy": accuracy,
            }
    analytics_collection().update_one(
        {"visitor_id": visitor_id, "session_id": session_id},
        {"$push": {"events": event}, "$set": {"updated_at": now_utc(), "last_activity_at": now_utc(), **location_update}},
        upsert=False,
    )


def safe_session(item):
    events = item.get("events") or []
    return {
        "id": str(item.get("_id")),
        "visitor_id": item.get("visitor_id", ""),
        "session_id": item.get("session_id", ""),
        "consent_type": item.get("consent_type", "essential"),
        "page_url": item.get("page_url", ""),
        "referrer": item.get("referrer", ""),
        "browser": item.get("browser", ""),
        "device_type": item.get("device_type", ""),
        "operating_system": item.get("operating_system", ""),
        "screen_size": item.get("screen_size", ""),
        "language": item.get("language", ""),
        "country": item.get("country", ""),
        "city": item.get("city", ""),
        "latitude": item.get("latitude"),
        "longitude": item.get("longitude"),
        "location_accuracy": item.get("location_accuracy"),
        "utm_source": item.get("utm_source", ""),
        "utm_medium": item.get("utm_medium", ""),
        "utm_campaign": item.get("utm_campaign", ""),
        "events_count": len(events),
        "time_on_page": int(item.get("time_on_page", 0) or 0),
        "scroll_depth": int(item.get("scroll_depth", 0) or 0),
        "pages_visited": item.get("pages_visited", []),
        "created_at": iso(item.get("created_at")),
        "updated_at": iso(item.get("updated_at")),
        "last_activity_at": iso(item.get("last_activity_at") or item.get("updated_at")),
    }


@analytics_bp.post("/consent")
def save_consent():
    if rate_limited():
        return {"success": False, "message": "Too many analytics requests."}, 429
    data = request.get_json(silent=True) or {}
    visitor_id, session_id = visitor_query(data)
    if not visitor_id or not session_id:
        return {"success": False, "message": "Visitor and session are required."}, 400
    consent_type = clean_string(data.get("consent_type", "essential"))
    if consent_type not in ALLOWED_CONSENT_TYPES:
        consent_type = "essential"
    now = now_utc()
    payload = base_payload(data, consent_type)
    payload.update({
        "events": [{
            "event_id": f"EVT-{now.strftime('%Y%m%d%H%M%S')}-{secrets.token_hex(3).upper()}",
            "name": "consent_saved",
            "data": {"consent_type": consent_type},
            "created_at": now,
        }],
        "pages_visited": clean_list([payload["page_url"]] if payload["page_url"] else []),
        "time_on_page": 0,
        "scroll_depth": 0,
        "created_at": now,
        "updated_at": now,
        "last_activity_at": now,
    })
    analytics_collection().update_one(
        {"visitor_id": visitor_id, "session_id": session_id},
        {"$set": payload, "$setOnInsert": {"first_seen_at": now}},
        upsert=True,
    )
    return jsonify({"success": True, "message": "Consent saved."})


@analytics_bp.post("/page-view")
def page_view():
    if rate_limited():
        return {"success": False, "message": "Too many analytics requests."}, 429
    data = request.get_json(silent=True) or {}
    visitor_id, session_id = visitor_query(data)
    if not visitor_id or not session_id:
        return {"success": False, "message": "Visitor and session are required."}, 400
    now = now_utc()
    payload = base_payload(data)
    payload.pop("consent_type", None)
    page_url = payload.get("page_url", "")
    analytics_collection().update_one(
        {"visitor_id": visitor_id, "session_id": session_id},
        {
            "$set": {**payload, "updated_at": now, "last_activity_at": now},
            "$addToSet": {"pages_visited": page_url},
            "$push": {"events": {"event_id": f"EVT-{now.strftime('%Y%m%d%H%M%S')}-{secrets.token_hex(3).upper()}", "name": "page_view", "data": {"page_url": page_url}, "created_at": now}},
            "$setOnInsert": {"created_at": now, "time_on_page": 0, "scroll_depth": 0},
        },
        upsert=True,
    )
    return jsonify({"success": True})


@analytics_bp.post("/event")
def event():
    if rate_limited():
        return {"success": False, "message": "Too many analytics requests."}, 429
    data = request.get_json(silent=True) or {}
    visitor_id, session_id = visitor_query(data)
    event_name = clean_string(data.get("event_name", ""))[:80]
    if not visitor_id or not session_id or event_name not in ALLOWED_EVENTS:
        return {"success": False, "message": "Invalid analytics event."}, 400
    append_event(visitor_id, session_id, event_name, data.get("event_data") or {})
    return jsonify({"success": True})


@analytics_bp.post("/session-end")
def session_end():
    if rate_limited():
        return {"success": False, "message": "Too many analytics requests."}, 429
    data = request.get_json(silent=True) or {}
    visitor_id, session_id = visitor_query(data)
    if not visitor_id or not session_id:
        return {"success": False, "message": "Visitor and session are required."}, 400
    time_on_page = max(0, int(data.get("time_on_page", 0) or 0))
    scroll_depth = max(0, min(100, int(data.get("scroll_depth", 0) or 0)))
    analytics_collection().update_one(
        {"visitor_id": visitor_id, "session_id": session_id},
        {"$max": {"time_on_page": time_on_page, "scroll_depth": scroll_depth}, "$set": {"updated_at": now_utc(), "last_activity_at": now_utc()}},
    )
    append_event(visitor_id, session_id, "session_end", {"time_on_page": time_on_page, "scroll_depth": scroll_depth})
    return jsonify({"success": True})


@admin_analytics_bp.get("/summary")
@require_admin
def admin_summary(payload):
    items = list(analytics_collection().find({}).sort("created_at", -1).limit(5000))
    visitor_ids = {item.get("visitor_id") for item in items if item.get("visitor_id")}
    returning = sum(1 for visitor in visitor_ids if sum(1 for item in items if item.get("visitor_id") == visitor) > 1)
    page_views = sum(1 for item in items for event in item.get("events", []) if event.get("name") == "page_view")
    total_time = sum(int(item.get("time_on_page", 0) or 0) for item in items)
    cta_clicks = sum(1 for item in items for event in item.get("events", []) if event.get("name") in {"cta_click", "button_click"})
    accepted = sum(1 for item in items if item.get("consent_type") in {"all", "custom"} and (item.get("consent_preferences") or {}).get("analytics"))
    rejected = sum(1 for item in items if item.get("consent_type") == "essential")

    def top_count(field, limit=8):
        counts = {}
        for item in items:
            value = item.get(field) or "Unknown"
            counts[value] = counts.get(value, 0) + 1
        return [{"name": key, "value": value} for key, value in sorted(counts.items(), key=lambda pair: pair[1], reverse=True)[:limit]]

    days = {}
    for item in items:
        day = (item.get("created_at") or now_utc()).strftime("%b %d")
        days.setdefault(day, {"day": day, "visitors": 0, "page_views": 0})
        days[day]["visitors"] += 1
        days[day]["page_views"] += sum(1 for event in item.get("events", []) if event.get("name") == "page_view")

    cta_counts = {}
    for item in items:
        for event_item in item.get("events", []):
            if event_item.get("name") in {"cta_click", "button_click"}:
                label = (event_item.get("data") or {}).get("label") or "Unknown"
                cta_counts[label] = cta_counts.get(label, 0) + 1

    return jsonify({"success": True, "summary": {
        "total_visitors": len(items),
        "unique_visitors": len(visitor_ids),
        "returning_visitors": returning,
        "page_views": page_views,
        "average_time_on_site": round(total_time / len(items)) if items else 0,
        "cta_clicks": cta_clicks,
        "consent_accepted": accepted,
        "consent_rejected": rejected,
        "top_pages": top_count("page_url"),
        "top_devices": top_count("device_type"),
        "top_browsers": top_count("browser"),
        "top_locations": top_count("country"),
        "traffic_sources": top_count("utm_source"),
        "cta_performance": [{"name": key, "value": value} for key, value in sorted(cta_counts.items(), key=lambda pair: pair[1], reverse=True)[:10]],
        "timeline": list(days.values())[-14:],
        "sessions": [safe_session(item) for item in items[:200]],
    }})
