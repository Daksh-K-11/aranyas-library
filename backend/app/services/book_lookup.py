"""Multi-provider book metadata lookup.

Every provider is free and needs no key (Google Books optionally uses one).
Providers run concurrently, never raise, and return a ``NormalizedBook``.
Results are merged field by field into one canonical document.
"""
from __future__ import annotations

import asyncio
import logging
import xml.etree.ElementTree as ET
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

import httpx

from app.core.config import GOOGLE_BOOKS_API_KEY
from app.core.http import get_http_client
from app.utils.isbn import isbn13_to_isbn10, try_parse_isbn
from app.utils.text import clean_str, dedupe, https, normalize_author, parse_year, strip_html

log = logging.getLogger("library.lookup")

GOOGLE_BOOKS_URL = "https://www.googleapis.com/books/v1/volumes"
OPEN_LIBRARY = "https://openlibrary.org"
OL_COVERS = "https://covers.openlibrary.org"
LOC_SRU_URL = "https://lx2.loc.gov/sru/lcdb"

PROVIDER_LABELS = {
    "google_books": "Google Books",
    "open_library": "Open Library",
    "open_library_search": "Open Library Search",
    "library_of_congress": "Library of Congress",
}


@dataclass
class NormalizedBook:
    source: str
    title: Optional[str] = None
    subtitle: Optional[str] = None
    authors: List[str] = field(default_factory=list)
    publisher: Optional[str] = None
    published_year: Optional[int] = None
    description: Optional[str] = None
    categories: List[str] = field(default_factory=list)
    cover_url: Optional[str] = None
    page_count: Optional[int] = None
    language: Optional[str] = None
    isbn_13: Optional[str] = None
    isbn_10: Optional[str] = None


# Field priority, highest first. Sources not listed rank last.
PRIORITY = {
    "title": ["google_books", "open_library", "library_of_congress", "open_library_search"],
    "subtitle": ["google_books", "open_library", "library_of_congress"],
    "authors": ["google_books", "open_library", "open_library_search", "library_of_congress"],
    "publisher": ["google_books", "open_library", "library_of_congress", "open_library_search"],
    "published_year": ["open_library", "google_books", "library_of_congress", "open_library_search"],
    "cover_url": ["google_books", "open_library", "open_library_search"],
    "page_count": ["google_books", "open_library", "library_of_congress"],
    "language": ["google_books", "open_library", "library_of_congress"],
}


def _rank(field_name: str, source: str) -> int:
    order = PRIORITY.get(field_name, [])
    return order.index(source) if source in order else len(order)


async def _get_json(url: str, params: Optional[dict] = None) -> Optional[Any]:
    client = get_http_client()
    try:
        res = await client.get(url, params=params)
    except httpx.HTTPError as e:
        log.info("lookup request failed %s: %r", url, e)
        return None
    if res.status_code != 200:
        log.info("lookup %s returned %s", url, res.status_code)
        return None
    try:
        return res.json()
    except ValueError:
        return None


# ===================================================================== Google
def _google_cover(image_links: dict) -> Optional[str]:
    for key in ("extraLarge", "large", "medium", "small", "thumbnail", "smallThumbnail"):
        url = image_links.get(key)
        if url:
            url = url.replace("&edge=curl", "")
            return https(url)
    return None


def _from_google_volume(info: dict, source: str = "google_books") -> NormalizedBook:
    isbn_10 = isbn_13 = None
    for ident in info.get("industryIdentifiers", []) or []:
        if ident.get("type") == "ISBN_13":
            isbn_13 = ident.get("identifier")
        elif ident.get("type") == "ISBN_10":
            isbn_10 = ident.get("identifier")
    categories: List[str] = []
    for cat in info.get("categories", []) or []:
        categories.extend(c.strip() for c in str(cat).split("/"))
    return NormalizedBook(
        source=source,
        title=clean_str(info.get("title"), 300),
        subtitle=clean_str(info.get("subtitle"), 300),
        authors=dedupe((normalize_author(a) for a in info.get("authors", []) or []), 20, 200),
        publisher=clean_str(info.get("publisher"), 200),
        published_year=parse_year(info.get("publishedDate")),
        description=strip_html(info.get("description")),
        categories=dedupe(categories, 10, 60),
        cover_url=_google_cover(info.get("imageLinks") or {}),
        page_count=info.get("pageCount") if isinstance(info.get("pageCount"), int) else None,
        language=clean_str(info.get("language"), 10),
        isbn_13=isbn_13,
        isbn_10=isbn_10,
    )


