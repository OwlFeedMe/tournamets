import json
import logging
import os
import threading
import time
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from sqlalchemy import text
from sqlmodel import Session, select

from database import engine
from models import AppNotification
from services.push_notifications import send_push_to_user

logger = logging.getLogger(__name__)

NOTIFICATION_TYPE = "event_start_reminder"
REMINDER_WINDOWS = (
    {"key": "60m", "label": "1 hora", "lead": timedelta(hours=1)},
    {"key": "30m", "label": "30 minutos", "lead": timedelta(minutes=30)},
    {"key": "15m", "label": "15 minutos", "lead": timedelta(minutes=15)},
)
DEFAULT_POLL_SECONDS = 60
ADVISORY_LOCK_ID = 91304023


def _base_url() -> str:
    return (os.getenv("LEADERBOARD_BASE_URL") or "https://finalrep.co/").strip().rstrip("/")


def _action_url(competition_id: int) -> str:
    return f"{_base_url()}/competitions/{competition_id}/my-schedule"


def _as_aware_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def _format_start_time(start_at: datetime, timezone_name: str | None) -> str:
    try:
        tz = ZoneInfo((timezone_name or "").strip() or "America/Bogota")
    except ZoneInfoNotFoundError:
        tz = ZoneInfo("America/Bogota")
    local_start = _as_aware_utc(start_at).astimezone(tz)
    return local_start.strftime("%H:%M")


def _notification_data(row: dict, reminder: dict) -> dict:
    return {
        "competition_id": int(row["competition_id"]),
        "phase_id": int(row["phase_id"]) if row.get("phase_id") is not None else None,
        "heat_id": int(row["heat_id"]),
        "start_at": _as_aware_utc(row["start_at"]).isoformat(),
        "reminder": str(reminder["key"]),
    }


def _due_next_events(session: Session, *, now: datetime, poll_seconds: int) -> list[dict]:
    now = _as_aware_utc(now)
    max_lead = max((item["lead"] for item in REMINDER_WINDOWS), default=timedelta(hours=1))
    window_end = now + max_lead + timedelta(seconds=max(30, poll_seconds))

    rows = session.execute(
        text(
            """
            WITH user_heat_assignments AS (
                SELECT
                    a.user_id,
                    h.id AS heat_id,
                    h.competition_id,
                    h.phase_id,
                    h.nombre AS heat_name,
                    h.start_at,
                    h.location_name,
                    c.nombre AS competition_name,
                    c.timezone AS competition_timezone,
                    p.nombre AS phase_name
                FROM competition_heats h
                JOIN competition_heat_assignments a ON a.heat_id = h.id
                JOIN competitions c ON c.id = h.competition_id
                JOIN competition_phases p ON p.id = h.phase_id
                JOIN competition_participants cp ON cp.competition_id = h.competition_id AND cp.user_id = a.user_id
                WHERE a.user_id IS NOT NULL
                  AND cp.estado = 'confirmado'
                  AND c.activa = 1
                  AND h.is_published = 1
                  AND COALESCE(p.is_visible, 1) = 1
                  AND h.start_at > :now
                  AND h.start_at < :window_end

                UNION

                SELECT
                    tm.user_id,
                    h.id AS heat_id,
                    h.competition_id,
                    h.phase_id,
                    h.nombre AS heat_name,
                    h.start_at,
                    h.location_name,
                    c.nombre AS competition_name,
                    c.timezone AS competition_timezone,
                    p.nombre AS phase_name
                FROM competition_heats h
                JOIN competition_heat_assignments a ON a.heat_id = h.id
                JOIN team_members tm ON tm.team_id = a.team_id
                JOIN competitions c ON c.id = h.competition_id
                JOIN competition_phases p ON p.id = h.phase_id
                JOIN competition_participants cp ON cp.competition_id = h.competition_id AND cp.user_id = tm.user_id
                WHERE a.team_id IS NOT NULL
                  AND cp.estado = 'confirmado'
                  AND c.activa = 1
                  AND h.is_published = 1
                  AND COALESCE(p.is_visible, 1) = 1
                  AND h.start_at > :now
                  AND h.start_at < :window_end
            ),
            next_events AS (
                SELECT DISTINCT ON (user_id)
                    user_id,
                    heat_id,
                    competition_id,
                    phase_id,
                    heat_name,
                    start_at,
                    location_name,
                    competition_name,
                    competition_timezone,
                    phase_name
                FROM user_heat_assignments
                ORDER BY user_id, start_at ASC, heat_id ASC
            )
            SELECT *
            FROM next_events
            WHERE start_at < :window_end
            ORDER BY start_at ASC, user_id ASC
            """
        ),
        {"now": now, "window_end": window_end},
    ).mappings().all()
    return [dict(row) for row in rows]


