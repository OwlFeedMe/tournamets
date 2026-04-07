import json
import io
from datetime import datetime, timezone
from pathlib import Path
import uuid

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from PIL import Image, UnidentifiedImageError
from sqlalchemy import text
from sqlmodel import Session, select

from access import require_competition_access
from auth import get_current_user, get_effective_participant_id, is_end_user, require_admin, require_auth, require_staff
from database import get_session
from models import (
    Competition, Participant, CompetitionParticipant,
    EnrollBody, SelfEnrollRequest, EnrollStatusUpdate,
)

router = APIRouter(tags=["enrollments"])
ENROLLMENT_UPLOAD_DIR = Path(__file__).resolve().parents[1] / "uploads" / "enrollment_answers"
ENROLLMENT_UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
MAX_ENROLLMENT_IMAGE_SIDE = 1600


def _parse_enrollment_questions(raw: str | None) -> list[dict]:
    if not raw:
        return []
    try:
        parsed = json.loads(raw)
    except Exception:
        return []
    if not isinstance(parsed, list):
        return []
    out = []
    for idx, item in enumerate(parsed):
        if not isinstance(item, dict):
            continue
        label = str(item.get("label") or "").strip()
        if not label:
            continue
        out.append({
            "id": str(item.get("id") or f"q_{idx + 1}").strip() or f"q_{idx + 1}",
            "label": label,
            "field_type": str(item.get("field_type") or "text").strip().lower() or "text",
            "required": 1 if item.get("required") else 0,
            "placeholder": str(item.get("placeholder") or "").strip() or None,
        })
    return out


def _process_enrollment_image(file: UploadFile, participant_id: int) -> str:
    if not (file.content_type or "").startswith("image/"):
        raise HTTPException(400, "El archivo debe ser una imagen")
    try:
        raw = file.file.read()
        image = Image.open(io.BytesIO(raw)).convert("RGB")
    except (UnidentifiedImageError, OSError):
        raise HTTPException(400, "No se pudo procesar la imagen")

    width, height = image.size
    max_side = max(width, height)
    if max_side > MAX_ENROLLMENT_IMAGE_SIDE:
        scale = MAX_ENROLLMENT_IMAGE_SIDE / max_side
        image = image.resize((max(1, int(width * scale)), max(1, int(height * scale))), Image.Resampling.LANCZOS)

    filename = f"enrollment_{participant_id}_{uuid.uuid4().hex}.jpg"
    image.save(ENROLLMENT_UPLOAD_DIR / filename, format="JPEG", quality=86, optimize=True)
    return f"/uploads/enrollment_answers/{filename}"


def _serialize_enrollment_answers(questions: list[dict], answers: list | None, extra_items: list[dict] | None = None) -> str | None:
    answer_map = {}
    for item in answers or []:
        if item is None:
            continue
        question_id = str(getattr(item, "question_id", None) or "").strip()
        value = str(getattr(item, "answer", "") or "").strip()
        if question_id:
            answer_map[question_id] = value

    normalized = []
    missing_required = []
    for question in questions:
        question_id = question["id"]
        value = answer_map.get(question_id, "").strip()
        if question.get("required") and not value:
            missing_required.append(question["label"])
        normalized.append({
            "question_id": question_id,
            "question_label": question["label"],
            "question_type": question.get("field_type") or "text",
            "answer": value,
        })
    if missing_required:
        raise HTTPException(400, f"Responde las preguntas obligatorias: {', '.join(missing_required)}")
    for item in extra_items or []:
        label = str((item or {}).get("question_label") or "").strip()
        value = str((item or {}).get("answer") or "").strip()
        if not label and not value:
            continue
        normalized.append({
            "question_id": str((item or {}).get("question_id") or "").strip() or f"extra_{len(normalized) + 1}",
            "question_label": label,
            "question_type": str((item or {}).get("question_type") or "text").strip().lower() or "text",
            "answer": value,
        })
    return json.dumps(normalized, ensure_ascii=False) if normalized else None