async def fetch_google_books(isbn_13: str) -> Optional[NormalizedBook]:
    params = {"q": f"isbn:{isbn_13}", "maxResults": 1, "printType": "books"}
    if GOOGLE_BOOKS_API_KEY:
        params["key"] = GOOGLE_BOOKS_API_KEY
    data = await _get_json(GOOGLE_BOOKS_URL, params)
    if not data or not data.get("totalItems") or not data.get("items"):
        return None
    try:
        return _from_google_volume(data["items"][0].get("volumeInfo", {}))
    except Exception:
        log.exception("google books parse error")
        return None


# ================================================================ Open Library
def _ol_text(value) -> Optional[str]:
    if isinstance(value, dict):
        value = value.get("value")
    return strip_html(value) if isinstance(value, str) else None


async def fetch_open_library(isbn: str) -> Optional[NormalizedBook]:
    data_task = _get_json(
        f"{OPEN_LIBRARY}/api/books",
        {"bibkeys": f"ISBN:{isbn}", "format": "json", "jscmd": "data"},
    )
    edition_task = _get_json(f"{OPEN_LIBRARY}/isbn/{isbn}.json")
    data, edition = await asyncio.gather(data_task, edition_task)

    book = (data or {}).get(f"ISBN:{isbn}") if isinstance(data, dict) else None
    edition = edition if isinstance(edition, dict) else None
    if not book and not edition:
        return None

    try:
        book = book or {}
        edition = edition or {}

        description = _ol_text(edition.get("description"))
        subjects = [s.get("name") for s in book.get("subjects", []) if isinstance(s, dict)]

        works = edition.get("works") or []
        if works and isinstance(works[0], dict) and works[0].get("key"):
            if not description or not subjects:
                work = await _get_json(f"{OPEN_LIBRARY}{works[0]['key']}.json")
                if isinstance(work, dict):
                    description = description or _ol_text(work.get("description"))
                    if not subjects:
                        subjects = [s for s in work.get("subjects", []) if isinstance(s, str)]

        authors = [a.get("name") for a in book.get("authors", []) if isinstance(a, dict)]

        publishers = [p.get("name") for p in book.get("publishers", []) if isinstance(p, dict)]
        if not publishers:
            publishers = [p for p in edition.get("publishers", []) if isinstance(p, str)]

        cover = (book.get("cover") or {})
        cover_url = cover.get("large") or cover.get("medium")
        if not cover_url and edition.get("covers"):
            cid = edition["covers"][0]
            if isinstance(cid, int) and cid > 0:
                cover_url = f"{OL_COVERS}/b/id/{cid}-L.jpg"

        idents = book.get("identifiers", {}) or {}
        isbn_13 = (idents.get("isbn_13") or edition.get("isbn_13") or [None])[0]
        isbn_10 = (idents.get("isbn_10") or edition.get("isbn_10") or [None])[0]

        pages = book.get("number_of_pages") or edition.get("number_of_pages")

        return NormalizedBook(
            source="open_library",
            title=clean_str(book.get("title") or edition.get("title"), 300),
            subtitle=clean_str(book.get("subtitle") or edition.get("subtitle"), 300),
            authors=dedupe((normalize_author(a) for a in authors if a), 20, 200),
            publisher=clean_str(publishers[0], 200) if publishers else None,
            published_year=parse_year(book.get("publish_date") or edition.get("publish_date")),
            description=description,
            # OL subjects are noisy: keep the first few short ones.
            categories=dedupe((s for s in subjects if s and len(s) <= 40), 8, 60),
            cover_url=https(cover_url),
            page_count=pages if isinstance(pages, int) else None,
            isbn_13=isbn_13,
            isbn_10=isbn_10,
        )
    except Exception:
        log.exception("open library parse error")
        return None


async def fetch_open_library_search(isbn: str) -> Optional[NormalizedBook]:
    """The search index groups editions into works; it sometimes finds ISBNs
    the edition API misses."""
    data = await _get_json(
        f"{OPEN_LIBRARY}/search.json",
        {
            "isbn": isbn,
            "fields": "key,title,subtitle,author_name,publisher,first_publish_year,subject,cover_i,language",
            "limit": 1,
        },
    )
    docs = (data or {}).get("docs") if isinstance(data, dict) else None
    if not docs:
        return None
    return _from_ol_search_doc(docs[0])


