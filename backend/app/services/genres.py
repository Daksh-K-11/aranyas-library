"""One vocabulary for what a book is about.

Catalogues return subject headings (Google Books categories, Open Library
subjects, Library of Congress headings). The app shows people a single
"genres" list instead, so this module turns subjects into genres from a
fixed preset list, plus a few short tag suggestions.

The mapping is conservative: a genre is only suggested when a clear keyword
matches. Keep PRESET_GENRES in sync with frontend/lib/constants.ts.
"""
from __future__ import annotations

import re
from typing import Dict, Iterable, List, Optional

from app.utils.text import dedupe

PRESET_GENRES = [
    "Fantasy", "Science Fiction", "Crime & Mystery", "Thriller & Suspense", "Romance",
    "Literary Fiction", "Historical Fiction", "Biography & Memoir", "Self-Help", "History",
    "Young Adult", "Classics", "Horror", "Business & Economics", "Science & Technology",
    "Philosophy", "Psychology", "Contemporary Fiction", "Action & Adventure", "Children's Fiction",
    "Dystopian", "Graphic Novels & Manga", "Poetry", "Religion & Spirituality", "Health & Wellness",
    "Politics & Social Sciences", "True Crime", "Humor & Satire", "Short Stories",
    "Essays & Journalism", "Travel & Adventure", "Cookbooks & Food", "Art & Photography",
    "Fiction", "Non-Fiction",
    "Music & Performing Arts",
]
_PRESET_BY_KEY = {g.casefold(): g for g in PRESET_GENRES}

# Catalogue housekeeping labels that say nothing about the book itself.
_NOISE = re.compile(
    r"^(accessible book|protected daisy|in library|lending library|large (type|print) books?"
    r"|open library.*|overdrive.*|new york times.*|reading level.*|english language.*|language arts.*"
    r"|translations?\b.*|specimens|textbooks?|general|ebooks?|collectionid.*"
    r"|(fiction|literature),? general)$"
    r"|bestseller|:",
    re.IGNORECASE,
)
# Too broad to be a genre or tag, but kept in the catalogue: "Fiction" next
# to "Historical" is what makes it historical fiction rather than history.
_GENERIC = re.compile(
    r"^(juvenile (fiction|literature|nonfiction)|fiction|nonfiction|non-fiction|literature|novels?|stories)$",
    re.IGNORECASE,
)


def clean_subjects(subjects: Iterable, limit: int = 10, drop_generic: bool = False) -> List[str]:
    """Subjects worth keeping: catalogue noise dropped, trailing periods removed."""
    kept = (
        s.strip().rstrip(".")
        for s in subjects
        if isinstance(s, str) and s.strip() and not _NOISE.search(s.strip())
        and not (drop_generic and _GENERIC.match(s.strip().rstrip(".")))
    )
    return dedupe(kept, limit, 60)


