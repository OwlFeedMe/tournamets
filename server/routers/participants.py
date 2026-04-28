import io
import re
import uuid
import unicodedata
from datetime import date
from pathlib import Path
from typing import List, Optional

import openpyxl
import pandas as pd
from PIL import Image, UnidentifiedImageError
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Query
from fastapi.responses import StreamingResponse
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlmodel import Session, select

from auth import get_current_user_optional, get_effective_user_id, has_admin_access, invalidate_user, is_end_user, require_admin, require_auth
from constants import AthleteProfileVisibility
from database import get_session
from models import AthleteUsernameAlias, Competition, CompetitionParticipant, CompetitionPhase, Gym, GymMembership, Participant, ParticipantCreate, ParticipantUpdate, ParticipantProfile, ParticipantSelfUpdate, Result
from services.athlete_profiles import build_default_display_name, build_public_username_seed, ensure_unique_username, find_user_by_alias, find_user_by_username, is_reserved_username, is_sensitive_username, is_username_available, is_username_format_valid, normalize_requested_username, suggest_usernames


def _normalize(s: str) -> str:
    """Strip accents and lowercase — e.g. 'Categoría' → 'categoria'."""
    return "".join(
        c for c in unicodedata.normalize("NFKD", s) if not unicodedata.combining(c)
    ).lower().strip()


def _read_df(content: bytes, filename: str) -> pd.DataFrame:
    if filename.endswith(".csv"):
        for enc in ("utf-8-sig", "utf-8", "windows-1252", "latin-1"):
            try:
                df = pd.read_csv(
                    io.BytesIO(content),
                    dtype=str,
                    sep=None,          # auto-detect ; vs ,
                    engine="python",
                    encoding=enc,
                    on_bad_lines="skip",
                )
                return df
            except (UnicodeDecodeError, Exception):
                continue
        raise ValueError("No se pudo leer el CSV con ninguna codificación conocida")
    elif filename.endswith((".xlsx", ".xls")):
        return pd.read_excel(io.BytesIO(content), dtype=str)
    else:
        raise ValueError("Formato no soportado. Use CSV o Excel (.xlsx/.xls)")

users_router = APIRouter(prefix="/api/users", tags=["users"])
PROFILE_PHOTO_DIR = Path(__file__).resolve().parents[1] / "uploads" / "profile_photos"
PROFILE_PHOTO_DIR.mkdir(parents=True, exist_ok=True)
MAX_PROFILE_PHOTO_SIZE = 512
VALID_GENEROS = {"M", "F", "Otro"}
PENDING_CEDULA_PREFIX = "pending:"
TEXT_ONLY_REGEX = re.compile(r"^[A-Za-zÁÉÍÓÚáéíóúÑñÜü\s]+$")
BASIC_EMAIL_REGEX = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")


def _sync_genero_fields(data: dict) -> dict:
    genero = data.get("genero")
    sexo = data.get("sexo")
    if genero and not sexo:
        data["sexo"] = genero
    elif sexo and not genero:
        data["genero"] = sexo
    return data


def _is_pending_cedula(value: str | None) -> bool:
    return bool(value and value.startswith(PENDING_CEDULA_PREFIX))


def _validate_participant_payload(data: dict) -> None:
    cedula = data.get("cedula")
    nombre = data.get("nombre")
    apellido = data.get("apellido")
    email = data.get("email")
    celular = data.get("celular")
    genero = data.get("genero") or data.get("sexo")

    if cedula is not None and cedula != "" and not _is_pending_cedula(cedula) and not str(cedula).isdigit():
        raise HTTPException(400, "La cedula debe contener solo numeros")
    if nombre is not None and nombre != "" and not TEXT_ONLY_REGEX.fullmatch(str(nombre)):
        raise HTTPException(400, "El nombre solo puede tener letras y espacios")
    if apellido is not None and apellido != "" and not TEXT_ONLY_REGEX.fullmatch(str(apellido)):
        raise HTTPException(400, "El apellido solo puede tener letras y espacios")
    if email is not None and email != "" and not BASIC_EMAIL_REGEX.fullmatch(str(email).lower()):
        raise HTTPException(400, "Ingresa un email valido")
    if celular is not None and celular != "" and not str(celular).isdigit():
        raise HTTPException(400, "El celular debe contener solo numeros")
    if genero is not None and genero != "" and genero not in VALID_GENEROS:
        raise HTTPException(400, "Selecciona un genero valido")


