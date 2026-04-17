import logging
import re
import secrets
import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Body, Depends, HTTPException
from sqlalchemy import func, or_
from sqlalchemy.exc import IntegrityError
from sqlmodel import Session, select

from auth import create_access_token, get_current_user, hash_password, invalidate_app_user, require_auth, verify_password
from constants import EstadoParticipante, Role
from database import get_session
from models import MeResponse, Participant, PasswordResetCode, TokenResponse, User
from services.emailer import send_email
from services.email_templates import render_password_reset_code, render_welcome

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/auth", tags=["auth"])

VALID_GENEROS = {"M", "F", "Otro"}
PENDING_CEDULA_PREFIX = "pending:"
TEXT_ONLY_REGEX = re.compile(r"^[A-Za-zÁÉÍÓÚáéíóúÑñÜü\s]+$")
BASIC_EMAIL_REGEX = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")
STRONG_PASSWORD_REGEX = re.compile(r"^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z\d]).{8,}$")


def _user_extra_roles(user: User | None) -> list[str]:
    if not user:
        return []
    extra_roles: list[str] = []
    if int(user.organizer_enabled or 0):
        extra_roles.append(Role.ORGANIZER)
    if int(user.judge_enabled or 0):
        extra_roles.append(Role.JUDGE)
    if int(user.admin_enabled or 0):
        extra_roles.append(Role.ADMIN)
    return extra_roles


def _effective_role(base_role: str, extra_roles: list[str]) -> str:
    if Role.ADMIN in extra_roles:
        return Role.ADMIN
    if Role.ORGANIZER in extra_roles:
        return Role.ORGANIZER
    if Role.JUDGE in extra_roles:
        return Role.JUDGE
    return base_role


def _display_name(user: User) -> str:
    return str(user.display_name or f"{(user.nombre or '').strip()} {(user.apellido or '').strip()}".strip() or user.cedula)


def _session_token_payload(user: User) -> dict:
    extra_roles = _user_extra_roles(user)
    effective_role = _effective_role(user.role, extra_roles)
    return {
        "sub": str(user.id),
        "user_id": user.id,
        "app_user_id": user.id,
        "participant_id": user.id,
        "role": effective_role,
        "base_role": user.role,
        "extra_roles": extra_roles,
        "display_name": _display_name(user),
        "nombre": _display_name(user),
        "username": user.username or user.email or user.cedula,
        "organizer_enabled": bool(user.organizer_enabled),
        "judge_enabled": bool(user.judge_enabled),
        "admin_enabled": bool(user.admin_enabled),
    }


def _token_response(user: User) -> TokenResponse:
    payload = _session_token_payload(user)
    return TokenResponse(
        access_token=create_access_token(payload),
        role=payload["role"],
        base_role=payload["base_role"],
        extra_roles=list(payload["extra_roles"]),
        display_name=payload["display_name"],
        nombre=payload["nombre"],
        username=payload["username"],
        app_user_id=payload["app_user_id"],
        participant_id=payload["participant_id"],
        organizer_enabled=payload["organizer_enabled"],
        judge_enabled=payload["judge_enabled"],
        admin_enabled=payload["admin_enabled"],
    )


def _me_response(user: User) -> MeResponse:
    payload = _session_token_payload(user)
    return MeResponse(
        role=payload["role"],
        base_role=payload["base_role"],
        extra_roles=list(payload["extra_roles"]),
        display_name=payload["display_name"],
        nombre=payload["nombre"],
        username=payload["username"],
        app_user_id=payload["app_user_id"],
        participant_id=payload["participant_id"],
        organizer_enabled=payload["organizer_enabled"],
        judge_enabled=payload["judge_enabled"],
        admin_enabled=payload["admin_enabled"],
    )


def _user_by_identifier(session: Session, identifier: str) -> User | None:
    normalized = identifier.strip().lower()
    if not normalized:
        return None
    return session.exec(
        select(User).where(
            User.is_active == 1,
            or_(
                func.lower(func.coalesce(User.username, "")) == normalized,
                func.lower(func.coalesce(User.email, "")) == normalized,
                User.cedula == identifier.strip(),
            ),
        )
    ).first()


def _users_for_email(session: Session, email: str, *, active_only: bool = False) -> list[User]:
    normalized_email = email.strip().lower()
    if not normalized_email:
        return []
    query = select(User).where(func.lower(User.email) == normalized_email)
    if active_only:
        query = query.where(User.estado == EstadoParticipante.ACTIVO, User.is_active == 1)
    return session.exec(query).all()


def _active_user_for_email(session: Session, email: str) -> User | None:
    matches = _users_for_email(session, email, active_only=True)
    if len(matches) != 1:
        return None
    return matches[0]


