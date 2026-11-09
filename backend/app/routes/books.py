from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from bson import ObjectId
from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, Request, UploadFile
from pydantic import BaseModel, Field, ValidationError
from pymongo.errors import DuplicateKeyError

from app.auth.deps import get_current_user
from app.core.ratelimit import limiter
from app.db.mongodb import books_collection, library_books_collection, user_books_collection
from app.models.common import AuthorList, CategoryList, IdList, OptText
from app.models.user_books import (
    BookOverrides,
    LegacyUserBookCreate,
    ReadStatus,
    UserBookCreate,
    UserBookFields,
    UserBookUpdate,
    UserBooksDelete,
)
from app.services.catalog import find_catalog_book, insert_catalog_book, strip_nones, visible_filter
from app.services.images import delete_cover, store_cover
from app.services.library_ops import add_to_libraries, owned_user_book_ids
from app.services.listing import (
    OVERRIDABLE_FIELDS,
    PRIVATE_PROJECTION,
    build_listing_pipeline,
    run_listing,
    serialize_private,
    user_book_match,
)
from app.utils.ids import parse_oid
from app.utils.isbn import InvalidISBN, parse_isbn
from app.utils.search import build_search_blob, merged_book
from app.utils.text import clean_str

router = APIRouter(prefix="/books", tags=["Books"])

SORT_PATTERN = "^(updated_at|created_at|rating|title|author|published_year)$"


