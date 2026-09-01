import hashlib
import hmac
import logging
import re
import secrets
from datetime import timedelta
from difflib import SequenceMatcher
from typing import Any

from bson import ObjectId
from pymongo import ReturnDocument

from config import Config
from routes.contact_routes import clean_group
from routes.email_routes import (
    account_for_user,
    build_recipients,
    email_accounts,
    email_campaigns,
    email_cost,
    refresh_gmail_token,
    sanitize_html,
    send_email_flow,
)
from routes.sms_routes import (
    campaigns_collection as sms_campaigns_collection,
    contacts_collection,
    cost_preview,
    get_contacts_by_phones,
    get_group_contacts,
    get_sms_settings,
    normalize_phone,
    parse_numbers,
    send_sms_flow,
    sms_parts,
)
from services.sms_credit_service import sms_credit_balance
from services.deepseek_service import chat_completion, chat_json, deepseek_available
from services.moolre_sender_id_service import SenderIdError, approved_sender_ids_for_user, enforce_approved_moolre_sender_id
from utils.notifications import create_notification
from utils.security import clean_string, is_valid_email, now_utc

ASSISTANT_INTENTS = {
    "general_help",
    "generate_message",
    "improve_message",
    "generate_reply",
    "format_message",
    "compose_sms",
    "compose_email",
    "rewrite_message",
    "fix_grammar",
    "translate_message",
    "find_contact_group",
    "preview_sms_campaign",
    "preview_email_campaign",
    "preview_direct_sms",
    "send_sms_campaign",
    "send_email_campaign",
    "send_direct_sms",
    "schedule_sms_campaign",
    "schedule_email_campaign",
    "schedule_direct_sms",
    "get_campaign_status",
    "cancel_draft",
    "unknown",
}

ASSISTANT_MODES = {"direct_sms", "group_sms", "direct_email", "group_email", "general_assistant"}
CONVERSATION_INTENTS = {
    "casual_chat", "help_request", "content_generation", "content_editing",
    "app_guidance", "contact_lookup", "draft_message", "send_message",
    "update_draft", "confirm_send", "cancel_send", "change_channel",
    "new_chat", "unknown",
}
CONVERSATION_STATUSES = {
    "chatting", "drafting", "editing", "preparing_delivery",
    "awaiting_details", "awaiting_confirmation", "sending", "completed",
    "cancelled",
}


def normalize_assistant_mode(value: str | None) -> str:
    mode = clean_string(value or "").lower()
    return mode if mode in ASSISTANT_MODES else "general_assistant"


def apply_selected_mode(parsed: dict, selected_mode: str | None) -> dict:
    """Apply the UI-selected mode as trusted workflow state, not model-derived text."""
    mode = normalize_assistant_mode(selected_mode)
    result = dict(parsed or {})
    if mode == "general_assistant":
        result["selected_mode"] = mode
        return result

    channel = "sms" if mode.endswith("sms") else "email"
    direct = mode.startswith("direct_")
    result["selected_mode"] = mode
    result["channel"] = channel
    if direct:
        result["recipient_type"] = "direct_phone_numbers" if channel == "sms" else "direct_email_addresses"
        result["contact_group_name"] = None
        result["clarification_type"] = "recipient" if not (result.get("phone_numbers") if channel == "sms" else result.get("recipient_emails")) else result.get("clarification_type")
        result["clarification_question"] = ("What phone number should receive the SMS?" if channel == "sms" else "What email address should receive the email?") if result.get("clarification_type") == "recipient" else result.get("clarification_question")
    else:
        result["recipient_type"] = "contact_group"
        result["phone_numbers"] = []
        result["recipient_emails"] = []
    return result
ASSISTANT_RATE_LIMIT_PER_MINUTE = 12
ASSISTANT_RATE_LIMIT_PER_DAY = 200
DRAFT_EXPIRY_HOURS = 6
MAX_HISTORY_MESSAGES = 10
MAX_DIRECT_SMS_RECIPIENTS = max(1, int(getattr(Config, "AI_DIRECT_SMS_MAX_RECIPIENTS", 20) or 20))
PHONE_PATTERN = re.compile(r"(?:(?:\+?233|233|0)[\d\s-]{7,16})")
EMAIL_PATTERN = re.compile(r"(?<![\w.+-])([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})(?![\w-])", re.IGNORECASE)
logger = logging.getLogger("viresend.ai")
CONTENT_CREATION_RE = re.compile(
    r"\b(?:write|construct|compose|draft|create|generate|suggest|prepare|give me|help me (?:write|reply)|make)\b.*"
    r"\b(?:message|wish|reply|announcement|greeting|email|sms|invitation|reminder|follow[ -]?up|apology|congrat|thank|promotion|subject)\b",
    re.IGNORECASE,
)
CONTENT_PURPOSE_RE = re.compile(
    r"\b(?:birthday|apology|congratulations?|thank[ -]?you|encouragement|get well|condolence|invitation|reminder|greeting|appreciation|promotion|product launch|discount|payment|appointment|follow[ -]?up|order update|delivery|welcome|feedback|complaint|meeting|newsletter)\b",
    re.IGNORECASE,
)
CONTENT_REFINEMENT_RE = re.compile(
    r"\b(?:rewrite|improve|correct|shorter|longer|friendlier|friendly|professional|formal|informal|persuasive|emotional|heartfelt|add\b|remove\b|change\b|use\b|with emojis?|without emojis?|another (?:option|version)|three options|translate|turn it into|suitable for|less formal|grammar)\b",
    re.IGNORECASE,
)
CLEAR_SEND_RE = re.compile(r"^\s*(?:(?:okay|ok|alright|great)[,\s]+)?(?:please\s+)?(?:(?:i (?:want|would like|am ready) to\s+)?send (?:it|this|the message|this draft)|send to|proceed with sending|confirm and send)\b", re.IGNORECASE)


def classify_conversation_intent(text: str, conversation: dict | None = None) -> str:
    """Classify chat separately from delivery; this function never executes actions."""
    value = clean_string(text)
    lower = value.casefold().strip()
    workflow = default_workflow_context(conversation)
    has_draft = bool((conversation or {}).get("current_draft"))
    if re.search(r"\b(?:new chat|start (?:again|over)|reset (?:this|the) chat|forget (?:all|everything))\b", lower):
        return "new_chat"
    if (workflow.get("status") == "awaiting_confirmation" or workflow.get("state") == "awaiting_confirmation") and lower.strip(" .!?") in {"yes", "confirm", "confirm and send", "send it now", "proceed"}:
        return "confirm_send"
    if re.search(r"\b(?:forget sending|cancel (?:the )?send|do not send|don't send|stop sending|never mind)\b", lower):
        return "cancel_send"
    if has_draft and re.search(r"\b(?:actually\s+)?(?:use|change (?:it )?to|switch to)\s+(?:sms|email)\b", lower):
        return "change_channel"
    if CLEAR_SEND_RE.search(value) or re.search(r"^\s*(?:please\s+)?(?:email|message)\s+(?:them|the|my)\b", lower):
        return "send_message"
    if re.search(r"\b(?:contact groups?|how many contacts|my groups|list (?:my )?groups)\b", lower):
        return "contact_lookup"
    if has_draft and CONTENT_REFINEMENT_RE.search(value):
        return "content_editing"
    if classify_content_request(value, (conversation or {}).get("current_draft")):
        return "content_generation"
    if re.match(r"^(?:hi|hello|hey|good (?:morning|afternoon|evening)|how are you)\b", lower):
        return "casual_chat"
    if re.search(r"\b(?:what is|how do i|how many characters|can i send internationally|what services|sender id|bulk sms)\b", lower):
        return "app_guidance"
    if re.search(r"\b(?:help|what can you (?:do|help)|show me how)\b", lower):
        return "help_request"
    return "unknown"


def log_ai_stage(stage: str, *, user_id=None, conversation_id=None, draft_id=None, **details):
    """Log workflow metadata without message bodies, recipients, credentials, or tokens."""
    safe_details = {
        key: value for key, value in details.items()
        if key not in {"message", "content", "recipients", "confirmation_token", "api_key", "password"}
    }
    logger.info(
        "ai_stage=%s user_id=%s conversation_id=%s draft_id=%s details=%s",
        stage,
        str(user_id or ""),
        str(conversation_id or ""),
        str(draft_id or ""),
        safe_details,
    )


def assistant_enabled() -> bool:
    return bool(Config.AI_ENABLED and getattr(Config, "AI_COMMUNICATION_ASSISTANT_ENABLED", True))


def make_id(prefix: str) -> str:
    return f"{prefix}-{now_utc().strftime('%Y%m%d%H%M%S')}-{secrets.token_hex(4).upper()}"


def conversations_collection(db):
    return db.ai_conversations


def messages_collection(db):
    return db.ai_conversation_messages


def drafts_collection(db):
    return db.ai_campaign_drafts


def audit_logs_collection(db):
    return db.ai_action_audit_logs


def list_user_group_counts(db, user_id: ObjectId) -> list[dict]:
    pipeline = [
        {"$match": {"user_id": user_id}},
        {"$group": {"_id": "$group", "count": {"$sum": 1}}},
        {"$sort": {"_id": 1}},
    ]
    return [{"name": item["_id"] or "All Contacts", "count": int(item["count"] or 0)} for item in contacts_collection().aggregate(pipeline)]


def normalize_group_name(value: str) -> str:
    return clean_group(value).strip()


def resolve_contact_group(db, user_id: ObjectId, query: str) -> dict:
    clean_query = normalize_group_name(query)
    groups = list_user_group_counts(db, user_id)
    if not clean_query:
        return {"status": "missing", "groups": groups}
    exact = [group for group in groups if normalize_group_name(group["name"]).casefold() == clean_query.casefold()]
    if len(exact) == 1:
        return {"status": "exact", "group": exact[0], "groups": groups}

    ranked = []
    for group in groups:
        score = SequenceMatcher(None, clean_query.casefold(), normalize_group_name(group["name"]).casefold()).ratio()
        if score >= 0.6:
            ranked.append({**group, "score": score})
    ranked.sort(key=lambda item: (-item["score"], item["name"]))
    if len(ranked) == 1 and ranked[0]["score"] >= 0.72:
        return {"status": "likely", "group": ranked[0], "groups": groups}
    if ranked:
        return {"status": "multiple", "options": ranked[:5], "groups": groups}
    return {"status": "missing", "groups": groups}


def estimate_tokens(value: str) -> int:
    return max(1, round(len(value or "") / 4))


def hash_token(value: str) -> str:
    return hashlib.sha256((value or "").encode("utf-8")).hexdigest()


def sign_signature(payload: str) -> str:
    return hmac.new(Config.JWT_SECRET.encode("utf-8"), payload.encode("utf-8"), hashlib.sha256).hexdigest()


