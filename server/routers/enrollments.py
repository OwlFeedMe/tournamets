from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import text
from sqlmodel import Session, select

from auth import require_admin, get_current_user, require_auth
from database import get_session
from models import (
    Competition, Participant, CompetitionParticipant,
    EnrollBody, EnrollEntry, SelfEnrollRequest, EnrollStatusUpdate,
)

router = APIRouter(tags=["enrollments"])


# ── Admin: list enrolled (all estados) ────────────────────────────────────────

@router.get("/api/competitions/{competition_id}/participants")
def list_enrolled(competition_id: int, session: Session = Depends(get_session), _=Depends(require_admin)):
    comp = session.get(Competition, competition_id)
    if not comp:
        raise HTTPException(404, "Competencia no encontrada")

    rows = session.exec(
        select(CompetitionParticipant, Participant)
        .join(Participant, Participant.id == CompetitionParticipant.participant_id)
        .where(CompetitionParticipant.competition_id == competition_id)
        .order_by(CompetitionParticipant.estado, Participant.apellido, Participant.nombre)
    ).all()

    return [
        {**p.model_dump(), "categoria_competencia": cp.categoria, "estado": cp.estado}
        for cp, p in rows
    ]


# ── Admin: bulk set enrollments (confirms all) ─────────────────────────────────

@router.post("/api/competitions/{competition_id}/participants", status_code=201)
def set_enrolled(competition_id: int, body: EnrollBody,
                 session: Session = Depends(get_session), _=Depends(require_admin)):
    comp = session.get(Competition, competition_id)
    if not comp:
        raise HTTPException(404, "Competencia no encontrada")

    # Remove only confirmed enrollments (preserve pending/rejected requests)
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
        # If a pending/rejected record exists, promote it to confirmed
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


# ── Admin: approve / reject a single enrollment ────────────────────────────────

@router.put("/api/competitions/{competition_id}/participants/{participant_id}/status")
def update_enrollment_status(
    competition_id: int,
    participant_id: int,
    body: EnrollStatusUpdate,
    session: Session = Depends(get_session),
    _=Depends(require_admin),
):
    if body.estado not in ("confirmado", "rechazado", "pendiente"):
        raise HTTPException(400, "Estado inválido")
    cp = session.get(CompetitionParticipant, (competition_id, participant_id))
    if not cp:
        raise HTTPException(404, "Inscripción no encontrada")
    cp.estado = body.estado
    session.add(cp)
    session.commit()
    return {"ok": True, "estado": cp.estado}


# ── Admin: unenroll one ────────────────────────────────────────────────────────

@router.delete("/api/competitions/{competition_id}/participants/{participant_id}", status_code=204)
def unenroll(competition_id: int, participant_id: int,
             session: Session = Depends(get_session), _=Depends(require_admin)):
    cp = session.get(CompetitionParticipant, (competition_id, participant_id))
    if cp:
        session.delete(cp)
        session.commit()


# ── Participant: self-enroll (creates pendiente) ───────────────────────────────

@router.post("/api/competitions/{competition_id}/enroll", status_code=201)
def self_enroll(
    competition_id: int,
    body: SelfEnrollRequest,
    session: Session = Depends(get_session),
    user=Depends(require_auth),
):
    participant_id = int(user["sub"])

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
    if existing:
        raise HTTPException(409, f"Ya tienes una inscripción con estado: {existing.estado}")

    session.add(CompetitionParticipant(
        competition_id=competition_id,
        participant_id=participant_id,
        categoria=body.categoria,
        estado="pendiente",
    ))
    session.commit()
    return {"ok": True, "estado": "pendiente"}


# ── Participant: cancel own pending enrollment ─────────────────────────────────

@router.delete("/api/competitions/{competition_id}/enroll", status_code=204)
def cancel_self_enroll(
    competition_id: int,
    session: Session = Depends(get_session),
    user=Depends(require_auth),
):
    participant_id = int(user["sub"])
    cp = session.get(CompetitionParticipant, (competition_id, participant_id))
    if cp and cp.estado == "pendiente":
        session.delete(cp)
        session.commit()


# ── Public: confirmed participant list (for catalog / who's enrolled) ──────────

@router.get("/api/competitions/{competition_id}/enrolled-list")
def enrolled_list(competition_id: int, session: Session = Depends(get_session)):
    rows = session.execute(text("""
        SELECT p.nombre, p.apellido, p.sexo, cp.categoria
        FROM competition_participants cp
        JOIN participants p ON p.id = cp.participant_id
        WHERE cp.competition_id = :cid AND cp.estado = 'confirmado'
        ORDER BY cp.categoria, p.apellido, p.nombre
    """), {"cid": competition_id}).mappings().all()
    return [dict(r) for r in rows]


# ── Participant: my competitions (with estado) ─────────────────────────────────

@router.get("/api/participants/{participant_id}/competitions")
def participant_competitions(participant_id: int,
                             session: Session = Depends(get_session),
                             user=Depends(get_current_user)):
    user_sub = int(user["sub"]) if user.get("sub") is not None else None
    if user["role"] == "participant" and user_sub != participant_id:
        raise HTTPException(403, "Sin permiso")

    rows = session.execute(text("""
        SELECT c.*, cp.estado AS enrollment_estado, cp.categoria AS enrollment_categoria
        FROM competitions c
        JOIN competition_participants cp ON cp.competition_id = c.id
        WHERE cp.participant_id = :pid
        ORDER BY c.id DESC
    """), {"pid": participant_id}).mappings().all()
    return [dict(r) for r in rows]
