import time

from app import app
from routes.email_routes import account_bounce_tracking, email_accounts, sync_gmail_bounces_for_account


def run_once() -> dict:
    with app.app_context():
        updated = 0
        errors = 0
        scanned = 0
        query = {"provider": "gmail", "status": "connected"}
        for account in email_accounts().find(query):
            if account_bounce_tracking(account) != "active":
                continue
            scanned += 1
            result = sync_gmail_bounces_for_account(account)
            updated += result.get("updated", 0)
            errors += result.get("errors", 0)
        return {"scanned": scanned, "updated": updated, "errors": errors}


def main(interval_seconds: int = 300) -> None:
    while True:
        result = run_once()
        print(
            f"email status sync: scanned={result['scanned']} "
            f"updated={result['updated']} errors={result['errors']}",
            flush=True,
        )
        time.sleep(interval_seconds)


if __name__ == "__main__":
    main()
