# from fastapi import APIRouter, HTTPException
# import httpx
# from app.db.mongodb import books_collection
# from app.utils.isbn import normalize_isbn
# from datetime import datetime, timezone

# router = APIRouter(prefix="/isbn", tags=["ISBN"])


# @router.get("", dependencies=[])
# async def lookup_isbn(isbn: str):
#     # 1️⃣ Normalize ISBN
#     try:
#         isbn_13 = normalize_isbn(isbn)
#     except Exception:
#         raise HTTPException(status_code=400, detail="Invalid ISBN format")

#     # 2️⃣ Check local DB
#     try:
#         book = await books_collection.find_one({"isbn_13": isbn_13})
#     except Exception:
#         raise HTTPException(status_code=500, detail="Database error")

#     if book:
#         book["id"] = str(book["_id"])
#         del book["_id"]
#         return book

#     # 3️⃣ Fetch from Google Books
#     try:
#         async with httpx.AsyncClient(timeout=5) as client:
#             res = await client.get(
#                 "https://www.googleapis.com/books/v1/volumes",
#                 params={"q": f"isbn:{isbn_13}"}
#             )
#             res.raise_for_status()
#     except httpx.TimeoutException:
#         raise HTTPException(status_code=504, detail="Google Books timeout")
#     except httpx.HTTPStatusError:
#         raise HTTPException(status_code=502, detail="Google Books error")
#     except Exception:
#         raise HTTPException(status_code=500, detail="Failed to fetch book data")

#     # 4️⃣ Parse response
#     try:
#         data = res.json()
#         if data.get("totalItems", 0) == 0:
#             raise HTTPException(status_code=404, detail="ISBN not found")

#         info = data["items"][0]["volumeInfo"]
#     except (KeyError, IndexError, ValueError):
#         raise HTTPException(status_code=502, detail="Invalid response from Google Books")

#     # 5️⃣ Build document
#     book_doc = {
#         "isbn_13": isbn_13,
#         "isbn_10": isbn if len(isbn) == 10 else None,
#         "title": info.get("title"),
#         "authors": info.get("authors", []),
#         "publisher": info.get("publisher"),
#         "published_year": (
#             int(info.get("publishedDate", "0")[:4])
#             if info.get("publishedDate")
#             else None
#         ),
#         "description": info.get("description"),
#         "categories": info.get("categories", []),
#         "cover_url": info.get("imageLinks", {}).get("thumbnail"),
#         "created_at": datetime.now(timezone.utc),
#     }

#     # 6️⃣ Insert into DB
#     try:
#         result = await books_collection.insert_one(book_doc)
#         book_doc["id"] = str(result.inserted_id)
#         book_doc.pop("_id", None)
#     except Exception:
#         raise HTTPException(status_code=500, detail="Failed to save book data. Try again later.")

#     return book_doc



from fastapi import APIRouter, HTTPException
import httpx
from app.db.mongodb import books_collection
from app.utils.isbn import normalize_isbn
from datetime import datetime, timezone
from typing import Optional

router = APIRouter(prefix="/isbn", tags=["ISBN"])

GOOGLE_BOOKS_URL = "https://www.googleapis.com/books/v1/volumes"
OPEN_LIBRARY_URL = "https://openlibrary.org/api/books"

TIMEOUT = 8.0


# =========================================================
# Helpers
# =========================================================

def extract_isbns(industry_ids):
    isbn_10 = None
    isbn_13 = None

    for item in industry_ids:
        if item.get("type") == "ISBN_10":
            isbn_10 = item.get("identifier")

        elif item.get("type") == "ISBN_13":
            isbn_13 = item.get("identifier")

    return isbn_10, isbn_13


def build_book_doc(
    *,
    isbn_13: str,
    isbn_10: Optional[str],
    title: Optional[str],
    authors: list,
    publisher: Optional[str],
    published_year: Optional[int],
    description: Optional[str],
    categories: list,
    cover_url: Optional[str],
    source: str,
):
    return {
        "isbn_13": isbn_13,
        "isbn_10": isbn_10,
        "title": title,
        "authors": authors,
        "publisher": publisher,
        "published_year": published_year,
        "description": description,
        "categories": categories,
        "cover_url": cover_url,
        "source": source,
        "created_at": datetime.now(timezone.utc),
    }


# =========================================================
# Google Books Lookup
# =========================================================

