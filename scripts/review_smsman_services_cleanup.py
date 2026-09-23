"""
Review SMS-MAN services and generate cleanup candidates.

This script does not delete anything from smsman_services.

Run from the project root:
  python scripts/review_smsman_services_cleanup.py
"""

import csv
import json
import os
import re
import time
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional

from dotenv import load_dotenv
from pymongo import MongoClient, UpdateOne
from pymongo.collection import Collection
from pymongo.errors import AutoReconnect, NetworkTimeout
from pymongo.server_api import ServerApi


PROJECT_ROOT = Path(__file__).resolve().parent.parent
REPORTS_DIR = PROJECT_ROOT / "reports"
CSV_REPORT = REPORTS_DIR / "smsman_services_delete_candidates.csv"
JSON_REPORT = REPORTS_DIR / "smsman_services_delete_candidates.json"
PROVIDER = "smsman"
PLACEHOLDER_IMAGE_URL = "https://imagedelivery.net/cg2aWO7l_BnFQQ6dZHYOSA/services/Frame.png/thumb"
BULK_BATCH_SIZE = 500
MAX_WRITE_RETRIES = 3

CJK_RE = re.compile(r"[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\u3040-\u30ff\uac00-\ud7af]")
LATIN_RE = re.compile(r"[A-Za-z]")
TEST_RE = re.compile(r"\b(test|demo|temp|temporary|sample|dummy|fake|sandbox)\b", re.IGNORECASE)
ODD_PUNCT_RE = re.compile(r"[_{}[\]|\\<>~`^=+]")

PROTECTED_POPULAR = {
    "whatsapp", "telegram", "facebook", "instagram", "gmail", "google", "youtube", "tiktok",
    "twitter", "x", "yahoo", "microsoft", "outlook", "hotmail", "discord", "snapchat",
    "tinder", "binance", "paypal", "amazon", "uber", "bolt", "netflix", "spotify",
    "apple", "icloud", "linkedin", "openai", "chatgpt", "coinbase",
}

CSV_COLUMNS = [
    "provider_id",
    "code",
    "title",
    "name",
    "image_url",
    "delete_priority",
    "reason",
    "confidence",
    "recommended_action",
]


def load_environment() -> None:
    load_dotenv(PROJECT_ROOT / ".env")
    load_dotenv(PROJECT_ROOT / "backend" / ".env")


def get_mongo_client() -> MongoClient:
    mongo_uri = os.getenv("MONGO_URI", "").strip()
    if not mongo_uri or mongo_uri == "your_mongodb_uri":
        mongo_uri = os.getenv("MONGODB_URI", "").strip()
    if not mongo_uri:
        raise RuntimeError("Missing MONGO_URI or MONGODB_URI environment variable.")
    return MongoClient(mongo_uri, server_api=ServerApi("1"))


def get_database(client: MongoClient):
    db_name = os.getenv("MONGO_DB_NAME", "viresend").strip() or "viresend"
    return client.get_default_database(default=db_name)


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def clean(value: Any) -> str:
    return str(value or "").strip()


def normalized_words(value: str) -> List[str]:
    return re.findall(r"[a-z0-9]+", value.lower())


def display_name(service: Dict[str, Any]) -> str:
    return clean(service.get("title") or service.get("name"))


def service_text(service: Dict[str, Any]) -> str:
    return " ".join([
        clean(service.get("title")),
        clean(service.get("name")),
        clean(service.get("code")),
    ])


def contains_cjk(service: Dict[str, Any]) -> bool:
    return bool(CJK_RE.search(service_text(service)))


def is_placeholder_icon(service: Dict[str, Any]) -> bool:
    image_url = clean(service.get("image_url") or service.get("image"))
    return image_url == PLACEHOLDER_IMAGE_URL


def is_protected(service: Dict[str, Any]) -> bool:
    words = set(normalized_words(service_text(service)))
    if words & PROTECTED_POPULAR:
        return True

    text = service_text(service).lower()
    return any(name in text for name in PROTECTED_POPULAR if len(name) > 2)


def non_latin_ratio(value: str) -> float:
    compact = "".join(char for char in value if not char.isspace())
    if not compact:
        return 0.0
    latin = len(LATIN_RE.findall(compact))
    return max(0.0, (len(compact) - latin) / len(compact))


def duplicate_name_key(service: Dict[str, Any]) -> str:
    name = display_name(service).lower()
    return re.sub(r"[^a-z0-9]+", "", name)


