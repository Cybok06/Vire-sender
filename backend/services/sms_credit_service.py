from datetime import timedelta

from pymongo import ReturnDocument

from config import Config
from utils.notifications import create_notification
from utils.security import now_utc


def update_low_credit_alert(db, user_id, balance):
    """Notify once per low/depleted cycle; a healthy recharge rearms alerts."""
    balance = int(balance or 0)
    threshold = int(getattr(Config, "SMS_LOW_CREDIT_THRESHOLD", 20) or 20)
    if balance > threshold:
        db.users.update_one({"_id": user_id, "sms_credit_alert_state": {"$ne": "healthy"}}, {"$set": {"sms_credit_alert_state": "healthy", "updated_at": now_utc()}})
        return None
    state = "depleted" if balance <= 0 else "low"
    claimed = db.users.find_one_and_update(
        {"_id": user_id, "sms_credit_alert_state": {"$ne": state}},
        {"$set": {"sms_credit_alert_state": state, "sms_credit_alerted_at": now_utc(), "updated_at": now_utc()}},
        return_document=ReturnDocument.AFTER,
    )
    if not claimed:
        return None
    if state == "depleted":
        return create_notification(user_id, "sms", "SMS credits depleted", "Your SMS balance is now zero. Recharge SMS credits to continue sending messages.", "error", "sms_credits", "depleted", "/user/sms-packages", {"sms_balance": 0, "threshold": threshold})
    return create_notification(user_id, "sms", "SMS credits running low", f"You have {balance} SMS credits remaining. Recharge now to avoid interrupted sending.", "warning", "sms_credits", "low", "/user/sms-packages", {"sms_balance": balance, "threshold": threshold})


def expire_sms_credits(db, user_id):
    now = now_utc()
    rows = list(db.user_sms_credit_batches.find({
        "user_id": user_id, "status": "active", "credits_remaining": {"$gt": 0},
        "expires_at": {"$ne": None, "$lte": now},
    }))
    for row in rows:
        claimed = db.user_sms_credit_batches.find_one_and_update(
            {"_id": row["_id"], "status": "active", "credits_remaining": {"$gt": 0}},
            {"$set": {"status": "expired", "expired_credits": row["credits_remaining"], "credits_remaining": 0, "updated_at": now}},
            return_document=ReturnDocument.BEFORE,
        )
        if claimed:
            db.sms_credit_transactions.insert_one({
                "user_id": user_id, "type": "expiry", "credits": -int(claimed["credits_remaining"]),
                "batch_id": claimed["_id"], "description": "SMS credits expired", "created_at": now,
            })
    return sum(int(row.get("credits_remaining") or 0) for row in rows)


def sms_credit_balance(db, user_id):
    expired = expire_sms_credits(db, user_id)
    pipeline = [{"$match": {"user_id": user_id, "status": "active", "credits_remaining": {"$gt": 0}}}, {"$group": {"_id": None, "total": {"$sum": "$credits_remaining"}}}]
    row = next(db.user_sms_credit_batches.aggregate(pipeline), None)
    balance = int((row or {}).get("total") or 0)
    if expired:
        update_low_credit_alert(db, user_id, balance)
    return balance


def credit_sms_package(db, user, package, purchase_id=None, payment_transaction_id=None, reference=None):
    now = now_utc()
    purchase_key = purchase_id or payment_transaction_id or reference
    if purchase_key:
        existing = db.user_sms_credit_batches.find_one({"purchase_key": str(purchase_key)})
        if existing:
            return {"credited": False, "batch": existing, "balance": sms_credit_balance(db, user["_id"])}
    credits = int(package.get("total_sms") or 0)
    expiry_days = package.get("expiry_days")
    expires_at = now + timedelta(days=int(expiry_days)) if expiry_days else None
    before = sms_credit_balance(db, user["_id"])
    batch = {
        "user_id": user["_id"], "package_id": package.get("_id"), "package_name": package.get("name", "SMS Package"),
        "purchase_id": purchase_id, "payment_transaction_id": payment_transaction_id,
        "credits_purchased": credits,
        "credits_remaining": credits, "expires_at": expires_at, "status": "active", "created_at": now, "updated_at": now,
    }
    if purchase_key:
        batch["purchase_key"] = str(purchase_key)
    result = db.user_sms_credit_batches.insert_one(batch)
    batch["_id"] = result.inserted_id
    db.sms_credit_transactions.insert_one({
        "user_id": user["_id"], "type": "purchase", "credits": credits, "batch_id": result.inserted_id,
        "package_id": package.get("_id"), "purchase_id": purchase_id, "reference": reference,
        "balance_before": before, "balance_after": before + credits, "description": f"Purchased {package.get('name', 'SMS package')}", "created_at": now,
    })
    update_low_credit_alert(db, user["_id"], before + credits)
    return {"credited": True, "batch": batch, "balance": before + credits}


