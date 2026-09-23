import secrets
from datetime import timedelta

import requests
from bson import ObjectId
from flask import Blueprint, current_app, jsonify, request

from config import Config
from services.moolre_service import MoolreError, MoolreService, mask_phone
from services.payment_provider_settings import (
    active_public_response,
    get_provider,
    is_complete,
    safe_provider,
    save_moolre,
    save_paystack,
    set_default,
    set_provider_status,
    to_amount,
)
from services.wallet_crediting import credit_verified_deposit
from utils.auth import require_admin, require_auth, users_collection
from utils.security import clean_string, now_utc
from utils.service_control import check_service_available

wallet_bp = Blueprint("wallet", __name__, url_prefix="/api/wallet")
payment_provider_public_bp = Blueprint("payment_provider_public", __name__, url_prefix="/api/payment-providers")
payment_webhooks_bp = Blueprint("payment_webhooks", __name__, url_prefix="/api/payments")
admin_wallet_bp = Blueprint("admin_wallet", __name__, url_prefix="/api/admin")

PAYSTACK_INITIALIZE_URL = "https://api.paystack.co/transaction/initialize"
PAYSTACK_VERIFY_URL = "https://api.paystack.co/transaction/verify/{reference}"


def iso(value):
    return value.isoformat() if value else None


def db():
    return current_app.config["DB"]


def wallet_transactions_collection():
    return db().wallet_transactions


def get_paystack_settings(include_secret=False):
    settings = get_provider("paystack", include_secret=include_secret)
    return {
        **settings,
        "enabled": bool(settings.get("is_active")),
        "min_deposit": to_amount(settings.get("minimum_deposit"), 1),
        "max_deposit": to_amount(settings.get("maximum_deposit"), 1000),
        "has_secret_key": bool(settings.get("secret_key")),
        "has_webhook_secret": bool(settings.get("webhook_secret")),
    }


def safe_transaction(txn: dict, user: dict | None = None) -> dict:
    amount = to_amount(txn.get("amount"))
    txn_type = txn.get("type", "credit")
    signed_amount = amount if txn_type in {"credit", "deposit", "refund", "wallet_deposit", "sms_package_purchase"} else -amount
    return {
        "id": str(txn.get("_id")),
        "user_id": str(txn.get("user_id")) if txn.get("user_id") else None,
        "user_name": user.get("full_name", "") if user else txn.get("user_name", ""),
        "user_email": user.get("email") if user else txn.get("user_email"),
        "type": "credit" if txn_type == "wallet_deposit" else txn_type,
        "label": txn.get("label") or txn.get("reason") or ("SMS package purchase" if txn_type == "sms_package_purchase" else "Wallet deposit" if txn_type in {"credit", "deposit", "wallet_deposit"} else "Wallet debit"),
        "method": txn.get("method") or txn.get("provider", "admin").title(),
        "amount": signed_amount,
        "raw_amount": amount,
        "currency": txn.get("currency", "GHS"),
        "status": txn.get("status", "success"),
        "reference": txn.get("reference") or txn.get("external_reference") or txn.get("provider_reference") or str(txn.get("_id")),
        "external_reference": txn.get("external_reference") or txn.get("reference"),
        "provider_transaction_id": txn.get("provider_transaction_id"),
        "provider_code": txn.get("provider_code"),
        "provider_message": txn.get("provider_message"),
        "network": txn.get("network"),
        "phone_number": mask_phone(txn.get("phone_number")),
        "wallet_credited": bool(txn.get("wallet_credited")),
        "balance_before": to_amount(txn.get("balance_before")),
        "balance_after": to_amount(txn.get("balance_after")),
        "reason": txn.get("reason", ""),
        "provider": txn.get("provider", "admin"),
        "created_at": iso(txn.get("created_at")),
        "updated_at": iso(txn.get("updated_at")),
    }


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
    return user, None


def create_reference(prefix="VIRE-DEP"):
    clean_prefix = clean_string(prefix).upper().replace(" ", "-") or "VIRE-DEP"
    return f"{clean_prefix}-{now_utc().strftime('%Y%m%d%H%M%S')}-{secrets.token_hex(5).upper()}"


