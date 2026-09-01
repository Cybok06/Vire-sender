import csv
import io
import re
import secrets

from bson import ObjectId
from flask import Blueprint, Response, current_app, jsonify, request

from services.sms_provider_service import (
    DEFAULT_PROVIDER_COST,
    DEFAULT_SMS_COST,
    SmsProviderError,
    create_sms_reference,
    get_active_sms_provider,
    get_sms_provider_by_name,
    normalize_sms_settings,
    save_sms_settings,
    test_moolre_connection,
    test_bird_connection,
)
from services.sms_routing_service import (
    SmsRoutingError,
    build_recipient_plan,
    international_pricing_collection,
    normalize_phone_number,
    parse_phone_number,
    safe_pricing_rule,
    save_international_pricing,
    sms_segments,
)
from services.sms_credit_service import finalize_sms_usage, refund_sms_credits, reserve_sms_credits, sms_credit_balance
from services.moolre_sender_id_service import (
    SenderIdError,
    admin_sender_ids,
    approved_sender_ids_for_user,
    enforce_approved_moolre_sender_id,
    list_user_sender_ids,
    refresh_sender_id,
    submit_sender_id,
    sync_all_sender_ids,
)
from utils.auth import require_admin, require_auth, users_collection
from utils.notifications import create_notification
from utils.security import clean_string, now_utc
from utils.service_control import check_service_available
from utils.abuse import abuse_check_message, abuse_check_user_allowed

sms_bp = Blueprint("sms", __name__, url_prefix="/api/sms")
admin_sms_bp = Blueprint("admin_sms", __name__, url_prefix="/api/admin/sms")

MAX_SENDER_ID_LENGTH = 11


def iso(value):
    return value.isoformat() if value else None


def platform_settings():
    return current_app.config["DB"].platform_settings


def sms_logs():
    return current_app.config["DB"].sms_logs


def contacts_collection():
    return current_app.config["DB"].contacts


def campaigns_collection():
    return current_app.config["DB"].sms_campaigns


def wallet_transactions():
    return current_app.config["DB"].wallet_transactions


def to_float(value, fallback=0.0):
    try:
        return round(float(value), 4)
    except (TypeError, ValueError):
        return fallback


def get_sms_settings(include_secret=False):
    return normalize_sms_settings(include_secret=include_secret)


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
    restriction = abuse_check_user_allowed(user, "sms")
    if restriction:
        return None, restriction
    return user, None


def normalize_phone(value: str) -> str | None:
    return normalize_phone_number(value)


def parse_numbers(value) -> list[str]:
    if isinstance(value, list):
        raw = value
    else:
        raw = re.split(r"[\n,;]+", str(value or ""))
    seen = set()
    numbers = []
    for item in raw:
        phone = normalize_phone(str(item).strip())
        if phone and phone not in seen:
            seen.add(phone)
            numbers.append(phone)
    return numbers


VARIABLE_RE = re.compile(r"\{\{\s*([a-zA-Z][a-zA-Z0-9_]*)\s*\}\}")


def variable_key(value: str) -> str:
    key = re.sub(r"[^a-zA-Z0-9]+", "_", clean_string(value or "").lower()).strip("_")
    if key and key[0].isdigit():
        key = f"field_{key}"
    return key


def contact_values(contact: dict | None, phone: str = "") -> dict:
    contact = contact or {}
    contact_name = contact.get("contact_name", "")
    legacy_name = contact.get("name", "")
    if not contact_name and legacy_name and legacy_name != "VireSender_purchase":
        contact_name = legacy_name
    values = {
        "contact_name": contact_name,
        "name": contact_name,
        "sender_id": contact.get("sender_id") or contact.get("name", ""),
        "phone": contact.get("phone") or phone,
        "email": contact.get("email", ""),
        "age": contact.get("age", ""),
        "group": contact.get("group", ""),
        "location": contact.get("location", ""),
        "occupation": contact.get("occupation", ""),
        "region": contact.get("region", ""),
        "business_type": contact.get("business_type", ""),
        "company": contact.get("company", ""),
        "customer_type": contact.get("customer_type", ""),
        "gender": contact.get("gender", ""),
    }
    custom_fields = contact.get("custom_fields") or []
    if isinstance(custom_fields, dict):
        custom_fields = [{"key": key, "value": value} for key, value in custom_fields.items()]
    for field in custom_fields:
        if isinstance(field, dict):
            key = variable_key(field.get("key", ""))
            if key:
                values[key] = field.get("value", "")
    for key, value in contact.items():
        safe_key = variable_key(str(key))
        if safe_key and safe_key not in values and isinstance(value, (str, int, float)):
            values[safe_key] = value
    return values


def render_message(message: str, values: dict) -> str:
    def replace(match):
        key = match.group(1)
        return str(values.get(key, ""))
    return VARIABLE_RE.sub(replace, message or "")


def message_variables(message: str) -> set[str]:
    return set(VARIABLE_RE.findall(message or ""))


def sanitize_sender_id(value: str) -> str:
    sender = re.sub(r"[^A-Za-z0-9 ]", "", value or "")
    return " ".join(sender.split())[:MAX_SENDER_ID_LENGTH]


def sms_parts(message: str) -> int:
    return sms_segments(message)["parts"]


