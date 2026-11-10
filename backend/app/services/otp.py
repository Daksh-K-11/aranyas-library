"""One-time codes for email verification and password reset.

Security properties:
* 6-digit codes from ``secrets`` (CSPRNG).
* Only an HMAC of the code is stored (keyed with SECRET_KEY, bound to the
  email and purpose), so a database leak does not reveal live codes.
* One active code per (email, purpose); issuing a new one invalidates the old.
* Codes expire (TTL index) and allow a limited number of attempts, counted
  atomically so parallel guesses can't exceed the limit.
* Sending is throttled per email: a cooldown between sends and an hourly cap.
* Codes are single use (deleted on success).
"""
import hashlib
import hmac
import secrets
from datetime import datetime, timedelta, timezone
from typing import Literal, Optional

from pymongo import ReturnDocument
from pymongo.errors import DuplicateKeyError

from app.core.config import (
    OTP_MAX_ATTEMPTS,
    OTP_MAX_SENDS_PER_HOUR,
    OTP_RESEND_COOLDOWN_SECONDS,
    OTP_TTL_MINUTES,
    SECRET_KEY,
)
from app.db.mongodb import otp_codes_collection, otp_sends_collection

Purpose = Literal["verify", "reset"]


def _hash(email: str, purpose: str, code: str) -> str:
    msg = f"{purpose}:{email}:{code}".encode()
    return hmac.new(SECRET_KEY.encode(), msg, hashlib.sha256).hexdigest()


def _now() -> datetime:
    return datetime.now(timezone.utc)


async def can_send(email: str, purpose: Purpose) -> Optional[int]:
    """Return None if a code may be sent now, else seconds to wait."""
    now = _now()
    last = await otp_sends_collection.find_one(
        {"email": email, "purpose": purpose}, sort=[("created_at", -1)]
    )
    if last:
        elapsed = (now - last["created_at"]).total_seconds()
        if elapsed < OTP_RESEND_COOLDOWN_SECONDS:
            return int(OTP_RESEND_COOLDOWN_SECONDS - elapsed) + 1
    sent_last_hour = await otp_sends_collection.count_documents(
        {"email": email, "purpose": purpose, "created_at": {"$gte": now - timedelta(hours=1)}}
    )
    if sent_last_hour >= OTP_MAX_SENDS_PER_HOUR:
        oldest = await otp_sends_collection.find_one(
            {"email": email, "purpose": purpose, "created_at": {"$gte": now - timedelta(hours=1)}},
            sort=[("created_at", 1)],
        )
        return int(3600 - (now - oldest["created_at"]).total_seconds()) + 1 if oldest else 3600
    return None


async def issue_code(email: str, purpose: Purpose) -> Optional[str]:
    """Create a new code (replacing any previous one). Returns None when
    throttled. The caller is responsible for emailing it."""
    if await can_send(email, purpose) is not None:
        return None
    code = f"{secrets.randbelow(1_000_000):06d}"
    now = _now()
    try:
        # Atomic cooldown: only replaces a code older than the cooldown. If a
        # fresh one exists the filter misses, the upsert collides with the
        # unique (email, purpose) index and we treat it as throttled. This
        # stops concurrent requests from sending two codes.
        await otp_codes_collection.update_one(
            {
                "email": email,
                "purpose": purpose,
                "created_at": {"$lt": now - timedelta(seconds=OTP_RESEND_COOLDOWN_SECONDS)},
            },
            {
                "$set": {
                    "code_hash": _hash(email, purpose, code),
                    "attempts": 0,
                    "created_at": now,
                    "expires_at": now + timedelta(minutes=OTP_TTL_MINUTES),
                }
            },
            upsert=True,
        )
    except DuplicateKeyError:
        return None
    await otp_sends_collection.insert_one({"email": email, "purpose": purpose, "created_at": now})
    return code


async def check_code(email: str, purpose: Purpose, code: str) -> bool:
    """Verify and consume a code. Every call counts as an attempt."""
    if not (isinstance(code, str) and len(code) == 6 and code.isdigit()):
        return False
    doc = await otp_codes_collection.find_one_and_update(
        {
            "email": email,
            "purpose": purpose,
            "expires_at": {"$gt": _now()},
            "attempts": {"$lt": OTP_MAX_ATTEMPTS},
        },
        {"$inc": {"attempts": 1}},
        return_document=ReturnDocument.AFTER,
    )
    if not doc:
        return False
    if hmac.compare_digest(doc["code_hash"], _hash(email, purpose, code)):
        # single use: only the request that deletes it wins
        res = await otp_codes_collection.delete_one({"_id": doc["_id"], "code_hash": doc["code_hash"]})
        return res.deleted_count == 1
    if doc["attempts"] >= OTP_MAX_ATTEMPTS:
        await otp_codes_collection.delete_one({"_id": doc["_id"]})
    return False


async def clear_codes(email: str, purpose: Purpose) -> None:
    await otp_codes_collection.delete_many({"email": email, "purpose": purpose})