def _sync_account_fields(participant: Participant, session: Session | None = None) -> int | None:
    participant.display_name = str(participant.display_name or "").strip() or build_default_display_name(participant)
    if participant.username and not is_sensitive_username(participant.username, cedula=participant.cedula):
        participant.username = normalize_requested_username(participant.username)
    elif session is not None:
        participant.username = ensure_unique_username(
            session,
            build_public_username_seed(participant),
            exclude_user_id=participant.id,
        )
    return int(participant.id) if participant.id is not None else None


def _validate_requested_username(session: Session, participant: Participant, raw_username: str | None) -> str:
    normalized = normalize_requested_username(raw_username or build_public_username_seed(participant))
    if is_reserved_username(normalized):
        raise HTTPException(400, "Ese username no esta disponible")
    if not is_username_format_valid(normalized):
        raise HTTPException(400, "El username solo puede usar letras, numeros, puntos y guion bajo")
    if not is_username_available(session, normalized, exclude_user_id=participant.id):
        raise HTTPException(409, "Ese username ya esta en uso")
    return normalized


def _maybe_create_username_alias(session: Session, participant: Participant, previous_username: str | None) -> None:
    old_value = str(previous_username or "").strip().lower()
    new_value = str(participant.username or "").strip().lower()
    if not old_value or old_value == new_value:
        return
    alias = session.exec(
        select(AthleteUsernameAlias).where(AthleteUsernameAlias.alias == old_value)
    ).first()
    if alias and int(alias.user_id or 0) != int(participant.id or 0):
        raise HTTPException(409, "Ese username historico ya esta en uso")
    if not alias:
        session.add(AthleteUsernameAlias(user_id=int(participant.id), alias=old_value))


def _compute_public_age(participant: Participant) -> Optional[int]:
    if not participant.fecha_nacimiento:
        return None
    today = date.today()
    years = today.year - participant.fecha_nacimiento.year
    if (today.month, today.day) < (participant.fecha_nacimiento.month, participant.fecha_nacimiento.day):
        years -= 1
    return years if years >= 0 else None


def _resolve_primary_gym(session: Session, participant_id: int) -> Optional[dict]:
    rows = session.exec(
        select(GymMembership, Gym)
        .join(Gym, Gym.id == GymMembership.gym_id)
        .where(
            GymMembership.user_id == participant_id,
            GymMembership.status.in_(["declared", "pending_approval", "approved"]),
        )
        .order_by(GymMembership.is_primary.desc(), GymMembership.approved_at.desc(), GymMembership.requested_at.desc())
    ).all()
    if not rows:
        return None
    membership, gym = rows[0]
    return {
        "id": gym.id,
        "slug": gym.slug,
        "display_name": gym.display_name,
        "city": gym.city,
        "status": membership.status,
        "is_primary": bool(membership.is_primary),
    }


def _public_results(session: Session, participant_id: int, limit: int = 24) -> list[dict]:
    rows = session.exec(
        select(Result, Competition, CompetitionPhase)
        .join(Competition, Competition.id == Result.competition_id)
        .join(CompetitionPhase, CompetitionPhase.id == Result.phase_id, isouter=True)
        .where(Result.user_id == participant_id)
        .order_by(Result.created_at.desc(), Result.id.desc())
    ).all()
    items: list[dict] = []
    for result, competition, phase in rows[:limit]:
        items.append({
            "id": result.id,
            "competition_id": result.competition_id,
            "competition_name": competition.nombre if competition else "Competencia",
            "competition_slug": competition.slug if competition else None,
            "phase_name": phase.nombre if phase else None,
            "measurement_method": getattr(phase, "measurement_method", None) if phase else None,
            "puntos": result.puntos,
            "marca": result.marca,
            "posicion": result.posicion,
            "created_at": result.created_at.isoformat() if result.created_at else None,
        })
    return items


