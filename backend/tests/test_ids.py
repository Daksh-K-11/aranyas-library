import pytest
from fastapi import HTTPException

from app.utils.ids import parse_oid, parse_oids


def test_parse_oid():
    assert str(parse_oid("6952771b2cce9421d0abed1c")) == "6952771b2cce9421d0abed1c"
    with pytest.raises(HTTPException):
        parse_oid("nope")
    with pytest.raises(HTTPException):
        parse_oid({"$ne": None})


def test_parse_oids_dedupes():
    assert len(parse_oids(["6952771b2cce9421d0abed1c", "6952771b2cce9421d0abed1c"])) == 1
