import re
import secrets

from bson import ObjectId
from flask import Blueprint, current_app, jsonify, request

from utils.auth import require_admin, require_auth, users_collection
from utils.notifications import create_notification
from utils.security import clean_string, now_utc
from utils.service_control import check_service_available

templates_bp = Blueprint("templates", __name__, url_prefix="/api/templates")
admin_templates_bp = Blueprint("admin_templates", __name__, url_prefix="/api/admin/templates")

VARIABLE_RE = re.compile(r"\{\{\s*([a-zA-Z][a-zA-Z0-9_]*)\s*\}\}")
CATEGORIES = {"Marketing", "Transactional", "Reminder", "Onboarding", "Security", "Custom", "OTP"}
BASIC = ["contact_name", "phone", "email", "sender_id"]
DEMOGRAPHIC = ["age", "gender", "location", "region"]
BUSINESS = ["occupation", "business_type", "company", "customer_type"]
DEFAULT_SAMPLE = {
    "contact_name": "Ama Mensah",
    "sender_id": "VireSend",
    "phone": "0241234567",
    "email": "ama@example.com",
    "age": "34",
    "gender": "Female",
    "group": "Market Women",
    "location": "Accra",
    "occupation": "Trader",
    "region": "Greater Accra",
    "business_type": "Market Woman",
    "company": "Ama Foods",
    "customer_type": "Retail",
}


def templates_collection():
    return current_app.config["DB"].message_templates


def contacts_collection():
    return current_app.config["DB"].contacts


def iso(value):
    return value.isoformat() if value else None


def variable_key(value: str) -> str:
    key = re.sub(r"[^a-zA-Z0-9]+", "_", clean_string(value or "").lower()).strip("_")
    if key and key[0].isdigit():
        key = f"field_{key}"
    return key


def detect_variables(*parts: str) -> list[str]:
    combined = "\n".join(part or "" for part in parts)
    return sorted(set(VARIABLE_RE.findall(combined)))


def get_current_user(payload):
    user_id = payload.get("user_id") or payload.get("sub")
    try:
        object_id = ObjectId(user_id)
    except Exception:
        return None
    return users_collection().find_one({"_id": object_id})


def require_active_user(payload):
    user = get_current_user(payload)
    if not user:
        return None, ({"success": False, "message": "User account not found."}, 404)
    if user.get("account_status") != "active":
        return None, ({"success": False, "message": "Your account is not active."}, 403)
    return user, None


def create_template_id():
    return f"TPL-{now_utc().strftime('%Y%m%d%H%M%S')}-{secrets.token_hex(3).upper()}"


def safe_template(template: dict) -> dict:
    template_type = template.get("type") or template.get("template_type") or "sms"
    body = template.get("body")
    if body is None:
        body = template.get("message", "")
    return {
        "id": template.get("template_id") or str(template.get("_id")),
        "template_id": template.get("template_id") or str(template.get("_id")),
        "name": template.get("name", ""),
        "type": template_type if template_type in {"email", "sms"} else "sms",
        "template_type": template_type if template_type in {"email", "sms"} else "sms",
        "category": template.get("category", "Custom"),
        "subject": template.get("subject", ""),
        "body": body,
        "message": body,
        "variables": template.get("variables", []),
        "unknown_variables": template.get("unknown_variables", []),
        "usageCount": int(template.get("usage_count", 0) or 0),
        "usage_count": int(template.get("usage_count", 0) or 0),
        "status": template.get("status", "active"),
        "createdAt": iso(template.get("created_at")),
        "created_at": iso(template.get("created_at")),
        "updated_at": iso(template.get("updated_at")),
    }


def safe_admin_template(template: dict) -> dict:
    payload = safe_template(template)
    user = users_collection().find_one({"_id": template.get("user_id")}) if template.get("user_id") else None
    payload.update({
        "user": user.get("full_name") or user.get("name") or user.get("email") if user else "Unknown",
        "user_email": user.get("email", "") if user else "",
        "user_id": str(template.get("user_id")) if template.get("user_id") else "",
    })
    return payload


