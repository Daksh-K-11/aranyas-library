from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorGridFSBucket

from app.core.config import DB_NAME, MONGO_URI

client = AsyncIOMotorClient(
    MONGO_URI,
    maxPoolSize=20,
    serverSelectionTimeoutMS=5000,
    tz_aware=True,
)

db = client[DB_NAME]
books_collection = db.books
users_collection = db.users
user_books_collection = db.user_books
libraries_collection = db.libraries
library_books_collection = db.library_books
isbn_misses_collection = db.isbn_misses
otp_codes_collection = db.otp_codes
otp_sends_collection = db.otp_sends

_covers_bucket = None


def get_covers_bucket() -> AsyncIOMotorGridFSBucket:
    # Created lazily so it binds to the running event loop.
    global _covers_bucket
    if _covers_bucket is None:
        _covers_bucket = AsyncIOMotorGridFSBucket(db, bucket_name="covers")
    return _covers_bucket
