from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.exc import IntegrityError
from sqlmodel import Session, select

from auth import ADMIN_ID, ADMIN_PASSWORD, create_access_token, get_current_user, hash_password, verify_password
from database import get_session
from models import AppUser, LoginRequest, MeResponse, Participant, RegisterRequest, TokenResponse

router = APIRouter(prefix="/api/auth", tags=["auth"])

VALID_APP_ROLES = {"admin", "organizer", "user"}


def _session_token_payload(
    *,
    role: str,
    display_name: str,
    username: str | None = None,
    app_user_id: int | None = None,
    participant_id: int | None = None,
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
    )


def _me_response(payload: dict) -> MeResponse:
    return MeResponse(
        role=payload["role"],
        display_name=payload.get("display_name"),
        nombre=payload.get("display_name"),
        username=payload.get("username"),
        app_user_id=payload.get("app_user_id"),
        participant_id=payload.get("participant_id"),
    )


def _active_app_user_for_identifier(session: Session, identifier: str) -> AppUser | None:
    return session.exec(
        select(AppUser).where(
            AppUser.username == identifier,
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


def _participant_display_name(participant: Participant) -> str:
    return f"{participant.nombre} {participant.apellido}".strip()


@router.post("/register", response_model=TokenResponse, status_code=201)
def register(body: RegisterRequest, session: Session = Depends(get_session)):
    cedula = body.cedula.strip()
    nombre = body.nombre.strip()
    apellido = body.apellido.strip()
    password = body.password

    if not cedula or not nombre or not apellido or not password:
        raise HTTPException(status_code=400, detail="Completa los campos requeridos")

    existing_user = _active_app_user_for_identifier(session, cedula)
    if existing_user:
        raise HTTPException(status_code=409, detail="Ya existe un usuario con esa cedula")

    existing_participant = session.exec(
        select(Participant).where(Participant.cedula == cedula)
    ).first()
    if existing_participant:
        linked_user = _active_app_user_for_participant(session, existing_participant.id)
        if linked_user:
            raise HTTPException(status_code=409, detail="Ya existe una cuenta con esa cedula")
        participant = existing_participant
        participant.nombre = nombre
        participant.apellido = apellido
        participant.email = (body.email or "").strip() or participant.email
        participant.celular = (body.celular or "").strip() or participant.celular
        participant.genero = (body.genero or "").strip() or participant.genero
        participant.sexo = participant.genero or participant.sexo
        participant.estado = "activo"
        session.add(participant)
    else:
        participant = Participant(
            cedula=cedula,
            nombre=nombre,
            apellido=apellido,
            email=(body.email or "").strip() or None,
            celular=(body.celular or "").strip() or None,
            genero=(body.genero or "").strip() or None,
            sexo=(body.genero or "").strip() or None,
            estado="activo",
        )
        session.add(participant)

    try:
        session.commit()
        session.refresh(participant)
    except IntegrityError:
        session.rollback()
        raise HTTPException(status_code=409, detail="Ya existe una cuenta con esa cedula")

    app_user = AppUser(
        username=cedula,
        display_name=_participant_display_name(participant),
        role="user",
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
    )
    return _token_response(payload)


@router.post("/login", response_model=TokenResponse)
def login(body: LoginRequest, session: Session = Depends(get_session)):
    identifier = body.cedula.strip()
    password = body.password

    # Legacy admin login remains for compatibility while app_users are introduced.
    if identifier == ADMIN_ID and password == ADMIN_PASSWORD:
        payload = _session_token_payload(
            role="admin",
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
        )
        return _token_response(payload)

    participant = session.exec(
        select(Participant).where(
            Participant.cedula == identifier,
            Participant.estado == "activo",
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
            legacy_role="participant",
        )
        return _token_response(payload)

    if password != identifier:
        raise HTTPException(status_code=401, detail="Credenciales invalidas")

    session.add(
        AppUser(
            username=participant.cedula,
            display_name=_participant_display_name(participant),
            role="user",
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
            legacy_role="participant",
        )
        return _token_response(payload)

    payload = _session_token_payload(
        role="participant",
        display_name=_participant_display_name(participant),
        username=participant.cedula,
        participant_id=participant.id,
    )
    return _token_response(payload)


@router.get("/me", response_model=MeResponse)
def me(session: Session = Depends(get_session), user=Depends(get_current_user)):
    role = user.get("role")
    if not role:
        raise HTTPException(status_code=401, detail="No autenticado")

    if role == "admin" and user.get("app_user_id") is None:
        payload = _session_token_payload(
            role="admin",
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
        )
        return _me_response(payload)

    if role == "participant":
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
            role="participant",
            display_name=_participant_display_name(participant),
            username=participant.cedula,
            participant_id=participant.id,
        )
        return _me_response(payload)

    raise HTTPException(status_code=401, detail="Sesion invalida")