def assistant_rate_limited(db, user_id: ObjectId):
    now = now_utc()
    minute_count = messages_collection(db).count_documents({
        "user_id": user_id,
        "role": "user",
        "created_at": {"$gte": now - timedelta(minutes=1)},
    })
    if minute_count >= ASSISTANT_RATE_LIMIT_PER_MINUTE:
        return {"success": False, "message": "VireSend AI is busy. Please wait a minute and try again."}, 429
    day_count = messages_collection(db).count_documents({
        "user_id": user_id,
        "role": "user",
        "created_at": {"$gte": now - timedelta(days=1)},
    })
    if day_count >= ASSISTANT_RATE_LIMIT_PER_DAY:
        return {"success": False, "message": "Daily VireSend AI limit reached. Please try again tomorrow."}, 429
    return None


def safe_conversation(doc: dict) -> dict:
    return {
        "id": doc.get("conversation_id"),
        "title": doc.get("title", "New Conversation"),
        "status": doc.get("status", "active"),
        "created_at": doc.get("created_at").isoformat() if doc.get("created_at") else None,
        "updated_at": doc.get("updated_at").isoformat() if doc.get("updated_at") else None,
        "last_message_at": doc.get("last_message_at").isoformat() if doc.get("last_message_at") else None,
    }


def default_workflow_context(conversation: dict | None = None) -> dict:
    conversation = conversation or {}
    current_draft = conversation.get("current_draft") if isinstance(conversation.get("current_draft"), dict) else {}
    stored = conversation.get("workflow_context") if isinstance(conversation.get("workflow_context"), dict) else {}
    return {
        "selected_mode": normalize_assistant_mode(stored.get("selected_mode")),
        "conversation_mode": stored.get("conversation_mode") or "chat",
        "intent": stored.get("intent") or "unknown",
        "status": stored.get("status") or ("drafting" if current_draft else "chatting"),
        "requires_action": bool(stored.get("requires_action", False)),
        "missing_fields": list(stored.get("missing_fields") or []),
        "current_goal": stored.get("current_goal"),
        "tone": stored.get("tone") or current_draft.get("tone"),
        "language": stored.get("language"),
        "send_requested": bool(stored.get("send_requested", False)),
        "state": stored.get("state") or ("drafting" if current_draft else "idle"),
        "active_draft_id": stored.get("active_draft_id") or current_draft.get("draft_id"),
        "pending_action_id": stored.get("pending_action_id"),
        "channel": stored.get("channel") or current_draft.get("channel"),
        "recipient_type": stored.get("recipient_type"),
        "recipient_emails": list(stored.get("recipient_emails") or []),
        "recipient_phones": list(stored.get("recipient_phones") or []),
        "contact_group_name": stored.get("contact_group_name"),
        "subject": stored.get("subject") or current_draft.get("subject"),
        "sender": stored.get("sender"),
        "last_question_type": stored.get("last_question_type"),
        "last_question_message_id": stored.get("last_question_message_id"),
        "updated_at": stored.get("updated_at"),
    }


def safe_workflow_context(conversation: dict | None) -> dict:
    context = default_workflow_context(conversation)
    return {
        **context,
        "recipient_count": len(context["recipient_emails"]) + len(context["recipient_phones"]),
        "updated_at": context["updated_at"].isoformat() if hasattr(context.get("updated_at"), "isoformat") else context.get("updated_at"),
    }


def update_workflow_context(db, conversation: dict, user_id: ObjectId, *, state: str | None = None, **updates) -> dict:
    before = default_workflow_context(conversation)
    after = {**before, **{key: value for key, value in updates.items() if value is not None}}
    if state:
        after["state"] = state
        status = {
            "idle": "chatting", "discussing": "chatting", "drafting": "drafting",
            "editing": "editing", "preparing_preview": "preparing_delivery",
            "awaiting_channel": "awaiting_details", "awaiting_recipient": "awaiting_details",
            "awaiting_subject": "awaiting_details", "awaiting_sender": "awaiting_details",
            "awaiting_confirmation": "awaiting_confirmation",
            "processing_send": "sending", "completed": "completed",
            "cancelled": "cancelled", "failed": "preparing_delivery",
        }.get(state)
        if status:
            after["status"] = status
            after["conversation_mode"] = "action" if status in {
                "preparing_delivery", "awaiting_details", "awaiting_confirmation", "sending",
            } else "chat"
            after["requires_action"] = after["conversation_mode"] == "action"
    after["updated_at"] = now_utc()
    conversations_collection(db).update_one(
        {"conversation_id": conversation["conversation_id"], "user_id": user_id},
        {"$set": {"workflow_context": after, "updated_at": after["updated_at"]}},
    )
    log_ai_stage("state_transition", user_id=user_id, conversation_id=conversation.get("conversation_id"), from_state=before.get("state"), to_state=after.get("state"), active_draft_id=after.get("active_draft_id"), pending_action_id=after.get("pending_action_id"), channel=after.get("channel"), recipient_type=after.get("recipient_type"))
    return after


def extract_email_addresses(text: str) -> list[str]:
    found = []
    for match in EMAIL_PATTERN.finditer(text or ""):
        email = clean_string(match.group(1)).lower().rstrip(".,;:!?")
        if is_valid_email(email) and email not in found:
            found.append(email)
    return found


def interpret_workflow_message(context: dict, text: str) -> dict | None:
    """Interpret short answers and explicit entities against server-owned state."""
    value = clean_string(text)
    lower = value.casefold().strip(" .!?")
    state = context.get("state") or "idle"
    emails = extract_email_addresses(value)
    phones = analyze_direct_phone_numbers(extract_phone_candidates(value))["valid_numbers"]
    channel = None
    if emails and not phones:
        channel = "email"
    elif phones and not emails:
        channel = "sms"
    elif lower in {"email", "use email", "by email", "send by email", "yes email", "yes, email", "make it an email"}:
        channel = "email"
    elif lower in {"sms", "use sms", "by sms", "send by sms", "yes sms", "yes, sms", "text message"}:
        channel = "sms"

    if emails or phones:
        return {"intent": "provide_recipient", "entities": {"channel": channel, "recipient_emails": emails, "recipient_phones": phones, "recipient_type": "individual"}}
    if state == "awaiting_channel":
        if channel:
            return {"intent": "provide_channel", "entities": {"channel": channel}}
        return {"intent": "invalid_channel", "entities": {}}
    if state == "awaiting_subject" and lower not in {"cancel", "no", "never mind"}:
        if lower in {"suggest one", "suggest", "you suggest", "generate one"}:
            return {"intent": "suggest_subject", "entities": {}}
        return {"intent": "provide_subject", "entities": {"subject": value[:180]}}
    if state == "awaiting_confirmation":
        if lower in {"yes", "confirm", "confirm and send", "proceed", "continue", "send it", "okay", "ok"}:
            return {"intent": "confirm_send_action", "entities": {}}
        if lower in {"no", "cancel", "cancel it", "do not send", "don't send", "do not send it anymore"}:
            return {"intent": "cancel_action", "entities": {}}
    selected_mode = normalize_assistant_mode(context.get("selected_mode"))
    if state == "awaiting_recipient" and selected_mode.startswith("direct_"):
        return {"intent": "invalid_recipient", "entities": {"selected_mode": selected_mode}}
    if state == "awaiting_recipient" and value and len(value) <= 100:
        return {"intent": "provide_group", "entities": {"contact_group_name": value}}
    if channel and state not in {"idle", "discussing"}:
        return {"intent": "provide_channel", "entities": {"channel": channel}}
    return None


def safe_message(doc: dict) -> dict:
    return {
        "id": doc.get("message_id"),
        "conversation_id": doc.get("conversation_id"),
        "role": doc.get("role", "assistant"),
        "content": doc.get("content", ""),
        "structured_data": doc.get("structured_data") if isinstance(doc.get("structured_data"), dict) else {},
        "created_at": doc.get("created_at").isoformat() if doc.get("created_at") else None,
    }


def safe_draft(doc: dict) -> dict:
    return {
        "id": doc.get("draft_id"),
        "draft_id": doc.get("draft_id"),
        "conversation_id": doc.get("conversation_id"),
        "channel": doc.get("channel"),
        "contact_group_name": doc.get("contact_group_name"),
        "contact_group_query": doc.get("contact_group_query"),
        "recipient_type": doc.get("recipient_type", "contact_group"),
        "direct_phone_numbers": doc.get("direct_phone_numbers") or [],
        "direct_phone_display_numbers": doc.get("direct_phone_display_numbers") or [],
        "direct_email_addresses": doc.get("direct_email_addresses") or [],
        "message": doc.get("message"),
        "subject": doc.get("subject"),
        "sender_id": doc.get("sender_id"),
        "email_account_id": doc.get("email_account_id"),
        "valid_recipient_count": int(doc.get("valid_recipient_count", 0) or 0),
        "invalid_recipient_count": int(doc.get("invalid_recipient_count", 0) or 0),
        "duplicate_recipient_count": int(doc.get("duplicate_recipient_count", 0) or 0),
        "sms_segments_per_recipient": doc.get("sms_segments_per_recipient"),
        "total_billable_segments": doc.get("total_billable_segments"),
        "estimated_cost": doc.get("estimated_cost"),
        "wallet_balance_snapshot": doc.get("wallet_balance_snapshot"),
        "status": doc.get("status", "draft"),
        "campaign_id": doc.get("campaign_id"),
        "campaign_channel": doc.get("campaign_channel"),
        "created_at": doc.get("created_at").isoformat() if doc.get("created_at") else None,
        "updated_at": doc.get("updated_at").isoformat() if doc.get("updated_at") else None,
        "expires_at": doc.get("expires_at").isoformat() if doc.get("expires_at") else None,
        "preview": doc.get("preview") if isinstance(doc.get("preview"), dict) else {},
    }


def safe_content_draft(doc: dict | None) -> dict | None:
    if not isinstance(doc, dict):
        return None
    body = str(doc.get("body") or "")[:8000]
    options = [
        {"label": clean_string(item.get("label", "Option"))[:80] or "Option", "body": str(item.get("body") or "")[:8000]}
        for item in (doc.get("options") or [])[:5]
        if isinstance(item, dict) and str(item.get("body") or "").strip()
    ]
    return {
        "draft_id": doc.get("draft_id"),
        "category": doc.get("category") or "message",
        "tone": doc.get("tone") or "natural",
        "audience": doc.get("audience") or "unspecified",
        "channel": doc.get("channel"),
        "subject": doc.get("subject"),
        "body": body,
        "options": options,
        "character_count": len(body),
        "sms_segments": sms_parts(body) if doc.get("channel") == "sms" else None,
        "status": "draft",
        "updated_at": doc.get("updated_at").isoformat() if doc.get("updated_at") else None,
    }


