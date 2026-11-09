from typing import Annotated, List, Literal, Optional

from pydantic import AfterValidator, BaseModel, Field, field_validator

from app.models.common import AuthorList, CategoryList, IdList, OptText, TagList, clean_title

ReadStatus = Literal["unread", "reading", "completed"]


class UserBookFields(BaseModel):
    genres: TagList = []
    tags: TagList = []
    personal_notes: OptText(5000) = None
    rating: Optional[int] = Field(default=None, ge=1, le=5)
    read_status: ReadStatus = "unread"


class UserBookCreate(UserBookFields):
    book_id: str = Field(min_length=24, max_length=24)
    library_ids: IdList = []


class LegacyUserBookCreate(UserBookFields):
    """Body of the old POST /books/{isbn} route."""
    library_ids: IdList = []


def _cover(v: Optional[str]) -> Optional[str]:
    if v is None or v == "":
        return None
    if v.startswith("https://") or v.startswith("/covers/"):
        return v
    raise ValueError("Cover must be an https URL or an uploaded cover")


class BookOverrides(BaseModel):
    title: Optional[Annotated[str, Field(max_length=400), AfterValidator(clean_title)]] = None
    subtitle: OptText(300) = None
    authors: Optional[AuthorList] = None
    publisher: OptText(200) = None
    published_year: Optional[int] = Field(default=None, ge=0, le=2100)
    description: OptText(8000) = None
    categories: Optional[CategoryList] = None
    cover_url: Optional[Annotated[str, Field(max_length=1000), AfterValidator(_cover)]] = None


class UserBookUpdate(BaseModel):
    genres: Optional[TagList] = None
    tags: Optional[TagList] = None
    personal_notes: OptText(5000) = None
    rating: Optional[int] = Field(default=None, ge=1, le=5)
    read_status: Optional[ReadStatus] = None
    overrides: Optional[BookOverrides] = None
    reset_overrides: bool = False


class UserBooksDelete(BaseModel):
    user_book_ids: IdList = Field(min_length=1)
