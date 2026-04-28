import re
import unicodedata

from sqlmodel import Session, select

from constants import ATHLETE_USERNAME_RESERVED
from models import AthleteUsernameAlias, Participant

USERNAME_REGEX = re.compile(r"^[a-z0-9](?:[a-z0-9._]{1,26}[a-z0-9])?$")
EMAIL_LIKE_REGEX = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")


def build_default_display_name(participant: Participant | None) -> str:
    if not participant:
        return ""
    full_name = f"{(participant.nombre or '').strip()} {(participant.apellido or '').strip()}".strip()
    return full_name or str(participant.display_name or "").strip() or "Atleta"


def slugify_username_seed(value: str | None) -> str:
    normalized = unicodedata.normalize("NFKD", str(value or ""))
    ascii_str = normalized.encode("ascii", "ignore").decode("ascii")
    lowered = ascii_str.lower()
    lowered = re.sub(r"[^a-z0-9._]+", ".", lowered)
    lowered = re.sub(r"\.+", ".", lowered).strip(".")
    if not lowered:
        lowered = "athlete"
    if len(lowered) < 3:
        lowered = f"{lowered}.fr"
    return lowered[:28].strip(".") or "athlete"


def build_public_username_seed(participant: Participant | None, fallback: str | None = None) -> str:
    if participant:
        full_name = f"{(participant.nombre or '').strip()} {(participant.apellido or '').strip()}".strip()
        if full_name:
            return full_name
        display_name = str(participant.display_name or "").strip()
        if display_name and not is_sensitive_username(display_name, cedula=participant.cedula):
            return display_name
    fallback_value = str(fallback or "").strip()
    if fallback_value and not is_sensitive_username(fallback_value):
        return fallback_value
    return "atleta"


def normalize_requested_username(value: str | None) -> str:
    seed = slugify_username_seed(value)
    seed = seed.replace("..", ".")
    if not USERNAME_REGEX.fullmatch(seed):
        seed = re.sub(r"[^a-z0-9._]", ".", seed)
        seed = re.sub(r"\.+", ".", seed).strip(".")
    if len(seed) < 3:
        seed = f"{seed}fr"
    seed = seed[:28].strip(".")
    if len(seed) < 3:
        seed = "athlete"
    return seed


def is_sensitive_username(value: str | None, cedula: str | None = None) -> bool:
    normalized = str(value or "").strip().lower()
    if not normalized:
        return False
    if EMAIL_LIKE_REGEX.fullmatch(normalized):
        return True
    if normalized.startswith("pending:"):
        return True
    clean_cedula = str(cedula or "").strip().lower()
    if clean_cedula and normalized == clean_cedula:
        return True
    return normalized.isdigit()


def is_reserved_username(value: str | None) -> bool:
    normalized = str(value or "").strip().lower()
    return not normalized or normalized in ATHLETE_USERNAME_RESERVED


def is_username_format_valid(value: str | None) -> bool:
    normalized = str(value or "").strip().lower()
    return bool(USERNAME_REGEX.fullmatch(normalized)) and not normalized.isdigit()


def find_user_by_username(session: Session, username: str) -> Participant | None:
    normalized = str(username or "").strip().lower()
    if not normalized:
        return None
    return session.exec(
        select(Participant).where(Participant.username == normalized)
    ).first()


def find_user_by_alias(session: Session, username: str) -> Participant | None:
    normalized = str(username or "").strip().lower()
    if not normalized:
        return None
    alias = session.exec(
        select(AthleteUsernameAlias).where(AthleteUsernameAlias.alias == normalized)
    ).first()
    if not alias:
        return None
    return session.get(Participant, alias.user_id)


def is_username_available(session: Session, username: str, exclude_user_id: int | None = None) -> bool:
    normalized = str(username or "").strip().lower()
    if not normalized or is_reserved_username(normalized) or not is_username_format_valid(normalized):
        return False
    existing = find_user_by_username(session, normalized)
    if existing and int(existing.id or 0) != int(exclude_user_id or 0):
        return False
    alias = session.exec(
        select(AthleteUsernameAlias).where(AthleteUsernameAlias.alias == normalized)
    ).first()
    if alias and int(alias.user_id or 0) != int(exclude_user_id or 0):
        return False
    return True


def suggest_usernames(session: Session, seed_value: str | None, exclude_user_id: int | None = None, limit: int = 4) -> list[str]:
    base = normalize_requested_username(seed_value)
    suggestions: list[str] = []
    if is_username_available(session, base, exclude_user_id=exclude_user_id):
        suggestions.append(base)
    suffix = 2
    compact_base = base[:26].rstrip(".") or "atleta"
    while len(suggestions) < limit and suffix < 100:
        suffix_str = str(suffix)
        candidate = f"{compact_base[:max(1, 28 - len(suffix_str))]}{suffix_str}"
        if is_username_available(session, candidate, exclude_user_id=exclude_user_id):
            suggestions.append(candidate)
        suffix += 1
    return suggestions


def ensure_unique_username(session: Session, seed_value: str | None, exclude_user_id: int | None = None) -> str:
    suggestions = suggest_usernames(session, seed_value, exclude_user_id=exclude_user_id, limit=1)
    if suggestions:
        return suggestions[0]
    return f"atleta{exclude_user_id or 1}"
