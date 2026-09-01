import os
from pathlib import Path
from urllib.parse import unquote

from flask import Flask, abort, jsonify, redirect, request, send_from_directory
from flask_cors import CORS
from pymongo import MongoClient
from pymongo.errors import OperationFailure
from pymongo.server_api import ServerApi

from config import Config
from routes.admin_routes import admin_bp
from routes.abuse_routes import admin_abuse_bp
from routes.analytics_routes import admin_analytics_bp, analytics_bp
from routes.auth_routes import auth_bp
from routes.ai_routes import ai_bp
from routes.contact_routes import contacts_bp
from routes.contact_marketplace_routes import admin_contact_marketplace_bp, admin_contact_packages_bp, contact_marketplace_bp
from routes.dashboard_routes import dashboard_bp
from routes.developer_api_routes import admin_developer_bp, developer_bp, public_api_bp
from routes.email_routes import admin_email_bp, email_bp, gmail_bp, google_chat_bp
from routes.embed_widget_routes import admin_embed_widgets_bp, embed_widgets_bp, public_embed_widgets_bp, public_widget_page_bp
from routes.notification_routes import notifications_bp
from routes.profile_routes import profile_bp
from routes.service_control_routes import admin_service_control_bp, service_status_bp
from routes.sms_routes import admin_sms_bp, sms_bp
from routes.sms_package_routes import admin_sms_packages_bp, sms_packages_bp
from routes.smsman_routes import admin_smsman_bp
from routes.otp_routes import otp_bp
from routes.support_routes import admin_complaints_bp, support_bp
from routes.template_routes import admin_templates_bp, templates_bp
from routes.wallet_routes import admin_wallet_bp, payment_provider_public_bp, payment_webhooks_bp, wallet_bp


BASE_DIR = Path(__file__).resolve().parent.parent
DIST_DIR = BASE_DIR / "dist"

SENSITIVE_PATH_PARTS = {
    ".aws",
    ".env",
    ".git",
    ".github",
    ".htaccess",
    ".svn",
    "__pycache__",
    "backup",
    "backups",
    "config",
    "dockerfile",
    "dump",
    "env",
    "logs",
    "node_modules",
    "settings.py",
    "wp-config.php",
}
SENSITIVE_EXTENSIONS = {
    ".bak",
    ".conf",
    ".config",
    ".db",
    ".ini",
    ".key",
    ".log",
    ".old",
    ".pem",
    ".py",
    ".sql",
    ".sqlite",
    ".sqlite3",
    ".swp",
    ".tar",
    ".tgz",
    ".yaml",
    ".yml",
    ".zip",
}
FRONTEND_ROUTE_PREFIXES = {
    "admin",
    "api-access",
    "auth",
    "complaints",
    "contact",
    "cookie-policy",
    "dashboard",
    "email-sender",
    "embed",
    "faq",
    "forgot-password",
    "gdpr",
    "login",
    "otp-numbers",
    "otp-receives",
    "pricing",
    "privacy-policy",
    "register",
    "reset-password",
    "send-sms",
    "services",
    "signup",
    "terms",
    "terms-of-service",
    "user",
    "verify-email",
    "wallet",
}


def create_compatible_index(collection, keys, **kwargs):
    expected_keys = [(keys, 1)] if isinstance(keys, str) else list(keys)

    try:
        return collection.create_index(keys, **kwargs)
    except OperationFailure as exc:
        if exc.code != 86:
            raise

        requested_name = kwargs.get("name")
        if not requested_name:
            requested_name = "_".join(f"{key}_{direction}" for key, direction in expected_keys)

        for index in collection.list_indexes():
            index_keys = list(index.get("key", {}).items())
            has_required_unique = not kwargs.get("unique") or index.get("unique") is True
            if (
                index.get("name") == requested_name
                and index_keys == expected_keys
                and has_required_unique
            ):
                return requested_name

        raise


def ensure_optional_unique_string_index(collection, field: str):
    index_name = f"{field}_1"
    expected_keys = [(field, 1)]
    partial_filter = {field: {"$type": "string"}}

    for index in collection.list_indexes():
        index_keys = list(index.get("key", {}).items())
        if index.get("name") != index_name or index_keys != expected_keys:
            continue

        if (
            index.get("unique") is True
            and index.get("partialFilterExpression") == partial_filter
        ):
            collection.update_many({field: None}, {"$unset": {field: ""}})
            return index_name

        collection.drop_index(index_name)
        break

    collection.update_many({field: None}, {"$unset": {field: ""}})
    return collection.create_index(
        expected_keys,
        name=index_name,
        unique=True,
        partialFilterExpression=partial_filter,
    )


