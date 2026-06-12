from datetime import datetime, timedelta, timezone
from typing import Any

from fastapi import HTTPException
from sqlmodel import Session, select

from models import CompetitionCategory, CompetitionParticipant, CompetitionPaymentIntent


ACTIVE_ENROLLMENT_STATES = {
    "confirmado",
    "pendiente",
    "pago_pendiente",
    "pago_en_verificacion",
}
CONFIRMED_ENROLLMENT_STATES = {"confirmado"}
ACTIVE_INTENT_STATUSES = {"processing", "pending", "approved"}
RESERVED_INTENT_STATUSES = {"prepared", "created"}
RESERVED_INTENT_TIMEOUT_MINUTES = 15


def normalize_capacity(raw: Any) -> int | None:
    if raw is None or raw == "":
        return None
    try:
        value = int(raw)
    except Exception:
        return None
    return value if value > 0 else None


def normalize_registration_enabled(raw: Any) -> int:
    if raw is None:
        return 1
    if isinstance(raw, str):
        return 0 if raw.strip().lower() in {"0", "false", "no", "off", "closed"} else 1
    return 1 if bool(raw) else 0


def _aware(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value


def _intent_is_active(intent: CompetitionPaymentIntent, now: datetime) -> bool:
    status = str(getattr(intent, "payment_status", "") or "").strip().lower()
    if status in ACTIVE_INTENT_STATUSES:
        return True
    if status not in RESERVED_INTENT_STATUSES:
        return False
    updated_at = _aware(getattr(intent, "payment_updated_at", None))
    if not updated_at:
        return False
    return now - updated_at < timedelta(minutes=RESERVED_INTENT_TIMEOUT_MINUTES)


def get_category_usage(session: Session, competition_id: int) -> dict[str, dict[str, int]]:
    usage: dict[str, dict[str, int | set[int]]] = {}
    active_users: set[int] = set()

    enrollments = session.exec(
        select(CompetitionParticipant).where(CompetitionParticipant.competition_id == competition_id)
    ).all()
    for enrollment in enrollments:
        category_name = str(getattr(enrollment, "categoria", "") or "").strip()
        if not category_name:
            continue
        state = str(getattr(enrollment, "estado", "") or "").strip().lower()
        bucket = usage.setdefault(category_name, {"registered_count": 0, "active_users": set()})
        if state in CONFIRMED_ENROLLMENT_STATES:
            bucket["registered_count"] = int(bucket["registered_count"]) + 1
        if state in ACTIVE_ENROLLMENT_STATES:
            user_id = int(getattr(enrollment, "user_id", 0) or 0)
            if user_id:
                active_users.add(user_id)
                bucket["active_users"].add(user_id)

    now = datetime.now(timezone.utc)
    intents = session.exec(
        select(CompetitionPaymentIntent).where(CompetitionPaymentIntent.competition_id == competition_id)
    ).all()
    for intent in intents:
        if not _intent_is_active(intent, now):
            continue
        user_id = int(getattr(intent, "user_id", 0) or 0)
        if not user_id or user_id in active_users:
            continue
        category_name = str(getattr(intent, "categoria", "") or "").strip()
        if not category_name:
            continue
        bucket = usage.setdefault(category_name, {"registered_count": 0, "active_users": set()})
        bucket["active_users"].add(user_id)

    return {
        category_name: {
            "registered_count": int(values.get("registered_count") or 0),
            "reserved_count": len(values.get("active_users") or set()),
        }
        for category_name, values in usage.items()
    }


def serialize_category_with_registration(category: CompetitionCategory | dict, usage: dict[str, dict[str, int]]) -> dict:
    if isinstance(category, dict):
        payload = dict(category)
        category_name = str(payload.get("nombre") or "").strip()
    else:
        payload = category.model_dump()
        category_name = str(getattr(category, "nombre", "") or "").strip()

    max_capacity = normalize_capacity(payload.get("max_capacity"))
    registration_enabled = bool(int(payload.get("registration_enabled", 1) or 0))
    counts = usage.get(category_name, {})
    registered_count = int(counts.get("registered_count") or 0)
    reserved_count = int(counts.get("reserved_count") or registered_count)

    if not registration_enabled:
        status = "closed_by_organizer"
    elif max_capacity is not None and reserved_count >= max_capacity:
        status = "full"
    else:
        status = "open"

    payload["max_capacity"] = max_capacity
    payload["registration_enabled"] = registration_enabled
    payload["registered_count"] = registered_count
    payload["reserved_count"] = reserved_count
    payload["registration_status"] = status
    payload["available_spots"] = None if max_capacity is None else max(0, max_capacity - reserved_count)
    return payload


def ensure_category_registration_available(
    session: Session,
    competition_id: int,
    category: CompetitionCategory,
    *,
    user_id: int | None = None,
) -> None:
    if not bool(int(getattr(category, "registration_enabled", 1) or 0)):
        raise HTTPException(403, "Las inscripciones para esta categoria estan cerradas")

    max_capacity = normalize_capacity(getattr(category, "max_capacity", None))
    if max_capacity is None:
        return

    usage = get_category_usage(session, competition_id)
    category_name = str(getattr(category, "nombre", "") or "").strip()
    reserved_count = int((usage.get(category_name) or {}).get("reserved_count") or 0)
    if user_id is not None:
        subtracted_current_user = False
        existing = session.get(CompetitionParticipant, (competition_id, user_id))
        existing_category = str(getattr(existing, "categoria", "") or "").strip() if existing else ""
        existing_state = str(getattr(existing, "estado", "") or "").strip().lower() if existing else ""
        if existing_category == category_name and existing_state in ACTIVE_ENROLLMENT_STATES:
            reserved_count = max(0, reserved_count - 1)
            subtracted_current_user = True
        now = datetime.now(timezone.utc)
        user_intents = session.exec(
            select(CompetitionPaymentIntent)
            .where(CompetitionPaymentIntent.competition_id == competition_id)
            .where(CompetitionPaymentIntent.user_id == user_id)
            .where(CompetitionPaymentIntent.categoria == category_name)
        ).all()
        if not subtracted_current_user and any(_intent_is_active(intent, now) for intent in user_intents):
            reserved_count = max(0, reserved_count - 1)

    if reserved_count >= max_capacity:
        raise HTTPException(409, "Esta categoria ya no tiene cupos disponibles")