def classify_content_request(text: str, current_draft: dict | None = None) -> str | None:
    """Separate writing/editing from explicit preparation or sending."""
    value = clean_string(text)
    lower = value.casefold()
    if CLEAR_SEND_RE.search(value) or re.search(r"\bsend\b.*\b(?:group|contacts?|numbers?|recipients?)\b", lower):
        return None
    if current_draft and re.search(r"\b(?:prepare|format|make)\s+(?:it|this)\s+(?:as|for)\s+(?:an?\s+)?(?:sms|email)\b", lower):
        return "format_message"
    if current_draft and CONTENT_REFINEMENT_RE.search(value):
        return "improve_message"
    if re.search(r"\bhelp me reply\b", lower):
        return "generate_reply"
    if CONTENT_CREATION_RE.search(value):
        return "generate_message"
    if CONTENT_PURPOSE_RE.search(value) and any(phrase in lower for phrase in ("i want to", "i need a message", "message for", "wish someone")):
        return "generate_message"
    return None


def _fallback_content_draft(instruction: str, current: dict | None) -> dict:
    if current and current.get("body"):
        body = str(current["body"])
        if "short" in instruction.casefold():
            body = body.split(".")[0].strip() + "."
        return {**current, "body": body, "options": []}
    purpose = next((match.group(0).lower() for match in CONTENT_PURPOSE_RE.finditer(instruction)), "message")
    body = "I’m thinking of you and sending my very best wishes. May this moment bring you happiness, peace, and many reasons to smile."
    return {"category": purpose, "tone": "warm", "audience": "individual", "channel": None, "subject": None, "body": body, "options": []}


def create_or_refine_content_draft(db, conversation: dict, user_id: ObjectId, instruction: str, intent: str) -> dict:
    current = conversation.get("current_draft") if isinstance(conversation.get("current_draft"), dict) else None
    channel = current.get("channel") if current else None
    lower = instruction.casefold()
    if intent == "format_message":
        channel = "email" if "email" in lower else "sms"
    elif "sms" in lower and any(term in lower for term in ("suitable", "format", "turn", "use for", "as sms")):
        channel = "sms"
    elif "email" in lower and any(term in lower for term in ("suitable", "format", "turn", "use for", "as email", "subject")):
        channel = "email"

    parsed = None
    if deepseek_available():
        system_prompt = (
            "You are VireSend AI, a friendly and intelligent assistant inside the VireSender platform. "
            "You chat naturally, answer VireSender questions, brainstorm campaigns, write and edit SMS and email, suggest variations, retrieve contact groups when requested, and prepare messages for sending. "
            "Do not force users to provide complete commands. For drafting, develop content across multiple turns and use the active draft for edits. "
            "Only begin recipient collection after a clear request to send. A writing request is never permission to send. Never interpret every message as a send command. "
            "Never invent contact groups, phone numbers, email addresses, sender IDs, or account facts. The latest instruction has priority. "
            "When send intent is ambiguous ask: 'Would you like me to keep editing this, or prepare it for sending?' Never send without explicit confirmation. "
            "If multiple versions are requested, return separate labelled options. "
            "Return JSON only with keys category, tone, audience, channel, subject, body, options. options is an array of {label, body}. "
            "For email formatting include a subject. For SMS keep copy concise. Do not invent account data or claim the message was sent."
        )
        json_safe = safe_content_draft(current) if current else None
        try:
            parsed = chat_json([
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": f"Current draft: {json_safe or 'none'}\nUser instruction: {instruction}\nRequested channel: {channel or 'not selected'}"},
            ], temperature=0.55, max_tokens=1400)
        except Exception:
            logger.exception("ai_stage=content_generation_provider_failed conversation_id=%s", conversation.get("conversation_id"))
    if not isinstance(parsed, dict):
        parsed = _fallback_content_draft(instruction, current)

    body = str(parsed.get("body") or (current or {}).get("body") or "").strip()[:8000]
    options = parsed.get("options") if isinstance(parsed.get("options"), list) else []
    if options and not body:
        body = str((options[0] or {}).get("body") or "").strip()[:8000]
    now = now_utc()
    draft = {
        "draft_id": (current or {}).get("draft_id") if intent in {"improve_message", "format_message"} else make_id("AIMD"),
        "category": clean_string(parsed.get("category", "message"))[:80] or "message",
        "tone": clean_string(parsed.get("tone", "natural"))[:80] or "natural",
        "audience": clean_string(parsed.get("audience", "unspecified"))[:80] or "unspecified",
        "channel": clean_string(parsed.get("channel", "")).lower() or channel,
        "subject": clean_string(parsed.get("subject", ""))[:180] or None,
        "body": body,
        "options": options[:5],
        "updated_at": now,
    }
    conversations_collection(db).update_one(
        {"conversation_id": conversation["conversation_id"], "user_id": user_id},
        {"$set": {
            "current_draft": draft,
            "workflow_context.state": "drafting",
            "workflow_context.conversation_mode": "chat",
            "workflow_context.intent": "content_editing" if current else "content_generation",
            "workflow_context.status": "editing" if current else "drafting",
            "workflow_context.requires_action": False,
            "workflow_context.send_requested": False,
            "workflow_context.missing_fields": [],
            "workflow_context.active_draft_id": draft.get("draft_id"),
            "workflow_context.channel": draft.get("channel"),
            "workflow_context.subject": draft.get("subject"),
            "workflow_context.updated_at": now,
            "updated_at": now,
        }},
    )
    log_ai_stage("content_draft_updated", user_id=user_id, conversation_id=conversation.get("conversation_id"), draft_id=draft.get("draft_id"), intent=intent, channel=draft.get("channel"), character_count=len(body), option_count=len(options))
    return draft


def append_message(db, conversation_id: str, user_id: ObjectId, role: str, content: str, structured_data: dict | None = None) -> dict:
    now = now_utc()
    doc = {
        "message_id": make_id("AIM"),
        "conversation_id": conversation_id,
        "user_id": user_id,
        "role": role,
        "content": str(content or "")[:8000],
        "structured_data": structured_data if isinstance(structured_data, dict) else {},
        "created_at": now,
    }
    messages_collection(db).insert_one(doc)
    conversations_collection(db).update_one(
        {"conversation_id": conversation_id, "user_id": user_id},
        {"$set": {"updated_at": now, "last_message_at": now}},
    )
    return doc


def create_conversation(db, user_id: ObjectId, title: str = "New Conversation", selected_mode: str = "general_assistant") -> tuple[dict, dict]:
    now = now_utc()
    conversation = {
        "conversation_id": make_id("AIC"),
        "user_id": user_id,
        "title": clean_string(title or "New Conversation")[:120] or "New Conversation",
        "status": "active",
        "created_at": now,
        "updated_at": now,
        "last_message_at": now,
        "workflow_context": {
            "selected_mode": normalize_assistant_mode(selected_mode),
            "conversation_mode": "chat", "intent": "casual_chat",
            "status": "chatting", "requires_action": False,
            "missing_fields": [], "current_goal": None, "tone": None,
            "language": None, "send_requested": False,
            "state": "idle", "active_draft_id": None, "pending_action_id": None,
            "channel": None, "recipient_type": None, "recipient_emails": [], "recipient_phones": [],
            "contact_group_name": None, "subject": None, "sender": None,
            "last_question_type": None, "last_question_message_id": None, "updated_at": now,
        },
    }
    conversations_collection(db).insert_one(conversation)
    welcome = append_message(
        db,
        conversation["conversation_id"],
        user_id,
        "assistant",
        "Hi! I’m VireSend AI. I can help you write, improve, and send SMS or email campaigns. What would you like to do?",
        {
            "kind": "welcome",
            "quick_actions": [
                {"label": "Write an SMS", "prompt": "Help me write an SMS."},
                {"label": "Write an email", "prompt": "Help me write an email."},
                {"label": "View contact groups", "prompt": "Who are my contact groups?"},
                {"label": "Ask about VireSender", "prompt": "What can VireSender help me do?"},
            ],
        },
    )
    return conversation, welcome


def recent_history_for_ai(db, conversation_id: str) -> list[dict]:
    items = list(messages_collection(db).find({"conversation_id": conversation_id}).sort("created_at", -1).limit(MAX_HISTORY_MESSAGES))
    items.reverse()
    history = []
    for item in items:
        role = item.get("role")
        if role not in {"user", "assistant"}:
            continue
        history.append({"role": role, "content": item.get("content", "")[:1000]})
    return history


def extract_group_name(text: str) -> str | None:
    patterns = [
        r"(?:to|for)\s+(?:the\s+|my\s+)?([A-Za-z0-9][A-Za-z0-9 _-]{1,80}?)(?:\s+group\b|\s+contacts?\b|[.!?]|$)",
        r"([A-Za-z0-9][A-Za-z0-9 _-]{1,80}?)\s+group\b",
    ]
    for pattern in patterns:
        match = re.search(pattern, text, flags=re.IGNORECASE)
        if match:
            value = clean_string(match.group(1))
            if value:
                return value
    return None


def extract_message_clause(text: str) -> str | None:
    quoted = re.findall(r"[\"“](.+?)[\"”]", text)
    if quoted:
        return clean_string(quoted[0])[:1000]
    for marker in ("telling them", "saying that", "saying", "announcing that", "that"):
        lower = text.lower()
        index = lower.find(marker)
        if index >= 0:
            message = clean_string(text[index + len(marker):])
            if message:
                return message[:1000]
    return None


def extract_phone_candidates(text: str) -> list[str]:
    return [clean_string(match.group(0)) for match in PHONE_PATTERN.finditer(text or "")]


def format_phone_display(phone: str) -> str:
    digits = re.sub(r"\D", "", phone or "")
    if digits.startswith("233") and len(digits) == 12:
        local = f"0{digits[3:]}"
        return f"{local[:3]} {local[3:6]} {local[6:]}"
    if len(digits) == 10 and digits.startswith("0"):
        return f"{digits[:3]} {digits[3:6]} {digits[6:]}"
    return phone


def analyze_direct_phone_numbers(raw_numbers: list[str]) -> dict:
    valid_numbers = []
    valid_display_numbers = []
    invalid_numbers = []
    seen = set()
    duplicates = 0
    for raw in raw_numbers:
        cleaned = clean_string(raw)
        normalized = normalize_phone(cleaned)
        if not normalized:
            if cleaned and cleaned not in invalid_numbers:
                invalid_numbers.append(cleaned)
            continue
        if normalized in seen:
            duplicates += 1
            continue
        seen.add(normalized)
        valid_numbers.append(normalized)
        valid_display_numbers.append(format_phone_display(normalized))
    limit_exceeded = len(valid_numbers) > MAX_DIRECT_SMS_RECIPIENTS
    return {
        "valid_numbers": valid_numbers[:MAX_DIRECT_SMS_RECIPIENTS],
        "valid_display_numbers": valid_display_numbers[:MAX_DIRECT_SMS_RECIPIENTS],
        "invalid_numbers": invalid_numbers,
        "invalid_recipient_count": len(invalid_numbers),
        "duplicate_recipient_count": duplicates + max(0, len(valid_numbers) - MAX_DIRECT_SMS_RECIPIENTS),
        "recipient_limit_exceeded": limit_exceeded,
    }


