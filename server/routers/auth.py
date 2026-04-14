import re
import uuid

from fastapi import APIRouter, Body, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlmodel import Session, select

from auth import ADMIN_ID, ADMIN_PASSWORD, create_access_token, get_current_user, hash_password, verify_password
from constants import EstadoParticipante, Role
from database import get_session
from models import AppUser, MeResponse, Participant, TokenResponse

router = APIRouter(prefix="/api/auth", tags=["auth"])

VALID_APP_ROLES = Role.APP_ROLES
VALID_GENEROS = {"M", "F", "Otro"}
PENDING_CEDULA_PREFIX = "pending:"
TEXT_ONLY_REGEX = re.compile(r"^[A-Za-zÁÉÍÓÚáéíóúÑñÜü\s]+$")
BASIC_EMAIL_REGEX = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")
STRONG_PASSWORD_REGEX = re.compile(r"^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z\d]).{8,}$")


def _session_token_payload(
    *,
    role: str,
    display_name: str,
    username: str | None = None,
    app_user_id: int | None = None,
    participant_id: int | None = None,
    organizer_enabled: bool = False,
    legacy_role: str | None = None,
) -> dict:
    sub = f"app:{app_user_id}" if app_user_id is not None else (str(participant_id) if participant_id is not None else role)
    payload = {
        "sub": sub,
        "role": role,
        "display_name": display_name,
    }
    if username is not None:
        payload["username"] = username
    if app_user_id is not None:
        payload["app_user_id"] = app_user_id
    if participant_id is not None:
        payload["participant_id"] = participant_id
    payload["organizer_enabled"] = bool(organizer_enabled)
    if legacy_role is not None:
        payload["legacy_role"] = legacy_role
    return payload


def _token_response(payload: dict) -> TokenResponse:
    return TokenResponse(
        access_token=create_access_token(payload),
        role=payload["role"],
        display_name=payload.get("display_name"),
        nombre=payload.get("display_name"),
        username=payload.get("username"),
        app_user_id=payload.get("app_user_id"),
        participant_id=payload.get("participant_id"),
        organizer_enabled=bool(payload.get("organizer_enabled")),
    )


def _me_response(payload: dict) -> MeResponse:
    return MeResponse(
        role=payload["role"],
        display_name=payload.get("display_name"),
        nombre=payload.get("display_name"),
        username=payload.get("username"),
        app_user_id=payload.get("app_user_id"),
        participant_id=payload.get("participant_id"),
        organizer_enabled=bool(payload.get("organizer_enabled")),
    )


def _active_app_user_for_identifier(session: Session, identifier: str) -> AppUser | None:
    return session.exec(
        select(AppUser).where(
            func.lower(AppUser.username) == identifier.strip().lower(),
            AppUser.is_active == 1,
            AppUser.role.in_(VALID_APP_ROLES),
        )
    ).first()


def _active_app_user_for_participant(session: Session, participant_id: int) -> AppUser | None:
    return session.exec(
        select(AppUser).where(
            AppUser.participant_id == participant_id,
            AppUser.is_active == 1,
            AppUser.role.in_(VALID_APP_ROLES),
        )
    ).first()


def _participants_for_email(session: Session, email: str, *, active_only: bool = False) -> list[Participant]:
    normalized_email = email.strip().lower()
    if not normalized_email:
        return []

    query = select(Participant).where(func.lower(Participant.email) == normalized_email)
    if active_only:
        query = query.where(Participant.estado == EstadoParticipante.ACTIVO)
    return session.exec(query).all()


def _active_participant_for_email(session: Session, email: str) -> Participant | None:
    matches = _participants_for_email(session, email, active_only=True)
    if len(matches) != 1:
        return None
    return matches[0]


def _participant_display_name(participant: Participant) -> str:
    return f"{participant.nombre} {participant.apellido}".strip()


def _is_pending_cedula(value: str | None) -> bool:
    return bool(value and value.startswith(PENDING_CEDULA_PREFIX))


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

    existing_user = _active_app_user_for_identifier(session, email)
    if existing_user:
        raise HTTPException(status_code=409, detail="Ya existe una cuenta con ese email")

    participant_matches = _participants_for_email(session, email)
    if len(participant_matches) > 1:
        raise HTTPException(status_code=409, detail="Ya existe una cuenta con ese email")

    existing_participant = participant_matches[0] if participant_matches else None
    if existing_participant:
        participant = existing_participant
        participant.nombre = nombre
        participant.apellido = apellido
        participant.email = email
        participant.celular = celular or participant.celular
        participant.genero = genero or participant.genero
        participant.sexo = participant.genero or participant.sexo
        participant.estado = EstadoParticipante.ACTIVO
        session.add(participant)
    else:
        cedula = _generate_pending_cedula()
        participant = Participant(
            cedula=cedula,
            nombre=nombre,
            apellido=apellido,
            email=email or None,
            celular=celular or None,
            genero=genero or None,
            sexo=genero or None,
            estado=EstadoParticipante.ACTIVO,
        )
        session.add(participant)

    try:
        session.commit()
        session.refresh(participant)
    except IntegrityError:
        session.rollback()
        raise HTTPException(status_code=409, detail="Ya existe una cuenta con ese email")

    app_user = AppUser(
        username=email,
        display_name=_participant_display_name(participant),
        role=Role.USER,
        password_hash=hash_password(password),
        participant_id=participant.id,
        is_active=1,
    )
    session.add(app_user)
    try:
        session.commit()
        session.refresh(app_user)
    except IntegrityError:
        session.rollback()
        raise HTTPException(status_code=409, detail="No se pudo crear la cuenta")

    payload = _session_token_payload(
        role=app_user.role,
        display_name=app_user.display_name,
        username=app_user.username,
        app_user_id=app_user.id,
        participant_id=participant.id,
        organizer_enabled=bool(app_user.organizer_enabled),
    )
    return _token_response(payload)