def cost_preview(recipient_count: int, message: str, settings: dict | None = None, recipients=None) -> dict:
    active_settings = settings or get_sms_settings()
    if recipients:
        plan = build_recipient_plan(recipients, message, active_settings)
        first = plan["recipients"][0]
        return {
            "recipient_count": plan["recipient_count"],
            "sms_parts": plan["sms_parts"],
            "sms_units": plan["sms_units"],
            "encoding": plan["encoding"],
            "cost_per_sms": first["user_price_ghs"] if len({item["user_price_ghs"] for item in plan["recipients"]}) == 1 else None,
            "provider_cost_per_sms": None,
            "total_cost": plan["total_cost"],
            "provider_total_cost": plan["provider_total_cost"],
            "sms_enabled": bool(active_settings.get("sms_enabled")),
            "active_sms_provider": active_settings.get("active_sms_provider", "arkesel"),
            "requires_approved_sender_id": "moolre" in plan["groups"],
            "requires_sender_id": any(item.get("requires_sender_id", True) for item in plan["recipients"]),
            "shared_sender": all(item.get("shared_sender", False) for item in plan["recipients"]),
            "international": plan["international"],
            "country_code": first["country_code"] if len(plan["countries"]) == 1 else None,
            "country_name": first["country_name"] if len(plan["countries"]) == 1 else "Multiple countries",
            "country_dial_code": first["country_dial_code"] if len(plan["countries"]) == 1 else None,
            "recipient_normalized": first["recipient_normalized"] if plan["recipient_count"] == 1 else None,
            "destinations": [{"country_code": item["country_code"], "country_name": item["country_name"], "count": sum(1 for row in plan["recipients"] if row["country_code"] == item["country_code"]), "international": item["international"], "shared_sender": item.get("shared_sender", False), "requires_sender_id": item.get("requires_sender_id", True)} for item in {row["country_code"]: row for row in plan["recipients"]}.values()],
        }
    parts = sms_parts(message)
    sms_units = recipient_count * parts
    unit_cost = to_float(active_settings.get("sms_cost_per_message"), DEFAULT_SMS_COST)
    provider_unit_cost = to_float(active_settings.get("sms_provider_cost_per_message"), DEFAULT_PROVIDER_COST)
    return {
        "recipient_count": recipient_count,
        "sms_parts": parts,
        "sms_units": sms_units,
        "cost_per_sms": unit_cost,
        "provider_cost_per_sms": provider_unit_cost,
        "total_cost": round(sms_units * unit_cost, 4),
        "provider_total_cost": round(sms_units * provider_unit_cost, 4),
        "sms_enabled": bool(active_settings.get("sms_enabled")),
        "active_sms_provider": active_settings.get("active_sms_provider", "arkesel"),
    }


def create_reference(prefix="SMS"):
    return f"{prefix}-{now_utc().strftime('%Y%m%d%H%M%S')}-{secrets.token_hex(3).upper()}"


def safe_log(log: dict, admin=False) -> dict:
    payload = {
        "id": str(log.get("_id")),
        "sms_id": log.get("sms_id"),
        "user_id": str(log.get("user_id")) if log.get("user_id") else None,
        "user_name": log.get("user_name", ""),
        "recipient": log.get("recipient") or (", ".join((log.get("recipients") or [])[:2])),
        "recipients": log.get("recipients", []),
        "recipient_count": int(log.get("recipient_count", 0) or 0),
        "sender_id": log.get("sender_id", ""),
        "message": log.get("message", ""),
        "message_preview": log.get("message_preview", ""),
        "sms_parts": int(log.get("sms_parts", 1) or 1),
        "sms_units": int(log.get("sms_units", 0) or 0),
        "cost_per_sms": to_float(log.get("cost_per_sms")),
        "total_cost": to_float(log.get("total_cost")),
        "type": log.get("type", "single"),
        "status": log.get("status", "pending"),
        "error_message": log.get("error_message", ""),
        "wallet_before": to_float(log.get("wallet_before")),
        "wallet_after": to_float(log.get("wallet_after")),
        "recipient_source": log.get("recipient_source", "contact_group"),
        "display_phone": log.get("display_phone"),
        "direct_phone_numbers": log.get("direct_phone_numbers", []),
        "international": bool(log.get("international", False)),
        "countries": log.get("countries", []),
        "encoding": log.get("encoding", ""),
        "message_category": log.get("message_category", ""),
        "recipient_details": [{
            "recipient_normalized": item.get("recipient_normalized"),
            "country_code": item.get("country_code"),
            "country_name": item.get("country_name"),
            "country_dial_code": item.get("country_dial_code"),
            "international": bool(item.get("international")),
            "shared_sender": bool(item.get("shared_sender", False)),
            "sms_parts": item.get("sms_parts"),
            "user_charge": item.get("user_charge"),
            "status": item.get("status"),
        } for item in log.get("recipient_details", [])],
        "created_at": iso(log.get("created_at")),
        "updated_at": iso(log.get("updated_at")),
    }
    if admin:
        payload.update({
            "provider": log.get("provider", "arkesel"),
            "provider_reference": log.get("provider_reference") or log.get("sms_id"),
            "provider_references": log.get("provider_references", []),
            "provider_code": log.get("provider_code", ""),
            "provider_status": log.get("provider_status", ""),
            "provider_status_code": log.get("provider_status_code"),
            "provider_error": log.get("provider_error", ""),
            "recipient_details": log.get("recipient_details", []),
        })
    return payload


def get_group_recipients(user_id: ObjectId, group: str) -> list[str]:
    if not group:
        return []
    query = {"user_id": user_id}
    if group != "All Contacts":
        query["group"] = group
    return parse_numbers([contact.get("phone", "") for contact in contacts_collection().find(query, {"phone": 1})])


def get_group_contacts(user_id: ObjectId, group: str) -> list[dict]:
    if not group:
        return []
    query = {"user_id": user_id}
    if group != "All Contacts":
        query["group"] = group
    return list(contacts_collection().find(query))


def get_contacts_by_phones(user_id: ObjectId, phones: list[str]) -> dict[str, dict]:
    normalized = [phone for phone in phones if phone]
    if not normalized:
        return {}
    phone_variants = set(normalized)
    for phone in normalized:
        digits = phone.lstrip("+")
        phone_variants.add(digits)
        phone_variants.add(f"+{digits}")
        if digits.startswith("233") and len(digits) > 3:
            phone_variants.add(f"0{digits[3:]}")
    query = {
        "user_id": user_id,
        "$or": [
            {"normalized_phone": {"$in": normalized}},
            {"phone": {"$in": list(phone_variants)}},
        ],
    }
    contexts = {}
    for contact in contacts_collection().find(query):
        phone = normalize_phone(contact.get("normalized_phone") or contact.get("phone", ""))
        if phone:
            contexts[phone] = contact
    return contexts