def heuristic_intent(text: str) -> dict:
    lower = text.lower()
    channel = "sms" if any(key in lower for key in [" sms", "text message", "bulk sms"]) or lower.startswith("sms") else "email" if "email" in lower else None
    direct_numbers = analyze_direct_phone_numbers(extract_phone_candidates(text))
    has_direct_numbers = bool(direct_numbers["valid_numbers"] or direct_numbers["invalid_numbers"])
    if "campaign status" in lower or ("status" in lower and "campaign" in lower):
        return {
            "intent": "get_campaign_status",
            "channel": None,
            "contact_group_name": None,
            "recipient_type": "contact_group",
            "phone_numbers": [],
            "message_goal": None,
            "message": None,
            "sender_id": None,
            "subject": None,
            "email_account_id": None,
            "schedule": None,
            "requires_clarification": False,
            "clarification_question": None,
            "clarification_type": None,
            "confidence": 0.7,
        }
    if "rewrite" in lower:
        return {"intent": "rewrite_message", "channel": None, "contact_group_name": None, "recipient_type": "contact_group", "phone_numbers": [], "message_goal": None, "message": extract_message_clause(text), "sender_id": None, "subject": None, "email_account_id": None, "schedule": None, "requires_clarification": False, "clarification_question": None, "clarification_type": None, "confidence": 0.7}
    if "fix grammar" in lower or "grammar" in lower:
        return {"intent": "fix_grammar", "channel": None, "contact_group_name": None, "recipient_type": "contact_group", "phone_numbers": [], "message_goal": None, "message": extract_message_clause(text), "sender_id": None, "subject": None, "email_account_id": None, "schedule": None, "requires_clarification": False, "clarification_question": None, "clarification_type": None, "confidence": 0.7}
    if "translate" in lower:
        return {"intent": "translate_message", "channel": None, "contact_group_name": None, "recipient_type": "contact_group", "phone_numbers": [], "message_goal": None, "message": extract_message_clause(text), "sender_id": None, "subject": None, "email_account_id": None, "schedule": None, "requires_clarification": False, "clarification_question": None, "clarification_type": None, "confidence": 0.7}

    if any(word in lower for word in ["send", "create", "write", "prepare", "draft", "promotional", "promotion", "holiday", "christmas", "birthday", "wish", "greeting"]):
        group_name = extract_group_name(text)
        explicit_message = extract_message_clause(text)
        recipient_type = "mixed" if group_name and has_direct_numbers else "direct_phone_numbers" if has_direct_numbers else "contact_group"
        if group_name and has_direct_numbers:
            return {
                "intent": "preview_sms_campaign",
                "channel": "sms",
                "contact_group_name": group_name,
                "recipient_type": recipient_type,
                "phone_numbers": direct_numbers["valid_numbers"] + direct_numbers["invalid_numbers"],
                "message_goal": explicit_message or clean_string(text)[:160],
                "message": explicit_message,
                "sender_id": None,
                "subject": None,
                "email_account_id": None,
                "schedule": None,
                "requires_clarification": True,
                "clarification_question": "Should I send this to both the contact group and the direct phone number?",
                "clarification_type": "recipient_scope",
                "confidence": 0.8,
            }
        if not channel and "message" in lower:
            return {
                "intent": "general_help",
                "channel": None,
                "contact_group_name": group_name,
                "recipient_type": recipient_type,
                "phone_numbers": direct_numbers["valid_numbers"] + direct_numbers["invalid_numbers"],
                "message_goal": explicit_message or clean_string(text)[:160],
                "message": explicit_message,
                "sender_id": None,
                "subject": None,
                "email_account_id": None,
                "schedule": None,
                "requires_clarification": True,
                "clarification_question": "Do you want to send this as SMS or email?",
                "clarification_type": "channel",
                "confidence": 0.75,
            }
        if has_direct_numbers and channel != "email":
            channel = "sms"
        intent = "preview_direct_sms" if has_direct_numbers and channel == "sms" else "preview_sms_campaign" if channel == "sms" else "preview_email_campaign" if channel == "email" else "unknown"
        return {
            "intent": intent,
            "channel": channel,
            "contact_group_name": group_name,
            "recipient_type": recipient_type,
            "phone_numbers": direct_numbers["valid_numbers"] + direct_numbers["invalid_numbers"],
            "message_goal": explicit_message or clean_string(text)[:160],
            "message": explicit_message,
            "sender_id": None,
            "subject": None,
            "email_account_id": None,
            "schedule": None,
            "requires_clarification": (channel == "sms" and recipient_type == "contact_group" and not bool(group_name)) or not bool(channel),
            "clarification_question": None if channel and (group_name or recipient_type != "contact_group") else "Tell me which contact group you want to use." if channel else "Do you want to send this as SMS or email?",
            "clarification_type": "recipient" if channel and recipient_type == "contact_group" and not group_name else "channel" if not channel else None,
            "confidence": 0.78 if channel else 0.55,
        }
    return {
        "intent": "general_help",
        "channel": None,
        "contact_group_name": None,
        "recipient_type": "contact_group",
        "phone_numbers": [],
        "message_goal": None,
        "message": None,
        "sender_id": None,
        "subject": None,
        "email_account_id": None,
        "schedule": None,
        "requires_clarification": False,
        "clarification_question": None,
        "clarification_type": None,
        "confidence": 0.5,
    }


def parse_intent(db, conversation_id: str, text: str, user_id=None) -> dict:
    fallback = heuristic_intent(text)
    query = {"conversation_id": conversation_id}
    if user_id is not None:
        query["user_id"] = user_id
    conversation = conversations_collection(db).find_one(query) or {}
    workflow = safe_workflow_context(conversation)
    if not deepseek_available():
        return apply_selected_mode(fallback, workflow.get("selected_mode"))
    active_draft = safe_content_draft(conversation.get("current_draft"))
    history = recent_history_for_ai(db, conversation_id)
    messages = [
        {
            "role": "system",
            "content": (
                "You are VireSend's controlled intent parser. "
                "Return exactly one valid JSON object and no markdown or prose. Never suggest unsupported actions. "
                "Supported intents: general_help, compose_sms, compose_email, rewrite_message, fix_grammar, "
                "translate_message, find_contact_group, preview_sms_campaign, preview_email_campaign, preview_direct_sms, "
                "send_sms_campaign, send_email_campaign, send_direct_sms, schedule_sms_campaign, schedule_email_campaign, schedule_direct_sms, "
                "get_campaign_status, cancel_draft, unknown. "
                "Do not include credentials or unsupported tool names. "
                "Treat the conversation as continuous. A short reply normally answers the last assistant question. "
                "The selected_mode is trusted application state and has priority over message wording and history. Never reinterpret direct as a group name. "
                "Use the supplied workflow state, known channel, recipients, and active draft. Do not discard known fields or restart an active workflow. "
                "An email address implies email and a phone number implies SMS when unambiguous. References such as this, it, or that message refer to the active draft. "
                "Use null for unknown fields."
            ),
        }
    ]
    messages.extend(history)
    messages.append(
        {
            "role": "user",
            "content": (
                f"Workflow state: {workflow}\nActive draft: {active_draft or 'none'}\nInstruction: {text}\n"
                "Return JSON with keys: intent, channel, contact_group_name, recipient_type, phone_numbers, message_goal, message, sender_id, subject, email_account_id, schedule, requires_clarification, clarification_question, clarification_type, confidence."
            ),
        }
    )
    try:
        parsed = chat_json(messages, temperature=0.05, max_tokens=600)
    except Exception:
        return apply_selected_mode(fallback, workflow.get("selected_mode"))
    intent = clean_string(parsed.get("intent", "unknown")).lower()
    if intent not in ASSISTANT_INTENTS:
        return apply_selected_mode(fallback, workflow.get("selected_mode"))
    result = {
        "intent": intent,
        "channel": clean_string(parsed.get("channel", "")).lower() or None,
        "contact_group_name": clean_string(parsed.get("contact_group_name", "")) or fallback.get("contact_group_name"),
        "recipient_type": clean_string(parsed.get("recipient_type", "")).lower() or fallback.get("recipient_type") or "contact_group",
        "phone_numbers": [clean_string(item) for item in (parsed.get("phone_numbers") or fallback.get("phone_numbers") or []) if clean_string(item)],
        "message_goal": clean_string(parsed.get("message_goal", "")) or fallback.get("message_goal"),
        "message": clean_string(parsed.get("message", "")) or fallback.get("message"),
        "sender_id": clean_string(parsed.get("sender_id", "")) or None,
        "subject": clean_string(parsed.get("subject", "")) or None,
        "email_account_id": clean_string(parsed.get("email_account_id", "")) or None,
        "schedule": parsed.get("schedule"),
        "requires_clarification": bool(parsed.get("requires_clarification")),
        "clarification_question": clean_string(parsed.get("clarification_question", "")) or fallback.get("clarification_question"),
        "clarification_type": clean_string(parsed.get("clarification_type", "")) or fallback.get("clarification_type"),
        "confidence": float(parsed.get("confidence", fallback.get("confidence", 0.5)) or 0.5),
    }
    return apply_selected_mode(result, workflow.get("selected_mode"))