@router.post("/login", response_model=TokenResponse)
def login(body: dict = Body(...), session: Session = Depends(get_session)):
    identifier = str(body.get("cedula") or body.get("email") or body.get("username") or "").strip()
    password = str(body.get("password") or "")

    if not identifier or not password:
        raise HTTPException(status_code=400, detail="Correo o usuario y contrasena son obligatorios")

    # Legacy admin login remains for compatibility while app_users are introduced.
    if identifier == ADMIN_ID and password == ADMIN_PASSWORD:
        payload = _session_token_payload(
            role=Role.ADMIN,
            display_name="Administrador",
            username=ADMIN_ID,
        )
        return _token_response(payload)

    app_user = _active_app_user_for_identifier(session, identifier)
    if app_user and verify_password(password, app_user.password_hash):
        payload = _session_token_payload(
            role=app_user.role,
            display_name=app_user.display_name,
            username=app_user.username,
            app_user_id=app_user.id,
            participant_id=app_user.participant_id,
            organizer_enabled=bool(app_user.organizer_enabled),
        )
        return _token_response(payload)

    participant = _active_participant_for_email(session, identifier)

    if not participant:
        participant = session.exec(
            select(Participant).where(
                Participant.cedula == identifier,
                Participant.estado == EstadoParticipante.ACTIVO,
            )
        ).first()

    if not participant:
        raise HTTPException(status_code=401, detail="Credenciales invalidas")

    linked_user = _active_app_user_for_participant(session, participant.id)
    if linked_user and verify_password(password, linked_user.password_hash):
        payload = _session_token_payload(
            role=linked_user.role,
            display_name=linked_user.display_name,
            username=linked_user.username,
            app_user_id=linked_user.id,
            participant_id=participant.id,
            organizer_enabled=bool(linked_user.organizer_enabled),
            legacy_role="participant",
        )
        return _token_response(payload)

    if password != identifier:
        raise HTTPException(status_code=401, detail="Credenciales invalidas")

    session.add(
        AppUser(
            username=(participant.email or participant.cedula),
            display_name=_participant_display_name(participant),
            role=Role.USER,
            password_hash=hash_password(password),
            participant_id=participant.id,
            is_active=1,
        )
    )
    session.commit()
    created_user = _active_app_user_for_participant(session, participant.id)
    if created_user:
        payload = _session_token_payload(
            role=created_user.role,
            display_name=created_user.display_name,
            username=created_user.username,
            app_user_id=created_user.id,
            participant_id=participant.id,
            organizer_enabled=bool(created_user.organizer_enabled),
            legacy_role="participant",
        )
        return _token_response(payload)

    payload = _session_token_payload(
        role=Role.PARTICIPANT,
        display_name=_participant_display_name(participant),
        username=participant.email or participant.cedula,
        participant_id=participant.id,
    )
    return _token_response(payload)


@router.get("/me", response_model=MeResponse)
def me(session: Session = Depends(get_session), user=Depends(get_current_user)):
    role = user.get("role")
    if not role:
        raise HTTPException(status_code=401, detail="No autenticado")

    if role == Role.ADMIN and user.get("app_user_id") is None:
        payload = _session_token_payload(
            role=Role.ADMIN,
            display_name=user.get("display_name") or "Administrador",
            username=user.get("username") or ADMIN_ID,
        )
        return _me_response(payload)

    if role in VALID_APP_ROLES:
        app_user_id = user.get("app_user_id")
        if app_user_id is None and isinstance(user.get("sub"), str) and user["sub"].startswith("app:"):
            try:
                app_user_id = int(user["sub"].split(":", 1)[1])
            except (ValueError, IndexError):
                app_user_id = None

        app_user = session.get(AppUser, app_user_id) if app_user_id is not None else None
        if not app_user or app_user.is_active != 1:
            raise HTTPException(status_code=401, detail="Sesion invalida")

        payload = _session_token_payload(
            role=app_user.role,
            display_name=app_user.display_name,
            username=app_user.username,
            app_user_id=app_user.id,
            participant_id=app_user.participant_id,
            organizer_enabled=bool(app_user.organizer_enabled),
        )
        return _me_response(payload)

    if role == Role.PARTICIPANT:
        participant_id = user.get("participant_id")
        if participant_id is None:
            try:
                participant_id = int(user.get("sub"))
            except (TypeError, ValueError):
                participant_id = None
        participant = session.get(Participant, participant_id) if participant_id is not None else None
        if not participant:
            raise HTTPException(status_code=401, detail="Sesion invalida")

        payload = _session_token_payload(
            role=Role.PARTICIPANT,
            display_name=_participant_display_name(participant),
            username=participant.email or participant.cedula,
            participant_id=participant.id,
        )
        return _me_response(payload)

    raise HTTPException(status_code=401, detail="Sesion invalida")
