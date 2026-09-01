"""Copy SMS-MAN service provider_id values into service_id.

Run once from the project root:
  python scripts/migrate_smsman_services_service_id.py

This intentionally keeps provider_id in place because the current backend still
has fallback reads that may rely on it.
"""

from pathlib import Path
import sys

from pymongo import MongoClient
from pymongo.server_api import ServerApi


PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT / "backend"))

from config import Config  # noqa: E402


def main() -> int:
    if not Config.MONGO_URI:
        print("Missing MONGO_URI or MONGODB_URI in your .env file.")
        return 1

    client = MongoClient(Config.MONGO_URI, server_api=ServerApi("1"))
    db = client.get_default_database(default=Config.MONGO_DB_NAME)
    collection = db.smsman_services

    query = {
        "provider": "smsman",
        "provider_id": {"$exists": True, "$ne": ""},
        "$or": [
            {"service_id": {"$exists": False}},
            {"service_id": ""},
            {"service_id": None},
        ],
    }

    result = collection.update_many(query, [{"$set": {"service_id": "$provider_id"}}])

    print("SMS-MAN service_id migration complete.")
    print(f"Database: {db.name}")
    print(f"Matched: {result.matched_count}")
    print(f"Modified: {result.modified_count}")
    print("Note: provider_id was kept for backward compatibility.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