def paystack_provider_message(paystack_data: dict | None) -> str:
    message = clean_string((paystack_data or {}).get("message", ""))
    return message or "Paystack rejected the request."


def validate_paystack_secret_key(secret_key: str) -> tuple[bool, str]:
    try:
        response = requests.get(
            PAYSTACK_VERIFY_URL.format(reference="viresend-key-check"),
            headers={"Authorization": f"Bearer {secret_key}"},
            timeout=12,
        )
        data = response.json()
        if not isinstance(data, dict):
            return False, "Paystack returned an invalid response while validating the key."
    except requests.RequestException:
        return False, "Unable to reach Paystack to validate the secret key."
    except ValueError:
        return False, "Paystack returned an invalid response while validating the key."

    message = paystack_provider_message(data)
    if "invalid key" in message.lower():
        return False, "Paystack secret key is invalid or revoked."
    return True, message


def create_pending_deposit(user, provider, amount, currency, reference, extra=None):
    now = now_utc()
    doc = {
        "user_id": user["_id"],
        "wallet_id": str(user["_id"]),
        "type": "wallet_deposit",
        "label": f"{provider.title()} wallet deposit",
        "method": provider.title(),
        "provider": provider,
        "amount": amount,
        "currency": currency,
        "status": "created",
        "reference": reference,
        "external_reference": reference,
        "provider_reference": None,
        "provider_transaction_id": None,
        "third_party_reference": None,
        "wallet_credited": False,
        "balance_before": to_amount(user.get("wallet_balance")),
        "balance_after": to_amount(user.get("wallet_balance")),
        "created_at": now,
        "updated_at": now,
    }
    doc.update(extra or {})
    result = wallet_transactions_collection().insert_one(doc)
    doc["_id"] = result.inserted_id
    return doc


def validate_amount(amount, settings):
    minimum = to_amount(settings.get("minimum_deposit"), 1)
    maximum = to_amount(settings.get("maximum_deposit"), 1000)
    if amount < minimum:
        return f"The amount must be at least GHS {minimum:.2f}."
    if amount > maximum:
        return f"The amount must be at most GHS {maximum:.2f}."
    return ""


def build_paystack_callback(reference, purpose="wallet_deposit"):
    if purpose == "sms_package":
        return f"{Config.FRONTEND_URL.rstrip('/')}/user/sms-packages?reference={reference}"
    callback_base_url = Config.PAYSTACK_CALLBACK_URL or f"{Config.FRONTEND_URL.rstrip('/')}/user/wallet"
    return f"{callback_base_url.rstrip('/')}?reference={reference}"


def build_moolre_callback_url(settings):
    return settings.get("callback_url") or Config.MOOLRE_CALLBACK_URL or f"{Config.FRONTEND_URL.rstrip('/')}/api/payments/moolre/webhook"


def build_moolre_redirect_url(settings, deposit_id, reference):
    base_url = settings.get("redirect_url") or Config.MOOLRE_REDIRECT_URL or f"{Config.FRONTEND_URL.rstrip('/')}/wallet/deposit/moolre/return"
    separator = "&" if "?" in base_url else "?"
    return f"{base_url}{separator}deposit_id={deposit_id}&reference={reference}"


def build_sms_package_moolre_redirect_url(deposit_id, reference):
    return f"{Config.FRONTEND_URL.rstrip('/')}/wallet/deposit/moolre/return?deposit_id={deposit_id}&reference={reference}&purpose=sms_package"


