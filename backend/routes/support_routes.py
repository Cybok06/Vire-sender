import secrets

from bson import ObjectId
from flask import Blueprint, current_app, jsonify, request

from utils.auth import require_admin, require_auth, users_collection
from utils.notifications import create_notification
from utils.security import clean_string, now_utc
from utils.service_control import check_service_available

support_bp = Blueprint("support", __name__, url_prefix="/api/support")
admin_complaints_bp = Blueprint("admin_complaints", __name__, url_prefix="/api/admin/complaints")

STATUSES = {"open", "in_review", "waiting_user", "resolved", "closed"}
PRIORITIES = {"low", "medium", "high"}
TYPES = {"otp", "sms", "email", "wallet", "api", "account", "other"}


def tickets_collection():
    return current_app.config["DB"].complaints


def iso(value):
    return value.isoformat() if value else None


def display_date(value):
    return value.strftime("%Y-%m-%d %H:%M") if value else ""


def get_user(payload):
    try:
        return users_collection().find_one({"_id": ObjectId(payload.get("user_id") or payload.get("sub"))})
    except Exception:
        return None


def create_ticket_id():
    return f"TKT-{now_utc().strftime('%Y%m%d')}-{secrets.token_hex(3).upper()}"


def clean_ticket(ticket):
    return {
        "id": ticket.get("ticket_id"),
        "mongo_id": str(ticket.get("_id")),
        "userId": str(ticket.get("user_id")) if ticket.get("user_id") else "",
        "userName": ticket.get("user_name", ""),
        "userEmail": ticket.get("user_email", ""),
        "type": ticket.get("type", "other"),
        "subject": ticket.get("subject", ""),
        "description": ticket.get("description", ""),
        "relatedId": ticket.get("related_id") or "",
        "priority": ticket.get("priority", "medium"),
        "status": ticket.get("status", "open"),
        "assignedAdmin": ticket.get("assigned_admin") or "",
        "messages": [
            {
                "id": item.get("id"),
                "senderType": item.get("sender_type"),
                "senderName": item.get("sender_name"),
                "message": item.get("message"),
                "createdAt": display_date(item.get("created_at")),
            }
            for item in ticket.get("messages", [])
        ],
        "internalNotes": [
            {
                "id": item.get("id"),
                "adminName": item.get("admin_name"),
                "note": item.get("note"),
                "createdAt": display_date(item.get("created_at")),
            }
            for item in ticket.get("internal_notes", [])
        ],
        "createdAt": display_date(ticket.get("created_at")),
        "updatedAt": display_date(ticket.get("updated_at")),
        "resolvedAt": display_date(ticket.get("resolved_at")) if ticket.get("resolved_at") else None,
        "closedAt": display_date(ticket.get("closed_at")) if ticket.get("closed_at") else None,
        "unreadForAdmin": bool(ticket.get("unread_for_admin", False)),
        "unreadForUser": bool(ticket.get("unread_for_user", False)),
    }


def ticket_query_for_user(payload):
    user = get_user(payload)
    if not user:
        return None, ({"success": False, "message": "User account not found."}, 404)
    return user, None


def get_ticket_or_error(ticket_id, payload=None, admin=False):
    query = {"ticket_id": clean_string(ticket_id)}
    if not admin:
        user = get_user(payload)
        if not user:
            return None, ({"success": False, "message": "User account not found."}, 404)
        query["user_id"] = user["_id"]
    ticket = tickets_collection().find_one(query)
    if not ticket:
        return None, ({"success": False, "message": "Ticket not found."}, 404)
    return ticket, None


def set_status_fields(status):
    now = now_utc()
    update = {"status": status, "updated_at": now}
    if status == "resolved":
        update["resolved_at"] = now
    if status == "closed":
        update["closed_at"] = now
    if status in {"open", "in_review"}:
        update["closed_at"] = None
    return update


@support_bp.get("/tickets")
@require_auth
def user_tickets(payload):
    user, error = ticket_query_for_user(payload)
    if error:
        return error
    tickets = tickets_collection().find({"user_id": user["_id"]}).sort("updated_at", -1).limit(200)
    return jsonify({"success": True, "tickets": [clean_ticket(ticket) for ticket in tickets]})


