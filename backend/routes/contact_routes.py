from bson import ObjectId
from pymongo.errors import DuplicateKeyError
from flask import Blueprint, current_app, jsonify, request

from utils.auth import require_auth, users_collection
from utils.notifications import create_notification
from utils.security import clean_string, is_valid_email, now_utc

contacts_bp = Blueprint("contacts", __name__, url_prefix="/api/contacts")


def contacts_collection():
    return current_app.config["DB"].contacts


def iso(value):
    return value.isoformat() if value else None


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


def clean_group(value):
    return clean_string(value or "All Contacts") or "All Contacts"


def clean_custom_fields(value):
    if isinstance(value, dict):
        items = [{"key": key, "value": field_value} for key, field_value in value.items()]
    elif isinstance(value, list):
        items = value
    else:
        items = []

    cleaned = []
    seen = set()
    for item in items[:20]:
        if not isinstance(item, dict):
            continue
        key = clean_string(item.get("key", ""))[:40]
        field_value = clean_string(item.get("value", ""))[:160]
        normalized_key = key.lower()
        if not key or not field_value or normalized_key in seen:
            continue
        seen.add(normalized_key)
        cleaned.append({"key": key, "value": field_value})
    return cleaned


def safe_contact(contact: dict) -> dict:
    is_marketplace = contact.get("source") == "marketplace"
    sender_id = contact.get("sender_id") or ("VireSender_purchase" if is_marketplace else contact.get("name", ""))
    legacy_name = contact.get("name", "")
    contact_name = contact.get("contact_name") or (legacy_name if is_marketplace and legacy_name != "VireSender_purchase" else "")
    return {
        "id": str(contact["_id"]),
        "name": sender_id,
        "sender_id": sender_id,
        "contact_name": contact_name,
        "phone": contact.get("phone", ""),
        "normalized_phone": contact.get("normalized_phone", ""),
        "email": contact.get("email", ""),
        "age": contact.get("age", ""),
        "group": contact.get("group", "All Contacts"),
        "source": contact.get("source", "manual"),
        "source_package_id": contact.get("source_package_id", ""),
        "location": contact.get("location", ""),
        "notes": contact.get("notes", ""),
        "custom_fields": clean_custom_fields(contact.get("custom_fields", [])),
        "addedAt": iso(contact.get("created_at")),
        "created_at": iso(contact.get("created_at")),
        "updated_at": iso(contact.get("updated_at")),
    }


def validate_contact_payload(data: dict, partial: bool = False):
    contact_name = clean_string(data.get("contact_name") or data.get("name", ""))
    sender_id = clean_string(data.get("sender_id", ""))
    phone = clean_string(data.get("phone", ""))
    email = clean_string(data.get("email", "")).lower()
    age = clean_string(data.get("age", ""))
    custom_fields = clean_custom_fields(data.get("custom_fields", []))
    group = clean_group(data.get("group"))
    errors = {}

    if not partial or "phone" in data:
        if not phone:
            errors["phone"] = "Phone number is required."
    if email and not is_valid_email(email):
        errors["email"] = "Enter a valid email address."
    if age:
        try:
            parsed_age = int(age)
        except ValueError:
            errors["age"] = "Age must be a number."
        else:
            if parsed_age < 0 or parsed_age > 130:
                errors["age"] = "Enter a valid age."
            age = str(parsed_age)

    sender_id = sender_id or contact_name
    return errors, {
        "name": sender_id,
        "sender_id": sender_id,
        "contact_name": contact_name,
        "phone": phone,
        "email": email,
        "age": age,
        "group": group,
        "custom_fields": custom_fields,
    }


@contacts_bp.get("")
@require_auth
def list_contacts(payload):
    user, error = require_active_user(payload)
    if error:
        return error

    contacts = contacts_collection().find({"user_id": user["_id"]}).sort("created_at", -1)
    return jsonify({"success": True, "contacts": [safe_contact(contact) for contact in contacts]})


@contacts_bp.get("/groups")
@require_auth
def list_contact_groups(payload):
    user, error = require_active_user(payload)
    if error:
        return error

    pipeline = [
        {"$match": {"user_id": user["_id"]}},
        {"$group": {"_id": "$group", "count": {"$sum": 1}}},
        {"$sort": {"_id": 1}},
    ]
    groups = [
        {"name": item["_id"] or "All Contacts", "count": item["count"]}
        for item in contacts_collection().aggregate(pipeline)
    ]
    return jsonify({"success": True, "groups": groups})