def _due_reminders_for_event(start_at: datetime, *, now: datetime, poll_seconds: int) -> list[dict]:
    start_at = _as_aware_utc(start_at)
    now = _as_aware_utc(now)
    tolerance = timedelta(seconds=max(30, poll_seconds))
    due: list[dict] = []
    for reminder in REMINDER_WINDOWS:
        window_start = now + reminder["lead"] - timedelta(seconds=5)
        window_end = now + reminder["lead"] + tolerance
        if window_start <= start_at < window_end:
            due.append(reminder)
    return due


def send_due_event_start_reminders(session: Session, *, now: datetime | None = None, poll_seconds: int = DEFAULT_POLL_SECONDS) -> int:
    now = now or datetime.now(timezone.utc)
    locked = session.execute(
        text("SELECT pg_try_advisory_lock(:lock_id)"),
        {"lock_id": ADVISORY_LOCK_ID},
    ).scalar()
    if not locked:
        return 0

    sent = 0
    try:
        for row in _due_next_events(session, now=now, poll_seconds=poll_seconds):
            for reminder in _due_reminders_for_event(row["start_at"], now=now, poll_seconds=poll_seconds):
                data = _notification_data(row, reminder)
                data_json = json.dumps(data, separators=(",", ":"), sort_keys=True)
                user_id = int(row["user_id"])
                existing = session.exec(
                    select(AppNotification.id).where(
                        AppNotification.user_id == user_id,
                        AppNotification.notification_type == NOTIFICATION_TYPE,
                        AppNotification.data_json == data_json,
                    )
                ).first()
                if existing:
                    continue

                start_label = _format_start_time(row["start_at"], row.get("competition_timezone"))
                competition_name = str(row.get("competition_name") or "Tu evento").strip()
                phase_name = str(row.get("phase_name") or "Tu evento").strip()
                heat_name = str(row.get("heat_name") or "").strip()
                title = f"{phase_name} empieza en {reminder['label']}"
                body_parts = [competition_name]
                if heat_name and heat_name.lower() != phase_name.lower():
                    body_parts.append(heat_name)
                body_parts.append(f"Inicio {start_label}")
                location = str(row.get("location_name") or "").strip()
                if location:
                    body_parts.append(location)
                body = " | ".join(part for part in body_parts if part)
                url = _action_url(int(row["competition_id"]))

                notification = AppNotification(
                    user_id=user_id,
                    notification_type=NOTIFICATION_TYPE,
                    title=title,
                    body=body,
                    action_url=url,
                    data_json=data_json,
                )
                session.add(notification)
                session.flush()
                send_push_to_user(
                    session,
                    user_id=user_id,
                    title=title,
                    body=body,
                    url=url,
                    notification_id=int(notification.id) if notification.id is not None else None,
                )
                sent += 1
        session.commit()
        return sent
    except Exception:
        session.rollback()
        logger.exception("Could not send event start reminders")
        return sent
    finally:
        session.execute(text("SELECT pg_advisory_unlock(:lock_id)"), {"lock_id": ADVISORY_LOCK_ID})
        session.commit()


def _worker_loop(poll_seconds: int) -> None:
    while True:
        try:
            with Session(engine) as session:
                send_due_event_start_reminders(session, poll_seconds=poll_seconds)
        except Exception:
            logger.exception("Event start reminder worker failed")
        time.sleep(poll_seconds)


def start_event_start_reminder_worker() -> None:
    enabled = os.getenv("ENABLE_EVENT_REMINDER_WORKER", "1").strip().lower()
    if enabled in {"0", "false", "no", "off"}:
        return
    try:
        poll_seconds = max(30, int(os.getenv("EVENT_REMINDER_POLL_SECONDS", str(DEFAULT_POLL_SECONDS))))
    except ValueError:
        poll_seconds = DEFAULT_POLL_SECONDS
    thread = threading.Thread(target=_worker_loop, args=(poll_seconds,), daemon=True, name="event-start-reminders")
    thread.start()
