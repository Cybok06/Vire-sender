from datetime import timedelta
from urllib.parse import urlencode

import requests
from bson import ObjectId
from flask import Blueprint, current_app, jsonify, redirect, request

from config import Config
from services.email_service import send_password_reset_email, send_verification_email
from utils.security import (
    check_password,
    check_plain_secret,
    check_verification_code,
    clean_string,
    decode_jwt,
    generate_jwt,
    generate_reset_token,
    generate_verification_code,
    hash_password,
    hash_reset_token,
    hash_verification_code,
    is_strong_password,
    normalize_email,
    now_utc,
    validate_registration_payload,
    verification_expiry,
)

auth_bp = Blueprint("auth", __name__, url_prefix="/api/auth")
REGISTER_RATE_LIMIT_SECONDS = 60
REGISTER_RATE_LIMIT_MAX = 8
_register_attempts: dict[str, list] = {}
_login_attempts: dict[str, list] = {}
LOGIN_RATE_LIMIT_SECONDS = 60
LOGIN_RATE_LIMIT_MAX = 10
FORGOT_PASSWORD_RATE_LIMIT_SECONDS = 60
FORGOT_PASSWORD_RATE_LIMIT_MAX = 5
RESET_PASSWORD_RATE_LIMIT_SECONDS = 60
RESET_PASSWORD_RATE_LIMIT_MAX = 8
_forgot_password_attempts: dict[str, list] = {}
_reset_password_attempts: dict[str, list] = {}
GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v2/userinfo"
GITHUB_AUTH_URL = "https://github.com/login/oauth/authorize"
GITHUB_TOKEN_URL = "https://github.com/login/oauth/access_token"
GITHUB_USER_URL = "https://api.github.com/user"
GITHUB_EMAILS_URL = "https://api.github.com/user/emails"


def users_collection():
    return current_app.config["DB"].users


def error_response(message: str, status: int = 400, errors: dict | None = None, **extra):
    body = {"success": False, "message": message}
    if errors:
        body["errors"] = errors
    body.update(extra)
    return jsonify(body), status


def register_rate_limited(identifier: str) -> bool:
    now = now_utc()
    window_start = now - timedelta(seconds=REGISTER_RATE_LIMIT_SECONDS)
    attempts = [attempt for attempt in _register_attempts.get(identifier, []) if attempt >= window_start]
    attempts.append(now)
    _register_attempts[identifier] = attempts
    return len(attempts) > REGISTER_RATE_LIMIT_MAX


def login_rate_limited(identifier: str) -> bool:
    now = now_utc()
    window_start = now - timedelta(seconds=LOGIN_RATE_LIMIT_SECONDS)
    attempts = [attempt for attempt in _login_attempts.get(identifier, []) if attempt >= window_start]
    attempts.append(now)
    _login_attempts[identifier] = attempts
    return len(attempts) > LOGIN_RATE_LIMIT_MAX


def forgot_password_rate_limited(identifier: str) -> bool:
    now = now_utc()
    window_start = now - timedelta(seconds=FORGOT_PASSWORD_RATE_LIMIT_SECONDS)
    attempts = [attempt for attempt in _forgot_password_attempts.get(identifier, []) if attempt >= window_start]
    attempts.append(now)
    _forgot_password_attempts[identifier] = attempts
    return len(attempts) > FORGOT_PASSWORD_RATE_LIMIT_MAX


def reset_password_rate_limited(identifier: str) -> bool:
    now = now_utc()
    window_start = now - timedelta(seconds=RESET_PASSWORD_RATE_LIMIT_SECONDS)
    attempts = [attempt for attempt in _reset_password_attempts.get(identifier, []) if attempt >= window_start]
    attempts.append(now)
    _reset_password_attempts[identifier] = attempts
    return len(attempts) > RESET_PASSWORD_RATE_LIMIT_MAX


