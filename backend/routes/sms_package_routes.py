from bson import ObjectId
from flask import Blueprint, current_app, jsonify, request
from pymongo import ReturnDocument

from services.payment_provider_settings import active_public_response, to_amount
from services.sms_credit_service import credit_sms_package, sms_credit_balance
from utils.auth import require_admin, require_auth, users_collection
from utils.security import clean_string, now_utc

sms_packages_bp = Blueprint("sms_packages", __name__, url_prefix="/api/sms-packages")
admin_sms_packages_bp = Blueprint("admin_sms_packages", __name__, url_prefix="/api/admin/sms-packages")


def db(): return current_app.config["DB"]
def iso(value): return value.isoformat() if value else None


def safe_package(row):
    return {"id": str(row["_id"]), "name": row.get("name", ""), "total_sms": int(row.get("total_sms") or 0), "amount": to_amount(row.get("amount")), "currency": row.get("currency", "GHS"), "expiry_days": row.get("expiry_days"), "no_expiry": not bool(row.get("expiry_days")), "is_active": bool(row.get("is_active", True)), "purchase_count": int(row.get("purchase_count") or 0), "revenue": to_amount(row.get("revenue")), "created_at": iso(row.get("created_at")), "updated_at": iso(row.get("updated_at"))}


def current_user(payload):
    try: return users_collection().find_one({"_id": ObjectId(payload.get("user_id") or payload.get("sub"))})
    except Exception: return None


def clean_package(data):
    name = clean_string(data.get("name", ""))
    try: total_sms = int(data.get("total_sms") or 0)
    except Exception: total_sms = 0
    amount = to_amount(data.get("amount"))
    no_expiry = bool(data.get("no_expiry"))
    try: expiry_days = None if no_expiry else int(data.get("expiry_days") or 0)
    except Exception: expiry_days = 0
    if not name or total_sms <= 0 or amount <= 0 or (not no_expiry and expiry_days <= 0):
        raise ValueError("Name, total SMS, amount, and a valid expiry are required.")
    return {"name": name, "total_sms": total_sms, "amount": amount, "currency": "GHS", "expiry_days": expiry_days, "is_active": bool(data.get("is_active", True))}


@sms_packages_bp.get("")
@require_auth
def list_packages(payload):
    user = current_user(payload)
    if not user: return {"success": False, "message": "User account not found."}, 404
    packages = [safe_package(row) for row in db().sms_packages.find({"is_active": True}).sort("total_sms", 1)]
    purchases = list(db().sms_package_purchases.find({"user_id": user["_id"]}).sort("created_at", -1).limit(30))
    return jsonify({"success": True, "sms_balance": sms_credit_balance(db(), user["_id"]), "wallet_balance": to_amount(user.get("wallet_balance")), "packages": packages, "providers": active_public_response(), "purchases": [{"id": str(x["_id"]), "package_name": x.get("package_name"), "total_sms": x.get("total_sms"), "amount": to_amount(x.get("amount")), "method": x.get("method"), "provider": x.get("provider"), "status": x.get("status"), "reference": x.get("reference"), "created_at": iso(x.get("created_at"))} for x in purchases]})


@sms_packages_bp.post("/<package_id>/purchase-wallet")
@require_auth
def purchase_wallet(payload, package_id):
    user = current_user(payload)
    try: package = db().sms_packages.find_one({"_id": ObjectId(package_id), "is_active": True})
    except Exception: package = None
    if not user or not package: return {"success": False, "message": "SMS package not found."}, 404
    amount, before = to_amount(package["amount"]), to_amount(user.get("wallet_balance"))
    updated = users_collection().update_one({"_id": user["_id"], "wallet_balance": {"$gte": amount}}, {"$inc": {"wallet_balance": -amount}, "$set": {"updated_at": now_utc()}})
    if not updated.modified_count: return {"success": False, "message": "Insufficient wallet balance."}, 400
    now, reference = now_utc(), f"SMSPKG-WALLET-{ObjectId()}"
    purchase = {"user_id": user["_id"], "package_id": package["_id"], "package_name": package["name"], "total_sms": package["total_sms"], "amount": amount, "currency": "GHS", "method": "wallet", "provider": "wallet", "status": "success", "reference": reference, "created_at": now, "updated_at": now}
    purchase_id = db().sms_package_purchases.insert_one(purchase).inserted_id
    credit = credit_sms_package(db(), user, package, purchase_id=purchase_id, reference=reference)
    db().wallet_transactions.insert_one({"user_id": user["_id"], "type": "debit", "category": "sms_package_purchase", "amount": amount, "currency": "GHS", "status": "success", "description": f"Purchased {package['name']}", "reason": f"SMS package: {package['name']}", "reference": reference, "balance_before": before, "balance_after": before - amount, "sms_package_id": package["_id"], "sms_purchase_id": purchase_id, "created_at": now, "updated_at": now})
    db().sms_packages.update_one({"_id": package["_id"]}, {"$inc": {"purchase_count": 1, "revenue": amount}})
    return jsonify({"success": True, "message": "SMS package purchased successfully.", "sms_balance": credit["balance"], "wallet_balance": before - amount})


@admin_sms_packages_bp.get("")
@require_admin
def admin_list(payload):
    return jsonify({"success": True, "packages": [safe_package(row) for row in db().sms_packages.find({}).sort("created_at", -1)]})


@admin_sms_packages_bp.post("")
@require_admin
def admin_create(payload):
    try: doc = clean_package(request.get_json(silent=True) or {})
    except ValueError as exc: return {"success": False, "message": str(exc)}, 400
    now = now_utc(); doc.update({"purchase_count": 0, "revenue": 0.0, "created_at": now, "updated_at": now, "created_by": payload.get("user_id")})
    doc["_id"] = db().sms_packages.insert_one(doc).inserted_id
    return jsonify({"success": True, "message": "SMS package created.", "package": safe_package(doc)}), 201


@admin_sms_packages_bp.put("/<package_id>")
@require_admin
def admin_update(payload, package_id):
    try: oid, update = ObjectId(package_id), clean_package(request.get_json(silent=True) or {})
    except Exception as exc: return {"success": False, "message": str(exc) or "Invalid package."}, 400
    update["updated_at"] = now_utc(); update["updated_by"] = payload.get("user_id")
    row = db().sms_packages.find_one_and_update({"_id": oid}, {"$set": update}, return_document=ReturnDocument.AFTER)
    if not row: return {"success": False, "message": "SMS package not found."}, 404
    return jsonify({"success": True, "message": "SMS package updated.", "package": safe_package(row)})


@admin_sms_packages_bp.patch("/<package_id>/status")
@require_admin
def admin_status(payload, package_id):
    try: oid = ObjectId(package_id)
    except Exception: return {"success": False, "message": "Invalid package."}, 400
    active = bool((request.get_json(silent=True) or {}).get("is_active"))
    row = db().sms_packages.find_one_and_update({"_id": oid}, {"$set": {"is_active": active, "updated_at": now_utc()}}, return_document=ReturnDocument.AFTER)
    if not row: return {"success": False, "message": "SMS package not found."}, 404
    return jsonify({"success": True, "package": safe_package(row)})
