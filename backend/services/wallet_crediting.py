from bson import ObjectId
from pymongo import ReturnDocument

from utils.notifications import create_notification
from utils.security import now_utc
from services.sms_credit_service import credit_sms_package


SUCCESS_STATUSES = {"success", "successful"}


def to_amount(value, fallback=0.0):
    try:
        return round(float(value), 2)
    except (TypeError, ValueError):
        return fallback


def credit_verified_deposit(db, transaction_id, verification_data=None):
    verification_data = verification_data or {}
    object_id = transaction_id
    if not isinstance(object_id, ObjectId):
        object_id = ObjectId(str(transaction_id))

    now = now_utc()
    claimed = db.wallet_transactions.find_one_and_update(
        {
            "_id": object_id,
            "type": {"$in": ["credit", "deposit", "wallet_deposit", "sms_package_purchase"]},
            "wallet_credited": {"$ne": True},
            "status": {"$in": list(SUCCESS_STATUSES)},
            "credit_claimed_at": {"$exists": False},
        },
        {"$set": {"credit_claimed_at": now, "updated_at": now}},
        return_document=ReturnDocument.AFTER,
    )
    if not claimed:
        existing = db.wallet_transactions.find_one({"_id": object_id})
        return {"credited": False, "already_credited": bool(existing and existing.get("wallet_credited")), "transaction": existing}

    user_id = claimed.get("user_id")
    amount = to_amount(claimed.get("amount"))
    if not isinstance(user_id, ObjectId) or amount <= 0:
        db.wallet_transactions.update_one(
            {"_id": object_id},
            {"$set": {"status": "verification_failed", "failure_reason": "Invalid transaction user or amount.", "updated_at": now_utc()}},
        )
        return {"credited": False, "already_credited": False, "transaction": db.wallet_transactions.find_one({"_id": object_id})}

    user = db.users.find_one({"_id": user_id}) or {}
    if claimed.get("type") == "sms_package_purchase" or claimed.get("purpose") == "sms_package":
        package = db.sms_packages.find_one({"_id": claimed.get("sms_package_id")})
        if not package:
            db.wallet_transactions.update_one({"_id": object_id}, {"$set": {"status": "verification_failed", "failure_reason": "SMS package no longer exists.", "updated_at": now_utc()}})
            return {"credited": False, "already_credited": False, "transaction": db.wallet_transactions.find_one({"_id": object_id})}
        purchase = {
            "user_id": user_id, "package_id": package["_id"], "package_name": claimed.get("package_name") or package["name"],
            "total_sms": int(claimed.get("total_sms") or package["total_sms"]), "amount": amount, "currency": claimed.get("currency", "GHS"),
            "method": "direct", "provider": claimed.get("provider"), "status": "success", "reference": claimed.get("reference"),
            "payment_transaction_id": object_id, "created_at": now, "updated_at": now,
        }
        purchase_id = db.sms_package_purchases.insert_one(purchase).inserted_id
        package_snapshot = {**package, "total_sms": purchase["total_sms"], "name": purchase["package_name"]}
        result = credit_sms_package(db, user, package_snapshot, purchase_id=purchase_id, payment_transaction_id=object_id, reference=claimed.get("reference"))
        credited_at = now_utc()
        db.wallet_transactions.update_one({"_id": object_id}, {"$set": {"wallet_credited": True, "sms_credited": True, "sms_purchase_id": purchase_id, "credited_at": credited_at, "verified_at": verification_data.get("verified_at") or credited_at, "updated_at": credited_at}})
        db.sms_packages.update_one({"_id": package["_id"]}, {"$inc": {"purchase_count": 1, "revenue": amount}})
        create_notification(user_id, "sms", "SMS package activated", f"{purchase['total_sms']} SMS credits were added to your account.", "success", "sms", claimed.get("reference"), "/user/sms-packages", {"sms_balance": result["balance"], "package_name": purchase["package_name"]})
        return {"credited": result["credited"], "already_credited": not result["credited"], "sms_balance": result["balance"], "transaction": db.wallet_transactions.find_one({"_id": object_id})}
    balance_before = to_amount(user.get("wallet_balance"))
    db.users.update_one(
        {"_id": user_id},
        {"$inc": {"wallet_balance": amount}, "$set": {"updated_at": now_utc()}},
    )
    updated_user = db.users.find_one({"_id": user_id}) or {}
    balance_after = to_amount(updated_user.get("wallet_balance"))
    credited_at = now_utc()
    db.wallet_transactions.update_one(
        {"_id": object_id},
        {"$set": {
            "wallet_credited": True,
            "credited_at": credited_at,
            "balance_before": balance_before,
            "balance_after": balance_after,
            "verified_at": verification_data.get("verified_at") or credited_at,
            "updated_at": credited_at,
        }},
    )
    reference = claimed.get("reference") or claimed.get("external_reference") or str(object_id)
    create_notification(
        user_id,
        "wallet",
        "Wallet topped up",
        f"Your wallet was credited with GHS {amount:.2f}.",
        "success",
        "wallet",
        reference,
        "/user/wallet",
        {"amount": amount, "balance_after": balance_after, "provider": claimed.get("provider")},
    )
    return {"credited": True, "already_credited": False, "balance": balance_after, "transaction": db.wallet_transactions.find_one({"_id": object_id})}
