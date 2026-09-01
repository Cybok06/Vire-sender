import json
import logging
import re
from datetime import timedelta

from bson import ObjectId
from flask import Blueprint, current_app, jsonify, request
from pymongo import ReturnDocument

from config import Config
from services.ai_assistant_service import (
    CLEAR_SEND_RE,
    append_message,
    assistant_enabled,
    assistant_rate_limited,
    confirm_draft,
    classify_content_request,
    classify_conversation_intent,
    conversational_reply,
    conversations_collection,
    create_conversation,
    create_draft,
    create_or_refine_content_draft,
    default_workflow_context,
    drafts_collection,
    list_user_group_counts,
    list_recent_campaigns_for_status,
    messages_collection,
    normalize_assistant_mode,
    parse_intent,
    prepare_draft,
    resolve_contact_group,
    safe_conversation,
    safe_content_draft,
    safe_draft,
    safe_message,
    log_ai_stage,
    interpret_workflow_message,
    safe_workflow_context,
    update_workflow_context,
)
from services.deepseek_service import chat_json, parse_json_content, DeepSeekServiceError
from utils.auth import require_auth, users_collection
from utils.security import clean_string, now_utc


ai_bp = Blueprint("ai", __name__, url_prefix="/api/ai")
logger = logging.getLogger("viresend.ai.routes")


def chat_response(*, conversation, user_message=None, assistant_message=None, draft=None, success=True, error=None, status=200):
    safe_assistant = safe_message(assistant_message) if assistant_message else None
    structured = safe_assistant.get("structured_data", {}) if safe_assistant else {}
    return jsonify({
        "success": success,
        "conversation_id": conversation.get("conversation_id") if conversation else None,
        "conversation": safe_conversation(conversation) if conversation else None,
        "conversation_state": safe_workflow_context(conversation) if conversation else None,
        "user_message": safe_message(user_message) if user_message else None,
        "assistant_message": safe_assistant,
        "ui_blocks": [{"type": structured.get("kind"), "data": structured}] if structured.get("kind") else [],
        "pending_action": safe_draft(draft) if draft else None,
        "draft": safe_draft(draft) if draft else None,
        "error": error,
    }), status


@ai_bp.errorhandler(Exception)
def handle_ai_exception(exc):
    logger.exception("Unhandled VireSend AI route error path=%s", request.path)
    return jsonify({
        "success": False,
        "conversation_id": None,
        "assistant_message": {"role": "assistant", "content": "I understood your request, but an internal service failed while preparing it.", "message_type": "error"},
        "ui_blocks": [],
        "pending_action": None,
        "error": {"code": "AI_WORKFLOW_ERROR", "retryable": True},
        "message": "I understood your request, but an internal service failed while preparing it.",
    }), 500

SUPPORTED_ACTIONS = {
    "fix_grammar",
    "rewrite",
    "professional",
    "friendly",
    "shorten",
    "expand",
    "marketing",
    "formal",
    "translate",
    "generate_subject",
    "custom",
}
ACTION_LABELS = {
    "fix_grammar": "Fix grammar and clarity",
    "rewrite": "Rewrite the email",
    "professional": "Make it more professional",
    "friendly": "Make it friendlier",
    "shorten": "Make it shorter",
    "expand": "Make it longer with useful detail",
    "marketing": "Rewrite in a marketing email style",
    "formal": "Make it more formal",
    "translate": "Translate the email",
    "generate_subject": "Generate a better subject line",
    "custom": "Follow the user's custom instruction",
}
PLACEHOLDER_RE = re.compile(r"\{\{\s*[a-zA-Z][a-zA-Z0-9_]*\s*\}\}")
MAX_SUBJECT_LENGTH = 300
MAX_MESSAGE_LENGTH = 10000
RATE_LIMIT_PER_MINUTE = 8
RATE_LIMIT_PER_DAY = 120


def ai_usage_logs():
    return current_app.config["DB"].ai_usage_logs


def get_current_user(payload):
    user_id = payload.get("user_id") or payload.get("sub")
    try:
        object_id = ObjectId(user_id)
    except Exception:
        return None
    return users_collection().find_one({"_id": object_id})


def estimate_tokens(value: str) -> int:
    return max(1, round(len(value or "") / 4))


def estimate_cost(input_tokens: int, output_tokens: int) -> float:
    # Conservative placeholder estimate for DeepSeek chat usage; exact billing can be
    # swapped in later from provider usage metadata or an admin pricing table.
    return round((input_tokens * 0.00000014) + (output_tokens * 0.00000028), 6)


def extract_placeholders(*values: str) -> set[str]:
    placeholders = set()
    for value in values:
        placeholders.update(match.group(0) for match in PLACEHOLDER_RE.finditer(value or ""))
    return placeholders


def normalize_placeholders(value: str) -> str:
    def clean(match):
        inner = re.sub(r"\s+", "", match.group(0)[2:-2])
        return "{{" + inner + "}}"
    return PLACEHOLDER_RE.sub(clean, value or "")


def rate_limit_error(user_id: ObjectId):
    now = now_utc()
    minute_count = ai_usage_logs().count_documents({
        "user_id": user_id,
        "provider": "deepseek",
        "created_at": {"$gte": now - timedelta(minutes=1)},
    })
    if minute_count >= RATE_LIMIT_PER_MINUTE:
        return {"success": False, "message": "AI Assist is busy. Please wait a minute and try again."}, 429

    day_count = ai_usage_logs().count_documents({
        "user_id": user_id,
        "provider": "deepseek",
        "created_at": {"$gte": now - timedelta(days=1)},
    })
    if day_count >= RATE_LIMIT_PER_DAY:
        return {"success": False, "message": "Daily AI Assist limit reached. Please try again tomorrow."}, 429
    return None


def start_usage_log(user_id: ObjectId, action: str, source: str, model: str, subject: str, message: str):
    input_text = f"{subject}\n{message}"
    input_tokens = estimate_tokens(input_text)
    result = ai_usage_logs().insert_one({
        "user_id": user_id,
        "provider": "deepseek",
        "model": model,
        "action": action,
        "source": source,
        "input_length": len(input_text),
        "output_length": 0,
        "input_tokens": input_tokens,
        "output_tokens": 0,
        "estimated_cost": estimate_cost(input_tokens, 0),
        "created_at": now_utc(),
    })
    return result.inserted_id


