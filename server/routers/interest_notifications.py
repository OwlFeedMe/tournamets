import re

from fastapi import APIRouter, Body, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlmodel import Session, select

from auth import get_current_user_id, get_current_user_optional, is_end_user
from database import get_session
from models import Competition, CompetitionInterestNotification, Participant

router = APIRouter(prefix="/api/competitions", tags=["interest_notifications"])

EMAIL_REGEX = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")
VALID_NOTIFICATION_TYPES = {"open_enrollment", "organizer_updates"}


def _with_user_id(payload: dict, user_id: int | None) -> dict:
    if user_id is None:
        return payload
    return {**payload, "user_id": user_id}


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
    user_id = None
    email = _normalize_email(body.get("email"))

    if user and is_end_user(user):
        user_id = get_current_user_id(user)
        if user_id is not None:
            participant = session.get(Participant, user_id)
            if participant and participant.email:
                email = _normalize_email(participant.email) or email

    if user_id is None and not email:
        raise HTTPException(status_code=400, detail="Necesitamos un email para guardar el aviso")

    existing = None
    if user_id is not None:
        existing = session.exec(
            select(CompetitionInterestNotification).where(
                CompetitionInterestNotification.competition_id == competition_id,
                CompetitionInterestNotification.notification_type == notification_type,
                CompetitionInterestNotification.user_id == user_id,
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
        return _with_user_id({
            "saved": True,
            "already_exists": True,
            "notification_type": existing.notification_type,
            "message": "Tu aviso ya estaba guardado.",
        }, user_id)

    record = CompetitionInterestNotification(
        competition_id=competition_id,
        user_id=user_id,
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
        return _with_user_id({
            "saved": True,
            "already_exists": True,
            "notification_type": notification_type,
            "message": "Tu aviso ya estaba guardado.",
        }, user_id)

    return _with_user_id({
        "saved": True,
        "already_exists": False,
        "notification_type": notification_type,
        "message": "Aviso guardado.",
    }, user_id)
