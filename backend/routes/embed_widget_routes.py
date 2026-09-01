import hashlib
import hmac
import re
import secrets
from urllib.parse import urlparse

import requests
from bson import ObjectId
from flask import Blueprint, current_app, jsonify, redirect, request
import json
from pymongo import ReturnDocument

from config import Config
from routes.email_routes import (
    account_for_user,
    build_recipients as build_email_recipients,
    email_accounts,
    email_cost,
    email_logs,
    get_email_settings,
    send_email_flow,
)
from routes.sms_routes import (
    cost_preview as sms_cost_preview,
    normalize_phone,
    parse_numbers,
    sanitize_sender_id,
    send_sms_flow,
    sms_logs,
)
from utils.auth import require_admin, require_auth, users_collection
from utils.notifications import create_notification
from utils.security import clean_string, is_valid_email, now_utc
from utils.service_control import check_service_available
from utils.abuse import abuse_check_message, abuse_check_user_allowed

embed_widgets_bp = Blueprint("embed_widgets", __name__, url_prefix="/api/embed-widgets")
admin_embed_widgets_bp = Blueprint("admin_embed_widgets", __name__, url_prefix="/api/admin/embed-widgets")
public_embed_widgets_bp = Blueprint("public_embed_widgets", __name__, url_prefix="/api/public/widgets")
public_widget_page_bp = Blueprint("public_widget_page", __name__, url_prefix="/widget")


def db():
    return current_app.config["DB"]


def widgets_collection():
    return db().embed_widgets


def widget_logs_collection():
    return db().embed_widget_logs


def users():
    return users_collection()


def iso(value):
    return value.isoformat() if value else None


def to_float(value, fallback=0.0):
    try:
        return round(float(value), 4)
    except (TypeError, ValueError):
        return fallback