def complete_usage_log(log_id: ObjectId, output_subject: str, output_message: str):
    output_text = f"{output_subject}\n{output_message}"
    output_tokens = estimate_tokens(output_text) if output_text.strip() else 0
    log = ai_usage_logs().find_one({"_id": log_id}) or {}
    input_tokens = int(log.get("input_tokens", 0) or 0)
    ai_usage_logs().update_one(
        {"_id": log_id},
        {"$set": {
            "output_length": len(output_text),
            "output_tokens": output_tokens,
            "estimated_cost": estimate_cost(input_tokens, output_tokens),
        }},
    )


def build_user_prompt(action: str, subject: str, message: str, custom_instruction: str, target_language: str) -> str:
    instruction = ACTION_LABELS[action]
    if action == "translate":
        instruction = f"Translate the email to {target_language}."
    if action == "custom":
        instruction = custom_instruction

    return "\n".join([
        f"Action: {action}",
        f"Instruction: {instruction}",
        f"Subject: {subject}",
        "Message:",
        message,
        "",
        "Return JSON with exactly these keys: subject, message.",
        "If generating only a subject, keep the message value unchanged.",
    ])


@ai_bp.post("/deepseek-email-assist")
@require_auth
def deepseek_email_assist(payload):
    if not Config.AI_ENABLED:
        return {"success": False, "message": "AI Assist is currently disabled."}, 403
    if not Config.DEEPSEEK_API_KEY:
        return {"success": False, "message": "AI Assist is not configured yet."}, 503

    user = get_current_user(payload)
    if not user:
        return {"success": False, "message": "User account not found."}, 404
    if user.get("account_status") != "active":
        return {"success": False, "message": "Your account is not active."}, 403

    limited = rate_limit_error(user["_id"])
    if limited:
        return limited

    data = request.get_json(silent=True) or {}
    action = clean_string(data.get("action", "fix_grammar"))
    subject = str(data.get("subject", ""))[:MAX_SUBJECT_LENGTH]
    message = str(data.get("message", ""))[:MAX_MESSAGE_LENGTH]
    custom_instruction = clean_string(data.get("custom_instruction", ""))[:1000]
    target_language = clean_string(data.get("target_language", ""))[:80]
    source = clean_string(data.get("source", "copy_paste_mode"))[:80] or "copy_paste_mode"

    if action not in SUPPORTED_ACTIONS:
        return {"success": False, "message": "Unsupported AI action."}, 400
    if not message.strip():
        return {"success": False, "message": "Write a message before using AI Assist."}, 400
    if action == "translate" and not target_language:
        return {"success": False, "message": "Target language is required for translation."}, 400
    if action == "custom" and not custom_instruction:
        return {"success": False, "message": "Custom instruction is required."}, 400

    original_placeholders = extract_placeholders(subject, message)
    system_prompt = (
        "You are VireSend's email writing assistant. "
        "Improve the user's email based on the selected action. "
        "Preserve all placeholders exactly, including {{name}}, {{email}}, and any {{custom_field}}. "
        "Do not remove, rename, translate, or modify placeholders. "
        "Do not add explanations. "
        "Return only valid JSON: {\"subject\":\"...\",\"message\":\"...\"}."
    )
    user_prompt = build_user_prompt(action, subject, message, custom_instruction, target_language)

    model = Config.DEEPSEEK_MODEL or "deepseek-chat"
    usage_log_id = start_usage_log(user["_id"], action, source, model, subject, message)

    try:
        parsed = chat_json(
            [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            temperature=0.4,
            max_tokens=1600,
            model=model,
        )
    except DeepSeekServiceError as exc:
        return {"success": False, "message": exc.message}, exc.status_code

    output_subject = normalize_placeholders(str(parsed.get("subject", subject)))[:MAX_SUBJECT_LENGTH]
    output_message = normalize_placeholders(str(parsed.get("message", message)))[:MAX_MESSAGE_LENGTH]
    if action == "generate_subject":
        output_message = message

    output_placeholders = extract_placeholders(output_subject, output_message)
    missing = sorted(original_placeholders - output_placeholders)
    if missing:
        return {"success": False, "message": f"AI response changed placeholders: {', '.join(missing)}. Please regenerate."}, 502

    complete_usage_log(usage_log_id, output_subject, output_message)

    return jsonify({
        "success": True,
        "subject": output_subject,
        "message": output_message,
    })


def ai_conversations():
    return conversations_collection(current_app.config["DB"])


def ai_messages():
    return messages_collection(current_app.config["DB"])


def ai_drafts():
    return drafts_collection(current_app.config["DB"])


@ai_bp.get("/assistant/status")
@require_auth
def assistant_status(payload):
    if not assistant_enabled():
        return jsonify({"success": True, "enabled": False})
    user = get_current_user(payload)
    if not user or user.get("account_status") != "active":
        return {"success": False, "message": "User account not found."}, 404
    return jsonify({"success": True, "enabled": True})


@ai_bp.get("/conversations")
@require_auth
def list_conversations(payload):
    if not assistant_enabled():
        return {"success": False, "message": "VireSend AI is currently disabled."}, 403
    user = get_current_user(payload)
    if not user or user.get("account_status") != "active":
        return {"success": False, "message": "User account not found."}, 404
    rows = ai_conversations().find({"user_id": user["_id"]}).sort("updated_at", -1).limit(25)
    return jsonify({"success": True, "conversations": [safe_conversation(row) for row in rows]})


@ai_bp.post("/conversations")
@require_auth
def create_ai_conversation(payload):
    if not assistant_enabled():
        return {"success": False, "message": "VireSend AI is currently disabled."}, 403
    user = get_current_user(payload)
    if not user or user.get("account_status") != "active":
        return {"success": False, "message": "User account not found."}, 404
    data = request.get_json(silent=True) or {}
    conversation, welcome = create_conversation(
        current_app.config["DB"], user["_id"],
        clean_string(data.get("title", "New Conversation"))[:120] or "New Conversation",
        normalize_assistant_mode(data.get("selected_mode")),
    )
    return jsonify({"success": True, "conversation": safe_conversation(conversation), "conversation_state": safe_workflow_context(conversation), "welcome_message": safe_message(welcome)})


@ai_bp.get("/conversations/<conversation_id>")
@require_auth
def get_ai_conversation(payload, conversation_id):
    if not assistant_enabled():
        return {"success": False, "message": "VireSend AI is currently disabled."}, 403
    user = get_current_user(payload)
    if not user or user.get("account_status") != "active":
        return {"success": False, "message": "User account not found."}, 404
    conversation = ai_conversations().find_one({"conversation_id": clean_string(conversation_id), "user_id": user["_id"]})
    if not conversation:
        return {"success": False, "message": "Conversation not found."}, 404
    rows = ai_messages().find({"conversation_id": conversation["conversation_id"], "user_id": user["_id"]}).sort("created_at", 1)
    return jsonify({"success": True, "conversation": safe_conversation(conversation), "conversation_state": safe_workflow_context(conversation), "messages": [safe_message(row) for row in rows]})


@ai_bp.post("/conversations/<conversation_id>/messages")
@require_auth
def post_ai_message(payload, conversation_id):
    if not assistant_enabled():
        return {"success": False, "message": "VireSend AI is currently disabled."}, 403
    user = get_current_user(payload)
    if not user or user.get("account_status") != "active":
        return {"success": False, "message": "User account not found."}, 404
    conversation = ai_conversations().find_one({"conversation_id": clean_string(conversation_id), "user_id": user["_id"]})
    if not conversation:
        return {"success": False, "message": "Conversation not found."}, 404
    limited = assistant_rate_limited(current_app.config["DB"], user["_id"])
    if limited:
        return limited
    data = request.get_json(silent=True) or {}
    existing_context = default_workflow_context(conversation)
    requested_mode = normalize_assistant_mode(data.get("selected_mode")) if "selected_mode" in data else existing_context.get("selected_mode")
    if requested_mode != existing_context.get("selected_mode"):
        now = now_utc()
        reset_context = {
            "selected_mode": requested_mode, "state": "idle", "active_draft_id": None,
            "pending_action_id": None, "channel": None, "recipient_type": None,
            "recipient_emails": [], "recipient_phones": [], "contact_group_name": None,
            "subject": None, "sender": None, "last_question_type": None,
            "last_question_message_id": None, "updated_at": now,
        }
        ai_conversations().update_one(
            {"conversation_id": conversation["conversation_id"], "user_id": user["_id"]},
            {"$set": {"workflow_context": reset_context, "updated_at": now}},
        )
        conversation = ai_conversations().find_one({"conversation_id": conversation["conversation_id"], "user_id": user["_id"]})
    message_text = clean_string(data.get("message", ""))[:2000]
    client_message_id = clean_string(data.get("client_message_id", ""))[:120]
    if not message_text:
        return {"success": False, "message": "Write a message first."}, 400
    if client_message_id and ai_messages().find_one({"conversation_id": conversation["conversation_id"], "user_id": user["_id"], "role": "user", "structured_data.client_message_id": client_message_id}):
        return {"success": False, "message": "This message was already submitted.", "error": {"code": "DUPLICATE_MESSAGE", "retryable": False}}, 409

    log_ai_stage("request_received", user_id=user["_id"], conversation_id=conversation["conversation_id"], client_message_id=client_message_id or None, message_length=len(message_text), state_before=default_workflow_context(conversation).get("state"), active_draft_id=default_workflow_context(conversation).get("active_draft_id"), pending_action_id=default_workflow_context(conversation).get("pending_action_id"))
    log_ai_stage("user_authenticated", user_id=user["_id"], conversation_id=conversation["conversation_id"])
    log_ai_stage("conversation_loaded", user_id=user["_id"], conversation_id=conversation["conversation_id"])
    user_message = append_message(current_app.config["DB"], conversation["conversation_id"], user["_id"], "user", message_text, {"client_message_id": client_message_id} if client_message_id else None)
    conversation_intent = classify_conversation_intent(message_text, conversation)
    intent_status = {
        "content_generation": "drafting", "draft_message": "drafting",
        "content_editing": "editing", "update_draft": "editing",
        "send_message": "preparing_delivery", "change_channel": "preparing_delivery",
        "confirm_send": "awaiting_confirmation", "cancel_send": "cancelled",
    }.get(conversation_intent, "chatting")
    action_intent = conversation_intent in {"send_message", "confirm_send", "change_channel"}
    update_workflow_context(
        current_app.config["DB"], conversation, user["_id"],
        conversation_mode="action" if action_intent else "chat",
        intent=conversation_intent, status=intent_status,
        requires_action=action_intent, send_requested=action_intent,
        missing_fields=[],
    )
    conversation = ai_conversations().find_one({"conversation_id": conversation["conversation_id"], "user_id": user["_id"]})

    workflow_context = default_workflow_context(conversation)
    if conversation_intent == "new_chat":
        now = now_utc()
        fresh = {
            "selected_mode": "general_assistant", "conversation_mode": "chat",
            "intent": "new_chat", "status": "chatting", "requires_action": False,
            "missing_fields": [], "current_goal": None, "tone": None,
            "language": None, "send_requested": False, "state": "idle",
            "active_draft_id": None, "pending_action_id": None, "channel": None,
            "recipient_type": None, "recipient_emails": [], "recipient_phones": [],
            "contact_group_name": None, "subject": None, "sender": None,
            "last_question_type": None, "last_question_message_id": None, "updated_at": now,
        }
        ai_conversations().update_one(
            {"conversation_id": conversation["conversation_id"], "user_id": user["_id"]},
            {"$set": {"workflow_context": fresh, "current_draft": None, "updated_at": now}},
        )
        assistant = append_message(
            current_app.config["DB"], conversation["conversation_id"], user["_id"], "assistant",
            "Hi! I’m VireSend AI. I can help you write, improve, and send SMS or email campaigns. What would you like to do?",
            {"kind": "welcome"},
        )
        refreshed = ai_conversations().find_one({"conversation_id": conversation["conversation_id"], "user_id": user["_id"]})
        return chat_response(conversation=refreshed, user_message=user_message, assistant_message=assistant)

    if conversation_intent == "contact_lookup":
        groups = list_user_group_counts(current_app.config["DB"], user["_id"])
        if groups:
            names = ", ".join(f"{item['name']} ({item['count']})" for item in groups)
            reply = f"Here are your contact groups: {names}."
        else:
            reply = "You don’t have any contact groups yet. You can create one from Contacts."
        assistant = append_message(
            current_app.config["DB"], conversation["conversation_id"], user["_id"], "assistant",
            reply, {"kind": "contact_groups", "groups": groups},
        )
        return chat_response(conversation=conversation, user_message=user_message, assistant_message=assistant)

    workflow_result = interpret_workflow_message(workflow_context, message_text)
    log_ai_stage("workflow_message_interpreted", user_id=user["_id"], conversation_id=conversation["conversation_id"], state=workflow_context.get("state"), detected_intent=(workflow_result or {}).get("intent"), active_draft_id=workflow_context.get("active_draft_id"), pending_action_id=workflow_context.get("pending_action_id"))

    if workflow_result and workflow_result.get("intent") == "invalid_recipient":
        mode = workflow_context.get("selected_mode")
        question = "What phone number should receive the SMS?" if mode == "direct_sms" else "What email address should receive the email?"
        assistant = append_message(current_app.config["DB"], conversation["conversation_id"], user["_id"], "assistant", question, {"kind": "clarification", "required_field": "recipient"})
        return chat_response(conversation=conversation, user_message=user_message, assistant_message=assistant)

    if workflow_result and workflow_result.get("intent") == "provide_channel" and workflow_context.get("state") == "awaiting_channel":
        channel = workflow_result["entities"]["channel"]
        pending = ai_drafts().find_one_and_update(
            {"draft_id": workflow_context.get("pending_action_id"), "user_id": user["_id"]},
            {"$set": {"channel": channel, "updated_at": now_utc()}}, return_document=ReturnDocument.AFTER,
        )
        updated_context = update_workflow_context(current_app.config["DB"], conversation, user["_id"], state="preparing_preview" if pending else "awaiting_recipient", channel=channel, last_question_type=None)
        if pending:
            current_content = conversation.get("current_draft") if isinstance(conversation.get("current_draft"), dict) else {}
            updates = {"message": pending.get("message") or current_content.get("body"), "subject": pending.get("subject") or current_content.get("subject")}
            if channel == "email" and not updates["subject"]:
                updates["subject"] = f"A Special {str(current_content.get('category') or 'Message').title()}"
            pending = ai_drafts().find_one_and_update({"draft_id": pending["draft_id"], "user_id": user["_id"]}, {"$set": updates}, return_document=ReturnDocument.AFTER)
            has_recipient = bool(pending.get("contact_group_name") or pending.get("contact_group_query") or pending.get("direct_email_addresses") or pending.get("direct_phone_numbers"))
            if has_recipient:
                prepared, _token, preview_message = prepare_draft(current_app.config["DB"], user, pending)
                assistant = append_message(current_app.config["DB"], conversation["conversation_id"], user["_id"], "assistant", preview_message[0], preview_message[1])
                state = "awaiting_confirmation" if prepared.get("status") == "awaiting_confirmation" else "awaiting_sender"
                update_workflow_context(current_app.config["DB"], conversation, user["_id"], state=state, channel=channel, pending_action_id=prepared["draft_id"])
                refreshed = ai_conversations().find_one({"conversation_id": conversation["conversation_id"], "user_id": user["_id"]})
                return chat_response(conversation=refreshed, user_message=user_message, assistant_message=assistant, draft=prepared)
        question = "What email address or contact group should receive it?" if channel == "email" else "What phone number or contact group should receive it?"
        assistant = append_message(current_app.config["DB"], conversation["conversation_id"], user["_id"], "assistant", question, {"kind": "text"})
        update_workflow_context(current_app.config["DB"], conversation, user["_id"], state="awaiting_recipient", channel=channel, last_question_type="recipient")
        refreshed = ai_conversations().find_one({"conversation_id": conversation["conversation_id"], "user_id": user["_id"]})
        return chat_response(conversation=refreshed, user_message=user_message, assistant_message=assistant, draft=pending)

    if workflow_result and workflow_result.get("intent") == "invalid_channel":
        known_recipient = (workflow_context.get("recipient_emails") or workflow_context.get("recipient_phones") or [None])[0]
        suffix = f" for {known_recipient}" if known_recipient else ""
        assistant = append_message(current_app.config["DB"], conversation["conversation_id"], user["_id"], "assistant", f"I’m preparing your current draft{suffix}. Should I use SMS or email?", {"kind": "text"})
        refreshed = ai_conversations().find_one({"conversation_id": conversation["conversation_id"], "user_id": user["_id"]})
        return chat_response(conversation=refreshed, user_message=user_message, assistant_message=assistant)

    normalized_message = message_text.casefold().strip(" .!?")
    if workflow_result and workflow_result.get("intent") == "confirm_send_action":
        normalized_message = "confirm and send"
    elif workflow_result and workflow_result.get("intent") == "cancel_action":
        normalized_message = "cancel"
    if normalized_message in {"confirm", "confirm and send", "proceed", "proceed with sending", "send it now"}:
        pending = ai_drafts().find_one({
            "conversation_id": conversation["conversation_id"],
            "user_id": user["_id"],
            "status": "awaiting_confirmation",
        }, sort=[("updated_at", -1)])
        if pending:
            token_message = ai_messages().find_one({
                "conversation_id": conversation["conversation_id"],
                "user_id": user["_id"],
                "structured_data.draft_id": pending["draft_id"],
                "structured_data.confirmation_token": {"$type": "string"},
            }, sort=[("created_at", -1)])
            token = ((token_message or {}).get("structured_data") or {}).get("confirmation_token")
            if token:
                final_draft, card, status = confirm_draft(current_app.config["DB"], user, pending, token)
                update_workflow_context(current_app.config["DB"], conversation, user["_id"], state="completed" if status < 400 and final_draft.get("status") == "completed" else "failed" if status >= 400 else final_draft.get("status", "processing_send"), pending_action_id=final_draft.get("draft_id"))
                assistant = append_message(current_app.config["DB"], conversation["conversation_id"], user["_id"], "assistant", card.get("message") or card.get("title") or "Campaign update", card)
                refreshed = ai_conversations().find_one({"conversation_id": conversation["conversation_id"], "user_id": user["_id"]})
                return chat_response(conversation=refreshed, user_message=user_message, assistant_message=assistant, draft=final_draft, success=status < 400, error=None if status < 400 else {"code": card.get("error_code", "SEND_FAILED"), "retryable": status >= 500}, status=status)
        assistant = append_message(current_app.config["DB"], conversation["conversation_id"], user["_id"], "assistant", "There isn’t a campaign awaiting confirmation. Prepare the message for sending and review its recipients, sender, and cost first.", {"kind": "text"})
        return chat_response(conversation=conversation, user_message=user_message, assistant_message=assistant)

    if normalized_message in {"cancel", "cancel it", "cancel this", "cancel sending"}:
        pending = ai_drafts().find_one_and_update(
            {"conversation_id": conversation["conversation_id"], "user_id": user["_id"], "status": {"$in": ["draft", "awaiting_clarification", "awaiting_confirmation"]}},
            {"$set": {"status": "cancelled", "updated_at": now_utc()}},
            sort=[("updated_at", -1)], return_document=ReturnDocument.AFTER,
        )
        message = "Draft cancelled." if pending else "There isn’t a pending send action to cancel. Your writing draft is still available."
        assistant = append_message(current_app.config["DB"], conversation["conversation_id"], user["_id"], "assistant", message, {"kind": "text"})
        return chat_response(conversation=conversation, user_message=user_message, assistant_message=assistant, draft=pending)

    content_intent = classify_content_request(message_text, conversation.get("current_draft"))
    if content_intent:
        content_draft = create_or_refine_content_draft(current_app.config["DB"], conversation, user["_id"], message_text, content_intent)
        safe_content = safe_content_draft(content_draft)
        assistant_text = "Here’s a draft you can use. You can refine it, create another version, or prepare it for sending when you’re ready."
        assistant = append_message(
            current_app.config["DB"], conversation["conversation_id"], user["_id"], "assistant", assistant_text,
            {"kind": "message_draft", "draft": safe_content},
        )
        refreshed_conversation = ai_conversations().find_one({"conversation_id": conversation["conversation_id"], "user_id": user["_id"]})
        log_ai_stage("final_response_returned", user_id=user["_id"], conversation_id=conversation["conversation_id"], response_kind="message_draft")
        return chat_response(conversation=refreshed_conversation, user_message=user_message, assistant_message=assistant)

    parsed = parse_intent(current_app.config["DB"], conversation["conversation_id"], message_text, user["_id"])
    current_content = conversation.get("current_draft") if isinstance(conversation.get("current_draft"), dict) else None
    deterministic_entities = (workflow_result or {}).get("entities") or {}
    if deterministic_entities.get("channel"):
        parsed["channel"] = deterministic_entities["channel"]
    if deterministic_entities.get("recipient_emails"):
        parsed["recipient_emails"] = deterministic_entities["recipient_emails"]
        parsed["recipient_type"] = "direct_email_addresses"
        parsed["contact_group_name"] = None
    if deterministic_entities.get("recipient_phones"):
        parsed["phone_numbers"] = deterministic_entities["recipient_phones"]
        parsed["recipient_type"] = "direct_phone_numbers"
        parsed["contact_group_name"] = None
    if deterministic_entities.get("contact_group_name"):
        parsed["contact_group_name"] = deterministic_entities["contact_group_name"]
        parsed["recipient_type"] = "contact_group"
    if current_content and (CLEAR_SEND_RE.search(message_text) or deterministic_entities.get("recipient_emails") or deterministic_entities.get("recipient_phones")):
        parsed["channel"] = parsed.get("channel") or current_content.get("channel")
        parsed["message"] = parsed.get("message") or current_content.get("body")
        parsed["subject"] = parsed.get("subject") or current_content.get("subject")
        parsed["message_goal"] = parsed.get("message_goal") or "Use the current conversation draft."
        if parsed.get("channel") == "sms":
            parsed["intent"] = "send_sms_campaign"
        elif parsed.get("channel") == "email":
            parsed["intent"] = "send_email_campaign"
    parsed["raw_instruction"] = message_text
    log_ai_stage("intent_detected", user_id=user["_id"], conversation_id=conversation["conversation_id"], intent=parsed.get("intent"), channel=parsed.get("channel"), confidence=parsed.get("confidence"))

    if parsed["intent"] == "get_campaign_status":
        recent = list_recent_campaigns_for_status(current_app.config["DB"], user["_id"])
        assistant = append_message(
            current_app.config["DB"],
            conversation["conversation_id"],
            user["_id"],
            "assistant",
            "Here are your most recent campaigns.",
            {"kind": "campaign_status", "campaigns": recent},
        )
        return jsonify({"success": True, "conversation": safe_conversation(conversation), "user_message": safe_message(user_message), "assistant_message": safe_message(assistant)})

    if parsed["intent"] in {"rewrite_message", "fix_grammar", "translate_message"}:
        reply = conversational_reply(current_app.config["DB"], conversation["conversation_id"], message_text)
        assistant = append_message(
            current_app.config["DB"],
            conversation["conversation_id"],
            user["_id"],
            "assistant",
            reply,
            {"kind": "text", "links": [{"label": "Open Email Composer", "url": "/user/email/copy-paste-mode"}]},
        )
        return chat_response(conversation=conversation, user_message=user_message, assistant_message=assistant)

    if parsed["intent"] not in {"preview_sms_campaign", "preview_email_campaign", "preview_direct_sms", "compose_sms", "compose_email", "send_sms_campaign", "send_email_campaign", "send_direct_sms"}:
        reply = conversational_reply(current_app.config["DB"], conversation["conversation_id"], message_text)
        assistant = append_message(
            current_app.config["DB"],
            conversation["conversation_id"],
            user["_id"],
            "assistant",
            parsed.get("clarification_question") if parsed.get("requires_clarification") else reply,
            {"kind": "text"},
        )
        log_ai_stage("final_response_returned", user_id=user["_id"], conversation_id=conversation["conversation_id"], response_kind="text")
        return chat_response(conversation=conversation, user_message=user_message, assistant_message=assistant)

    if parsed.get("selected_mode") == "direct_sms" and not parsed.get("phone_numbers"):
        assistant = append_message(current_app.config["DB"], conversation["conversation_id"], user["_id"], "assistant", "What phone number should receive the SMS?", {"kind": "clarification", "required_field": "phone_number"})
        update_workflow_context(current_app.config["DB"], conversation, user["_id"], state="awaiting_recipient", selected_mode="direct_sms", channel="sms", recipient_type="direct_phone_numbers", last_question_type="recipient")
        refreshed = ai_conversations().find_one({"conversation_id": conversation["conversation_id"], "user_id": user["_id"]})
        return chat_response(conversation=refreshed, user_message=user_message, assistant_message=assistant)

    if parsed.get("selected_mode") == "direct_email" and not parsed.get("recipient_emails"):
        assistant = append_message(current_app.config["DB"], conversation["conversation_id"], user["_id"], "assistant", "What email address should receive the email?", {"kind": "clarification", "required_field": "email_address"})
        update_workflow_context(current_app.config["DB"], conversation, user["_id"], state="awaiting_recipient", selected_mode="direct_email", channel="email", recipient_type="direct_email_addresses", last_question_type="recipient")
        refreshed = ai_conversations().find_one({"conversation_id": conversation["conversation_id"], "user_id": user["_id"]})
        return chat_response(conversation=refreshed, user_message=user_message, assistant_message=assistant)

    draft = create_draft(current_app.config["DB"], user, conversation["conversation_id"], parsed)
    if parsed.get("clarification_type") == "recipient_scope":
        assistant = append_message(
            current_app.config["DB"],
            conversation["conversation_id"],
            user["_id"],
            "assistant",
            parsed.get("clarification_question") or "Should I send this to both the group and the direct phone number?",
            {
                "kind": "clarification",
                "draft_id": draft["draft_id"],
                "options": [
                    {"label": "Send to Both", "value": "mixed", "action": "set_recipient_type"},
                    {"label": "Group Only", "value": "contact_group", "action": "set_recipient_type"},
                    {"label": "Direct Number Only", "value": "direct_phone_numbers", "action": "set_recipient_type"},
                    {"label": "Cancel", "value": "__cancel__", "action": "cancel_draft"},
                ],
            },
        )
        return jsonify({"success": True, "conversation": safe_conversation(conversation), "user_message": safe_message(user_message), "assistant_message": safe_message(assistant), "draft": safe_draft(draft)})
    if not parsed.get("channel"):
        assistant = append_message(
            current_app.config["DB"],
            conversation["conversation_id"],
            user["_id"],
            "assistant",
            parsed.get("clarification_question") or "Do you want to send this as SMS or email?",
            {
                "kind": "clarification",
                "draft_id": draft["draft_id"],
                "options": [
                    {"label": "SMS", "value": "sms", "action": "set_channel"},
                    {"label": "Email", "value": "email", "action": "set_channel"},
                ],
            },
        )
        update_workflow_context(
            current_app.config["DB"], conversation, user["_id"], state="awaiting_channel",
            pending_action_id=draft["draft_id"], recipient_type=draft.get("recipient_type"),
            recipient_emails=draft.get("direct_email_addresses") or [], recipient_phones=draft.get("direct_phone_numbers") or [],
            last_question_type="channel",
        )
        refreshed = ai_conversations().find_one({"conversation_id": conversation["conversation_id"], "user_id": user["_id"]})
        return chat_response(conversation=refreshed, user_message=user_message, assistant_message=assistant, draft=draft)

    group_query = parsed.get("contact_group_name")
    if parsed.get("channel") == "email" and draft.get("direct_email_addresses"):
        if not draft.get("subject"):
            current_content = conversation.get("current_draft") if isinstance(conversation.get("current_draft"), dict) else {}
            suggested_subject = f"A Special {str(current_content.get('category') or 'Message').title()}"
            draft = ai_drafts().find_one_and_update(
                {"draft_id": draft["draft_id"], "user_id": user["_id"]},
                {"$set": {"subject": suggested_subject, "message": draft.get("message") or current_content.get("body"), "updated_at": now_utc()}},
                return_document=ReturnDocument.AFTER,
            )
        prepared, _raw_token, preview_message = prepare_draft(current_app.config["DB"], user, draft)
        assistant = append_message(current_app.config["DB"], conversation["conversation_id"], user["_id"], "assistant", preview_message[0], preview_message[1])
        state = "awaiting_confirmation" if prepared.get("status") == "awaiting_confirmation" else "awaiting_sender"
        update_workflow_context(
            current_app.config["DB"], conversation, user["_id"], state=state,
            channel="email", recipient_type="individual", recipient_emails=prepared.get("direct_email_addresses") or [],
            subject=prepared.get("subject"), pending_action_id=prepared["draft_id"], last_question_type="confirmation" if state == "awaiting_confirmation" else "sender",
        )
        refreshed = ai_conversations().find_one({"conversation_id": conversation["conversation_id"], "user_id": user["_id"]})
        return chat_response(conversation=refreshed, user_message=user_message, assistant_message=assistant, draft=prepared)
    if parsed.get("channel") == "sms" and parsed.get("recipient_type") in {"direct_phone_numbers", "mixed"} and (draft.get("direct_phone_numbers") or draft.get("invalid_phone_numbers")):
        draft, _raw_token, preview_message = prepare_draft(current_app.config["DB"], user, draft)
        assistant = append_message(current_app.config["DB"], conversation["conversation_id"], user["_id"], "assistant", preview_message[0], preview_message[1])
        title = "Direct SMS" if draft.get("recipient_type") == "direct_phone_numbers" else f"{draft.get('contact_group_name') or 'SMS'} + Direct"
        ai_conversations().update_one({"conversation_id": conversation["conversation_id"], "user_id": user["_id"]}, {"$set": {"title": title[:120] or conversation["title"], "updated_at": now_utc()}})
        update_workflow_context(current_app.config["DB"], conversation, user["_id"], state="awaiting_confirmation" if draft.get("status") == "awaiting_confirmation" else "awaiting_sender", channel="sms", recipient_type=draft.get("recipient_type"), recipient_phones=draft.get("direct_phone_numbers") or [], pending_action_id=draft["draft_id"])
        return jsonify({"success": True, "conversation": safe_conversation(ai_conversations().find_one({"conversation_id": conversation["conversation_id"], "user_id": user["_id"]})), "user_message": safe_message(user_message), "assistant_message": safe_message(assistant), "draft": safe_draft(draft)})
    if not group_query:
        assistant = append_message(
            current_app.config["DB"],
            conversation["conversation_id"],
            user["_id"],
            "assistant",
            "Tell me which contact group you want to use.",
            {"kind": "clarification", "draft_id": draft["draft_id"]},
        )
        update_workflow_context(current_app.config["DB"], conversation, user["_id"], state="awaiting_recipient", channel=parsed.get("channel"), pending_action_id=draft["draft_id"], last_question_type="recipient")
        refreshed = ai_conversations().find_one({"conversation_id": conversation["conversation_id"], "user_id": user["_id"]})
        return chat_response(conversation=refreshed, user_message=user_message, assistant_message=assistant, draft=draft)

    log_ai_stage("contact_group_searched", user_id=user["_id"], conversation_id=conversation["conversation_id"], draft_id=draft["draft_id"], query_length=len(group_query or ""))
    group_result = resolve_contact_group(current_app.config["DB"], user["_id"], group_query)
    log_ai_stage("contact_group_result", user_id=user["_id"], conversation_id=conversation["conversation_id"], draft_id=draft["draft_id"], status=group_result.get("status"), contact_count=(group_result.get("group") or {}).get("count"))
    if group_result["status"] == "exact":
        ai_drafts().update_one({"draft_id": draft["draft_id"], "user_id": user["_id"]}, {"$set": {"contact_group_name": group_result["group"]["name"], "status": "ready_for_preview", "updated_at": now_utc()}})
        draft = ai_drafts().find_one({"draft_id": draft["draft_id"], "user_id": user["_id"]})
        draft, _raw_token, preview_message = prepare_draft(current_app.config["DB"], user, draft)
        assistant = append_message(current_app.config["DB"], conversation["conversation_id"], user["_id"], "assistant", preview_message[0], preview_message[1])
        title = f"{draft.get('contact_group_name')} {draft.get('channel', '').upper()}".strip()
        ai_conversations().update_one({"conversation_id": conversation["conversation_id"], "user_id": user["_id"]}, {"$set": {"title": title[:120] or conversation["title"], "updated_at": now_utc()}})
        update_workflow_context(current_app.config["DB"], conversation, user["_id"], state="awaiting_confirmation" if draft.get("status") == "awaiting_confirmation" else "awaiting_sender", channel=draft.get("channel"), recipient_type="contact_group", contact_group_name=draft.get("contact_group_name"), pending_action_id=draft["draft_id"], subject=draft.get("subject"), last_question_type="confirmation" if draft.get("status") == "awaiting_confirmation" else "sender")
        refreshed = ai_conversations().find_one({"conversation_id": conversation["conversation_id"], "user_id": user["_id"]})
        return chat_response(conversation=refreshed, user_message=user_message, assistant_message=assistant, draft=draft)

    group_message = build_group_choice_message(group_query, group_result)
    ai_drafts().update_one({"draft_id": draft["draft_id"], "user_id": user["_id"]}, {"$set": {"status": "awaiting_clarification", "updated_at": now_utc()}})
    draft = ai_drafts().find_one({"draft_id": draft["draft_id"], "user_id": user["_id"]})
    assistant = append_message(current_app.config["DB"], conversation["conversation_id"], user["_id"], "assistant", group_message[0], {**group_message[1], "draft_id": draft["draft_id"]})
    return jsonify({"success": True, "conversation": safe_conversation(conversation), "user_message": safe_message(user_message), "assistant_message": safe_message(assistant), "draft": safe_draft(draft)})


def build_group_choice_message(query: str, result: dict) -> tuple[str, dict]:
    from services.ai_assistant_service import build_group_choice_message as helper
    return helper(query, result)


@ai_bp.patch("/drafts/<draft_id>")
@require_auth
def update_ai_draft(payload, draft_id):
    if not assistant_enabled():
        return {"success": False, "message": "VireSend AI is currently disabled."}, 403
    user = get_current_user(payload)
    if not user or user.get("account_status") != "active":
        return {"success": False, "message": "User account not found."}, 404
    draft = ai_drafts().find_one({"draft_id": clean_string(draft_id), "user_id": user["_id"]})
    if not draft:
        return {"success": False, "message": "Draft not found."}, 404
    if draft.get("status") in {"completed", "cancelled", "expired"}:
        return {"success": False, "message": "This draft can no longer be changed."}, 400
    data = request.get_json(silent=True) or {}
    updates = {"updated_at": now_utc()}
    if "channel" in data:
        channel = clean_string(data.get("channel", "")).lower()
        if channel in {"sms", "email"}:
            updates["channel"] = channel
    if "contact_group_name" in data:
        requested_group = clean_string(data.get("contact_group_name", ""))
        if requested_group:
            group_result = resolve_contact_group(current_app.config["DB"], user["_id"], requested_group)
            if group_result.get("status") == "exact":
                updates["contact_group_name"] = group_result["group"]["name"]
            else:
                conversation = ai_conversations().find_one({"conversation_id": draft["conversation_id"], "user_id": user["_id"]})
                group_message = build_group_choice_message(requested_group, group_result)
                assistant = append_message(current_app.config["DB"], conversation["conversation_id"], user["_id"], "assistant", group_message[0], {**group_message[1], "draft_id": draft["draft_id"]})
                return chat_response(conversation=conversation, assistant_message=assistant, draft=draft)
        else:
            updates["contact_group_name"] = None
    if "recipient_type" in data:
        recipient_type = clean_string(data.get("recipient_type", "")).lower()
        if recipient_type in {"contact_group", "direct_phone_numbers", "mixed"}:
            updates["recipient_type"] = recipient_type
            if recipient_type == "contact_group":
                updates["direct_phone_numbers"] = []
                updates["direct_phone_display_numbers"] = []
            if recipient_type == "direct_phone_numbers":
                updates["contact_group_name"] = None
    if "direct_phone_numbers" in data and isinstance(data.get("direct_phone_numbers"), list):
        updates["direct_phone_numbers"] = [clean_string(item) for item in data.get("direct_phone_numbers") if clean_string(item)]
    if "message" in data:
        updates["message"] = str(data.get("message") or "")[:4000]
    if "subject" in data:
        updates["subject"] = clean_string(data.get("subject", ""))[:180]
    if "sender_id" in data:
        updates["sender_id"] = clean_string(data.get("sender_id", ""))[:40]
    if "email_account_id" in data:
        updates["email_account_id"] = clean_string(data.get("email_account_id", ""))[:80]
    if data.get("action") == "cancel":
        updates["status"] = "cancelled"
    draft = ai_drafts().find_one_and_update({"draft_id": draft["draft_id"], "user_id": user["_id"]}, {"$set": updates}, return_document=ReturnDocument.AFTER)
    conversation = ai_conversations().find_one({"conversation_id": draft["conversation_id"], "user_id": user["_id"]})
    if draft.get("status") == "cancelled":
        assistant = append_message(current_app.config["DB"], conversation["conversation_id"], user["_id"], "assistant", "Draft cancelled.", {"kind": "info", "draft_id": draft["draft_id"]})
        return jsonify({"success": True, "draft": safe_draft(draft), "assistant_message": safe_message(assistant), "conversation": safe_conversation(conversation)})

    if draft.get("recipient_type") in {"contact_group", "mixed"} and not draft.get("contact_group_name") and draft.get("contact_group_query"):
        result = resolve_contact_group(current_app.config["DB"], user["_id"], draft["contact_group_query"])
        if result["status"] == "exact":
            draft = ai_drafts().find_one_and_update({"draft_id": draft["draft_id"], "user_id": user["_id"]}, {"$set": {"contact_group_name": result["group"]["name"], "updated_at": now_utc()}}, return_document=ReturnDocument.AFTER)
        else:
            group_message = build_group_choice_message(draft["contact_group_query"], result)
            assistant = append_message(current_app.config["DB"], conversation["conversation_id"], user["_id"], "assistant", group_message[0], {**group_message[1], "draft_id": draft["draft_id"]})
            return jsonify({"success": True, "draft": safe_draft(draft), "assistant_message": safe_message(assistant), "conversation": safe_conversation(conversation)})

    draft, _raw_token, preview_message = prepare_draft(current_app.config["DB"], user, draft)
    assistant = append_message(current_app.config["DB"], conversation["conversation_id"], user["_id"], "assistant", preview_message[0], preview_message[1])
    state = "awaiting_confirmation" if draft.get("status") == "awaiting_confirmation" else "awaiting_sender" if draft.get("status") == "awaiting_clarification" else draft.get("status", "preparing_preview")
    update_workflow_context(current_app.config["DB"], conversation, user["_id"], state=state, pending_action_id=draft["draft_id"], channel=draft.get("channel"), subject=draft.get("subject"), last_question_type="confirmation" if state == "awaiting_confirmation" else "sender")
    refreshed = ai_conversations().find_one({"conversation_id": conversation["conversation_id"], "user_id": user["_id"]})
    return chat_response(conversation=refreshed, assistant_message=assistant, draft=draft)


@ai_bp.post("/drafts/<draft_id>/confirm")
@require_auth
def confirm_ai_draft(payload, draft_id):
    if not assistant_enabled():
        return {"success": False, "message": "VireSend AI is currently disabled."}, 403
    user = get_current_user(payload)
    if not user or user.get("account_status") != "active":
        return {"success": False, "message": "User account not found."}, 404
    draft = ai_drafts().find_one({"draft_id": clean_string(draft_id), "user_id": user["_id"]})
    if not draft:
        return {"success": False, "message": "Draft not found."}, 404
    token = clean_string((request.get_json(silent=True) or {}).get("confirmation_token", ""))
    if not token:
        return {"success": False, "message": "Confirmation token is required."}, 400
    final_draft, card, status = confirm_draft(current_app.config["DB"], user, draft, token)
    conversation = ai_conversations().find_one({"conversation_id": draft["conversation_id"], "user_id": user["_id"]})
    update_workflow_context(current_app.config["DB"], conversation, user["_id"], state="completed" if status < 400 and final_draft.get("status") == "completed" else "failed" if status >= 400 else final_draft.get("status", "processing_send"), pending_action_id=final_draft.get("draft_id"))
    assistant = append_message(current_app.config["DB"], conversation["conversation_id"], user["_id"], "assistant", card.get("message") or card.get("kind", "Campaign update"), card)
    refreshed = ai_conversations().find_one({"conversation_id": conversation["conversation_id"], "user_id": user["_id"]})
    response, _ = chat_response(conversation=refreshed, assistant_message=assistant, draft=final_draft, success=status < 400, error=None if status < 400 else {"code": card.get("error_code", "SEND_FAILED"), "retryable": status >= 500}, status=status)
    payload = response.get_json()
    payload["campaign"] = card
    return jsonify(payload), status


@ai_bp.post("/drafts/<draft_id>/cancel")
@require_auth
def cancel_ai_draft(payload, draft_id):
    if not assistant_enabled():
        return {"success": False, "message": "VireSend AI is currently disabled."}, 403
    user = get_current_user(payload)
    if not user or user.get("account_status") != "active":
        return {"success": False, "message": "User account not found."}, 404
    draft = ai_drafts().find_one_and_update({"draft_id": clean_string(draft_id), "user_id": user["_id"]}, {"$set": {"status": "cancelled", "updated_at": now_utc()}}, return_document=ReturnDocument.AFTER)
    if not draft:
        return {"success": False, "message": "Draft not found."}, 404
    assistant = append_message(current_app.config["DB"], draft["conversation_id"], user["_id"], "assistant", "Draft cancelled.", {"kind": "info", "draft_id": draft["draft_id"]})
    conversation = ai_conversations().find_one({"conversation_id": draft["conversation_id"], "user_id": user["_id"]})
    update_workflow_context(current_app.config["DB"], conversation, user["_id"], state="cancelled", pending_action_id=draft["draft_id"])
    refreshed = ai_conversations().find_one({"conversation_id": draft["conversation_id"], "user_id": user["_id"]})
    return chat_response(conversation=refreshed, assistant_message=assistant, draft=draft)


@ai_bp.get("/drafts/<draft_id>/status")
@require_auth
def get_ai_draft_status(payload, draft_id):
    if not assistant_enabled():
        return {"success": False, "message": "VireSend AI is currently disabled."}, 403
    user = get_current_user(payload)
    if not user or user.get("account_status") != "active":
        return {"success": False, "message": "User account not found."}, 404
    draft = ai_drafts().find_one({"draft_id": clean_string(draft_id), "user_id": user["_id"]})
    if not draft:
        return {"success": False, "message": "Draft not found."}, 404
    return jsonify({"success": True, "draft": safe_draft(draft)})