def get_request_recipients(user: dict, data: dict) -> list[str]:
    recipients = parse_numbers(data.get("recipients") or data.get("numbers") or data.get("recipient") or "")
    group = clean_string(data.get("group", ""))
    if group:
        recipients.extend(get_group_recipients(user["_id"], group))
    return list(dict.fromkeys(recipients))


def insert_sms_log(user: dict, recipients: list[str], sender_id: str, message: str, log_type: str, status: str, preview: dict, reference: str, provider_response=None, error_message="", wallet_before=None, wallet_after=None, campaign_id=None, provider_name="arkesel", provider_meta=None, extra_fields=None):
    now = now_utc()
    provider_meta = provider_meta or {}
    provider_references = provider_meta.get("references") or []
    log = {
        "sms_id": reference,
        "user_id": user["_id"],
        "user_name": user.get("full_name", ""),
        "recipient": recipients[0] if len(recipients) == 1 else f"{len(recipients)} recipients",
        "recipients": recipients,
        "recipient_count": len(recipients),
        "sender_id": sender_id,
        "message": message,
        "message_preview": message[:120],
        "sms_parts": preview["sms_parts"],
        "sms_units": preview["sms_units"],
        "cost_per_sms": preview["cost_per_sms"],
        "provider_cost_per_sms": preview["provider_cost_per_sms"],
        "provider_total_cost": preview["provider_total_cost"],
        "total_cost": preview["total_cost"],
        "type": log_type,
        "status": status,
        "provider": provider_name or provider_meta.get("provider") or "arkesel",
        "provider_reference": provider_references[0] if provider_references else reference,
        "provider_references": provider_references,
        "provider_code": provider_meta.get("provider_code", ""),
        "provider_status": provider_meta.get("provider_status", "accepted" if status == "delivered" else status),
        "provider_status_code": provider_meta.get("provider_status_code"),
        "provider_error": provider_meta.get("provider_error", error_message),
        "provider_results": provider_meta.get("results", []),
        "provider_response": provider_response or {},
        "error_message": error_message,
        "wallet_before": wallet_before,
        "wallet_after": wallet_after,
        "sms_balance_before": wallet_before,
        "sms_balance_after": wallet_after,
        "campaign_id": campaign_id,
        "created_at": now,
        "updated_at": now,
    }
    if isinstance(extra_fields, dict):
        log.update(extra_fields)
    result = sms_logs().insert_one(log)
    log["_id"] = result.inserted_id
    return log


def save_sender_id(user_id: ObjectId, sender_id: str):
    current_app.config["DB"].sms_sender_ids.update_one(
        {"user_id": user_id, "sender_id": sender_id},
        {"$set": {"user_id": user_id, "sender_id": sender_id, "updated_at": now_utc()}, "$setOnInsert": {"created_at": now_utc()}},
        upsert=True,
    )


