from app import app
from utils.security import now_utc


def migrate():
    with app.app_context():
        db = app.config["DB"]
        now = now_utc()
        paystack = db.payment_settings.find_one({"_id": "paystack"}) or {}
        if paystack:
            minimum = paystack.get("minimum_deposit", paystack.get("min_deposit", 1))
            maximum = paystack.get("maximum_deposit", paystack.get("max_deposit", 1000))
            db.payment_settings.update_one(
                {"_id": "paystack"},
                {"$set": {
                    "provider": "paystack",
                    "display_name": "Paystack",
                    "is_active": bool(paystack.get("is_active", paystack.get("enabled", False))),
                    "enabled": bool(paystack.get("is_active", paystack.get("enabled", False))),
                    "environment": "live",
                    "currency": paystack.get("currency", "GHS"),
                    "minimum_deposit": minimum,
                    "maximum_deposit": maximum,
                    "min_deposit": minimum,
                    "max_deposit": maximum,
                    "updated_at": now,
                }},
                upsert=True,
            )
        db.payment_settings.update_one(
            {"_id": "moolre"},
            {"$setOnInsert": {
                "provider": "moolre",
                "display_name": "Moolre",
                "is_active": False,
                "is_default": False,
                "environment": "sandbox",
                "currency": "GHS",
                "minimum_deposit": 50,
                "maximum_deposit": 1000,
                "reference_prefix": "VIRE-DEP",
                "redirect_url": "",
                "link_expiration_minutes": 30,
                "configuration_status": "incomplete",
                "created_at": now,
                "updated_at": now,
            }},
            upsert=True,
        )
        if not db.payment_settings.find_one({"is_default": True}):
            active_paystack = db.payment_settings.find_one({"_id": "paystack", "is_active": True})
            if active_paystack:
                db.payment_settings.update_one({"_id": "paystack"}, {"$set": {"is_default": True, "updated_at": now}})
        return {"success": True}


if __name__ == "__main__":
    print(migrate())
