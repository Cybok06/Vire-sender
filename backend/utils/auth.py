from functools import wraps
from typing import Callable

from flask import current_app, request

from config import Config
from utils.security import decode_jwt


def get_auth_payload() -> dict | None:
    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        return None
    return decode_jwt(auth_header.removeprefix("Bearer ").strip(), Config.JWT_SECRET)


def require_auth(view: Callable):
    @wraps(view)
    def wrapped(*args, **kwargs):
        payload = get_auth_payload()
        if not payload:
            return {"success": False, "message": "Authentication required."}, 401
        return view(payload, *args, **kwargs)

    return wrapped


def require_admin(view: Callable):
    @wraps(view)
    def wrapped(*args, **kwargs):
        payload = get_auth_payload()
        if not payload:
            return {"success": False, "message": "Authentication required."}, 401
        if payload.get("role") != "admin":
            return {"success": False, "message": "Admin access required."}, 403
        return view(payload, *args, **kwargs)

    return wrapped


def users_collection():
    return current_app.config["DB"].users