@support_bp.post("/tickets")
@require_auth
def create_ticket(payload):
    locked = check_service_available("complaints_support")
    if locked:
        return locked
    user, error = ticket_query_for_user(payload)
    if error:
        return error
    data = request.get_json(silent=True) or {}
    ticket_type = clean_string(data.get("type", "other"))
    priority = clean_string(data.get("priority", "medium"))
    subject = clean_string(data.get("subject", ""))
    description = clean_string(data.get("description", ""))
    related_id = clean_string(data.get("related_id") or data.get("relatedId") or "")
    if ticket_type not in TYPES:
        ticket_type = "other"
    if priority not in PRIORITIES:
        priority = "medium"
    if not subject:
        return {"success": False, "message": "Subject is required."}, 400
    if not description:
        return {"success": False, "message": "Description is required."}, 400
    now = now_utc()
    ticket = {
        "ticket_id": create_ticket_id(),
        "user_id": user["_id"],
        "user_name": user.get("full_name") or user.get("name") or user.get("email", "User"),
        "user_email": user.get("email", ""),
        "type": ticket_type,
        "subject": subject[:180],
        "description": description[:5000],
        "related_id": related_id[:120],
        "priority": priority,
        "status": "open",
        "assigned_admin": "",
        "messages": [{
            "id": f"msg_{secrets.token_hex(6)}",
            "sender_type": "user",
            "sender_name": user.get("full_name") or user.get("name") or "User",
            "message": description[:5000],
            "created_at": now,
        }],
        "internal_notes": [],
        "unread_for_admin": True,
        "unread_for_user": False,
        "created_at": now,
        "updated_at": now,
    }
    result = tickets_collection().insert_one(ticket)
    ticket["_id"] = result.inserted_id
    return jsonify({"success": True, "message": "Support ticket submitted.", "ticket": clean_ticket(ticket)})


@support_bp.get("/tickets/<ticket_id>")
@require_auth
def user_ticket_detail(payload, ticket_id):
    ticket, error = get_ticket_or_error(ticket_id, payload=payload)
    if error:
        return error
    tickets_collection().update_one({"_id": ticket["_id"]}, {"$set": {"unread_for_user": False}})
    ticket["unread_for_user"] = False
    return jsonify({"success": True, "ticket": clean_ticket(ticket)})


@support_bp.post("/tickets/<ticket_id>/messages")
@require_auth
def user_add_message(payload, ticket_id):
    locked = check_service_available("complaints_support")
    if locked:
        return locked
    ticket, error = get_ticket_or_error(ticket_id, payload=payload)
    if error:
        return error
    if ticket.get("status") == "closed":
        return {"success": False, "message": "This ticket is closed."}, 400
    user = get_user(payload)
    data = request.get_json(silent=True) or {}
    message = clean_string(data.get("message", ""))
    if not message:
        return {"success": False, "message": "Message is required."}, 400
    now = now_utc()
    item = {
        "id": f"msg_{secrets.token_hex(6)}",
        "sender_type": "user",
        "sender_name": user.get("full_name") or user.get("name") or "User",
        "message": message[:5000],
        "created_at": now,
    }
    update = {"updated_at": now, "unread_for_admin": True}
    if ticket.get("status") in {"resolved", "waiting_user"}:
        update["status"] = "open"
    tickets_collection().update_one({"_id": ticket["_id"]}, {"$push": {"messages": item}, "$set": update})
    ticket = tickets_collection().find_one({"_id": ticket["_id"]})
    return jsonify({"success": True, "message": "Reply sent.", "ticket": clean_ticket(ticket)})


@support_bp.patch("/tickets/<ticket_id>/status")
@require_auth
def user_update_status(payload, ticket_id):
    ticket, error = get_ticket_or_error(ticket_id, payload=payload)
    if error:
        return error
    data = request.get_json(silent=True) or {}
    status = clean_string(data.get("status", ""))
    if status not in {"open", "closed"}:
        return {"success": False, "message": "Users can only reopen or close tickets."}, 400
    update = set_status_fields(status)
    update["unread_for_admin"] = status == "open"
    tickets_collection().update_one({"_id": ticket["_id"]}, {"$set": update})
    ticket = tickets_collection().find_one({"_id": ticket["_id"]})
    return jsonify({"success": True, "message": "Ticket status updated.", "ticket": clean_ticket(ticket)})


@admin_complaints_bp.get("/")
@require_admin
def admin_list_tickets(payload):
    tickets = list(tickets_collection().find({}).sort("updated_at", -1).limit(500))
    return jsonify({"success": True, "tickets": [clean_ticket(ticket) for ticket in tickets], "stats": admin_stats_payload(tickets)})


def admin_stats_payload(tickets):
    today = now_utc().strftime("%Y-%m-%d")
    return {
        "total": len(tickets),
        "open": sum(1 for ticket in tickets if ticket.get("status") == "open"),
        "in_review": sum(1 for ticket in tickets if ticket.get("status") == "in_review"),
        "waiting_user": sum(1 for ticket in tickets if ticket.get("status") == "waiting_user"),
        "resolved_today": sum(1 for ticket in tickets if ticket.get("resolved_at") and ticket.get("resolved_at").strftime("%Y-%m-%d") == today),
        "high_priority": sum(1 for ticket in tickets if ticket.get("priority") == "high" and ticket.get("status") not in {"resolved", "closed"}),
        "unread": sum(1 for ticket in tickets if ticket.get("unread_for_admin") and ticket.get("status") not in {"resolved", "closed"}),
    }


