import unittest
from unittest.mock import patch
from pathlib import Path
import sys


sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from services.ai_assistant_service import (
    analyze_direct_phone_numbers,
    apply_selected_mode,
    build_preview_signature,
    build_group_choice_message,
    classify_content_request,
    classify_conversation_intent,
    conversational_reply,
    create_or_refine_content_draft,
    default_workflow_context,
    extract_email_addresses,
    interpret_workflow_message,
    safe_workflow_context,
    extract_group_name,
    heuristic_intent,
    normalize_assistant_mode,
)
from routes.sms_routes import safe_log


class AiAssistantServiceTests(unittest.TestCase):
    def test_high_level_conversation_intents_keep_chat_separate_from_actions(self):
        draft = {"current_draft": {"draft_id": "AIMD-1", "body": "A useful draft."}}
        cases = [
            ("Hello", None, "casual_chat"),
            ("What is a sender ID?", None, "app_guidance"),
            ("Help me write a birthday message.", None, "content_generation"),
            ("Make it shorter.", draft, "content_editing"),
            ("Who are my contact groups?", None, "contact_lookup"),
            ("Okay, send it.", draft, "send_message"),
            ("Actually use email.", draft, "change_channel"),
        ]
        for text, conversation, expected in cases:
            with self.subTest(text=text):
                self.assertEqual(classify_conversation_intent(text, conversation), expected)

    def test_cancel_send_can_return_to_editing_without_losing_draft(self):
        conversation = {
            "current_draft": {"draft_id": "AIMD-1", "body": "A useful draft."},
            "workflow_context": {"state": "awaiting_confirmation"},
        }
        self.assertEqual(
            classify_conversation_intent("Forget sending it. Let’s improve the message.", conversation),
            "cancel_send",
        )

    def test_default_state_exposes_conversation_and_delivery_separation(self):
        state = default_workflow_context({})
        self.assertEqual(state["conversation_mode"], "chat")
        self.assertEqual(state["status"], "chatting")
        self.assertFalse(state["send_requested"])
        self.assertEqual(state["missing_fields"], [])

    def test_supported_assistant_modes_are_normalized(self):
        self.assertEqual(normalize_assistant_mode(" Direct_SMS "), "direct_sms")
        self.assertEqual(normalize_assistant_mode("unsupported"), "general_assistant")

    def test_direct_sms_mode_overrides_old_group_context(self):
        result = apply_selected_mode({"channel": "email", "recipient_type": "contact_group", "contact_group_name": "Re-engagement Group"}, "direct_sms")
        self.assertEqual(result["channel"], "sms")
        self.assertEqual(result["recipient_type"], "direct_phone_numbers")
        self.assertIsNone(result["contact_group_name"])

    def test_group_sms_mode_clears_direct_recipients(self):
        result = apply_selected_mode({"channel": "email", "phone_numbers": ["+233241234567"]}, "group_sms")
        self.assertEqual(result["channel"], "sms")
        self.assertEqual(result["recipient_type"], "contact_group")
        self.assertEqual(result["phone_numbers"], [])

    def test_direct_email_mode_requires_an_email_recipient(self):
        result = apply_selected_mode({"intent": "compose_email"}, "direct_email")
        self.assertEqual(result["channel"], "email")
        self.assertEqual(result["clarification_question"], "What email address should receive the email?")

    def test_group_email_mode_forces_group_scope(self):
        result = apply_selected_mode({"channel": "sms", "recipient_type": "direct_phone_numbers"}, "group_email")
        self.assertEqual((result["channel"], result["recipient_type"]), ("email", "contact_group"))

    def test_general_mode_preserves_detected_entities(self):
        parsed = {"channel": "sms", "recipient_type": "direct_phone_numbers"}
        result = apply_selected_mode(parsed, "general_assistant")
        self.assertEqual(result["channel"], "sms")
        self.assertEqual(result["recipient_type"], "direct_phone_numbers")

    def test_direct_mode_never_interprets_direct_as_group(self):
        result = interpret_workflow_message({"state": "awaiting_recipient", "selected_mode": "direct_sms"}, "Direct")
        self.assertEqual(result["intent"], "invalid_recipient")

    def test_group_mode_accepts_short_group_correction(self):
        result = interpret_workflow_message({"state": "awaiting_recipient", "selected_mode": "group_sms"}, "Workers")
        self.assertEqual(result["entities"]["contact_group_name"], "Workers")

    def test_channel_correction_is_deterministic(self):
        result = interpret_workflow_message({"state": "awaiting_channel", "selected_mode": "general_assistant"}, "Use SMS")
        self.assertEqual(result["entities"]["channel"], "sms")

    def test_confirmation_does_not_run_outside_preview_state(self):
        result = interpret_workflow_message({"state": "awaiting_recipient", "selected_mode": "direct_sms"}, "confirm")
        self.assertNotEqual(result["intent"], "confirm_send_action")

    def test_short_channel_reply_uses_awaiting_channel_state(self):
        result = interpret_workflow_message({"state": "awaiting_channel"}, "email")
        self.assertEqual(result["intent"], "provide_channel")
        self.assertEqual(result["entities"]["channel"], "email")

    def test_direct_email_infers_email_and_preserves_recipient(self):
        result = interpret_workflow_message({"state": "drafting", "active_draft_id": "AIMD-1"}, "Okay, send this to nakisanemmanuel05@gmail.com.")
        self.assertEqual(result["intent"], "provide_recipient")
        self.assertEqual(result["entities"]["channel"], "email")
        self.assertEqual(result["entities"]["recipient_emails"], ["nakisanemmanuel05@gmail.com"])

    def test_direct_phone_infers_sms(self):
        result = interpret_workflow_message({"state": "drafting"}, "Send this to 0241234567")
        self.assertEqual(result["entities"]["channel"], "sms")
        self.assertEqual(result["entities"]["recipient_phones"], ["+233241234567"])

    def test_subject_followup_does_not_drop_stored_recipient(self):
        context = {"state": "awaiting_subject", "recipient_emails": ["john@example.com"], "channel": "email"}
        result = interpret_workflow_message(context, "Special birthday wishes")
        self.assertEqual(result["intent"], "provide_subject")
        self.assertEqual(context["recipient_emails"], ["john@example.com"])

    def test_confirmation_words_only_confirm_in_confirmation_state(self):
        self.assertEqual(interpret_workflow_message({"state": "awaiting_confirmation"}, "yes")["intent"], "confirm_send_action")
        self.assertIsNone(interpret_workflow_message({"state": "idle"}, "yes"))

    def test_email_without_active_workflow_does_not_invent_send(self):
        self.assertIsNone(interpret_workflow_message({"state": "idle"}, "email"))

    def test_email_preference_is_not_confirmation(self):
        self.assertIsNone(interpret_workflow_message({"state": "drafting"}, "Email looks better."))

    def test_conversation_context_is_isolated_by_document(self):
        first = safe_workflow_context({"workflow_context": {"state": "awaiting_subject", "recipient_emails": ["one@example.com"]}})
        second = safe_workflow_context({"workflow_context": {"state": "idle", "recipient_emails": []}})
        self.assertEqual(first["recipient_emails"], ["one@example.com"])
        self.assertEqual(second["recipient_emails"], [])

    def test_email_extraction_normalizes_punctuation_and_rejects_malformed(self):
        self.assertEqual(extract_email_addresses("Use TEST@example.com, not broken@example"), ["test@example.com"])

    def test_broad_writing_requests_are_content_generation_not_sending(self):
        prompts = [
            "Write a birthday message.",
            "Construct a birthday wish message that I can send.",
            "Give me a thank-you message.",
            "Help me reply professionally.",
            "Write an apology message.",
            "Create a promotional SMS.",
            "Draft an email for my customers.",
        ]
        for prompt in prompts:
            with self.subTest(prompt=prompt):
                self.assertIn(classify_content_request(prompt), {"generate_message", "generate_reply"})

    def test_refinements_require_and_reuse_a_current_draft(self):
        current = {"draft_id": "AIMD-1", "body": "A useful message."}
        prompts = ["Make it shorter.", "Make it friendlier.", "Add emojis.", "Remove emojis.", "Give me another version.", "Make it suitable for SMS.", "Turn it into an email.", "Add a subject.", "Give me three options."]
        for prompt in prompts:
            with self.subTest(prompt=prompt):
                self.assertIn(classify_content_request(prompt, current), {"improve_message", "format_message"})

    def test_clear_send_intent_is_not_classified_as_content_creation(self):
        current = {"draft_id": "AIMD-1", "body": "Draft", "channel": "sms"}
        self.assertIsNone(classify_content_request("Send it to my Customers group.", current))
        self.assertIsNone(classify_content_request("I want to send this draft.", current))

    @patch("services.ai_assistant_service.deepseek_available", return_value=False)
    def test_refinement_updates_same_persisted_content_draft_without_campaign(self, _available):
        class Collection:
            def __init__(self): self.update = None
            def update_one(self, query, update): self.update = (query, update)
        class Db: pass
        db = Db()
        db.ai_conversations = Collection()
        conversation = {"conversation_id": "AIC-1", "current_draft": {"draft_id": "AIMD-1", "body": "A long message. More detail.", "category": "message"}}
        result = create_or_refine_content_draft(db, conversation, "user-1", "Make it shorter.", "improve_message")
        self.assertEqual(result["draft_id"], "AIMD-1")
        self.assertIn("current_draft", db.ai_conversations.update[1]["$set"])
        self.assertFalse(hasattr(db, "sms_campaigns"))
        self.assertFalse(hasattr(db, "wallet_transactions"))

    @patch("services.ai_assistant_service.deepseek_available", return_value=False)
    def test_greeting_is_conversational_without_requiring_a_channel(self, _available):
        self.assertEqual(conversational_reply(None, "conversation", "Hello"), "Hi! What would you like to work on today?")

    @patch("services.ai_assistant_service.deepseek_available", return_value=False)
    def test_business_brainstorming_asks_one_natural_question(self, _available):
        reply = conversational_reply(None, "conversation", "Help me promote my new shop")
        self.assertIn("What are you promoting", reply)

    def test_missing_group_has_specific_safe_error_contract(self):
        content, data = build_group_choice_message("Customers", {"status": "missing", "groups": []})
        self.assertIn("Customers", content)
        self.assertEqual(data["title"], "Contact Group Not Found")
        self.assertEqual(data["error_code"], "CONTACT_GROUP_NOT_FOUND")

    def test_extract_group_name_from_common_phrases(self):
        self.assertEqual(extract_group_name("Send a holiday SMS to the Workers group."), "Workers")
        self.assertEqual(extract_group_name("Create a promotional email for my Customers group"), "Customers")

    def test_heuristic_requires_channel_clarification_for_ambiguous_message(self):
        result = heuristic_intent("Send a message to Workers.")
        self.assertTrue(result["requires_clarification"])
        self.assertEqual(result["clarification_question"], "Do you want to send this as SMS or email?")

    def test_heuristic_detects_sms_preview(self):
        result = heuristic_intent("Send an SMS to the Delivery Team group telling them the meeting is tomorrow at 8 AM.")
        self.assertEqual(result["intent"], "preview_sms_campaign")
        self.assertEqual(result["channel"], "sms")
        self.assertEqual(result["contact_group_name"], "Delivery Team")

    def test_preview_signature_changes_when_critical_fields_change(self):
        first = build_preview_signature({
            "channel": "sms",
            "recipient_type": "contact_group",
            "contact_group_name": "Workers",
            "direct_phone_numbers": [],
            "message": "Hello team.",
            "subject": "",
            "sender_id": "SMART",
            "email_account_id": "",
            "valid_recipient_count": 10,
            "estimated_cost": 1.2,
        })
        second = build_preview_signature({
            "channel": "sms",
            "recipient_type": "contact_group",
            "contact_group_name": "Workers",
            "direct_phone_numbers": [],
            "message": "Updated message.",
            "subject": "",
            "sender_id": "SMART",
            "email_account_id": "",
            "valid_recipient_count": 10,
            "estimated_cost": 1.2,
        })
        self.assertNotEqual(first, second)

    def test_direct_phone_numbers_are_normalized_and_deduplicated(self):
        result = analyze_direct_phone_numbers(["0530393625", "+233530393625", "024-123-4567", "05303"])
        self.assertEqual(result["valid_numbers"], ["+233530393625", "+233241234567"])
        self.assertEqual(result["invalid_numbers"], ["05303"])
        self.assertEqual(result["duplicate_recipient_count"], 1)

    def test_heuristic_detects_direct_sms(self):
        result = heuristic_intent("Send this to 0241234567: Your appointment is tomorrow at 10 AM.")
        self.assertEqual(result["intent"], "preview_direct_sms")
        self.assertEqual(result["channel"], "sms")
        self.assertEqual(result["recipient_type"], "direct_phone_numbers")
        self.assertTrue(result["phone_numbers"])

    def test_heuristic_flags_group_and_number_ambiguity(self):
        result = heuristic_intent("Send an SMS to Workers and 0530393625.")
        self.assertTrue(result["requires_clarification"])
        self.assertEqual(result["clarification_type"], "recipient_scope")

    def test_customer_safe_log_hides_provider_details(self):
        payload = safe_log({
            "_id": "1",
            "sms_id": "SMS-1",
            "provider": "moolre",
            "provider_reference": "ref-1",
            "provider_code": "200",
            "provider_error": "",
            "status": "delivered",
        })
        self.assertNotIn("provider", payload)
        self.assertNotIn("provider_reference", payload)

    def test_admin_safe_log_keeps_provider_details(self):
        payload = safe_log({
            "_id": "1",
            "sms_id": "SMS-1",
            "provider": "moolre",
            "provider_reference": "ref-1",
            "status": "delivered",
        }, admin=True)
        self.assertEqual(payload["provider"], "moolre")
        self.assertEqual(payload["provider_reference"], "ref-1")


if __name__ == "__main__":
    unittest.main()