def send_sms_flow(user: dict, recipients: list[str], sender_id: str, message: str, log_type: str, campaign_id=None, wallet_category="sms", description_prefix="SMS", contact_contexts=None, log_extra=None, category=""):
    abuse_error = abuse_check_message(message, user.get("_id"), "sms")
    if abuse_error:
        return abuse_error
    settings = get_sms_settings(include_secret=True)
    if not settings.get("sms_enabled"):
        return {"success": False, "message": "SMS sending is currently disabled."}, 400
    if not recipients:
        return {"success": False, "message": "Add at least one valid recipient."}, 400
    if not message:
        return {"success": False, "message": "Message is required."}, 400
    try:
        plan = build_recipient_plan(recipients, message, settings)
    except SmsRoutingError as exc:
        return {"success": False, "message": exc.message, "code": exc.code}, exc.status_code
    requires_sender_id = any(item.get("requires_sender_id", True) for item in plan["recipients"])
    if requires_sender_id and not sender_id:
        return {"success": False, "message": "Sender ID is required for one or more destinations."}, 400
    allowed_categories = {"marketing", "service", "transactional", "authentication"}
    category = clean_string(category).lower()
    if plan["international"] and category not in allowed_categories:
        return {"success": False, "message": "Select a valid message category for international SMS."}, 400
    if "bird" in plan["groups"] and (not settings.get("bird_enabled") or not settings.get("bird_api_key")):
        return {"success": False, "message": "International SMS is currently unavailable.", "code": "bird_not_configured"}, 400
    if "moolre" in plan["groups"]:
        try:
            enforce_approved_moolre_sender_id(user["_id"], sender_id)
        except SenderIdError as exc:
            return {"success": False, "message": exc.message}, exc.status_code
    preview = cost_preview(plan["recipient_count"], message, settings, [item["recipient_normalized"] for item in plan["recipients"]])
    sms_before = sms_credit_balance(current_app.config["DB"], user["_id"])
    required_credits = int(preview["sms_units"])
    if sms_before < required_credits:
        create_notification(
            user["_id"], "wallet", "Insufficient wallet balance",
            f"SMS sending was blocked. Required {required_credits} SMS credits.",
            "warning", "wallet", "", "/user/wallet",
            {"required": required_credits, "balance": sms_before},
        )
        return {"success": False, "message": "Insufficient SMS balance.", "sms_balance": sms_before, "required_sms": required_credits, "preview": preview}, 400

    reference = create_reference("SMS")
    variables = message_variables(message)
    context_by_phone = contact_contexts or {}
    personalized = bool(variables and context_by_phone)
    provider_references = [create_sms_reference(f"{reference}-{index + 1}") for index, _recipient in enumerate(plan["recipients"])]
    personalized_messages = []
    provider_batches = {}
    recipient_details = []
    for index, item in enumerate(plan["recipients"]):
        normalized = item["recipient_normalized"]
        context = context_by_phone.get(normalized) or context_by_phone.get(normalized.lstrip("+"))
        rendered = render_message(message, contact_values(context, normalized)) if personalized else message
        if personalized:
            personalized_messages.append({"recipient": normalized, "message": rendered})
        provider_recipient = normalized if item["provider"] == "bird" else normalized.lstrip("+")
        provider_batches.setdefault(item["provider"], []).append({"recipient": provider_recipient, "message": rendered, "ref": provider_references[index], "category": category, "shared_sender": item.get("shared_sender", False)})
        recipient_details.append({**item, "provider_reference": provider_references[index], "status": "pending"})
    reservation = reserve_sms_credits(current_app.config["DB"], user["_id"], required_credits, reference, wallet_category)
    if not reservation.get("success"):
        return {"success": False, "message": "Insufficient SMS balance.", "sms_balance": reservation.get("balance", 0), "required_sms": required_credits, "preview": preview}, 400
    sms_after = reservation["balance_after"]
    provider_responses = []
    failed_provider = None
    for provider_name, provider_messages in provider_batches.items():
        try:
            provider_client = get_sms_provider_by_name(provider_name, settings)
            result = provider_client.send_bulk(sender_id, provider_messages)
        except SmsProviderError as exc:
            result = {"success": False, "message": exc.message, "provider": provider_name, "provider_response": exc.raw or {}, "provider_code": exc.code, "provider_status": "failed", "provider_error": exc.message, "references": [item["ref"] for item in provider_messages], "results": []}
        provider_responses.append(result)
        result_by_recipient = {str(row.get("recipient")): row for row in result.get("results", [])}
        for detail in recipient_details:
            if detail["provider"] == provider_name:
                provider_key = detail["recipient_normalized"] if provider_name == "bird" else detail["recipient_normalized"].lstrip("+")
                row = result_by_recipient.get(provider_key, {})
                detail["status"] = row.get("status") or ("accepted" if result.get("success") else "failed")
                detail["provider_message_id"] = row.get("ref") or detail["provider_reference"]
        if not result.get("success"):
            failed_provider = result
            break
    provider_summary = {
        "success": failed_provider is None,
        "message": failed_provider.get("message") if failed_provider else "SMS accepted for processing.",
        "provider": next(iter(provider_batches)) if len(provider_batches) == 1 else "mixed",
        "provider_response": {"providers": [{"provider": row.get("provider"), "status": row.get("provider_status"), "response": row.get("provider_response", {})} for row in provider_responses]},
        "provider_status": "accepted" if failed_provider is None else "failed",
        "provider_error": failed_provider.get("provider_error", "") if failed_provider else "",
        "provider_code": failed_provider.get("provider_code", "") if failed_provider else "",
        "references": [ref for row in provider_responses for ref in row.get("references", [])],
        "results": recipient_details,
    }
    only_destination = plan["recipients"][0] if len(plan["countries"]) == 1 else {}
    log_extra_fields = {**(log_extra or {}), "recipient_details": recipient_details, "countries": plan["countries"], "country_code": only_destination.get("country_code"), "country_name": only_destination.get("country_name"), "country_dial_code": only_destination.get("country_dial_code"), "international": plan["international"], "encoding": plan["encoding"], "message_category": category if plan["international"] else ""}
    if failed_provider:
        accepted_credits = sum(int(item.get("sms_parts") or 1) for item in recipient_details if item.get("status") not in {"pending", "failed"})
        refund_credits = required_credits - accepted_credits
        if refund_credits > 0:
            refund_sms_credits(current_app.config["DB"], user["_id"], reservation["allocations"], reference, "Unaccepted SMS credits refunded", credits=refund_credits)
        final_balance = sms_after + refund_credits
        finalize_sms_usage(current_app.config["DB"], user["_id"], reference, "partial" if accepted_credits else "refunded")
        normalized_recipients = [item["recipient_normalized"] for item in plan["recipients"]]
        failure_status = "partial" if accepted_charge else "failed"
        failure_preview = {**preview, "sms_units": accepted_credits, "refunded_sms_units": refund_credits}
        log = insert_sms_log(user, normalized_recipients, sender_id, message, log_type, failure_status, failure_preview, reference, provider_summary["provider_response"], provider_summary["message"], sms_before, final_balance, campaign_id, provider_summary["provider"], provider_summary, log_extra_fields)
        create_notification(
            user["_id"], "sms", "SMS failed",
            f"SMS to {plan['recipient_count']} recipient(s) failed: {provider_summary['message']}",
            "error", "sms", reference, "/user/logs",
            {"recipient_count": plan["recipient_count"], "type": log_type},
        )
        message_text = "Some messages were accepted; unaccepted recipients were refunded." if accepted_charge else provider_summary["message"]
        return {"success": False, "message": message_text, "log": safe_log(log), "sms_balance": final_balance, "provider_response": {}}, 502

    now = now_utc()
    finalize_sms_usage(current_app.config["DB"], user["_id"], reference, "success")
    if sender_id:
        save_sender_id(user["_id"], sender_id)
    normalized_recipients = [item["recipient_normalized"] for item in plan["recipients"]]
    log_status = "submitted" if "bird" in provider_batches else "delivered"
    log = insert_sms_log(user, normalized_recipients, sender_id, message, log_type, log_status, preview, reference, provider_summary["provider_response"], "", sms_before, sms_after, campaign_id, provider_summary["provider"], provider_summary, log_extra_fields)
    title = "SMS campaign submitted" if log_type == "campaign" else "Bulk SMS submitted" if log_type == "bulk" else "SMS submitted"
    create_notification(
        user["_id"], "sms", title,
        f"SMS accepted for {plan['recipient_count']} recipient(s). Used {required_credits} SMS credits.",
        "success", "sms", reference, "/user/logs",
        {"recipient_count": plan["recipient_count"], "sms_parts": preview["sms_parts"], "type": log_type},
    )
    if personalized_messages:
        sms_logs().update_one({"_id": log["_id"]}, {"$set": {"personalized_messages": personalized_messages, "template_variables": sorted(variables)}})
    return {"success": True, "message": "SMS submitted successfully.", "log": safe_log(log), "sms_balance": sms_after, "preview": preview, "provider_response": {}}, 200


