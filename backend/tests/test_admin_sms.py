"""Run with SMS_TEST_MONGO_URI pointing to an isolated replica set (never production)."""
import os
import sys
import unittest
from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta
from pathlib import Path
from unittest.mock import patch
from uuid import uuid4

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from bson import ObjectId
from flask import Flask
from pymongo import MongoClient

from routes.admin_sms_routes import admin_users_sms_bp
from services.admin_sms_service import adjust_customer_sms, customer_sms_report
from services.sms_credit_service import reserve_sms_credits
from utils.security import now_utc


class AdminSmsValidationTests(unittest.TestCase):
    def setUp(self):
        self.app = Flask(__name__)
        self.app.register_blueprint(admin_users_sms_bp)
        self.client = self.app.test_client()
        self.url = f"/api/admin/users-sms/{ObjectId()}/adjust"

    def test_requires_admin_for_read_and_write(self):
        for payload, status in [(None, 401), ({"role": "user"}, 403)]:
            with patch("utils.auth.get_auth_payload", return_value=payload):
                self.assertEqual(self.client.get('/api/admin/users-sms').status_code, status)
                self.assertEqual(self.client.post(self.url, json={}).status_code, status)

    def test_rejects_invalid_adjustments(self):
        base = {"amount": 10, "type": "credit", "reason": "Correction", "request_id": str(uuid4())}
        invalid = [{"amount": amount} for amount in [0, -1, 1.5, True, "10", None, 2147483648]]
        invalid += [{"reason": " "}, {"reason": "x" * 501}, {"type": "purchase"}, {"request_id": "bad"}]
        with patch("utils.auth.get_auth_payload", return_value={"role": "admin", "user_id": "admin"}):
            for change in invalid:
                with self.subTest(change=change):
                    self.assertEqual(self.client.post(self.url, json={**base, **change}).status_code, 400)


