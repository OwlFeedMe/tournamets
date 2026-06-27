from __future__ import annotations

from datetime import datetime, timezone
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError


DEFAULT_COMPETITION_TIMEZONE = "America/Bogota"


def normalize_timezone(value: object, *, default: str = DEFAULT_COMPETITION_TIMEZONE) -> str:
    timezone_name = str(value or "").strip() or default
    try:
        ZoneInfo(timezone_name)
    except ZoneInfoNotFoundError as exc:
        raise ValueError(f"Zona horaria invalida: {timezone_name}") from exc
    return timezone_name


def competition_timezone(value: object) -> ZoneInfo:
    return ZoneInfo(normalize_timezone(value))


def to_utc_from_competition_time(value: datetime | None, timezone_name: object) -> datetime | None:
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=competition_timezone(timezone_name)).astimezone(timezone.utc)
    return value.astimezone(timezone.utc)