def choose_candidate(service: Dict[str, Any], duplicate_counts: Counter) -> Optional[Dict[str, str]]:
    title = clean(service.get("title"))
    name = clean(service.get("name"))
    code = clean(service.get("code"))
    image_url = clean(service.get("image_url") or service.get("image"))
    label = title or name

    if is_protected(service):
        return None

    if contains_cjk(service):
        return {
            "delete_priority": "mandatory",
            "reason": "Contains Chinese/CJK characters",
            "confidence": "0.99",
            "recommended_action": "delete",
        }

    reasons = []
    confidence = 0.55

    if not title or not name:
        reasons.append("Empty title or name")
        confidence = max(confidence, 0.72)
    if is_placeholder_icon(service):
        reasons.append("Placeholder/default icon")
        confidence = max(confidence, 0.62)
    if TEST_RE.search(label):
        reasons.append("Test/demo/temp service")
        confidence = max(confidence, 0.9)
    if len(label) > 42:
        reasons.append("Very long strange name")
        confidence = max(confidence, 0.68)
    if label and non_latin_ratio(label) >= 0.45:
        reasons.append("Non-English/non-Latin heavy name")
        confidence = max(confidence, 0.75)
    if ODD_PUNCT_RE.search(label):
        reasons.append("Strange punctuation in name")
        confidence = max(confidence, 0.62)

    duplicate_key = duplicate_name_key(service)
    if duplicate_key and duplicate_counts[duplicate_key] > 1:
        reasons.append("Duplicate-looking service name")
        confidence = max(confidence, 0.58)

    if not reasons:
        return None

    return {
        "delete_priority": "review",
        "reason": "; ".join(dict.fromkeys(reasons)),
        "confidence": f"{confidence:.2f}",
        "recommended_action": "manual_review",
    }


def report_row(service: Dict[str, Any], candidate: Dict[str, str]) -> Dict[str, str]:
    return {
        "provider_id": clean(service.get("provider_id")),
        "code": clean(service.get("code")),
        "title": clean(service.get("title")),
        "name": clean(service.get("name")),
        "image_url": clean(service.get("image_url") or service.get("image")),
        **candidate,
    }


def write_reports(rows: List[Dict[str, str]]) -> None:
    REPORTS_DIR.mkdir(parents=True, exist_ok=True)

    with CSV_REPORT.open("w", encoding="utf-8", newline="") as csv_file:
        writer = csv.DictWriter(csv_file, fieldnames=CSV_COLUMNS)
        writer.writeheader()
        writer.writerows(rows)

    with JSON_REPORT.open("w", encoding="utf-8") as json_file:
        json.dump(rows, json_file, indent=2, ensure_ascii=False)


def chunked(items: List[UpdateOne], size: int) -> Iterable[List[UpdateOne]]:
    for index in range(0, len(items), size):
        yield items[index:index + size]


def write_batch(collection: Collection, batch: List[UpdateOne]):
    for attempt in range(1, MAX_WRITE_RETRIES + 1):
        try:
            return collection.bulk_write(batch, ordered=False)
        except (AutoReconnect, NetworkTimeout) as exc:
            if attempt == MAX_WRITE_RETRIES:
                raise
            wait_seconds = attempt * 2
            print(f"Temporary MongoDB issue while writing cleanup candidates; retrying in {wait_seconds}s: {exc}")
            time.sleep(wait_seconds)


def upsert_candidates(collection: Collection, rows: List[Dict[str, str]], timestamp: datetime) -> int:
    operations = []
    for row in rows:
        operations.append(UpdateOne(
            {"provider": PROVIDER, "service_id": row["provider_id"]},
            {
                "$set": {
                    "provider": PROVIDER,
                    "service_id": row["provider_id"],
                    "code": row["code"],
                    "title": row["title"],
                    "name": row["name"],
                    "image_url": row["image_url"],
                    "delete_priority": row["delete_priority"],
                    "reason": row["reason"],
                    "confidence": float(row["confidence"]),
                    "recommended_action": row["recommended_action"],
                },
                "$setOnInsert": {"created_at": timestamp},
            },
            upsert=True,
        ))

    modified = 0
    for batch_number, batch in enumerate(chunked(operations, BULK_BATCH_SIZE), start=1):
        print(f"Writing cleanup candidate batch {batch_number} ({len(batch)} records)...")
        result = write_batch(collection, batch)
        modified += result.modified_count + len(result.upserted_ids)
    return modified


def main() -> None:
    load_environment()
    timestamp = now_utc()

    client = get_mongo_client()
    try:
        db = get_database(client)
        services = list(db.smsman_services.find({"provider": PROVIDER, "is_active": True}))
        duplicate_counts = Counter(duplicate_name_key(service) for service in services if duplicate_name_key(service))

        rows: List[Dict[str, str]] = []
        protected_skipped = 0
        for service in services:
            if is_protected(service):
                protected_skipped += 1
                continue
            candidate = choose_candidate(service, duplicate_counts)
            if candidate:
                rows.append(report_row(service, candidate))

        rows.sort(key=lambda row: (0 if row["delete_priority"] == "mandatory" else 1, row["title"].lower(), row["provider_id"]))
        write_reports(rows)

        candidates = db.smsman_service_cleanup_candidates
        candidates.create_index([("provider", 1), ("service_id", 1)], unique=True)
        candidates.create_index([("delete_priority", 1)])
        candidates.create_index([("recommended_action", 1)])
        upserted_or_updated = upsert_candidates(candidates, rows, timestamp)

        mandatory_count = sum(1 for row in rows if row["delete_priority"] == "mandatory")
        review_count = sum(1 for row in rows if row["delete_priority"] == "review")
        print(f"Total services scanned: {len(services)}")
        print(f"Mandatory delete count: {mandatory_count}")
        print(f"Review delete count: {review_count}")
        print(f"Protected skipped count: {protected_skipped}")
        print(f"Cleanup candidate records upserted/updated: {upserted_or_updated}")
        print(f"CSV report: {CSV_REPORT}")
        print(f"JSON report: {JSON_REPORT}")
    finally:
        client.close()


if __name__ == "__main__":
    main()
