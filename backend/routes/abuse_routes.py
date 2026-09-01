from datetime import timedelta

from bson import ObjectId
from flask import Blueprint, current_app, jsonify, request
from pymongo import ReturnDocument

from utils.abuse import DEFAULT_SETTINGS, abuse_settings, record_event, safe_user, today_range
from utils.auth import require_admin, users_collection
from utils.security import clean_string, now_utc


admin_abuse_bp = Blueprint("admin_abuse", __name__, url_prefix="/api/admin/abuse")


def db():
    return current_app.config["DB"]


def money(value):
    try:
        return float(value or 0)
    except Exception:
        return 0.0


def admin_name(payload):
    admin = users_collection().find_one({"_id": payload.get("user_id")}) if payload.get("user_id") else None
    return (admin or {}).get("full_name") or (admin or {}).get("name") or (admin or {}).get("email") or "admin"


def log_action(payload, action, target="", metadata=None):
    db().admin_activity_logs.insert_one({
        "admin_id": str(payload.get("user_id") or ""),
        "admin_name": admin_name(payload),
        "action": action,
        "target_user_id": target,
        "metadata": metadata or {},
        "created_at": now_utc(),
    })


def safe_event(event):
    return {
        "id": event.get("event_id"),
        "event_id": event.get("event_id"),
        "user_id": str(event.get("user_id", "")),
        "user_name": event.get("user_name", ""),
        "user_email": event.get("user_email", ""),
        "type": event.get("type", ""),
        "severity": event.get("severity", "medium"),
        "module": event.get("module", ""),
        "title": event.get("title", ""),
        "description": event.get("description", ""),
        "evidence": event.get("evidence", {}),
        "status": event.get("status", "open"),
        "action_taken": event.get("action_taken", ""),
        "created_at": event.get("created_at").isoformat() if event.get("created_at") else None,
    }


def user_usage(user):
    start, end = today_range()
    uid = user["_id"]
    sms_total = db().sms_logs.count_documents({"user_id": uid, "created_at": {"$gte": start, "$lte": end}})
    sms_failed = db().sms_logs.count_documents({"user_id": uid, "status": {"$in": ["failed", "undelivered"]}, "created_at": {"$gte": start, "$lte": end}})
    email_total = db().email_logs.count_documents({"user_id": uid, "created_at": {"$gte": start, "$lte": end}})
    email_failed = db().email_logs.count_documents({"user_id": uid, "status": {"$in": ["failed", "bounced"]}, "created_at": {"$gte": start, "$lte": end}})
    api_total = db().api_request_logs.count_documents({"user_id": uid, "created_at": {"$gte": start, "$lte": end}})
    api_failed = db().api_request_logs.count_documents({"user_id": uid, "status": "failed", "created_at": {"$gte": start, "$lte": end}})
    widget_failed = db().embed_widget_logs.count_documents({"user_id": uid, "status": {"$in": ["failed", "blocked"]}, "created_at": {"$gte": start, "$lte": end}})
    settings = abuse_settings()
    flag = "normal"
    if sms_failed >= settings["max_failed_sms_per_day"] or email_failed >= settings["max_failed_email_per_day"]:
        flag = "high_failure"
    if sms_total >= settings["max_sms_per_day_per_user"] or email_total >= settings["max_email_per_day_per_user"]:
        flag = "bulk_spam"
    if api_total >= settings["max_api_calls_per_day_per_user"] or (api_total and api_failed / api_total * 100 >= settings["max_api_failure_rate_percent"]):
        flag = "api_abuse"
    if widget_failed >= settings["max_widget_failures_per_day"]:
        flag = "widget_abuse"
    return {
        **safe_user(user),
        "sms": sms_total,
        "sms_today": sms_total,
        "sms_failed": sms_failed,
        "emails": email_total,
        "emails_today": email_total,
        "email_failed": email_failed,
        "api": api_total,
        "api_calls_today": api_total,
        "api_failed": api_failed,
        "flag": flag,
        "status": user.get("account_status") or user.get("status") or "active",
    }


@admin_abuse_bp.get("/settings")
@require_admin
def get_settings(payload):
    settings = abuse_settings()
    settings["_id"] = str(settings.get("_id", ""))
    return jsonify({"success": True, "settings": settings})


