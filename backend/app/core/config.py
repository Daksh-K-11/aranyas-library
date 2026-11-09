import logging
import os

from dotenv import load_dotenv

load_dotenv()

log = logging.getLogger("library.config")


def _env(name: str, default: str | None = None) -> str | None:
    value = os.getenv(name)
    if value is None:
        return default
    value = value.strip()
    return value if value else default


def _int_env(name: str, default: int) -> int:
    raw = _env(name)
    if raw is None:
        return default
    try:
        return int(raw)
    except ValueError:
        log.warning("Invalid integer for %s=%r, using default %s", name, raw, default)
        return default


# ---------------------------------------------------------------- Mongo
MONGO_URI = _env("MONGO_URI")
if not MONGO_URI:
    raise RuntimeError("MONGO_URI environment variable is required")
DB_NAME = _env("DB_NAME", "library")

# ---------------------------------------------------------------- Auth
SECRET_KEY = _env("SECRET_KEY")
if not SECRET_KEY:
    raise RuntimeError("SECRET_KEY environment variable is required")
if len(SECRET_KEY) < 32:
    log.warning(
        "SECRET_KEY is shorter than 32 characters. Generate a stronger one with: "
        "python -c \"import secrets; print(secrets.token_urlsafe(48))\""
    )

ALGORITHM = _env("ALGORITHM", "HS256")
if ALGORITHM not in {"HS256", "HS384", "HS512"}:
    raise RuntimeError("ALGORITHM must be one of HS256, HS384, HS512")

ACCESS_TOKEN_EXPIRE_MINUTES = _int_env("ACCESS_TOKEN_EXPIRE_MINUTES", 60 * 24 * 7)

# ---------------------------------------------------------------- HTTP
# Comma separated list of origins allowed to call the API from a browser.
ALLOWED_ORIGINS = ["*"]

# ---------------------------------------------------------------- Book lookup
# Optional. Google Books works without a key but the anonymous quota is shared
# and small; a free key gives 1000 requests/day.
GOOGLE_BOOKS_API_KEY = _env("GOOGLE_BOOKS_API_KEY")
LOOKUP_TIMEOUT_SECONDS = float(_env("LOOKUP_TIMEOUT_SECONDS", "6") or 6)
HTTP_USER_AGENT = _env("HTTP_USER_AGENT", "AthenaeumLibrary/2.0 (personal library manager)")

# ---------------------------------------------------------------- Uploads
MAX_UPLOAD_BYTES = _int_env("MAX_UPLOAD_BYTES", 3 * 1024 * 1024)
