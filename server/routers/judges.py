import json
import re
from datetime import datetime, timezone

from fastapi import APIRouter, Body, Depends, HTTPException
from sqlalchemy import func, or_
from sqlalchemy.exc import IntegrityError
from sqlmodel import Session, select

from access import get_active_judge_assignment, get_app_user_id, require_competition_access
from auth import invalidate_app_user, require_auth, require_staff
from database import get_session
from models import AppUser, Competition, CompetitionJudgeActionAudit, CompetitionJudgeAssignment, Participant

router = APIRouter(tags=["judges"])

EMAIL_REGEX = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _normalize_email(value: str | None) -> str:
    email = str(value or "").strip().lower()
    if not email or not EMAIL_REGEX.fullmatch(email):
        raise HTTPException(400, "Ingresa un email valido")
    return email


def _serialize_audit(item: CompetitionJudgeActionAudit) -> dict:
    payload = item.model_dump()
    if item.meta_json:
        try:
            payload["meta"] = json.loads(item.meta_json)
        except Exception:
            payload["meta"] = None
    else:
        payload["meta"] = None
    return payload


def _append_judge_audit(
    session: Session,
    *,
    competition_id: int,
    action: str,
    result: str,
    judge_assignment_id: int | None = None,
    actor_app_user_id: int | None = None,
    target_type: str | None = None,
    target_id: str | None = None,
    meta: dict | None = None,
) -> None:
    session.add(
        CompetitionJudgeActionAudit(
            competition_id=competition_id,
            judge_assignment_id=judge_assignment_id,
            actor_app_user_id=actor_app_user_id,
            action=action,
            target_type=target_type,
            target_id=target_id,
            result=result,
            meta_json=json.dumps(meta or {}, ensure_ascii=False) if meta is not None else None,
        )
    )


def _sync_judge_enabled_flag(session: Session, app_user_id: int | None) -> None:
    if app_user_id is None:
        return
    app_user = session.get(AppUser, int(app_user_id))
    if not app_user:
        return
    active_count = int(
        session.exec(
            select(func.count(CompetitionJudgeAssignment.id)).where(
                CompetitionJudgeAssignment.app_user_id == int(app_user_id),
                CompetitionJudgeAssignment.status == "active",
            )
        ).one()
        or 0
    )
    next_value = 1 if active_count > 0 else 0
    if int(app_user.judge_enabled or 0) != next_value:
        app_user.judge_enabled = next_value
        session.add(app_user)
        invalidate_app_user(app_user.id)


def _assignment_payload(session: Session, assignment: CompetitionJudgeAssignment) -> dict:
    competition = session.get(Competition, assignment.competition_id)
    app_user = session.get(AppUser, assignment.app_user_id) if assignment.app_user_id else None
    participant = app_user
    invited_by = session.get(AppUser, assignment.invited_by_app_user_id)
    return {
        **assignment.model_dump(),
        "competition_name": competition.nombre if competition else f"Competencia {assignment.competition_id}",
        "judge_display_name": app_user.display_name if app_user else None,
        "judge_username": app_user.username if app_user else None,
        "judge_participant_name": (
            f"{(participant.nombre or '').strip()} {(participant.apellido or '').strip()}".strip()
            if participant
            else None
        ),
        "invited_by_display_name": invited_by.display_name if invited_by else None,
    }


def _current_user_emails(session: Session, user: dict) -> set[str]:
    values: set[str] = set()
    username = str(user.get("username") or "").strip().lower()
    if username and EMAIL_REGEX.fullmatch(username):
        values.add(username)
    app_user_id = get_app_user_id(user)
    if app_user_id is not None:
        app_user = session.get(AppUser, app_user_id)
        if app_user and app_user.username and EMAIL_REGEX.fullmatch(app_user.username.strip().lower()):
            values.add(app_user.username.strip().lower())
        if app_user and app_user.email and EMAIL_REGEX.fullmatch(app_user.email.strip().lower()):
            values.add(app_user.email.strip().lower())
    return values


def _resolve_my_assignment(session: Session, assignment_id: int, user: dict) -> CompetitionJudgeAssignment:
    assignment = session.get(CompetitionJudgeAssignment, assignment_id)
    if not assignment:
        raise HTTPException(404, "Invitacion no encontrada")
    app_user_id = get_app_user_id(user)
    current_emails = _current_user_emails(session, user)
    if assignment.app_user_id is not None and app_user_id is not None and int(assignment.app_user_id) == int(app_user_id):
        return assignment
    if assignment.invited_email and assignment.invited_email.lower() in current_emails:
        return assignment
    raise HTTPException(403, "No tienes acceso a esta invitacion")


