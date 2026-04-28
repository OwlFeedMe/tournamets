import base64
import hashlib
import hmac
import os
import secrets
from datetime import datetime, timedelta
from pathlib import Path
from typing import Optional

from dotenv import load_dotenv
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
from sqlmodel import Session

from cache import Cache, Keys
from constants import Role
from database import get_session
from models import User

ROOT_ENV_PATH = Path(__file__).resolve().parent / ".env"
load_dotenv(ROOT_ENV_PATH)

SECRET_KEY = os.getenv("SECRET_KEY", "fallback-secret")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_HOURS = 24 * 30
PASSWORD_HASH_ALGORITHM = "pbkdf2_sha256"
PASSWORD_HASH_ITERATIONS = int(os.getenv("PASSWORD_HASH_ITERATIONS", "260000"))
USER_CACHE_TTL = int(os.getenv("AUTH_CACHE_TTL", "60"))

bearer_scheme = HTTPBearer(auto_error=False)

_USER_CACHE_FIELDS = (
    "id",
    "username",
    "display_name",
    "role",
    "organizer_enabled",
    "judge_enabled",
    "admin_enabled",
    "is_active",
)


def _serialize_user(user: User) -> dict:
    return {field: getattr(user, field, None) for field in _USER_CACHE_FIELDS}


def _deserialize_user(data: dict) -> User:
    return User(
        id=data.get("id"),
        cedula=f"cached:{data.get('id')}",
        nombre=data.get("display_name") or "",
        apellido="",
        username=data.get("username"),
        display_name=data.get("display_name"),
        role=data.get("role") or Role.USER,
        password_hash=None,
        organizer_enabled=int(data.get("organizer_enabled") or 0),
        judge_enabled=int(data.get("judge_enabled") or 0),
        admin_enabled=int(data.get("admin_enabled") or 0),
        is_active=int(data.get("is_active") or 0),
    )


def load_user_cached(session: Session, user_id: int) -> User | None:
    key = Keys.USER.format(user_id=user_id)
    cached = Cache.get(key)
    if isinstance(cached, dict):
        try:
            return _deserialize_user(cached)
        except Exception:
            Cache.delete(key)

    user = session.get(User, user_id)
    if user is None:
        return None
    try:
        Cache.set(key, _serialize_user(user), ttl=USER_CACHE_TTL)
    except Exception:
        pass
    return user


def invalidate_user(user_id: int | None) -> None:
    if user_id is None:
        return
    try:
        Cache.delete(
            Keys.USER.format(user_id=int(user_id)),
            Keys.OWNED_COMPS.format(user_id=int(user_id)),
        )
    except (TypeError, ValueError):
        return


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


def verify_password(password: str, stored_hash: str | None) -> bool:
    if not stored_hash:
        return False
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
            detail="Token invalido o expirado",
        )


def _effective_role(base_role: str, user: User) -> str:
    if int(user.admin_enabled or 0):
        return Role.ADMIN
    if int(user.organizer_enabled or 0):
        return Role.ORGANIZER
    if int(user.judge_enabled or 0):
        return Role.JUDGE
    return base_role


def _refresh_user_access(payload: dict, session: Session) -> dict:
    refreshed = dict(payload)
    raw_user_id = refreshed.get("user_id")
    if raw_user_id is None and refreshed.get("sub") is not None:
        raw_user_id = refreshed.get("sub")

    try:
        user_id = int(raw_user_id)
    except (TypeError, ValueError):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Sesion invalida")

    user = load_user_cached(session, user_id)
    if not user or int(user.is_active or 0) != 1:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Sesion invalida")

    extra_roles: list[str] = []
    if int(user.organizer_enabled or 0):
        extra_roles.append(Role.ORGANIZER)
    if int(user.judge_enabled or 0):
        extra_roles.append(Role.JUDGE)
    if int(user.admin_enabled or 0):
        extra_roles.append(Role.ADMIN)

    refreshed["sub"] = str(user.id)
    refreshed["user_id"] = user.id
    refreshed["username"] = user.username
    refreshed["display_name"] = user.display_name or f"{(user.nombre or '').strip()} {(user.apellido or '').strip()}".strip()
    refreshed["base_role"] = user.role
    refreshed["extra_roles"] = extra_roles
    refreshed["role"] = _effective_role(user.role, user)
    refreshed["organizer_enabled"] = bool(user.organizer_enabled)
    refreshed["judge_enabled"] = bool(user.judge_enabled)
    refreshed["admin_enabled"] = bool(user.admin_enabled)
    return refreshed


def _get_current_user_from_credentials(
    credentials: HTTPAuthorizationCredentials | None,
    session: Session,
    *,
    optional: bool,
):
    if not credentials:
        if optional:
            return None
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="No autenticado")
    return _refresh_user_access(decode_token(credentials.credentials), session)


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
    session: Session = Depends(get_session),
):
    return _get_current_user_from_credentials(credentials, session, optional=False)


def get_current_user_optional(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
    session: Session = Depends(get_session),
):
    return _get_current_user_from_credentials(credentials, session, optional=True)


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


def is_end_user(user: dict) -> bool:
    if user.get("role") in Role.END_USER_ROLES:
        return True
    return (
        get_current_user_id(user) is not None
        and (has_organizer_access(user) or has_admin_access(user) or has_judge_access(user))
    )


def get_current_user_id(user: dict | None) -> Optional[int]:
    if not user:
        return None
    user_id = user.get("user_id")
    if user_id is None and user.get("sub") is not None:
        user_id = user.get("sub")
    if user_id is not None:
        try:
            return int(user_id)
        except (TypeError, ValueError):
            return None
    return None


def get_effective_user_id(user: dict) -> Optional[int]:
    return get_current_user_id(user)


def require_auth(user: dict = Depends(get_current_user)):
    return user
