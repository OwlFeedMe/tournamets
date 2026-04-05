from fastapi import HTTPException
from sqlmodel import Session, select

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
    return bool(user and user.get("role") == "admin")


def is_organizer_user(user: dict | None) -> bool:
    return bool(user and user.get("role") == "organizer")


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


def organizer_can_access_competition(session: Session, competition_id: int, user: dict | None) -> bool:
    if not is_organizer_user(user):
        return True
    app_user_id = get_app_user_id(user)
    if app_user_id is None:
        return False
    competition = session.get(Competition, competition_id)
    return bool(competition and int(competition.organizer_user_id or 0) == app_user_id)


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
