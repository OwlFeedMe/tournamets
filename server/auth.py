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
from sqlmodel import Session

from cache import Cache, Keys
from constants import Role
from models import AppUser

ROOT_ENV_PATH = Path(__file__).resolve().parent / ".env"
load_dotenv(ROOT_ENV_PATH)

SECRET_KEY = os.getenv("SECRET_KEY", "fallback-secret")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_HOURS = 24
PASSWORD_HASH_ALGORITHM = "pbkdf2_sha256"
PASSWORD_HASH_ITERATIONS = int(os.getenv("PASSWORD_HASH_ITERATIONS", "260000"))

ADMIN_ID = os.getenv("ADMIN_ID", "admin")
ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD", "admin123")

APP_USER_CACHE_TTL = int(os.getenv("AUTH_CACHE_TTL", "60"))

bearer_scheme = HTTPBearer(auto_error=False)


_APP_USER_CACHE_FIELDS = (
    "id",
    "username",
    "display_name",
    "role",
    "organizer_enabled",
    "judge_enabled",
    "admin_enabled",
    "participant_id",
    "is_active",
)


def _serialize_app_user(app_user: AppUser) -> dict:
    return {field: getattr(app_user, field, None) for field in _APP_USER_CACHE_FIELDS}


def _deserialize_app_user(data: dict) -> AppUser:
    # Instancia desanclada del ORM. Solo para checks de permisos, NO hace falta
    # que SQLAlchemy la tracke. password_hash omitido a proposito (seguridad).
    return AppUser(
        id=data.get("id"),
        username=data.get("username") or "",
        display_name=data.get("display_name"),
        role=data.get("role") or Role.USER,
        password_hash="",
        organizer_enabled=int(data.get("organizer_enabled") or 0),
        judge_enabled=int(data.get("judge_enabled") or 0),
        admin_enabled=int(data.get("admin_enabled") or 0),
        participant_id=data.get("participant_id"),
        is_active=int(data.get("is_active") or 0),
    )


def load_app_user_cached(session: Session, app_user_id: int) -> AppUser | None:
    """Resuelve AppUser via cache Redis con fallback a DB.

    Los hits NO tocan SQLAlchemy identity map. La instancia retornada es detached
    y solo debe usarse para lectura de flags/roles/username/display_name.
    Para mutaciones, siempre usar session.get(AppUser, id) directamente.
    """
    key = Keys.APP_USER.format(user_id=app_user_id)
    cached = Cache.get(key)
    if isinstance(cached, dict):
        try:
            return _deserialize_app_user(cached)
        except Exception:  # payload corrupto, re-leer de DB
            Cache.delete(key)

    app_user = session.get(AppUser, app_user_id)
    if app_user is None:
        return None
    try:
        Cache.set(key, _serialize_app_user(app_user), ttl=APP_USER_CACHE_TTL)
    except Exception:
        pass
    return app_user


def invalidate_app_user(app_user_id: int | None) -> None:
    if app_user_id is None:
        return
    try:
        Cache.delete(
            Keys.APP_USER.format(user_id=int(app_user_id)),
            Keys.OWNED_COMPS.format(user_id=int(app_user_id)),
        )
    except (TypeError, ValueError):
        return


def get_auth_session():
    from database import get_session

    yield from get_session()


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


def _effective_role(base_role: str, app_user: AppUser) -> str:
    if int(app_user.admin_enabled or 0):
        return Role.ADMIN
    if int(app_user.organizer_enabled or 0):
        return Role.ORGANIZER
    if int(app_user.judge_enabled or 0):
        return Role.JUDGE
    return base_role


def _refresh_user_access(payload: dict, session: Session) -> dict:
    refreshed = dict(payload)
    app_user_id = refreshed.get("app_user_id")
    if app_user_id is None and isinstance(refreshed.get("sub"), str) and refreshed["sub"].startswith("app:"):
        try:
            app_user_id = int(refreshed["sub"].split(":", 1)[1])
        except (TypeError, ValueError, IndexError):
            app_user_id = None
    if app_user_id is None:
        return refreshed

    app_user = load_app_user_cached(session, int(app_user_id))
    if not app_user or int(app_user.is_active or 0) != 1:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Sesion invalida")

    extra_roles: list[str] = []
    if int(app_user.organizer_enabled or 0):
        extra_roles.append(Role.ORGANIZER)
    if int(app_user.judge_enabled or 0):
        extra_roles.append(Role.JUDGE)
    if int(app_user.admin_enabled or 0):
        extra_roles.append(Role.ADMIN)

    refreshed["app_user_id"] = app_user.id
    refreshed["username"] = app_user.username
    refreshed["display_name"] = app_user.display_name
    refreshed["base_role"] = app_user.role
    refreshed["extra_roles"] = extra_roles
    refreshed["role"] = _effective_role(app_user.role, app_user)
    refreshed["participant_id"] = app_user.participant_id
    refreshed["organizer_enabled"] = bool(app_user.organizer_enabled)
    refreshed["judge_enabled"] = bool(app_user.judge_enabled)
    refreshed["admin_enabled"] = bool(app_user.admin_enabled)
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

    payload = _refresh_user_access(decode_token(credentials.credentials), session)
    if payload.get("role") == Role.PARTICIPANT and payload.get("participant_id") is None:
        try:
            payload["participant_id"] = int(payload.get("sub"))
        except (TypeError, ValueError):
            payload["participant_id"] = None
    return payload


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
    session: Session = Depends(get_auth_session),
):
    return _get_current_user_from_credentials(credentials, session, optional=False)


def get_current_user_optional(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
    session: Session = Depends(get_auth_session),
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