def verify_recaptcha_token(token: str, remote_ip: str | None = None) -> bool:
    if not Config.RECAPTCHA_REQUIRED:
        return True

    if not token or not Config.RECAPTCHA_SECRET_KEY or Config.RECAPTCHA_SECRET_KEY == "YOUR_SECRET_KEY":
        return False

    try:
        response = requests.post(
            "https://www.google.com/recaptcha/api/siteverify",
            data={
                "secret": Config.RECAPTCHA_SECRET_KEY,
                "response": token,
                "remoteip": remote_ip,
            },
            timeout=8,
        )
        result = response.json()
    except requests.RequestException:
        current_app.logger.warning("Captcha verification request failed.")
        return False

    return bool(result.get("success"))


def issue_user_token(user: dict) -> str:
    user_id = str(user["_id"])
    return generate_jwt(
        {
            "sub": user_id,
            "user_id": user_id,
            "role": user.get("role", "user"),
            "email": user.get("email"),
        },
        Config.JWT_SECRET,
        Config.JWT_EXPIRES_HOURS,
    )


def safe_user(user: dict) -> dict:
    return {
        "id": str(user["_id"]),
        "full_name": user.get("full_name", ""),
        "email": user.get("email"),
        "phone": user.get("phone") or "",
        "role": user.get("role", "user"),
        "profile_picture": user.get("profile_picture"),
        "auth_provider": user.get("auth_provider", "local"),
        "email_verified": bool(user.get("email_verified")),
        "account_status": user.get("account_status", "active"),
        "wallet_balance": float(user.get("wallet_balance", 0) or 0),
        "created_at": user.get("created_at").isoformat() if user.get("created_at") else None,
        "updated_at": user.get("updated_at").isoformat() if user.get("updated_at") else None,
        "last_login": user.get("last_login").isoformat() if user.get("last_login") else None,
    }


def email_verification_required(user: dict) -> bool:
    if user.get("email_verified"):
        return False
    return bool(
        user.get("email_verification_required")
        or user.get("verification_email_sent")
        or user.get("account_status") == "pending_verification"
    )


def frontend_auth_redirect(**params):
    return redirect(f"{Config.FRONTEND_URL}/auth/callback?{urlencode(params)}")


def is_admin_login(identifier: str, normalized_identifier: str, password: str) -> bool:
    admin_identifier_matches = (
        (Config.ADMIN_EMAIL and check_plain_secret(Config.ADMIN_EMAIL, normalized_identifier))
        or (Config.ADMIN_USERNAME and check_plain_secret(Config.ADMIN_USERNAME, identifier))
    )
    return bool(admin_identifier_matches and check_plain_secret(Config.ADMIN_PASSWORD, password))


def forgot_password_success_response():
    return jsonify({
        "success": True,
        "message": "If an account exists, a reset link has been sent.",
    })