@sms_bp.get("/cost-preview")
@require_auth
def preview_sms_cost(payload):
    user, error = require_active_user(payload)
    if error:
        return error

    message = clean_string(request.args.get("message", ""))
    group = clean_string(request.args.get("group", ""))
    raw_recipients = request.args.get("recipients", "")
    recipients = parse_numbers(raw_recipients)
    if clean_string(raw_recipients) and not recipients:
        return jsonify({"success": False, "message": "Enter a valid mobile phone number.", "code": "invalid_phone_number"}), 400
    if group:
        recipients.extend(get_group_recipients(user["_id"], group))
    recipients = list(dict.fromkeys(recipients))
    count = int(request.args.get("recipient_count", "0") or 0) or len(recipients) or 1
    try:
        preview = cost_preview(count, message, recipients=recipients or None)
    except SmsRoutingError as exc:
        return jsonify({"success": False, "message": exc.message, "code": exc.code}), exc.status_code
    return jsonify({"success": True, "preview": preview, "recipient_count": preview.get("recipient_count", count)})


@sms_bp.get("/sender-ids")
@require_auth
def list_sender_ids(payload):
    user, error = require_active_user(payload)
    if error:
        return error

    settings = get_sms_settings()
    if settings.get("active_sms_provider") == "moolre":
        applications = list_user_sender_ids(user)
        return jsonify({
            "success": True,
            "active_sms_provider": "moolre",
            "sender_ids": approved_sender_ids_for_user(user["_id"]),
            "applications": applications,
        })
    items = current_app.config["DB"].sms_sender_ids.find({"user_id": user["_id"], "provider": {"$ne": "moolre"}}).sort("updated_at", -1).limit(10)
    return jsonify({"success": True, "active_sms_provider": settings.get("active_sms_provider", "arkesel"), "sender_ids": [item.get("sender_id") for item in items], "applications": list_user_sender_ids(user)})


@sms_bp.post("/sender-ids")
@require_auth
def add_sender_id(payload):
    user, error = require_active_user(payload)
    if error:
        return error
    sender_id = sanitize_sender_id((request.get_json(silent=True) or {}).get("sender_id", ""))
    if not sender_id:
        return {"success": False, "message": "Sender ID is required."}, 400
    save_sender_id(user["_id"], sender_id)
    return jsonify({"success": True, "sender_id": sender_id})


@sms_bp.post("/sender-id-applications")
@require_auth
def submit_sender_id_application(payload):
    user, error = require_active_user(payload)
    if error:
        return error
    try:
        record = submit_sender_id(user, (request.get_json(silent=True) or {}).get("sender_id", ""))
    except SenderIdError as exc:
        return {"success": False, "message": exc.message}, exc.status_code
    return jsonify({"success": True, "message": "Your Sender ID has been submitted and is waiting for approval.", "sender_id": record})


@sms_bp.post("/sender-id-applications/<record_id>/refresh")
@require_auth
def refresh_sender_id_application(payload, record_id):
    user, error = require_active_user(payload)
    if error:
        return error
    try:
        record = refresh_sender_id(record_id, user=user, enforce_cooldown=True)
    except SenderIdError as exc:
        return {"success": False, "message": exc.message}, exc.status_code
    return jsonify({"success": True, "sender_id": record})


@sms_bp.post("/send-single")
@require_auth
def send_single_sms(payload):
    locked = check_service_available("sms_sender")
    if locked:
        return locked
    user, error = require_active_user(payload)
    if error:
        return error
    data = request.get_json(silent=True) or {}
    sender_id = sanitize_sender_id(data.get("sender_id", ""))
    message = clean_string(data.get("message", ""))
    recipients = parse_numbers(data.get("recipient", ""))
    context_by_phone = {phone: {"phone": phone} for phone in recipients}
    context_by_phone.update(get_contacts_by_phones(user["_id"], recipients))
    response, status = send_sms_flow(user, recipients, sender_id, message, "single", contact_contexts=context_by_phone, category=data.get("category", ""))
    return jsonify(response), status


@sms_bp.post("/send-bulk")
@require_auth
def send_bulk_sms(payload):
    locked = check_service_available("sms_sender")
    if locked:
        return locked
    user, error = require_active_user(payload)
    if error:
        return error
    data = request.get_json(silent=True) or {}
    sender_id = sanitize_sender_id(data.get("sender_id", ""))
    message = clean_string(data.get("message", ""))
    recipients = parse_numbers(data.get("recipients") or data.get("numbers") or data.get("recipient") or "")
    context_by_phone = {phone: {"phone": phone} for phone in recipients}
    context_by_phone.update(get_contacts_by_phones(user["_id"], recipients))
    group = clean_string(data.get("group", ""))
    if group:
        for contact in get_group_contacts(user["_id"], group):
            phone = normalize_phone(contact.get("phone", ""))
            if phone:
                recipients.append(phone)
                context_by_phone[phone] = contact
    recipients = list(dict.fromkeys(recipients))
    context_by_phone.update({phone: context for phone, context in get_contacts_by_phones(user["_id"], recipients).items() if phone not in context_by_phone or context_by_phone[phone].get("phone") == phone})
    missing = sorted(message_variables(message) - set().union(*(contact_values(ctx, phone).keys() for phone, ctx in context_by_phone.items())) if context_by_phone else message_variables(message))
    response, status = send_sms_flow(user, recipients, sender_id, message, "bulk", contact_contexts=context_by_phone, category=data.get("category", ""))
    if missing:
        response["warnings"] = [f"Missing values for: {', '.join(missing)}"]
    return jsonify(response), status


