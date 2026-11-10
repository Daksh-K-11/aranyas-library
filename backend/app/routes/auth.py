"""Authentication: register, email verification (OTP), login, password reset.

Anti-enumeration: register / resend / forgot-password always return the same
response whether or not the email exists, and the actual lookup + email
sending happens in a background task so response timing doesn't leak it
either. Login only reveals "not verified" after a correct password.
"""
from datetime import datetime, timezone

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request
from fastapi.responses import JSONResponse
from pymongo.errors import DuplicateKeyError

from app.auth.deps import get_current_user
from app.auth.jwt import create_access_token
from app.core.config import APP_NAME, OTP_RESEND_COOLDOWN_SECONDS, OTP_TTL_MINUTES
from app.core.ratelimit import limiter
from app.db.mongodb import users_collection
from app.models.user import EmailIn, LoginIn, RegisterIn, ResetPasswordIn, VerifyEmailIn
from app.services.email import account_exists_email, otp_email, send_email
from app.services.otp import can_send, check_code, clear_codes, issue_code
from app.utils.auth import hash_password, verify_password
from app.utils.ids import parse_oid

router = APIRouter(prefix="/auth", tags=["Auth"])

# Used to keep login timing similar whether or not the email exists.
_DUMMY_HASH = hash_password("timing-equaliser-password-1")
_INVALID_CODE = "That code is invalid or has expired. Request a new one."


def _now():
    return datetime.now(timezone.utc)


def _token(user: dict) -> dict:
    return {
        "access_token": create_access_token(str(user["_id"]), int(user.get("token_version", 0))),
        "token_type": "bearer",
    }


# ----------------------------------------------------------- background jobs
async def _send_verification(email: str) -> None:
    user = await users_collection.find_one({"email": email}, {"email_verified": 1})
    if not user or user.get("email_verified"):
        return
    code = await issue_code(email, "verify")
    if code:
        await send_email(email, *otp_email(code, "verify", OTP_TTL_MINUTES))


async def _send_reset(email: str) -> None:
    user = await users_collection.find_one({"email": email}, {"_id": 1})
    if not user:
        return
    code = await issue_code(email, "reset")
    if code:
        await send_email(email, *otp_email(code, "reset", OTP_TTL_MINUTES))


async def _send_account_exists(email: str) -> None:
    # Reuse the verify throttle so this can't be used to spam an inbox.
    if await can_send(email, "verify") is not None:
        return
    from app.db.mongodb import otp_sends_collection

    await otp_sends_collection.insert_one({"email": email, "purpose": "verify", "created_at": _now()})
    await send_email(email, *account_exists_email())


async def _send_password_changed(email: str) -> None:
    text = (
        f"The password for your {APP_NAME} account was just changed and all other sessions were signed out.\n\n"
        "If this wasn't you, reset your password immediately using 'Forgot password'."
    )
    await send_email(email, f"Your {APP_NAME} password was changed", text, f"<p>{text}</p>")


# ----------------------------------------------------------------- routes
_PENDING = {
    "message": "Check your email for a 6-digit verification code.",
    "verification_required": True,
    "resend_after": OTP_RESEND_COOLDOWN_SECONDS,
}


@router.post("/register", status_code=201)
@limiter.limit("5/minute;30/hour")
async def register(request: Request, data: RegisterIn, background: BackgroundTasks):
    email = data.email.lower()
    existing = await users_collection.find_one({"email": email}, {"email_verified": 1})

    if existing and existing.get("email_verified"):
        background.add_task(_send_account_exists, email)
        return {**_PENDING, "email": email}

    if existing:
        # Unverified account: nobody has proven they own this email yet, so the
        # latest registration simply replaces the pending password.
        await users_collection.update_one(
            {"_id": existing["_id"], "email_verified": False},
            {"$set": {"password": hash_password(data.password), "name": data.name}},
        )
    else:
        try:
            await users_collection.insert_one(
                {
                    "email": email,
                    "password": hash_password(data.password),
                    "name": data.name,
                    "email_verified": False,
                    "token_version": 0,
                    "created_at": _now(),
                }
            )
        except DuplicateKeyError:
            pass
    background.add_task(_send_verification, email)
    return {**_PENDING, "email": email}


@router.post("/login")
@limiter.limit("10/minute;60/hour")
async def login(request: Request, data: LoginIn, background: BackgroundTasks):
    email = data.email.lower()
    user = await users_collection.find_one({"email": email})
    if not user:
        verify_password(data.password, _DUMMY_HASH)
        raise HTTPException(401, "Invalid email or password")
    if not verify_password(data.password, user["password"]):
        raise HTTPException(401, "Invalid email or password")

    if user.get("email_verified") is False:
        background.add_task(_send_verification, email)
        return JSONResponse(
            status_code=403,
            content={
                "detail": "Please verify your email first. We've sent you a new code.",
                "code": "email_not_verified",
                "email": email,
                "resend_after": OTP_RESEND_COOLDOWN_SECONDS,
            },
        )
    return _token(user)


@router.post("/verify-email")
@limiter.limit("10/minute;50/hour")
async def verify_email(request: Request, data: VerifyEmailIn):
    email = data.email.lower()
    user = await users_collection.find_one({"email": email})
    if not user or user.get("email_verified"):
        raise HTTPException(400, _INVALID_CODE)
    if not await check_code(email, "verify", data.code):
        raise HTTPException(400, _INVALID_CODE)
    await users_collection.update_one(
        {"_id": user["_id"]}, {"$set": {"email_verified": True, "verified_at": _now()}}
    )
    return {**_token(user), "message": "Email verified"}


@router.post("/resend-verification", status_code=202)
@limiter.limit("5/minute;20/hour")
async def resend_verification(request: Request, data: EmailIn, background: BackgroundTasks):
    background.add_task(_send_verification, data.email.lower())
    return {
        "message": "If that account needs verifying, a new code is on its way.",
        "resend_after": OTP_RESEND_COOLDOWN_SECONDS,
    }


@router.post("/forgot-password", status_code=202)
@limiter.limit("5/minute;20/hour")
async def forgot_password(request: Request, data: EmailIn, background: BackgroundTasks):
    background.add_task(_send_reset, data.email.lower())
    return {
        "message": "If an account exists for that email, we've sent a code to reset the password.",
        "resend_after": OTP_RESEND_COOLDOWN_SECONDS,
    }


@router.post("/reset-password")
@limiter.limit("10/minute;50/hour")
async def reset_password(request: Request, data: ResetPasswordIn, background: BackgroundTasks):
    email = data.email.lower()
    user = await users_collection.find_one({"email": email})
    if not user or not await check_code(email, "reset", data.code):
        raise HTTPException(400, _INVALID_CODE)

    updated = await users_collection.find_one_and_update(
        {"_id": user["_id"]},
        {
            "$set": {
                "password": hash_password(data.new_password),
                # Receiving the code proves ownership of the inbox.
                "email_verified": True,
                "password_changed_at": _now(),
            },
            "$inc": {"token_version": 1},  # signs out every existing session
        },
        return_document=True,
    )
    await clear_codes(email, "verify")
    background.add_task(_send_password_changed, email)
    return {**_token(updated), "message": "Password updated"}


@router.get("/me")
async def me(user_id: str = Depends(get_current_user)):
    user = await users_collection.find_one({"_id": parse_oid(user_id)}, {"password": 0})
    if not user:
        raise HTTPException(401, "Could not validate credentials")
    return {"id": user_id, "email": user["email"], "name": user.get("name")}
