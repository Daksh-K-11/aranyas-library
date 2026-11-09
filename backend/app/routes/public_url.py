import re
from typing import Optional

from fastapi import APIRouter, HTTPException, Query, Request

from app.core.ratelimit import limiter
from app.db.mongodb import libraries_collection, library_books_collection
from app.routes.library_books import library_user_books_stages
from app.services.listing import PUBLIC_PROJECTION, build_listing_pipeline, run_listing, serialize_public

router = APIRouter(prefix="/public", tags=["Public"])

async def _public_library(slug: str) -> dict:
    lib = await libraries_collection.find_one({"slug": slug, "is_public": True})
    if not lib:
        # Same answer for "private" and "does not exist".
        raise HTTPException(404, "Library not found")
    return lib


@router.get("/library/{slug}")
@limiter.limit("120/minute")
async def view_public_library(
    request: Request,
    slug: str,
    q: Optional[str] = Query(None, max_length=200),
    genre: Optional[str] = Query(None, max_length=40),
    page: int = Query(1, ge=1, le=10000),
    page_size: int = Query(24, ge=1, le=60),
    sort: str = Query("added_at", pattern="^(added_at|title|author|published_year)$"),
    order: str = Query("desc", pattern="^(asc|desc)$"),
):
    if len(slug) > 80:
        raise HTTPException(404, "Library not found")
    lib = await _public_library(slug)

    # Public search uses catalog-ish fields only, never personal notes/tags.
    match = {}
    if genre:
        match["genres"] = genre
    pipeline = library_user_books_stages(lib["_id"], lib["user_id"], match)
    if q and q.strip():
        terms = [re.escape(t) for t in q.strip().split()[:8]]
        pipeline += [
            {"$lookup": {"from": "books", "localField": "book_id", "foreignField": "_id", "as": "_b"}},
            {"$unwind": "$_b"},
            {"$addFields": {"_b": {"$mergeObjects": ["$_b", {"$ifNull": ["$overrides", {}]}]}}},
            {
                "$match": {
                    "$and": [
                        {
                            "$or": [
                                {"_b.title": {"$regex": t, "$options": "i"}},
                                {"_b.authors": {"$regex": t, "$options": "i"}},
                                {"genres": {"$regex": t, "$options": "i"}},
                            ]
                        }
                        for t in terms
                    ]
                }
            },
            {"$project": {"_b": 0}},
        ]
    pipeline += build_listing_pipeline(
        sort=sort, order=order, page=page, page_size=page_size, project=PUBLIC_PROJECTION
    )
    result = await run_listing(library_books_collection, pipeline, page, page_size, serialize_public)

    genres = await library_books_collection.aggregate(
        library_user_books_stages(lib["_id"], lib["user_id"], {})
        + [{"$unwind": "$genres"}, {"$group": {"_id": "$genres"}}, {"$limit": 200}]
    ).to_list(length=200)
    total_books = await library_books_collection.count_documents({"library_id": lib["_id"]})

    result["library"] = {
        "name": lib["name"],
        "book_count": total_books,
        "genres": sorted((g["_id"] for g in genres if isinstance(g["_id"], str)), key=str.casefold),
        "updated_at": lib.get("updated_at"),
    }
    return result


@router.get("/library/{slug}/meta")
@limiter.limit("120/minute")
async def public_library_meta(request: Request, slug: str):
    """Small payload for page titles / link previews."""
    if len(slug) > 80:
        raise HTTPException(404, "Library not found")
    lib = await _public_library(slug)
    total_books = await library_books_collection.count_documents({"library_id": lib["_id"]})
    return {"name": lib["name"], "book_count": total_books}
