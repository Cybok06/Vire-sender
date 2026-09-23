from flask import current_app

from config import Config
from services.smsman_provider import decrypt_secret, encrypt_secret
from utils.security import clean_string, now_utc


PROVIDERS = ("moolre", "paystack")


def iso(value):
    return value.isoformat() if value else None


def to_amount(value, fallback=0.0):
    try:
        return round(float(value), 2)
    except (TypeError, ValueError):
        return fallback


def to_int(value, fallback=0):
    try:
        return int(float(value))
    except (TypeError, ValueError):
        return fallback


def collection():
    return current_app.config["DB"].payment_settings


def admin_logs():
    return current_app.config["DB"].admin_activity_logs


def _paystack_doc():
    doc = collection().find_one({"_id": "paystack"}) or collection().find_one({"provider": "paystack"}) or {}
    has_db = bool(doc)
    return {
        **doc,
        "_id": "paystack",
        "provider": "paystack",
        "display_name": "Paystack",
        "is_active": bool(doc.get("is_active", doc.get("enabled", Config.PAYSTACK_ENABLED if not has_db else False))),
        "is_default": bool(doc.get("is_default", False)),
        "environment": doc.get("environment", "live"),
        "currency": doc.get("currency", "GHS") or "GHS",
        "minimum_deposit": to_amount(doc.get("minimum_deposit", doc.get("min_deposit", Config.PAYSTACK_MIN_DEPOSIT)), 1),
        "maximum_deposit": to_amount(doc.get("maximum_deposit", doc.get("max_deposit", Config.PAYSTACK_MAX_DEPOSIT)), 1000),
        "public_key": doc.get("public_key") or (Config.PAYSTACK_PUBLIC_KEY if not has_db else ""),
        "secret_key": doc.get("secret_key") or (Config.PAYSTACK_SECRET_KEY if not has_db else ""),
        "webhook_secret": doc.get("webhook_secret") or (Config.PAYSTACK_WEBHOOK_SECRET if not has_db else ""),
        "source": "database" if has_db else "environment",
    }


def _moolre_doc():
    doc = collection().find_one({"_id": "moolre"}) or collection().find_one({"provider": "moolre"}) or {}
    has_db = bool(doc)
    return {
        **doc,
        "_id": "moolre",
        "provider": "moolre",
        "display_name": "Moolre",
        "is_active": bool(doc.get("is_active", False)),
        "is_default": bool(doc.get("is_default", False)),
        "environment": doc.get("environment") or getattr(Config, "MOOLRE_ENVIRONMENT", "sandbox") or "sandbox",
        "currency": doc.get("currency") or "GHS",
        "minimum_deposit": to_amount(doc.get("minimum_deposit"), 50),
        "maximum_deposit": to_amount(doc.get("maximum_deposit"), 1000),
        "api_username": doc.get("api_username") or (getattr(Config, "MOOLRE_API_USERNAME", "") if not has_db else ""),
        "private_key_encrypted": doc.get("private_key_encrypted", ""),
        "public_key_encrypted": doc.get("public_key_encrypted", ""),
        "account_number": doc.get("account_number") or (getattr(Config, "MOOLRE_ACCOUNT_NUMBER", "") if not has_db else ""),
        "callback_url": doc.get("callback_url") or getattr(Config, "MOOLRE_CALLBACK_URL", ""),
        "redirect_url": doc.get("redirect_url") or getattr(Config, "MOOLRE_REDIRECT_URL", ""),
        "link_expiration_minutes": to_int(doc.get("link_expiration_minutes") or getattr(Config, "MOOLRE_LINK_EXPIRATION_MINUTES", 30), 30),
        "reference_prefix": doc.get("reference_prefix") or "VIRE-DEP",
        "configuration_status": doc.get("configuration_status") or "incomplete",
        "source": "database" if has_db else "environment",
    }