def available_variables(user_id: ObjectId) -> dict:
    custom = set()
    for contact in contacts_collection().find({"user_id": user_id}, {"custom_fields": 1, "location": 1, "notes": 1}):
        for field in contact.get("custom_fields") or []:
            if isinstance(field, dict):
                key = variable_key(field.get("key", ""))
                if key:
                    custom.add(key)
        for key in ("location", "occupation", "region", "business_type", "company", "customer_type", "gender"):
            if contact.get(key):
                custom.add(key)

    categorized = {
        "basic": BASIC,
        "demographic": DEMOGRAPHIC,
        "business": BUSINESS,
        "custom": sorted(custom.difference(BASIC, DEMOGRAPHIC, BUSINESS, {"group"})),
    }
    return categorized


def flat_variables(groups: dict) -> set[str]:
    values = {"group"}
    for items in groups.values():
        values.update(items)
    return values


def validate_payload(data: dict):
    name = clean_string(data.get("name", ""))[:120]
    template_type = clean_string(data.get("type") or data.get("template_type") or "sms").lower()
    category = clean_string(data.get("category", "Custom")) or "Custom"
    subject = clean_string(data.get("subject", ""))[:180]
    body_limit = 4000 if template_type == "email" else 1000
    body = clean_string(data.get("body") or data.get("message") or "")[:body_limit]
    errors = {}
    if not name:
        errors["name"] = "Template name is required."
    if template_type not in {"email", "sms"}:
        errors["type"] = "Template type must be Email or SMS."
    if not body:
        errors["message"] = "Message is required."
    if category not in CATEGORIES:
        errors["category"] = "Select a valid category."
    return errors, {
        "name": name,
        "type": template_type if template_type in {"email", "sms"} else "sms",
        "category": category,
        "subject": subject,
        "body": body,
        "message": body,
    }


def find_template(user_id: ObjectId, template_id: str):
    query = {"user_id": user_id, "status": {"$ne": "deleted"}}
    try:
        object_id = ObjectId(template_id)
        query["$or"] = [{"_id": object_id}, {"template_id": clean_string(template_id)}]
    except Exception:
        query["template_id"] = clean_string(template_id)
    return templates_collection().find_one(query)


@templates_bp.get("")
@require_auth
def list_templates(payload):
    user, error = require_active_user(payload)
    if error:
        return error
    query = {"user_id": user["_id"], "status": {"$ne": "deleted"}}
    and_filters = []
    search = clean_string(request.args.get("search", ""))
    category = clean_string(request.args.get("category", ""))
    if search:
        and_filters.append({"$or": [
            {"name": {"$regex": search, "$options": "i"}},
            {"message": {"$regex": search, "$options": "i"}},
            {"body": {"$regex": search, "$options": "i"}},
            {"subject": {"$regex": search, "$options": "i"}},
        ]})
    if category and category != "All":
        query["category"] = category
    template_type = clean_string(request.args.get("type", "")).lower()
    if template_type == "email":
        and_filters.append({"type": "email"})
    elif template_type == "sms":
        and_filters.append({"$or": [{"type": "sms"}, {"type": {"$exists": False}}, {"type": ""}, {"template_type": "sms"}]})
    if and_filters:
        query["$and"] = and_filters
    templates = templates_collection().find(query).sort("created_at", -1)
    return jsonify({"success": True, "templates": [safe_template(template) for template in templates]})