def conversational_reply(db, conversation_id: str, text: str) -> str:
    """Answer discussion naturally; account-specific facts remain tool-controlled."""
    normalized = clean_string(text).casefold()
    if normalized in {"hi", "hello", "hey", "good morning", "good afternoon", "good evening"}:
        return "Hi! What would you like to work on today?"
    if not deepseek_available():
        if "what can you do" in normalized:
            return "I can help you plan campaigns, draft or rewrite SMS and email content, compare channels, find your contact groups, and prepare a campaign for your confirmation."
        if any(word in normalized for word in {"promote", "promotion", "business", "shop", "campaign"}):
            return "I’d be happy to help. What are you promoting, and who would you like to reach?"
        return "Tell me what you’re working on. We can brainstorm, write or improve a message, discuss SMS versus email, or gradually prepare a campaign."

    conversation = conversations_collection(db).find_one({"conversation_id": conversation_id}) or {}
    workflow = safe_workflow_context(conversation)
    active_draft = safe_content_draft(conversation.get("current_draft"))
    prompt = (
        "You are VireSend AI, a friendly and intelligent assistant inside the VireSender platform. Treat every conversation as continuous. "
        "Chat naturally, answer questions about VireSender, brainstorm campaigns, write and edit SMS and email, and suggest message variations. "
        "Ask at most one useful follow-up question. Do not force the user to choose SMS or email immediately. "
        "Only begin recipient collection when the user clearly asks to send. Never interpret drafting as sending and never claim an action was performed. "
        "Never invent contact groups, phone numbers, email addresses, sender IDs, or account data. The latest user instruction has priority. "
        "When unsure whether the user wants to send or only draft, ask: 'Would you like me to keep editing this, or prepare it for sending?' "
        "Never send without explicit confirmation. "
        "A short reply usually answers the latest assistant question. Use the current workflow state, active draft, known recipients, channel, and pending action. "
        "Never discard known information, ask for information already supplied, or return a welcome-style reset during an active workflow. "
        "An email address implies email and a phone number implies SMS when unambiguous. Resolve this, it, and that message to the active draft. "
        "Never claim to know account-specific groups, recipients, balances, sender IDs, accounts, costs, or campaign IDs. "
        "Never claim anything was sent. Paid actions require a server-generated preview and explicit confirmation. "
        "Treat 'this looks good' and similar discussion as feedback, not approval. Keep answers concise and natural."
    )
    messages = [{"role": "system", "content": prompt}]
    messages.extend(recent_history_for_ai(db, conversation_id)[-8:])
    messages.append({"role": "user", "content": f"Server workflow state: {workflow}\nActive draft: {active_draft or 'none'}\nCurrent message: {text}"})
    try:
        return clean_string(chat_completion(messages, temperature=0.45, max_tokens=450))[:4000] or "What would you like to work on next?"
    except Exception:
        logger.exception("ai_stage=conversation_provider_failed conversation_id=%s", conversation_id)
        return "The AI service is temporarily unavailable. We can try again, or you can tell me the campaign details directly."


def generate_sms_message(goal: str, user_text: str, group_name: str) -> str:
    extracted = extract_message_clause(user_text)
    if extracted:
        return extracted
    if deepseek_available():
        try:
            parsed = chat_json(
                [
                    {
                        "role": "system",
                        "content": (
                            "You write concise SMS campaign drafts for VireSend. "
                            "Return only JSON with one key: message. "
                            "Keep the message short, safe, and plain text."
                        ),
                    },
                    {
                        "role": "user",
                        "content": f"Audience group: {group_name}\nGoal: {goal or user_text}\nReturn JSON.",
                    },
                ],
                temperature=0.4,
                max_tokens=200,
            )
            message = clean_string(parsed.get("message", ""))
            if message:
                return message[:640]
        except Exception:
            pass
    goal_text = clean_string(goal or user_text)[:180]
    if not goal_text:
        return "Hello, this is a message from VireSend."
    if goal_text.lower().startswith("send"):
        goal_text = re.sub(r"^send\s+(?:an?\s+)?(?:sms|message)\s+", "", goal_text, flags=re.IGNORECASE)
    return goal_text.rstrip(".") + "."


def generate_email_content(goal: str, user_text: str, group_name: str) -> tuple[str, str]:
    extracted = extract_message_clause(user_text)
    if deepseek_available():
        try:
            parsed = chat_json(
                [
                    {
                        "role": "system",
                        "content": (
                            "You write professional email campaign drafts for VireSend. "
                            "Return only JSON with keys: subject, message. "
                            "Keep the content safe and without markdown."
                        ),
                    },
                    {
                        "role": "user",
                        "content": f"Audience group: {group_name}\nGoal: {goal or user_text}\nReturn JSON.",
                    },
                ],
                temperature=0.35,
                max_tokens=450,
            )
            subject = clean_string(parsed.get("subject", ""))[:180]
            message = str(parsed.get("message", "")).strip()[:6000]
            if subject and message:
                return subject, sanitize_html(message)
        except Exception:
            pass
    base = clean_string(goal or user_text)[:180] or "Message from VireSend"
    subject = base[:80].rstrip(".")
    if extracted:
        body = extracted
    else:
        body = f"Hello,\n\n{base.rstrip('.') }.\n\nThank you."
    return subject or "Message from VireSend", sanitize_html(body)


def list_available_sender_ids(db, user_id: ObjectId, settings: dict) -> list[str]:
    if settings.get("active_sms_provider") == "moolre":
        return approved_sender_ids_for_user(user_id)
    items = db.sms_sender_ids.find({"user_id": user_id, "provider": {"$ne": "moolre"}}).sort("updated_at", -1).limit(10)
    sender_ids = []
    for item in items:
        sender = clean_string(item.get("sender_id", ""))
        if sender and sender not in sender_ids:
            sender_ids.append(sender)
    return sender_ids


def analyze_sms_recipients(contacts: list[dict]) -> dict:
    seen = set()
    valid_numbers = []
    invalid = 0
    duplicates = 0
    contexts = {}
    for contact in contacts:
        phone = normalize_phone(contact.get("normalized_phone") or contact.get("phone", ""))
        if not phone:
            invalid += 1
            continue
        if phone in seen:
            duplicates += 1
            continue
        seen.add(phone)
        valid_numbers.append(phone)
        contexts[phone] = contact
    return {
        "valid_numbers": valid_numbers,
        "invalid_recipient_count": invalid,
        "duplicate_recipient_count": duplicates,
        "context_by_phone": contexts,
    }


def analyze_email_recipients(user_id: ObjectId, group_name: str = "", direct_emails: list[str] | None = None) -> dict:
    records, summary = build_recipients(user_id, {"group": group_name, "recipients": direct_emails or []})
    valid = []
    invalid = 0
    seen = set()
    for record in records:
        email = clean_string(record.get("email", "")).lower()
        if not is_valid_email(email):
            invalid += 1
            continue
        if email in seen:
            continue
        seen.add(email)
        valid.append(record)
    return {
        "recipient_records": valid,
        "valid_recipient_count": len(valid),
        "invalid_recipient_count": invalid,
        "duplicate_recipient_count": int(summary.get("duplicates_removed", 0) or 0),
    }


def message_encoding_type(message: str) -> str:
    return "unicode" if any(ord(char) > 127 for char in (message or "")) else "gsm7"


def create_confirmation_token(draft: dict, preview_signature: str) -> tuple[str, dict]:
    token = secrets.token_urlsafe(24)
    version = int(draft.get("confirmation_version", 0) or 0) + 1
    now = now_utc()
    updates = {
        "confirmation_token_hash": hash_token(token),
        "confirmation_version": version,
        "confirmation_preview_signature": preview_signature,
        "confirmation_token_expires_at": now + timedelta(minutes=20),
        "updated_at": now,
    }
    return token, updates


def build_preview_signature(draft_like: dict) -> str:
    payload = "|".join(
        [
            str(draft_like.get("channel") or ""),
            str(draft_like.get("recipient_type") or ""),
            str(draft_like.get("contact_group_name") or ""),
            ",".join(draft_like.get("direct_phone_numbers") or []),
            str(draft_like.get("message") or ""),
            str(draft_like.get("subject") or ""),
            str(draft_like.get("sender_id") or ""),
            str(draft_like.get("email_account_id") or ""),
            str(draft_like.get("valid_recipient_count") or 0),
            str(draft_like.get("estimated_cost") or 0),
        ]
    )
    return sign_signature(payload)


def upsert_audit_log(db, draft: dict, **updates):
    now = now_utc()
    base = {
        "user_id": draft.get("user_id"),
        "conversation_id": draft.get("conversation_id"),
        "draft_id": draft.get("draft_id"),
        "campaign_id": draft.get("campaign_id"),
        "channel": draft.get("channel"),
        "contact_group_name": draft.get("contact_group_name"),
        "recipient_count": int(draft.get("valid_recipient_count", 0) or 0),
        "confirmation_required": True,
        "created_at": now,
        "updated_at": now,
    }
    base.update(updates)
    audit_logs_collection(db).insert_one(base)


def build_group_choice_message(query: str, result: dict) -> tuple[str, dict]:
    if result["status"] == "likely":
        group = result["group"]
        return (
            f"I found a group named {group['name']} with {group['count']} contacts. Is this the group you mean?",
            {
                "kind": "clarification",
                "clarification_type": "contact_group_confirmation",
                "options": [
                    {"label": f"Yes, use {group['name']}", "value": group["name"], "action": "select_group"},
                    {"label": "Choose another group", "value": "__choose__", "action": "choose_group"},
                    {"label": "Cancel", "value": "__cancel__", "action": "cancel_draft"},
                ],
                "query": query,
            },
        )
    if result["status"] == "multiple":
        options = [{"label": f"{item['name']} - {item['count']} contacts", "value": item["name"], "action": "select_group"} for item in result["options"]]
        options.append({"label": "Cancel", "value": "__cancel__", "action": "cancel_draft"})
        return (
            "I found more than one matching group. Please select the one you want to use.",
            {"kind": "clarification", "clarification_type": "contact_group_selection", "options": options, "query": query},
        )
    return (
        f"I could not find a contact group named {query}.",
        {
            "kind": "error",
            "title": "Contact Group Not Found",
            "message": f"I could not find a contact group named {query}.",
            "error_code": "CONTACT_GROUP_NOT_FOUND",
            "links": [
                {"label": "View Contact Groups", "url": "/user/contacts"},
                {"label": "Create Contact Group", "url": "/user/contacts"},
            ],
        },
    )


def build_sms_preview_message(draft: dict, sender_options: list[str], raw_token: str | None) -> tuple[str, dict]:
    preview = draft.get("preview") or {}
    if preview.get("valid_recipient_count", 0) <= 0 and draft.get("contact_group_name"):
        message = f"The {draft.get('contact_group_name')} group exists but has no SMS-capable contacts."
        return message, {"kind": "error", "title": "No SMS Recipients", "message": message, "error_code": "EMPTY_SMS_GROUP", "draft_id": draft.get("draft_id"), "preview": preview}
    if draft.get("status") == "awaiting_clarification" and not draft.get("sender_id"):
        return (
            "",
            {
                "kind": "sender_selection",
                "draft_id": draft.get("draft_id"),
                "options": [{"label": item, "value": item, "action": "select_sender_id"} for item in sender_options],
                "preview": preview,
            },
        )
    data = {
        "kind": "preview_sms",
        "draft_id": draft.get("draft_id"),
        "confirmation_token": raw_token,
        "preview": preview,
        "can_confirm": bool(raw_token),
        "links": [
            {"label": "Manage Sender IDs", "url": "/user/sender-ids"},
            {"label": "Top Up Wallet", "url": "/user/wallet"},
        ],
    }
    return "", data