@admin_abuse_bp.put("/settings")
@require_admin
def update_settings(payload):
    data = request.get_json(silent=True) or {}
    update = {}
    for key, fallback in DEFAULT_SETTINGS.items():
        if key in data:
            value = data[key]
            if isinstance(fallback, bool):
                update[key] = bool(value)
            elif isinstance(fallback, int):
                update[key] = int(value or fallback)
            elif isinstance(fallback, list):
                update[key] = [clean_string(item)[:80] for item in value if clean_string(item)] if isinstance(value, list) else fallback
            else:
                update[key] = clean_string(value)[:40]
    update.update({"updated_by_admin_id": str(payload.get("user_id", "")), "updated_at": now_utc()})
    db().abuse_settings.update_one({}, {"$set": update, "$setOnInsert": {"created_at": now_utc()}}, upsert=True)
    return get_settings(payload)


@admin_abuse_bp.get("/high-volume-users")
@require_admin
def high_volume_users(payload):
    rows = [user_usage(user) for user in users_collection().find({"role": {"$ne": "admin"}})]
    rows.sort(key=lambda item: item["sms"] + item["emails"] + item["api"], reverse=True)
    for row in rows:
        if row["flag"] != "normal":
            record_event(row["id"], "high_volume", "high" if row["flag"] != "normal" else "low", "sms", "Suspicious high-volume user", f"{row['email']} has unusual platform activity today.", row)
    return jsonify({"success": True, "users": rows[:100]})


@admin_abuse_bp.get("/suspicious-campaigns")
@require_admin
def suspicious_campaigns(payload):
    settings = abuse_settings()
    rows = []
    for collection_name, channel in [("sms_campaigns", "SMS"), ("email_campaigns", "Email")]:
        for campaign in db()[collection_name].find({}).sort("created_at", -1).limit(200):
            recipient_count = int(campaign.get("recipient_count") or campaign.get("recipients") or 0)
            failed = int(campaign.get("failed") or 0)
            failure_rate = (failed / recipient_count * 100) if recipient_count else 0
            message = campaign.get("message") or campaign.get("body") or campaign.get("message_preview") or ""
            keyword = next((kw for kw in settings.get("blocked_keywords", []) if clean_string(kw).lower() in str(message).lower()), "")
            if failure_rate >= settings["max_campaign_failure_rate_percent"] or keyword or recipient_count >= 1000:
                user = users_collection().find_one({"_id": campaign.get("user_id")}) or {}
                reason = "Blocked keyword detected" if keyword else "High failure rate" if failure_rate else "High recipient count"
                rows.append({
                    "id": str(campaign.get("_id")),
                    "campaign_id": campaign.get("campaign_id") or str(campaign.get("_id")),
                    "name": campaign.get("name") or campaign.get("campaign_name") or "Campaign",
                    "channel": channel,
                    "type": channel,
                    "user": safe_user(user)["name"],
                    "user_email": safe_user(user)["email"],
                    "recipients": recipient_count,
                    "failed": failed,
                    "failure_rate": round(failure_rate, 2),
                    "flag": reason,
                    "status": campaign.get("status", "draft"),
                })
    return jsonify({"success": True, "campaigns": rows})


@admin_abuse_bp.get("/repeated-failures")
@require_admin
def repeated_failures(payload):
    start = now_utc() - timedelta(hours=24)
    pipeline = [
        {"$match": {"status": {"$in": ["failed", "undelivered"]}, "created_at": {"$gte": start}}},
        {"$group": {"_id": {"user_id": "$user_id", "recipient": "$recipient"}, "count": {"$sum": 1}, "reason": {"$last": "$error_message"}, "last": {"$max": "$created_at"}}},
        {"$match": {"count": {"$gte": 3}}},
        {"$sort": {"count": -1}},
        {"$limit": 100},
    ]
    rows = []
    for item in db().sms_logs.aggregate(pipeline):
        user = users_collection().find_one({"_id": item["_id"]["user_id"]}) or {}
        rows.append({"user": safe_user(user)["name"], "user_email": safe_user(user)["email"], "recipient": item["_id"].get("recipient", ""), "count": item["count"], "reason": item.get("reason") or "Repeated failure", "date": item["last"].isoformat() if item.get("last") else ""})
    return jsonify({"success": True, "failures": rows})


@admin_abuse_bp.get("/summary")
@require_admin
def summary(payload):
    open_events = db().abuse_events.count_documents({"status": "open"})
    return jsonify({"success": True, "summary": {"open_events": open_events, "suspicious_count": open_events}})


@admin_abuse_bp.get("/events")
@require_admin
def events(payload):
    query = {}
    status = clean_string(request.args.get("status", ""))
    if status:
        query["status"] = status
    docs = list(db().abuse_events.find(query).sort("created_at", -1).limit(200))
    return jsonify({"success": True, "events": [safe_event(doc) for doc in docs]})


