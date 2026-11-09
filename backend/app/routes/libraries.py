import secrets
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pymongo.errors import DuplicateKeyError
from slugify import slugify

from app.auth.deps import get_current_user
from app.db.mongodb import libraries_collection, library_books_collection
from app.models.library import LibraryCreate, LibraryUpdate
from app.services.library_ops import get_owned_library

router = APIRouter(prefix="/library", tags=["Library"])

MAX_LIBRARIES_PER_USER = 200


def make_slug(name: str) -> str:
    base = slugify(name, max_length=40, word_boundary=True) or "library"
    # ~48 bits of randomness: slugs can't be guessed or enumerated.
    return f"{base}-{secrets.token_urlsafe(6).replace('_', 'x').replace('-', 'y').lower()}"


def serialize_library(lib: dict, count: int = 0) -> dict:
    return {
        "id": str(lib["_id"]),
        "name": lib["name"],
        "is_public": bool(lib.get("is_public")),
        "is_default": bool(lib.get("is_default")),
        "slug": lib["slug"],
        "book_count": count,
        "created_at": lib.get("created_at"),
        "updated_at": lib.get("updated_at"),
    }


async def _insert_with_unique_slug(doc: dict) -> dict:
    for _ in range(5):
        doc["slug"] = make_slug(doc["name"])
        try:
            res = await libraries_collection.insert_one(doc)
            doc["_id"] = res.inserted_id
            return doc
        except DuplicateKeyError:
            continue
    raise HTTPException(500, "Could not create library, please retry")


@router.post("", status_code=201)
async def create_library(data: LibraryCreate, user_id: str = Depends(get_current_user)):
    if await libraries_collection.count_documents({"user_id": user_id}) >= MAX_LIBRARIES_PER_USER:
        raise HTTPException(400, f"You can have at most {MAX_LIBRARIES_PER_USER} libraries")
    now = datetime.now(timezone.utc)
    lib = await _insert_with_unique_slug(
        {
            "user_id": user_id,
            "name": data.name,
            "is_public": data.is_public,
            "is_default": False,
            "created_at": now,
            "updated_at": now,
        }
    )
    return {"message": "Library created", "slug": lib["slug"], "library": serialize_library(lib)}


@router.get("")
async def list_libraries(user_id: str = Depends(get_current_user)):
    libs = [lib async for lib in libraries_collection.find({"user_id": user_id}).sort("created_at", 1)]
    counts = {}
    if libs:
        async for row in library_books_collection.aggregate(
            [
                {"$match": {"library_id": {"$in": [lib["_id"] for lib in libs]}}},
                {"$group": {"_id": "$library_id", "n": {"$sum": 1}}},
            ]
        ):
            counts[row["_id"]] = row["n"]
    return [serialize_library(lib, counts.get(lib["_id"], 0)) for lib in libs]


@router.patch("/{library_id}")
async def edit_library(library_id: str, data: LibraryUpdate, user_id: str = Depends(get_current_user)):
    lib = await get_owned_library(library_id, user_id)
    if lib.get("is_default"):
        raise HTTPException(400, "The default library cannot be edited")
    updates = data.model_dump(exclude_unset=True, exclude_none=True)
    if not updates:
        raise HTTPException(400, "No fields to update")
    # The slug is intentionally NOT changed on rename so shared links keep working.
    updates["updated_at"] = datetime.now(timezone.utc)
    await libraries_collection.update_one({"_id": lib["_id"]}, {"$set": updates})
    lib.update(updates)
    count = await library_books_collection.count_documents({"library_id": lib["_id"]})
    return {"message": "Library updated", "library": serialize_library(lib, count)}


@router.post("/{library_id}/regenerate-link")
async def regenerate_link(library_id: str, user_id: str = Depends(get_current_user)):
    """Revoke the current public URL by issuing a new slug."""
    lib = await get_owned_library(library_id, user_id)
    for _ in range(5):
        slug = make_slug(lib["name"])
        try:
            await libraries_collection.update_one(
                {"_id": lib["_id"]}, {"$set": {"slug": slug, "updated_at": datetime.now(timezone.utc)}}
            )
            break
        except DuplicateKeyError:
            continue
    else:
        raise HTTPException(500, "Could not regenerate link, please retry")
    lib["slug"] = slug
    count = await library_books_collection.count_documents({"library_id": lib["_id"]})
    return {"message": "Link regenerated", "library": serialize_library(lib, count)}


@router.delete("/{library_id}")
async def delete_library(library_id: str, user_id: str = Depends(get_current_user)):
    lib = await get_owned_library(library_id, user_id)
    if lib.get("is_default"):
        raise HTTPException(400, "Default library cannot be deleted")
    await library_books_collection.delete_many({"library_id": lib["_id"]})
    await libraries_collection.delete_one({"_id": lib["_id"], "user_id": user_id})
    return {"message": "Library deleted"}
