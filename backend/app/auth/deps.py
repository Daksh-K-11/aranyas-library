from bson import ObjectId
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer

from app.auth.jwt import JWTError, decode_token
from app.db.mongodb import users_collection

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="auth/login", auto_error=False)

_CREDENTIALS_ERROR = HTTPException(
    status_code=status.HTTP_401_UNAUTHORIZED,
    detail="Could not validate credentials",
    headers={"WWW-Authenticate": "Bearer"},
)


async def get_current_user(token: str | None = Depends(oauth2_scheme)) -> str:
    if not token:
        raise _CREDENTIALS_ERROR
    try:
        payload = decode_token(token)
    except JWTError:
        raise _CREDENTIALS_ERROR
    user_id = payload.get("sub") or payload.get("user_id")
    if not isinstance(user_id, str) or not ObjectId.is_valid(user_id):
        raise _CREDENTIALS_ERROR

    # The account must still exist, be verified, and the token must not have
    # been revoked by a password reset (token_version bump).
    user = await users_collection.find_one(
        {"_id": ObjectId(user_id)}, {"token_version": 1, "email_verified": 1}
    )
    if not user or user.get("email_verified") is False:
        raise _CREDENTIALS_ERROR
    if int(payload.get("tv", 0)) != int(user.get("token_version", 0)):
        raise _CREDENTIALS_ERROR
    return user_id
