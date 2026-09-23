import os
from pathlib import Path

from pymongo import MongoClient
from pymongo.server_api import ServerApi


def load_env_file(path=".env"):
    env_path = Path(__file__).resolve().parent / path

    if not env_path.exists():
        return

    for line in env_path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue

        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip("\"'"))


load_env_file()

uri = os.getenv("MONGODB_URI")
if not uri:
    raise RuntimeError("MONGODB_URI is not set. Add it to your .env file.")

# Create a new client and connect to the server
client = MongoClient(uri, server_api=ServerApi('1'))

# Send a ping to confirm a successful connection
try:
    client.admin.command('ping')
    print("Pinged your deployment. You successfully connected to MongoDB!")
except Exception as e:
    print(e)
