from typing import Optional

import httpx

from app.core.config import HTTP_USER_AGENT, LOOKUP_TIMEOUT_SECONDS

_client: Optional[httpx.AsyncClient] = None


def get_http_client() -> httpx.AsyncClient:
    global _client
    if _client is None or _client.is_closed:
        _client = httpx.AsyncClient(
            timeout=httpx.Timeout(LOOKUP_TIMEOUT_SECONDS, connect=4.0),
            headers={"User-Agent": HTTP_USER_AGENT, "Accept": "application/json"},
            follow_redirects=True,
            limits=httpx.Limits(max_connections=20, max_keepalive_connections=10),
        )
    return _client


async def close_http_client() -> None:
    global _client
    if _client is not None and not _client.is_closed:
        await _client.aclose()
    _client = None