@sms_bp.get("/history")
@require_auth
def sms_history(payload):
    user, error = require_active_user(payload)
    if error:
        return error
    query = {"user_id": user["_id"]}
    status = clean_string(request.args.get("status", ""))
    log_type = clean_string(request.args.get("type", ""))
    if status and status != "all":
        query["status"] = status
    if log_type and log_type != "all":
        query["type"] = log_type
    logs = sms_logs().find(query).sort("created_at", -1).limit(200)
    return jsonify({"success": True, "logs": [safe_log(log) for log in logs]})


@sms_bp.get("/contact-groups")
@require_auth
def sms_contact_groups(payload):
    user, error = require_active_user(payload)
    if error:
        return error
    pipeline = [
        {"$match": {"user_id": user["_id"]}},
        {"$group": {"_id": "$group", "count": {"$sum": 1}}},
        {"$sort": {"_id": 1}},
    ]
    groups = [{"name": "All Contacts", "count": contacts_collection().count_documents({"user_id": user["_id"]})}]
    groups.extend({"name": item["_id"] or "All Contacts", "count": item["count"]} for item in contacts_collection().aggregate(pipeline) if item["_id"] != "All Contacts")
    return jsonify({"success": True, "groups": groups})


@sms_bp.post("/campaigns")
@require_auth
def create_campaign(payload):
    locked = check_service_available("sms_campaigns")
    if locked:
        return locked
    user, error = require_active_user(payload)
    if error:
        return error
    data = request.get_json(silent=True) or {}
    name = clean_string(data.get("name", ""))
    sender_id = sanitize_sender_id(data.get("sender_id", ""))
    message = clean_string(data.get("message", ""))
    group = clean_string(data.get("group", ""))
    schedule = clean_string(data.get("scheduled_at", ""))
    template_id = clean_string(data.get("template_id", ""))
    recipients = get_request_recipients(user, data)
    if not name or not message or not sender_id:
        return {"success": False, "message": "Campaign name, sender ID, and message are required."}, 400
    if not group and not recipients:
        return {"success": False, "message": "Select recipients or a contact group."}, 400
    now = now_utc()
    campaign = {
        "user_id": user["_id"],
        "campaign_type": "sms",
        "campaign_name": name,
        "template_id": template_id or None,
        "name": name,
        "sender_id": sender_id,
        "message": message,
        "group": group,
        "recipients": recipients,
        "recipient_count": len(recipients),
        "sent": 0,
        "delivered": 0,
        "failed": 0,
        "status": "scheduled" if schedule else "draft",
        "scheduled_at": schedule or None,
        "created_at": now,
        "updated_at": now,
    }
    result = campaigns_collection().insert_one(campaign)
    campaign["_id"] = result.inserted_id
    return jsonify({"success": True, "campaign": safe_campaign(campaign)})


def safe_campaign(campaign: dict) -> dict:
    return {
        "id": str(campaign["_id"]),
        "campaign_type": campaign.get("campaign_type", "sms"),
        "template_id": campaign.get("template_id"),
        "name": campaign.get("name", ""),
        "sender_id": campaign.get("sender_id", ""),
        "message": campaign.get("message", ""),
        "group": campaign.get("group", ""),
        "recipients": int(campaign.get("recipient_count", 0) or 0),
        "sent": int(campaign.get("sent", 0) or 0),
        "delivered": int(campaign.get("delivered", 0) or 0),
        "failed": int(campaign.get("failed", 0) or 0),
        "status": campaign.get("status", "draft"),
        "createdAt": iso(campaign.get("created_at")),
        "scheduledAt": campaign.get("scheduled_at"),
    }


def safe_admin_campaign(campaign: dict) -> dict:
    user = users_collection().find_one({"_id": campaign.get("user_id")}) if campaign.get("user_id") else None
    payload = safe_campaign(campaign)
    payload.update({
        "user": user.get("full_name") or user.get("name") or user.get("email") if user else "Unknown",
        "user_email": user.get("email", "") if user else "",
        "channel": "SMS",
        "delivered": int(campaign.get("delivered", 0) or 0),
        "actualCost": 0,
        "estCost": 0,
    })
    related_logs = list(sms_logs().find({"campaign_id": campaign.get("_id")}))
    if related_logs:
        payload["actualCost"] = round(sum(to_float(log.get("total_cost")) for log in related_logs), 4)
        payload["estCost"] = payload["actualCost"]
    return payload


@sms_bp.get("/campaigns")
@require_auth
def list_campaigns(payload):
    user, error = require_active_user(payload)
    if error:
        return error
    campaigns = campaigns_collection().find({"user_id": user["_id"]}).sort("created_at", -1)
    return jsonify({"success": True, "campaigns": [safe_campaign(campaign) for campaign in campaigns]})


@sms_bp.post("/campaigns/<campaign_id>/send")
@require_auth
def send_campaign(payload, campaign_id):
    locked = check_service_available("sms_campaigns")
    if locked:
        return locked
    user, error = require_active_user(payload)
    if error:
        return error
    try:
        object_id = ObjectId(campaign_id)
    except Exception:
        return {"success": False, "message": "Invalid campaign id."}, 400
    campaign = campaigns_collection().find_one({"_id": object_id, "user_id": user["_id"]})
    if not campaign:
        return {"success": False, "message": "Campaign not found."}, 404
    recipients = campaign.get("recipients") or get_group_recipients(user["_id"], campaign.get("group", ""))
    context_by_phone = get_contacts_by_phones(user["_id"], recipients)
    for contact in get_group_contacts(user["_id"], campaign.get("group", "")):
        phone = normalize_phone(contact.get("phone", ""))
        if phone:
            context_by_phone[phone] = contact
    response, status = send_sms_flow(user, recipients, campaign.get("sender_id", ""), campaign.get("message", ""), "campaign", object_id, contact_contexts=context_by_phone)
    if response.get("success"):
        provider_name = (response.get("log") or {}).get("provider", "arkesel")
        log_status = (response.get("log") or {}).get("status")
        campaigns_collection().update_one({"_id": object_id}, {"$set": {
            "status": "running" if log_status == "submitted" else "completed",
            "provider": provider_name,
            "provider_selected_at": now_utc(),
            "sent": len(recipients),
            "delivered": 0 if log_status == "submitted" else len(recipients),
            "failed": 0,
            "updated_at": now_utc(),
        }})
    return jsonify(response), status


