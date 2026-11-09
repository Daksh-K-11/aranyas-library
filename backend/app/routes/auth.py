from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request
from pymongo.errors import DuplicateKeyError

from app.auth.deps import get_current_user
from app.auth.jwt import create_access_token
from app.core.ratelimit import limiter
from app.db.mongodb import users_collection
from app.models.user import LoginIn, RegisterIn
from app.utils.auth import hash_password, verify_password
from app.utils.ids import parse_oid

router = APIRouter(prefix="/auth", tags=["Auth"])

# Used to keep login timing similar whether or not the email exists.
_DUMMY_HASH = hash_password("timing-equaliser-password-1")


@router.post("/register", status_code=201)
@limiter.limit("5/minute;30/hour")
async def register(request: Request, data: RegisterIn):
    email = data.email.lower()
    try:
        await users_collection.insert_one(
            {
                "email": email,
                "password": hash_password(data.password),
                "name": data.name,
                "created_at": datetime.now(timezone.utc),
            }
        )
    except DuplicateKeyError:
        raise HTTPException(400, "An account with this email already exists")
    return {"message": "Registered"}


@router.post("/login")
@limiter.limit("10/minute;60/hour")
async def login(request: Request, data: LoginIn):
    user = await users_collection.find_one({"email": data.email.lower()})
    if not user:
        verify_password(data.password, _DUMMY_HASH)
        raise HTTPException(401, "Invalid email or password")
    if not verify_password(data.password, user["password"]):
        raise HTTPException(401, "Invalid email or password")

    return {"access_token": create_access_token(str(user["_id"])), "token_type": "bearer"}


@router.get("/me")
async def me(user_id: str = Depends(get_current_user)):
    user = await users_collection.find_one({"_id": parse_oid(user_id)}, {"password": 0})
    if not user:
        raise HTTPException(401, "Could not validate credentials")
    return {"id": user_id, "email": user["email"], "name": user.get("name")}