def get_provider(provider: str, include_secret=False):
    provider = clean_string(provider).lower()
    if provider == "paystack":
        doc = _paystack_doc()
        if not include_secret:
            doc.pop("secret_key", None)
            doc.pop("webhook_secret", None)
        return doc
    if provider == "moolre":
        doc = _moolre_doc()
        if include_secret:
            doc["private_key"] = decrypt_secret(doc.get("private_key_encrypted", "")) or getattr(Config, "MOOLRE_PRIVATE_API_KEY", "")
            doc["public_key"] = decrypt_secret(doc.get("public_key_encrypted", "")) or getattr(Config, "MOOLRE_PUBLIC_API_KEY", "")
        return doc
    return {}


def is_complete(settings: dict) -> bool:
    provider = settings.get("provider")
    if provider == "paystack":
        return bool(settings.get("public_key") and settings.get("secret_key"))
    if provider == "moolre":
        if not settings.get("api_username") or not settings.get("account_number"):
            return False
        if settings.get("environment") == "sandbox":
            return True
        return bool(settings.get("public_key"))
    return False


def safe_provider(settings: dict) -> dict:
    provider = settings.get("provider")
    if provider == "paystack":
        return {
            "provider": "paystack",
            "display_name": "Paystack",
            "is_active": bool(settings.get("is_active")),
            "enabled": bool(settings.get("is_active")),
            "is_default": bool(settings.get("is_default")),
            "environment": settings.get("environment", "live"),
            "currency": settings.get("currency", "GHS"),
            "minimum_deposit": to_amount(settings.get("minimum_deposit"), 1),
            "maximum_deposit": to_amount(settings.get("maximum_deposit"), 1000),
            "min_deposit": to_amount(settings.get("minimum_deposit"), 1),
            "max_deposit": to_amount(settings.get("maximum_deposit"), 1000),
            "public_key": settings.get("public_key", ""),
            "has_secret_key": bool(settings.get("secret_key")),
            "has_webhook_secret": bool(settings.get("webhook_secret")),
            "configuration_status": "complete" if is_complete(settings) else "incomplete",
            "updated_at": iso(settings.get("updated_at")),
            "source": settings.get("source", "database"),
        }
    if provider == "moolre":
        with_secrets = get_provider("moolre", include_secret=True)
        return {
            "provider": "moolre",
            "display_name": "Moolre",
            "is_active": bool(settings.get("is_active")),
            "is_default": bool(settings.get("is_default")),
            "environment": settings.get("environment", "sandbox"),
            "currency": settings.get("currency", "GHS"),
            "minimum_deposit": to_amount(settings.get("minimum_deposit"), 50),
            "maximum_deposit": to_amount(settings.get("maximum_deposit"), 1000),
            "api_username": settings.get("api_username", ""),
            "account_number": settings.get("account_number", ""),
            "callback_url": settings.get("callback_url", ""),
            "redirect_url": settings.get("redirect_url", ""),
            "link_expiration_minutes": to_int(settings.get("link_expiration_minutes"), 30),
            "reference_prefix": settings.get("reference_prefix", "VIRE-DEP"),
            "private_key_configured": bool(with_secrets.get("private_key")),
            "public_key_configured": bool(with_secrets.get("public_key")),
            "configuration_status": "complete" if is_complete(with_secrets) else "incomplete",
            "last_connection_test_at": iso(settings.get("last_connection_test_at")),
            "last_connection_test_result": settings.get("last_connection_test_result"),
            "last_connection_test_message": settings.get("last_connection_test_message"),
            "updated_at": iso(settings.get("updated_at")),
        }
    return {}


