import logging
import os
import threading
import time
from datetime import datetime, timezone, timedelta

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from database import run_db_migrations
from routers import (
    auth,
    participants,
    competitions,
    results,
    leaderboard,
    teams,
    enrollments,
    categories_phases,
    schedule,
    finance,
    organizer_applications,
    config,
    system_status,
    interest_notifications,
    checkin_qr,
    judges,
    judge_cards,
    ticketing,
    discounts,
    competitor_invitations,
    gyms,
)

app = FastAPI(title="FinalRep API", version="1.0.0")
uploads_dir = os.path.join(os.path.dirname(__file__), "uploads")
os.makedirs(uploads_dir, exist_ok=True)

allowed_origins = [
    origin.strip()
    for origin in os.getenv("CORS_ALLOWED_ORIGINS", "http://localhost:5173,http://localhost:3000").split(",")
    if origin.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(participants.users_router)
app.include_router(competitions.router)
app.include_router(results.router)
app.include_router(leaderboard.router)
app.include_router(teams.router)
app.include_router(enrollments.router)
app.include_router(categories_phases.router)
app.include_router(schedule.router)
app.include_router(finance.router)
app.include_router(organizer_applications.router)
app.include_router(config.router)
app.include_router(system_status.router)
app.include_router(interest_notifications.router)
app.include_router(checkin_qr.router)
app.include_router(judges.router)
app.include_router(judge_cards.router)
app.include_router(ticketing.router)
app.include_router(discounts.router)
app.include_router(competitor_invitations.router)
app.include_router(gyms.router)
app.mount("/uploads", StaticFiles(directory=uploads_dir), name="uploads")


def _profile_reminder_loop() -> None:
    """Send profile reminders without duplicating work across app workers."""
    try:
        reminder_after_days = max(int(os.getenv("PROFILE_REMINDER_AFTER_DAYS", "3")), 0)
    except Exception:
        reminder_after_days = 3
    try:
        enrolled_interval_days = max(int(os.getenv("PROFILE_REMINDER_ENROLLED_INTERVAL_DAYS", "3")), 1)
    except Exception:
        enrolled_interval_days = 3
    try:
        check_interval_hours = max(float(os.getenv("PROFILE_REMINDER_CHECK_INTERVAL_HOURS", "6")), 0.25)
    except Exception:
        check_interval_hours = 6.0

    while True:
        try:
            from sqlmodel import Session, select
            from sqlalchemy import text
            from database import engine
            from models import CompetitionParticipant, Participant
            from routers.participants import _get_missing_profile_fields
            from services.emailer import send_email
            from services.email_templates import render_profile_completion_reminder

            now = datetime.now(timezone.utc)
            new_user_cutoff = now - timedelta(days=reminder_after_days)
            enrolled_cutoff = now - timedelta(days=enrolled_interval_days)
            with Session(engine) as session:
                lock_row = session.exec(
                    text("SELECT pg_try_advisory_xact_lock(91304021)")
                ).one()
                lock_acquired = bool(lock_row[0] if hasattr(lock_row, "__getitem__") else lock_row)
                if not lock_acquired:
                    time.sleep(check_interval_hours * 3600)
                    continue

                enrolled_user_ids = {
                    int(row[0] if hasattr(row, "__getitem__") else row)
                    for row in session.exec(
                        select(CompetitionParticipant.user_id)
                        .where(CompetitionParticipant.estado.in_(("confirmado", "pendiente", "pago_pendiente", "pago_en_verificacion")))
                        .distinct()
                    ).all()
                    if (row[0] if hasattr(row, "__getitem__") else row) is not None
                }
                candidates = session.exec(
                    select(Participant).where(
                        Participant.email.isnot(None),
                        Participant.is_active == 1,
                    )
                ).all()

                for p in candidates:
                    missing = _get_missing_profile_fields(p)
                    if not missing:
                        continue
                    is_enrolled = int(p.id or 0) in enrolled_user_ids
                    last_sent_at = p.profile_reminder_sent_at
                    if last_sent_at and last_sent_at.tzinfo is None:
                        last_sent_at = last_sent_at.replace(tzinfo=timezone.utc)

                    should_send = False
                    if is_enrolled:
                        should_send = last_sent_at is None or last_sent_at <= enrolled_cutoff
                    else:
                        created_at = p.created_at
                        if created_at and created_at.tzinfo is None:
                            created_at = created_at.replace(tzinfo=timezone.utc)
                        should_send = last_sent_at is None and created_at and created_at <= new_user_cutoff
                    if not should_send:
                        continue

                    subject, mail_body, html = render_profile_completion_reminder(
                        nombre=p.nombre,
                        missing_fields=missing,
                        is_enrolled=is_enrolled,
                    )
                    sent = send_email(to_email=p.email, subject=subject, body=mail_body, html_body=html)
                    if sent:
                        p.profile_reminder_sent_at = now
                        session.add(p)
                        logging.info("Profile reminder sent to user %s", p.id)

                session.commit()
        except Exception:
            logging.exception("Profile reminder job failed")

        time.sleep(check_interval_hours * 3600)


@app.on_event("startup")
def startup():
    def _bootstrap_db() -> None:
        run_db_migrations()
        if os.getenv("PROFILE_REMINDER_ENABLED", "1").strip().lower() not in {"0", "false", "no", "off"}:
            threading.Thread(target=_profile_reminder_loop, daemon=True).start()

    threading.Thread(target=_bootstrap_db, daemon=True).start()


@app.get("/")
def root():
    return {"message": "FinalRep API"}