# ------------------------------------------------------------------ helpers
async def _create_user_book(
    user_id: str,
    book: Dict[str, Any],
    fields: UserBookFields,
    overrides: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """Insert the user's copy of a book. Returns {user_book_id, created}."""
    existing = await user_books_collection.find_one({"user_id": user_id, "book_id": book["_id"]}, {"_id": 1})
    if existing:
        return {"user_book_id": existing["_id"], "created": False}

    now = datetime.now(timezone.utc)
    data = fields.model_dump(include={"genres", "tags", "personal_notes", "rating", "read_status"})
    doc = {
        **data,
        "user_id": user_id,
        "book_id": book["_id"],
        "created_at": now,
        "updated_at": now,
    }
    if overrides:
        doc["overrides"] = overrides
    doc["search_blob"] = build_search_blob(merged_book(book, overrides), data)
    try:
        res = await user_books_collection.insert_one(doc)
    except DuplicateKeyError:
        existing = await user_books_collection.find_one({"user_id": user_id, "book_id": book["_id"]}, {"_id": 1})
        return {"user_book_id": existing["_id"], "created": False}
    return {"user_book_id": res.inserted_id, "created": True}


async def _get_user_book_full(user_id: str, user_book_id: ObjectId) -> Dict[str, Any]:
    pipeline = [{"$match": {"_id": user_book_id, "user_id": user_id}}] + build_listing_pipeline(
        sort="updated_at", order="desc", page=1, page_size=1, project=PRIVATE_PROJECTION
    )
    result = await run_listing(user_books_collection, pipeline, 1, 1, serialize_private)
    if not result["items"]:
        raise HTTPException(404, "Book not found")
    return result["items"][0]


async def _finish_add(user_id: str, book: Dict, fields: UserBookFields, library_ids: List[str], overrides=None):
    res = await _create_user_book(user_id, book, fields, overrides)
    added_to = await add_to_libraries(user_id, [res["user_book_id"]], library_ids) if library_ids else 0
    item = await _get_user_book_full(user_id, res["user_book_id"])
    return {
        "message": "Book added" if res["created"] else "Book is already in your collection",
        "created": res["created"],
        "added_to_libraries": added_to,
        "item": item,
    }


# ------------------------------------------------------------------ add
@router.post("", status_code=201)
async def add_book(data: UserBookCreate, user_id: str = Depends(get_current_user)):
    book = await books_collection.find_one({"_id": parse_oid(data.book_id, "book id"), **visible_filter(user_id)})
    if not book:
        raise HTTPException(404, "Book not found. Look it up first.")
    return await _finish_add(user_id, book, data, data.library_ids)


class ManualBookIn(UserBookFields):
    title: str = Field(min_length=1, max_length=300)
    subtitle: OptText(300) = None
    authors: AuthorList = []
    isbn: Optional[str] = Field(default=None, max_length=20)
    publisher: OptText(200) = None
    published_year: Optional[int] = Field(default=None, ge=0, le=2100)
    description: OptText(8000) = None
    categories: CategoryList = []
    cover_url: Optional[str] = Field(default=None, max_length=1000)
    library_ids: IdList = []


@router.post("/manual", status_code=201)
@limiter.limit("20/minute;300/day")
async def add_manual_book(
    request: Request,
    data: str = Form(..., max_length=40000, description="JSON encoded ManualBookIn"),
    cover: Optional[UploadFile] = File(None),
    user_id: str = Depends(get_current_user),
):
    try:
        payload = ManualBookIn.model_validate_json(data)
    except ValidationError as e:
        raise HTTPException(422, e.errors(include_url=False, include_context=False, include_input=False))

    title = clean_str(payload.title, 300)
    if not title:
        raise HTTPException(422, "Title is required")

    isbn_13 = isbn_10 = None
    if payload.isbn and payload.isbn.strip():
        try:
            isbn_13, isbn_10 = parse_isbn(payload.isbn)
        except InvalidISBN as e:
            raise HTTPException(400, f"{e}. Leave the ISBN empty if the book doesn't have one.")

    cover_url = None
    if payload.cover_url and payload.cover_url.startswith("https://"):
        cover_url = payload.cover_url
    if cover is not None and cover.filename:
        cover_url = await store_cover(cover, user_id)

    book_fields = strip_nones(
        {
            "title": title,
            "subtitle": payload.subtitle,
            "authors": payload.authors,
            "publisher": payload.publisher,
            "published_year": payload.published_year,
            "description": payload.description,
            "categories": payload.categories,
            "cover_url": cover_url,
        }
    )

    overrides = None
    if isbn_13:
        existing = await find_catalog_book(isbn_13, isbn_10, user_id)
        if existing:
            # The catalog already has this ISBN (first submission wins). Keep
            # this user's differing values as their personal overrides.
            overrides = {k: v for k, v in book_fields.items() if existing.get(k) != v} or None
            book = existing
        else:
            book = await insert_catalog_book(
                {
                    **book_fields,
                    "isbn_13": isbn_13,
                    "isbn_10": isbn_10,
                    "source": "user_submitted",
                    "created_by": user_id,
                }
            )
            if book.get("created_by") != user_id:  # lost a race: someone else's record won
                overrides = {k: v for k, v in book_fields.items() if book.get(k) != v} or None
    else:
        now = datetime.now(timezone.utc)
        book = {**book_fields, "source": "manual", "owner_user_id": user_id, "created_at": now, "updated_at": now}
        res = await books_collection.insert_one(book)
        book["_id"] = res.inserted_id

    return await _finish_add(user_id, book, payload, payload.library_ids, overrides)


@router.post("/{isbn}", status_code=201, include_in_schema=False)
async def add_book_by_isbn_legacy(isbn: str, data: LegacyUserBookCreate, user_id: str = Depends(get_current_user)):
    """Kept for old clients. Prefer POST /books with a book_id."""
    try:
        isbn_13, isbn_10 = parse_isbn(isbn)
    except InvalidISBN as e:
        raise HTTPException(400, str(e))
    book = await find_catalog_book(isbn_13, isbn_10, user_id)
    if not book:
        raise HTTPException(404, "Book not found. Look up the ISBN first.")
    return await _finish_add(user_id, book, data, data.library_ids)


# ------------------------------------------------------------------ list
@router.get("")
async def list_user_books(
    user_id: str = Depends(get_current_user),
    q: Optional[str] = Query(None, max_length=200),
    genre: Optional[str] = Query(None, max_length=40),
    read_status: Optional[ReadStatus] = None,
    min_rating: Optional[int] = Query(None, ge=1, le=5),
    page: int = Query(1, ge=1, le=10000),
    page_size: int = Query(24, ge=1, le=60),
    sort: str = Query("updated_at", pattern=SORT_PATTERN),
    order: str = Query("desc", pattern="^(asc|desc)$"),
):
    match = {"user_id": user_id, **user_book_match(q=q, genre=genre, read_status=read_status, min_rating=min_rating)}
    pipeline = [{"$match": match}] + build_listing_pipeline(
        sort=sort, order=order, page=page, page_size=page_size, project=PRIVATE_PROJECTION
    )
    return await run_listing(user_books_collection, pipeline, page, page_size, serialize_private)


@router.get("/facets")
async def book_facets(user_id: str = Depends(get_current_user)):
    genres = await user_books_collection.distinct("genres", {"user_id": user_id})
    tags = await user_books_collection.distinct("tags", {"user_id": user_id})
    return {
        "genres": sorted((g for g in genres if isinstance(g, str)), key=str.casefold),
        "tags": sorted((t for t in tags if isinstance(t, str)), key=str.casefold),
    }


@router.get("/{user_book_id}")
async def get_user_book(user_book_id: str, user_id: str = Depends(get_current_user)):
    return await _get_user_book_full(user_id, parse_oid(user_book_id, "book id"))


# ------------------------------------------------------------------ update
@router.patch("/{user_book_id}")
async def update_user_book(user_book_id: str, data: UserBookUpdate, user_id: str = Depends(get_current_user)):
    oid = parse_oid(user_book_id, "book id")
    user_book = await user_books_collection.find_one({"_id": oid, "user_id": user_id})
    if not user_book:
        raise HTTPException(404, "Book not found")
    book = await books_collection.find_one({"_id": user_book["book_id"]}) or {}

    sets: Dict[str, Any] = {}
    unsets: Dict[str, Any] = {}

    user_updates = data.model_dump(
        exclude_unset=True, include={"genres", "tags", "personal_notes", "rating", "read_status"}
    )
    sets.update(user_updates)

    old_overrides: Dict[str, Any] = dict(user_book.get("overrides") or {})
    new_overrides = dict(old_overrides)
    if data.reset_overrides:
        new_overrides = {}
    if data.overrides is not None:
        for key, value in data.overrides.model_dump(exclude_unset=True).items():
            if key not in OVERRIDABLE_FIELDS:
                continue
            if value is None or value == [] or book.get(key) == value:
                new_overrides.pop(key, None)  # back to the catalog value
            else:
                new_overrides[key] = value

    if new_overrides != old_overrides:
        old_cover = old_overrides.get("cover_url")
        if old_cover and old_cover != new_overrides.get("cover_url"):
            await delete_cover(old_cover)
        if book.get("owner_user_id") == user_id:
            # Private book: the user owns the record, edit it directly.
            book_set = {k: v for k, v in new_overrides.items()}
            if book_set:
                if "cover_url" in book_set and book.get("cover_url") != book_set["cover_url"]:
                    await delete_cover(book.get("cover_url"))
                await books_collection.update_one(
                    {"_id": book["_id"]}, {"$set": {**book_set, "updated_at": datetime.now(timezone.utc)}}
                )
                book.update(book_set)
            new_overrides = {}
        if new_overrides:
            sets["overrides"] = new_overrides
        else:
            unsets["overrides"] = ""

    merged_user = {**user_book, **user_updates}
    sets["search_blob"] = build_search_blob(merged_book(book, new_overrides), merged_user)

    update: Dict[str, Any] = {"$set": sets, "$currentDate": {"updated_at": True}}
    if unsets:
        update["$unset"] = unsets
    await user_books_collection.update_one({"_id": oid}, update)
    return await _get_user_book_full(user_id, oid)


# ------------------------------------------------------------------ delete
@router.delete("")
async def delete_books_globally(data: UserBooksDelete, user_id: str = Depends(get_current_user)):
    ids = await owned_user_book_ids(user_id, data.user_book_ids)
    if not ids:
        raise HTTPException(404, "No matching books")

    docs = [d async for d in user_books_collection.find({"_id": {"$in": ids}}, {"book_id": 1, "overrides": 1})]
    await library_books_collection.delete_many({"user_book_id": {"$in": ids}})
    await user_books_collection.delete_many({"_id": {"$in": ids}, "user_id": user_id})

    for d in docs:
        await delete_cover((d.get("overrides") or {}).get("cover_url"))
    # Private books exist only for this user: remove them and their covers.
    async for b in books_collection.find(
        {"_id": {"$in": [d["book_id"] for d in docs]}, "owner_user_id": user_id}, {"cover_url": 1}
    ):
        await delete_cover(b.get("cover_url"))
        await books_collection.delete_one({"_id": b["_id"]})

    return {"message": "Books deleted from all libraries", "deleted": len(ids)}
