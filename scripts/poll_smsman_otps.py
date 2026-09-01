from pathlib import Path
import sys


ROOT = Path(__file__).resolve().parents[1]
BACKEND_DIR = ROOT / "backend"
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app import create_app  # noqa: E402
from routes.admin_routes import poll_waiting_smsman_orders  # noqa: E402


def main():
    app = create_app()
    with app.app_context():
        summary = poll_waiting_smsman_orders()
        print("SMS-MAN OTP polling completed")
        print(f"checked={summary['checked']}")
        print(f"received={summary['received']}")
        print(f"waiting={summary['waiting']}")
        print(f"expired={summary['expired']}")
        print(f"errors={summary['errors']}")


if __name__ == "__main__":
    main()
