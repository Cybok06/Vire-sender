from bson import ObjectId
from flask import Blueprint, jsonify, request

from utils.auth import require_auth, users_collection
from utils.security import check_password, clean_string, hash_password, is_strong_password, now_utc

profile_bp = Blueprint("profile", __name__, url_prefix="/api/profile")


def safe_profile_user(user: dict) -> dict:
    return {
        "id": str(user["_id"]),
        "full_name": user.get("full_name", ""),
        "email": user.get("email"),
        "phone": user.get("phone") or "",
        "role": user.get("role", "user"),
        "auth_provider": user.get("auth_provider", "local"),
        "profile_picture": user.get("profile_picture"),
        "email_verified": bool(user.get("email_verified")),
        "account_status": user.get("account_status", "active"),
        "wallet_balance": float(user.get("wallet_balance", 0) or 0),
        "created_at": user.get("created_at").isoformat() if user.get("created_at") else None,
        "updated_at": user.get("updated_at").isoformat() if user.get("updated_at") else None,
        "last_login": user.get("last_login").isoformat() if user.get("last_login") else None,
    }


def get_current_user(payload: dict) -> dict | None:
    if payload.get("role") == "admin":
        return None
    user_id = payload.get("user_id") or payload.get("sub")
    try:
        return users_collection().find_one({"_id": ObjectId(user_id)})
    except Exception:
        return None


@profile_bp.put("")
@require_auth
def update_profile(payload):
    user = get_current_user(payload)
    if not user:
        return {"success": False, "message": "User not found."}, 404
    if user.get("account_status") != "active":
        return {"success": False, "message": "This account is not active."}, 403

    data = request.get_json(silent=True) or {}
    full_name = clean_string(data.get("full_name", ""))
    phone = clean_string(data.get("phone", ""))
    profile_picture = clean_string(data.get("profile_picture", ""))

    if not full_name:
        return {"success": False, "message": "Full name is required.", "errors": {"full_name": "Full name is required."}}, 400

    updates = {
        "full_name": full_name,
        "phone": phone,
        "updated_at": now_utc(),
    }
    if profile_picture:
        updates["profile_picture"] = profile_picture

    users_collection().update_one({"_id": user["_id"]}, {"$set": updates})
    user.update(updates)

    return jsonify({
        "success": True,
        "message": "Profile updated successfully",
        "user": safe_profile_user(user),
    })


@profile_bp.post("/change-password")
@require_auth
def change_password(payload):
    user = get_current_user(payload)
    if not user:
        return {"success": False, "message": "User not found."}, 404
    if user.get("account_status") != "active":
        return {"success": False, "message": "This account is not active."}, 403
    if user.get("auth_provider", "local") != "local" or not user.get("password_hash"):
        return {"success": False, "message": "Password is managed by your social login provider."}, 400

    data = request.get_json(silent=True) or {}
    current_password = data.get("current_password", "")
    new_password = data.get("new_password", "")
    confirm_password = data.get("confirm_password", "")

    if not check_password(user.get("password_hash", ""), current_password):
        return {"success": False, "message": "Current password is incorrect."}, 400
    if new_password != confirm_password:
        return {"success": False, "message": "Passwords do not match."}, 400
    if not is_strong_password(new_password):
        return {
            "success": False,
            "message": "Password must be at least 8 characters and include uppercase, lowercase, number, and special character.",
        }, 400

    users_collection().update_one(
        {"_id": user["_id"]},
        {"$set": {"password_hash": hash_password(new_password), "updated_at": now_utc()}},
    )

    return jsonify({"success": True, "message": "Password changed successfully."})