def _from_ol_search_doc(doc: dict) -> NormalizedBook:
    cover_id = doc.get("cover_i")
    return NormalizedBook(
        source="open_library_search",
        title=clean_str(doc.get("title"), 300),
        subtitle=clean_str(doc.get("subtitle"), 300),
        authors=dedupe((normalize_author(a) for a in doc.get("author_name", []) or []), 20, 200),
        publisher=clean_str((doc.get("publisher") or [None])[0], 200),
        published_year=parse_year(doc.get("first_publish_year")),
        categories=dedupe((s for s in doc.get("subject", []) or [] if len(s) <= 40), 8, 60),
        cover_url=f"{OL_COVERS}/b/id/{cover_id}-L.jpg" if isinstance(cover_id, int) and cover_id > 0 else None,
        language=clean_str((doc.get("language") or [None])[0], 10),
    )


# =========================================================== Library of Congress
_MODS = "{http://www.loc.gov/mods/v3}"


async def fetch_library_of_congress(isbn: str) -> Optional[NormalizedBook]:
    client = get_http_client()
    try:
        res = await client.get(
            LOC_SRU_URL,
            params={
                "version": "1.1",
                "operation": "searchRetrieve",
                "query": f"bath.isbn={isbn}",
                "maximumRecords": "1",
                "recordSchema": "mods",
            },
            headers={"Accept": "application/xml"},
        )
    except httpx.HTTPError as e:
        log.info("loc request failed: %r", e)
        return None
    if res.status_code != 200 or len(res.content) > 2_000_000:
        return None
    try:
        root = ET.fromstring(res.content)
        mods = root.find(f".//{_MODS}mods")
        if mods is None:
            return None

        title_info = None
        for ti in mods.findall(f"{_MODS}titleInfo"):
            if ti.get("type") is None:
                title_info = ti
                break
        title = subtitle = None
        if title_info is not None:
            nonsort = (title_info.findtext(f"{_MODS}nonSort") or "").strip()
            title = ((nonsort + " ") if nonsort else "") + (title_info.findtext(f"{_MODS}title") or "")
            subtitle = title_info.findtext(f"{_MODS}subTitle")

        authors = []
        for name in mods.findall(f"{_MODS}name"):
            if name.get("type") != "personal":
                continue
            parts = [p.text for p in name.findall(f"{_MODS}namePart") if p.text and not p.get("type")]
            if parts:
                authors.append(normalize_author(" ".join(parts)))

        origin = mods.find(f"{_MODS}originInfo")
        publisher = year = None
        if origin is not None:
            publisher = origin.findtext(f"{_MODS}publisher") or origin.findtext(f"{_MODS}agent/{_MODS}namePart")
            year = parse_year(origin.findtext(f"{_MODS}dateIssued"))

        categories = []
        for subj in mods.findall(f"{_MODS}subject"):
            topic = subj.findtext(f"{_MODS}topic")
            if topic:
                categories.append(topic.rstrip("."))
        for genre in mods.findall(f"{_MODS}genre"):
            if genre.get("authority") in {"lcgft", "Library of Congress Subject Headings"} and genre.text:
                categories.append(genre.text.rstrip("."))

        abstract = mods.findtext(f"{_MODS}abstract")

        return NormalizedBook(
            source="library_of_congress",
            title=clean_str(title.rstrip(" /:") if title else None, 300),
            subtitle=clean_str(subtitle.rstrip(" /") if subtitle else None, 300),
            authors=dedupe(authors, 20, 200),
            publisher=clean_str(publisher.rstrip(" ,") if publisher else None, 200),
            published_year=year,
            description=strip_html(abstract),
            categories=dedupe(categories, 8, 60),
        )
    except ET.ParseError:
        return None
    except Exception:
        log.exception("loc parse error")
        return None