def _serialize_public_profile(session: Session, participant: Participant, requested_username: Optional[str] = None) -> dict:
    results = _public_results(session, int(participant.id), limit=24) if int(participant.public_show_results or 0) else []
    enrollments = session.exec(
        select(CompetitionParticipant).where(CompetitionParticipant.user_id == int(participant.id))
    ).all()
    return {
        "id": participant.id,
        "username": participant.username,
        "requested_username": requested_username or participant.username,
        "is_alias": bool(requested_username and requested_username != participant.username),
        "canonical_path": f"/a/{participant.username}",
        "display_name": participant.display_name or build_default_display_name(participant),
        "avatar_url": participant.profile_photo_url,
        "cover_url": participant.public_cover_url,
        "bio": participant.public_bio,
        "categoria": participant.categoria,
        "city": participant.ciudad_pais if int(participant.public_show_city or 0) else None,
        "age": _compute_public_age(participant) if int(participant.public_show_age or 0) else None,
        "gym": _resolve_primary_gym(session, int(participant.id)) if int(participant.public_show_gym or 0) else None,
        "verified_athlete": bool(participant.verified_athlete),
        "results": results,
        "stats": {
            "competitions_count": len({int(item.competition_id) for item in enrollments}),
            "results_count": len(results),
            "total_points": int(sum(int(item.get("puntos") or 0) for item in results)),
            "top_three_finishes": sum(1 for item in results if item.get("posicion") and int(item["posicion"]) <= 3),
        },
        "meta": {
            "title": f"{participant.display_name or build_default_display_name(participant)} · FinalRep",
            "description": participant.public_bio or f"Perfil publico de {participant.display_name or build_default_display_name(participant)} en FinalRep.",
            "indexable": bool(participant.public_profile_indexable),
        },
    }


def _parse_optional_date(value) -> Optional[date]:
    if value is None or pd.isna(value):
        return None
    raw = str(value).strip()
    if not raw:
        return None
    parsed = pd.to_datetime(raw, errors="coerce")
    if pd.isna(parsed):
        return None
    return parsed.date()


def _delete_local_profile_photo(photo_url: Optional[str]) -> None:
    if not photo_url or not photo_url.startswith("/uploads/profile_photos/"):
        return
    target = PROFILE_PHOTO_DIR / photo_url.rsplit("/", 1)[-1]
    try:
        if target.exists():
            target.unlink()
    except OSError:
        pass


def _process_profile_photo(file: UploadFile, user_id: int) -> str:
    # TODO: migrate this local upload flow to S3-compatible object storage.
    if not (file.content_type or "").startswith("image/"):
        raise HTTPException(400, "El archivo debe ser una imagen")

    try:
        raw = file.file.read()
        image = Image.open(io.BytesIO(raw)).convert("RGB")
    except (UnidentifiedImageError, OSError):
        raise HTTPException(400, "No se pudo procesar la imagen")

    width, height = image.size
    crop_size = min(width, height)
    left = int((width - crop_size) / 2)
    top = int((height - crop_size) / 2)
    image = image.crop((left, top, left + crop_size, top + crop_size))
    image = image.resize((MAX_PROFILE_PHOTO_SIZE, MAX_PROFILE_PHOTO_SIZE), Image.Resampling.LANCZOS)

    filename = f"user_{user_id}_{uuid.uuid4().hex}.jpg"
    output_path = PROFILE_PHOTO_DIR / filename
    image.save(output_path, format="JPEG", quality=84, optimize=True)
    return f"/uploads/profile_photos/{filename}"


@users_router.get("/me", response_model=ParticipantProfile)
def get_my_profile(session: Session = Depends(get_session), user=Depends(require_auth)):
    user_id = get_effective_user_id(user)
    if not is_end_user(user) or user_id is None:
        raise HTTPException(403, "Solo usuarios")
    p = session.get(Participant, user_id)
    if not p:
        raise HTTPException(404, "Participante no encontrado")
    return p


@users_router.get("/username-availability")
def username_availability(
    username: str = Query(..., min_length=3),
    session: Session = Depends(get_session),
    user=Depends(get_current_user_optional),
):
    exclude_user_id = get_effective_user_id(user) if user and is_end_user(user) else None
    normalized = normalize_requested_username(username)
    available = is_username_available(session, normalized, exclude_user_id=exclude_user_id)
    return {
        "requested": username,
        "normalized": normalized,
        "available": available,
        "suggestions": [] if available else suggest_usernames(session, normalized, exclude_user_id=exclude_user_id),
    }


