import os
import base64
import hashlib
import hmac
import secrets
from pathlib import Path
from datetime import datetime, timedelta
from typing import Optional

from dotenv import load_dotenv
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import JWTError, jwt

from constants import Role

ROOT_ENV_PATH = Path(__file__).resolve().parent / ".env"
load_dotenv(ROOT_ENV_PATH)

SECRET_KEY = os.getenv("SECRET_KEY", "fallback-secret")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_HOURS = 24
PASSWORD_HASH_ALGORITHM = "pbkdf2_sha256"
PASSWORD_HASH_ITERATIONS = int(os.getenv("PASSWORD_HASH_ITERATIONS", "260000"))

ADMIN_ID = os.getenv("ADMIN_ID", "admin")
ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD", "admin123")

bearer_scheme = HTTPBearer(auto_error=False)


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    to_encode = data.copy()
    expire = datetime.utcnow() + (expires_delta or timedelta(hours=ACCESS_TOKEN_EXPIRE_HOURS))
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac(
        "sha256",
        password.encode("utf-8"),
        salt,
        PASSWORD_HASH_ITERATIONS,
    )
    salt_b64 = base64.urlsafe_b64encode(salt).decode("ascii").rstrip("=")
    digest_b64 = base64.urlsafe_b64encode(digest).decode("ascii").rstrip("=")
    return f"{PASSWORD_HASH_ALGORITHM}${PASSWORD_HASH_ITERATIONS}${salt_b64}${digest_b64}"


def verify_password(password: str, stored_hash: str) -> bool:
    try:
        algorithm, iterations_raw, salt_b64, digest_b64 = stored_hash.split("$", 3)
        if algorithm != PASSWORD_HASH_ALGORITHM:
            return False
        iterations = int(iterations_raw)
        salt = base64.urlsafe_b64decode(salt_b64 + "=" * (-len(salt_b64) % 4))
        expected = base64.urlsafe_b64decode(digest_b64 + "=" * (-len(digest_b64) % 4))
    except (ValueError, TypeError, UnicodeError):
        return False

    digest = hashlib.pbkdf2_hmac(
        "sha256",
        password.encode("utf-8"),
        salt,
        iterations,
    )
    return hmac.compare_digest(digest, expected)


def decode_token(token: str) -> dict:
    try:
        return jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token inválido o expirado",
        )


def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme)):
    if not credentials:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="No autenticado")
    payload = decode_token(credentials.credentials)
    if payload.get("role") == Role.PARTICIPANT and payload.get("participant_id") is None:
        try:
            payload["participant_id"] = int(payload.get("sub"))
        except (TypeError, ValueError):
            payload["participant_id"] = None
    return payload


def get_current_user_optional(credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme)):
    if not credentials:
        return None
    return get_current_user(credentials)


def has_admin_access(user: dict | None) -> bool:
    if not user:
        return False
    if user.get("role") == Role.ADMIN:
        return True
    return bool(user.get("admin_enabled"))


def require_admin(user: dict = Depends(get_current_user)):
    if not has_admin_access(user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Requiere rol admin")
    return user


def has_organizer_access(user: dict | None) -> bool:
    if not user:
        return False
    if user.get("role") == Role.ORGANIZER:
        return True
    return bool(user.get("organizer_enabled"))


def has_judge_access(user: dict | None) -> bool:
    if not user:
        return False
    if user.get("role") == Role.JUDGE:
        return True
    return bool(user.get("judge_enabled"))


def require_staff(user: dict = Depends(get_current_user)):
    if has_admin_access(user):
        return user
    if has_organizer_access(user):
        enriched = dict(user)
        enriched["staff_mode"] = Role.ORGANIZER
        return enriched
    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Requiere rol staff")


def require_organizer_or_admin(user: dict = Depends(get_current_user)):
    return require_staff(user)


def is_end_user(user: dict) -> bool:
    if user.get("role") in Role.END_USER_ROLES:
        return True
    return (
        get_effective_participant_id(user) is not None
        and (has_organizer_access(user) or has_admin_access(user) or has_judge_access(user))
    )


def get_effective_participant_id(user: dict) -> Optional[int]:
    participant_id = user.get("participant_id")
    if participant_id is not None:
        try:
            return int(participant_id)
        except (TypeError, ValueError):
            return None
    if user.get("role") == Role.PARTICIPANT:
        try:
            return int(user.get("sub"))
        except (TypeError, ValueError):
            return None
    return None


def require_auth(user: dict = Depends(get_current_user)):
    return user
