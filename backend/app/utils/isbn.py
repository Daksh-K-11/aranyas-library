"""ISBN cleaning, validation and conversion helpers."""
import re
from typing import Optional, Tuple

_CLEAN_RE = re.compile(r"[^0-9Xx]")


class InvalidISBN(ValueError):
    pass


def clean_isbn(raw: str) -> str:
    """Strip spaces, hyphens and any other separators. Keeps digits and X."""
    if not isinstance(raw, str):
        raise InvalidISBN("ISBN must be a string")
    return _CLEAN_RE.sub("", raw).upper()


def is_valid_isbn10(isbn: str) -> bool:
    if not re.fullmatch(r"\d{9}[\dX]", isbn):
        return False
    total = 0
    for i, ch in enumerate(isbn):
        value = 10 if ch == "X" else int(ch)
        total += value * (10 - i)
    return total % 11 == 0


def isbn13_check_digit(first12: str) -> str:
    total = sum(int(d) * (1 if i % 2 == 0 else 3) for i, d in enumerate(first12))
    return str((10 - total % 10) % 10)


def is_valid_isbn13(isbn: str) -> bool:
    if not re.fullmatch(r"\d{13}", isbn):
        return False
    if not isbn.startswith(("978", "979")):
        return False
    return isbn13_check_digit(isbn[:12]) == isbn[12]


def isbn10_to_isbn13(isbn10: str) -> str:
    isbn10 = clean_isbn(isbn10)
    if not is_valid_isbn10(isbn10):
        raise InvalidISBN("Invalid ISBN-10")
    core = "978" + isbn10[:9]
    return core + isbn13_check_digit(core)


def isbn13_to_isbn10(isbn13: str) -> Optional[str]:
    """Only 978-prefixed ISBN-13s have an ISBN-10 equivalent."""
    isbn13 = clean_isbn(isbn13)
    if not is_valid_isbn13(isbn13) or not isbn13.startswith("978"):
        return None
    core = isbn13[3:12]
    total = sum(int(d) * (10 - i) for i, d in enumerate(core))
    check = (11 - total % 11) % 11
    return core + ("X" if check == 10 else str(check))


def parse_isbn(raw: str) -> Tuple[str, Optional[str]]:
    """Validate an ISBN-10 or ISBN-13 and return (isbn13, isbn10 or None)."""
    isbn = clean_isbn(raw)
    if len(isbn) == 10:
        if not is_valid_isbn10(isbn):
            raise InvalidISBN("Invalid ISBN-10 checksum")
        return isbn10_to_isbn13(isbn), isbn
    if len(isbn) == 13:
        if not is_valid_isbn13(isbn):
            raise InvalidISBN("Invalid ISBN-13 checksum")
        return isbn, isbn13_to_isbn10(isbn)
    raise InvalidISBN("ISBN must have 10 or 13 digits")


def normalize_isbn(raw: str) -> str:
    """Backward compatible helper: returns the ISBN-13."""
    return parse_isbn(raw)[0]


def try_parse_isbn(raw: Optional[str]) -> Optional[Tuple[str, Optional[str]]]:
    if not raw:
        return None
    try:
        return parse_isbn(raw)
    except InvalidISBN:
        return None
