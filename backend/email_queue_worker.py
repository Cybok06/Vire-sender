import os
import time

from app import create_app
from routes.email_routes import process_stale_copy_paste_jobs


def main():
    app = create_app()
    interval = int(os.getenv("EMAIL_QUEUE_WORKER_INTERVAL", "3") or "3")
    batch_size = int(os.getenv("EMAIL_QUEUE_WORKER_BATCH", "5") or "5")
    print("VireSend email queue worker started.")
    while True:
        try:
            process_stale_copy_paste_jobs(app, batch_size)
        except Exception as exc:
            print(f"Email queue worker error: {exc}")
        time.sleep(max(1, interval))


if __name__ == "__main__":
    main()