def _generate_pending_cedula() -> str:
    return f"{PENDING_CEDULA_PREFIX}{uuid.uuid4().hex}"


def _validate_register_fields(
    *,
    nombre: str,
    apellido: str,
    email: str,
    celular: str,
    genero: str,
    password: str,
) -> None:
    if not TEXT_ONLY_REGEX.fullmatch(nombre):
        raise HTTPException(status_code=400, detail="El nombre solo puede tener letras y espacios")
    if not TEXT_ONLY_REGEX.fullmatch(apellido):
        raise HTTPException(status_code=400, detail="El apellido solo puede tener letras y espacios")
    if email and not BASIC_EMAIL_REGEX.fullmatch(email):
        raise HTTPException(status_code=400, detail="Ingresa un email valido")
    if celular and not celular.isdigit():
        raise HTTPException(status_code=400, detail="El celular debe contener solo numeros")
    if genero and genero not in VALID_GENEROS:
        raise HTTPException(status_code=400, detail="Selecciona un genero valido")
    if not STRONG_PASSWORD_REGEX.fullmatch(password):
        raise HTTPException(
            status_code=400,
            detail="La contrasena debe tener minimo 8 caracteres, mayuscula, minuscula, numero y caracter especial",
        )


@router.post("/register", response_model=TokenResponse, status_code=201)
def register(body: dict = Body(...), session: Session = Depends(get_session)):
    nombre = str(body.get("nombre") or "").strip()
    apellido = str(body.get("apellido") or "").strip()
    email = str(body.get("email") or "").strip().lower()
    celular = str(body.get("celular") or "").strip()
    genero = str(body.get("genero") or "").strip()
    password = str(body.get("password") or "")

    if not nombre or not apellido or not email or not password:
        raise HTTPException(status_code=400, detail="Completa los campos requeridos")

    _validate_register_fields(
        nombre=nombre,
        apellido=apellido,
        email=email,
        celular=celular,
        genero=genero,
        password=password,
    )

    existing_matches = _users_for_email(session, email)
    if len(existing_matches) > 1:
        raise HTTPException(status_code=409, detail="Ya existe una cuenta con ese email")

    user = existing_matches[0] if existing_matches else None
    if user and user.password_hash:
        raise HTTPException(status_code=409, detail="Ya existe una cuenta con ese email")

    if user:
        user.nombre = nombre
        user.apellido = apellido
        user.email = email
        user.username = email
        user.display_name = f"{nombre} {apellido}".strip()
        user.celular = celular or user.celular
        user.genero = genero or user.genero
        user.sexo = user.genero or user.sexo
        user.estado = EstadoParticipante.ACTIVO
        user.role = Role.USER
        user.password_hash = hash_password(password)
        user.is_active = 1
        session.add(user)
    else:
        user = Participant(
            cedula=_generate_pending_cedula(),
            nombre=nombre,
            apellido=apellido,
            email=email,
            celular=celular or None,
            genero=genero or None,
            sexo=genero or None,
            estado=EstadoParticipante.ACTIVO,
            username=email,
            display_name=f"{nombre} {apellido}".strip(),
            role=Role.USER,
            password_hash=hash_password(password),
            is_active=1,
        )
        session.add(user)

    try:
        session.commit()
        session.refresh(user)
    except IntegrityError:
        session.rollback()
        raise HTTPException(status_code=409, detail="Ya existe una cuenta con ese email")

    if email:
        try:
            subject, mail_body, html = render_welcome(nombre=nombre)
            send_email(to_email=email, subject=subject, body=mail_body, html_body=html)
        except Exception:
            logger.exception("Failed to send welcome email to %s", email)

    return _token_response(user)


@router.post("/login", response_model=TokenResponse)
def login(body: dict = Body(...), session: Session = Depends(get_session)):
    identifier = str(body.get("cedula") or body.get("email") or body.get("username") or "").strip()
    password = str(body.get("password") or "")
    if not identifier or not password:
        raise HTTPException(status_code=400, detail="Correo o usuario y contrasena son obligatorios")

    user = _user_by_identifier(session, identifier)
    if not user:
        raise HTTPException(status_code=401, detail="Credenciales invalidas")

    if user.password_hash and verify_password(password, user.password_hash):
        return _token_response(user)

    # Legacy bootstrap for imported users without password yet.
    if password != identifier:
        raise HTTPException(status_code=401, detail="Credenciales invalidas")

    user.password_hash = hash_password(password)
    if not user.username:
        user.username = (user.email or user.cedula or "").strip().lower() or None
    if not user.display_name:
        user.display_name = _display_name(user)
    user.role = user.role or Role.USER
    user.is_active = 1
    session.add(user)
    session.commit()
    session.refresh(user)
    invalidate_app_user(user.id)
    return _token_response(user)