def widget_token(widget_id: str) -> str:
    signature = hmac.new(
        Config.JWT_SECRET.encode("utf-8"),
        f"embed-widget:{widget_id}".encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()[:24]
    return f"wpk_{widget_id}_{signature}"


def token_hash(token: str) -> str:
    return hashlib.sha256((token or "").encode("utf-8")).hexdigest()


def create_widget_id() -> str:
    return f"wdg_{secrets.token_hex(6)}"


def user_from_payload(payload):
    try:
        return users().find_one({"_id": ObjectId(payload.get("user_id") or payload.get("sub"))})
    except Exception:
        return None


def require_active_user(payload):
    user = user_from_payload(payload)
    if not user:
        return None, ({"success": False, "message": "User account not found."}, 404)
    if user.get("account_status") != "active":
        return None, ({"success": False, "message": "Your account is not active."}, 403)
    return user, None


def split_list(value):
    if isinstance(value, list):
        raw = value
    else:
        raw = re.split(r"[\n,;]+", str(value or ""))
    items = [clean_string(str(item)) for item in raw if clean_string(str(item))]
    if any(item.lower() in {"*", "all", "all domains", "any", "any domain"} for item in items):
        return []
    return items


def parse_limit(value, default=0, as_float=False):
    try:
        parsed = float(value) if as_float else int(value)
        return max(0, parsed)
    except (TypeError, ValueError):
        return default


def clean_url(value: str) -> str:
    url = clean_string(value or "")
    if not url:
        return ""
    parsed = urlparse(url)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        return ""
    return url[:500]


def clean_hex_color(value: str, fallback: str) -> str:
    color = clean_string(value or "")
    if re.fullmatch(r"#[0-9A-Fa-f]{6}", color):
        return color
    return fallback


def sanitize_theme(value: dict | None, existing: dict | None = None) -> dict:
    existing = existing or {}
    value = value if isinstance(value, dict) else {}
    return {
        "primary_color": clean_hex_color(value.get("primary_color") or value.get("primaryColor") or existing.get("primary_color"), "#2563EB"),
        "background_color": clean_hex_color(value.get("background_color") or value.get("backgroundColor") or existing.get("background_color"), "#f1f5f9"),
        "logo_url": clean_url(value.get("logo_url") or value.get("logoUrl") or existing.get("logo_url") or ""),
        "button_text": clean_string(value.get("button_text") or value.get("buttonText") or existing.get("button_text") or "Send")[:40],
        "show_branding": bool(value.get("show_branding", value.get("showBranding", existing.get("show_branding", True)))),
    }


def normalize_payload(data: dict, existing: dict | None = None) -> dict:
    existing = existing or {}
    widget_type = clean_string(data.get("type") or existing.get("type") or "sms").lower()
    if widget_type not in {"sms", "email", "combined"}:
        widget_type = "sms"

    status = clean_string(data.get("status") or existing.get("status") or "active").lower()
    if status not in {"active", "disabled"}:
        status = "active"

    return {
        "name": clean_string(data.get("name") or existing.get("name") or "")[:120],
        "type": widget_type,
        "status": status,
        "default_sender_id": sanitize_sender_id(data.get("default_sender_id") or data.get("defaultSenderId") or existing.get("default_sender_id") or "VireSend"),
        "default_email_account_id": clean_string(data.get("default_email_account_id") or data.get("defaultEmailAccountId") or existing.get("default_email_account_id") or ""),
        "allowed_domains": [],
        "require_visitor_login": False,
        "captcha_enabled": False,
        "allowed_contact_groups": split_list(data.get("allowed_contact_groups") or data.get("allowedContactGroups") or existing.get("allowed_contact_groups") or []),
        "success_redirect_url": clean_url(data.get("success_redirect_url") or data.get("successRedirectUrl") or existing.get("success_redirect_url") or ""),
        "webhook_callback_url": clean_url(data.get("webhook_callback_url") or data.get("webhookUrl") or existing.get("webhook_callback_url") or ""),
        "theme": sanitize_theme(data.get("theme"), existing.get("theme")),
    }


def safe_widget(widget: dict, admin=False) -> dict:
    token = widget_token(widget.get("widget_id", ""))
    owner = users().find_one({"_id": widget.get("user_id")}) if widget.get("user_id") else None
    return {
        "id": widget.get("widget_id"),
        "widget_id": widget.get("widget_id"),
        "token": token,
        "public_widget_token_prefix": widget.get("public_widget_token_prefix", token[:16]),
        "name": widget.get("name", ""),
        "type": widget.get("type", "sms"),
        "status": widget.get("status", "disabled"),
        "allowedDomains": "",
        "allowed_domains": [],
        "requireLogin": bool(widget.get("require_visitor_login")),
        "require_visitor_login": bool(widget.get("require_visitor_login")),
        "enableCaptcha": bool(widget.get("captcha_enabled")),
        "captcha_enabled": bool(widget.get("captcha_enabled")),
        "defaultSenderId": widget.get("default_sender_id", ""),
        "default_sender_id": widget.get("default_sender_id", ""),
        "defaultEmailAccountId": widget.get("default_email_account_id", ""),
        "default_email_account_id": widget.get("default_email_account_id", ""),
        "allowedContactGroups": ", ".join(widget.get("allowed_contact_groups") or []),
        "allowed_contact_groups": widget.get("allowed_contact_groups") or [],
        "successRedirectUrl": widget.get("success_redirect_url", ""),
        "success_redirect_url": widget.get("success_redirect_url", ""),
        "webhookUrl": widget.get("webhook_callback_url", ""),
        "webhook_callback_url": widget.get("webhook_callback_url", ""),
        "theme": widget.get("theme") or {},
        "totalSends": int(widget.get("total_sends", 0) or 0),
        "total_sends": int(widget.get("total_sends", 0) or 0),
        "totalSmsSends": int(widget.get("total_sms_sends", 0) or 0),
        "totalEmailSends": int(widget.get("total_email_sends", 0) or 0),
        "totalCost": to_float(widget.get("total_cost")),
        "total_cost": to_float(widget.get("total_cost")),
        "createdAt": iso(widget.get("created_at")) or "",
        "created_at": iso(widget.get("created_at")),
        "updated_at": iso(widget.get("updated_at")),
        "lastUsed": iso(widget.get("last_used_at")) or "Never",
        "last_used_at": iso(widget.get("last_used_at")),
        "userId": str(widget.get("user_id")) if widget.get("user_id") else "",
        "userName": (owner.get("full_name") or owner.get("email")) if owner else "Unknown",
        **({"user_email": owner.get("email") if owner else ""} if admin else {}),
    }


def safe_widget_log(log: dict) -> dict:
    action = log.get("action", "")
    log_type = "email" if "email" in action else "sms" if "sms" in action else log.get("widget_type", "sms")
    status = log.get("status", "failed")
    return {
        "id": log.get("log_id") or str(log.get("_id")),
        "log_id": log.get("log_id"),
        "widgetId": log.get("widget_id"),
        "widget_id": log.get("widget_id"),
        "widgetName": log.get("widget_name", ""),
        "widget_name": log.get("widget_name", ""),
        "widgetType": log.get("widget_type", ""),
        "type": log_type,
        "action": action,
        "recipient": log.get("recipient", ""),
        "recipient_count": int(log.get("recipient_count", 0) or 0),
        "status": "sent" if status == "success" and log_type == "email" else "delivered" if status == "success" else status,
        "raw_status": status,
        "failure_reason": log.get("failure_reason", ""),
        "cost": to_float(log.get("cost")),
        "domain": log.get("origin_domain", "Unknown"),
        "date": iso(log.get("created_at")) or "",
        "created_at": iso(log.get("created_at")),
        "related_sms_log_id": log.get("related_sms_log_id", ""),
        "related_email_log_id": log.get("related_email_log_id", ""),
    }


def public_config(widget: dict) -> dict:
    return {
        "id": widget.get("widget_id"),
        "name": widget.get("name", ""),
        "type": widget.get("type", "sms"),
        "status": widget.get("status", "disabled"),
        "defaultSenderId": widget.get("default_sender_id", "VireSend"),
        "captchaEnabled": bool(widget.get("captcha_enabled")),
        "requireVisitorLogin": bool(widget.get("require_visitor_login")),
        "successRedirectUrl": widget.get("success_redirect_url", ""),
        "theme": widget.get("theme") or {},
        "smsCostPerMessage": sms_cost_preview(1, "x").get("cost_per_sms"),
        "emailCostPerEmail": email_cost(1).get("cost_per_email"),
        "branding": bool((widget.get("theme") or {}).get("show_branding", True)),
    }


def request_origin_domain() -> str:
    raw = request.headers.get("Origin") or request.headers.get("Referer") or ""
    parsed = urlparse(raw)
    return (parsed.netloc or parsed.path or "direct").split("@")[-1].lower()


def hash_ip(ip: str) -> str:
    return hmac.new(Config.JWT_SECRET.encode("utf-8"), (ip or "").encode("utf-8"), hashlib.sha256).hexdigest()


def validate_public_widget(widget_id: str, token: str | None = None):
    widget = widgets_collection().find_one({"widget_id": widget_id})
    if not widget:
        return None, ({"success": False, "message": "Widget not found."}, 404)
    provided = token or request.args.get("token") or request.headers.get("X-VireSend-Widget-Token") or (request.get_json(silent=True) or {}).get("token")
    if not hmac.compare_digest(widget.get("widget_token_hash", ""), token_hash(provided or "")):
        log_widget_attempt(widget, "blocked", "blocked", "Invalid widget token.", 0)
        return None, ({"success": False, "message": "Invalid widget token."}, 403)
    if widget.get("status") != "active":
        log_widget_attempt(widget, "blocked", "blocked", "Widget is disabled.", 0)
        return None, ({"success": False, "message": "Widget is disabled."}, 403)

    return widget, None


def captcha_ok(widget: dict, data: dict) -> tuple[bool, str]:
    if not widget.get("captcha_enabled"):
        return True, ""
    secret = Config.RECAPTCHA_SECRET_KEY
    captcha_token = data.get("captcha_token") or data.get("captchaToken")
    if not secret:
        return True, ""
    if not captcha_token:
        return False, "CAPTCHA verification is required."
    try:
        response = requests.post(
            "https://www.google.com/recaptcha/api/siteverify",
            data={"secret": secret, "response": captcha_token, "remoteip": request.remote_addr},
            timeout=8,
        )
        if response.ok and response.json().get("success"):
            return True, ""
    except Exception:
        pass
    return False, "CAPTCHA verification failed."


def log_widget_attempt(widget: dict, action: str, status: str, failure_reason: str = "", cost=0, recipient="", recipient_count=0, message_preview="", related_sms_log_id="", related_email_log_id="", wallet_before=None, wallet_after=None):
    now = now_utc()
    log = {
        "log_id": f"wlog_{secrets.token_hex(8)}",
        "widget_id": widget.get("widget_id"),
        "user_id": widget.get("user_id"),
        "widget_name": widget.get("name", ""),
        "widget_type": widget.get("type", ""),
        "action": action,
        "visitor_ip_hash": hash_ip(request.headers.get("X-Forwarded-For", request.remote_addr or "").split(",")[0].strip()),
        "visitor_user_agent": clean_string(request.headers.get("User-Agent", ""))[:300],
        "visitor_device": "",
        "visitor_country": "",
        "origin_domain": request_origin_domain(),
        "recipient": recipient,
        "recipient_count": recipient_count,
        "message_preview": clean_string(message_preview)[:180],
        "status": status,
        "failure_reason": failure_reason,
        "cost": to_float(cost),
        "related_sms_log_id": related_sms_log_id,
        "related_email_log_id": related_email_log_id,
        "wallet_before": wallet_before,
        "wallet_after": wallet_after,
        "created_at": now,
    }
    widget_logs_collection().insert_one(log)
    return log


def notify_widget_owner(widget: dict, title: str, message: str, severity="info", metadata=None):
    create_notification(
        widget.get("user_id"), "system", title, message, severity,
        "embed_widgets", widget.get("widget_id"), "/user/embed-widgets",
        metadata or {},
    )


def deliver_webhook(widget: dict, event: dict):
    callback_url = widget.get("webhook_callback_url")
    if not callback_url:
        return
    body = {
        **event,
        "widget_id": widget.get("widget_id"),
        "widget_name": widget.get("name", ""),
        "timestamp": iso(now_utc()),
    }
    payload = json.dumps(body, separators=(",", ":"), sort_keys=True)
    signature = hmac.new(widget.get("widget_token_hash", "").encode("utf-8"), payload.encode("utf-8"), hashlib.sha256).hexdigest()
    try:
        requests.post(callback_url, json=body, headers={"X-VireSend-Signature": signature}, timeout=8)
    except Exception:
        pass


def owner_default_email_account(widget: dict):
    account_id = widget.get("default_email_account_id")
    if account_id:
        account = account_for_user(widget.get("user_id"), account_id)
        if account:
            return account
    return email_accounts().find_one({"user_id": widget.get("user_id"), "status": "connected", "is_default": True}) or email_accounts().find_one({"user_id": widget.get("user_id"), "status": "connected"})


@embed_widgets_bp.get("")
@require_auth
def list_widgets(payload):
    user, error = require_active_user(payload)
    if error:
        return error
    widgets = [safe_widget(item) for item in widgets_collection().find({"user_id": user["_id"]}).sort("created_at", -1)]
    return jsonify({"success": True, "widgets": widgets})


@embed_widgets_bp.post("")
@require_auth
def create_widget(payload):
    locked = check_service_available("embed_widgets")
    if locked:
        return locked
    user, error = require_active_user(payload)
    if error:
        return error
    data = request.get_json(silent=True) or {}
    normalized = normalize_payload(data)
    if not normalized["name"]:
        return {"success": False, "message": "Widget name is required."}, 400
    widget_id = create_widget_id()
    token = widget_token(widget_id)
    now = now_utc()
    widget = {
        "widget_id": widget_id,
        "user_id": user["_id"],
        **normalized,
        "widget_token_hash": token_hash(token),
        "public_widget_token_prefix": token[:16],
        "total_sends": 0,
        "total_sms_sends": 0,
        "total_email_sends": 0,
        "total_cost": 0,
        "last_used_at": None,
        "created_at": now,
        "updated_at": now,
    }
    widgets_collection().insert_one(widget)
    return jsonify({"success": True, "message": "Widget created.", "widget": safe_widget(widget)})


@embed_widgets_bp.get("/stats")
@require_auth
def widget_stats(payload):
    user, error = require_active_user(payload)
    if error:
        return error
    items = list(widgets_collection().find({"user_id": user["_id"]}))
    return jsonify({"success": True, "stats": {
        "total": len(items),
        "active": sum(1 for item in items if item.get("status") == "active"),
        "sms": sum(1 for item in items if item.get("type") == "sms"),
        "email": sum(1 for item in items if item.get("type") == "email"),
        "combined": sum(1 for item in items if item.get("type") == "combined"),
        "total_sends": sum(int(item.get("total_sends", 0) or 0) for item in items),
        "total_cost": round(sum(to_float(item.get("total_cost")) for item in items), 4),
    }})


@embed_widgets_bp.get("/logs")
@require_auth
def widget_logs(payload):
    user, error = require_active_user(payload)
    if error:
        return error
    query = {"user_id": user["_id"]}
    if request.args.get("widget_id"):
        query["widget_id"] = clean_string(request.args.get("widget_id"))
    if request.args.get("status"):
        query["status"] = clean_string(request.args.get("status"))
    logs = [safe_widget_log(item) for item in widget_logs_collection().find(query).sort("created_at", -1).limit(300)]
    return jsonify({"success": True, "logs": logs})


@embed_widgets_bp.get("/<widget_id>")
@require_auth
def get_widget(payload, widget_id):
    user, error = require_active_user(payload)
    if error:
        return error
    widget = widgets_collection().find_one({"user_id": user["_id"], "widget_id": widget_id})
    if not widget:
        return {"success": False, "message": "Widget not found."}, 404
    return jsonify({"success": True, "widget": safe_widget(widget)})


@embed_widgets_bp.put("/<widget_id>")
@require_auth
def update_widget(payload, widget_id):
    user, error = require_active_user(payload)
    if error:
        return error
    widget = widgets_collection().find_one({"user_id": user["_id"], "widget_id": widget_id})
    if not widget:
        return {"success": False, "message": "Widget not found."}, 404
    normalized = normalize_payload(request.get_json(silent=True) or {}, widget)
    if not normalized["name"]:
        return {"success": False, "message": "Widget name is required."}, 400
    normalized["updated_at"] = now_utc()
    widgets_collection().update_one({"_id": widget["_id"]}, {"$set": normalized})
    refreshed = widgets_collection().find_one({"_id": widget["_id"]})
    return jsonify({"success": True, "message": "Widget updated.", "widget": safe_widget(refreshed)})


@embed_widgets_bp.delete("/<widget_id>")
@require_auth
def delete_widget(payload, widget_id):
    user, error = require_active_user(payload)
    if error:
        return error
    result = widgets_collection().delete_one({"user_id": user["_id"], "widget_id": widget_id})
    if not result.deleted_count:
        return {"success": False, "message": "Widget not found."}, 404
    return jsonify({"success": True, "message": "Widget deleted."})


@embed_widgets_bp.post("/<widget_id>/enable")
@require_auth
def enable_widget(payload, widget_id):
    return set_widget_status(payload, widget_id, "active")


@embed_widgets_bp.post("/<widget_id>/disable")
@require_auth
def disable_widget(payload, widget_id):
    return set_widget_status(payload, widget_id, "disabled")


def set_widget_status(payload, widget_id, status):
    user, error = require_active_user(payload)
    if error:
        return error
    result = widgets_collection().find_one_and_update(
        {"user_id": user["_id"], "widget_id": widget_id},
        {"$set": {"status": status, "updated_at": now_utc()}},
        return_document=ReturnDocument.AFTER,
    )
    if not result:
        return {"success": False, "message": "Widget not found."}, 404
    return jsonify({"success": True, "message": f"Widget {status}.", "widget": safe_widget(result)})


@embed_widgets_bp.get("/<widget_id>/embed-code")
@require_auth
def embed_code(payload, widget_id):
    user, error = require_active_user(payload)
    if error:
        return error
    widget = widgets_collection().find_one({"user_id": user["_id"], "widget_id": widget_id})
    if not widget:
        return {"success": False, "message": "Widget not found."}, 404
    token = widget_token(widget_id)
    frontend = Config.FRONTEND_URL.rstrip("/")
    hosted = f"{frontend}/embed/{widget_id}?token={token}"
    title = clean_string(widget.get("name", "VireSend Widget")) or "VireSend Widget"
    iframe = f'<iframe src="{hosted}" width="100%" height="650" frameborder="0" style="border:0;border-radius:12px;" title="{title}"></iframe>'
    script = f'<script src="{frontend}/embed-widget.js" data-widget-id="{widget_id}" data-token="{token}"></script>'
    return jsonify({"success": True, "hosted_link": hosted, "iframe_code": iframe, "script_code": script, "token": token})


@public_widget_page_bp.get("/<widget_id>")
def hosted_widget(widget_id):
    token = widget_token(widget_id)
    return redirect(f"{Config.FRONTEND_URL.rstrip('/')}/embed/{widget_id}?token={token}")


@public_embed_widgets_bp.get("/<widget_id>/config")
def get_public_config(widget_id):
    widget, error = validate_public_widget(widget_id)
    if error:
        return error
    log_widget_attempt(widget, "view", "success")
    return jsonify({"success": True, "widget": public_config(widget)})


@public_embed_widgets_bp.post("/<widget_id>/send-sms")
def public_send_sms(widget_id):
    locked = check_service_available("embed_widgets")
    if locked:
        return locked
    data = request.get_json(silent=True) or {}
    widget, error = validate_public_widget(widget_id, data.get("token"))
    if error:
        return error
    if widget.get("type") not in {"sms", "combined"}:
        return {"success": False, "message": "This widget does not allow SMS sending."}, 400
    ok, captcha_error = captcha_ok(widget, data)
    if not ok:
        log_widget_attempt(widget, "blocked", "blocked", captcha_error, 0)
        return {"success": False, "message": captcha_error}, 403
    owner = users().find_one({"_id": widget.get("user_id")})
    restriction = abuse_check_user_allowed(owner or {}, "widget")
    if restriction:
        return restriction
    recipients = parse_numbers(data.get("recipients") or data.get("phone") or data.get("recipient") or "")
    sender_id = sanitize_sender_id(data.get("sender_id") or data.get("senderId") or widget.get("default_sender_id") or "VireSend")
    message = clean_string(data.get("message", ""))[:1000]
    abuse_error = abuse_check_message(message, widget.get("user_id"), "widget")
    if abuse_error:
        return abuse_error
    response, status = send_sms_flow(owner, recipients, sender_id, message, "widget", wallet_category="widget_sms", description_prefix=f"Widget SMS from {widget.get('name')}")
    log = response.get("log") or {}
    success = bool(response.get("success"))
    cost = to_float((response.get("preview") or {}).get("total_cost"))
    if success:
        sms_logs().update_one({"sms_id": log.get("sms_id")}, {"$set": {"source": "embed_widget", "widget_id": widget_id, "widget_name": widget.get("name", "")}})
        widgets_collection().update_one({"_id": widget["_id"]}, {"$inc": {"total_sends": 1, "total_sms_sends": 1, "total_cost": cost}, "$set": {"last_used_at": now_utc(), "updated_at": now_utc()}})
    widget_log = log_widget_attempt(
        widget, "send_sms", "success" if success else "failed", response.get("message", ""),
        cost if success else 0, recipients[0] if len(recipients) == 1 else f"{len(recipients)} recipients",
        len(recipients), message, log.get("sms_id", ""), "", log.get("wallet_before"), log.get("wallet_after"),
    )
    notify_widget_owner(widget, "Widget SMS sent" if success else "Widget SMS failed", response.get("message", ""), "success" if success else "error", {"widget_log_id": widget_log.get("log_id")})
    deliver_webhook(widget, {"event": "widget.sms.sent" if success else "widget.send.failed", "recipient": widget_log.get("recipient"), "status": "success" if success else "failed", "cost": cost if success else 0, "reference": log.get("sms_id", "")})
    return jsonify({**response, "widget_log": safe_widget_log(widget_log), "redirect_url": widget.get("success_redirect_url", "")}), status


@public_embed_widgets_bp.post("/<widget_id>/send-email")
def public_send_email(widget_id):
    locked = check_service_available("embed_widgets")
    if locked:
        return locked
    data = request.get_json(silent=True) or {}
    widget, error = validate_public_widget(widget_id, data.get("token"))
    if error:
        return error
    if widget.get("type") not in {"email", "combined"}:
        return {"success": False, "message": "This widget does not allow email sending."}, 400
    ok, captcha_error = captcha_ok(widget, data)
    if not ok:
        log_widget_attempt(widget, "blocked", "blocked", captcha_error, 0)
        return {"success": False, "message": captcha_error}, 403
    owner = users().find_one({"_id": widget.get("user_id")})
    restriction = abuse_check_user_allowed(owner or {}, "widget")
    if restriction:
        return restriction
    account = owner_default_email_account(widget)
    if not account:
        log_widget_attempt(widget, "send_email", "failed", "No connected email account.", 0)
        return {"success": False, "message": "No connected email account is available for this widget."}, 400

    records, summary = build_email_recipients(owner["_id"], {
        "recipients": data.get("recipients") or data.get("email") or data.get("to_email") or data.get("toEmail") or "",
    })
    subject = clean_string(data.get("subject", ""))[:180]
    message = str(data.get("message") or data.get("body") or "")[:10000]
    abuse_error = abuse_check_message(f"{subject}\n{message}", widget.get("user_id"), "widget")
    if abuse_error:
        return abuse_error
    fmt = "html" if data.get("format") == "html" or data.get("htmlMode") else "plain"
    if not subject or not message:
        return {"success": False, "message": "Subject and message are required."}, 400
    preview = email_cost(len(records) or 1, get_email_settings())
    response, status = send_email_flow(
        owner, account, records, subject, message, fmt, "widget",
        wallet_category="widget_email",
        description_prefix=f"Widget email from {widget.get('name')}",
    )
    logs = response.get("logs") or []
    success = bool(response.get("success"))
    cost = to_float((response.get("preview") or {}).get("total_cost"))
    if success:
        email_logs().update_many({"email_id": {"$in": [item.get("email_id") for item in logs]}}, {"$set": {"source": "embed_widget", "widget_id": widget_id, "widget_name": widget.get("name", "")}})
        widgets_collection().update_one({"_id": widget["_id"]}, {"$inc": {"total_sends": len(logs) or 1, "total_email_sends": len(logs) or 1, "total_cost": cost}, "$set": {"last_used_at": now_utc(), "updated_at": now_utc()}})
    recipient_label = records[0].get("email", "") if len(records) == 1 else f"{len(records)} recipients"
    first_log = logs[0] if logs else response.get("log") or {}
    widget_log = log_widget_attempt(
        widget, "send_email", "success" if success else "failed", response.get("message", ""),
        cost if success else 0, recipient_label, len(records), message,
        "", first_log.get("email_id", ""), first_log.get("wallet_before"), first_log.get("wallet_after"),
    )
    notify_widget_owner(widget, "Widget email sent" if success else "Widget email failed", response.get("message", ""), "success" if success else "error", {"widget_log_id": widget_log.get("log_id")})
    deliver_webhook(widget, {"event": "widget.email.sent" if success else "widget.send.failed", "recipient": recipient_label, "status": "success" if success else "failed", "cost": cost if success else 0, "reference": first_log.get("email_id", "")})
    return jsonify({**response, "widget_log": safe_widget_log(widget_log), "recipient_summary": summary, "redirect_url": widget.get("success_redirect_url", "")}), status


@public_embed_widgets_bp.post("/<widget_id>/send-combined")
def public_send_combined(widget_id):
    data = request.get_json(silent=True) or {}
    channel = clean_string(data.get("channel", "")).lower()
    if channel == "email":
        return public_send_email(widget_id)
    return public_send_sms(widget_id)


@admin_embed_widgets_bp.get("")
@require_admin
def admin_widgets(payload):
    widgets = [safe_widget(item, admin=True) for item in widgets_collection().find({}).sort("created_at", -1).limit(500)]
    return jsonify({"success": True, "widgets": widgets})


@admin_embed_widgets_bp.get("/logs")
@require_admin
def admin_widget_logs(payload):
    logs = [safe_widget_log(item) for item in widget_logs_collection().find({}).sort("created_at", -1).limit(500)]
    return jsonify({"success": True, "logs": logs})


@admin_embed_widgets_bp.get("/stats")
@require_admin
def admin_widget_stats(payload):
    items = list(widgets_collection().find({}))
    start = now_utc().replace(hour=0, minute=0, second=0, microsecond=0)
    sent_today = widget_logs_collection().count_documents({"status": "success", "created_at": {"$gte": start}})
    failed_today = widget_logs_collection().count_documents({"status": {"$in": ["failed", "blocked"]}, "created_at": {"$gte": start}})
    return jsonify({"success": True, "stats": {
        "total": len(items),
        "active": sum(1 for item in items if item.get("status") == "active"),
        "sends_today": sent_today,
        "failed_today": failed_today,
        "abuse_alerts": widget_logs_collection().count_documents({"status": "blocked", "created_at": {"$gte": start}}),
        "revenue": round(sum(to_float(item.get("total_cost")) for item in items), 4),
    }})


@admin_embed_widgets_bp.post("/<widget_id>/enable")
@require_admin
def admin_enable(payload, widget_id):
    return admin_set_status(widget_id, "active")


@admin_embed_widgets_bp.post("/<widget_id>/disable")
@require_admin
def admin_disable(payload, widget_id):
    return admin_set_status(widget_id, "disabled")


def admin_set_status(widget_id, status):
    widget = widgets_collection().find_one_and_update(
        {"widget_id": widget_id},
        {"$set": {"status": status, "updated_at": now_utc()}},
        return_document=ReturnDocument.AFTER,
    )
    if not widget:
        return {"success": False, "message": "Widget not found."}, 404
    return jsonify({"success": True, "widget": safe_widget(widget, admin=True)})