def initialize_paystack_for_user(user, amount, transaction_extra=None):
    settings = get_provider("paystack", include_secret=True)
    if not settings.get("is_active"):
        return {"success": False, "message": "Paystack deposits are currently unavailable."}, 400
    if not is_complete(settings):
        return {"success": False, "message": "Paystack is not fully configured yet."}, 400
    amount_error = validate_amount(amount, settings)
    if amount_error:
        return {"success": False, "message": amount_error}, 400
    if not user.get("email"):
        return {"success": False, "message": "A verified email address is required to deposit."}, 400

    reference = create_reference("VIRE-DEP")
    transaction = create_pending_deposit(user, "paystack", amount, settings["currency"], reference, transaction_extra)
    wallet_transactions_collection().update_one({"_id": transaction["_id"]}, {"$set": {"status": "initiating", "updated_at": now_utc()}})
    try:
        response = requests.post(
            PAYSTACK_INITIALIZE_URL,
            headers={"Authorization": f"Bearer {settings['secret_key']}", "Content-Type": "application/json"},
            json={
                "email": user["email"],
                "amount": int(round(amount * 100)),
                "currency": settings["currency"],
                "reference": reference,
                "callback_url": build_paystack_callback(reference, (transaction_extra or {}).get("purpose", "wallet_deposit")),
            },
            timeout=20,
        )
        paystack_data = response.json()
        if not isinstance(paystack_data, dict):
            raise ValueError
    except requests.RequestException:
        wallet_transactions_collection().update_one({"_id": transaction["_id"]}, {"$set": {"status": "failed", "updated_at": now_utc(), "failure_reason": "Paystack initialization failed"}})
        return {"success": False, "message": "Unable to start Paystack payment. Please try again."}, 502
    except ValueError:
        wallet_transactions_collection().update_one({"_id": transaction["_id"]}, {"$set": {"status": "failed", "updated_at": now_utc(), "failure_reason": "Paystack returned an invalid response"}})
        return {"success": False, "message": "Paystack returned an invalid response. Please try again."}, 502

    if not response.ok or not paystack_data.get("status"):
        provider_message = paystack_provider_message(paystack_data)
        current_app.logger.warning("Paystack initialize failed reference=%s status=%s message=%s", reference, response.status_code, provider_message)
        wallet_transactions_collection().update_one(
            {"_id": transaction["_id"]},
            {"$set": {"status": "failed", "updated_at": now_utc(), "failure_reason": provider_message, "provider_code": response.status_code, "provider_message": provider_message}},
        )
        return {"success": False, "message": f"Unable to start Paystack payment: {provider_message}", "provider_message": provider_message}, 400

    data = paystack_data.get("data") or {}
    wallet_transactions_collection().update_one(
        {"_id": transaction["_id"]},
        {"$set": {
            "status": "pending",
            "authorization_url": data.get("authorization_url"),
            "provider_response": {"access_code": data.get("access_code")},
            "provider_reference": reference,
            "updated_at": now_utc(),
        }},
    )
    return jsonify({
        "success": True,
        "message": "Payment initialized.",
        "provider": "paystack",
        "authorization_url": data.get("authorization_url"),
        "reference": reference,
        "deposit_id": str(transaction["_id"]),
        "next_action": "redirect",
    })


