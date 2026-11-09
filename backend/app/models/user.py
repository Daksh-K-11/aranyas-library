from typing import Annotated, Optional

from pydantic import AfterValidator, BaseModel, EmailStr, Field, field_validator


def _password_rules(v: str) -> str:
    if not any(c.isalpha() for c in v) or not any(c.isdigit() for c in v):
        raise ValueError("Password must contain at least one letter and one number")
    return v


class RegisterIn(BaseModel):
    email: EmailStr
    password: Annotated[str, Field(min_length=8, max_length=128), AfterValidator(_password_rules)]
    name: Optional[str] = Field(default=None, max_length=80)

    @field_validator("name")
    @classmethod
    def strip_name(cls, v):
        return v.strip() or None if v else None


class LoginIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)


# Backward compatible name
User = LoginIn