@sms_bp.put("/campaigns/<campaign_id>")
@require_auth
def update_campaign(payload, campaign_id):
    locked = check_service_available("sms_campaigns")
    if locked:
        return locked
    user, error = require_active_user(payload)
    if error:
        return error
    try:
        object_id = ObjectId(campaign_id)
    except Exception:
        return {"success": False, "message": "Invalid campaign id."}, 400
    data = request.get_json(silent=True) or {}
    update = {
        "name": clean_string(data.get("name", "")),
        "sender_id": sanitize_sender_id(data.get("sender_id", "")),
        "message": clean_string(data.get("message", "")),
        "group": clean_string(data.get("group", "")),
        "scheduled_at": clean_string(data.get("scheduled_at", "")) or None,
        "updated_at": now_utc(),
    }
    update = {key: value for key, value in update.items() if value not in {"", None} or key in {"scheduled_at", "updated_at"}}
    result = campaigns_collection().update_one({"_id": object_id, "user_id": user["_id"]}, {"$set": update})
    if not result.matched_count:
        return {"success": False, "message": "Campaign not found."}, 404
    campaign = campaigns_collection().find_one({"_id": object_id})
    return jsonify({"success": True, "campaign": safe_campaign(campaign)})


@sms_bp.delete("/campaigns/<campaign_id>")
@require_auth
def delete_campaign(payload, campaign_id):
    user, error = require_active_user(payload)
    if error:
        return error
    try:
        object_id = ObjectId(campaign_id)
    except Exception:
        return {"success": False, "message": "Invalid campaign id."}, 400
    result = campaigns_collection().delete_one({"_id": object_id, "user_id": user["_id"]})
    if not result.deleted_count:
        return {"success": False, "message": "Campaign not found."}, 404
    return jsonify({"success": True, "message": "Campaign deleted."})


@admin_sms_bp.get("/settings")
@require_admin
def admin_get_sms_settings(payload):
    return jsonify({"success": True, "settings": get_sms_settings()})


@admin_sms_bp.put("/settings")
@require_admin
def admin_update_sms_settings(payload):
    data = request.get_json(silent=True) or {}
    try:
        settings = save_sms_settings(data, payload.get("user_id", "admin"))
    except (ValueError, SmsProviderError) as exc:
        return {"success": False, "message": getattr(exc, "message", str(exc))}, getattr(exc, "status_code", 400)
    provider_label = "Moolre" if settings.get("active_sms_provider") == "moolre" else "Arkesel"
    return jsonify({"success": True, "message": f"SMS settings saved successfully. {provider_label} is the active Ghana SMS provider.", "settings": settings})


@admin_sms_bp.post("/settings/moolre/test")
@require_admin
def admin_test_moolre_sms_settings(payload):
    try:
        result = test_moolre_connection(request.get_json(silent=True) or {})
    except SmsProviderError as exc:
        platform_settings().update_one(
            {"key": "sms_settings"},
            {"$set": {"moolre_last_test_status": "failed", "moolre_last_test_message": exc.message, "moolre_last_test_at": now_utc(), "moolre_provider_connection_status": "failed", "updated_at": now_utc()}},
            upsert=True,
        )
        return {"success": False, "message": exc.message}, exc.status_code
    return jsonify({**result, "settings": get_sms_settings()})


@admin_sms_bp.post("/settings/bird/test")
@require_admin
def admin_test_bird_sms_settings(payload):
    try:
        result = test_bird_connection(request.get_json(silent=True) or {})
    except SmsProviderError as exc:
        platform_settings().update_one(
            {"key": "sms_settings"},
            {"$set": {"bird_last_test_status": "failed", "bird_last_test_message": exc.message, "bird_last_test_at": now_utc(), "bird_connection_status": "failed", "updated_at": now_utc()}},
            upsert=True,
        )
        return {"success": False, "message": exc.message}, exc.status_code
    return jsonify({**result, "settings": get_sms_settings()})


@admin_sms_bp.get("/international-pricing")
@require_admin
def admin_list_international_sms_pricing(payload):
    search = clean_string(request.args.get("search", ""))
    query = {"provider": "bird"}
    if search:
        query["$or"] = [
            {"country_name": {"$regex": re.escape(search), "$options": "i"}},
            {"country_code": {"$regex": f"^{re.escape(search)}$", "$options": "i"}},
            {"dial_code": {"$regex": re.escape(search)}},
        ]
    rows = international_pricing_collection().find(query).sort("country_name", 1)
    return jsonify({"success": True, "pricing": [safe_pricing_rule(row) for row in rows]})


@admin_sms_bp.put("/international-pricing/<country_code>")
@require_admin
def admin_save_international_sms_pricing(payload, country_code):
    data = request.get_json(silent=True) or {}
    data["country_code"] = country_code
    try:
        row = save_international_pricing(data, payload.get("user_id", "admin"))
    except SmsRoutingError as exc:
        return {"success": False, "message": exc.message}, exc.status_code
    return jsonify({"success": True, "message": "International SMS pricing saved.", "pricing": row})


