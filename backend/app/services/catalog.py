"""Helpers around the shared ``books`` catalog."""
from datetime import datetime, timezone
from typing import Any, Dict, Optional

from bson import ObjectId
from pymongo.errors import DuplicateKeyError

from app.db.mongodb import books_collection, user_books_collection


def visible_filter(user_id: str) -> Dict[str, Any]:
    """Catalog books plus the user's own private books."""
    return {"$or": [{"owner_user_id": {"$exists": False}}, {"owner_user_id": user_id}]}


def serialize_book(doc: Dict[str, Any]) -> Dict[str, Any]:
    out = {k: v for k, v in doc.items() if k not in ("_id", "owner_user_id", "created_by")}
    out["id"] = str(doc["_id"])
    out["is_private"] = "owner_user_id" in doc
    out["authors"] = doc.get("authors") or []
    out["categories"] = doc.get("categories") or []
    return out


def strip_nones(d: Dict[str, Any]) -> Dict[str, Any]:
    return {k: v for k, v in d.items() if v is not None and v != [] and v != ""}


async def find_catalog_book(isbn_13: str, isbn_10: Optional[str], user_id: str) -> Optional[Dict[str, Any]]:
    ors = [{"isbn_13": isbn_13}]
    if isbn_10:
        ors.append({"isbn_10": isbn_10})
    return await books_collection.find_one({"$and": [{"$or": ors}, visible_filter(user_id)]})


async def insert_catalog_book(doc: Dict[str, Any]) -> Dict[str, Any]:
    """Insert a catalog book; if someone else inserted the same ISBN first,
    return theirs (first one wins)."""
    now = datetime.now(timezone.utc)
    doc = strip_nones({**doc, "created_at": now, "updated_at": now})
    try:
        res = await books_collection.insert_one(doc)
        doc["_id"] = res.inserted_id
        return doc
    except DuplicateKeyError:
        ors = [{"isbn_13": doc.get("isbn_13")}]
        if doc.get("isbn_10"):
            ors.append({"isbn_10": doc["isbn_10"]})
        existing = await books_collection.find_one({"$or": ors, "owner_user_id": {"$exists": False}})
        if existing:
            return existing
        # isbn_10 clashed with a book stored under a different isbn_13: drop it.
        doc.pop("isbn_10", None)
        doc.pop("_id", None)
        res = await books_collection.insert_one(doc)
        doc["_id"] = res.inserted_id
        return doc


async def user_book_for(user_id: str, book_id: ObjectId) -> Optional[Dict[str, Any]]:
    return await user_books_collection.find_one({"user_id": user_id, "book_id": book_id}, {"_id": 1})
