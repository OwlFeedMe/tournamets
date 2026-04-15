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
from sqlalchemy.exc import IntegrityError
from sqlmodel import Session, select

from auth import get_effective_participant_id, invalidate_app_user, is_end_user, require_admin, require_auth
from database import get_session
from models import AppUser, Participant, ParticipantCreate, ParticipantUpdate, ParticipantProfile, ParticipantSelfUpdate, CompetitionParticipant


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

router = APIRouter(prefix="/api/participants", tags=["participants"])
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


def _sync_app_user_username(session: Session, participant: Participant) -> int | None:
    """Actualiza username del AppUser al email del participante.

    Retorna el id del AppUser modificado (para invalidar cache post-commit),
    o None si no hubo cambio.
    """
    normalized_email = (participant.email or "").strip().lower()
    if not normalized_email:
        return None
    app_user = session.exec(select(AppUser).where(AppUser.participant_id == participant.id)).first()
    if not app_user or app_user.username == normalized_email:
        return None
    app_user.username = normalized_email
    session.add(app_user)
    return int(app_user.id) if app_user.id is not None else None


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


def _process_profile_photo(file: UploadFile, participant_id: int) -> str:
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

    filename = f"participant_{participant_id}_{uuid.uuid4().hex}.jpg"
    output_path = PROFILE_PHOTO_DIR / filename
    image.save(output_path, format="JPEG", quality=84, optimize=True)
    return f"/uploads/profile_photos/{filename}"


@router.get("/me", response_model=ParticipantProfile)
def get_my_profile(session: Session = Depends(get_session), user=Depends(require_auth)):
    participant_id = get_effective_participant_id(user)
    if not is_end_user(user) or participant_id is None:
        raise HTTPException(403, "Solo usuarios")
    p = session.get(Participant, participant_id)
    if not p:
        raise HTTPException(404, "Participante no encontrado")
    return p


@router.patch("/me", response_model=ParticipantProfile)
def update_my_profile(
    body: ParticipantSelfUpdate,
    session: Session = Depends(get_session),
    user=Depends(require_auth),
):
    participant_id = get_effective_participant_id(user)
    if not is_end_user(user) or participant_id is None:
        raise HTTPException(403, "Solo usuarios")
    p = session.get(Participant, participant_id)
    if not p:
        raise HTTPException(404, "Participante no encontrado")

    payload = _sync_genero_fields(body.model_dump(exclude_unset=True))
    _validate_participant_payload(payload)

    for field, value in payload.items():
        setattr(p, field, value)

    changed_app_user_id = _sync_app_user_username(session, p)

    session.add(p)
    try:
        session.commit()
        session.refresh(p)
    except IntegrityError:
        session.rollback()
        raise HTTPException(409, "Ya existe una cuenta con ese email o esa cédula")
    invalidate_app_user(changed_app_user_id)
    return p


@router.post("/me/photo", response_model=ParticipantProfile)
def upload_my_profile_photo(
    file: UploadFile = File(...),
    session: Session = Depends(get_session),
    user=Depends(require_auth),
):
    participant_id = get_effective_participant_id(user)
    if not is_end_user(user) or participant_id is None:
        raise HTTPException(403, "Solo usuarios")

    participant = session.get(Participant, participant_id)
    if not participant:
        raise HTTPException(404, "Participante no encontrado")

    previous_photo = participant.profile_photo_url
    participant.profile_photo_url = _process_profile_photo(file, participant_id)
    session.add(participant)
    session.commit()
    session.refresh(participant)
    _delete_local_profile_photo(previous_photo)
    return participant


@router.get("", response_model=List[Participant])
def list_participants(session: Session = Depends(get_session), _=Depends(require_admin)):
    return session.exec(
        select(Participant).order_by(Participant.apellido, Participant.nombre)
    ).all()