@users_router.patch("/me", response_model=ParticipantProfile)
def update_my_profile(
    body: ParticipantSelfUpdate,
    session: Session = Depends(get_session),
    user=Depends(require_auth),
):
    user_id = get_effective_user_id(user)
    if not is_end_user(user) or user_id is None:
        raise HTTPException(403, "Solo usuarios")
    p = session.get(Participant, user_id)
    if not p:
        raise HTTPException(404, "Participante no encontrado")

    payload = _sync_genero_fields(body.model_dump(exclude_unset=True))
    _validate_participant_payload(payload)

    for field, value in payload.items():
        setattr(p, field, value)

    changed_app_user_id = _sync_account_fields(p, session)

    session.add(p)
    try:
        session.commit()
        session.refresh(p)
    except IntegrityError:
        session.rollback()
        raise HTTPException(409, "Ya existe una cuenta con ese email o esa cédula")
    invalidate_user(changed_app_user_id)
    return p


@users_router.post("/me/photo", response_model=ParticipantProfile)
def upload_my_profile_photo(
    file: UploadFile = File(...),
    session: Session = Depends(get_session),
    user=Depends(require_auth),
):
    user_id = get_effective_user_id(user)
    if not is_end_user(user) or user_id is None:
        raise HTTPException(403, "Solo usuarios")

    participant = session.get(Participant, user_id)
    if not participant:
        raise HTTPException(404, "Participante no encontrado")

    previous_photo = participant.profile_photo_url
    participant.profile_photo_url = _process_profile_photo(file, user_id)
    session.add(participant)
    session.commit()
    session.refresh(participant)
    _delete_local_profile_photo(previous_photo)
    return participant


@users_router.patch("/me/public-profile", response_model=ParticipantProfile)
def update_my_public_profile(
    body: ParticipantSelfUpdate,
    session: Session = Depends(get_session),
    user=Depends(require_auth),
):
    user_id = get_effective_user_id(user)
    if not is_end_user(user) or user_id is None:
        raise HTTPException(403, "Solo usuarios")
    participant = session.get(Participant, user_id)
    if not participant:
        raise HTTPException(404, "Participante no encontrado")

    payload = body.model_dump(exclude_unset=True)
    previous_username = participant.username
    if "public_profile_visibility" in payload and payload["public_profile_visibility"] not in AthleteProfileVisibility.ALL:
        raise HTTPException(400, "La visibilidad del perfil no es valida")
    if "display_name" in payload:
        payload["display_name"] = str(payload["display_name"] or "").strip() or build_default_display_name(participant)
    if "username" in payload:
        payload["username"] = _validate_requested_username(session, participant, payload.get("username"))

    for field in (
        "username",
        "display_name",
        "public_profile_enabled",
        "public_profile_indexable",
        "public_profile_visibility",
        "public_bio",
        "public_cover_url",
        "public_show_city",
        "public_show_gym",
        "public_show_age",
        "public_show_results",
    ):
        if field in payload:
            setattr(participant, field, payload[field])

    if int(participant.public_profile_enabled or 0) and not participant.username:
        participant.username = _validate_requested_username(
            session,
            participant,
            build_public_username_seed(participant),
        )

    changed_app_user_id = _sync_account_fields(participant, session)
    session.add(participant)
    try:
        session.flush()
        _maybe_create_username_alias(session, participant, previous_username)
        session.commit()
        session.refresh(participant)
    except IntegrityError:
        session.rollback()
        raise HTTPException(409, "Ya existe una cuenta con ese username")
    invalidate_user(changed_app_user_id)
    return participant


@users_router.get("/public/{username}")
def get_public_profile(
    username: str,
    session: Session = Depends(get_session),
    user=Depends(get_current_user_optional),
):
    normalized = normalize_requested_username(username)
    participant = find_user_by_username(session, normalized)
    if not participant:
        participant = find_user_by_alias(session, normalized)
    if not participant:
        raise HTTPException(404, "Atleta no encontrado")

    requester_user_id = get_effective_user_id(user) if user and is_end_user(user) else None
    is_owner_preview = requester_user_id == int(participant.id or 0)
    is_admin_preview = has_admin_access(user)
    is_public = bool(
        int(participant.public_profile_enabled or 0)
        and participant.public_profile_visibility == AthleteProfileVisibility.PUBLIC
    )
    if not is_public and not is_owner_preview and not is_admin_preview:
        raise HTTPException(404, "Atleta no encontrado")

    return _serialize_public_profile(session, participant, requested_username=normalized)


