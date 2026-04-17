from auth import get_current_user_id
from fastapi import HTTPException
from sqlmodel import Session, select

from auth import has_admin_access, has_organizer_access
from constants import Role
from models import Competition, CompetitionJudgeAssignment


def get_user_id(user: dict | None) -> int | None:
    return get_current_user_id(user)


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
    user_id = get_user_id(user)
    if user_id is None:
        return []
    rows = session.exec(
        select(Competition.id).where(Competition.organizer_user_id == user_id)
    ).all()
    return [int(row) for row in rows]


def require_competition_access(session: Session, competition_id: int, user: dict | None) -> Competition:
    competition = session.get(Competition, competition_id)
    if not competition:
        raise HTTPException(404, "Competencia no encontrada")
    if is_admin_user(user):
        return competition
    if is_organizer_user(user):
        user_id = get_user_id(user)
        if user_id is None or int(competition.organizer_user_id or 0) != user_id:
            raise HTTPException(403, "No tienes acceso a esta competencia")
    return competition


def get_active_judge_assignment(
    session: Session,
    competition_id: int,
    user: dict | None,
) -> CompetitionJudgeAssignment | None:
    user_id = get_user_id(user)
    if user_id is None:
        return None
    return session.exec(
        select(CompetitionJudgeAssignment).where(
            CompetitionJudgeAssignment.competition_id == competition_id,
            CompetitionJudgeAssignment.user_id == user_id,
            CompetitionJudgeAssignment.status == "active",
        )
    ).first()


def has_competition_judge_access(session: Session, competition_id: int, user: dict | None) -> bool:
    return get_active_judge_assignment(session, competition_id, user) is not None


def require_competition_operator_access(session: Session, competition_id: int, user: dict | None) -> Competition:
    competition = session.get(Competition, competition_id)
    if not competition:
        raise HTTPException(404, "Competencia no encontrada")
    if is_admin_user(user):
        return competition
    if is_organizer_user(user):
        user_id = get_user_id(user)
        if user_id is not None and int(competition.organizer_user_id or 0) == user_id:
            return competition
    if has_competition_judge_access(session, competition_id, user):
        return competition
    raise HTTPException(403, "No tienes acceso a esta competencia")