def verify_paystack_reference(reference, user):
    txn = wallet_transactions_collection().find_one({"reference": reference, "user_id": user["_id"]})
    if not txn:
        return {"success": False, "message": "Payment transaction was not found."}, 404
    if txn.get("wallet_credited") or txn.get("status") == "success":
        return jsonify({"success": True, "message": "Wallet already credited.", "balance": to_amount(user.get("wallet_balance")), "transaction": safe_transaction(txn)})

    settings = get_provider("paystack", include_secret=True)
    if not settings.get("secret_key"):
        return {"success": False, "message": "Paystack is not fully configured yet."}, 400

    try:
        response = requests.get(PAYSTACK_VERIFY_URL.format(reference=reference), headers={"Authorization": f"Bearer {settings['secret_key']}"}, timeout=20)
        paystack_data = response.json()
    except requests.RequestException:
        return {"success": False, "message": "Unable to verify payment right now."}, 502
    except ValueError:
        return {"success": False, "message": "Paystack returned an invalid verification response."}, 502

    payment = paystack_data.get("data") or {}
    paid_amount = to_amount((payment.get("amount") or 0) / 100)
    expected_amount = to_amount(txn.get("amount"))
    paid_currency = payment.get("currency") or txn.get("currency", "GHS")
    if not response.ok or not paystack_data.get("status") or payment.get("status") != "success":
        wallet_transactions_collection().update_one({"_id": txn["_id"], "wallet_credited": {"$ne": True}}, {"$set": {"status": "failed", "updated_at": now_utc(), "failure_reason": paystack_data.get("message", "Payment not successful")}})
        return {"success": False, "message": "Payment was not successful."}, 400
    if paid_amount < expected_amount or paid_currency != txn.get("currency", "GHS"):
        wallet_transactions_collection().update_one({"_id": txn["_id"], "wallet_credited": {"$ne": True}}, {"$set": {"status": "verification_failed", "updated_at": now_utc(), "failure_reason": "Payment amount or currency mismatch"}})
        return {"success": False, "message": "Payment verification failed."}, 400

    wallet_transactions_collection().update_one(
        {"_id": txn["_id"]},
        {"$set": {
            "status": "success",
            "provider_transaction_id": str(payment.get("id") or ""),
            "provider_response": {"id": payment.get("id"), "channel": payment.get("channel"), "paid_at": payment.get("paid_at")},
            "updated_at": now_utc(),
        }},
    )
    result = credit_verified_deposit(db(), txn["_id"], {"verified_at": now_utc()})
    refreshed_user = users_collection().find_one({"_id": user["_id"]}) or user
    return jsonify({
        "success": True,
        "message": "Wallet credited successfully." if result.get("credited") else "Wallet already credited.",
        "balance": to_amount(refreshed_user.get("wallet_balance")),
        "transaction": safe_transaction(result.get("transaction") or txn),
    })


def verify_moolre_transaction(txn):
    settings = get_provider("moolre", include_secret=True)
    service = MoolreService(settings, current_app.logger)
    status = service.check_payment_status(txn.get("external_reference") or txn.get("reference"), idtype="1")
    expected_amount = to_amount(txn.get("amount"))
    paid_amount = to_amount(status.get("amount"), -1)
    updates = {
        "last_verified_at": now_utc(),
        "provider_code": status.get("provider_code"),
        "provider_message": status.get("provider_message"),
        "provider_transaction_id": status.get("provider_transaction_id") or txn.get("provider_transaction_id"),
        "third_party_reference": status.get("third_party_reference") or txn.get("third_party_reference"),
        "provider_response": status.get("raw"),
        "updated_at": now_utc(),
    }
    if status.get("status") != "successful":
        updates["status"] = "pending" if status.get("status") == "pending" else "failed"
        wallet_transactions_collection().update_one({"_id": txn["_id"], "wallet_credited": {"$ne": True}}, {"$set": updates})
        return False, "A payment request was sent, but its final status is still being confirmed." if updates["status"] == "pending" else "The payment could not be verified."
    if status.get("external_reference") != (txn.get("external_reference") or txn.get("reference")):
        updates.update({"status": "verification_failed", "failure_reason": "External reference mismatch"})
        wallet_transactions_collection().update_one({"_id": txn["_id"], "wallet_credited": {"$ne": True}}, {"$set": updates})
        return False, "The payment could not be verified."
    if status.get("account_number") != settings.get("account_number"):
        updates.update({"status": "verification_failed", "failure_reason": "Account number mismatch"})
        wallet_transactions_collection().update_one({"_id": txn["_id"], "wallet_credited": {"$ne": True}}, {"$set": updates})
        return False, "The payment could not be verified."
    if paid_amount != expected_amount:
        updates.update({"status": "verification_failed", "failure_reason": "Amount mismatch"})
        wallet_transactions_collection().update_one({"_id": txn["_id"], "wallet_credited": {"$ne": True}}, {"$set": updates})
        return False, "The payment could not be verified."
    updates["status"] = "success"
    wallet_transactions_collection().update_one({"_id": txn["_id"]}, {"$set": updates})
    return True, "Payment verified."


@wallet_bp.get("")
@require_auth
def wallet_summary(payload):
    user, error = require_active_user(payload)
    if error:
        return error
    txns = wallet_transactions_collection().find({"user_id": user["_id"]}).sort("created_at", -1).limit(50)
    return jsonify({"success": True, "balance": to_amount(user.get("wallet_balance")), "currency": "GHS", "transactions": [safe_transaction(txn) for txn in txns]})