def set_user_status(payload, user_id, status):
    try:
        oid = ObjectId(user_id)
    except Exception:
        return {"success": False, "message": "Invalid user id."}, 400
    update = {"account_status": status, "status": status, "updated_at": now_utc()}
    if status == "suspended":
        update["suspended_at"] = now_utc()
        update["limit_reason"] = "Abuse monitor suspension"
    if status == "limited":
        update["limited_at"] = now_utc()
        update["limit_reason"] = "Abuse monitor limitation"
    users_collection().update_one({"_id": oid}, {"$set": update})
    log_action(payload, f"user_{status}", user_id, update)
    return jsonify({"success": True, "message": f"User {status}.", "status": status})


@admin_abuse_bp.post("/users/<user_id>/suspend")
@require_admin
def suspend_user(payload, user_id):
    return set_user_status(payload, user_id, "suspended")


@admin_abuse_bp.post("/users/<user_id>/limit")
@require_admin
def limit_user(payload, user_id):
    return set_user_status(payload, user_id, "limited")


@admin_abuse_bp.post("/users/<user_id>/reactivate")
@require_admin
def reactivate_user(payload, user_id):
    return set_user_status(payload, user_id, "active")


def set_campaign_status(payload, campaign_id, status):
    try:
        oid = ObjectId(campaign_id)
    except Exception:
        oid = None
    matched = False
    for name in ["sms_campaigns", "email_campaigns"]:
        query = {"$or": [{"campaign_id": campaign_id}]}
        if oid:
            query["$or"].append({"_id": oid})
        result = db()[name].update_one(query, {"$set": {"status": status, "updated_at": now_utc()}})
        matched = matched or bool(result.matched_count)
    if not matched:
        return {"success": False, "message": "Campaign not found."}, 404
    log_action(payload, f"campaign_{status}", campaign_id)
    return jsonify({"success": True, "message": f"Campaign {status}."})


@admin_abuse_bp.post("/campaigns/<campaign_id>/pause")
@require_admin
def pause_campaign(payload, campaign_id):
    return set_campaign_status(payload, campaign_id, "paused")


@admin_abuse_bp.post("/campaigns/<campaign_id>/cancel")
@require_admin
def cancel_campaign(payload, campaign_id):
    return set_campaign_status(payload, campaign_id, "cancelled")


@admin_abuse_bp.post("/events/<event_id>/resolve")
@require_admin
def resolve_event(payload, event_id):
    db().abuse_events.update_one({"event_id": clean_string(event_id)}, {"$set": {"status": "resolved", "action_taken": "resolved", "updated_at": now_utc()}})
    log_action(payload, "abuse_event_resolved", event_id)
    return jsonify({"success": True, "message": "Event resolved."})


@admin_abuse_bp.post("/events/<event_id>/dismiss")
@require_admin
def dismiss_event(payload, event_id):
    db().abuse_events.update_one({"event_id": clean_string(event_id)}, {"$set": {"status": "dismissed", "action_taken": "dismissed", "updated_at": now_utc()}})
    log_action(payload, "abuse_event_dismissed", event_id)
    return jsonify({"success": True, "message": "Event dismissed."})


@admin_abuse_bp.get("/blocked-keywords")
@require_admin
def list_keywords(payload):
    return jsonify({"success": True, "keywords": abuse_settings().get("blocked_keywords", [])})


@admin_abuse_bp.post("/blocked-keywords")
@require_admin
def add_keyword(payload):
    keyword = clean_string((request.get_json(silent=True) or {}).get("keyword", ""))[:80]
    if not keyword:
        return {"success": False, "message": "Keyword is required."}, 400
    db().abuse_settings.update_one({}, {"$addToSet": {"blocked_keywords": keyword}, "$set": {"updated_at": now_utc()}}, upsert=True)
    log_action(payload, "blocked_keyword_added", keyword)
    return jsonify({"success": True, "keywords": abuse_settings().get("blocked_keywords", [])})


@admin_abuse_bp.delete("/blocked-keywords/<keyword>")
@require_admin
def delete_keyword(payload, keyword):
    keyword = clean_string(keyword)[:80]
    db().abuse_settings.update_one({}, {"$pull": {"blocked_keywords": keyword}, "$set": {"updated_at": now_utc()}}, upsert=True)
    log_action(payload, "blocked_keyword_deleted", keyword)
    return jsonify({"success": True, "keywords": abuse_settings().get("blocked_keywords", [])})
