import os
from pathlib import Path


def load_env_file(path: str | None = None, override: bool = False) -> None:
    env_path = Path(path) if path else Path(__file__).resolve().parent / ".env"
    if not env_path.exists():
        return

    for line in env_path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue

        key, value = line.split("=", 1)
        env_key = key.strip()
        env_value = value.strip().strip("\"'")
        if override or env_key not in os.environ:
            os.environ[env_key] = env_value


load_env_file(override=True)
load_env_file(Path(__file__).resolve().parent.parent / ".env")


class Config:
    _mongo_uri = os.getenv("MONGO_URI")
    MONGO_URI = os.getenv("MONGODB_URI") if _mongo_uri == "your_mongodb_uri" else (_mongo_uri or os.getenv("MONGODB_URI"))
    MONGO_DB_NAME = os.getenv("MONGO_DB_NAME", "viresend")
    JWT_SECRET = os.getenv("JWT_SECRET", "change_this_secret")
    JWT_EXPIRES_HOURS = int(os.getenv("JWT_EXPIRES_HOURS", "24"))
    FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:5173")
    ADMIN_EMAIL = os.getenv("ADMIN_EMAIL", "admin@viresender.com").strip().lower()
    ADMIN_USERNAME = os.getenv("ADMIN_USERNAME", "admin").strip()
    ADMIN_PASSWORD = (os.getenv("ADMIN_PASSWORD") or "").strip()
    RECAPTCHA_SECRET_KEY = os.getenv("RECAPTCHA_SECRET_KEY")
    RECAPTCHA_REQUIRED = os.getenv("RECAPTCHA_REQUIRED", "false").strip().lower() in {"1", "true", "yes", "on"}
    GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID")
    GOOGLE_CLIENT_SECRET = os.getenv("GOOGLE_CLIENT_SECRET")
    _google_redirect_uri = os.getenv("GOOGLE_REDIRECT_URI")
    GOOGLE_REDIRECT_URI = _google_redirect_uri or "http://localhost:5000/api/auth/google/callback"
    GOOGLE_AUTH_REDIRECT_URI = os.getenv("GOOGLE_AUTH_REDIRECT_URI") or (
        GOOGLE_REDIRECT_URI if "/api/email/" not in GOOGLE_REDIRECT_URI else "http://localhost:5000/api/auth/google/callback"
    )
    GMAIL_OAUTH_REDIRECT_URI = os.getenv("GMAIL_OAUTH_REDIRECT_URI") or os.getenv("EMAIL_GOOGLE_REDIRECT_URI") or os.getenv("GOOGLE_EMAIL_REDIRECT_URI") or (
        GOOGLE_REDIRECT_URI if _google_redirect_uri and "/api/email/" in GOOGLE_REDIRECT_URI else "http://localhost:5000/api/email/google/callback"
    )
    EMAIL_GOOGLE_REDIRECT_URI = GMAIL_OAUTH_REDIRECT_URI
    GOOGLE_CHAT_REDIRECT_URI = os.getenv("GOOGLE_CHAT_REDIRECT_URI") or f"{FRONTEND_URL.rstrip('/')}/api/google-chat/callback"
    GITHUB_CLIENT_ID = os.getenv("GITHUB_CLIENT_ID")
    GITHUB_CLIENT_SECRET = os.getenv("GITHUB_CLIENT_SECRET")
    GITHUB_REDIRECT_URI = os.getenv("GITHUB_REDIRECT_URI", "http://localhost:5000/api/auth/github/callback")
    SMSMAN_API_TOKEN = os.getenv("SMSMAN_API_TOKEN", "").strip()

    SMTP_HOST = os.getenv("SMTP_HOST")
    SMTP_PORT = int(os.getenv("SMTP_PORT", "587"))
    SMTP_USE_SSL = os.getenv("SMTP_USE_SSL", "false").strip().lower() in {"1", "true", "yes", "on"}
    SMTP_USERNAME = os.getenv("SMTP_USERNAME")
    SMTP_PASSWORD = os.getenv("SMTP_PASSWORD")
    SMTP_FROM = os.getenv("SMTP_FROM", "noreply@viresender.com")

    PAYSTACK_ENABLED = os.getenv("PAYSTACK_ENABLED", "").strip().lower() in {"1", "true", "yes", "on"}
    PAYSTACK_PUBLIC_KEY = os.getenv("PAYSTACK_PUBLIC_KEY", "").strip()
    PAYSTACK_SECRET_KEY = os.getenv("PAYSTACK_SECRET_KEY", "").strip()
    PAYSTACK_WEBHOOK_SECRET = os.getenv("PAYSTACK_WEBHOOK_SECRET", "").strip()
    PAYSTACK_MIN_DEPOSIT = os.getenv("PAYSTACK_MIN_DEPOSIT", "").strip()
    PAYSTACK_MAX_DEPOSIT = os.getenv("PAYSTACK_MAX_DEPOSIT", "").strip()
    PAYSTACK_CALLBACK_URL = os.getenv("PAYSTACK_CALLBACK_URL", "").strip()
    MOOLRE_ENVIRONMENT = os.getenv("MOOLRE_ENVIRONMENT", "sandbox").strip().lower()
    MOOLRE_API_USERNAME = os.getenv("MOOLRE_API_USERNAME", "").strip()
    MOOLRE_PRIVATE_API_KEY = os.getenv("MOOLRE_PRIVATE_API_KEY", "").strip()
    MOOLRE_PUBLIC_API_KEY = os.getenv("MOOLRE_PUBLIC_API_KEY", "").strip()
    MOOLRE_ACCOUNT_NUMBER = os.getenv("MOOLRE_ACCOUNT_NUMBER", "").strip()
    MOOLRE_CALLBACK_URL = os.getenv("MOOLRE_CALLBACK_URL", "").strip()
    MOOLRE_REDIRECT_URL = os.getenv("MOOLRE_REDIRECT_URL", "").strip()
    MOOLRE_LINK_EXPIRATION_MINUTES = int(os.getenv("MOOLRE_LINK_EXPIRATION_MINUTES", "30") or 30)
    PAYMENT_CREDENTIAL_ENCRYPTION_KEY = os.getenv("PAYMENT_CREDENTIAL_ENCRYPTION_KEY", "").strip()
    MOOLRE_SMS_VAS_KEY = os.getenv("MOOLRE_SMS_VAS_KEY", "").strip()
    MOOLRE_SMS_BASE_URL = os.getenv("MOOLRE_SMS_BASE_URL", "https://api.moolre.com").strip()
    MOOLRE_SMS_BATCH_SIZE = int(os.getenv("MOOLRE_SMS_BATCH_SIZE", "100") or 100)
    BIRD_API_KEY = os.getenv("BIRD_API_KEY", "").strip()
    CLOUDFLARE_ACCOUNT_ID = (os.getenv("CLOUDFLARE_ACCOUNT_ID") or os.getenv("CF_ACCOUNT_ID") or "").strip()
    CLOUDFLARE_IMAGES_API_TOKEN = (os.getenv("CLOUDFLARE_IMAGES_API_TOKEN") or os.getenv("CF_IMAGES_TOKEN") or "").strip()
    CLOUDFLARE_IMAGES_DELIVERY_HASH = (os.getenv("CLOUDFLARE_IMAGES_DELIVERY_HASH") or os.getenv("CF_HASH") or "").strip()
    CLOUDFLARE_IMAGES_VARIANT = (os.getenv("CLOUDFLARE_IMAGES_VARIANT") or os.getenv("CF_IMAGES_VARIANT") or "public").strip()

    AI_ENABLED = os.getenv("AI_ENABLED", "true").strip().lower() in {"1", "true", "yes", "on"}
    AI_COMMUNICATION_ASSISTANT_ENABLED = os.getenv("AI_COMMUNICATION_ASSISTANT_ENABLED", "true").strip().lower() in {"1", "true", "yes", "on"}
    AI_DIRECT_SMS_MAX_RECIPIENTS = int(os.getenv("AI_DIRECT_SMS_MAX_RECIPIENTS", "20") or 20)
    SMS_LOW_CREDIT_THRESHOLD = max(1, int(os.getenv("SMS_LOW_CREDIT_THRESHOLD", "20") or 20))
    DEEPSEEK_API_KEY = os.getenv("DEEPSEEK_API_KEY", "")
    DEEPSEEK_BASE_URL = os.getenv("DEEPSEEK_BASE_URL", "https://api.deepseek.com")
    DEEPSEEK_MODEL = os.getenv("DEEPSEEK_MODEL", "deepseek-chat")

    VERIFICATION_CODE_MINUTES = 10
    PASSWORD_RESET_MINUTES = 30
    MAX_VERIFICATION_ATTEMPTS = 5
    RESEND_COOLDOWN_SECONDS = 60
