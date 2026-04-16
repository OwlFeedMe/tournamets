from fastapi import HTTPException
from sqlmodel import Session, select

from auth import has_admin_access, has_organizer_access
from constants import Role
from models import Competition


def get_app_user_id(user: dict | None) -> int | None:
    if not user:
        return None
    app_user_id = user.get("app_user_id")
    try:
        return int(app_user_id) if app_user_id is not None else None
    except (TypeError, ValueError):
        return None


def is_admin_user(user: dict | None) -> bool:
    return has_admin_access(user)


def is_organizer_user(user: dict | None) -> bool:
    if not user:
        return False
    if user.get("role") == Role.ORGANIZER:
        return True
    return user.get("staff_mode") == Role.ORGANIZER and has_organizer_access(user)


def get_owned_competition_ids(session: Session, user: dict | None) -> list[int]:
    if not is_organizer_user(user):
        return []
    app_user_id = get_app_user_id(user)
    if app_user_id is None:
        return []
    rows = session.exec(
        select(Competition.id).where(Competition.organizer_user_id == app_user_id)
    ).all()
    return [int(row) for row in rows]


def require_competition_access(session: Session, competition_id: int, user: dict | None) -> Competition:
    competition = session.get(Competition, competition_id)
    if not competition:
        raise HTTPException(404, "Competencia no encontrada")
    if is_admin_user(user):
        return competition
    if is_organizer_user(user):
        app_user_id = get_app_user_id(user)
        if app_user_id is None or int(competition.organizer_user_id or 0) != app_user_id:
            raise HTTPException(403, "No tienes acceso a esta competencia")
    return competition
