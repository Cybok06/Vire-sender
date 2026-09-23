"""
Add country flag URLs to SMS-MAN countries in MongoDB.

Run from the project root:
  python scripts/import_smsman_country_flags.py
"""

import os
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable, List

from dotenv import load_dotenv
from pymongo import MongoClient, UpdateOne
from pymongo.collection import Collection
from pymongo.errors import AutoReconnect, NetworkTimeout
from pymongo.server_api import ServerApi


PROJECT_ROOT = Path(__file__).resolve().parent.parent
PROVIDER = "smsman"
FLAG_SOURCE = "flagcdn.com"
FLAG_BASE_URL = "https://flagcdn.com"
BULK_BATCH_SIZE = 500
MAX_WRITE_RETRIES = 3
VERBOSE_COUNTRY_LOGS = os.getenv("SMSMAN_FLAG_IMPORT_VERBOSE", "true").strip().lower() in {"1", "true", "yes", "on"}


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


def clean(value) -> str:
    return str(value or "").strip()


def normalize_country_code(value) -> str:
    code = clean(value).upper()
    return code if len(code) == 2 and code.isalpha() else ""


def flag_urls(country_code: str) -> dict:
    code = country_code.lower()
    return {
        "flag": f"{FLAG_BASE_URL}/w40/{code}.png",
        "flag_url": f"{FLAG_BASE_URL}/w40/{code}.png",
        "flag_svg_url": f"{FLAG_BASE_URL}/{code}.svg",
        "flag_png_url": f"{FLAG_BASE_URL}/w80/{code}.png",
    }


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
            print(f"Temporary MongoDB issue while writing country flags; retrying in {wait_seconds}s: {exc}")
            time.sleep(wait_seconds)


def main() -> None:
    load_environment()
    timestamp = now_utc()

    client = get_mongo_client()
    try:
        db = get_database(client)
        countries = list(db.smsman_countries.find({"provider": PROVIDER}))
        print(f"Flag source: {FLAG_SOURCE}")
        print(f"Mongo countries found: {len(countries)}")

        operations: List[UpdateOne] = []
        skipped = 0
        for index, country in enumerate(countries, start=1):
            country_id = clean(country.get("country_id") or country.get("provider_id"))
            title = clean(country.get("title") or country_id)
            code = normalize_country_code(country.get("code"))
            if not code:
                skipped += 1
                print(f"[{index}/{len(countries)}] skipped: {title} country_id={country_id or '-'} has invalid code={clean(country.get('code')) or '-'}")
                continue

            urls = flag_urls(code)
            if VERBOSE_COUNTRY_LOGS:
                print(f"[{index}/{len(countries)}] flag: {title} code={code} country_id={country_id or '-'} -> {urls['flag_url']}")

            operations.append(UpdateOne(
                {"_id": country["_id"]},
                {"$set": {
                    **urls,
                    "flag_source": FLAG_SOURCE,
                    "updated_at": timestamp,
                }},
            ))

        modified = 0
        total_batches = (len(operations) + BULK_BATCH_SIZE - 1) // BULK_BATCH_SIZE
        for batch_number, batch in enumerate(chunked(operations, BULK_BATCH_SIZE), start=1):
            print(f"Writing country flag batch {batch_number}/{total_batches} ({len(batch)} countries)...")
            result = write_batch(db.smsman_countries, batch)
            modified += result.modified_count
            print(
                f"Batch {batch_number}/{total_batches} complete: "
                f"matched={result.matched_count}, modified={result.modified_count}, total_modified={modified}"
            )

        print(f"Countries scanned: {len(countries)}")
        print(f"Countries updated with flag URLs: {len(operations)}")
        print(f"Countries skipped: {skipped}")
        print(f"Countries modified: {modified}")
    finally:
        client.close()


if __name__ == "__main__":
    main()