@unittest.skipUnless(os.environ.get("SMS_TEST_MONGO_URI"), "Set SMS_TEST_MONGO_URI to run replica-set integration tests")
class AdminSmsIntegrationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.client = MongoClient(os.environ["SMS_TEST_MONGO_URI"], serverSelectionTimeoutMS=5000)
        cls.db = cls.client["viresend_sms_test_" + uuid4().hex]
        # Precreate collections for compatibility with older MongoDB transaction implementations.
        for name in ["users", "user_sms_credit_batches", "sms_credit_transactions", "admin_activity_logs", "sms_package_purchases"]:
            cls.db.create_collection(name)
        cls.db.user_sms_credit_batches.create_index("purchase_key", unique=True, sparse=True)

    @classmethod
    def tearDownClass(cls):
        cls.client.drop_database(cls.db.name)
        cls.client.close()

    def setUp(self):
        for name in self.db.list_collection_names():
            self.db[name].delete_many({})
        self.user = ObjectId()
        self.db.users.insert_one({"_id": self.user, "full_name": "Alice", "email": "alice@example.test", "role": "user"})
        self.now = now_utc()

    def batch(self, credits, expiry=None, user=None):
        return self.db.user_sms_credit_batches.insert_one({"user_id": user or self.user, "status": "active",
            "credits_remaining": credits, "expires_at": expiry, "created_at": self.now}).inserted_id

    def adjust(self, action, amount, request_id=None):
        return adjust_customer_sms(self.db, self.user, "admin", action, amount, "Account correction", request_id or str(uuid4()))

    def test_addition_idempotency_and_audit(self):
        self.batch(20)
        key = str(uuid4())
        first = self.adjust("credit", 50, key)
        self.assertEqual(first["sms_balance"], 70)
        self.assertEqual(self.adjust("credit", 50, key), first)
        self.assertEqual(self.db.admin_activity_logs.count_documents({}), 1)
        self.assertEqual(self.db.sms_credit_transactions.count_documents({"type": "admin_adjustment"}), 1)
        batch = self.db.user_sms_credit_batches.find_one({"source": "admin"})
        self.assertIsNone(batch["expires_at"])
        with self.assertRaises(ValueError):
            self.adjust("credit", 60, key)

    def test_deduction_expiry_order_and_insufficient_balance(self):
        expired = self.batch(99, self.now - timedelta(days=1))
        first = self.batch(10, self.now + timedelta(days=1))
        later = self.batch(20, self.now + timedelta(days=2))
        permanent = self.batch(30)
        self.assertEqual(self.adjust("debit", 25)["sms_balance"], 35)
        for batch, remaining in [(expired, 99), (first, 0), (later, 5), (permanent, 30)]:
            self.assertEqual(self.db.user_sms_credit_batches.find_one({"_id": batch})["credits_remaining"], remaining)
        with self.assertRaises(ValueError):
            self.adjust("debit", 36)
        self.assertEqual(self.db.admin_activity_logs.count_documents({}), 1)

    def test_concurrent_duplicate_additions(self):
        key = str(uuid4())
        with ThreadPoolExecutor(max_workers=4) as pool:
            results = list(pool.map(lambda _: self.adjust("credit", 50, key), range(4)))
        self.assertTrue(all(row["sms_balance"] == 50 for row in results))
        self.assertEqual(self.db.user_sms_credit_batches.count_documents({}), 1)

    def test_concurrent_send_and_deduction_never_overdraw(self):
        self.batch(50)
        def debit():
            try:
                self.adjust("debit", 40)
                return True
            except ValueError:
                return False
        with patch("services.sms_credit_service.update_low_credit_alert"):
            with ThreadPoolExecutor(max_workers=2) as pool:
                deduction = pool.submit(debit)
                sending = pool.submit(reserve_sms_credits, self.db, self.user, 40, "concurrent-send")
                outcomes = [deduction.result(), sending.result()["success"]]
        self.assertEqual(sum(outcomes), 1)
        self.assertEqual(self.db.user_sms_credit_batches.find_one({})["credits_remaining"], 10)

    def test_audit_failure_rolls_back_credits(self):
        self.batch(20)
        from pymongo.collection import Collection
        original = Collection.insert_one
        def insert(collection, document, *args, **kwargs):
            if collection.name == "admin_activity_logs":
                raise RuntimeError("Simulated audit failure")
            return original(collection, document, *args, **kwargs)
        with patch.object(Collection, "insert_one", insert), self.assertRaises(RuntimeError):
            self.adjust("credit", 50)
        self.assertEqual(self.db.user_sms_credit_batches.count_documents({}), 1)
        self.assertEqual(self.db.sms_credit_transactions.count_documents({}), 0)

    def test_reporting_month_refunds_zero_balances_search_and_pagination(self):
        month = self.now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        self.batch(30)
        self.batch(100, self.now - timedelta(seconds=1))
        admin = ObjectId()
        self.db.users.insert_one({"_id": admin, "role": "admin"})
        self.batch(999, user=admin)
        for credits, date, status in [(100, month, "success"), (200, month - timedelta(seconds=1), "success"), (400, self.now, "pending")]:
            self.db.sms_package_purchases.insert_one({"user_id": self.user, "total_sms": credits, "created_at": date, "status": status})
        for reference, kind, credits, status in [("sent", "usage", -40, "success"), ("partial", "usage", -30, "partial"),
                ("partial", "refund", 20, None), ("failed", "usage", -50, "refunded"), ("failed", "refund", 50, None),
                ("pending", "usage", -10, "pending"), ("manual", "admin_adjustment", -500, "success")]:
            self.db.sms_credit_transactions.insert_one({"user_id": self.user, "reference": reference,
                "type": kind, "credits": credits, "status": status})
        self.db.users.insert_many([{"full_name": f"Zero {i:02}", "role": "user"} for i in range(26)])
        report = customer_sms_report(self.db)
        self.assertEqual(report["summary"], {"users": 27, "sms_balance": 30, "purchased_month": 100,
                                            "purchased_total": 300, "used_total": 50})
        self.assertEqual(len(report["users"]), 25)
        self.assertEqual(len(customer_sms_report(self.db, page=2)["users"]), 2)
        filtered = customer_sms_report(self.db, search="alice")
        self.assertEqual(filtered["total"], 1)
        self.assertEqual(filtered["users"][0]["used_total"], 50)
        self.assertEqual(filtered["summary"], report["summary"])
        self.assertEqual(customer_sms_report(self.db, search=".*")["total"], 0)

    def test_empty_report(self):
        self.db.users.delete_many({})
        report = customer_sms_report(self.db)
        self.assertEqual(report["summary"]["sms_balance"], 0)
        self.assertEqual(report["users"], [])

    def test_admin_adjustments_do_not_change_purchase_or_send_totals(self):
        self.adjust("credit", 100)
        self.adjust("debit", 35)
        summary = customer_sms_report(self.db)["summary"]
        self.assertEqual(summary, {"users": 1, "sms_balance": 65, "purchased_month": 0,
                                   "purchased_total": 0, "used_total": 0})

    def test_adjustment_endpoint_and_report(self):
        app = Flask(__name__)
        app.config["DB"] = self.db
        app.register_blueprint(admin_users_sms_bp)
        client = app.test_client()
        body = {"amount": 80, "type": "credit", "reason": "Customer correction", "request_id": str(uuid4())}
        with patch("utils.auth.get_auth_payload", return_value={"role": "admin", "user_id": "admin"}), \
                patch("routes.admin_sms_routes.update_low_credit_alert"):
            first = client.post(f"/api/admin/users-sms/{self.user}/adjust", json=body)
            self.assertEqual(first.status_code, 200)
            self.assertEqual(first.json["sms_balance"], 80)
            repeated = client.post(f"/api/admin/users-sms/{self.user}/adjust", json=body)
            self.assertEqual(repeated.json["sms_balance"], 80)
            report = client.get("/api/admin/users-sms?search=Alice")
            self.assertEqual(report.status_code, 200)
            self.assertEqual(report.json["users"][0]["sms_balance"], 80)


if __name__ == "__main__":
    unittest.main()
