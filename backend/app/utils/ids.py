from typing import Iterable, List

from bson import ObjectId
from fastapi import HTTPException


def parse_oid(value: str, name: str = "id") -> ObjectId:
    """Parse a string into an ObjectId or raise a 400."""
    if isinstance(value, ObjectId):
        return value
    if not isinstance(value, str) or not ObjectId.is_valid(value):
        raise HTTPException(status_code=400, detail=f"Invalid {name}")
    return ObjectId(value)


def parse_oids(values: Iterable[str], name: str = "id") -> List[ObjectId]:
    seen: dict[str, ObjectId] = {}
    for v in values:
        oid = parse_oid(v, name)
        seen[str(oid)] = oid
    return list(seen.values())
