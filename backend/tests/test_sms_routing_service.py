import sys
import unittest
from pathlib import Path


BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from flask import Flask

from services.sms_routing_service import build_recipient_plan, parse_phone_number, sms_segments


class PricingCollection:
    def __init__(self, rows):
        self.rows = rows

    def find_one(self, query):
        return next((row for row in self.rows if row["provider"] == query["provider"] and row["country_code"] == query["country_code"]), None)


class FakeDb:
    def __init__(self, rows):
        self.international_sms_pricing = PricingCollection(rows)


class SmsRoutingServiceTests(unittest.TestCase):
    def test_ghana_numbers_normalize_to_e164(self):
        for raw in ("0244000000", "+233244000000", "233244000000"):
            destination = parse_phone_number(raw)
            self.assertEqual(destination.e164, "+233244000000")
            self.assertEqual(destination.country_code, "GH")
            self.assertFalse(destination.international)

    def test_international_examples_route_outside_ghana(self):
        examples = {
            "+12025550123": "US",
            "+447700900123": "GB",
            "+2348031234567": "NG",
            "+254712345678": "KE",
            "+971501234567": "AE",
        }
        for raw, country in examples.items():
            with self.subTest(raw=raw):
                destination = parse_phone_number(raw)
                self.assertEqual(destination.e164, raw)
                self.assertEqual(destination.country_code, country)
                self.assertTrue(destination.international)

    def test_sms_segmentation_handles_gsm_unicode_and_concatenation(self):
        self.assertEqual(sms_segments("A" * 160)["parts"], 1)
        self.assertEqual(sms_segments("A" * 161)["parts"], 2)
        self.assertEqual(sms_segments("🙂" * 35)["parts"], 1)
        self.assertEqual(sms_segments("🙂" * 36)["parts"], 2)
        self.assertEqual(sms_segments("🙂")["encoding"], "UCS-2")

    def test_mixed_country_plan_routes_ghana_locally_and_international_to_bird(self):
        app = Flask(__name__)
        app.config["DB"] = FakeDb([
            {"provider": "bird", "country_code": "US", "country_name": "United States", "dial_code": "+1", "provider_cost": 0.5, "provider_currency": "USD", "exchange_rate_to_ghs": 10, "user_price_ghs": 7, "enabled": True, "shared_sender": True},
            {"provider": "bird", "country_code": "GB", "country_name": "United Kingdom", "dial_code": "+44", "provider_cost": 0.4, "provider_currency": "USD", "exchange_rate_to_ghs": 10, "user_price_ghs": 6, "enabled": True},
        ])
        settings = {"active_sms_provider": "moolre", "sms_cost_per_message": 0.04, "sms_provider_cost_per_message": 0.02}
        with app.app_context():
            plan = build_recipient_plan(["0244000000", "+12025550123", "+447700900123"], "Hello", settings)
        self.assertEqual(set(plan["groups"]), {"moolre", "bird"})
        self.assertEqual(plan["groups"]["moolre"][0]["country_code"], "GH")
        self.assertEqual({row["country_code"] for row in plan["groups"]["bird"]}, {"US", "GB"})
        self.assertFalse(plan["groups"]["bird"][0]["requires_sender_id"])
        self.assertTrue(next(row for row in plan["groups"]["bird"] if row["country_code"] == "GB")["requires_sender_id"])
        self.assertEqual(plan["total_cost"], 13.04)


if __name__ == "__main__":
    unittest.main()