def build_email_preview_message(draft: dict, account_options: list[dict], raw_token: str | None) -> tuple[str, dict]:
    preview = draft.get("preview") or {}
    if preview.get("valid_recipient_count", 0) <= 0 and draft.get("contact_group_name"):
        message = f"The {draft.get('contact_group_name')} group exists but has no email-capable contacts."
        return message, {"kind": "error", "title": "No Email Recipients", "message": message, "error_code": "EMPTY_EMAIL_GROUP", "draft_id": draft.get("draft_id"), "preview": preview}
    if draft.get("status") == "awaiting_clarification" and not draft.get("email_account_id"):
        return (
            "",
            {
                "kind": "email_account_selection",
                "draft_id": draft.get("draft_id"),
                "options": [{"label": item.get("email_address"), "value": item.get("account_id"), "action": "select_email_account"} for item in account_options],
                "preview": preview,
            },
        )
    return (
        "",
        {
            "kind": "preview_email",
            "draft_id": draft.get("draft_id"),
            "confirmation_token": raw_token,
            "preview": preview,
            "can_confirm": bool(raw_token),
            "links": [
                {"label": "Email Accounts", "url": "/user/email-accounts"},
                {"label": "Top Up Wallet", "url": "/user/wallet"},
            ],
        },
    )


def prepare_sms_draft(db, user: dict, draft: dict) -> tuple[dict, str | None, tuple[str, dict]]:
    recipient_type = draft.get("recipient_type") or "contact_group"
    contacts = get_group_contacts(user["_id"], draft.get("contact_group_name", "")) if recipient_type in {"contact_group", "mixed"} else []
    group_recipient_data = analyze_sms_recipients(contacts)
    direct_recipient_data = analyze_direct_phone_numbers(draft.get("direct_phone_numbers") or [])
    direct_contexts = get_contacts_by_phones(user["_id"], direct_recipient_data["valid_numbers"])
    valid_numbers = list(group_recipient_data["valid_numbers"])
    contexts = dict(group_recipient_data["context_by_phone"])
    overlap_duplicates = 0
    if recipient_type in {"direct_phone_numbers", "mixed"}:
        if recipient_type == "direct_phone_numbers":
            valid_numbers = []
            contexts = {}
        for phone in direct_recipient_data["valid_numbers"]:
            if phone in valid_numbers:
                overlap_duplicates += 1
                continue
            valid_numbers.append(phone)
            contexts[phone] = direct_contexts.get(phone) or {"phone": phone}
    recipient_data = {
        "valid_numbers": valid_numbers,
        "context_by_phone": contexts,
        "invalid_recipient_count": group_recipient_data["invalid_recipient_count"] + direct_recipient_data["invalid_recipient_count"],
        "duplicate_recipient_count": group_recipient_data["duplicate_recipient_count"] + direct_recipient_data["duplicate_recipient_count"] + overlap_duplicates,
    }
    sender_settings = get_sms_settings()
    sender_options = list_available_sender_ids(db, user["_id"], sender_settings)
    sender_id = draft.get("sender_id") or (sender_options[0] if len(sender_options) == 1 else None)
    message = clean_string(draft.get("message", "")) or generate_sms_message(draft.get("message_goal", ""), draft.get("user_instruction", ""), draft.get("contact_group_name", ""))
    active_provider = sender_settings.get("active_sms_provider", "arkesel")
    display_numbers = [format_phone_display(phone) for phone in direct_recipient_data["valid_numbers"]]
    preview = {
        "channel": "sms",
        "recipient_type": recipient_type,
        "recipient_source": "direct_numbers" if recipient_type == "direct_phone_numbers" else "mixed" if recipient_type == "mixed" else "contact_group",
        "contact_group_name": draft.get("contact_group_name"),
        "direct_phone_numbers": display_numbers,
        "recipient_phone": display_numbers[0] if len(display_numbers) == 1 else None,
        "valid_recipient_count": len(recipient_data["valid_numbers"]),
        "invalid_recipient_count": recipient_data["invalid_recipient_count"],
        "duplicate_recipient_count": recipient_data["duplicate_recipient_count"],
        "sender_id": sender_id,
        "message": message,
        "character_count": len(message),
        "encoding": message_encoding_type(message),
        "segments_per_recipient": sms_parts(message),
        "invalid_phone_numbers": direct_recipient_data["invalid_numbers"],
        "direct_recipient_limit_exceeded": direct_recipient_data["recipient_limit_exceeded"],
    }
    update = {
        "message": message,
        "sender_id": sender_id,
        "recipient_type": recipient_type,
        "direct_phone_numbers": direct_recipient_data["valid_numbers"],
        "direct_phone_display_numbers": display_numbers,
        "invalid_phone_numbers": direct_recipient_data["invalid_numbers"],
        "valid_recipient_count": preview["valid_recipient_count"],
        "invalid_recipient_count": preview["invalid_recipient_count"],
        "duplicate_recipient_count": preview["duplicate_recipient_count"],
        "sms_segments_per_recipient": preview["segments_per_recipient"],
        "active_sms_provider": active_provider,
        "wallet_balance_snapshot": sms_credit_balance(db, user["_id"]),
        "updated_at": now_utc(),
    }
    raw_token = None
    if not sender_options:
        update["status"] = "awaiting_clarification"
        preview["warning"] = "You need an approved Sender ID before sending SMS."
        update["preview"] = preview
        draft = drafts_collection(db).find_one_and_update({"draft_id": draft["draft_id"], "user_id": user["_id"]}, {"$set": update}, return_document=ReturnDocument.AFTER)
        return draft, None, (
            "",
            {
                "kind": "error",
                "title": "Email Account Required",
                "message": "Connect an email account before sending this campaign.",
                "error_code": "EMAIL_ACCOUNT_REQUIRED",
                "title": "No Approved Sender ID",
                "message": "You need an approved Sender ID before sending SMS.",
                "draft_id": draft.get("draft_id"),
                "preview": preview,
                "links": [
                    {"label": "Manage Sender IDs", "url": "/user/sender-ids"},
                    {"label": "Cancel", "url": ""},
                ],
            },
        )
    if sender_id and active_provider == "moolre":
        try:
            enforce_approved_moolre_sender_id(user["_id"], sender_id)
        except SenderIdError as exc:
            update["status"] = "awaiting_clarification"
            preview["warning"] = exc.message
            update["preview"] = preview
            draft = drafts_collection(db).find_one_and_update({"draft_id": draft["draft_id"], "user_id": user["_id"]}, {"$set": update}, return_document=ReturnDocument.AFTER)
            return draft, None, (
                "",
                {
                    "kind": "error",
                    "title": "No Approved Sender ID",
                    "message": exc.message,
                    "draft_id": draft.get("draft_id"),
                    "preview": preview,
                    "links": [{"label": "Manage Sender IDs", "url": "/user/sender-ids"}],
                },
            )
    if direct_recipient_data["recipient_limit_exceeded"]:
        update["status"] = "failed"
        preview["warning"] = f"Direct SMS through VireSend AI is limited to {MAX_DIRECT_SMS_RECIPIENTS} phone numbers per request."
        update["preview"] = preview
        draft = drafts_collection(db).find_one_and_update({"draft_id": draft["draft_id"], "user_id": user["_id"]}, {"$set": update}, return_document=ReturnDocument.AFTER)
        return draft, None, (
            "",
            {
                "kind": "error",
                "title": "Too Many Direct Numbers",
                "message": preview["warning"],
                "draft_id": draft.get("draft_id"),
                "preview": preview,
                "links": [{"label": "Use Contact Groups", "url": "/user/contacts"}],
            },
        )
    if preview["valid_recipient_count"] <= 0:
        update["status"] = "failed"
        update["preview"] = preview
        draft = drafts_collection(db).find_one_and_update({"draft_id": draft["draft_id"], "user_id": user["_id"]}, {"$set": update}, return_document=ReturnDocument.AFTER)
        return draft, None, (
            "",
            {
                "kind": "error",
                "title": "Invalid Phone Number",
                "message": "That phone number does not appear to be valid. Please check it and try again.",
                "draft_id": draft.get("draft_id"),
                "preview": preview,
            },
        )
    try:
        cost = cost_preview(preview["valid_recipient_count"], message, sender_settings, recipient_data["valid_numbers"])
    except Exception as exc:
        update["status"] = "failed"
        preview["warning"] = getattr(exc, "message", "SMS sending to this destination is currently unavailable.")
        update["preview"] = preview
        draft = drafts_collection(db).find_one_and_update({"draft_id": draft["draft_id"], "user_id": user["_id"]}, {"$set": update}, return_document=ReturnDocument.AFTER)
        return draft, None, ("", {"kind": "error", "title": "Destination Unavailable", "message": preview["warning"], "draft_id": draft.get("draft_id"), "preview": preview})
    preview["cost_preview"] = cost
    preview["estimated_cost"] = cost["sms_units"]
    preview["sms_balance"] = update["wallet_balance_snapshot"]
    preview["total_billable_segments"] = cost["sms_units"]
    preview["expected_balance"] = update["wallet_balance_snapshot"] - cost["sms_units"]
    update["estimated_cost"] = cost["sms_units"]
    update["total_billable_segments"] = cost["sms_units"]
    update["preview"] = preview
    can_confirm = bool(sender_id and preview["valid_recipient_count"] > 0 and update["wallet_balance_snapshot"] >= cost["sms_units"])
    if not sender_id and len(sender_options) > 1:
        update["status"] = "awaiting_clarification"
    elif update["wallet_balance_snapshot"] < cost["sms_units"]:
        update["status"] = "awaiting_clarification"
        preview["warning"] = f"This campaign needs {cost['sms_units']} SMS credits, but your SMS balance is {update['wallet_balance_snapshot']}."
    else:
        update["status"] = "awaiting_confirmation"
    signature = build_preview_signature({**draft, **update})
    if can_confirm:
        raw_token, confirmation = create_confirmation_token(draft, signature)
        update.update(confirmation)
    else:
        update["confirmation_token_hash"] = None
        update["confirmation_preview_signature"] = None
        update["confirmation_token_expires_at"] = None
    draft = drafts_collection(db).find_one_and_update({"draft_id": draft["draft_id"], "user_id": user["_id"]}, {"$set": update}, return_document=ReturnDocument.AFTER)
    return draft, raw_token, build_sms_preview_message(draft, sender_options, raw_token)


