from app import create_app
from services.sms_provider_service import MOOLRE_BASE_URL, normalize_sms_settings
from services.smsman_provider import encrypt_secret
from utils.security import now_utc


def migrate():
    app = create_app()
    with app.app_context():
        collection = app.config["DB"].platform_settings
        existing = collection.find_one({"key": "sms_settings"}) or {}
        normalized = normalize_sms_settings(existing, include_secret=True)
        update = {
            "key": "sms_settings",
            "active_sms_provider": normalized.get("active_sms_provider") or "arkesel",
            "active_provider": normalized.get("active_sms_provider") or "arkesel",
            "sms_enabled": normalized.get("sms_enabled", False),
            "arkesel_enabled": normalized.get("arkesel_enabled", normalized.get("sms_enabled", False)),
            "moolre_sms_enabled": normalized.get("moolre_enabled", False),
            "moolre_enabled": normalized.get("moolre_enabled", False),
            "sms_cost_per_message": normalized.get("sms_cost_per_message", 0.04),
            "sms_provider_cost_per_message": normalized.get("sms_provider_cost_per_message", 0.02),
            "arkesel_user_price_per_sms": normalized.get("arkesel_user_price_per_sms", 0.04),
            "arkesel_provider_cost_per_sms": normalized.get("arkesel_provider_cost_per_sms", 0.02),
            "moolre_user_price_per_sms": normalized.get("moolre_user_price_per_sms", 0),
            "moolre_provider_cost_per_sms": normalized.get("moolre_provider_cost_per_sms", 0),
            "moolre_base_url": normalized.get("moolre_base_url") or MOOLRE_BASE_URL,
            "updated_at": now_utc(),
        }
        if existing.get("arkesel_api_key") and not existing.get("arkesel_api_key_encrypted"):
            update["arkesel_api_key_encrypted"] = encrypt_secret(existing.get("arkesel_api_key", ""))
        collection.update_one({"key": "sms_settings"}, {"$set": update, "$setOnInsert": {"created_at": now_utc()}}, upsert=True)
        print("SMS provider settings migration completed. Active provider:", update["active_sms_provider"])


if __name__ == "__main__":
    migrate()