@router.post("/api/competitions/{competition_id}/judges/invite", status_code=201)
def invite_judge(
    competition_id: int,
    body: dict = Body(...),
    session: Session = Depends(get_session),
    user=Depends(require_staff),
):
    competition = require_competition_access(session, competition_id, user)
    inviter_app_user_id = get_app_user_id(user)
    if inviter_app_user_id is None:
        raise HTTPException(403, "No se pudo resolver el organizador actual")

    invited_email = _normalize_email(body.get("email"))
    target_app_user = session.exec(
        select(AppUser).where(
            or_(
                func.lower(func.coalesce(AppUser.username, "")) == invited_email,
                func.lower(func.coalesce(AppUser.email, "")) == invited_email,
            ),
            AppUser.is_active == 1,
        )
    ).first()

    if target_app_user and int(target_app_user.id or 0) == inviter_app_user_id:
        raise HTTPException(400, "No puedes invitarte como juez")

    existing = session.exec(
        select(CompetitionJudgeAssignment).where(
            CompetitionJudgeAssignment.competition_id == competition_id,
            or_(
                CompetitionJudgeAssignment.invited_email == invited_email,
                CompetitionJudgeAssignment.app_user_id == (target_app_user.id if target_app_user else -1),
            ),
        )
    ).first()

    if existing and existing.status in {"pending", "active"}:
        raise HTTPException(409, "Ese juez ya esta invitado o activo en esta competencia")

    if existing:
        existing.app_user_id = target_app_user.id if target_app_user else existing.app_user_id
        existing.invited_email = invited_email
        existing.status = "pending"
        existing.invited_by_app_user_id = inviter_app_user_id
        existing.accepted_at = None
        existing.rejected_at = None
        existing.revoked_at = None
        assignment = existing
    else:
        assignment = CompetitionJudgeAssignment(
            competition_id=competition_id,
            app_user_id=target_app_user.id if target_app_user else None,
            invited_email=invited_email,
            invited_by_app_user_id=inviter_app_user_id,
            status="pending",
        )
        session.add(assignment)

    _append_judge_audit(
        session,
        competition_id=competition_id,
        judge_assignment_id=assignment.id,
        actor_app_user_id=inviter_app_user_id,
        action="judge_invited",
        result="accepted",
        target_type="email",
        target_id=invited_email,
        meta={"competition_name": competition.nombre},
    )
    try:
        session.commit()
    except IntegrityError:
        session.rollback()
        raise HTTPException(409, "Ya existe una invitacion para este correo en esta competencia")
    session.refresh(assignment)
    return _assignment_payload(session, assignment)


@router.get("/api/competitions/{competition_id}/judges")
def list_competition_judges(
    competition_id: int,
    session: Session = Depends(get_session),
    user=Depends(require_staff),
):
    require_competition_access(session, competition_id, user)
    rows = session.exec(
        select(CompetitionJudgeAssignment)
        .where(CompetitionJudgeAssignment.competition_id == competition_id)
        .order_by(CompetitionJudgeAssignment.created_at.desc(), CompetitionJudgeAssignment.id.desc())
    ).all()
    return [_assignment_payload(session, row) for row in rows]


@router.delete("/api/competitions/{competition_id}/judges/{assignment_id}")
def revoke_competition_judge(
    competition_id: int,
    assignment_id: int,
    session: Session = Depends(get_session),
    user=Depends(require_staff),
):
    require_competition_access(session, competition_id, user)
    assignment = session.get(CompetitionJudgeAssignment, assignment_id)
    if not assignment or int(assignment.competition_id) != int(competition_id):
        raise HTTPException(404, "Asignacion no encontrada")
    if assignment.status == "revoked":
        return {"ok": True, "status": "revoked"}
    assignment.status = "revoked"
    assignment.revoked_at = _utcnow()
    session.add(assignment)
    _append_judge_audit(
        session,
        competition_id=competition_id,
        judge_assignment_id=assignment.id,
        actor_app_user_id=get_app_user_id(user),
        action="judge_revoked",
        result="accepted",
        target_type="assignment",
        target_id=str(assignment.id),
        meta={"invited_email": assignment.invited_email},
    )
    _sync_judge_enabled_flag(session, assignment.app_user_id)
    session.commit()
    return {"ok": True, "status": "revoked"}


