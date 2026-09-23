"""Customer SMS reporting and transactional, idempotent admin adjustments."""
import re

from pymongo.errors import DuplicateKeyError
from pymongo.read_concern import ReadConcern
from pymongo.write_concern import WriteConcern

from utils.security import now_utc


def available_query(now):
    return {"status": "active", "credits_remaining": {"$gt": 0},
            "$or": [{"expires_at": None}, {"expires_at": {"$gt": now}}]}


def customer_sms_report(db, search="", page=1, page_size=25):
    now = now_utc()
    month = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    pipeline = [{"$match": {"role": {"$ne": "admin"}}}]
    def lookup(collection, name, stages):
        pipeline.append({"$lookup": {"from": collection, "localField": "_id",
                                    "foreignField": "user_id", "pipeline": stages, "as": name}})
    lookup("user_sms_credit_batches", "balance", [
        {"$match": available_query(now)},
        {"$group": {"_id": None, "total": {"$sum": "$credits_remaining"}}}])
    lookup("sms_package_purchases", "purchases", [
        {"$match": {"status": "success"}},
        {"$group": {"_id": None, "total": {"$sum": "$total_sms"},
                    "month": {"$sum": {"$cond": [{"$and": [{"$gte": ["$created_at", month]},
                                                            {"$lte": ["$created_at", now]}]}, "$total_sms", 0]}}}}])
    # Group refunds with their send reference before counting finalized sends.
    lookup("sms_credit_transactions", "usage", [
        {"$match": {"type": {"$in": ["usage", "refund"]}}},
        {"$group": {"_id": "$reference",
                    "finalized": {"$max": {"$cond": [{"$and": [{"$eq": ["$type", "usage"]},
                        {"$in": ["$status", ["success", "partial"]]}]}, 1, 0]}},
                    "net": {"$sum": "$credits"}}},
        {"$match": {"finalized": 1}},
        {"$group": {"_id": None, "total": {"$sum": {"$max": [0, {"$multiply": ["$net", -1]}]}}}}])
    fields = {"sms_balance": "$balance.total", "purchased_month": "$purchases.month",
              "purchased_total": "$purchases.total", "used_total": "$usage.total"}
    pipeline.append({"$project": {"full_name": 1, "email": 1, "account_status": 1,
        **{key: {"$ifNull": [{"$arrayElemAt": [value, 0]}, 0]} for key, value in fields.items()}}})
    filtered = []
    if search:
        filtered.append({"$match": {"$or": [{key: {"$regex": re.escape(search), "$options": "i"}}
                                             for key in ("full_name", "email")]}})
    pipeline.append({"$facet": {
        "summary": [{"$group": {"_id": None, "users": {"$sum": 1},
                     **{key: {"$sum": "$" + key} for key in fields}}}],
        "count": [*filtered, {"$count": "total"}],
        "users": [*filtered, {"$sort": {"full_name": 1, "_id": 1}},
                  {"$skip": (page - 1) * page_size}, {"$limit": page_size}]}})
    result = next(db.users.aggregate(pipeline), {})
    summary = next(iter(result.get("summary", [])), {"users": 0, **{key: 0 for key in fields}})
    summary.pop("_id", None)
    users = result.get("users", [])
    for user in users:
        user["id"] = str(user.pop("_id"))
    return {"success": True, "summary": summary, "users": users,
            "total": next(iter(result.get("count", [])), {}).get("total", 0),
            "page": page, "page_size": page_size, "month_start": month.isoformat() + "Z"}


def adjust_customer_sms(db, user_id, admin_id, action, amount, reason, request_id):
    operation_id = "admin-sms:" + request_id
    signature = {"user_id": user_id, "admin_id": admin_id, "action": action, "amount": amount, "reason": reason}

    def replay(row):
        if any(row.get(key) != value for key, value in signature.items()):
            raise ValueError("This request ID was already used for a different adjustment.")
        return {"success": True, "balance_before": row["balance_before"], "sms_balance": row["balance_after"]}

    def apply(session):
        previous = db.sms_credit_transactions.find_one({"_id": operation_id}, session=session)
        if previous:
            return replay(previous)
        if not db.users.find_one({"_id": user_id, "role": {"$ne": "admin"}}, session=session):
            raise ValueError("Customer account not found.")
        now = now_utc()
        batches = list(db.user_sms_credit_batches.find(
            {"user_id": user_id, **available_query(now)}, session=session))
        before = sum(int(row["credits_remaining"]) for row in batches)
        if action == "debit" and amount > before:
            raise ValueError("Deduction cannot exceed the available SMS balance.")
        allocations = []
        if action == "credit":
            batch = db.user_sms_credit_batches.insert_one({
                "user_id": user_id, "package_name": "Admin SMS adjustment", "source": "admin",
                "credits_purchased": 0, "credits_remaining": amount, "expires_at": None,
                "status": "active", "created_at": now, "updated_at": now,
                "purchase_key": operation_id}, session=session)
            allocations.append({"batch_id": batch.inserted_id, "credits": amount})
        else:
            batches.sort(key=lambda row: (row.get("expires_at") is None,
                                         row.get("expires_at") or row.get("created_at") or now, str(row["_id"])))
            remaining = amount
            for batch in batches:
                take = min(remaining, int(batch["credits_remaining"]))
                db.user_sms_credit_batches.update_one({"_id": batch["_id"]},
                    {"$inc": {"credits_remaining": -take}, "$set": {"updated_at": now}}, session=session)
                allocations.append({"batch_id": batch["_id"], "credits": take})
                remaining -= take
                if remaining == 0:
                    break
        after = before + (amount if action == "credit" else -amount)
        record = {"_id": operation_id, **signature, "type": "admin_adjustment",
                  "credits": amount if action == "credit" else -amount, "reference": operation_id,
                  "balance_before": before, "balance_after": after, "allocations": allocations,
                  "status": "success", "description": reason, "created_at": now}
        db.sms_credit_transactions.insert_one(record, session=session)
        db.admin_activity_logs.insert_one({"admin_id": admin_id, "action": "sms_adjusted",
            "target_user_id": str(user_id), "metadata": {"type": action, "amount": amount,
            "reason": reason, "balance_before": before, "balance_after": after,
            "reference": operation_id}, "created_at": now}, session=session)
        return replay(record)

    try:
        with db.client.start_session() as session:
            return session.with_transaction(apply, read_concern=ReadConcern("snapshot"), write_concern=WriteConcern("majority"))
    except DuplicateKeyError:
        previous = db.sms_credit_transactions.find_one({"_id": operation_id})
        if previous:
            return replay(previous)
        raise
