from slowapi import Limiter
from slowapi.util import get_remote_address

# In-memory limiter. Behind a reverse proxy run uvicorn with
# `--proxy-headers --forwarded-allow-ips="*"` so the client IP is correct.
limiter = Limiter(key_func=get_remote_address, default_limits=["300/minute"])