# (genre, pattern, fiction): fiction=None means always; True/False means the
# rule only applies when the book is / is not fiction. Checked in order and
# the first match wins, so narrower genres come first.
_RULES = [
    ("True Crime", r"\btrue crime\b", None),
    ("Graphic Novels & Manga", r"graphic novel|\bcomics?\b|\bmanga\b", None),
    ("Young Adult", r"young adult|\bteen|\bya\b", None),
    ("Children's Fiction", r"juvenile fiction|children'?s (stories|fiction|books|literature)|picture books?", None),
    ("Science Fiction", r"science fiction|\bsci-?fi\b|space opera|cyberpunk|time travel|extraterrestrial|interplanetary", None),
    ("Dystopian", r"dystopi|post-?apocalyp", None),
    ("Fantasy", r"fantasy|\bwizards?\b|\bwitch|\bmagic\b|\bdragons?\b|fairy tales|\belves\b|sword and sorcery", None),
    ("Horror", r"horror|ghost stories|\bvampires?\b|\bzombies?\b|paranormal", None),
    ("Thriller & Suspense", r"thriller|suspense|espionage|\bspy\b|\bspies\b", None),
    ("Crime & Mystery", r"myster|detective|\bcrime\b|whodunit|private investigators", None),
    ("Romance", r"romance|love stories", None),
    ("Historical Fiction", r"historical fiction", None),
    ("Classics", r"\bclassics?\b", None),
    ("Literary Fiction", r"literary( fiction)?$", None),
    ("Short Stories", r"short stories", None),
    ("Poetry", r"poetry|\bpoems\b", None),
    ("Humor & Satire", r"humou?r|satire|comedy", None),
    ("Travel & Adventure", r"\btravel|voyages|guidebooks", None),
    ("Action & Adventure", r"\badventure|\baction\b", None),
    ("Biography & Memoir", r"biograph|memoir|autobiograph|\bdiaries\b", None),
    ("Self-Help", r"self-?help|personal (growth|development)|motivation|happiness|success in", None),
    ("Psychology", r"psycholog", False),  # not "Psychological fiction"
    ("Philosophy", r"philosoph|\bethics\b", None),
    ("Religion & Spirituality", r"religio|spiritual|christian|\bbible\b|islam|buddhis|hindu|theolog|meditation", None),
    ("Business & Economics", r"business|economic|management|finance|entrepreneur|marketing|investment|leadership", None),
    ("Politics & Social Sciences", r"politic|sociolog|social science|government|anthropolog|feminis", False),
    ("Health & Wellness", r"health|fitness|\bdiet|nutrition|wellness|medicine|medical", None),
    ("Cookbooks & Food", r"cook(ing|ery|books?)|recipes|\bfood\b|culinary|baking", None),
    ("Science & Technology", r"science|technology|computer|programming|software|mathemat|physics|chemistry|biology|engineering|astronomy", None),
    ("Art & Photography", r"^arts?$|\bart history\b|photograph|painting|drawing|architecture", None),
    ("Music & Performing Arts", r"\bmusic|theat|\bdrama\b|\bfilm|performing arts|\bdance", None),
    ("Essays & Journalism", r"\bessays\b|journalism|reportage", None),
    ("Historical Fiction", r"^histor(y|ical)$|\bhistory\b", True),
    ("History", r"histor", False),
    ("Contemporary Fiction", r"contemporary", True),
]
_RULES_RE = [(g, re.compile(p), f) for g, p, f in _RULES]

_FICTION_HINT = re.compile(r"\bfiction\b|\bnovels?\b|\bstories\b")
_TAG_SHAPE = re.compile(r"^[a-z][a-z' &-]{1,22}[a-z]$")
_NOT_TAGS = {"fiction", "nonfiction", "literature", "english", "american", "british", "juvenile", "general", "novel", "stories"}


def _is_fiction(subjects: Iterable[str]) -> bool:
    return any(_FICTION_HINT.search(re.sub(r"non-?fiction", "", s.lower())) for s in subjects if isinstance(s, str))


def _rule_for(text: str, fiction: bool) -> Optional[str]:
    for genre, pattern, needs in _RULES_RE:
        if (needs is None or needs == fiction) and pattern.search(text):
            return genre
    return None


