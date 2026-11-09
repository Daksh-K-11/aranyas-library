from typing import Any, Dict, Optional


def merged_book(book: Dict[str, Any], overrides: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    return {**book, **(overrides or {})}


def build_search_blob(book: Dict[str, Any], user_data: Dict[str, Any]) -> str:
    """Lower-cased text used for regex search. ``book`` should already have
    the user's overrides applied."""
    parts = [
        book.get("title") or "",
        book.get("subtitle") or "",
        " ".join(book.get("authors") or []),
        " ".join(book.get("categories") or []),
        book.get("publisher") or "",
        book.get("isbn_13") or "",
        book.get("isbn_10") or "",
        " ".join(user_data.get("genres") or []),
        " ".join(user_data.get("tags") or []),
        user_data.get("personal_notes") or "",
    ]
    return " ".join(p for p in parts if p).lower()[:12000]