@payment_provider_public_bp.get("/active")
def active_payment_providers():
    return jsonify(active_public_response())


@wallet_bp.post("/deposits")
@require_auth
def create_wallet_deposit(payload):
    locked = check_service_available("wallet_topup")
    if locked:
        return locked
    user, error = require_active_user(payload)
    if error:
        return error
    data = request.get_json(silent=True) or {}
    provider = clean_string(data.get("provider", "paystack")).lower()
    amount = to_amount(data.get("amount"))
    package = None
    package_id = clean_string(data.get("sms_package_id", ""))
    if package_id:
        try:
            package = db().sms_packages.find_one({"_id": ObjectId(package_id), "is_active": True})
        except Exception:
            package = None
        if not package:
            return {"success": False, "message": "SMS package not found or unavailable."}, 404
        amount = to_amount(package.get("amount"))
    transaction_extra = ({
        "type": "sms_package_purchase", "purpose": "sms_package", "label": f"{provider.title()} SMS package purchase",
        "sms_package_id": package["_id"], "package_name": package["name"], "total_sms": int(package["total_sms"]),
    } if package else None)
    if amount <= 0:
        return {"success": False, "message": "Enter a valid deposit amount."}, 400
    if provider == "paystack":
        return initialize_paystack_for_user(user, amount, transaction_extra)
    if provider != "moolre":
        return {"success": False, "message": "The selected payment provider is currently unavailable."}, 400

    settings = get_provider("moolre", include_secret=True)
    if not settings.get("is_active") or not is_complete(settings):
        return {"success": False, "message": "The selected payment provider is currently unavailable."}, 400
    amount_error = validate_amount(amount, settings)
    if amount_error:
        return {"success": False, "message": amount_error}, 400
    if not user.get("email"):
        return {"success": False, "message": "A verified email address is required to deposit."}, 400

    service = MoolreService(settings, current_app.logger)
    reference = create_reference(settings.get("reference_prefix", "VIRE-DEP"))
    txn = create_pending_deposit(
        user,
        "moolre",
        amount,
        settings.get("currency", "GHS"),
        reference,
        {
            "environment": settings.get("environment"),
            "checkout_type": "hosted_pos",
            "status": "initiating",
            "expires_at": now_utc() + timedelta(minutes=int(settings.get("link_expiration_minutes") or 30)),
            **(transaction_extra or {}),
        },
    )
    try:
        link = service.generate_payment_link(
            amount=amount,
            email=user.get("email"),
            external_reference=reference,
            callback_url=build_moolre_callback_url(settings),
            redirect_url=build_sms_package_moolre_redirect_url(str(txn["_id"]), reference) if package else build_moolre_redirect_url(settings, str(txn["_id"]), reference),
            account_number=settings.get("account_number"),
            currency=settings.get("currency", "GHS"),
            expiration_time=int(settings.get("link_expiration_minutes") or 30),
            metadata={
                "deposit_id": str(txn["_id"]),
                "user_id": str(user["_id"]),
                "wallet_id": str(user["_id"]),
                "purpose": "sms_package" if package else "wallet_deposit",
            },
        )
    except MoolreError as exc:
        status = "processing" if exc.code == "timeout" else "failed"
        wallet_transactions_collection().update_one(
            {"_id": txn["_id"]},
            {"$set": {"status": status, "provider_code": exc.code, "provider_message": exc.message, "failure_reason": None if status == "processing" else exc.message, "provider_response": exc.raw, "updated_at": now_utc()}},
        )
        http_status = 202 if status == "processing" else 400
        return {"success": status == "processing", "message": "Unable to prepare the Moolre payment page. Please try again.", "deposit_id": str(txn["_id"]), "reference": reference, "status": status}, http_status

    wallet_transactions_collection().update_one(
        {"_id": txn["_id"]},
        {"$set": {
            "status": "pending",
            "provider_reference": link.get("provider_reference"),
            "provider_code": link.get("provider_code"),
            "provider_message": link.get("provider_message"),
            "provider_response": link.get("raw"),
            "authorization_url": link.get("authorization_url"),
            "updated_at": now_utc(),
        }},
    )
    return jsonify({
        "success": True,
        "message": "Payment initialized.",
        "deposit": {
            "id": str(txn["_id"]),
            "provider": "moolre",
            "amount": amount,
            "currency": settings.get("currency", "GHS"),
            "status": "pending",
            "external_reference": reference,
        },
        "provider": "moolre",
        "deposit_id": str(txn["_id"]),
        "reference": reference,
        "authorization_url": link.get("authorization_url"),
        "next_action": {"type": "redirect", "authorization_url": link.get("authorization_url")},
    })


