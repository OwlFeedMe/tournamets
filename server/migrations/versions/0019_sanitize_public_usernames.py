"""sanitize public usernames

Revision ID: 0019_sanitize_public_usernames
Revises: 0018_athlete_public_profiles
Create Date: 2026-04-27
"""

import re
import unicodedata

from alembic import op
from sqlalchemy import text


revision = "0019_sanitize_public_usernames"
down_revision = "0018_athlete_public_profiles"
branch_labels = None
depends_on = None

EMAIL_LIKE_REGEX = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")


def _slugify(value: str | None) -> str:
    normalized = unicodedata.normalize("NFKD", str(value or ""))
    ascii_str = normalized.encode("ascii", "ignore").decode("ascii")
    lowered = ascii_str.lower()
    lowered = re.sub(r"[^a-z0-9._]+", ".", lowered)
    lowered = re.sub(r"\.+", ".", lowered).strip(".")
    if not lowered:
        lowered = "atleta"
    if len(lowered) < 3:
        lowered = f"{lowered}fr"
    return lowered[:28].strip(".") or "atleta"


def _is_sensitive(value: str | None, cedula: str | None = None) -> bool:
    normalized = str(value or "").strip().lower()
    if not normalized:
        return True
    if EMAIL_LIKE_REGEX.fullmatch(normalized):
        return True
    if normalized.startswith("pending:"):
        return True
    clean_cedula = str(cedula or "").strip().lower()
    if clean_cedula and normalized == clean_cedula:
        return True
    return normalized.isdigit()


def _seed_for_row(row) -> str:
    full_name = f"{str(row.nombre or '').strip()} {str(row.apellido or '').strip()}".strip()
    if full_name:
        return full_name
    display_name = str(row.display_name or "").strip()
    if display_name and not _is_sensitive(display_name, row.cedula):
        return display_name
    return "atleta"


def _next_username(seed: str, used: set[str]) -> str:
    base = _slugify(seed)
    if base not in used and not base.isdigit():
        used.add(base)
        return base
    suffix = 2
    compact_base = base[:26].rstrip(".") or "atleta"
    while True:
        suffix_str = str(suffix)
        candidate = f"{compact_base[:max(1, 28 - len(suffix_str))]}{suffix_str}"
        if candidate not in used and not candidate.isdigit():
            used.add(candidate)
            return candidate
        suffix += 1


def upgrade() -> None:
    bind = op.get_bind()

    alias_rows = bind.execute(text("""
        SELECT id, alias
        FROM athlete_username_aliases
    """)).fetchall()
    for row in alias_rows:
        if _is_sensitive(row.alias):
            bind.execute(
                text("DELETE FROM athlete_username_aliases WHERE id = :id"),
                {"id": row.id},
            )

    participant_rows = bind.execute(text("""
        SELECT id, nombre, apellido, display_name, cedula, username
        FROM participants
        ORDER BY id
    """)).fetchall()

    used: set[str] = set()
    for row in participant_rows:
        current = str(row.username or "").strip().lower()
        if current and not _is_sensitive(current, row.cedula):
            used.add(current)

    for row in participant_rows:
        current = str(row.username or "").strip().lower()
        if current and not _is_sensitive(current, row.cedula):
            continue
        next_username = _next_username(_seed_for_row(row), used)
        bind.execute(
            text("UPDATE participants SET username = :username WHERE id = :id"),
            {"id": row.id, "username": next_username},
        )


def downgrade() -> None:
    pass