def reserve_sms_credits(db, user_id, credits, reference, category="sms"):
    credits = int(credits or 0)
    before = sms_credit_balance(db, user_id)
    if credits <= 0:
        return {"success": True, "balance_before": before, "balance_after": before, "allocations": []}
    if before < credits:
        return {"success": False, "balance": before}
    rows = list(db.user_sms_credit_batches.find({"user_id": user_id, "status": "active", "credits_remaining": {"$gt": 0}}).sort([("expires_at", 1), ("created_at", 1)]))
    # Mongo sorts null first; no-expiry credits must be consumed last.
    rows.sort(key=lambda row: (row.get("expires_at") is None, row.get("expires_at") or row.get("created_at")))
    remaining, allocations = credits, []
    for row in rows:
        take = min(remaining, int(row.get("credits_remaining") or 0))
        if not take:
            continue
        updated = db.user_sms_credit_batches.update_one({"_id": row["_id"], "credits_remaining": {"$gte": take}, "status": "active"}, {"$inc": {"credits_remaining": -take}, "$set": {"updated_at": now_utc()}})
        if not updated.modified_count:
            # Concurrent consumption: restore anything already reserved and let caller retry.
            refund_sms_credits(db, user_id, allocations, reference, "Concurrent SMS credit reservation rollback", record=False)
            return {"success": False, "balance": sms_credit_balance(db, user_id)}
        allocations.append({"batch_id": row["_id"], "credits": take})
        remaining -= take
        if remaining == 0:
            break
    if remaining:
        refund_sms_credits(db, user_id, allocations, reference, "Incomplete SMS credit reservation rollback", record=False)
        return {"success": False, "balance": sms_credit_balance(db, user_id)}
    after = before - credits
    db.sms_credit_transactions.insert_one({"user_id": user_id, "type": "usage", "credits": -credits, "reference": reference, "category": category, "allocations": allocations, "balance_before": before, "balance_after": after, "description": "SMS credits reserved", "status": "pending", "created_at": now_utc()})
    update_low_credit_alert(db, user_id, after)
    return {"success": True, "balance_before": before, "balance_after": after, "allocations": allocations}


def refund_sms_credits(db, user_id, allocations, reference, description="SMS credits refunded", record=True, credits=None):
    remaining = int(credits) if credits is not None else sum(int(item["credits"]) for item in allocations)
    refunded = 0
    for item in reversed(allocations):
        amount = min(remaining, int(item["credits"]))
        if amount <= 0:
            continue
        db.user_sms_credit_batches.update_one({"_id": item["batch_id"], "user_id": user_id}, {"$inc": {"credits_remaining": amount}, "$set": {"status": "active", "updated_at": now_utc()}})
        refunded += amount
        remaining -= amount
    if record and refunded:
        db.sms_credit_transactions.insert_one({"user_id": user_id, "type": "refund", "credits": refunded, "reference": reference, "description": description, "created_at": now_utc()})
    if refunded:
        update_low_credit_alert(db, user_id, sms_credit_balance(db, user_id))
    return refunded


def finalize_sms_usage(db, user_id, reference, status="success"):
    db.sms_credit_transactions.update_one({"user_id": user_id, "reference": reference, "type": "usage"}, {"$set": {"status": status, "updated_at": now_utc()}})
