from app.services.book_lookup import NormalizedBook, _from_google_volume, merge_books
from app.utils.text import normalize_author, parse_year, strip_html


def test_merge_prefers_priority_and_longest_description():
    g = NormalizedBook(source="google_books", title="1984", authors=["George Orwell"], description="Short",
                       cover_url="https://g/cover", categories=["Fiction"])
    ol = NormalizedBook(source="open_library", title="Nineteen Eighty-Four", published_year=1949,
                        description="A much longer description of the novel.", categories=["Dystopias", "fiction"])
    loc = NormalizedBook(source="library_of_congress", title="1984", publisher="Signet")
    m = merge_books([loc, ol, g], "9780451524935", None)
    assert m["title"] == "1984"
    assert m["published_year"] == 1949
    assert m["publisher"] == "Signet"
    assert m["description"].startswith("A much longer")
    assert m["categories"] == ["Fiction", "Dystopias"]
    assert m["isbn_10"] == "0451524934"
    assert m["cover_url"] == "https://g/cover"
    assert set(m["sources"]) == {"google_books", "open_library", "library_of_congress"}


def test_merge_none_when_empty():
    assert merge_books([NormalizedBook(source="x")], "9780451524935", None) is None


def test_google_parse():
    nb = _from_google_volume({
        "title": "T", "authors": ["A"], "publishedDate": "2004-05-01",
        "description": "<p>Hello &amp; <b>bye</b></p>", "categories": ["Fiction / General"],
        "imageLinks": {"thumbnail": "http://books.google.com/x?id=1&edge=curl"},
    })
    assert nb.published_year == 2004
    assert nb.description == "Hello & bye"
    assert nb.categories == ["Fiction", "General"]
    assert nb.cover_url == "https://books.google.com/x?id=1"


def test_text_helpers():
    assert normalize_author("Bhagat, Chetan.") == "Chetan Bhagat"
    assert normalize_author("Orwell, George, 1903-1950") == "George Orwell"
    assert parse_year("c1999.") == 1999
    assert parse_year("May 2010") == 2010
    assert strip_html(None) is None
