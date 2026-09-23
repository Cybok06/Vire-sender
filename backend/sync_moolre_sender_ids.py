from app import create_app
from services.moolre_sender_id_service import sync_all_sender_ids


def main():
    app = create_app()
    with app.app_context():
        result = sync_all_sender_ids("system")
        print(
            "Moolre Sender ID sync complete: "
            f"matched={result.get('matched', 0)} "
            f"unlinked={result.get('unlinked', 0)} "
            f"missing={result.get('missing', 0)}"
        )


if __name__ == "__main__":
    main()
