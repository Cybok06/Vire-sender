"""Root WSGI entry point for hosts that run ``gunicorn app:app``.

The application source lives in ``backend/``.  Adding that directory to the
module search path preserves the backend's existing absolute imports while
making the conventional root-level Gunicorn command work on Render.
"""

import sys
from pathlib import Path


BACKEND_DIR = Path(__file__).resolve().parent / "backend"
backend_path = str(BACKEND_DIR)
if backend_path not in sys.path:
    sys.path.insert(0, backend_path)

from backend.app import app  # noqa: E402,F401


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000)