@router.get("/me", response_model=MeResponse)
def me(session: Session = Depends(get_session), user=Depends(get_current_user)):
    user_id = user.get("user_id") or user.get("app_user_id") or user.get("participant_id")
    current = session.get(User, int(user_id)) if user_id is not None else None
    if not current or int(current.is_active or 0) != 1:
        raise HTTPException(status_code=401, detail="Sesion invalida")
    return _me_response(current)


@router.post("/change-password", status_code=200)
def change_password(body: dict = Body(...), session: Session = Depends(get_session), user=Depends(require_auth)):
    current_password = str(body.get("current_password") or "")
    new_password = str(body.get("new_password") or "")
    if not current_password or not new_password:
        raise HTTPException(status_code=400, detail="Completa todos los campos")
    if not STRONG_PASSWORD_REGEX.fullmatch(new_password):
        raise HTTPException(
            status_code=400,
            detail="La contrasena debe tener minimo 8 caracteres, mayuscula, minuscula, numero y caracter especial",
        )

    user_id = user.get("user_id") or user.get("app_user_id") or user.get("participant_id")
    current = session.get(User, int(user_id)) if user_id is not None else None
    if not current or int(current.is_active or 0) != 1:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    if not verify_password(current_password, current.password_hash):
        raise HTTPException(status_code=400, detail="La contrasena actual es incorrecta")

    current.password_hash = hash_password(new_password)
    session.add(current)
    session.commit()
    invalidate_app_user(current.id)
    return {"ok": True}


RESET_CODE_EXPIRY_MINUTES = 20
RESET_CODE_MAX_ACTIVE = 3


@router.post("/forgot-password", status_code=200)
def forgot_password(body: dict = Body(...), session: Session = Depends(get_session)):
    email = str(body.get("email") or "").strip().lower()
    if not email or not BASIC_EMAIL_REGEX.fullmatch(email):
        raise HTTPException(status_code=400, detail="Ingresa un email valido")

    app_user = _active_user_for_email(session, email)
    if not app_user:
        return {"ok": True}

    now = datetime.now(timezone.utc)
    active_codes = session.exec(
        select(PasswordResetCode).where(
            func.lower(PasswordResetCode.email) == email,
            PasswordResetCode.used_at == None,  # noqa: E711
            PasswordResetCode.expires_at > now,
        )
    ).all()
    if len(active_codes) >= RESET_CODE_MAX_ACTIVE:
        code = str(max(active_codes, key=lambda item: item.created_at or now).code)
    else:
        code = str(secrets.randbelow(900000) + 100000)
        expires_at = now + timedelta(minutes=RESET_CODE_EXPIRY_MINUTES)
        session.add(PasswordResetCode(email=email, code=code, expires_at=expires_at))
        session.commit()

    nombre = _display_name(app_user)
    try:
        subject, mail_body, html = render_password_reset_code(nombre=nombre, code=code)
        sent = send_email(to_email=email, subject=subject, body=mail_body, html_body=html)
        if not sent:
            logger.warning("Password reset email was not accepted by provider for %s", email)
    except Exception:
        logger.exception("Failed to send password reset email to %s", email)
    return {"ok": True}


@router.post("/reset-password", status_code=200)
def reset_password(body: dict = Body(...), session: Session = Depends(get_session)):
    email = str(body.get("email") or "").strip().lower()
    code = str(body.get("code") or "").strip()
    new_password = str(body.get("password") or "")
    if not email or not code or not new_password:
        raise HTTPException(status_code=400, detail="Completa todos los campos")
    if not STRONG_PASSWORD_REGEX.fullmatch(new_password):
        raise HTTPException(
            status_code=400,
            detail="La contrasena debe tener minimo 8 caracteres, mayuscula, minuscula, numero y caracter especial",
        )

    now = datetime.now(timezone.utc)
    reset_code = session.exec(
        select(PasswordResetCode).where(
            func.lower(PasswordResetCode.email) == email,
            PasswordResetCode.code == code,
            PasswordResetCode.used_at == None,  # noqa: E711
            PasswordResetCode.expires_at > now,
        )
    ).first()
    if not reset_code:
        raise HTTPException(status_code=400, detail="El codigo es invalido o ya expiro")

    app_user = _active_user_for_email(session, email)
    if not app_user:
        raise HTTPException(status_code=400, detail="El codigo es invalido o ya expiro")

    app_user.password_hash = hash_password(new_password)
    reset_code.used_at = now
    session.add(app_user)
    session.add(reset_code)
    session.commit()
    invalidate_app_user(app_user.id)
    return {"ok": True}