def prepare_email_draft(db, user: dict, draft: dict) -> tuple[dict, str | None, tuple[str, dict]]:
    accounts = list(email_accounts().find({"user_id": user["_id"], "status": "connected"}).sort("created_at", -1))
    subject = clean_string(draft.get("subject", ""))[:180]
    message = str(draft.get("message") or "")
    if not subject or not clean_string(re.sub(r"<[^>]+>", " ", message)):
        subject, message = generate_email_content(draft.get("message_goal", ""), draft.get("user_instruction", ""), draft.get("contact_group_name", ""))
    email_account_id = draft.get("email_account_id") or (accounts[0].get("account_id") if len(accounts) == 1 else None)
    recipient_data = analyze_email_recipients(user["_id"], draft.get("contact_group_name", ""), draft.get("direct_email_addresses") or [])
    preview = {
        "channel": "email",
        "contact_group_name": draft.get("contact_group_name"),
        "recipient_type": draft.get("recipient_type") or ("individual" if draft.get("direct_email_addresses") else "contact_group"),
        "recipient_emails": draft.get("direct_email_addresses") or [],
        "valid_recipient_count": recipient_data["valid_recipient_count"],
        "invalid_recipient_count": recipient_data["invalid_recipient_count"],
        "duplicate_recipient_count": recipient_data["duplicate_recipient_count"],
        "subject": subject,
        "message": sanitize_html(message),
        "attachments": [],
    }
    update = {
        "subject": subject,
        "message": sanitize_html(message),
        "email_account_id": email_account_id,
        "valid_recipient_count": recipient_data["valid_recipient_count"],
        "invalid_recipient_count": recipient_data["invalid_recipient_count"],
        "duplicate_recipient_count": recipient_data["duplicate_recipient_count"],
        "wallet_balance_snapshot": round(float(user.get("wallet_balance") or 0), 4),
        "updated_at": now_utc(),
    }
    if not accounts:
        update["status"] = "awaiting_clarification"
        preview["warning"] = "Connect an email account before sending this campaign."
        update["preview"] = preview
        draft = drafts_collection(db).find_one_and_update({"draft_id": draft["draft_id"], "user_id": user["_id"]}, {"$set": update}, return_document=ReturnDocument.AFTER)
        return draft, None, (
            "Connect an email account before sending this campaign.",
            {
                "kind": "error",
                "draft_id": draft.get("draft_id"),
                "preview": preview,
                "links": [{"label": "Email Accounts", "url": "/user/email-accounts"}],
            },
        )
    if email_account_id:
        account = account_for_user(user["_id"], email_account_id)
        if not account:
            update["status"] = "awaiting_clarification"
            update["preview"] = preview
            draft = drafts_collection(db).find_one_and_update({"draft_id": draft["draft_id"], "user_id": user["_id"]}, {"$set": update}, return_document=ReturnDocument.AFTER)
            return draft, None, ("Choose a valid connected email account.", {"kind": "error", "title": "Email Account Unavailable", "message": "Choose a valid connected email account.", "error_code": "EMAIL_ACCOUNT_INVALID", "draft_id": draft.get("draft_id"), "preview": preview})
        if account.get("provider") == "gmail" and not refresh_gmail_token(account):
            update["status"] = "awaiting_clarification"
            preview["warning"] = "Your Gmail connection has expired. Reconnect the account before sending this campaign."
            update["preview"] = preview
            draft = drafts_collection(db).find_one_and_update({"draft_id": draft["draft_id"], "user_id": user["_id"]}, {"$set": update}, return_document=ReturnDocument.AFTER)
            return draft, None, (
                preview["warning"],
                {
                    "kind": "error",
                    "title": "Email Connection Expired",
                    "message": preview["warning"],
                    "error_code": "EMAIL_ACCOUNT_EXPIRED",
                    "draft_id": draft.get("draft_id"),
                    "preview": preview,
                    "links": [
                        {"label": "Reconnect Gmail", "url": "/user/email-accounts"},
                        {"label": "Choose Another Account", "url": "/user/email-accounts"},
                    ],
                },
            )
        preview["sending_account_email"] = account.get("email_address")
    cost = email_cost(preview["valid_recipient_count"])
    preview["estimated_cost"] = cost["total_cost"]
    preview["wallet_balance"] = update["wallet_balance_snapshot"]
    update["estimated_cost"] = cost["total_cost"]
    update["preview"] = preview
    can_confirm = bool(email_account_id and preview["valid_recipient_count"] > 0 and update["wallet_balance_snapshot"] >= cost["total_cost"])
    if not email_account_id and len(accounts) > 1:
        update["status"] = "awaiting_clarification"
    elif preview["valid_recipient_count"] <= 0:
        update["status"] = "failed"
    elif update["wallet_balance_snapshot"] < cost["total_cost"]:
        update["status"] = "awaiting_clarification"
        preview["warning"] = f"Your estimated campaign cost is GHS {cost['total_cost']:.4f}, but your wallet balance is GHS {update['wallet_balance_snapshot']:.4f}."
    else:
        update["status"] = "awaiting_confirmation"
    signature = build_preview_signature({**draft, **update})
    raw_token = None
    if can_confirm:
        raw_token, confirmation = create_confirmation_token(draft, signature)
        update.update(confirmation)
    else:
        update["confirmation_token_hash"] = None
        update["confirmation_preview_signature"] = None
        update["confirmation_token_expires_at"] = None
    draft = drafts_collection(db).find_one_and_update({"draft_id": draft["draft_id"], "user_id": user["_id"]}, {"$set": update}, return_document=ReturnDocument.AFTER)
    return draft, raw_token, build_email_preview_message(draft, accounts, raw_token)


def prepare_draft(db, user: dict, draft: dict) -> tuple[dict, str | None, tuple[str, dict]]:
    log_ai_stage("campaign_preparation_started", user_id=user.get("_id"), conversation_id=draft.get("conversation_id"), draft_id=draft.get("draft_id"), channel=draft.get("channel"))
    if draft.get("channel") == "sms":
        result = prepare_sms_draft(db, user, draft)
    else:
        result = prepare_email_draft(db, user, draft)
    prepared = result[0]
    log_ai_stage("confirmation_preview_prepared", user_id=user.get("_id"), conversation_id=draft.get("conversation_id"), draft_id=draft.get("draft_id"), channel=prepared.get("channel"), recipient_count=prepared.get("valid_recipient_count"), estimated_cost=prepared.get("estimated_cost"), wallet_sufficient=(float(prepared.get("wallet_balance_snapshot") or 0) >= float(prepared.get("estimated_cost") or 0)), status=prepared.get("status"))
    return result


def create_draft(db, user: dict, conversation_id: str, parsed: dict) -> dict:
    now = now_utc()
    direct = analyze_direct_phone_numbers(parsed.get("phone_numbers") or [])
    draft = {
        "draft_id": make_id("AID"),
        "user_id": user["_id"],
        "conversation_id": conversation_id,
        "channel": parsed.get("channel"),
        "contact_group_name": None,
        "contact_group_query": parsed.get("contact_group_name"),
        "recipient_type": parsed.get("recipient_type") or "contact_group",
        "direct_phone_numbers": direct["valid_numbers"],
        "direct_phone_display_numbers": direct["valid_display_numbers"],
        "direct_email_addresses": [email for email in (parsed.get("recipient_emails") or []) if is_valid_email(email)],
        "invalid_phone_numbers": direct["invalid_numbers"],
        "direct_recipient_limit_exceeded": direct["recipient_limit_exceeded"],
        "message_goal": parsed.get("message_goal"),
        "user_instruction": parsed.get("raw_instruction"),
        "message": parsed.get("message"),
        "subject": parsed.get("subject"),
        "sender_id": parsed.get("sender_id"),
        "email_account_id": parsed.get("email_account_id"),
        "valid_recipient_count": 0,
        "invalid_recipient_count": 0,
        "duplicate_recipient_count": 0,
        "sms_segments_per_recipient": None,
        "total_billable_segments": None,
        "estimated_cost": None,
        "wallet_balance_snapshot": round(float(user.get("wallet_balance") or 0), 4),
        "status": "draft",
        "confirmation_token_hash": None,
        "confirmation_preview_signature": None,
        "confirmation_version": 0,
        "campaign_id": None,
        "campaign_channel": parsed.get("channel"),
        "preview": {},
        "created_at": now,
        "updated_at": now,
        "expires_at": now + timedelta(hours=DRAFT_EXPIRY_HOURS),
    }
    drafts_collection(db).insert_one(draft)
    conversation = conversations_collection(db).find_one({"conversation_id": conversation_id, "user_id": user["_id"]}) or {"conversation_id": conversation_id}
    update_workflow_context(
        db, conversation, user["_id"], state="preparing_preview", pending_action_id=draft["draft_id"],
        channel=draft.get("channel"), recipient_type=draft.get("recipient_type"),
        recipient_emails=draft.get("direct_email_addresses") or [], recipient_phones=draft.get("direct_phone_numbers") or [],
        contact_group_name=draft.get("contact_group_query"), subject=draft.get("subject"),
    )
    return draft


def list_recent_campaigns_for_status(db, user_id: ObjectId) -> list[dict]:
    sms_items = list(sms_campaigns_collection().find({"user_id": user_id}).sort("created_at", -1).limit(3))
    email_items = list(email_campaigns().find({"user_id": user_id}).sort("created_at", -1).limit(3))
    recent = []
    for item in sms_items:
        recent.append({
            "id": str(item.get("_id")),
            "channel": "sms",
            "name": item.get("name") or item.get("campaign_name"),
            "status": item.get("status", "draft"),
            "recipients": int(item.get("recipient_count", 0) or 0),
            "created_at": item.get("created_at").isoformat() if item.get("created_at") else None,
            "url": "/user/sms-campaigns",
        })
    for item in email_items:
        recent.append({
            "id": item.get("campaign_id") or str(item.get("_id")),
            "channel": "email",
            "name": item.get("name"),
            "status": item.get("status", "completed"),
            "recipients": int(item.get("recipient_count", 0) or 0),
            "created_at": item.get("created_at").isoformat() if item.get("created_at") else None,
            "url": "/user/email-campaigns",
        })
    recent.sort(key=lambda item: item.get("created_at") or "", reverse=True)
    return recent[:5]