def cors_origins() -> list[str]:
    origins = {Config.FRONTEND_URL.rstrip("/")}

    if Config.FRONTEND_URL.startswith("https://viresender.com"):
        origins.add(Config.FRONTEND_URL.replace("https://viresender.com", "https://www.viresender.com", 1).rstrip("/"))
    if Config.FRONTEND_URL.startswith("https://www.viresender.com"):
        origins.add(Config.FRONTEND_URL.replace("https://www.viresender.com", "https://viresender.com", 1).rstrip("/"))

    extra_origins = os.getenv("CORS_ORIGINS", "")
    origins.update(origin.strip().rstrip("/") for origin in extra_origins.split(",") if origin.strip())
    return sorted(origins)


def is_sensitive_path(path: str) -> bool:
    clean_path = unquote(path).replace("\\", "/").strip("/")
    parts = [part.lower() for part in clean_path.split("/") if part]
    if not parts:
        return False

    return any(
        part.startswith(".")
        or part in SENSITIVE_PATH_PARTS
        or Path(part).suffix.lower() in SENSITIVE_EXTENSIONS
        for part in parts
    )


def is_frontend_route(path: str) -> bool:
    clean_path = unquote(path).strip("/")
    if not clean_path:
        return True
    return clean_path.split("/", 1)[0] in FRONTEND_ROUTE_PREFIXES