@wallet_bp.post("/deposits/<deposit_id>/verify")
@require_auth
def verify_wallet_deposit(payload, deposit_id):
    user, error = require_active_user(payload)
    if error:
        return error
    try:
        object_id = ObjectId(deposit_id)
    except Exception:
        return {"success": False, "message": "Invalid deposit id."}, 400
    txn = wallet_transactions_collection().find_one({"_id": object_id, "user_id": user["_id"]})
    if not txn:
        return {"success": False, "message": "Payment transaction was not found."}, 404
    if txn.get("provider") == "paystack":
        return verify_paystack_reference(txn.get("reference"), user)
    if txn.get("provider") != "moolre":
        return {"success": False, "message": "Unsupported payment provider."}, 400
    if txn.get("wallet_credited"):
        return jsonify({"success": True, "message": "This transaction has already been credited.", "transaction": safe_transaction(txn), "balance": to_amount(user.get("wallet_balance"))})
    try:
        verified, message = verify_moolre_transaction(txn)
    except MoolreError:
        return {"success": False, "message": "Moolre is temporarily unavailable. Please try again."}, 502
    if not verified:
        refreshed = wallet_transactions_collection().find_one({"_id": object_id}) or txn
        return jsonify({"success": True, "message": message, "status": refreshed.get("status"), "transaction": safe_transaction(refreshed), "balance": to_amount(user.get("wallet_balance"))})
    result = credit_verified_deposit(db(), object_id, {"verified_at": now_utc()})
    refreshed_user = users_collection().find_one({"_id": user["_id"]}) or user
    return jsonify({"success": True, "message": "Wallet credited successfully." if result.get("credited") else "This transaction has already been credited.", "status": "success", "transaction": safe_transaction(result.get("transaction") or txn), "balance": to_amount(refreshed_user.get("wallet_balance"))})


@wallet_bp.post("/paystack/initialize")
@require_auth
def initialize_paystack(payload):
    user, error = require_active_user(payload)
    if error:
        return error
    data = request.get_json(silent=True) or {}
    return initialize_paystack_for_user(user, to_amount(data.get("amount")))


@wallet_bp.post("/paystack/verify")
@require_auth
def verify_paystack(payload):
    user, error = require_active_user(payload)
    if error:
        return error
    data = request.get_json(silent=True) or {}
    reference = clean_string(data.get("reference", ""))
    if not reference:
        return {"success": False, "message": "Payment reference is required."}, 400
    return verify_paystack_reference(reference, user)


@wallet_bp.post("/deposits/<deposit_id>/otp")
@require_auth
def submit_moolre_otp(payload, deposit_id):
    return {"success": False, "message": "Moolre wallet deposits use the hosted payment page."}, 410