# ===================================================================== Merge
def merge_books(results: List[NormalizedBook], isbn_13: str, isbn_10: Optional[str]) -> Optional[Dict[str, Any]]:
    results = [r for r in results if r and r.title]
    if not results:
        return None

    def pick(field_name: str):
        candidates = [r for r in results if getattr(r, field_name)]
        if not candidates:
            return None
        candidates.sort(key=lambda r: _rank(field_name, r.source))
        return getattr(candidates[0], field_name)

    descriptions = [r.description for r in results if r.description]
    # The longest description is usually the publisher blurb, the short ones
    # are catalog summaries. Cap length so a junk dump can't dominate.
    description = max(descriptions, key=len)[:8000] if descriptions else None

    cat_sources = sorted(results, key=lambda r: _rank("title", r.source))
    categories = dedupe((c for r in cat_sources for c in r.categories), 10, 60)

    title = pick("title")
    subtitle = pick("subtitle")
    if subtitle and title and subtitle.casefold() in title.casefold():
        subtitle = None

    return {
        "isbn_13": isbn_13,
        "isbn_10": isbn_10 or isbn13_to_isbn10(isbn_13),
        "title": title,
        "subtitle": subtitle,
        "authors": pick("authors") or [],
        "publisher": pick("publisher"),
        "published_year": pick("published_year"),
        "description": description,
        "categories": categories,
        "cover_url": pick("cover_url"),
        "page_count": pick("page_count"),
        "language": pick("language"),
        "sources": sorted({r.source for r in results}, key=lambda s: _rank("title", s)),
    }


async def _guard(coro, name: str):
    try:
        return await coro
    except Exception:
        log.exception("provider %s crashed", name)
        return None


async def lookup_isbn_providers(isbn_13: str, isbn_10: Optional[str]) -> Optional[Dict[str, Any]]:
    tasks = [
        _guard(fetch_google_books(isbn_13), "google"),
        _guard(fetch_open_library(isbn_13), "open_library"),
        _guard(fetch_library_of_congress(isbn_13), "loc"),
    ]
    results = list(await asyncio.gather(*tasks))

    found = [r for r in results if r and r.title]
    if not found:
        # Second pass: the ISBN-10 form and the search index.
        retry = [_guard(fetch_open_library_search(isbn_13), "ol_search")]
        if isbn_10:
            retry += [
                _guard(fetch_open_library(isbn_10), "open_library10"),
                _guard(fetch_library_of_congress(isbn_10), "loc10"),
            ]
        found = [r for r in await asyncio.gather(*retry) if r and r.title]

    return merge_books(found, isbn_13, isbn_10)


# ================================================================ Title search
async def search_candidates(query: str, limit: int = 10) -> List[Dict[str, Any]]:
    """Search by title/author. Returns candidates without saving anything."""
    params = {"q": query, "maxResults": min(limit, 20), "printType": "books"}
    if GOOGLE_BOOKS_API_KEY:
        params["key"] = GOOGLE_BOOKS_API_KEY

    google_task = _get_json(GOOGLE_BOOKS_URL, params)
    ol_task = _get_json(
        f"{OPEN_LIBRARY}/search.json",
        {
            "q": query,
            "fields": "key,title,subtitle,author_name,publisher,first_publish_year,subject,cover_i,isbn,language",
            "limit": min(limit, 20),
        },
    )
    google, ol = await asyncio.gather(google_task, ol_task)

    candidates: List[NormalizedBook] = []
    for item in (google or {}).get("items", []) if isinstance(google, dict) else []:
        try:
            candidates.append(_from_google_volume(item.get("volumeInfo", {})))
        except Exception:
            continue
    for doc in (ol or {}).get("docs", []) if isinstance(ol, dict) else []:
        try:
            nb = _from_ol_search_doc(doc)
            nb.source = "open_library"
            for raw in doc.get("isbn", []) or []:
                parsed = try_parse_isbn(raw)
                if parsed:
                    nb.isbn_13, nb.isbn_10 = parsed
                    break
            candidates.append(nb)
        except Exception:
            continue

    out: List[Dict[str, Any]] = []
    seen = set()
    for c in candidates:
        if not c.title:
            continue
        parsed = try_parse_isbn(c.isbn_13 or c.isbn_10 or "")
        isbn_13 = parsed[0] if parsed else None
        key = isbn_13 or f"{c.title.casefold()}|{(c.authors[:1] or [''])[0].casefold()}"
        if key in seen:
            continue
        seen.add(key)
        out.append(
            {
                "title": c.title,
                "subtitle": c.subtitle,
                "authors": c.authors,
                "publisher": c.publisher,
                "published_year": c.published_year,
                "description": c.description,
                "categories": c.categories,
                "cover_url": c.cover_url,
                "isbn_13": isbn_13,
                "isbn_10": parsed[1] if parsed else None,
                "source": c.source,
            }
        )
        if len(out) >= limit:
            break
    return out