@router.post("/api/enrollment-answers/upload")
def upload_enrollment_answer_image(
    file: UploadFile = File(...),
    user=Depends(require_auth),
):
    participant_id = get_effective_participant_id(user)
    if not is_end_user(user) or participant_id is None:
        raise HTTPException(403, "Solo usuarios")
    return {"url": _process_enrollment_image(file, participant_id)}


@router.get("/api/competitions/{competition_id}/participants")
def list_enrolled(competition_id: int, session: Session = Depends(get_session), user=Depends(require_staff)):
    require_competition_access(session, competition_id, user)

    rows = session.exec(
        select(CompetitionParticipant, Participant)
        .join(Participant, Participant.id == CompetitionParticipant.participant_id)
        .where(CompetitionParticipant.competition_id == competition_id)
        .order_by(CompetitionParticipant.estado, Participant.apellido, Participant.nombre)
    ).all()

    return [
        {**p.model_dump(), "categoria_competencia": cp.categoria, "estado": cp.estado, "enrollment_answers": cp.enrollment_answers}
        for cp, p in rows
    ]


@router.post("/api/competitions/{competition_id}/participants", status_code=201)
def set_enrolled(
    competition_id: int,
    body: EnrollBody,
    session: Session = Depends(get_session),
    user=Depends(require_admin),
):
    require_competition_access(session, competition_id, user)

    existing_confirmed = session.exec(
        select(CompetitionParticipant)
        .where(CompetitionParticipant.competition_id == competition_id)
        .where(CompetitionParticipant.estado == "confirmado")
    ).all()
    for cp in existing_confirmed:
        session.delete(cp)
    session.flush()

    for entry in body.participants:
        if not session.get(Participant, entry.participant_id):
            raise HTTPException(404, f"Participante {entry.participant_id} no encontrado")
        existing = session.get(CompetitionParticipant, (competition_id, entry.participant_id))
        if existing:
            existing.estado = "confirmado"
            existing.categoria = entry.categoria
            session.add(existing)
        else:
            session.add(CompetitionParticipant(
                competition_id=competition_id,
                participant_id=entry.participant_id,
                categoria=entry.categoria,
                estado="confirmado",
            ))

    session.commit()
    return {"enrolled": len(body.participants)}


@router.put("/api/competitions/{competition_id}/participants/{participant_id}/status")
def update_enrollment_status(
    competition_id: int,
    participant_id: int,
    body: EnrollStatusUpdate,
    session: Session = Depends(get_session),
    user=Depends(require_staff),
):
    require_competition_access(session, competition_id, user)
    if body.estado not in ("confirmado", "rechazado", "pendiente"):
        raise HTTPException(400, "Estado inválido")
    cp = session.get(CompetitionParticipant, (competition_id, participant_id))
    if not cp:
        raise HTTPException(404, "Inscripción no encontrada")
    cp.estado = body.estado
    session.add(cp)
    session.commit()
    return {"ok": True, "estado": cp.estado}


@router.delete("/api/competitions/{competition_id}/participants/{participant_id}", status_code=204)
def unenroll(
    competition_id: int,
    participant_id: int,
    session: Session = Depends(get_session),
    user=Depends(require_staff),
):
    require_competition_access(session, competition_id, user)
    cp = session.get(CompetitionParticipant, (competition_id, participant_id))
    if cp:
        session.delete(cp)
        session.commit()


