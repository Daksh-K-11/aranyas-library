import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

from app.core.config import ALLOWED_ORIGINS
from app.core.http import close_http_client
from app.core.ratelimit import limiter
from app.db.indexes import ensure_indexes
from app.routes import auth, books, covers, isbn, libraries, library_books, public_url

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
log = logging.getLogger("library")


@asynccontextmanager
async def lifespan(app: FastAPI):
    try:
        await ensure_indexes()
    except Exception:
        log.exception("index setup failed; continuing")
    yield
    await close_http_client()


app = FastAPI(title="Library Management API", version="2.0.0", lifespan=lifespan)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,  # auth uses a bearer header, not cookies
    allow_methods=["*"],
    allow_headers=["*"],
    max_age=600,
)


@app.middleware("http")
async def security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("X-Frame-Options", "DENY")
    response.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
    response.headers.setdefault("Cross-Origin-Resource-Policy", "cross-origin")
    if request.url.path.startswith(("/auth", "/books", "/library", "/librarybooks", "/isbn")):
        response.headers.setdefault("Cache-Control", "no-store")
    return response


app.include_router(auth.router)
app.include_router(books.router)
app.include_router(isbn.router)
app.include_router(libraries.router)
app.include_router(library_books.router)
app.include_router(public_url.router)
app.include_router(covers.router)


@app.get("/")
async def health():
    return {"status": "ok"}
