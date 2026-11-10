import pytest

from app.models.user_books import UserBookFields
from app.services.genres import PRESET_GENRES, clean_subjects, normalize_genre, suggest_from_subjects


@pytest.mark.parametrize(
    "subjects,expected",
    [
        (["Fantasy fiction", "Wizards", "Magic", "Schools", "Juvenile fiction", "Accessible book",
          "Potter, Harry (Fictitious character)"], ["Fantasy"]),
        (["Fiction", "Thrillers", "Suspense", "Psychological fiction"], ["Thriller & Suspense"]),
        (["History", "Human beings", "Civilization"], ["History"]),
        (["Fiction", "Historical", "Great Britain -- History -- Henry VIII, 1509-1547 -- Fiction"], ["Historical Fiction"]),
        (["True Crime", "Murder", "Kansas"], ["True Crime"]),
        (["Science fiction", "Dune (Imaginary place)"], ["Science Fiction"]),
        (["Fiction"], []),  # too vague to guess
        ([], []),
    ],
)
def test_suggested_genres(subjects, expected):
    assert suggest_from_subjects(subjects)["genres"] == expected


def test_suggestions_are_presets_and_tags_are_plain():
    s = suggest_from_subjects(["Fantasy fiction", "Wizards", "Boarding schools", "Dune (Imaginary place)", "Psychological fiction"])
    assert all(g in PRESET_GENRES for g in s["genres"])
    assert "boarding-schools" in s["tags"]
    assert not any("dune" in t or "fiction" in t for t in s["tags"])


def test_clean_subjects_keeps_fiction_but_drops_noise():
    assert clean_subjects(["Accessible book", "nyt:hardcover", "Fiction", "Wizards.", "Protected DAISY"]) == ["Fiction", "Wizards"]
    assert clean_subjects(["Fiction", "Wizards"], drop_generic=True) == ["Wizards"]


@pytest.mark.parametrize(
    "typed,expected",
    [("fantasy", "Fantasy"), ("Sci-Fi", "Science Fiction"), ("mystery", "Crime & Mystery"),
     ("Drama", "Drama"), ("Cozy reads", "Cozy reads"), ("  ya ", "Young Adult")],
)
def test_normalize_genre(typed, expected):
    assert normalize_genre(typed) == expected


def test_genre_list_unifies_spellings():
    f = UserBookFields(genres=["sci-fi", "Science Fiction", "fantasy"])
    assert f.genres == ["Science Fiction", "Fantasy"]


@pytest.mark.parametrize("given,stored", [(4.25, 4.2), (4.3, 4.3), (5, 5), (0.5, 0.5), (None, None)])
def test_rating_one_decimal(given, stored):
    assert UserBookFields(rating=given).rating == stored


@pytest.mark.parametrize("bad", [0, 0.4, 5.1, 6])
def test_rating_out_of_range(bad):
    with pytest.raises(ValueError):
        UserBookFields(rating=bad)
