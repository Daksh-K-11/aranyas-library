from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import JSONResponse
from pymongo.errors import DuplicateKeyError

from app.auth.deps import get_current_user
from app.core.ratelimit import limiter
from app.db.mongodb import isbn_misses_collection
from app.services.book_lookup import PROVIDER_LABELS, lookup_isbn_providers, search_candidates
from app.services.catalog import find_catalog_book, insert_catalog_book, serialize_book, user_book_for
from app.utils.isbn import InvalidISBN, parse_isbn

router = APIRouter(prefix="/isbn", tags=["ISBN"])

CHECKED_SOURCES = [PROVIDER_LABELS[k] for k in ("google_books", "open_library", "library_of_congress")]


async def _with_ownership(book: dict, user_id: str) -> dict:
    out = serialize_book(book)
    ub = await user_book_for(user_id, book["_id"])
    out["user_book_id"] = str(ub["_id"]) if ub else None
    return out


def _not_found(isbn_13: str, isbn_10: str | None) -> JSONResponse:
    return JSONResponse(
        status_code=404,
        content={
            "detail": "We couldn't find this ISBN in any book database. You can add it manually.",
            "manual_allowed": True,
            "isbn_13": isbn_13,
            "isbn_10": isbn_10,
            "checked_sources": CHECKED_SOURCES,
        },
    )


@router.get("")
@limiter.limit("40/minute;500/day")
async def lookup_isbn(
    request: Request,
    isbn: str = Query(..., min_length=10, max_length=20),
    refresh: bool = False,
    user_id: str = Depends(get_current_user),
):
    try:
        isbn_13, isbn_10 = parse_isbn(isbn)
    except InvalidISBN as e:
        raise HTTPException(400, str(e))

    existing = await find_catalog_book(isbn_13, isbn_10, user_id)
    if existing:
        return await _with_ownership(existing, user_id)

    if not refresh and await isbn_misses_collection.find_one({"isbn_13": isbn_13}):
        return _not_found(isbn_13, isbn_10)

    merged = await lookup_isbn_providers(isbn_13, isbn_10)
    if not merged:
        try:
            await isbn_misses_collection.update_one(
                {"isbn_13": isbn_13},
                {"$set": {"created_at": datetime.now(timezone.utc)}},
                upsert=True,
            )
        except DuplicateKeyError:
            pass
        return _not_found(isbn_13, isbn_10)

    merged["source"] = "api"
    book = await insert_catalog_book(merged)
    await isbn_misses_collection.delete_one({"isbn_13": isbn_13})
    return await _with_ownership(book, user_id)


@router.get("/search")
@limiter.limit("20/minute;300/day")
async def search_books(
    request: Request,
    q: str = Query(..., min_length=2, max_length=200),
    user_id: str = Depends(get_current_user),
):
    """Title/author search for books without a barcode. Nothing is saved."""
    return {"items": await search_candidates(q.strip(), limit=12)}
