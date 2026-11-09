from datetime import datetime, timezone
from typing import Dict, Iterable, List

from bson import ObjectId
from fastapi import HTTPException
from pymongo import UpdateOne

from app.db.mongodb import libraries_collection, library_books_collection, user_books_collection
from app.utils.ids import parse_oid, parse_oids


async def get_owned_library(library_id: str, user_id: str) -> Dict:
    lib = await libraries_collection.find_one({"_id": parse_oid(library_id, "library id"), "user_id": user_id})
    if not lib:
        raise HTTPException(404, "Library not found")
    return lib


async def owned_user_book_ids(user_id: str, ids: Iterable[str]) -> List[ObjectId]:
    """Return only the ids that belong to ``user_id``."""
    oids = parse_oids(ids, "book id")
    if not oids:
        return []
    cursor = user_books_collection.find({"_id": {"$in": oids}, "user_id": user_id}, {"_id": 1})
    return [d["_id"] async for d in cursor]


async def add_to_libraries(user_id: str, user_book_ids: List[ObjectId], library_ids: Iterable[str]) -> int:
    lib_oids = parse_oids(library_ids, "library id")
    if not lib_oids or not user_book_ids:
        return 0
    owned = [
        d["_id"]
        async for d in libraries_collection.find({"_id": {"$in": lib_oids}, "user_id": user_id}, {"_id": 1})
    ]
    if len(owned) != len(lib_oids):
        raise HTTPException(404, "Library not found")
    now = datetime.now(timezone.utc)
    ops = [
        UpdateOne(
            {"library_id": lib, "user_book_id": ub},
            {"$setOnInsert": {"library_id": lib, "user_book_id": ub, "added_at": now}},
            upsert=True,
        )
        for lib in owned
        for ub in user_book_ids
    ]
    res = await library_books_collection.bulk_write(ops, ordered=False)
    if res.upserted_count:
        await libraries_collection.update_many({"_id": {"$in": owned}}, {"$set": {"updated_at": now}})
    return res.upserted_count