@auth_bp.post("/register")
def register():
    client_id = request.headers.get("X-Forwarded-For", request.remote_addr or "unknown").split(",")[0].strip()
    if register_rate_limited(client_id):
        return error_response("Too many registration attempts. Please try again shortly.", 429)

    data = request.get_json(silent=True) or {}
    captcha_token = clean_string(data.get("captcha_token", ""))
    if not verify_recaptcha_token(captcha_token, client_id):
        current_app.logger.warning("Captcha verification failed during registration.")
        return error_response("Captcha verification failed. Please refresh the page and try again.", 400)

    errors = validate_registration_payload(data)
    if errors:
        return error_response("Please correct the highlighted fields.", 400, errors)

    full_name = clean_string(data["full_name"])
    email = normalize_email(data["email"])
    phone = clean_string(data["phone"])
    users = users_collection()

    existing_user = users.find_one({"email": email}, {"_id": 1, "email_verified": 1})
    if existing_user:
        return error_response("An account with this email already exists.", 409, {"email": "Email already exists."})

    code = generate_verification_code()
    now = now_utc()
    user_doc = {
        "full_name": full_name,
        "email": email,
        "phone": phone,
        "password_hash": hash_password(data["password"]),
        "role": "user",
        "auth_provider": "local",
        "profile_picture": None,
        "email_verified": False,
        "email_verification_required": True,
        "verification_email_sent": False,
        "account_status": "pending_verification",
        "verification_code_hash": hash_verification_code(code),
        "verification_code_expires": verification_expiry(Config.VERIFICATION_CODE_MINUTES),
        "verification_attempts": 0,
        "verification_last_sent_at": now,
        "created_at": now,
        "updated_at": now,
    }

    result = users.insert_one(user_doc)
    user_doc["_id"] = result.inserted_id

    try:
        send_verification_email(email, full_name, code)
    except Exception:
        current_app.logger.exception("Failed to send verification email for registration; allowing fallback access.")
        fallback_updates = {
            "email_verification_required": False,
            "verification_email_sent": False,
            "email_delivery_failed_at": now_utc(),
            "account_status": "active",
            "updated_at": now_utc(),
        }
        users.update_one(
            {"_id": user_doc["_id"]},
            {
                "$set": fallback_updates,
                "$unset": {
                    "verification_code_hash": "",
                    "verification_code_expires": "",
                    "verification_last_sent_at": "",
                },
            },
        )
        user_doc.update(fallback_updates)
        user_doc.pop("verification_code_hash", None)
        user_doc.pop("verification_code_expires", None)
        user_doc.pop("verification_last_sent_at", None)
        token = issue_user_token(user_doc)
        return jsonify({
            "success": True,
            "message": "Account created. Email verification is temporarily unavailable, so you can continue securely with your password.",
            "email": email,
            "requires_verification": False,
            "token": token,
            "user": safe_user(user_doc),
        }), 201

    users.update_one(
        {"_id": user_doc["_id"]},
        {"$set": {"verification_email_sent": True, "updated_at": now_utc()}},
    )

    return jsonify({
        "success": True,
        "message": "Verification code sent.",
        "email": email,
        "requires_verification": True,
    }), 201


@auth_bp.post("/verify-email-code")
def verify_email_code():
    data = request.get_json(silent=True) or {}
    email = normalize_email(data.get("email", ""))
    code = clean_string(data.get("code", ""))

    if not email:
        return error_response("Email is required.", 400, {"email": "Email is required."})
    if not code:
        return error_response("Verification code is required.", 400, {"code": "Code is required."})
    if len(code) != 6 or not code.isdigit():
        return error_response("Verification code must be 6 digits.", 400, {"code": "Code must be 6 digits."})

    users = users_collection()
    user = users.find_one({"email": email})
    if not user:
        return error_response("No account was found for this email.", 404)

    if user.get("email_verified"):
        return jsonify({
            "success": True,
            "message": "Email is already verified.",
        })

    attempts = int(user.get("verification_attempts", 0))
    if attempts >= Config.MAX_VERIFICATION_ATTEMPTS:
        return error_response("Too many failed attempts. Please request a new verification code.", 429)

    expires_at = user.get("verification_code_expires")
    if not expires_at or expires_at <= now_utc():
        return error_response("Verification code has expired. Please request a new code.", 400)

    if not check_verification_code(user.get("verification_code_hash", ""), code):
        users.update_one({"email": email}, {"$inc": {"verification_attempts": 1}, "$set": {"updated_at": now_utc()}})
        remaining = max(Config.MAX_VERIFICATION_ATTEMPTS - attempts - 1, 0)
        return error_response("Invalid verification code.", 400, remaining_attempts=remaining)

    users.update_one(
        {"email": email},
        {
            "$set": {
                "email_verified": True,
                "email_verification_required": False,
                "verification_email_sent": True,
                "account_status": "active",
                "verification_attempts": 0,
                "updated_at": now_utc(),
            },
            "$unset": {
                "verification_code_hash": "",
                "verification_code_expires": "",
                "verification_last_sent_at": "",
            },
        },
    )

    return jsonify({
        "success": True,
        "message": "Email verified successfully.",
    })