@router.get("/admin-users")
def list_admin_users(session: Session = Depends(get_session), _=Depends(require_admin)):
    participants = session.exec(
        select(Participant).order_by(Participant.apellido, Participant.nombre)
    ).all()
    app_users = {
        item.participant_id: item
        for item in session.exec(select(AppUser).where(AppUser.participant_id.is_not(None))).all()
        if item.participant_id is not None
    }

    items = []
    for participant in participants:
        app_user = app_users.get(participant.id)
        extra_role = None
        if app_user:
            if int(app_user.admin_enabled or 0):
                extra_role = "admin"
            elif int(app_user.organizer_enabled or 0):
                extra_role = "organizer"
            elif int(app_user.judge_enabled or 0):
                extra_role = "judge"

        payload = participant.model_dump()
        payload["app_user_id"] = app_user.id if app_user else None
        payload["username"] = app_user.username if app_user else None
        payload["display_name"] = app_user.display_name if app_user else None
        payload["base_role"] = app_user.role if app_user else "user"
        payload["extra_role"] = extra_role
        payload["organizer_enabled"] = bool(app_user and int(app_user.organizer_enabled or 0))
        payload["judge_enabled"] = bool(app_user and int(app_user.judge_enabled or 0))
        payload["admin_enabled"] = bool(app_user and int(app_user.admin_enabled or 0))
        items.append(payload)
    return items


@router.put("/{participant_id}/role")
def update_participant_role(
    participant_id: int,
    body: dict,
    session: Session = Depends(get_session),
    _=Depends(require_admin),
):
    participant = session.get(Participant, participant_id)
    if not participant:
        raise HTTPException(404, "Usuario no encontrado")

    extra_role = str(body.get("extra_role") or "").strip().lower()
    if extra_role not in {"", "user", "organizer", "judge", "admin"}:
        raise HTTPException(400, "Rol invalido")

    app_user = session.exec(select(AppUser).where(AppUser.participant_id == participant_id)).first()
    if not app_user:
        raise HTTPException(404, "Cuenta de app no encontrada")

    app_user.role = "user"
    app_user.organizer_enabled = 1 if extra_role == "organizer" else 0
    app_user.judge_enabled = 1 if extra_role == "judge" else 0
    app_user.admin_enabled = 1 if extra_role == "admin" else 0
    session.add(app_user)
    session.commit()
    invalidate_app_user(app_user.id)

    return {
        "ok": True,
        "participant_id": participant_id,
        "extra_role": extra_role if extra_role not in {"", "user"} else None,
    }


@router.get("/{participant_id}", response_model=Participant)
def get_participant(participant_id: int, session: Session = Depends(get_session), _=Depends(require_admin)):
    p = session.get(Participant, participant_id)
    if not p:
        raise HTTPException(404, "Participante no encontrado")
    return p


@router.post("", response_model=Participant, status_code=201)
def create_participant(body: ParticipantCreate, session: Session = Depends(get_session), _=Depends(require_admin)):
    payload = _sync_genero_fields(body.model_dump())
    _validate_participant_payload(payload)
    participant = Participant.model_validate(payload)
    session.add(participant)
    try:
        session.commit()
        session.refresh(participant)
        return participant
    except IntegrityError:
        session.rollback()
        raise HTTPException(409, "Ya existe una cuenta con ese email o esa cédula")


@router.put("/{participant_id}", response_model=Participant)
def update_participant(participant_id: int, body: ParticipantUpdate,
                       session: Session = Depends(get_session), _=Depends(require_admin)):
    p = session.get(Participant, participant_id)
    if not p:
        raise HTTPException(404, "Participante no encontrado")

    payload = _sync_genero_fields(body.model_dump(exclude_unset=True))
    _validate_participant_payload(payload)

    for field, value in payload.items():
        setattr(p, field, value)

    changed_app_user_id = _sync_app_user_username(session, p)

    session.add(p)
    try:
        session.commit()
        session.refresh(p)
    except IntegrityError:
        session.rollback()
        raise HTTPException(409, "Ya existe una cuenta con ese email o esa cédula")
    invalidate_app_user(changed_app_user_id)
    return p


@router.delete("/{participant_id}", status_code=204)
def delete_participant(participant_id: int, session: Session = Depends(get_session), _=Depends(require_admin)):
    p = session.get(Participant, participant_id)
    if p:
        session.delete(p)
        session.commit()


@router.get("/template")
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


@router.post("/import", status_code=201)
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
                        competition_id=competition_id, participant_id=p.id
                    ))
                    enrolled += 1
        session.commit()

    return {"inserted": inserted, "skipped": skipped, "enrolled": enrolled}