@payment_webhooks_bp.post("/moolre/webhook")
def moolre_webhook():
    payload = request.get_json(silent=True) or {}
    data = payload.get("data") if isinstance(payload.get("data"), dict) else {}
    metadata = data.get("metadata") if isinstance(data.get("metadata"), dict) else payload.get("metadata") if isinstance(payload.get("metadata"), dict) else {}
    external_reference = clean_string(data.get("externalref") or data.get("external_reference") or payload.get("externalref") or payload.get("external_reference") or metadata.get("externalref") or metadata.get("external_reference") or "")
    db().payment_webhook_events.insert_one({"provider": "moolre", "payload": payload, "external_reference": external_reference, "created_at": now_utc()})
    if not external_reference:
        return jsonify({"success": True})
    txn = wallet_transactions_collection().find_one({"provider": "moolre", "external_reference": external_reference})
    if not txn or txn.get("wallet_credited"):
        return jsonify({"success": True})
    try:
        verified, _message = verify_moolre_transaction(txn)
        if verified:
            credit_verified_deposit(db(), txn["_id"], {"verified_at": now_utc()})
    except Exception:
        current_app.logger.exception("Moolre webhook verification failed reference=%s", external_reference)
    return jsonify({"success": True})


@admin_wallet_bp.get("/payment-providers")
@require_admin
def admin_payment_providers(payload):
    return jsonify({"success": True, "providers": [safe_provider(get_provider("moolre")), safe_provider(get_provider("paystack"))], "default_provider": active_public_response().get("default_provider")})


@admin_wallet_bp.get("/payment-providers/moolre")
@require_admin
def admin_get_moolre(payload):
    return jsonify({"success": True, "settings": safe_provider(get_provider("moolre"))})


@admin_wallet_bp.patch("/payment-providers/moolre")
@require_admin
def admin_patch_moolre(payload):
    try:
        settings = save_moolre(request.get_json(silent=True) or {}, payload.get("user_id", "admin"))
    except ValueError as exc:
        return {"success": False, "message": str(exc)}, 400
    return jsonify({"success": True, "message": "Moolre settings saved successfully.", "settings": safe_provider(settings)})


@admin_wallet_bp.patch("/payment-providers/moolre/status")
@require_admin
def admin_moolre_status(payload):
    try:
        settings = set_provider_status("moolre", bool((request.get_json(silent=True) or {}).get("is_active")), payload.get("user_id", "admin"))
    except ValueError as exc:
        return {"success": False, "message": str(exc)}, 400
    return jsonify({"success": True, "settings": safe_provider(settings)})


@admin_wallet_bp.post("/payment-providers/moolre/test")
@require_admin
def admin_test_moolre(payload):
    settings = get_provider("moolre", include_secret=True)
    data = request.get_json(silent=True) or {}
    if data:
        preview = dict(settings)
        preview.update({k: v for k, v in data.items() if k not in {"private_key", "public_key"}})
        if data.get("private_key"):
            preview["private_key"] = clean_string(data.get("private_key"))
        if data.get("public_key"):
            preview["public_key"] = clean_string(data.get("public_key"))
        settings = preview
    now = now_utc()
    try:
        result = MoolreService(settings, current_app.logger).check_account_status()
    except MoolreError as exc:
        db().payment_settings.update_one({"_id": "moolre"}, {"$set": {"last_connection_test_at": now, "last_connection_test_result": "failed", "last_connection_test_message": exc.message, "updated_at": now}}, upsert=True)
        return {"success": False, "message": exc.message, "code": exc.code, "checked_at": iso(now)}, 400
    db().payment_settings.update_one({"_id": "moolre"}, {"$set": {"last_connection_test_at": now, "last_connection_test_result": "success", "last_connection_test_message": result["message"], "updated_at": now}}, upsert=True)
    return jsonify({k: v for k, v in result.items() if k != "raw"} | {"checked_at": iso(now)})


@admin_wallet_bp.get("/payment-providers/paystack")
@require_admin
def admin_get_paystack(payload):
    return jsonify({"success": True, "settings": safe_provider(get_provider("paystack", include_secret=True))})


@admin_wallet_bp.patch("/payment-providers/paystack")
@require_admin
def admin_patch_paystack(payload):
    data = request.get_json(silent=True) or {}
    existing = get_provider("paystack", include_secret=True)
    secret = clean_string(data.get("secret_key", "")) or existing.get("secret_key", "")
    if bool(data.get("is_active", data.get("enabled", existing.get("is_active")))) and secret:
        ok, message = validate_paystack_secret_key(secret)
        if not ok:
            return {"success": False, "message": message}, 400
    try:
        settings = save_paystack(data, payload.get("user_id", "admin"))
    except ValueError as exc:
        return {"success": False, "message": str(exc)}, 400
    return jsonify({"success": True, "message": "Paystack settings saved successfully.", "settings": safe_provider(settings)})