@auth_bp.post("/resend-verification-code")
def resend_verification_code():
    data = request.get_json(silent=True) or {}
    email = normalize_email(data.get("email", ""))
    if not email:
        return error_response("Email is required.", 400, {"email": "Email is required."})

    users = users_collection()
    user = users.find_one({"email": email})
    if not user:
        return error_response("No account was found for this email.", 404)

    if user.get("email_verified"):
        return jsonify({
            "success": True,
            "message": "Email is already verified.",
        })

    now = now_utc()
    last_sent = user.get("verification_last_sent_at")
    if last_sent and last_sent + timedelta(seconds=Config.RESEND_COOLDOWN_SECONDS) > now:
        retry_at = last_sent + timedelta(seconds=Config.RESEND_COOLDOWN_SECONDS)
        retry_after = max(int((retry_at - now).total_seconds()), 1)
        return error_response("Please wait before requesting a new verification code.", 429, retry_after=retry_after)

    code = generate_verification_code()
    users.update_one(
        {"email": email},
        {
            "$set": {
                "verification_code_hash": hash_verification_code(code),
                "verification_code_expires": verification_expiry(Config.VERIFICATION_CODE_MINUTES),
                "verification_attempts": 0,
                "verification_last_sent_at": now,
                "email_verification_required": True,
                "updated_at": now,
            }
        },
    )

    try:
        send_verification_email(email, user.get("full_name", ""), code)
    except Exception:
        current_app.logger.error("Failed to resend verification email.")
        failure_updates = {"email_verification_required": False, "email_delivery_failed_at": now_utc(), "updated_at": now_utc()}
        if user.get("account_status") == "pending_verification":
            failure_updates["account_status"] = "active"

        users.update_one(
            {"email": email},
            {
                "$set": failure_updates,
                "$unset": {
                    "verification_code_hash": "",
                    "verification_code_expires": "",
                    "verification_last_sent_at": "",
                },
            },
        )
        return error_response("Verification email failed to send. Please try again later.", 500)

    users.update_one({"email": email}, {"$set": {"verification_email_sent": True, "updated_at": now_utc()}})

    return jsonify({
        "success": True,
        "message": "New verification code sent.",
    })


@auth_bp.post("/login")
def login():
    try:
        data = request.get_json(silent=True) or {}
        identifier = clean_string(data.get("email", "") or data.get("identifier", ""))
        normalized_identifier = normalize_email(identifier)
        password = data.get("password", "")
        json_keys = sorted(data.keys())

        current_app.logger.info(
            "Login request received: method=%s json_keys=%s email=%s",
            request.method,
            json_keys,
            normalized_identifier or identifier or "<missing>",
        )

        client_id = request.headers.get("X-Forwarded-For", request.remote_addr or "unknown").split(",")[0].strip()
        if login_rate_limited(client_id):
            current_app.logger.info("Login rate limited: email=%s", normalized_identifier or identifier or "<missing>")
            return error_response("Too many login attempts. Please try again shortly.", 429)

        if not identifier or not password:
            current_app.logger.info(
                "Login rejected missing credentials: email_present=%s password_present=%s",
                bool(identifier),
                bool(password),
            )
            return error_response("Email/username and password are required.", 400)

        if is_admin_login(identifier, normalized_identifier, password):
            current_app.logger.info("Admin login credentials accepted: email=%s", normalized_identifier)
            token = generate_jwt(
                {
                    "sub": "admin",
                    "user_id": "admin",
                    "role": "admin",
                    "email": Config.ADMIN_EMAIL,
                },
                Config.JWT_SECRET,
                Config.JWT_EXPIRES_HOURS,
            )
            return jsonify({
                "success": True,
                "message": "Admin login successful",
                "token": token,
                "user": {
                    "id": "admin",
                    "full_name": "Administrator",
                    "email": Config.ADMIN_EMAIL,
                    "role": "admin",
                },
            })

        user = users_collection().find_one({
            "$or": [
                {"email": normalized_identifier},
                {"username": identifier},
            ]
        })
        user_found = bool(user)
        password_ok = bool(user and check_password(user.get("password_hash", ""), password))
        current_app.logger.info(
            "Login credential check: email=%s user_found=%s password_ok=%s",
            normalized_identifier or identifier,
            user_found,
            password_ok,
        )

        if not user or not password_ok:
            return error_response("Invalid email/username or password.", 401)

        if email_verification_required(user):
            current_app.logger.info("Login requires email verification: email=%s", user.get("email"))
            return error_response(
                "Please verify your email before logging in.",
                403,
                requires_verification=True,
                email=user.get("email"),
            )

        if user.get("account_status") != "active":
            current_app.logger.info(
                "Login rejected inactive account: email=%s status=%s",
                user.get("email"),
                user.get("account_status"),
            )
            return error_response("This account is not active. Please contact support.", 403)

        users_collection().update_one({"_id": user["_id"]}, {"$set": {"last_login": now_utc(), "updated_at": now_utc()}})
        token = issue_user_token(user)

        current_app.logger.info("Login successful: email=%s user_id=%s", user.get("email"), str(user.get("_id")))
        return jsonify({
            "success": True,
            "message": "Login successful",
            "token": token,
            "user": safe_user(user),
        })
    except Exception as exc:
        current_app.logger.exception("Login route exception: %s", str(exc))
        return error_response("Login failed due to a server error.", 500)