@users_router.get("", response_model=List[Participant])
def list_participants(session: Session = Depends(get_session), _=Depends(require_admin)):
    return session.exec(
        select(Participant).order_by(Participant.apellido, Participant.nombre)
    ).all()


@users_router.get("/admin")
def list_admin_users(session: Session = Depends(get_session), _=Depends(require_admin)):
    participants = session.exec(select(Participant).order_by(Participant.apellido, Participant.nombre)).all()
    items = []
    for participant in participants:
        extra_role = None
        if int(participant.admin_enabled or 0):
            extra_role = "admin"
        elif int(participant.organizer_enabled or 0):
            extra_role = "organizer"
        elif int(participant.judge_enabled or 0):
            extra_role = "judge"

        payload = participant.model_dump()
        payload["user_id"] = participant.id
        payload["username"] = participant.username
        payload["display_name"] = participant.display_name
        payload["base_role"] = participant.role or "user"
        payload["extra_role"] = extra_role
        payload["organizer_enabled"] = bool(int(participant.organizer_enabled or 0))
        payload["judge_enabled"] = bool(int(participant.judge_enabled or 0))
        payload["admin_enabled"] = bool(int(participant.admin_enabled or 0))
        items.append(payload)
    return items


@users_router.put("/{user_id}/role")
def update_participant_role(
    user_id: int,
    body: dict,
    session: Session = Depends(get_session),
    _=Depends(require_admin),
):
    participant = session.get(Participant, user_id)
    if not participant:
        raise HTTPException(404, "Usuario no encontrado")

    extra_role = str(body.get("extra_role") or "").strip().lower()
    if extra_role not in {"", "user", "organizer", "judge", "admin"}:
        raise HTTPException(400, "Rol invalido")

    participant.role = "user"
    participant.organizer_enabled = 1 if extra_role == "organizer" else 0
    participant.judge_enabled = 1 if extra_role == "judge" else 0
    participant.admin_enabled = 1 if extra_role == "admin" else 0
    session.add(participant)
    session.commit()
    invalidate_user(participant.id)

    return {
        "ok": True,
        "user_id": user_id,
        "extra_role": extra_role if extra_role not in {"", "user"} else None,
    }


@users_router.get("/{user_id}", response_model=Participant)
def get_participant(user_id: int, session: Session = Depends(get_session), _=Depends(require_admin)):
    p = session.get(Participant, user_id)
    if not p:
        raise HTTPException(404, "Participante no encontrado")
    return p


@users_router.post("", response_model=Participant, status_code=201)
def create_participant(body: ParticipantCreate, session: Session = Depends(get_session), _=Depends(require_admin)):
    payload = _sync_genero_fields(body.model_dump())
    _validate_participant_payload(payload)
    payload["display_name"] = f"{str(payload.get('nombre') or '').strip()} {str(payload.get('apellido') or '').strip()}".strip() or "Atleta"
    payload["username"] = ensure_unique_username(session, payload["display_name"])
    participant = Participant.model_validate(payload)
    session.add(participant)
    try:
        session.commit()
        session.refresh(participant)
        return participant
    except IntegrityError:
        session.rollback()
        raise HTTPException(409, "Ya existe una cuenta con ese email o esa cédula")


@users_router.put("/{user_id}", response_model=Participant)
def update_participant(user_id: int, body: ParticipantUpdate,
                       session: Session = Depends(get_session), _=Depends(require_admin)):
    p = session.get(Participant, user_id)
    if not p:
        raise HTTPException(404, "Participante no encontrado")

    payload = _sync_genero_fields(body.model_dump(exclude_unset=True))
    _validate_participant_payload(payload)

    for field, value in payload.items():
        setattr(p, field, value)

    changed_app_user_id = _sync_account_fields(p, session)

    session.add(p)
    try:
        session.commit()
        session.refresh(p)
    except IntegrityError:
        session.rollback()
        raise HTTPException(409, "Ya existe una cuenta con ese email o esa cédula")
    invalidate_user(changed_app_user_id)
    return p


@users_router.delete("/{user_id}", status_code=204)
def delete_participant(user_id: int, session: Session = Depends(get_session), _=Depends(require_admin)):
    p = session.get(Participant, user_id)
    if p:
        session.delete(p)
        session.commit()


