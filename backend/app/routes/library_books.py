from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.auth.deps import get_current_user
from app.db.mongodb import libraries_collection, library_books_collection, user_books_collection
from app.models.library import LibraryBooksCreate, LibraryBooksRemove
from app.models.user_books import ReadStatus
from app.services.library_ops import add_to_libraries, get_owned_library, owned_user_book_ids
from app.services.listing import (
    PRIVATE_PROJECTION,
    build_listing_pipeline,
    run_listing,
    serialize_private,
    user_book_match,
)
from app.utils.ids import parse_oid

router = APIRouter(prefix="/librarybooks", tags=["Library books"])

SORT_PATTERN = "^(added_at|updated_at|created_at|rating|title|author|published_year)$"


def library_user_books_stages(library_id, user_id: Optional[str], match: dict) -> list:
    """Turn library_books rows into user_books documents (with added_at)."""
    ub_match = {**match}
    if user_id is not None:
        ub_match["user_id"] = user_id
    return [
        {"$match": {"library_id": library_id}},
        {
            "$lookup": {
                "from": "user_books",
                "localField": "user_book_id",
                "foreignField": "_id",
                "as": "ub",
                "pipeline": [{"$match": ub_match}] if ub_match else [],
            }
        },
        {"$unwind": "$ub"},
        {"$replaceRoot": {"newRoot": {"$mergeObjects": ["$ub", {"added_at": "$added_at"}]}}},
    ]


@router.get("/missing-libraries")
async def get_missing_library_ids(user_book_id: str = Query(...), user_id: str = Depends(get_current_user)):
    """Libraries of this user that do not contain the given book yet."""
    ub_oid = parse_oid(user_book_id, "book id")
    if not await user_books_collection.find_one({"_id": ub_oid, "user_id": user_id}, {"_id": 1}):
        raise HTTPException(404, "Book not found")

    present = await library_books_collection.distinct("library_id", {"user_book_id": ub_oid})
    libs = [
        {"id": str(lib["_id"]), "_id": str(lib["_id"]), "name": lib["name"], "is_public": lib.get("is_public", False)}
        async for lib in libraries_collection.find({"user_id": user_id, "_id": {"$nin": present}}).sort("name", 1)
    ]
    member = [
        {"id": str(lib["_id"]), "name": lib["name"]}
        async for lib in libraries_collection.find({"user_id": user_id, "_id": {"$in": present}}).sort("name", 1)
    ]
    return {"count": len(libs), "libraries": libs, "member_of": member}


@router.post("/{library_id}", status_code=status.HTTP_201_CREATED)
async def add_books_to_library(library_id: str, data: LibraryBooksCreate, user_id: str = Depends(get_current_user)):
    lib = await get_owned_library(library_id, user_id)
    ids = await owned_user_book_ids(user_id, data.user_book_ids)
    if not ids:
        raise HTTPException(404, "No matching books")
    added = await add_to_libraries(user_id, ids, [str(lib["_id"])])
    return {"message": "Books added", "added": added}


@router.get("/{library_id}")
async def view_library_books(
    library_id: str,
    user_id: str = Depends(get_current_user),
    q: Optional[str] = Query(None, max_length=200),
    genre: Optional[str] = Query(None, max_length=40),
    read_status: Optional[ReadStatus] = None,
    min_rating: Optional[int] = Query(None, ge=1, le=5),
    page: int = Query(1, ge=1, le=10000),
    page_size: int = Query(24, ge=1, le=60),
    sort: str = Query("added_at", pattern=SORT_PATTERN),
    order: str = Query("desc", pattern="^(asc|desc)$"),
):
    lib = await get_owned_library(library_id, user_id)
    match = user_book_match(q=q, genre=genre, read_status=read_status, min_rating=min_rating)
    pipeline = library_user_books_stages(lib["_id"], user_id, match) + build_listing_pipeline(
        sort=sort, order=order, page=page, page_size=page_size, project=PRIVATE_PROJECTION
    )
    result = await run_listing(library_books_collection, pipeline, page, page_size, serialize_private)
    result["library"] = {
        "id": str(lib["_id"]),
        "name": lib["name"],
        "is_public": lib.get("is_public", False),
        "is_default": lib.get("is_default", False),
        "slug": lib["slug"],
    }
    return result


@router.delete("/{library_id}")
async def remove_books_from_library(
    library_id: str, data: LibraryBooksRemove, user_id: str = Depends(get_current_user)
):
    lib = await get_owned_library(library_id, user_id)
    ids = await owned_user_book_ids(user_id, data.user_book_ids)
    res = await library_books_collection.delete_many({"library_id": lib["_id"], "user_book_id": {"$in": ids}})
    return {"message": "Books removed from library", "removed": res.deleted_count}
