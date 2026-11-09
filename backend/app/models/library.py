from typing import Annotated, Optional

from pydantic import AfterValidator, BaseModel, Field

from app.models.common import IdList
from app.utils.text import clean_str


def _name(v: str) -> str:
    v = clean_str(v, 100)
    if not v:
        raise ValueError("Library name is required")
    return v


LibraryName = Annotated[str, Field(max_length=200), AfterValidator(_name)]


class LibraryCreate(BaseModel):
    name: LibraryName
    is_public: bool = False


class LibraryUpdate(BaseModel):
    name: Optional[LibraryName] = None
    is_public: Optional[bool] = None


class LibraryBooksCreate(BaseModel):
    user_book_ids: IdList = Field(min_length=1)


class LibraryBooksRemove(BaseModel):
    user_book_ids: IdList = Field(min_length=1)