@admin_complaints_bp.get("/stats")
@require_admin
def admin_ticket_stats(payload):
    tickets = list(tickets_collection().find({}))
    return jsonify({"success": True, "stats": admin_stats_payload(tickets)})


@admin_complaints_bp.get("/<ticket_id>")
@require_admin
def admin_ticket_detail(payload, ticket_id):
    ticket, error = get_ticket_or_error(ticket_id, admin=True)
    if error:
        return error
    tickets_collection().update_one({"_id": ticket["_id"]}, {"$set": {"unread_for_admin": False}})
    ticket["unread_for_admin"] = False
    return jsonify({"success": True, "ticket": clean_ticket(ticket)})


@admin_complaints_bp.post("/<ticket_id>/messages")
@require_admin
def admin_add_message(payload, ticket_id):
    ticket, error = get_ticket_or_error(ticket_id, admin=True)
    if error:
        return error
    if ticket.get("status") == "closed":
        return {"success": False, "message": "This ticket is closed."}, 400
    data = request.get_json(silent=True) or {}
    message = clean_string(data.get("message", ""))
    sender_name = clean_string(data.get("sender_name", "")) or "Support Team"
    if not message:
        return {"success": False, "message": "Message is required."}, 400
    now = now_utc()
    item = {
        "id": f"msg_{secrets.token_hex(6)}",
        "sender_type": "admin",
        "sender_name": sender_name[:80],
        "message": message[:5000],
        "created_at": now,
    }
    update = {"updated_at": now, "unread_for_user": True, "unread_for_admin": False}
    if ticket.get("status") == "open":
        update["status"] = "in_review"
    tickets_collection().update_one({"_id": ticket["_id"]}, {"$push": {"messages": item}, "$set": update})
    create_notification(
        ticket.get("user_id"), "support", "Support reply received",
        f"Admin replied to your ticket {ticket.get('ticket_id', '')}.",
        "info", "support", ticket.get("ticket_id", ""), f"/user/support/{ticket.get('ticket_id', '')}",
        {"ticket_id": ticket.get("ticket_id", "")},
    )
    ticket = tickets_collection().find_one({"_id": ticket["_id"]})
    return jsonify({"success": True, "message": "Reply sent.", "ticket": clean_ticket(ticket)})


@admin_complaints_bp.post("/<ticket_id>/notes")
@require_admin
def admin_add_note(payload, ticket_id):
    ticket, error = get_ticket_or_error(ticket_id, admin=True)
    if error:
        return error
    data = request.get_json(silent=True) or {}
    note = clean_string(data.get("note", ""))
    admin_name = clean_string(data.get("admin_name", "")) or "Support Admin"
    if not note:
        return {"success": False, "message": "Note is required."}, 400
    now = now_utc()
    item = {
        "id": f"note_{secrets.token_hex(6)}",
        "admin_name": admin_name[:80],
        "note": note[:3000],
        "created_at": now,
    }
    tickets_collection().update_one({"_id": ticket["_id"]}, {"$push": {"internal_notes": item}, "$set": {"updated_at": now}})
    ticket = tickets_collection().find_one({"_id": ticket["_id"]})
    return jsonify({"success": True, "message": "Internal note added.", "ticket": clean_ticket(ticket)})


@admin_complaints_bp.patch("/<ticket_id>/status")
@require_admin
def admin_update_status(payload, ticket_id):
    ticket, error = get_ticket_or_error(ticket_id, admin=True)
    if error:
        return error
    data = request.get_json(silent=True) or {}
    status = clean_string(data.get("status", ""))
    if status not in STATUSES:
        return {"success": False, "message": "Invalid ticket status."}, 400
    update = set_status_fields(status)
    update["unread_for_admin"] = False
    if status in {"resolved", "waiting_user"}:
        update["unread_for_user"] = True
    tickets_collection().update_one({"_id": ticket["_id"]}, {"$set": update})
    ticket = tickets_collection().find_one({"_id": ticket["_id"]})
    return jsonify({"success": True, "message": "Ticket status updated.", "ticket": clean_ticket(ticket)})


@admin_complaints_bp.patch("/<ticket_id>/assign")
@require_admin
def admin_assign_ticket(payload, ticket_id):
    ticket, error = get_ticket_or_error(ticket_id, admin=True)
    if error:
        return error
    data = request.get_json(silent=True) or {}
    admin_name = clean_string(data.get("admin_name", ""))
    if not admin_name:
        return {"success": False, "message": "Admin name is required."}, 400
    update = {"assigned_admin": admin_name[:80], "updated_at": now_utc(), "unread_for_admin": False}
    if ticket.get("status") == "open":
        update["status"] = "in_review"
    tickets_collection().update_one({"_id": ticket["_id"]}, {"$set": update})
    ticket = tickets_collection().find_one({"_id": ticket["_id"]})
    return jsonify({"success": True, "message": "Ticket assigned.", "ticket": clean_ticket(ticket)})