@auth_bp.post("/forgot-password")
def forgot_password():
    data = request.get_json(silent=True) or {}
    email = normalize_email(data.get("email", ""))
    client_id = request.headers.get("X-Forwarded-For", request.remote_addr or "unknown").split(",")[0].strip()
    rate_limit_key = f"{client_id}:{email or 'missing'}"

    if forgot_password_rate_limited(rate_limit_key):
        return error_response("Too many reset requests. Please try again shortly.", 429)

    if not email:
        return error_response("Email is required.", 400, {"email": "Email is required."})

    users = users_collection()
    user = users.find_one({"email": email})
    if not user:
        return forgot_password_success_response()

    if user.get("account_status") != "active":
        return forgot_password_success_response()

    token = generate_reset_token()
    now = now_utc()
    users.update_one(
        {"_id": user["_id"]},
        {
            "$set": {
                "reset_token_hash": hash_reset_token(token, Config.JWT_SECRET),
                "reset_token_expires": now + timedelta(minutes=Config.PASSWORD_RESET_MINUTES),
                "password_reset_attempts": 0,
                "updated_at": now,
            }
        },
    )

    reset_url = f"{Config.FRONTEND_URL}/reset-password?token={token}"
    try:
        send_password_reset_email(email, user.get("full_name", ""), reset_url)
    except Exception:
        current_app.logger.error("Failed to send password reset email.")

    return forgot_password_success_response()


@auth_bp.post("/reset-password")
def reset_password():
    data = request.get_json(silent=True) or {}
    token = clean_string(data.get("token", ""))
    password = data.get("password", "")
    confirm_password = data.get("confirm_password", "")
    client_id = request.headers.get("X-Forwarded-For", request.remote_addr or "unknown").split(",")[0].strip()

    if reset_password_rate_limited(client_id):
        return error_response("Too many reset attempts. Please try again shortly.", 429)

    if not token:
        return error_response("Reset token is required.", 400)
    if not password:
        return error_response("Password is required.", 400, {"password": "Password is required."})
    if password != confirm_password:
        return error_response("Passwords do not match.", 400, {"confirm_password": "Passwords do not match."})
    if not is_strong_password(password):
        return error_response(
            "Password must be at least 8 characters and include uppercase, lowercase, number, and special character.",
            400,
            {"password": "Password must include uppercase, lowercase, number, and special character."},
        )

    token_hash = hash_reset_token(token, Config.JWT_SECRET)
    users = users_collection()
    user = users.find_one({"reset_token_hash": token_hash})
    if not user:
        return error_response("Invalid or expired reset link.", 400)

    attempts = int(user.get("password_reset_attempts", 0))
    if attempts >= 5:
        return error_response("Too many failed reset attempts. Please request a new reset link.", 429)

    expires_at = user.get("reset_token_expires")
    if not expires_at or expires_at <= now_utc():
        users.update_one(
            {"_id": user["_id"]},
            {
                "$inc": {"password_reset_attempts": 1},
                "$set": {"updated_at": now_utc()},
            },
        )
        return error_response("Invalid or expired reset link.", 400)

    if user.get("account_status") != "active":
        return error_response("This account is not active. Please contact support.", 403)

    now = now_utc()
    users.update_one(
        {"_id": user["_id"]},
        {
            "$set": {
                "password_hash": hash_password(password),
                "auth_provider": user.get("auth_provider") or "local",
                "last_password_reset": now,
                "password_reset_attempts": 0,
                "updated_at": now,
            },
            "$unset": {
                "reset_token_hash": "",
                "reset_token_expires": "",
            },
        },
    )

    return jsonify({
        "success": True,
        "message": "Password reset successfully.",
    })