def save_paystack(data: dict, admin_id: str):
    existing = get_provider("paystack", include_secret=True)
    minimum = to_amount(data.get("minimum_deposit", data.get("min_deposit")), 1)
    maximum = to_amount(data.get("maximum_deposit", data.get("max_deposit")), 1000)
    if minimum <= 0 or maximum <= 0 or minimum > maximum:
        raise ValueError("Enter a valid deposit range.")
    public_key = clean_string(data.get("public_key", existing.get("public_key", "")))
    secret_key = clean_string(data.get("secret_key", ""))
    webhook_secret = clean_string(data.get("webhook_secret", ""))
    update = {
        "provider": "paystack",
        "display_name": "Paystack",
        "is_active": bool(data.get("is_active", data.get("enabled", existing.get("is_active", False)))),
        "enabled": bool(data.get("is_active", data.get("enabled", existing.get("is_active", False)))),
        "is_default": bool(data.get("is_default", existing.get("is_default", False))),
        "environment": "live",
        "currency": "GHS",
        "minimum_deposit": minimum,
        "maximum_deposit": maximum,
        "min_deposit": minimum,
        "max_deposit": maximum,
        "public_key": public_key,
        "updated_by": admin_id,
        "updated_at": now_utc(),
    }
    if secret_key:
        update["secret_key"] = secret_key
    if webhook_secret:
        update["webhook_secret"] = webhook_secret
    merged = {**existing, **update}
    if secret_key:
        merged["secret_key"] = secret_key
    if webhook_secret:
        merged["webhook_secret"] = webhook_secret
    if update["is_active"] and not is_complete(merged):
        raise ValueError("Paystack configuration is incomplete.")
    collection().update_one({"_id": "paystack"}, {"$set": update, "$setOnInsert": {"created_at": now_utc()}}, upsert=True)
    if update["is_default"]:
        set_default("paystack", admin_id, skip_active_validation=True)
    ensure_effective_default()
    log_settings_change(admin_id, "paystack_settings_updated", update)
    return get_provider("paystack", include_secret=True)


def save_moolre(data: dict, admin_id: str):
    existing = get_provider("moolre", include_secret=True)
    environment = clean_string(data.get("environment", existing.get("environment", "sandbox"))).lower() or "sandbox"
    if environment not in {"sandbox", "live"}:
        raise ValueError("Moolre environment must be sandbox or live.")
    currency = clean_string(data.get("currency", existing.get("currency", "GHS"))).upper() or "GHS"
    if currency != "GHS":
        raise ValueError("VireSender wallet deposits currently support GHS only.")
    minimum = to_amount(data.get("minimum_deposit"), existing.get("minimum_deposit", 50))
    maximum = to_amount(data.get("maximum_deposit"), existing.get("maximum_deposit", 1000))
    if minimum <= 0 or maximum <= 0 or minimum > maximum:
        raise ValueError("Enter a valid Moolre deposit range.")
    update = {
        "provider": "moolre",
        "display_name": "Moolre",
        "is_active": bool(data.get("is_active", existing.get("is_active", False))),
        "is_default": bool(data.get("is_default", existing.get("is_default", False))),
        "environment": environment,
        "currency": currency,
        "minimum_deposit": minimum,
        "maximum_deposit": maximum,
        "api_username": clean_string(data.get("api_username", existing.get("api_username", ""))),
        "account_number": clean_string(data.get("account_number", existing.get("account_number", ""))),
        "callback_url": clean_string(data.get("callback_url", existing.get("callback_url", ""))),
        "redirect_url": clean_string(data.get("redirect_url", existing.get("redirect_url", ""))),
        "link_expiration_minutes": max(1, to_int(data.get("link_expiration_minutes", existing.get("link_expiration_minutes", 30)), 30)),
        "reference_prefix": clean_string(data.get("reference_prefix", existing.get("reference_prefix", "VIRE-DEP"))) or "VIRE-DEP",
        "updated_by": admin_id,
        "updated_at": now_utc(),
    }
    private_key = clean_string(data.get("private_key", ""))
    public_key = clean_string(data.get("public_key", ""))
    if private_key:
        update["private_key_encrypted"] = encrypt_secret(private_key)
    if public_key:
        update["public_key_encrypted"] = encrypt_secret(public_key)
    merged = {**existing, **update}
    if private_key:
        merged["private_key"] = private_key
    if public_key:
        merged["public_key"] = public_key
    update["configuration_status"] = "complete" if is_complete(merged) else "incomplete"
    if update["is_active"] and update["configuration_status"] != "complete":
        raise ValueError("Moolre configuration is incomplete.")
    collection().update_one({"_id": "moolre"}, {"$set": update, "$setOnInsert": {"created_at": now_utc()}}, upsert=True)
    if update["is_default"]:
        set_default("moolre", admin_id, skip_active_validation=True)
    ensure_effective_default()
    log_settings_change(admin_id, "moolre_settings_updated", update)
    return get_provider("moolre", include_secret=True)