def suggest_from_subjects(subjects: Optional[Iterable[str]], max_genres: int = 3) -> Dict[str, List[str]]:
    """Preset genres (best first) and short tags suggested by catalogue subjects."""
    subjects = [s for s in (subjects or []) if isinstance(s, str)]
    fiction = _is_fiction(subjects)

    score: Dict[str, int] = {}
    tags: List[str] = []
    for subject in clean_subjects(subjects, 40, drop_generic=True):
        named = "(" in subject  # "Dune (Imaginary place)": a proper name, never a tag
        # LoC headings look like "Wizards -- Fiction"; Google's like "Fiction / Fantasy".
        for part in re.split(r"\s+--\s+|\s+/\s+", re.sub(r"\([^)]*\)", "", subject)):
            part = part.strip().lower()
            if not part:
                continue
            genre = _rule_for(part, fiction)
            if genre:
                score[genre] = score.get(genre, 0) + 1
                continue
            if (named or "," in part or "fiction" in part or part in _NOT_TAGS
                    or not _TAG_SHAPE.match(part) or len(part.split()) > 3):
                continue
            tag = re.sub(r"\s+", "-", re.sub(r"\s*&\s*", "-and-", part))
            if tag not in tags:
                tags.append(tag)

    if "True Crime" in score:  # "Murder" under a true-crime book is not a mystery novel
        score.pop("Crime & Mystery", None)
    genres = sorted(score, key=lambda g: -score[g])[:max_genres]  # sort is stable: ties keep order
    return {"genres": genres, "tags": tags[:6]}


# Common ways people write a preset genre. An explicit list rather than the
# subject rules above: a person's "Drama" means a kind of story, not theatre.
_ALIASES = {
    "Science Fiction": ["sci-fi", "scifi", "sci fi", "sf"],
    "Crime & Mystery": ["mystery", "mysteries", "crime", "detective", "crime fiction", "whodunit", "mystery & crime", "crime and mystery"],
    "Thriller & Suspense": ["thriller", "thrillers", "suspense", "spy", "espionage"],
    "Fantasy": ["fantasy fiction", "epic fantasy", "high fantasy"],
    "Non-Fiction": ["nonfiction", "non fiction"],
    "Romance": ["romantic", "love stories"],
    "Literary Fiction": ["literary", "literature fiction"],
    "Historical Fiction": ["historical", "history fiction"],
    "Biography & Memoir": ["biography", "biographies", "memoir", "memoirs", "autobiography", "biography & autobiography"],
    "Self-Help": ["self help", "selfhelp", "personal development", "self-improvement", "self improvement"],
    "Young Adult": ["ya", "teen", "teens", "young adult fiction"],
    "Classics": ["classic", "classic literature"],
    "Business & Economics": ["business", "economics", "finance", "management"],
    "Science & Technology": ["science", "technology", "tech", "computers", "programming"],
    "Contemporary Fiction": ["contemporary"],
    "Action & Adventure": ["action", "adventure"],
    "Children's Fiction": ["children", "childrens", "children's", "kids", "juvenile fiction"],
    "Dystopian": ["dystopia", "post-apocalyptic"],
    "Graphic Novels & Manga": ["graphic novel", "graphic novels", "comics", "comic", "manga"],
    "Poetry": ["poems"],
    "Religion & Spirituality": ["religion", "spirituality", "religious", "spiritual"],
    "Health & Wellness": ["health", "wellness", "fitness"],
    "Politics & Social Sciences": ["politics", "political", "social science", "social sciences", "sociology"],
    "Humor & Satire": ["humor", "humour", "comedy", "satire", "funny"],
    "Short Stories": ["short story", "anthology"],
    "Essays & Journalism": ["essays", "journalism"],
    "Travel & Adventure": ["travel"],
    "Cookbooks & Food": ["cooking", "cookbook", "cookbooks", "food"],
    "Art & Photography": ["art", "photography"],
    "Music & Performing Arts": ["music", "performing arts"],
}
_ALIAS_TO_GENRE = {a: g for g, aliases in _ALIASES.items() for a in aliases}


def normalize_genre(value: str) -> Optional[str]:
    """Map a genre someone typed to the preset spelling when it is clearly
    one of them ("fantasy" -> "Fantasy", "Sci-fi" -> "Science Fiction").
    Anything else is kept as typed: people may use their own genres."""
    text = re.sub(r"\s+", " ", (value or "").strip())
    if not text:
        return None
    key = text.casefold()
    return _PRESET_BY_KEY.get(key) or _ALIAS_TO_GENRE.get(key) or text[:40]