@users_router.get("/template")
def download_template(_=Depends(require_admin)):
    """Descarga un Excel de ejemplo con las columnas esperadas para la carga masiva."""
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Participantes"

    headers = [
        "cedula", "nombre", "apellido", "email", "celular", "genero",
        "categoria", "box", "talla_camiseta", "fecha_nacimiento", "ciudad_pais",
    ]
    ws.append(headers)
    ws.append(["12345678", "María", "González", "maria@email.com", "3001234567", "F", "Rx", "FinalRep North", "M", "1995-06-15", "Bogota/Colombia"])

    # Bold header row
    from openpyxl.styles import Font
    for cell in ws[1]:
        cell.font = Font(bold=True)

    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)

    return StreamingResponse(
        buf,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": "attachment; filename=template_participantes.xlsx"},
    )


@users_router.post("/import", status_code=201)
def import_participants(
    file: UploadFile = File(...),
    competition_id: Optional[int] = Query(None),
    session: Session = Depends(get_session),
    _=Depends(require_admin),
):
    content = file.file.read()
    filename = file.filename.lower()

    try:
        df = _read_df(content, filename)
    except ValueError as e:
        raise HTTPException(400, str(e))
    except Exception as e:
        raise HTTPException(400, f"Error leyendo archivo: {e}")

    # Normalize column names: strip accents, lowercase, trim
    df.columns = [_normalize(c) for c in df.columns]

    # Drop unnamed/empty columns
    df = df.loc[:, ~df.columns.str.startswith("unnamed")]

    # If no 'cedula' column, fall back to 'celular'
    if "cedula" not in df.columns:
        if "celular" in df.columns:
            df["cedula"] = df["celular"]
        else:
            raise HTTPException(400, "Columna 'cedula' no encontrada (ni 'celular' como alternativa)")

    missing = {"cedula", "nombre", "apellido"} - set(df.columns)
    if missing:
        raise HTTPException(400, f"Columnas requeridas faltantes: {missing}")

    inserted, skipped = 0, []

    def _clean(val) -> str:
        return "".join(c for c in str(val or "").strip() if c.isprintable()).strip()

    for _, row in df.iterrows():
        cedula   = _clean(row.get("cedula"))
        nombre   = _clean(row.get("nombre"))
        apellido = _clean(row.get("apellido"))
        if not cedula or not nombre or not apellido:
            continue

        participant = Participant(
            cedula=cedula,
            nombre=nombre,
            apellido=apellido,
            email=str(row.get("email",     "") or "").strip() or None,
            celular=str(row.get("celular", "") or "").strip() or None,
            sexo=str(row.get("sexo",       "") or row.get("genero", "") or "").strip() or None,
            genero=str(row.get("genero",   "") or row.get("sexo",   "") or "").strip() or None,
            categoria=str(row.get("categoria", "") or "").strip() or None,
            box=str(row.get("box", "") or "").strip() or None,
            talla_camiseta=str(row.get("talla_camiseta", "") or row.get("talla", "") or "").strip() or None,
            fecha_nacimiento=_parse_optional_date(row.get("fecha_nacimiento")),
            ciudad_pais=str(row.get("ciudad_pais", "") or row.get("ciudad/pais", "") or "").strip() or None,
            estado=str(row.get("estado",   "activo") or "activo").strip(),
        )
        try:
            with session.begin_nested():   # savepoint — rollback only this row on error
                session.add(participant)
                session.flush()
            inserted += 1
        except IntegrityError:
            skipped.append(cedula)

    session.commit()

    # Auto-enroll in competition if requested
    enrolled = 0
    if competition_id:
        # Re-fetch inserted participants to get their IDs
        all_p = session.exec(select(Participant)).all()
        cedulas_inserted = {
            _clean(row.get("cedula")) for _, row in df.iterrows()
            if _clean(row.get("cedula")) not in skipped
        }
        for p in all_p:
            if p.cedula in cedulas_inserted:
                existing_cp = session.get(CompetitionParticipant, (competition_id, p.id))
                if not existing_cp:
                    session.add(CompetitionParticipant(
                        competition_id=competition_id, user_id=p.id
                    ))
                    enrolled += 1
        session.commit()

    return {"inserted": inserted, "skipped": skipped, "enrolled": enrolled}