@auth_bp.get("/google")
def google_auth():
    if not Config.GOOGLE_CLIENT_ID or not Config.GOOGLE_CLIENT_SECRET:
        return error_response("Google authentication is not configured.", 500)

    params = {
        "client_id": Config.GOOGLE_CLIENT_ID,
        "redirect_uri": Config.GOOGLE_AUTH_REDIRECT_URI,
        "response_type": "code",
        "scope": "openid email profile",
        "access_type": "offline",
        "prompt": "select_account",
    }
    return redirect(f"{GOOGLE_AUTH_URL}?{urlencode(params)}")


@auth_bp.get("/google/callback")
def google_callback():
    if request.args.get("error"):
        return frontend_auth_redirect(error="google_cancelled")

    code = request.args.get("code")
    if not code:
        return frontend_auth_redirect(error="missing_code")

    try:
        token_response = requests.post(
            GOOGLE_TOKEN_URL,
            data={
                "code": code,
                "client_id": Config.GOOGLE_CLIENT_ID,
                "client_secret": Config.GOOGLE_CLIENT_SECRET,
                "redirect_uri": Config.GOOGLE_AUTH_REDIRECT_URI,
                "grant_type": "authorization_code",
            },
            timeout=10,
        )
        token_response.raise_for_status()
        access_token = token_response.json().get("access_token")
        if not access_token:
            return frontend_auth_redirect(error="google_token_failed")

        profile_response = requests.get(
            GOOGLE_USERINFO_URL,
            headers={"Authorization": f"Bearer {access_token}"},
            timeout=10,
        )
        profile_response.raise_for_status()
        profile = profile_response.json()
    except requests.RequestException:
        current_app.logger.warning("Google OAuth request failed.")
        return frontend_auth_redirect(error="google_auth_failed")

    email = normalize_email(profile.get("email", ""))
    google_id = clean_string(profile.get("id", ""))
    full_name = clean_string(profile.get("name", "")) or email
    picture = profile.get("picture")

    if not email or not google_id:
        return frontend_auth_redirect(error="google_profile_invalid")
    if not profile.get("verified_email"):
        return frontend_auth_redirect(error="google_email_unverified")

    users = users_collection()
    now = now_utc()
    user = users.find_one({"email": email})

    if user:
        auth_provider = user.get("auth_provider") or ("local" if user.get("password_hash") else "google")
        updates = {
            "google_id": google_id,
            "profile_picture": picture,
            "email_verified": True,
            "account_status": "active",
            "auth_provider": auth_provider,
            "last_login": now,
            "updated_at": now,
        }
        users.update_one({"_id": user["_id"]}, {"$set": updates})
        user.update(updates)
    else:
        user_doc = {
            "full_name": full_name,
            "email": email,
            "phone": None,
            "password_hash": None,
            "role": "user",
            "auth_provider": "google",
            "google_id": google_id,
            "profile_picture": picture,
            "email_verified": True,
            "account_status": "active",
            "verification_attempts": 0,
            "created_at": now,
            "updated_at": now,
            "last_login": now,
        }
        result = users.insert_one(user_doc)
        user_doc["_id"] = result.inserted_id
        user = user_doc

    token = issue_user_token(user)
    return frontend_auth_redirect(token=token)


@auth_bp.get("/github")
def github_auth():
    if not Config.GITHUB_CLIENT_ID or not Config.GITHUB_CLIENT_SECRET:
        return error_response("GitHub authentication is not configured.", 500)

    params = {
        "client_id": Config.GITHUB_CLIENT_ID,
        "redirect_uri": Config.GITHUB_REDIRECT_URI,
        "scope": "read:user user:email",
        "allow_signup": "true",
    }
    return redirect(f"{GITHUB_AUTH_URL}?{urlencode(params)}")