@contacts_bp.post("")
@require_auth
def create_contact(payload):
    user, error = require_active_user(payload)
    if error:
        return error

    data = request.get_json(silent=True) or {}
    errors, cleaned = validate_contact_payload(data)
    if errors:
        return {"success": False, "message": "Please correct the highlighted fields.", "errors": errors}, 400

    now = now_utc()
    contact = {
        "user_id": user["_id"],
        **cleaned,
        "created_at": now,
        "updated_at": now,
    }

    try:
        result = contacts_collection().insert_one(contact)
    except DuplicateKeyError:
        return {"success": False, "message": "A contact with this phone number already exists."}, 409

    contact["_id"] = result.inserted_id
    create_notification(
        user["_id"], "contacts", "Contact added",
        "A contact was added to your contact list.",
        "success", "contacts", str(result.inserted_id), "/user/contacts",
        {"group": contact.get("group", "")},
    )
    return jsonify({"success": True, "message": "Contact added successfully.", "contact": safe_contact(contact)}), 201


@contacts_bp.put("/<contact_id>")
@require_auth
def update_contact(payload, contact_id):
    user, error = require_active_user(payload)
    if error:
        return error

    try:
        object_id = ObjectId(contact_id)
    except Exception:
        return {"success": False, "message": "Invalid contact id."}, 400

    data = request.get_json(silent=True) or {}
    errors, cleaned = validate_contact_payload(data, partial=True)
    if errors:
        return {"success": False, "message": "Please correct the highlighted fields.", "errors": errors}, 400

    update = {}
    if "contact_name" in data or "name" in data:
        update["contact_name"] = cleaned["contact_name"]
    if "sender_id" in data or "contact_name" in data or "name" in data:
        update["sender_id"] = cleaned["sender_id"]
        update["name"] = cleaned["sender_id"]
    for key in ("phone", "email", "age", "group", "custom_fields"):
        if key in data or key == "group":
            update[key] = cleaned[key]
    update["updated_at"] = now_utc()

    try:
        result = contacts_collection().update_one(
            {"_id": object_id, "user_id": user["_id"]},
            {"$set": update},
        )
    except DuplicateKeyError:
        return {"success": False, "message": "A contact with this phone number already exists."}, 409

    if not result.matched_count:
        return {"success": False, "message": "Contact not found."}, 404

    contact = contacts_collection().find_one({"_id": object_id, "user_id": user["_id"]})
    return jsonify({"success": True, "message": "Contact updated successfully.", "contact": safe_contact(contact)})


@contacts_bp.delete("/<contact_id>")
@require_auth
def delete_contact(payload, contact_id):
    user, error = require_active_user(payload)
    if error:
        return error

    try:
        object_id = ObjectId(contact_id)
    except Exception:
        return {"success": False, "message": "Invalid contact id."}, 400

    result = contacts_collection().delete_one({"_id": object_id, "user_id": user["_id"]})
    if not result.deleted_count:
        return {"success": False, "message": "Contact not found."}, 404

    return jsonify({"success": True, "message": "Contact removed."})


@contacts_bp.post("/bulk-delete")
@require_auth
def bulk_delete_contacts(payload):
    user, error = require_active_user(payload)
    if error:
        return error

    data = request.get_json(silent=True) or {}
    ids = data.get("ids") or []
    object_ids = []
    for item in ids:
        try:
            object_ids.append(ObjectId(item))
        except Exception:
            continue

    if not object_ids:
        return {"success": False, "message": "Select at least one valid contact."}, 400

    result = contacts_collection().delete_many({"_id": {"$in": object_ids}, "user_id": user["_id"]})
    return jsonify({"success": True, "message": f"{result.deleted_count} contacts removed.", "deleted_count": result.deleted_count})


@contacts_bp.post("/bulk-import")
@require_auth
def bulk_import_contacts(payload):
    user, error = require_active_user(payload)
    if error:
        return error

    data = request.get_json(silent=True) or {}
    contacts = data.get("contacts") or []
    if not isinstance(contacts, list) or not contacts:
        return {"success": False, "message": "No contacts were provided for import."}, 400

    now = now_utc()
    imported = 0
    skipped = 0
    for item in contacts[:1000]:
        errors, cleaned = validate_contact_payload(item)
        if errors:
            skipped += 1
            continue

        try:
            contacts_collection().insert_one({
                "user_id": user["_id"],
                **cleaned,
                "created_at": now,
                "updated_at": now,
            })
            imported += 1
        except DuplicateKeyError:
            skipped += 1

    create_notification(
        user["_id"], "contacts", "Contact import completed" if imported else "Contact import failed",
        f"Imported {imported} contact(s). {skipped} skipped.",
        "success" if imported else "warning", "contacts", "", "/user/contacts",
        {"imported": imported, "skipped": skipped},
    )
    return jsonify({
        "success": True,
        "message": f"Imported {imported} contacts. {skipped} skipped.",
        "imported": imported,
        "skipped": skipped,
    })