def create_app() -> Flask:
    app = Flask(__name__, static_folder=str(DIST_DIR), static_url_path="/_dist")
    app.config.from_object(Config)
    app.config.update(
        SEND_FILE_MAX_AGE_DEFAULT=31536000,
        SESSION_COOKIE_HTTPONLY=True,
        SESSION_COOKIE_SAMESITE="Lax",
        SESSION_COOKIE_SECURE=Config.FRONTEND_URL.startswith("https://"),
    )

    if not Config.MONGO_URI:
        raise RuntimeError("MONGO_URI is not set. Add it to backend/.env.")

    client = MongoClient(Config.MONGO_URI, server_api=ServerApi("1"))
    db = client.get_default_database(default=Config.MONGO_DB_NAME)
    app.config["MONGO_CLIENT"] = client
    app.config["DB"] = db

    CORS(app, resources={
        r"/api/public/widgets/*": {"origins": "*"},
        r"/api/*": {"origins": cors_origins()},
        r"/widget/*": {"origins": "*"},
        r"/v1/*": {"origins": "*"},
    })

    @app.before_request
    def block_sensitive_probe_paths():
        if request.path.startswith(("/api/", "/v1/")):
            return None
        if is_sensitive_path(request.path):
            abort(404)

    @app.after_request
    def add_security_headers(response):
        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        if not request.path.startswith("/widget/"):
            response.headers.setdefault("X-Frame-Options", "DENY")
        response.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
        response.headers.setdefault(
            "Permissions-Policy",
            "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
        )

        if request.path.startswith(("/api/", "/v1/")):
            response.headers.setdefault("Cache-Control", "no-store")

        return response

    with app.app_context():
        db.users.create_index("email", unique=True)
        ensure_optional_unique_string_index(db.users, "google_id")
        ensure_optional_unique_string_index(db.users, "github_id")
        db.contacts.create_index([("user_id", 1), ("phone", 1)], unique=True)
        db.sms_sender_ids.create_index([("user_id", 1), ("sender_id", 1)], unique=True)
        db.api_keys.create_index("api_key_hash", unique=True)
        db.api_keys.create_index([("user_id", 1), ("status", 1)])
        db.api_request_logs.create_index([("user_id", 1), ("created_at", -1)])
        db.api_request_logs.create_index([("user_id", 1), ("created_at", -1), ("status", 1)])
        db.api_request_logs.create_index([("api_key_prefix", 1), ("created_at", -1)])
        db.cookie_analytics.create_index([("visitor_id", 1), ("session_id", 1)])
        db.cookie_analytics.create_index("created_at")
        db.analytics_rate_limits.create_index("expires_at", expireAfterSeconds=0)
        create_compatible_index(db.complaints, "ticket_id", unique=True, sparse=True)
        db.complaints.create_index([("user_id", 1), ("updated_at", -1)])
        db.complaints.create_index([("status", 1), ("updated_at", -1)])
        db.contact_packages.create_index("package_id", unique=True)
        db.contact_packages.create_index("slug", unique=True)
        db.contact_packages.create_index([("status", 1), ("category", 1)])
        db.marketplace_contacts.create_index([("package_id", 1), ("normalized_phone", 1)], unique=True)
        db.contact_package_purchases.create_index([("user_id", 1), ("package_id", 1)], unique=True)
        db.contact_package_purchases.create_index([("created_at", -1)])
        create_compatible_index(db.message_templates, "template_id", unique=True, sparse=True)
        db.message_templates.create_index([("user_id", 1), ("category", 1), ("status", 1)])
        create_compatible_index(db.email_accounts, "account_id", unique=True, sparse=True)
        db.email_accounts.create_index([("user_id", 1), ("provider", 1), ("email_address", 1)])
        create_compatible_index(db.email_logs, "email_id", unique=True, sparse=True)
        db.email_logs.create_index([("rfc_message_id", 1)])
        db.email_logs.create_index([("provider_message_id", 1)])
        db.email_logs.create_index([("status", 1), ("created_at", -1)])
        db.email_logs.create_index([("user_id", 1), ("created_at", -1)])
        db.email_logs.create_index([("user_id", 1), ("created_at", -1), ("status", 1)])
        db.email_logs.create_index([("created_at", -1)])
        db.email_campaigns.create_index([("user_id", 1), ("created_at", -1)])
        create_compatible_index(db.email_copy_paste_drafts, "draft_id", unique=True, sparse=True)
        db.email_copy_paste_drafts.create_index([("user_id", 1), ("updated_at", -1)])
        create_compatible_index(db.email_send_jobs, "job_id", unique=True, sparse=True)
        db.email_send_jobs.create_index([("user_id", 1), ("created_at", -1)])
        db.email_send_jobs.create_index([("status", 1), ("created_at", 1)])
        create_compatible_index(db.email_send_queue, "queue_id", unique=True, sparse=True)
        db.email_send_queue.create_index([("job_id", 1), ("status", 1)])
        db.email_send_queue.create_index([("status", 1), ("created_at", 1)])
        create_compatible_index(db.notifications, "notification_id", unique=True, sparse=True)
        db.notifications.create_index([("user_id", 1), ("status", 1), ("created_at", -1)])
        db.notifications.create_index([("user_id", 1), ("type", 1), ("created_at", -1)])
        create_compatible_index(db.embed_widgets, "widget_id", unique=True, sparse=True)
        db.embed_widgets.create_index([("user_id", 1), ("created_at", -1)])
        db.embed_widgets.create_index([("status", 1), ("type", 1)])
        create_compatible_index(db.embed_widget_logs, "log_id", unique=True, sparse=True)
        db.embed_widget_logs.create_index([("user_id", 1), ("created_at", -1)])
        db.embed_widget_logs.create_index([("widget_id", 1), ("created_at", -1)])
        create_compatible_index(db.service_controls, "service_key", unique=True, sparse=True)
        db.service_controls.create_index([("status", 1), ("updated_at", -1)])
        db.sms_logs.create_index([("user_id", 1), ("created_at", -1), ("status", 1)])
        db.sms_logs.create_index([("provider", 1), ("country_code", 1), ("created_at", -1)])
        db.international_sms_pricing.create_index([("provider", 1), ("country_code", 1)], unique=True)
        db.international_sms_pricing.create_index([("provider", 1), ("enabled", 1), ("country_name", 1)])
        db.sms_sender_ids.create_index([("user_id", 1), ("provider", 1), ("updated_at", -1)])
        db.sms_sender_ids.create_index([("provider", 1), ("normalized_sender_id", 1), ("status", 1)])
        db.sms_sender_id_audit_logs.create_index([("provider", 1), ("sender_id", 1), ("created_at", -1)])
        create_compatible_index(db.moolre_unlinked_sender_ids, [("provider", 1), ("normalized_sender_id", 1)], unique=True, sparse=True)
        db.smsman_countries.create_index([("provider", 1), ("country_id", 1)], unique=True, sparse=True)
        db.smsman_countries.create_index([("provider", 1), ("is_active", 1), ("title", 1)])
        db.smsman_countries.create_index([("provider", 1), ("is_active", 1), ("code", 1)])
        db.smsman_services.create_index([("provider", 1), ("provider_id", 1)], unique=True, sparse=True)
        db.smsman_services.create_index([("provider", 1), ("is_active", 1), ("title", 1)])
        db.smsman_services.create_index([("provider", 1), ("is_active", 1), ("name", 1)])
        db.smsman_services.create_index([("provider", 1), ("is_active", 1), ("code", 1)])
        db.smsman_pricing_rules.create_index([("provider", 1), ("scope", 1)])
        db.smsman_pricing_rules.create_index([("provider", 1), ("country_id", 1), ("service_id", 1), ("is_active", 1)])
        db.smsman_pricing_rules.create_index([("is_active", 1)])
        db.smsman_price_cache.create_index([("provider", 1), ("service_id", 1)], unique=True)
        db.smsman_price_cache.create_index("expires_at")
        db.otp_orders.create_index([("user_id", 1), ("created_at", -1)])
        db.otp_orders.create_index([("user_id", 1), ("status", 1), ("expires_at", 1)])
        db.otp_orders.create_index([("provider", 1), ("status", 1), ("expires_at", 1)])
        create_compatible_index(db.otp_orders, "provider_request_id", unique=True, sparse=True)
        db.otp_orders.create_index([("status", 1), ("expires_at", 1), ("created_at", -1)])
        db.otp_orders.create_index([("created_at", -1)])
        create_compatible_index(db.provider_settings, "provider", unique=True, sparse=True)
        db.smsman_request_logs.create_index([("provider", 1), ("created_at", -1)])
        db.smsman_request_logs.create_index([("action", 1), ("created_at", -1)])
        db.smsman_request_logs.create_index([("status", 1), ("created_at", -1)])
        db.smsman_request_logs.create_index([("request_id", 1)])
        db.smsman_request_logs.create_index([("user_id", 1), ("created_at", -1)])
        db.smsman_request_logs.create_index([("otp_order_id", 1), ("created_at", -1)])
        db.wallet_transactions.create_index([("user_id", 1), ("created_at", -1)])
        db.sms_packages.create_index([("is_active", 1), ("total_sms", 1)])
        db.sms_package_purchases.create_index([("user_id", 1), ("created_at", -1)])
        db.user_sms_credit_batches.create_index([("user_id", 1), ("status", 1), ("expires_at", 1)])
        create_compatible_index(db.user_sms_credit_batches, "purchase_key", unique=True, sparse=True)
        db.sms_credit_transactions.create_index([("user_id", 1), ("created_at", -1)])
        db.sms_credit_transactions.create_index([("reference", 1), ("type", 1)])
        create_compatible_index(db.payment_settings, "provider", unique=True, sparse=True)
        create_compatible_index(db.wallet_transactions, "reference", unique=True, sparse=True)
        db.wallet_transactions.create_index(
            [("provider", 1), ("external_reference", 1)],
            unique=True,
            partialFilterExpression={"provider": {"$type": "string"}, "external_reference": {"$type": "string"}},
        )
        db.wallet_transactions.create_index(
            [("provider", 1), ("provider_transaction_id", 1)],
            unique=True,
            partialFilterExpression={"provider": {"$type": "string"}, "provider_transaction_id": {"$type": "string"}},
        )
        db.wallet_transactions.create_index([("provider", 1), ("status", 1), ("created_at", -1)])
        db.payment_webhook_events.create_index([("provider", 1), ("created_at", -1)])
        db.admin_activity_logs.create_index([("action", 1), ("created_at", -1)])
        create_compatible_index(db.abuse_events, "event_id", unique=True, sparse=True)
        db.abuse_events.create_index([("status", 1), ("created_at", -1)])
        db.abuse_events.create_index([("user_id", 1), ("type", 1), ("created_at", -1)])
        db.ai_usage_logs.create_index([("user_id", 1), ("created_at", -1)])
        db.ai_usage_logs.create_index([("provider", 1), ("model", 1), ("created_at", -1)])
        create_compatible_index(db.ai_conversations, "conversation_id", unique=True, sparse=True)
        db.ai_conversations.create_index([("user_id", 1), ("updated_at", -1)])
        create_compatible_index(db.ai_conversation_messages, "message_id", unique=True, sparse=True)
        db.ai_conversation_messages.create_index([("conversation_id", 1), ("created_at", 1)])
        db.ai_conversation_messages.create_index([("user_id", 1), ("created_at", -1)])
        create_compatible_index(db.ai_campaign_drafts, "draft_id", unique=True, sparse=True)
        db.ai_campaign_drafts.create_index([("user_id", 1), ("updated_at", -1)])
        db.ai_campaign_drafts.create_index([("conversation_id", 1), ("updated_at", -1)])
        db.ai_campaign_drafts.create_index("expires_at")
        db.ai_action_audit_logs.create_index([("user_id", 1), ("created_at", -1)])
        db.ai_action_audit_logs.create_index([("conversation_id", 1), ("created_at", -1)])

    app.register_blueprint(auth_bp)
    app.register_blueprint(ai_bp)
    app.register_blueprint(analytics_bp)
    app.register_blueprint(profile_bp)
    app.register_blueprint(contacts_bp)
    app.register_blueprint(contact_marketplace_bp)
    app.register_blueprint(dashboard_bp)
    app.register_blueprint(developer_bp)
    app.register_blueprint(public_api_bp)
    app.register_blueprint(sms_bp)
    app.register_blueprint(sms_packages_bp)
    app.register_blueprint(support_bp)
    app.register_blueprint(templates_bp)
    app.register_blueprint(email_bp)
    app.register_blueprint(gmail_bp)
    app.register_blueprint(google_chat_bp)
    app.register_blueprint(notifications_bp)
    app.register_blueprint(service_status_bp)
    app.register_blueprint(embed_widgets_bp)
    app.register_blueprint(public_embed_widgets_bp)
    app.register_blueprint(public_widget_page_bp)
    app.register_blueprint(admin_bp)
    app.register_blueprint(admin_abuse_bp)
    app.register_blueprint(admin_analytics_bp)
    app.register_blueprint(admin_sms_bp)
    app.register_blueprint(admin_sms_packages_bp)
    app.register_blueprint(admin_smsman_bp)
    app.register_blueprint(otp_bp)
    app.register_blueprint(admin_developer_bp)
    app.register_blueprint(admin_complaints_bp)
    app.register_blueprint(admin_contact_packages_bp)
    app.register_blueprint(admin_contact_marketplace_bp)
    app.register_blueprint(admin_email_bp)
    app.register_blueprint(admin_templates_bp)
    app.register_blueprint(admin_embed_widgets_bp)
    app.register_blueprint(admin_service_control_bp)
    app.register_blueprint(wallet_bp)
    app.register_blueprint(payment_provider_public_bp)
    app.register_blueprint(payment_webhooks_bp)
    app.register_blueprint(admin_wallet_bp)

    @app.get("/api/health")
    def health():
        return jsonify({"ok": True, "message": "Backend working"})

    @app.get("/health")
    def render_health():
        return jsonify({"status": "ok", "app": "VireSend"})

    @app.before_request
    def enforce_www_canonical():
        if request.method != "GET":
            return None
        host = (request.host or "").split(":")[0].strip().lower()
        if host != "viresender.com":
            return None
        query = f"?{request.query_string.decode('utf-8')}" if request.query_string else ""
        return redirect(f"https://www.viresender.com{request.path}{query}", code=301)

    @app.get("/")
    def serve_index():
        return send_from_directory(app.static_folder, "index.html")

    @app.get("/robots.txt")
    def serve_robots():
        return send_from_directory(app.static_folder, "robots.txt")

    @app.get("/sitemap.xml")
    def serve_sitemap():
        return send_from_directory(app.static_folder, "sitemap.xml")

    @app.get("/<path:path>")
    def serve_react_routes(path):
        if path.startswith(("api/", "v1/")):
            abort(404)

        full_path = os.path.join(app.static_folder, path)
        if os.path.exists(full_path) and os.path.isfile(full_path):
            return send_from_directory(app.static_folder, path)
        nested_index = os.path.join(app.static_folder, path, "index.html")
        if os.path.exists(nested_index) and os.path.isfile(nested_index):
            return send_from_directory(app.static_folder, os.path.join(path, "index.html"))
        if not is_frontend_route(path):
            abort(404)
        return send_from_directory(app.static_folder, "index.html")

    @app.errorhandler(404)
    def not_found(error):
        if request.path.startswith(("/api/", "/v1/")):
            return jsonify({"success": False, "message": "API route not found."}), 404
        return jsonify({"success": False, "message": "Not found."}), 404

    return app


app = create_app()


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)
