import pytest

from app.utils.isbn import InvalidISBN, isbn10_to_isbn13, isbn13_to_isbn10, parse_isbn


def test_isbn13_valid():
    assert parse_isbn("978-0-451-52493-5") == ("9780451524935", "0451524934")


def test_isbn10_with_x():
    isbn13, isbn10 = parse_isbn("0-8044-2957-X")
    assert isbn10 == "080442957X"
    assert isbn13 == "9780804429573"
    assert isbn13_to_isbn10(isbn13) == "080442957X"


def test_979_has_no_isbn10():
    isbn13, isbn10 = parse_isbn("9791032305690")
    assert isbn10 is None


@pytest.mark.parametrize("bad", ["9780451524936", "0451524935", "12345", "abcdefghij", "", "9771234567003"])
def test_invalid(bad):
    with pytest.raises(InvalidISBN):
        parse_isbn(bad)


def test_roundtrip():
    assert isbn10_to_isbn13("8129115301") == "9788129115300"
    assert isbn13_to_isbn10("9788129115300") == "8129115301"