@admin_wallet_bp.patch("/payment-providers/paystack/status")
@require_admin
def admin_paystack_status(payload):
    try:
        settings = set_provider_status("paystack", bool((request.get_json(silent=True) or {}).get("is_active")), payload.get("user_id", "admin"))
    except ValueError as exc:
        return {"success": False, "message": str(exc)}, 400
    return jsonify({"success": True, "settings": safe_provider(settings)})


@admin_wallet_bp.post("/payment-providers/paystack/test")
@require_admin
def admin_test_paystack(payload):
    data = request.get_json(silent=True) or {}
    secret = clean_string(data.get("secret_key", "")) or get_provider("paystack", include_secret=True).get("secret_key", "")
    if not secret:
        return {"success": False, "message": "Paystack secret key is required."}, 400
    ok, message = validate_paystack_secret_key(secret)
    if not ok:
        return {"success": False, "message": message}, 400
    return jsonify({"success": True, "message": "Paystack connection verified.", "checked_at": iso(now_utc())})


@admin_wallet_bp.patch("/payment-providers/default")
@require_admin
def admin_default_provider(payload):
    provider = clean_string((request.get_json(silent=True) or {}).get("provider", "")).lower()
    try:
        selected = set_default(provider, payload.get("user_id", "admin"))
    except ValueError as exc:
        return {"success": False, "message": str(exc)}, 400
    return jsonify({"success": True, "default_provider": selected})


@admin_wallet_bp.get("/payment-settings/paystack")
@require_admin
def read_paystack_settings(payload):
    return jsonify({"success": True, "settings": safe_provider(get_provider("paystack", include_secret=True))})


@admin_wallet_bp.put("/payment-settings/paystack")
@require_admin
def save_paystack_settings(payload):
    data = request.get_json(silent=True) or {}
    existing = get_provider("paystack", include_secret=True)
    secret = clean_string(data.get("secret_key", "")) or existing.get("secret_key", "")
    if bool(data.get("is_active", data.get("enabled", existing.get("is_active")))) and secret:
        ok, message = validate_paystack_secret_key(secret)
        if not ok:
            return {"success": False, "message": message}, 400
    try:
        settings = save_paystack(data, payload.get("user_id", "admin"))
    except ValueError as exc:
        return {"success": False, "message": str(exc)}, 400
    return jsonify({"success": True, "message": "Paystack settings saved successfully.", "settings": safe_provider(settings)})


@admin_wallet_bp.get("/wallet/summary")
@require_admin
def admin_wallet_summary(payload):
    txns = list(wallet_transactions_collection().find({}))
    deposits = sum(to_amount(t.get("amount")) for t in txns if t.get("status", "success") == "success" and t.get("type") in {"credit", "deposit", "wallet_deposit", "sms_package_purchase"})
    debits = sum(to_amount(t.get("amount")) for t in txns if t.get("status", "success") == "success" and t.get("type") == "debit")
    pending = sum(to_amount(t.get("amount")) for t in txns if t.get("status") in {"pending", "processing", "otp_required"})
    return jsonify({"success": True, "summary": {"total_deposits": round(deposits, 2), "total_spending": round(debits, 2), "pending_deposits": round(pending, 2), "transaction_count": len(txns)}})


@admin_wallet_bp.get("/wallet/transactions")
@require_admin
def admin_wallet_transactions(payload):
    txns = list(wallet_transactions_collection().find({}).sort("created_at", -1).limit(250))
    user_ids = [txn.get("user_id") for txn in txns if isinstance(txn.get("user_id"), ObjectId)]
    users = {user["_id"]: user for user in users_collection().find({"_id": {"$in": user_ids}}, {"password_hash": 0})} if user_ids else {}
    return jsonify({"success": True, "transactions": [safe_transaction(txn, users.get(txn.get("user_id"))) for txn in txns]})