@templates_bp.post("")
@require_auth
def create_template(payload):
    locked = check_service_available("templates")
    if locked:
        return locked
    user, error = require_active_user(payload)
    if error:
        return error
    data = request.get_json(silent=True) or {}
    errors, cleaned = validate_payload(data)
    if errors:
        return {"success": False, "message": "Please correct the highlighted fields.", "errors": errors}, 400
    variables = detect_variables(cleaned["subject"], cleaned["body"])
    available = flat_variables(available_variables(user["_id"]))
    now = now_utc()
    template = {
        "template_id": create_template_id(),
        "user_id": user["_id"],
        **cleaned,
        "variables": variables,
        "unknown_variables": sorted(set(variables) - available),
        "usage_count": 0,
        "status": "active",
        "scope": "user",
        "created_at": now,
        "updated_at": now,
    }
    templates_collection().insert_one(template)
    create_notification(
        user["_id"], "templates", "Template created",
        f"Template \"{cleaned['name']}\" was created.",
        "success", "templates", template["template_id"], "/user/templates",
        {"type": cleaned.get("type", "sms")},
    )
    return jsonify({"success": True, "message": "Template created.", "template": safe_template(template)}), 201


@templates_bp.get("/stats")
@require_auth
def template_stats(payload):
    user, error = require_active_user(payload)
    if error:
        return error
    templates = list(templates_collection().find({"user_id": user["_id"], "status": {"$ne": "deleted"}}))
    most_used = max(templates, key=lambda item: int(item.get("usage_count", 0) or 0), default=None)
    return jsonify({"success": True, "stats": {
        "total_templates": len(templates),
        "most_used": most_used.get("name", "") if most_used else "",
        "most_used_category": most_used.get("category", "") if most_used else "",
        "total_uses": sum(int(item.get("usage_count", 0) or 0) for item in templates),
        "categories_count": len({item.get("category", "Custom") for item in templates}),
    }})


@templates_bp.get("/variables")
@require_auth
def template_variables(payload):
    user, error = require_active_user(payload)
    if error:
        return error
    groups = available_variables(user["_id"])
    sample = {key: DEFAULT_SAMPLE.get(key, key.replace("_", " ").title()) for items in groups.values() for key in items}
    return jsonify({"success": True, "variables": groups, "sample": sample})


@templates_bp.get("/<template_id>")
@require_auth
def get_template(payload, template_id):
    user, error = require_active_user(payload)
    if error:
        return error
    template = find_template(user["_id"], template_id)
    if not template:
        return {"success": False, "message": "Template not found."}, 404
    return jsonify({"success": True, "template": safe_template(template)})


@templates_bp.put("/<template_id>")
@require_auth
def update_template(payload, template_id):
    locked = check_service_available("templates")
    if locked:
        return locked
    user, error = require_active_user(payload)
    if error:
        return error
    template = find_template(user["_id"], template_id)
    if not template:
        return {"success": False, "message": "Template not found."}, 404
    data = request.get_json(silent=True) or {}
    errors, cleaned = validate_payload(data)
    if errors:
        return {"success": False, "message": "Please correct the highlighted fields.", "errors": errors}, 400
    variables = detect_variables(cleaned["subject"], cleaned["body"])
    available = flat_variables(available_variables(user["_id"]))
    update = {
        **cleaned,
        "variables": variables,
        "unknown_variables": sorted(set(variables) - available),
        "updated_at": now_utc(),
    }
    templates_collection().update_one({"_id": template["_id"]}, {"$set": update})
    updated = templates_collection().find_one({"_id": template["_id"]})
    create_notification(
        user["_id"], "templates", "Template updated",
        f"Template \"{cleaned['name']}\" was updated.",
        "info", "templates", template.get("template_id", ""), "/user/templates",
        {"type": cleaned.get("type", "sms")},
    )
    return jsonify({"success": True, "message": "Template updated.", "template": safe_template(updated)})


@templates_bp.delete("/<template_id>")
@require_auth
def delete_template(payload, template_id):
    locked = check_service_available("templates")
    if locked:
        return locked
    user, error = require_active_user(payload)
    if error:
        return error
    template = find_template(user["_id"], template_id)
    if not template:
        return {"success": False, "message": "Template not found."}, 404
    templates_collection().update_one({"_id": template["_id"]}, {"$set": {"status": "deleted", "updated_at": now_utc()}})
    create_notification(
        user["_id"], "templates", "Template deleted",
        f"Template \"{template.get('name', '')}\" was deleted.",
        "warning", "templates", template.get("template_id", ""), "/user/templates",
        {"type": template.get("type", "sms")},
    )
    return jsonify({"success": True, "message": "Template deleted."})