@router.post("/api/competitions/{competition_id}/enroll", status_code=201)
def self_enroll(
    competition_id: int,
    body: SelfEnrollRequest,
    session: Session = Depends(get_session),
    user=Depends(require_auth),
):
    participant_id = get_effective_participant_id(user)
    if not is_end_user(user) or participant_id is None:
        raise HTTPException(403, "Solo usuarios")

    comp = session.get(Competition, competition_id)
    if not comp:
        raise HTTPException(404, "Competencia no encontrada")
    if not comp.enrollment_open:
        raise HTTPException(403, "Las inscripciones para esta competencia están cerradas")

    now = datetime.now(timezone.utc)
    if comp.enrollment_start and now < comp.enrollment_start.replace(tzinfo=timezone.utc):
        raise HTTPException(403, "El período de inscripción aún no ha comenzado")
    if comp.enrollment_end and now > comp.enrollment_end.replace(tzinfo=timezone.utc):
        raise HTTPException(403, "El período de inscripción ha finalizado")

    existing = session.get(CompetitionParticipant, (competition_id, participant_id))
    if existing and existing.estado != "rechazado":
        raise HTTPException(409, f"Ya tienes una inscripción con estado: {existing.estado}")

    questions = _parse_enrollment_questions(comp.enrollment_questions)
    extra_items = []
    if comp.enrollment_terms_text and not body.terms_accepted:
        raise HTTPException(400, "Debes aceptar los terminos y condiciones del evento")
    if comp.enrollment_terms_text:
        extra_items.append({
            "question_id": "__terms_acceptance__",
            "question_label": "Aceptacion de terminos y condiciones",
            "question_type": "text",
            "answer": "Aceptado",
        })
    if comp.require_payment_receipt:
        receipt_url = str(body.payment_receipt_url or "").strip()
        if not receipt_url:
            raise HTTPException(400, "Debes adjuntar el comprobante de pago")
        extra_items.append({
            "question_id": "__payment_receipt__",
            "question_label": "Comprobante de pago",
            "question_type": "image",
            "answer": receipt_url,
        })
    serialized_answers = _serialize_enrollment_answers(questions, body.answers, extra_items)

    if existing and existing.estado == "rechazado":
        existing.categoria = body.categoria
        existing.estado = "pendiente"
        existing.enrollment_answers = serialized_answers
        session.add(existing)
    else:
        session.add(CompetitionParticipant(
            competition_id=competition_id,
            participant_id=participant_id,
            categoria=body.categoria,
            estado="pendiente",
            enrollment_answers=serialized_answers,
        ))
    session.commit()
    return {"ok": True, "estado": "pendiente"}


@router.delete("/api/competitions/{competition_id}/enroll", status_code=204)
def cancel_self_enroll(
    competition_id: int,
    session: Session = Depends(get_session),
    user=Depends(require_auth),
):
    participant_id = get_effective_participant_id(user)
    if not is_end_user(user) or participant_id is None:
        raise HTTPException(403, "Solo usuarios")
    cp = session.get(CompetitionParticipant, (competition_id, participant_id))
    if not cp:
        return
    session.delete(cp)
    session.commit()


@router.get("/api/competitions/{competition_id}/enrolled-list")
def enrolled_list(competition_id: int, session: Session = Depends(get_session)):
    rows = session.execute(text("""
        SELECT p.nombre, p.apellido, COALESCE(p.genero, p.sexo) AS sexo, cp.categoria
        FROM competition_participants cp
        JOIN participants p ON p.id = cp.participant_id
        WHERE cp.competition_id = :cid AND cp.estado = 'confirmado'
        ORDER BY cp.categoria, p.apellido, p.nombre
    """), {"cid": competition_id}).mappings().all()
    return [dict(r) for r in rows]


@router.get("/api/participants/{participant_id}/competitions")
def participant_competitions(
    participant_id: int,
    session: Session = Depends(get_session),
    user=Depends(get_current_user),
):
    user_sub = get_effective_participant_id(user)
    if is_end_user(user) and user_sub != participant_id:
        raise HTTPException(403, "Sin permiso")

    rows = session.execute(text("""
        SELECT c.*, cp.estado AS enrollment_estado, cp.categoria AS enrollment_categoria, cp.enrollment_answers
        FROM competitions c
        JOIN competition_participants cp ON cp.competition_id = c.id
        WHERE cp.participant_id = :pid
        ORDER BY c.id DESC
    """), {"pid": participant_id}).mappings().all()
    return [dict(r) for r in rows]