@admin_sms_bp.put("/shared-senders")
@require_admin
def admin_save_shared_senders(payload):
    data = request.get_json(silent=True) or {}
    raw_codes = data.get("country_codes") or []
    if not isinstance(raw_codes, list):
        return {"success": False, "message": "Select valid Shared Sender countries."}, 400
    codes = {clean_string(str(code)).upper() for code in raw_codes}
    codes.discard("GH")
    codes = {code for code in codes if len(code) == 2}
    collection = international_pricing_collection()
    collection.update_many({"provider": "bird", "country_code": {"$ne": "GH"}}, {"$set": {"shared_sender": False, "updated_at": now_utc()}})
    if codes:
        collection.update_many({"provider": "bird", "country_code": {"$in": sorted(codes)}}, {"$set": {"shared_sender": True, "updated_at": now_utc(), "updated_by": payload.get("user_id", "admin")}})
    rows = collection.find({"provider": "bird"}).sort("country_name", 1)
    return jsonify({"success": True, "message": "Shared Sender countries saved.", "pricing": [safe_pricing_rule(row) for row in rows]})


@admin_sms_bp.get("/sender-ids")
@require_admin
def admin_list_sender_ids(payload):
    status = clean_string(request.args.get("status", "all")).lower() or "all"
    return jsonify({"success": True, **admin_sender_ids(status)})


@admin_sms_bp.post("/sender-ids/sync")
@require_admin
def admin_sync_sender_ids(payload):
    try:
        result = sync_all_sender_ids(payload.get("user_id", "admin"))
    except (SenderIdError, SmsProviderError) as exc:
        return {"success": False, "message": getattr(exc, "message", str(exc))}, getattr(exc, "status_code", 400)
    return jsonify({"success": True, "message": "Moolre Sender IDs synchronized.", **result})


@admin_sms_bp.post("/sender-ids/<record_id>/sync")
@require_admin
def admin_sync_sender_id(payload, record_id):
    try:
        record = refresh_sender_id(record_id, actor_id=payload.get("user_id", "admin"))
    except SenderIdError as exc:
        return {"success": False, "message": exc.message}, exc.status_code
    return jsonify({"success": True, "sender_id": record})


@admin_sms_bp.get("/logs")
@require_admin
def admin_sms_logs(payload):
    query = {}
    status = clean_string(request.args.get("status", ""))
    log_type = clean_string(request.args.get("type", ""))
    if status and status != "all":
        query["status"] = status
    if log_type and log_type != "all":
        query["type"] = log_type
    logs = sms_logs().find(query).sort("created_at", -1).limit(500)
    return jsonify({"success": True, "logs": [safe_log(log, admin=True) for log in logs]})


@admin_sms_bp.post("/logs/<sms_id>/status")
@require_admin
def admin_check_sms_log_status(payload, sms_id):
    log = sms_logs().find_one({"sms_id": clean_string(sms_id)})
    if not log:
        return {"success": False, "message": "SMS log not found."}, 404
    references = log.get("provider_references") or [log.get("provider_reference") or log.get("sms_id")]
    references = [ref for ref in references if ref]
    if not references:
        return {"success": False, "message": "No provider references are stored for this SMS."}, 400
    try:
        provider = get_sms_provider_by_name(log.get("provider", "arkesel"))
        result = provider.check_delivery_status(references)
    except SmsProviderError as exc:
        return {"success": False, "message": exc.message}, exc.status_code
    if not result.get("success"):
        return {"success": False, "message": result.get("message", "Delivery status is not available for this provider.")}, 400
    update = {
        "provider_status_response": result.get("provider_response", {}),
        "provider_delivery_statuses": result.get("statuses", []),
        "provider_status_checked_at": now_utc(),
        "updated_at": now_utc(),
    }
    sms_logs().update_one({"_id": log["_id"]}, {"$set": update})
    return jsonify({"success": True, "provider": log.get("provider", "arkesel"), "references": references, "statuses": result.get("statuses", [])})


@admin_sms_bp.get("/campaigns")
@require_admin
def admin_sms_campaigns(payload):
    query = {}
    status = clean_string(request.args.get("status", ""))
    if status and status != "all":
        query["status"] = status
    campaigns = campaigns_collection().find(query).sort("created_at", -1).limit(500)
    return jsonify({"success": True, "campaigns": [safe_admin_campaign(campaign) for campaign in campaigns]})


@admin_sms_bp.get("/stats")
@require_admin
def admin_sms_stats(payload):
    logs = list(sms_logs().find({}))
    billable_statuses = {"submitted", "accepted", "processing", "sent", "delivered"}
    revenue = sum(to_float(log.get("total_cost")) for log in logs if log.get("status") in billable_statuses)
    provider_cost = sum(to_float(log.get("provider_total_cost")) for log in logs if log.get("status") in billable_statuses)
    return jsonify({"success": True, "stats": {
        "total": len(logs),
        "delivered": sum(1 for log in logs if log.get("status") == "delivered"),
        "failed": sum(1 for log in logs if log.get("status") in {"failed", "partial"}),
        "pending": sum(1 for log in logs if log.get("status") in {"pending", "submitted", "accepted", "processing"}),
        "revenue": round(revenue, 4),
        "cost": round(provider_cost, 4),
        "profit": round(revenue - provider_cost, 4),
    }})


@admin_sms_bp.get("/export")
@require_admin
def admin_sms_export(payload):
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["SMS ID", "User", "Recipient", "Sender ID", "Type", "Status", "Cost", "Date", "Message"])
    for log in sms_logs().find({}).sort("created_at", -1):
        safe = safe_log(log)
        writer.writerow([safe["sms_id"], safe["user_name"], safe["recipient"], safe["sender_id"], safe["type"], safe["status"], safe["total_cost"], safe["created_at"], safe["message_preview"]])
    return Response(output.getvalue(), mimetype="text/csv", headers={"Content-Disposition": "attachment; filename=viresend-sms-logs.csv"})