async def fetch_google_books(isbn_13: str):

    async with httpx.AsyncClient(
        timeout=TIMEOUT,
        headers={"User-Agent": "BookLookupAPI/1.0"}
    ) as client:

        res = await client.get(
            GOOGLE_BOOKS_URL,
            params={"q": f"isbn:{isbn_13}"}
        )

        res.raise_for_status()

    data = res.json()

    if data.get("totalItems", 0) == 0:
        return None

    try:
        info = data["items"][0]["volumeInfo"]

        industry_ids = info.get("industryIdentifiers", [])
        isbn_10, api_isbn_13 = extract_isbns(industry_ids)

        published_year = None
        if info.get("publishedDate"):
            try:
                published_year = int(info["publishedDate"][:4])
            except Exception:
                pass

        return build_book_doc(
            isbn_13=api_isbn_13 or isbn_13,
            isbn_10=isbn_10,
            title=info.get("title"),
            authors=info.get("authors", []),
            publisher=info.get("publisher"),
            published_year=published_year,
            description=info.get("description"),
            categories=info.get("categories", []),
            cover_url=info.get("imageLinks", {}).get("thumbnail"),
            source="google_books",
        )

    except Exception:
        return None


# =========================================================
# Open Library Lookup
# =========================================================

async def fetch_openlibrary(isbn_13: str):

    async with httpx.AsyncClient(
        timeout=TIMEOUT,
        headers={"User-Agent": "BookLookupAPI/1.0"}
    ) as client:

        res = await client.get(
            OPEN_LIBRARY_URL,
            params={
                "bibkeys": f"ISBN:{isbn_13}",
                "format": "json",
                "jscmd": "data",
            }
        )

        res.raise_for_status()

    data = res.json()

    key = f"ISBN:{isbn_13}"

    if key not in data:
        return None

    try:
        book = data[key]

        published_year = None

        publish_date = book.get("publish_date")
        if publish_date:
            try:
                published_year = int(publish_date[-4:])
            except Exception:
                pass

        publishers = book.get("publishers", [])

        return build_book_doc(
            isbn_13=isbn_13,
            isbn_10=None,
            title=book.get("title"),
            authors=[a["name"] for a in book.get("authors", [])],
            publisher=publishers[0]["name"] if publishers else None,
            published_year=published_year,
            description=None,
            categories=[],
            cover_url=book.get("cover", {}).get("medium"),
            source="open_library",
        )

    except Exception:
        return None


# # =========================================================
# # Google Books Title Fallback
# # =========================================================

@router.get("/title", dependencies=[])
async def fetch_google_books_by_title(title: str, author: Optional[str] = None):

    query = f'intitle:{title}'

    if author:
        query += f'+inauthor:{author}'

    async with httpx.AsyncClient(
        timeout=TIMEOUT,
        headers={"User-Agent": "BookLookupAPI/1.0"}
    ) as client:

        res = await client.get(
            GOOGLE_BOOKS_URL,
            params={"q": query}
        )

        res.raise_for_status()

    data = res.json()

    if data.get("totalItems", 0) == 0:
        return None

    try:
        info = data["items"][0]["volumeInfo"]

        industry_ids = info.get("industryIdentifiers", [])
        isbn_10, isbn_13 = extract_isbns(industry_ids)

        published_year = None

        if info.get("publishedDate"):
            try:
                published_year = int(info["publishedDate"][:4])
            except Exception:
                pass

        return build_book_doc(
            isbn_13=isbn_13,
            isbn_10=isbn_10,
            title=info.get("title"),
            authors=info.get("authors", []),
            publisher=info.get("publisher"),
            published_year=published_year,
            description=info.get("description"),
            categories=info.get("categories", []),
            cover_url=info.get("imageLinks", {}).get("thumbnail"),
            source="google_books_title_search",
        )

    except Exception:
        return None


# =========================================================
# Main API
# =========================================================

@router.get("", dependencies=[])
async def lookup_isbn(isbn: str):

    # -----------------------------------------------------
    # Normalize ISBN
    # -----------------------------------------------------

    try:
        isbn_13 = normalize_isbn(isbn)

    except Exception:
        raise HTTPException(
            status_code=400,
            detail="Invalid ISBN format"
        )

    # -----------------------------------------------------
    # Check Local DB
    # -----------------------------------------------------

    try:
        existing = await books_collection.find_one({
            "isbn_13": isbn_13
        })

    except Exception:
        raise HTTPException(
            status_code=500,
            detail="Database error"
        )

    if existing:
        existing["id"] = str(existing["_id"])
        del existing["_id"]
        return existing

    # -----------------------------------------------------
    # Provider Lookup Chain
    # -----------------------------------------------------
    
    book_doc = None

    # 1. Google Books
    try:
        book_doc = await fetch_google_books(isbn_13)
    except Exception:
        pass

    # 2. Open Library
    if not book_doc:
        try:
            book_doc = await fetch_openlibrary(isbn_13)
            print(book_doc)
        except Exception as e:
            print("OPENLIB ERROR:", repr(e))
            raise

    # -----------------------------------------------------
    # Not Found
    # -----------------------------------------------------

    if not book_doc:
        raise HTTPException(
            status_code=404,
            detail="Book not found"
        )

    # -----------------------------------------------------
    # Save to DB
    # -----------------------------------------------------

    try:
        result = await books_collection.insert_one(book_doc)

        book_doc["id"] = str(result.inserted_id)

    except Exception:
        raise HTTPException(
            status_code=500,
            detail="Failed to save book"
        )

    return book_doc