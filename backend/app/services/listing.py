"""Shared, page-based listing pipeline for user books.

All listings (my books, a library, a public library) start from a set of
``user_books`` documents, join the catalog ``books`` record, apply the user's
personal overrides on top, then sort and paginate in a single ``$facet``.
"""
import math
import re
from typing import Any, Dict, List, Optional

from bson import ObjectId

from app.services.catalog import subject_suggestions

BOOK_FIELDS = [
    "title", "subtitle", "authors", "publisher", "published_year", "description",
    "categories", "cover_url", "isbn_13", "isbn_10", "source", "sources", "page_count", "language",
]
OVERRIDABLE_FIELDS = [
    "title", "subtitle", "authors", "publisher", "published_year", "description", "categories", "cover_url",
]

SORTS = {"updated_at", "created_at", "added_at", "rating", "title", "author", "published_year"}


def user_book_match(
    *,
    q: Optional[str] = None,
    genre: Optional[str] = None,
    read_status: Optional[str] = None,
    min_rating: Optional[float] = None,
    prefix: str = "",
) -> Dict[str, Any]:
    match: Dict[str, Any] = {}
    if q and q.strip():
        terms = [re.escape(t) for t in q.strip().lower().split()[:8]]
        # every word must appear somewhere (title, author, genre, tag, notes...)
        match["$and"] = [{f"{prefix}search_blob": {"$regex": t}} for t in terms]
    if genre:
        match[f"{prefix}genres"] = genre
    if read_status:
        match[f"{prefix}read_status"] = read_status
    if min_rating is not None:
        match[f"{prefix}rating"] = {"$gte": min_rating}
    return match


def _join_book_stages() -> List[Dict[str, Any]]:
    return [
        {"$lookup": {"from": "books", "localField": "book_id", "foreignField": "_id", "as": "book"}},
        {"$unwind": "$book"},
        {
            "$addFields": {
                "has_overrides": {"$gt": [{"$size": {"$objectToArray": {"$ifNull": ["$overrides", {}]}}}, 0]},
                "book": {"$mergeObjects": ["$book", {"$ifNull": ["$overrides", {}]}]},
            }
        },
    ]


def build_listing_pipeline(
    *,
    sort: str,
    order: str,
    page: int,
    page_size: int,
    project: Dict[str, Any],
) -> List[Dict[str, Any]]:
    """Stages to run once the pipeline's documents are user_books."""
    direction = -1 if order == "desc" else 1
    skip = (page - 1) * page_size

    if sort in ("title", "author", "published_year"):
        # Needs book data before sorting.
        sort_key = {
            "title": {"$toLower": "$book.title"},
            "author": {"$toLower": {"$ifNull": [{"$arrayElemAt": ["$book.authors", 0]}, "~"]}},
            "published_year": {"$ifNull": ["$book.published_year", 0]},
        }[sort]
        stages = _join_book_stages() + [
            {"$addFields": {"_sort": sort_key}},
            {
                "$facet": {
                    "items": [
                        {"$sort": {"_sort": direction, "_id": direction}},
                        {"$skip": skip},
                        {"$limit": page_size},
                        {"$project": project},
                    ],
                    "total": [{"$count": "n"}],
                }
            },
        ]
    else:
        field = sort if sort in SORTS else "updated_at"
        stages = [
            {
                "$facet": {
                    "items": [
                        {"$sort": {field: direction, "_id": direction}},
                        {"$skip": skip},
                        {"$limit": page_size},
                        *_join_book_stages(),
                        {"$project": project},
                    ],
                    "total": [{"$count": "n"}],
                }
            }
        ]
    return stages


PRIVATE_PROJECTION: Dict[str, Any] = {
    "_id": 1,
    "book_id": 1,
    "genres": 1,
    "tags": 1,
    "rating": 1,
    "read_status": 1,
    "personal_notes": 1,
    "created_at": 1,
    "updated_at": 1,
    "added_at": 1,
    "overrides": 1,
    "has_overrides": 1,
    **{f"book.{f}": 1 for f in BOOK_FIELDS},
    "book._id": 1,
    "book.owner_user_id": 1,
}

PUBLIC_PROJECTION: Dict[str, Any] = {
    "_id": 0,
    "genres": 1,
    **{f"book.{f}": 1 for f in ["title", "subtitle", "authors", "publisher", "published_year", "description",
                                "categories", "cover_url", "isbn_13"]},
}


def serialize_private(doc: Dict[str, Any]) -> Dict[str, Any]:
    book = doc.get("book", {})
    owner = book.pop("owner_user_id", None)
    book_id = book.pop("_id", None) or doc.get("book_id")
    book["id"] = str(book_id) if book_id else None
    book["is_private"] = owner is not None
    for f in ("authors", "categories"):
        book[f] = book.get(f) or []
    book.update(subject_suggestions(book["categories"]))
    return {
        "user_book_id": str(doc["_id"]),
        "book_id": str(doc.get("book_id")) if doc.get("book_id") else book["id"],
        "book": book,
        "genres": doc.get("genres") or [],
        "tags": doc.get("tags") or [],
        "rating": doc.get("rating"),
        "read_status": doc.get("read_status") or "unread",
        "personal_notes": doc.get("personal_notes"),
        "created_at": doc.get("created_at"),
        "updated_at": doc.get("updated_at"),
        "added_at": doc.get("added_at"),
        "has_overrides": bool(doc.get("has_overrides")),
        "overrides": doc.get("overrides") or {},
    }


def serialize_public(doc: Dict[str, Any]) -> Dict[str, Any]:
    book = doc.get("book", {})
    return {
        "title": book.get("title"),
        "subtitle": book.get("subtitle"),
        "authors": book.get("authors") or [],
        "publisher": book.get("publisher"),
        "published_year": book.get("published_year"),
        "description": book.get("description"),
        "categories": book.get("categories") or [],
        "cover_url": book.get("cover_url"),
        "isbn_13": book.get("isbn_13"),
        "genres": doc.get("genres") or [],
    }


async def run_listing(collection, pipeline, page: int, page_size: int, serializer) -> Dict[str, Any]:
    result = await collection.aggregate(pipeline, allowDiskUse=True).to_list(length=1)
    facet = result[0] if result else {"items": [], "total": []}
    total = facet["total"][0]["n"] if facet.get("total") else 0
    return {
        "items": [serializer(d) for d in facet.get("items", [])],
        "page": page,
        "page_size": page_size,
        "total": total,
        "total_pages": max(1, math.ceil(total / page_size)) if total else 0,
    }


def oid_str(v: Any) -> Any:
    return str(v) if isinstance(v, ObjectId) else v
