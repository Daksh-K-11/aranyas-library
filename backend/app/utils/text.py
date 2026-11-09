import html
import re
from typing import Iterable, List, Optional

_TAG_RE = re.compile(r"<[^>]+>")
_WS_RE = re.compile(r"[ \t\r\f\v]+")
_YEAR_RE = re.compile(r"(?<!\d)(1[5-9]\d{2}|20\d{2})(?!\d)")


def strip_html(value: Optional[str]) -> Optional[str]:
    if not value:
        return None
    text = re.sub(r"(?i)<br\s*/?>|</p>", "\n", value)
    text = _TAG_RE.sub("", text)
    text = html.unescape(text)
    text = "\n".join(_WS_RE.sub(" ", line).strip() for line in text.splitlines())
    text = re.sub(r"\n{3,}", "\n\n", text).strip()
    return text or None


def clean_str(value, max_len: int = 500) -> Optional[str]:
    if value is None:
        return None
    if not isinstance(value, str):
        value = str(value)
    value = _WS_RE.sub(" ", value).strip()
    return value[:max_len] if value else None


def parse_year(value) -> Optional[int]:
    if value is None:
        return None
    if isinstance(value, int):
        return value if 1400 <= value <= 2100 else None
    m = _YEAR_RE.search(str(value))
    return int(m.group(1)) if m else None


def normalize_author(name: str) -> Optional[str]:
    name = clean_str(name, 200)
    if not name:
        return None
    name = name.rstrip(",. ")
    # LoC style "Orwell, George, 1903-1950" -> "George Orwell"
    name = re.sub(r",?\s*\(?\d{3,4}\s*-\s*(\d{3,4})?\)?\.?$", "", name).strip(" ,")
    if name.count(",") == 1:
        last, first = [p.strip() for p in name.split(",")]
        if first and last and len(first.split()) <= 4:
            name = f"{first} {last}"
    return name or None


def dedupe(items: Iterable[Optional[str]], limit: int = 20, max_len: int = 100) -> List[str]:
    out: List[str] = []
    seen = set()
    for item in items:
        s = clean_str(item, max_len)
        if not s:
            continue
        key = s.casefold()
        if key in seen:
            continue
        seen.add(key)
        out.append(s)
        if len(out) >= limit:
            break
    return out


def https(url: Optional[str]) -> Optional[str]:
    if not url:
        return None
    if url.startswith("http://"):
        return "https://" + url[len("http://"):]
    return url if url.startswith("https://") else None
