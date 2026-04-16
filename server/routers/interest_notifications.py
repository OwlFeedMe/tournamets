import re

from fastapi import APIRouter, Body, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlmodel import Session, select

from auth import get_current_user_optional, get_effective_participant_id, is_end_user
from database import get_session
from models import Competition, CompetitionInterestNotification, Participant

router = APIRouter(prefix="/api/competitions", tags=["interest_notifications"])

EMAIL_REGEX = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")
VALID_NOTIFICATION_TYPES = {"open_enrollment", "organizer_updates"}


def _normalize_notification_type(value: str | None) -> str:
    raw = str(value or "open_enrollment").strip().lower()
    if raw not in VALID_NOTIFICATION_TYPES:
        raise HTTPException(status_code=400, detail="Tipo de notificacion invalido")
    return raw


def _normalize_email(value: str | None) -> str | None:
    email = str(value or "").strip().lower()
    if not email:
        return None
    if not EMAIL_REGEX.fullmatch(email):
        raise HTTPException(status_code=400, detail="Ingresa un email valido")
    return email


@router.post("/{competition_id}/interest-notifications", status_code=201)
def create_interest_notification(
    competition_id: int,
    body: dict = Body(default={}),
    session: Session = Depends(get_session),
    user=Depends(get_current_user_optional),
):
    competition = session.get(Competition, competition_id)
    if not competition:
        raise HTTPException(status_code=404, detail="Competencia no encontrada")

    notification_type = _normalize_notification_type(body.get("notification_type"))
    participant_id = None
    email = _normalize_email(body.get("email"))

    if user and is_end_user(user):
        participant_id = get_effective_participant_id(user)
        if participant_id is not None:
            participant = session.get(Participant, participant_id)
            if participant and participant.email:
                email = _normalize_email(participant.email) or email

    if participant_id is None and not email:
        raise HTTPException(status_code=400, detail="Necesitamos un email para guardar el aviso")

    existing = None
    if participant_id is not None:
        existing = session.exec(
            select(CompetitionInterestNotification).where(
                CompetitionInterestNotification.competition_id == competition_id,
                CompetitionInterestNotification.notification_type == notification_type,
                CompetitionInterestNotification.participant_id == participant_id,
            )
        ).first()
    elif email:
        existing = session.exec(
            select(CompetitionInterestNotification).where(
                CompetitionInterestNotification.competition_id == competition_id,
                CompetitionInterestNotification.notification_type == notification_type,
                func.lower(CompetitionInterestNotification.email) == email,
            )
        ).first()

    if existing:
        if email and existing.email != email:
            existing.email = email
            session.add(existing)
            session.commit()
            session.refresh(existing)
        return {
            "saved": True,
            "already_exists": True,
            "notification_type": existing.notification_type,
            "message": "Tu aviso ya estaba guardado.",
        }

    record = CompetitionInterestNotification(
        competition_id=competition_id,
        participant_id=participant_id,
        email=email,
        notification_type=notification_type,
        source="competition_landing",
    )
    session.add(record)
    try:
        session.commit()
        session.refresh(record)
    except IntegrityError:
        session.rollback()
        return {
            "saved": True,
            "already_exists": True,
            "notification_type": notification_type,
            "message": "Tu aviso ya estaba guardado.",
        }

    return {
        "saved": True,
        "already_exists": False,
        "notification_type": notification_type,
        "message": "Aviso guardado.",
    }