@templates_bp.post("/<template_id>/use")
@require_auth
def use_template(payload, template_id):
    locked = check_service_available("templates")
    if locked:
        return locked
    user, error = require_active_user(payload)
    if error:
        return error
    template = find_template(user["_id"], template_id)
    if not template:
        return {"success": False, "message": "Template not found."}, 404
    templates_collection().update_one({"_id": template["_id"]}, {"$inc": {"usage_count": 1}, "$set": {"updated_at": now_utc()}})
    template["usage_count"] = int(template.get("usage_count", 0) or 0) + 1
    return jsonify({"success": True, "message": "Template ready to use.", "template": safe_template(template)})


@admin_templates_bp.get("")
@require_admin
def admin_list_templates(payload):
    query = {"status": {"$ne": "deleted"}}
    search = clean_string(request.args.get("search", ""))
    template_type = clean_string(request.args.get("type", "")).lower()
    status = clean_string(request.args.get("status", ""))
    and_filters = []
    if search:
        matching_user_ids = [user["_id"] for user in users_collection().find({
            "$or": [
                {"full_name": {"$regex": search, "$options": "i"}},
                {"name": {"$regex": search, "$options": "i"}},
                {"email": {"$regex": search, "$options": "i"}},
            ]
        }, {"_id": 1}).limit(100)]
        and_filters.append({"$or": [
            {"name": {"$regex": search, "$options": "i"}},
            {"subject": {"$regex": search, "$options": "i"}},
            {"body": {"$regex": search, "$options": "i"}},
            {"message": {"$regex": search, "$options": "i"}},
            {"user_id": {"$in": matching_user_ids}},
        ]})
    if template_type == "email":
        and_filters.append({"type": "email"})
    elif template_type == "sms":
        and_filters.append({"$or": [{"type": "sms"}, {"type": {"$exists": False}}, {"type": ""}]})
    if status and status != "all":
        query["status"] = status
    if and_filters:
        query["$and"] = and_filters
    templates = list(templates_collection().find(query).sort("created_at", -1).limit(500))
    return jsonify({"success": True, "templates": [safe_admin_template(template) for template in templates]})


@admin_templates_bp.get("/stats")
@require_admin
def admin_template_stats(payload):
    templates = list(templates_collection().find({"status": {"$ne": "deleted"}}))
    sms_count = sum(1 for item in templates if (item.get("type") or "sms") == "sms")
    email_count = sum(1 for item in templates if item.get("type") == "email")
    return jsonify({"success": True, "stats": {
        "total_templates": len(templates),
        "sms_templates": sms_count,
        "email_templates": email_count,
        "active_templates": sum(1 for item in templates if item.get("status", "active") == "active"),
        "total_uses": sum(int(item.get("usage_count", 0) or 0) for item in templates),
    }})


@admin_templates_bp.patch("/<template_id>/status")
@require_admin
def admin_update_template_status(payload, template_id):
    status = clean_string((request.get_json(silent=True) or {}).get("status", ""))
    if status not in {"active", "archived", "disabled"}:
        return {"success": False, "message": "Select a valid template status."}, 400
    result = templates_collection().update_one(
        {"template_id": clean_string(template_id), "status": {"$ne": "deleted"}},
        {"$set": {"status": status, "updated_at": now_utc()}},
    )
    if not result.matched_count:
        return {"success": False, "message": "Template not found."}, 404
    return jsonify({"success": True, "message": "Template status updated."})


@admin_templates_bp.delete("/<template_id>")
@require_admin
def admin_delete_template(payload, template_id):
    result = templates_collection().update_one(
        {"template_id": clean_string(template_id), "status": {"$ne": "deleted"}},
        {"$set": {"status": "deleted", "updated_at": now_utc()}},
    )
    if not result.matched_count:
        return {"success": False, "message": "Template not found."}, 404
    return jsonify({"success": True, "message": "Template deleted."})