def confirm_draft(db, user: dict, draft: dict, confirmation_token: str) -> tuple[dict, tuple[str, dict], int]:
    now = now_utc()
    log_ai_stage("send_confirmation_received", user_id=user.get("_id"), conversation_id=draft.get("conversation_id"), draft_id=draft.get("draft_id"), channel=draft.get("channel"))
    if draft.get("campaign_id"):
        message = "This campaign has already been submitted."
        return draft, {"kind": "campaign_result", "status": draft.get("status"), "campaign_id": draft.get("campaign_id"), "links": [{"label": "View Campaign Report", "url": "/user/sms-campaigns" if draft.get("channel") == "sms" else "/user/email-campaigns"}]}, 200
    if draft.get("status") not in {"awaiting_confirmation", "confirmed", "processing"}:
        return draft, {"kind": "error", "message": "This draft is not ready for confirmation."}, 400
    if hash_token(confirmation_token) != draft.get("confirmation_token_hash"):
        return draft, {"kind": "error", "message": "This confirmation is invalid. Review the preview again."}, 400
    if not draft.get("confirmation_token_expires_at") or draft["confirmation_token_expires_at"] < now:
        return draft, {"kind": "error", "message": "This confirmation has expired. Review the preview again."}, 400

    refreshed, _token, _preview_message = prepare_draft(db, user, draft)
    if refreshed.get("confirmation_preview_signature") != draft.get("confirmation_preview_signature"):
        return refreshed, {"kind": "error", "message": "The campaign changed after the preview. Please review it again."}, 409

    claimed = drafts_collection(db).find_one_and_update(
        {
            "draft_id": draft["draft_id"],
            "user_id": user["_id"],
            "campaign_id": None,
            "status": "awaiting_confirmation",
        },
        {
            "$set": {
                "status": "processing",
                "confirmed_at": now,
                "updated_at": now,
                "execution_idempotency_key": f"{draft['draft_id']}:{int(draft.get('confirmation_version', 0) or 0)}",
            }
        },
        return_document=ReturnDocument.AFTER,
    )
    if not claimed:
        existing = drafts_collection(db).find_one({"draft_id": draft["draft_id"], "user_id": user["_id"]})
        if existing and existing.get("campaign_id"):
            link = "/user/sms-campaigns" if existing.get("channel") == "sms" else "/user/email-campaigns"
            return existing, {"kind": "campaign_result", "status": existing.get("status"), "campaign_id": existing.get("campaign_id"), "links": [{"label": "View Campaign Report", "url": link}]}, 200
        return draft, {"kind": "error", "message": "This campaign has already been submitted."}, 409

    if claimed.get("channel") == "sms":
        log_ai_stage("send_action_started", user_id=user.get("_id"), conversation_id=claimed.get("conversation_id"), draft_id=claimed.get("draft_id"), channel="sms")
        recipient_type = claimed.get("recipient_type") or "contact_group"
        contacts = get_group_contacts(user["_id"], claimed.get("contact_group_name", "")) if recipient_type in {"contact_group", "mixed"} else []
        recipient_data = analyze_sms_recipients(contacts)
        direct_numbers = list(parse_numbers(claimed.get("direct_phone_numbers") or []))
        direct_contexts = get_contacts_by_phones(user["_id"], direct_numbers)
        if recipient_type in {"direct_phone_numbers", "mixed"}:
            if recipient_type == "direct_phone_numbers":
                recipient_data = {"valid_numbers": [], "invalid_recipient_count": 0, "duplicate_recipient_count": 0, "context_by_phone": {}}
            for phone in direct_numbers:
                if phone in recipient_data["valid_numbers"]:
                    continue
                recipient_data["valid_numbers"].append(phone)
                recipient_data["context_by_phone"][phone] = direct_contexts.get(phone) or {"phone": phone}
        recipient_source = "direct_numbers" if recipient_type == "direct_phone_numbers" else "mixed" if recipient_type == "mixed" else "contact_group"
        display_numbers = [format_phone_display(phone) for phone in recipient_data["valid_numbers"]]
        campaign = {
            "user_id": user["_id"],
            "campaign_type": "sms",
            "campaign_name": claimed.get("contact_group_name") or ("Direct SMS Campaign" if recipient_source == "direct_numbers" else "AI SMS Campaign"),
            "name": claimed.get("contact_group_name") or ("Direct SMS Campaign" if recipient_source == "direct_numbers" else "AI SMS Campaign"),
            "sender_id": claimed.get("sender_id"),
            "message": claimed.get("message"),
            "group": claimed.get("contact_group_name"),
            "recipients": recipient_data["valid_numbers"],
            "recipient_count": len(recipient_data["valid_numbers"]),
            "recipient_source": recipient_source,
            "direct_phone_numbers": recipient_data["valid_numbers"] if recipient_source != "contact_group" else [],
            "sent": 0,
            "delivered": 0,
            "failed": 0,
            "status": "draft",
            "created_at": now,
            "updated_at": now,
        }
        result = sms_campaigns_collection().insert_one(campaign)
        campaign_id = result.inserted_id
        response, status = send_sms_flow(
            user,
            recipient_data["valid_numbers"],
            claimed.get("sender_id", ""),
            claimed.get("message", ""),
            "campaign",
            campaign_id,
            wallet_category="sms_campaign",
            description_prefix="AI SMS campaign",
            contact_contexts=recipient_data["context_by_phone"],
            log_extra={
                "recipient_source": recipient_source,
                "display_phone": display_numbers[0] if len(display_numbers) == 1 else None,
                "direct_phone_numbers": display_numbers if recipient_source != "contact_group" else [],
            },
        )
        if response.get("success"):
            log_ai_stage("provider_response_received", user_id=user.get("_id"), conversation_id=claimed.get("conversation_id"), draft_id=claimed.get("draft_id"), channel="sms", success=True, status=status)
            submitted = (response.get("log") or {}).get("status") == "submitted"
            sms_campaigns_collection().update_one({"_id": campaign_id}, {"$set": {"status": "running" if submitted else "completed", "sent": len(recipient_data["valid_numbers"]), "delivered": 0 if submitted else len(recipient_data["valid_numbers"]), "failed": 0, "updated_at": now_utc()}})
            drafts_collection(db).update_one({"draft_id": claimed["draft_id"]}, {"$set": {"status": "completed", "campaign_id": str(campaign_id), "wallet_balance_snapshot": response.get("sms_balance", claimed.get("wallet_balance_snapshot")), "updated_at": now_utc()}})
            final = drafts_collection(db).find_one({"draft_id": claimed["draft_id"]})
            log_ai_stage("wallet_deducted", user_id=user.get("_id"), conversation_id=claimed.get("conversation_id"), draft_id=claimed.get("draft_id"), amount=claimed.get("estimated_cost"))
            upsert_audit_log(db, final, user_instruction=claimed.get("user_instruction"), detected_intent="send_sms_campaign", action_status="completed", confirmed_at=now_utc())
            return final, {
                "kind": "campaign_result",
                "status": "completed",
                "channel": "sms",
                "campaign_id": str(campaign_id),
                "title": "SMS Sent Successfully",
                "message": response.get("message", "Campaign queued successfully."),
                "sms_balance": response.get("sms_balance"),
                "amount_charged": claimed.get("estimated_cost"),
                "recipient_source": recipient_source,
                "recipient": display_numbers[0] if len(display_numbers) == 1 else None,
                "recipients": len(recipient_data["valid_numbers"]),
                "sender_id": claimed.get("sender_id"),
                "links": [{"label": "View Message Log", "url": "/user/logs"}] + ([{"label": "Save as Contact", "url": "/user/contacts"}] if recipient_source == "direct_numbers" else [{"label": "View Campaign Report", "url": "/user/sms-campaigns"}]),
            }, status
        sms_campaigns_collection().update_one({"_id": campaign_id}, {"$set": {"status": "failed", "updated_at": now_utc()}})
        drafts_collection(db).update_one({"draft_id": claimed["draft_id"]}, {"$set": {"status": "failed", "campaign_id": str(campaign_id), "last_error": response.get("message"), "updated_at": now_utc()}})
        final = drafts_collection(db).find_one({"draft_id": claimed["draft_id"]})
        log_ai_stage("provider_response_received", user_id=user.get("_id"), conversation_id=claimed.get("conversation_id"), draft_id=claimed.get("draft_id"), channel="sms", success=False, status=status)
        upsert_audit_log(db, final, user_instruction=claimed.get("user_instruction"), detected_intent="send_sms_campaign", action_status="failed", error_category="send_failed")
        return final, {"kind": "error", "title": "SMS Service Unavailable", "message": response.get("message", "Unable to send this campaign right now.")}, status

    log_ai_stage("send_action_started", user_id=user.get("_id"), conversation_id=claimed.get("conversation_id"), draft_id=claimed.get("draft_id"), channel="email")
    recipient_data = analyze_email_recipients(user["_id"], claimed.get("contact_group_name", ""), claimed.get("direct_email_addresses") or [])
    account = account_for_user(user["_id"], claimed.get("email_account_id", ""))
    campaign_id = make_id("ECMP")
    response, status = send_email_flow(
        user,
        account,
        recipient_data["recipient_records"],
        claimed.get("subject", ""),
        sanitize_html(claimed.get("message", "")),
        "plain",
        "campaign",
        [],
        wallet_category="email_campaign",
        description_prefix="AI email campaign",
    )
    email_campaigns().insert_one({
        "campaign_id": campaign_id,
        "user_id": user["_id"],
        "name": claimed.get("subject") or "AI Email Campaign",
        "account_id": claimed.get("email_account_id"),
        "from_email": account.get("email_address") if account else "",
        "recipient_count": len(recipient_data["recipient_records"]),
        "sent": len(response.get("logs", [])) if response.get("success") else 0,
        "failed": len(response.get("failed", [])) if isinstance(response.get("failed"), list) else 0,
        "bounced": 0,
        "unknown": 0,
        "subject": claimed.get("subject"),
        "message_preview": clean_string(re.sub(r"<[^>]+>", " ", claimed.get("message", "")))[:180],
        "format": "plain",
        "attachments": [],
        "status": "completed" if response.get("success") else "failed",
        "created_at": now_utc(),
        "updated_at": now_utc(),
    })
    drafts_collection(db).update_one({"draft_id": claimed["draft_id"]}, {"$set": {"status": "completed" if response.get("success") else "failed", "campaign_id": campaign_id, "wallet_balance_snapshot": response.get("wallet_balance", claimed.get("wallet_balance_snapshot")), "updated_at": now_utc(), "last_error": None if response.get("success") else response.get("message")}})
    final = drafts_collection(db).find_one({"draft_id": claimed["draft_id"]})
    if response.get("success"):
        log_ai_stage("provider_response_received", user_id=user.get("_id"), conversation_id=claimed.get("conversation_id"), draft_id=claimed.get("draft_id"), channel="email", success=True, status=status)
        log_ai_stage("wallet_deducted", user_id=user.get("_id"), conversation_id=claimed.get("conversation_id"), draft_id=claimed.get("draft_id"), amount=claimed.get("estimated_cost"))
        upsert_audit_log(db, final, user_instruction=claimed.get("user_instruction"), detected_intent="send_email_campaign", action_status="completed", confirmed_at=now_utc())
        return final, {"kind": "campaign_result", "status": "completed", "channel": "email", "campaign_id": campaign_id, "title": "Email Campaign Queued", "message": response.get("message", "Campaign queued successfully."), "wallet_balance": response.get("wallet_balance"), "recipients": len(recipient_data["recipient_records"]), "sending_account": account.get("email_address") if account else "", "group": claimed.get("contact_group_name"), "links": [{"label": "View Campaign", "url": "/user/email-campaigns"}]}, status
    log_ai_stage("provider_response_received", user_id=user.get("_id"), conversation_id=claimed.get("conversation_id"), draft_id=claimed.get("draft_id"), channel="email", success=False, status=status)
    upsert_audit_log(db, final, user_instruction=claimed.get("user_instruction"), detected_intent="send_email_campaign", action_status="failed", error_category="send_failed")
    return final, {"kind": "error", "title": "Email Sending Failed", "message": response.get("message", "Unable to send this campaign right now.")}, status