@router.get("/api/competitions/{competition_id}/judge-audit")
def list_competition_judge_audit(
    competition_id: int,
    session: Session = Depends(get_session),
    user=Depends(require_staff),
):
    require_competition_access(session, competition_id, user)
    rows = session.exec(
        select(CompetitionJudgeActionAudit)
        .where(CompetitionJudgeActionAudit.competition_id == competition_id)
        .order_by(CompetitionJudgeActionAudit.created_at.desc(), CompetitionJudgeActionAudit.id.desc())
    ).all()
    payload = []
    for row in rows:
        item = _serialize_audit(row)
        actor = session.get(AppUser, row.actor_app_user_id) if row.actor_app_user_id else None
        assignment = session.get(CompetitionJudgeAssignment, row.judge_assignment_id) if row.judge_assignment_id else None
        item["actor_display_name"] = actor.display_name if actor else None
        item["judge_invited_email"] = assignment.invited_email if assignment else None
        payload.append(item)
    return payload


@router.get("/api/me/judge-assignments")
def list_my_judge_assignments(
    session: Session = Depends(get_session),
    user=Depends(require_auth),
):
    app_user_id = get_app_user_id(user)
    current_emails = list(_current_user_emails(session, user))
    if app_user_id is None and not current_emails:
        return []
    query = select(CompetitionJudgeAssignment)
    filters = []
    if app_user_id is not None:
        filters.append(CompetitionJudgeAssignment.app_user_id == app_user_id)
    if current_emails:
        filters.append(CompetitionJudgeAssignment.invited_email.in_(current_emails))
    query = query.where(or_(*filters)).order_by(
        CompetitionJudgeAssignment.created_at.desc(),
        CompetitionJudgeAssignment.id.desc(),
    )
    rows = session.exec(query).all()
    return [_assignment_payload(session, row) for row in rows]


@router.post("/api/judge-assignments/{assignment_id}/accept")
def accept_judge_assignment(
    assignment_id: int,
    session: Session = Depends(get_session),
    user=Depends(require_auth),
):
    assignment = _resolve_my_assignment(session, assignment_id, user)
    if assignment.status == "revoked":
        raise HTTPException(409, "Esta invitacion ya fue revocada")
    if assignment.status == "active":
        return {"ok": True, "status": "active"}

    app_user_id = get_app_user_id(user)
    if app_user_id is None:
        raise HTTPException(403, "Necesitas una cuenta de app para aceptar esta invitacion")

    assignment.app_user_id = app_user_id
    assignment.status = "active"
    assignment.accepted_at = _utcnow()
    assignment.rejected_at = None
    assignment.revoked_at = None
    session.add(assignment)
    _append_judge_audit(
        session,
        competition_id=assignment.competition_id,
        judge_assignment_id=assignment.id,
        actor_app_user_id=app_user_id,
        action="judge_accepted",
        result="accepted",
        target_type="assignment",
        target_id=str(assignment.id),
    )
    app_user = session.get(AppUser, app_user_id)
    if app_user and int(app_user.judge_enabled or 0) != 1:
        app_user.judge_enabled = 1
        session.add(app_user)
        invalidate_app_user(app_user.id)
    session.commit()
    session.refresh(assignment)
    return _assignment_payload(session, assignment)


@router.post("/api/judge-assignments/{assignment_id}/reject")
def reject_judge_assignment(
    assignment_id: int,
    session: Session = Depends(get_session),
    user=Depends(require_auth),
):
    assignment = _resolve_my_assignment(session, assignment_id, user)
    if assignment.status == "revoked":
        raise HTTPException(409, "Esta invitacion ya fue revocada")
    if assignment.status == "rejected":
        return {"ok": True, "status": "rejected"}

    app_user_id = get_app_user_id(user)
    if app_user_id is not None and assignment.app_user_id is None:
        assignment.app_user_id = app_user_id
    assignment.status = "rejected"
    assignment.rejected_at = _utcnow()
    assignment.accepted_at = None
    session.add(assignment)
    _append_judge_audit(
        session,
        competition_id=assignment.competition_id,
        judge_assignment_id=assignment.id,
        actor_app_user_id=app_user_id,
        action="judge_rejected",
        result="accepted",
        target_type="assignment",
        target_id=str(assignment.id),
    )
    _sync_judge_enabled_flag(session, assignment.app_user_id)
    session.commit()
    session.refresh(assignment)
    return _assignment_payload(session, assignment)


def append_judge_action_audit(
    session: Session,
    *,
    competition_id: int,
    user: dict | None,
    action: str,
    result: str,
    target_type: str | None = None,
    target_id: str | None = None,
    meta: dict | None = None,
) -> None:
    assignment = get_active_judge_assignment(session, competition_id, user)
    actor_app_user_id = get_app_user_id(user)
    if assignment is None and actor_app_user_id is None:
        return
    _append_judge_audit(
        session,
        competition_id=competition_id,
        judge_assignment_id=assignment.id if assignment else None,
        actor_app_user_id=actor_app_user_id,
        action=action,
        result=result,
        target_type=target_type,
        target_id=target_id,
        meta=meta,
    )
