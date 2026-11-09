from typing import Annotated, List, Optional

from pydantic import AfterValidator, Field

from app.utils.text import clean_str, dedupe


def _clean_list(limit: int, max_len: int):
    def inner(values: Optional[List[str]]) -> List[str]:
        return dedupe(values or [], limit, max_len)
    return inner


def _strip(v: Optional[str]) -> Optional[str]:
    if v is None:
        return None
    v = v.strip()
    return v or None


TagList = Annotated[List[Annotated[str, Field(max_length=40)]], Field(max_length=30), AfterValidator(_clean_list(30, 40))]
AuthorList = Annotated[List[Annotated[str, Field(max_length=200)]], Field(max_length=20), AfterValidator(_clean_list(20, 200))]
CategoryList = Annotated[List[Annotated[str, Field(max_length=60)]], Field(max_length=15), AfterValidator(_clean_list(15, 60))]
IdList = Annotated[List[Annotated[str, Field(min_length=24, max_length=24)]], Field(max_length=100)]
OptText = lambda n: Annotated[Optional[str], Field(default=None, max_length=n), AfterValidator(_strip)]  # noqa: E731


def clean_title(v: str) -> str:
    v = clean_str(v, 300)
    if not v:
        raise ValueError("Title is required")
    return v
