from app import app
from routes.wallet_routes import verify_moolre_transaction
from services.wallet_crediting import credit_verified_deposit
from utils.security import now_utc


PENDING_STATUSES = ["pending", "processing", "otp_required"]


def reconcile(limit=50, apply=False):
    summary = {"checked": 0, "credited": 0, "pending": 0, "failed": 0, "errors": 0, "apply": apply}
    with app.app_context():
        db = app.config["DB"]
        txns = list(
            db.wallet_transactions.find({
                "provider": "moolre",
                "wallet_credited": {"$ne": True},
                "status": {"$in": PENDING_STATUSES},
            }).sort("created_at", 1).limit(limit)
        )
        for txn in txns:
            summary["checked"] += 1
            try:
                verified, _message = verify_moolre_transaction(txn)
                refreshed = db.wallet_transactions.find_one({"_id": txn["_id"]}) or txn
                if verified and apply:
                    result = credit_verified_deposit(db, txn["_id"], {"verified_at": now_utc()})
                    if result.get("credited"):
                        summary["credited"] += 1
                    else:
                        summary["pending"] += 1
                elif refreshed.get("status") == "failed":
                    summary["failed"] += 1
                else:
                    summary["pending"] += 1
            except Exception:
                app.logger.exception("Moolre reconciliation failed transaction_id=%s", txn.get("_id"))
                summary["errors"] += 1
    return summary


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Reconcile pending Moolre wallet deposits.")
    parser.add_argument("--limit", type=int, default=50)
    parser.add_argument("--apply", action="store_true", help="Credit verified deposits. Without this flag the run updates statuses only.")
    args = parser.parse_args()
    print(reconcile(limit=args.limit, apply=args.apply))
