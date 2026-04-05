import io
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

from auth import get_effective_participant_id, is_end_user, require_admin, require_auth
from database import get_session
from models import Participant, ParticipantCreate, ParticipantUpdate, ParticipantProfile, ParticipantSelfUpdate, CompetitionParticipant


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


def _sync_genero_fields(data: dict) -> dict:
    genero = data.get("genero")
    sexo = data.get("sexo")
    if genero and not sexo:
        data["sexo"] = genero
    elif sexo and not genero:
        data["genero"] = sexo
    return data


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

    for field, value in _sync_genero_fields(body.model_dump(exclude_unset=True)).items():
        setattr(p, field, value)

    session.add(p)
    try:
        session.commit()
        session.refresh(p)
        return p
    except IntegrityError:
        session.rollback()
        raise HTTPException(409, "Ya existe un participante con esa cédula")


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


@router.get("/{participant_id}", response_model=Participant)
def get_participant(participant_id: int, session: Session = Depends(get_session), _=Depends(require_admin)):
    p = session.get(Participant, participant_id)
    if not p:
        raise HTTPException(404, "Participante no encontrado")
    return p


@router.post("", response_model=Participant, status_code=201)
def create_participant(body: ParticipantCreate, session: Session = Depends(get_session), _=Depends(require_admin)):
    participant = Participant.model_validate(_sync_genero_fields(body.model_dump()))
    session.add(participant)
    try:
        session.commit()
        session.refresh(participant)
        return participant
    except IntegrityError:
        session.rollback()
        raise HTTPException(409, f"Ya existe un participante con cédula {body.cedula}")


@router.put("/{participant_id}", response_model=Participant)
def update_participant(participant_id: int, body: ParticipantUpdate,
                       session: Session = Depends(get_session), _=Depends(require_admin)):
    p = session.get(Participant, participant_id)
    if not p:
        raise HTTPException(404, "Participante no encontrado")

    for field, value in _sync_genero_fields(body.model_dump(exclude_unset=True)).items():
        setattr(p, field, value)

    session.add(p)
    try:
        session.commit()
        session.refresh(p)
        return p
    except IntegrityError:
        session.rollback()
        raise HTTPException(409, "Ya existe un participante con esa cédula")


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