@auth_bp.get("/github/callback")
def github_callback():
    if request.args.get("error"):
        return frontend_auth_redirect(error="github_cancelled")

    code = request.args.get("code")
    if not code:
        return frontend_auth_redirect(error="missing_code")

    try:
        token_response = requests.post(
            GITHUB_TOKEN_URL,
            data={
                "client_id": Config.GITHUB_CLIENT_ID,
                "client_secret": Config.GITHUB_CLIENT_SECRET,
                "code": code,
                "redirect_uri": Config.GITHUB_REDIRECT_URI,
            },
            headers={"Accept": "application/json"},
            timeout=10,
        )
        token_response.raise_for_status()
        access_token = token_response.json().get("access_token")
        if not access_token:
            return frontend_auth_redirect(error="github_token_failed")

        headers = {
            "Authorization": f"Bearer {access_token}",
            "Accept": "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
        }
        profile_response = requests.get(GITHUB_USER_URL, headers=headers, timeout=10)
        profile_response.raise_for_status()
        profile = profile_response.json()

        emails_response = requests.get(GITHUB_EMAILS_URL, headers=headers, timeout=10)
        emails_response.raise_for_status()
        emails = emails_response.json()
    except requests.RequestException:
        current_app.logger.warning("GitHub OAuth request failed.")
        return frontend_auth_redirect(error="github_auth_failed")

    primary_email = next(
        (
            item.get("email")
            for item in emails
            if item.get("primary") and item.get("verified") and item.get("email")
        ),
        None,
    )
    if not primary_email:
        primary_email = next((item.get("email") for item in emails if item.get("verified") and item.get("email")), None)

    email = normalize_email(primary_email or profile.get("email", ""))
    github_id = str(profile.get("id") or "")
    username = clean_string(profile.get("login", ""))
    full_name = clean_string(profile.get("name", "")) or username or email
    avatar_url = profile.get("avatar_url")

    if not email or not github_id:
        return frontend_auth_redirect(error="github_profile_invalid")

    users = users_collection()
    now = now_utc()
    user = users.find_one({"email": email})

    if user:
        auth_provider = user.get("auth_provider") or ("local" if user.get("password_hash") else "github")
        updates = {
            "github_id": github_id,
            "github_username": username,
            "github_avatar": avatar_url,
            "profile_picture": user.get("profile_picture") or avatar_url,
            "email_verified": True,
            "account_status": "active",
            "auth_provider": auth_provider,
            "last_login": now,
            "updated_at": now,
        }
        users.update_one({"_id": user["_id"]}, {"$set": updates})
        user.update(updates)
    else:
        user_doc = {
            "full_name": full_name,
            "email": email,
            "phone": None,
            "password_hash": None,
            "role": "user",
            "auth_provider": "github",
            "github_id": github_id,
            "github_username": username,
            "github_avatar": avatar_url,
            "profile_picture": avatar_url,
            "email_verified": True,
            "account_status": "active",
            "verification_attempts": 0,
            "created_at": now,
            "updated_at": now,
            "last_login": now,
        }
        result = users.insert_one(user_doc)
        user_doc["_id"] = result.inserted_id
        user = user_doc

    token = issue_user_token(user)
    return frontend_auth_redirect(token=token)


@auth_bp.get("/me")
def me():
    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        return error_response("Authentication required.", 401)

    payload = decode_jwt(auth_header.removeprefix("Bearer ").strip(), Config.JWT_SECRET)
    if not payload:
        return error_response("Invalid or expired token.", 401)

    if payload.get("role") == "admin":
        return jsonify({
            "success": True,
            "user": {
                "id": "admin",
                "full_name": "Administrator",
                "email": Config.ADMIN_EMAIL,
                "role": "admin",
            },
        })

    user_id = payload.get("user_id") or payload.get("sub")
    try:
        user = users_collection().find_one({"_id": ObjectId(user_id)})
    except Exception:
        user = None

    if not user:
        return error_response("User not found.", 404)

    return jsonify({
        "success": True,
        "user": safe_user(user),
    })
