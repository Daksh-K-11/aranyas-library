"""Idempotent index creation + small data migrations. Runs on startup."""
import logging

from pymongo import ASCENDING, DESCENDING, TEXT
from pymongo.errors import OperationFailure

from app.db.mongodb import (
    books_collection,
    isbn_misses_collection,
    otp_codes_collection,
    otp_sends_collection,
    libraries_collection,
    library_books_collection,
    user_books_collection,
    users_collection,
)

log = logging.getLogger("library.indexes")

STRING_ONLY = lambda f: {f: {"$type": "string"}}  # noqa: E731


async def _ensure(collection, keys, **opts):
    """Create an index; if one with the same name but a different spec
    exists, drop and recreate it."""
    name = opts["name"]
    existing = await collection.index_information()
    info = existing.get(name)
    if info is not None:
        same = (
            list(info.get("key", [])) == list(keys)
            and bool(info.get("unique")) == bool(opts.get("unique"))
            and dict(info.get("partialFilterExpression") or {}) == dict(opts.get("partialFilterExpression") or {})
            and info.get("expireAfterSeconds") == opts.get("expireAfterSeconds")
        )
        if same:
            return
        log.info("recreating index %s.%s", collection.name, name)
        await collection.drop_index(name)
    try:
        await collection.create_index(keys, **opts)
    except OperationFailure as e:
        log.error("could not create index %s.%s: %s", collection.name, name, e)


async def _migrate():
    # Explicit nulls break partial/sparse unique indexes and are noise.
    for f in ("isbn_10", "isbn_13", "subtitle"):
        await books_collection.update_many({f: None}, {"$unset": {f: ""}})
    # Accounts created before email verification existed are trusted.
    await users_collection.update_many({"email_verified": {"$exists": False}}, {"$set": {"email_verified": True}})
    # Old Google covers were stored as http:// (mixed content on https sites).
    async for b in books_collection.find({"cover_url": {"$regex": "^http://"}}, {"cover_url": 1}):
        await books_collection.update_one(
            {"_id": b["_id"]},
            {"$set": {"cover_url": "https://" + b["cover_url"][len("http://"):]}},
        )


async def ensure_indexes():
    await _migrate()

    # users
    await _ensure(users_collection, [("email", ASCENDING)], unique=True, name="users_email_idx")

    # books: ISBNs are unique only when present (private manual books have none)
    await _ensure(
        books_collection, [("isbn_13", ASCENDING)], unique=True,
        partialFilterExpression=STRING_ONLY("isbn_13"), name="books_isbn13_idx",
    )
    await _ensure(
        books_collection, [("isbn_10", ASCENDING)], unique=True,
        partialFilterExpression=STRING_ONLY("isbn_10"), name="books_isbn10_idx",
    )
    await _ensure(books_collection, [("owner_user_id", ASCENDING)], name="books_owner_idx")
    existing = await books_collection.index_information()
    if "books_text_idx" not in existing:
        await books_collection.create_index(
            [("title", TEXT), ("authors", TEXT), ("categories", TEXT)], name="books_text_idx"
        )

    # user_books
    await _ensure(
        user_books_collection, [("user_id", ASCENDING), ("book_id", ASCENDING)],
        unique=True, name="ub_user_book_unique_idx",
    )
    await _ensure(
        user_books_collection, [("user_id", ASCENDING), ("updated_at", DESCENDING), ("_id", DESCENDING)],
        name="ub_user_updated_idx",
    )
    await _ensure(user_books_collection, [("user_id", ASCENDING), ("genres", ASCENDING)], name="ub_user_genres_idx")
    await _ensure(
        user_books_collection, [("user_id", ASCENDING), ("read_status", ASCENDING)], name="ub_user_readstatus_idx"
    )
    await _ensure(user_books_collection, [("book_id", ASCENDING)], name="ub_book_idx")

    # libraries
    await _ensure(libraries_collection, [("user_id", ASCENDING)], name="libs_user_idx")
    await _ensure(libraries_collection, [("slug", ASCENDING)], unique=True, name="libs_slug_unique_idx")

    # library_books
    await _ensure(
        library_books_collection, [("library_id", ASCENDING), ("user_book_id", ASCENDING)],
        unique=True, name="lb_library_userbook_unique_idx",
    )
    await _ensure(library_books_collection, [("user_book_id", ASCENDING)], name="lb_userbook_idx")
    await _ensure(
        library_books_collection, [("library_id", ASCENDING), ("added_at", DESCENDING)], name="lb_library_addedat_idx"
    )

    # negative lookup cache, expires after a day
    await _ensure(
        isbn_misses_collection, [("created_at", ASCENDING)], expireAfterSeconds=86400, name="isbn_miss_ttl_idx"
    )
    await _ensure(isbn_misses_collection, [("isbn_13", ASCENDING)], unique=True, name="isbn_miss_isbn_idx")

    # one-time codes: one per (email, purpose), removed when expired
    await _ensure(
        otp_codes_collection, [("email", ASCENDING), ("purpose", ASCENDING)], unique=True, name="otp_email_purpose_idx"
    )
    await _ensure(otp_codes_collection, [("expires_at", ASCENDING)], expireAfterSeconds=0, name="otp_expiry_ttl_idx")
    await _ensure(otp_sends_collection, [("email", ASCENDING), ("purpose", ASCENDING), ("created_at", DESCENDING)],
                  name="otp_sends_lookup_idx")
    await _ensure(otp_sends_collection, [("created_at", ASCENDING)], expireAfterSeconds=3600, name="otp_sends_ttl_idx")

    log.info("indexes ensured")
