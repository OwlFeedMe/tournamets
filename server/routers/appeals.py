from datetime import datetime, timedelta, timezone
from urllib.parse import urlparse

from fastapi import APIRouter, Body, Depends, HTTPException, Query
from sqlmodel import Session, select

from access import get_user_id, require_competition_operator_access
from auth import require_auth
from database import get_session
from models import (
    CompetitionPhase,
    Participant,
    Result,
    ResultAppeal,
    ResultAppealMessage,
    ResultScoreAuditLog,
)
from phase_status import recompute_and_persist_phase_status
from routers.results import APPEAL_WINDOW_MINUTES, _recompute_phase_positions_and_points
from services.leaderboard_cache import invalidate_leaderboard_results_snapshot
from services.result_notifications import notify_result_saved

router = APIRouter(prefix="/api/appeals", tags=["appeals"])

ACTIVE_STATUSES = {"submitted", "under_review", "needs_evidence", "escalated"}
CLOSED_STATUSES = {"accepted", "rejected", "score_adjusted", "closed", "cancelled"}
EVIDENCE_HOSTS = {
    "drive.google.com",
    "docs.google.com",
    "youtube.com",
    "www.youtube.com",
    "m.youtube.com",
    "youtu.be",
}


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _aware(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value


def _appeal_deadline(result: Result) -> datetime:
    deadline = _aware(getattr(result, "appeal_deadline_at", None))
    if deadline:
        return deadline
    created_at = _aware(result.created_at) or _utcnow()
    return created_at + timedelta(minutes=APPEAL_WINDOW_MINUTES)


def _validate_evidence_url(raw: str | None, *, required: bool = False) -> str | None:
    value = str(raw or "").strip()
    if not value:
        if required:
            raise HTTPException(400, "Agrega un link de Drive o YouTube como evidencia")
        return None
    parsed = urlparse(value)
    host = (parsed.netloc or "").lower()
    if parsed.scheme not in {"http", "https"} or host not in EVIDENCE_HOSTS:
        raise HTTPException(400, "La evidencia debe ser un link de Drive o YouTube")
    return value


def _actor_role(user: dict | None) -> str:
    role = str(user.get("role") if user else "").strip().lower()
    if role in {"admin", "organizer", "judge"}:
        return role
    return "athlete"


def _participant_name(session: Session, user_id: int | None) -> str | None:
    if user_id is None:
        return None
    participant = session.get(Participant, user_id)
    if not participant:
        return None
    return f"{(participant.nombre or '').strip()} {(participant.apellido or '').strip()}".strip() or participant.display_name


def _appeal_payload(session: Session, appeal: ResultAppeal, *, include_messages: bool = False) -> dict:
    result = session.get(Result, appeal.result_id)
    phase = session.get(CompetitionPhase, appeal.phase_id) if appeal.phase_id else None
    payload = {
        "id": int(appeal.id),
        "result_id": int(appeal.result_id),
        "competition_id": int(appeal.competition_id),
        "phase_id": int(appeal.phase_id) if appeal.phase_id is not None else None,
        "phase_name": str(getattr(phase, "nombre", "") or "").strip() if phase else None,
        "user_id": int(appeal.user_id),
        "user_name": _participant_name(session, int(appeal.user_id)),
        "status": appeal.status,
        "reason_type": appeal.reason_type,
        "description": appeal.description,
        "evidence_url": appeal.evidence_url,
        "user_requested_score": appeal.user_requested_score,
        "resolution_type": appeal.resolution_type,
        "resolution_note": appeal.resolution_note,
        "submitted_at": appeal.submitted_at.isoformat() if appeal.submitted_at else None,
        "resolved_at": appeal.resolved_at.isoformat() if appeal.resolved_at else None,
        "original_marca": appeal.original_marca,
        "original_tiebreak": appeal.original_tiebreak,
        "original_puntos": appeal.original_puntos,
        "original_posicion": appeal.original_posicion,
        "final_marca": appeal.final_marca,
        "final_tiebreak": appeal.final_tiebreak,
        "final_puntos": appeal.final_puntos,
        "final_posicion": appeal.final_posicion,
        "current_marca": result.marca if result else None,
        "current_tiebreak": result.tiebreak if result else None,
        "current_puntos": result.puntos if result else None,
        "current_posicion": result.posicion if result else None,
    }
    if include_messages:
        rows = session.exec(
            select(ResultAppealMessage)
            .where(ResultAppealMessage.appeal_id == appeal.id)
            .order_by(ResultAppealMessage.created_at.asc(), ResultAppealMessage.id.asc())
        ).all()
        payload["messages"] = [
            {
                "id": int(row.id),
                "author_user_id": int(row.author_user_id) if row.author_user_id is not None else None,
                "author_name": _participant_name(session, row.author_user_id),
                "author_role": row.author_role,
                "message": row.message,
                "evidence_url": row.evidence_url,
                "is_internal_note": int(row.is_internal_note or 0),
                "created_at": row.created_at.isoformat() if row.created_at else None,
            }
            for row in rows
        ]
    return payload


def _require_appeal_access(session: Session, appeal: ResultAppeal, user: dict, *, staff: bool = False) -> None:
    user_id = get_user_id(user)
    if staff:
        require_competition_operator_access(session, int(appeal.competition_id), user)
        return
    if user_id is not None and int(appeal.user_id) == int(user_id):
        return
    require_competition_operator_access(session, int(appeal.competition_id), user)


@router.get("")
def list_appeals(
    competition_id: int = Query(...),
    status: str | None = Query(default=None),
    session: Session = Depends(get_session),
    user=Depends(require_auth),
):
    require_competition_operator_access(session, competition_id, user)
    query = select(ResultAppeal).where(ResultAppeal.competition_id == competition_id)
    normalized_status = str(status or "").strip()
    if normalized_status:
        query = query.where(ResultAppeal.status == normalized_status)
    rows = session.exec(query.order_by(ResultAppeal.created_at.desc(), ResultAppeal.id.desc())).all()
    return [_appeal_payload(session, row) for row in rows]


@router.get("/me")
def list_my_appeals(session: Session = Depends(get_session), user=Depends(require_auth)):
    user_id = get_user_id(user)
    if user_id is None:
        raise HTTPException(401, "No autenticado")
    rows = session.exec(
        select(ResultAppeal)
        .where(ResultAppeal.user_id == user_id)
        .order_by(ResultAppeal.created_at.desc(), ResultAppeal.id.desc())
    ).all()
    return [_appeal_payload(session, row, include_messages=True) for row in rows]


@router.get("/{appeal_id}")
def get_appeal(appeal_id: int, session: Session = Depends(get_session), user=Depends(require_auth)):
    appeal = session.get(ResultAppeal, appeal_id)
    if not appeal:
        raise HTTPException(404, "Reclamacion no encontrada")
    _require_appeal_access(session, appeal, user)
    return _appeal_payload(session, appeal, include_messages=True)


@router.post("", status_code=201)
def create_appeal(body: dict = Body(...), session: Session = Depends(get_session), user=Depends(require_auth)):
    user_id = get_user_id(user)
    if user_id is None:
        raise HTTPException(401, "No autenticado")
    try:
        result_id = int(body.get("result_id"))
    except Exception:
        raise HTTPException(400, "Resultado invalido")
    result = session.get(Result, result_id)
    if not result:
        raise HTTPException(404, "Resultado no encontrado")
    if int(result.user_id or 0) != int(user_id):
        raise HTTPException(403, "Solo puedes apelar tus propios resultados")
    deadline = _appeal_deadline(result)
    if _utcnow() > deadline:
        raise HTTPException(409, "El tiempo para apelar este resultado termino")
    active = session.exec(
        select(ResultAppeal).where(
            ResultAppeal.result_id == result_id,
            ResultAppeal.status.in_(ACTIVE_STATUSES),
        )
    ).first()
    if active:
        raise HTTPException(409, "Este resultado ya tiene una reclamacion activa")

    description = str(body.get("description") or "").strip()
    if len(description) < 10:
        raise HTTPException(400, "Explica el ajuste solicitado")
    evidence_url = _validate_evidence_url(body.get("evidence_url"), required=True)
    requested_score = str(body.get("user_requested_score") or "").strip() or None
    appeal = ResultAppeal(
        result_id=result_id,
        competition_id=int(result.competition_id),
        phase_id=int(result.phase_id) if result.phase_id is not None else None,
        user_id=user_id,
        status="submitted",
        reason_type=str(body.get("reason_type") or "score_review").strip() or "score_review",
        description=description,
        evidence_url=evidence_url,
        user_requested_score=requested_score,
        original_marca=result.marca,
        original_tiebreak=result.tiebreak,
        original_puntos=result.puntos,
        original_posicion=result.posicion,
    )
    session.add(appeal)
    session.flush()
    session.add(ResultAppealMessage(
        appeal_id=int(appeal.id),
        author_user_id=user_id,
        author_role="athlete",
        message=description,
        evidence_url=evidence_url,
    ))
    result.result_status = "under_review"
    session.add(result)
    session.commit()
    session.refresh(appeal)
    return _appeal_payload(session, appeal, include_messages=True)


@router.post("/{appeal_id}/messages", status_code=201)
def add_message(appeal_id: int, body: dict = Body(...), session: Session = Depends(get_session), user=Depends(require_auth)):
    appeal = session.get(ResultAppeal, appeal_id)
    if not appeal:
        raise HTTPException(404, "Reclamacion no encontrada")
    _require_appeal_access(session, appeal, user)
    if appeal.status not in ACTIVE_STATUSES:
        raise HTTPException(409, "La reclamacion ya esta cerrada")
    message = str(body.get("message") or "").strip()
    evidence_url = _validate_evidence_url(body.get("evidence_url"), required=False)
    if not message and not evidence_url:
        raise HTTPException(400, "Escribe un mensaje o agrega un link")
    row = ResultAppealMessage(
        appeal_id=int(appeal.id),
        author_user_id=get_user_id(user),
        author_role=_actor_role(user),
        message=message or "Evidencia adicional",
        evidence_url=evidence_url,
        is_internal_note=1 if body.get("is_internal_note") and _actor_role(user) != "athlete" else 0,
    )
    session.add(row)
    if _actor_role(user) != "athlete" and appeal.status == "submitted":
        appeal.status = "under_review"
        session.add(appeal)
    session.commit()
    return _appeal_payload(session, appeal, include_messages=True)


@router.post("/{appeal_id}/resolve")
def resolve_appeal(appeal_id: int, body: dict = Body(...), session: Session = Depends(get_session), user=Depends(require_auth)):
    appeal = session.get(ResultAppeal, appeal_id)
    if not appeal:
        raise HTTPException(404, "Reclamacion no encontrada")
    _require_appeal_access(session, appeal, user, staff=True)
    if appeal.status not in ACTIVE_STATUSES:
        raise HTTPException(409, "La reclamacion ya esta cerrada")
    result = session.get(Result, appeal.result_id)
    if not result:
        raise HTTPException(404, "Resultado no encontrado")

    resolution_type = str(body.get("resolution_type") or "").strip().lower()
    if resolution_type not in {"accepted", "rejected", "score_adjusted", "needs_evidence"}:
        raise HTTPException(400, "Decision invalida")
    note = str(body.get("resolution_note") or "").strip()
    if resolution_type != "needs_evidence" and len(note) < 6:
        raise HTTPException(400, "Agrega una nota de decision")

    if resolution_type == "needs_evidence":
        appeal.status = "needs_evidence"
        session.add(ResultAppealMessage(
            appeal_id=int(appeal.id),
            author_user_id=get_user_id(user),
            author_role=_actor_role(user),
            message=note or "Necesitamos mas evidencia para revisar el resultado.",
        ))
        session.add(appeal)
        session.commit()
        return _appeal_payload(session, appeal, include_messages=True)

    previous = {
        "marca": result.marca,
        "tiebreak": result.tiebreak,
        "puntos": result.puntos,
        "posicion": result.posicion,
    }
    changed = False
    if resolution_type in {"accepted", "score_adjusted"}:
        if body.get("marca") is not None and str(body.get("marca")).strip() != "":
            result.marca = int(body.get("marca"))
            changed = True
        if body.get("tiebreak") is not None and str(body.get("tiebreak")).strip() != "":
            result.tiebreak = int(body.get("tiebreak"))
            changed = True
        if not changed and resolution_type == "score_adjusted":
            raise HTTPException(400, "Indica la nueva marca para ajustar el resultado")
        if changed:
            session.add(result)
            session.flush()
            if result.phase_id is not None:
                _recompute_phase_positions_and_points(session, int(result.competition_id), int(result.phase_id))
                recompute_and_persist_phase_status(session, int(result.competition_id), int(result.phase_id))
            session.flush()
            session.refresh(result)
            session.add(ResultScoreAuditLog(
                result_id=int(result.id),
                appeal_id=int(appeal.id),
                previous_marca=previous["marca"],
                previous_tiebreak=previous["tiebreak"],
                previous_puntos=previous["puntos"],
                previous_posicion=previous["posicion"],
                new_marca=result.marca,
                new_tiebreak=result.tiebreak,
                new_puntos=result.puntos,
                new_posicion=result.posicion,
                changed_by_user_id=get_user_id(user),
                reason=note,
            ))
            resolution_type = "score_adjusted"
            invalidate_leaderboard_results_snapshot(int(result.competition_id))

    appeal.status = resolution_type
    appeal.resolution_type = resolution_type
    appeal.resolution_note = note
    appeal.resolved_at = _utcnow()
    appeal.resolved_by_user_id = get_user_id(user)
    appeal.final_marca = result.marca
    appeal.final_tiebreak = result.tiebreak
    appeal.final_puntos = result.puntos
    appeal.final_posicion = result.posicion
    result.result_status = "adjusted" if resolution_type == "score_adjusted" else "valid"
    session.add(appeal)
    session.add(result)
    session.add(ResultAppealMessage(
        appeal_id=int(appeal.id),
        author_user_id=get_user_id(user),
        author_role=_actor_role(user),
        message=note,
    ))
    if resolution_type == "score_adjusted":
        session.flush()
        session.refresh(result)
        notify_result_saved(session, result, updated=True)
    session.commit()
    return _appeal_payload(session, appeal, include_messages=True)