def set_provider_status(provider: str, is_active: bool, admin_id: str):
    current = get_provider(provider, include_secret=True)
    if not current:
        raise ValueError("Unknown payment provider.")
    if is_active and not is_complete(current):
        raise ValueError(f"{current.get('display_name', provider)} configuration is incomplete.")
    collection().update_one({"_id": provider}, {"$set": {"is_active": bool(is_active), "enabled": bool(is_active) if provider == "paystack" else bool(is_active), "updated_by": admin_id, "updated_at": now_utc()}}, upsert=True)
    ensure_effective_default()
    log_settings_change(admin_id, f"{provider}_status_updated", {"is_active": bool(is_active)})
    return get_provider(provider, include_secret=True)


def set_default(provider: str, admin_id: str, skip_active_validation=False):
    provider = clean_string(provider).lower()
    if provider not in PROVIDERS:
        raise ValueError("Unknown payment provider.")
    settings = get_provider(provider, include_secret=True)
    if not skip_active_validation and (not settings.get("is_active") or not is_complete(settings)):
        raise ValueError("Default provider must be active and fully configured.")
    for item in PROVIDERS:
        collection().update_one({"_id": item}, {"$set": {"is_default": item == provider, "updated_at": now_utc(), "updated_by": admin_id}}, upsert=True)
    log_settings_change(admin_id, "payment_default_provider_updated", {"provider": provider})
    return provider


def ensure_effective_default():
    providers = [get_provider(provider, include_secret=True) for provider in PROVIDERS]
    active = [provider for provider in providers if provider.get("is_active") and is_complete(provider)]
    current_default = next((provider for provider in active if provider.get("is_default")), None)
    if current_default:
        return current_default.get("provider")
    preferred = next((provider for provider in active if provider.get("provider") == "moolre"), None) or (active[0] if active else None)
    for provider in PROVIDERS:
        collection().update_one({"_id": provider}, {"$set": {"is_default": bool(preferred and provider == preferred.get("provider"))}}, upsert=True)
    return preferred.get("provider") if preferred else None


def active_public_response():
    default_provider = ensure_effective_default()
    providers = []
    for settings in [get_provider("moolre", include_secret=True), get_provider("paystack", include_secret=True)]:
        if not settings.get("is_active") or not is_complete(settings):
            continue
        if settings["provider"] == "moolre":
            providers.append({
                "id": "moolre",
                "name": "Moolre",
                "description": "Mobile money, card and supported payment options",
                "minimum_deposit": to_amount(settings.get("minimum_deposit"), 50),
                "maximum_deposit": to_amount(settings.get("maximum_deposit"), 1000),
                "requires_phone_number": False,
                "requires_network": False,
            })
        if settings["provider"] == "paystack":
            providers.append({
                "id": "paystack",
                "name": "Paystack",
                "description": "Card, bank transfer, USSD and mobile money",
                "minimum_deposit": to_amount(settings.get("minimum_deposit"), 1),
                "maximum_deposit": to_amount(settings.get("maximum_deposit"), 1000),
                "requires_phone_number": False,
                "requires_network": False,
            })
    if not providers:
        return {"success": True, "deposits_enabled": False, "default_provider": None, "providers": [], "message": "Wallet deposits are temporarily unavailable."}
    if default_provider not in {provider["id"] for provider in providers}:
        default_provider = providers[0]["id"]
    return {"success": True, "deposits_enabled": True, "currency": "GHS", "default_provider": default_provider, "providers": providers}


def log_settings_change(admin_id: str, action: str, metadata: dict):
    safe_metadata = dict(metadata or {})
    for key in ("secret_key", "webhook_secret", "private_key", "public_key", "private_key_encrypted", "public_key_encrypted"):
        safe_metadata.pop(key, None)
    admin_logs().insert_one({
        "admin_id": admin_id,
        "action": action,
        "target_user_id": None,
        "metadata": safe_metadata,
        "created_at": now_utc(),
    })
