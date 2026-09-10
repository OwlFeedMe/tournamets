"""Deliver only explicitly requested Open opening notices."""
import json
import logging
import os
from datetime import datetime, timezone

from sqlalchemy import text
from sqlmodel import select

from models import AppNotification, Competition, CompetitionCategory, CompetitionInterestNotification
from services.emailer import send_email
from services.open_qualifier import config_for, utc

logger = logging.getLogger(__name__)


def open_accepts_entries(comp, categories, now):
    cfg = config_for(comp)
    return bool(cfg.get("enabled") and comp.activa and comp.enrollment_open
                and now < utc(cfg["deadline"])
                and (not comp.enrollment_start or now >= utc(comp.enrollment_start))
                and (not comp.enrollment_end or now <= utc(comp.enrollment_end))
                and any(cat.registration_enabled and cat.modality == "individual" for cat in categories))


def deliver_open_notices(session, now=None):
    now = now or datetime.now(timezone.utc)
    rows = session.exec(select(CompetitionInterestNotification, Competition).join(
        Competition, Competition.id == CompetitionInterestNotification.competition_id
    ).where(CompetitionInterestNotification.notification_type == "open_qualifier",
            CompetitionInterestNotification.sent_at == None,
            Competition.activa == 1, Competition.enrollment_open == 1)).all()
    sent = 0
    for subscription, comp in rows:
        categories = session.exec(select(CompetitionCategory).where(CompetitionCategory.competition_id == comp.id)).all()
        if not open_accepts_entries(comp, categories, now):
            continue
        url = os.getenv("LEADERBOARD_BASE_URL", "https://finalrep.co").rstrip("/") + f"/competitions/{comp.id}/open"
        title = f"El Open de {comp.nombre} ya está abierto"
        body = f"Ya puedes consultar los requisitos e inscribirte al Open de {comp.nombre}.\n{url}"
        identity = json.dumps({"subscription_id": subscription.id})
        if subscription.user_id and not session.exec(select(AppNotification.id).where(
            AppNotification.user_id == subscription.user_id,
            AppNotification.notification_type == "open_qualifier_opened",
            AppNotification.data_json == identity,
        )).first():
            session.add(AppNotification(user_id=subscription.user_id, notification_type="open_qualifier_opened",
                                        title=title, body=f"Consulta los requisitos y participa en el Open de {comp.nombre}.",
                                        action_url=url, data_json=identity))
        if subscription.email and send_email(to_email=subscription.email, subject=title, text_body=body):
            subscription.sent_at = now
            session.add(subscription)
            sent += 1
    return sent


def send_due_open_notices(session):
    try:
        # One sender across backend processes; transaction end releases the lock.
        if not session.execute(text("SELECT pg_try_advisory_xact_lock(91304024)")).scalar():
            session.rollback()
            return
        deliver_open_notices(session)
        session.commit()
    except Exception:
        session.rollback()
        logger.exception("Could not deliver requested Open opening notices")
