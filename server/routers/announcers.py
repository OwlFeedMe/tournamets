import re
import os
from datetime import datetime, timezone

from fastapi import APIRouter, Body, Depends, HTTPException
from sqlalchemy import func, or_, text
from sqlalchemy.exc import IntegrityError
from sqlmodel import Session, select

from access import get_user_id, require_competition_access
from auth import invalidate_user, require_auth, require_staff
from database import get_session
from models import Competition, CompetitionAnnouncerAssignment, Participant
from routers.leaderboard import _build_leaderboard_results_snapshot
from services.emailer import send_email
from services.email_templates import render_announcer_invitation

router = APIRouter(tags=["announcers"])

EMAIL_REGEX = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _normalize_email(value: str | None) -> str:
    email = str(value or "").strip().lower()
    if not email or not EMAIL_REGEX.fullmatch(email):
        raise HTTPException(400, "Ingresa un email valido")
    return email


def _current_user_emails(session: Session, user: dict) -> set[str]:
    values: set[str] = set()
    username = str(user.get("username") or "").strip().lower()
    if username and EMAIL_REGEX.fullmatch(username):
        values.add(username)
    user_id = get_user_id(user)
    if user_id is not None:
        target_user = session.get(Participant, user_id)
        if target_user and target_user.username and EMAIL_REGEX.fullmatch(target_user.username.strip().lower()):
            values.add(target_user.username.strip().lower())
        if target_user and target_user.email and EMAIL_REGEX.fullmatch(target_user.email.strip().lower()):
            values.add(target_user.email.strip().lower())
    return values


def _sync_announcer_enabled_flag(session: Session, user_id: int | None) -> None:
    if user_id is None:
        return
    target_user = session.get(Participant, int(user_id))
    if not target_user:
        return
    active_count = int(
        session.exec(
            select(func.count(CompetitionAnnouncerAssignment.id)).where(
                CompetitionAnnouncerAssignment.user_id == int(user_id),
                CompetitionAnnouncerAssignment.status == "active",
            )
        ).one()
        or 0
    )
    next_value = 1 if active_count > 0 else 0
    if int(target_user.announcer_enabled or 0) != next_value:
        target_user.announcer_enabled = next_value
        session.add(target_user)
        invalidate_user(target_user.id)


def _assignment_payload(session: Session, assignment: CompetitionAnnouncerAssignment) -> dict:
    competition = session.get(Competition, assignment.competition_id)
    target_user = session.get(Participant, assignment.user_id) if assignment.user_id else None
    invited_by = session.get(Participant, assignment.invited_by_user_id)
    participant_name = (
        f"{(target_user.nombre or '').strip()} {(target_user.apellido or '').strip()}".strip()
        if target_user
        else None
    )
    return {
        **assignment.model_dump(),
        "competition_name": competition.nombre if competition else f"Competencia {assignment.competition_id}",
        "announcer_display_name": target_user.display_name if target_user else None,
        "announcer_username": target_user.username if target_user else None,
        "announcer_participant_name": participant_name,
        "invited_by_display_name": invited_by.display_name if invited_by else None,
    }


def _resolve_my_assignment(session: Session, assignment_id: int, user: dict) -> CompetitionAnnouncerAssignment:
    assignment = session.get(CompetitionAnnouncerAssignment, assignment_id)
    if not assignment:
        raise HTTPException(404, "Invitacion no encontrada")
    user_id = get_user_id(user)
    current_emails = _current_user_emails(session, user)
    if assignment.user_id is not None and user_id is not None and int(assignment.user_id) == int(user_id):
        return assignment
    if assignment.invited_email and assignment.invited_email.lower() in current_emails:
        return assignment
    raise HTTPException(403, "No tienes acceso a esta invitacion")


def _require_announcer_competition_access(session: Session, competition_id: int, user: dict) -> CompetitionAnnouncerAssignment | None:
    try:
        require_competition_access(session, competition_id, user)
        return None
    except HTTPException:
        pass

    user_id = get_user_id(user)
    if user_id is None:
        raise HTTPException(403, "No tienes acceso de locutor a esta competencia")
    assignment = session.exec(
        select(CompetitionAnnouncerAssignment).where(
            CompetitionAnnouncerAssignment.competition_id == competition_id,
            CompetitionAnnouncerAssignment.user_id == user_id,
            CompetitionAnnouncerAssignment.status == "active",
        )
    ).first()
    if not assignment:
        raise HTTPException(403, "No tienes acceso de locutor a esta competencia")
    return assignment


@router.post("/api/competitions/{competition_id}/announcers/invite", status_code=201)
def invite_announcer(
    competition_id: int,
    body: dict = Body(...),
    session: Session = Depends(get_session),
    user=Depends(require_staff),
):
    competition = require_competition_access(session, competition_id, user)
    inviter_user_id = get_user_id(user)
    if inviter_user_id is None:
        raise HTTPException(403, "No se pudo resolver el organizador actual")

    invited_email = _normalize_email(body.get("email"))
    target_user = session.exec(
        select(Participant).where(
            or_(
                func.lower(func.coalesce(Participant.username, "")) == invited_email,
                func.lower(func.coalesce(Participant.email, "")) == invited_email,
            ),
            Participant.is_active == 1,
        )
    ).first()

    if target_user and int(target_user.id or 0) == inviter_user_id:
        raise HTTPException(400, "No puedes invitarte como locutor")

    existing = session.exec(
        select(CompetitionAnnouncerAssignment).where(
            CompetitionAnnouncerAssignment.competition_id == competition_id,
            or_(
                CompetitionAnnouncerAssignment.invited_email == invited_email,
                CompetitionAnnouncerAssignment.user_id == (target_user.id if target_user else -1),
            ),
        )
    ).first()

    if existing and existing.status in {"pending", "active"}:
        raise HTTPException(409, "Ese locutor ya esta invitado o activo en esta competencia")

    if existing:
        existing.user_id = target_user.id if target_user else existing.user_id
        existing.invited_email = invited_email
        existing.status = "pending"
        existing.invited_by_user_id = inviter_user_id
        existing.accepted_at = None
        existing.rejected_at = None
        existing.revoked_at = None
        assignment = existing
    else:
        assignment = CompetitionAnnouncerAssignment(
            competition_id=competition_id,
            user_id=target_user.id if target_user else None,
            invited_email=invited_email,
            invited_by_user_id=inviter_user_id,
            status="pending",
        )
        session.add(assignment)

    try:
        session.commit()
    except IntegrityError:
        session.rollback()
        raise HTTPException(409, "Ya existe una invitacion para este correo en esta competencia")
    session.refresh(assignment)

    inviter = session.get(Participant, inviter_user_id)
    inviter_name = (inviter.display_name or inviter.nombre or invited_email) if inviter else "El organizador"
    base_url = (os.getenv("LEADERBOARD_BASE_URL") or "https://finalrep.co/").rstrip("/")
    invitation_url = f"{base_url}/announcer"
    try:
        subject, text_body, html_body = render_announcer_invitation(
            nombre=invited_email,
            competition_name=competition.nombre,
            invited_by_name=inviter_name,
            invitation_url=invitation_url,
        )
        send_email(to_email=invited_email, subject=subject, text_body=text_body, html_body=html_body)
    except Exception:
        pass

    return _assignment_payload(session, assignment)


@router.get("/api/competitions/{competition_id}/announcers")
def list_competition_announcers(
    competition_id: int,
    session: Session = Depends(get_session),
    user=Depends(require_staff),
):
    require_competition_access(session, competition_id, user)
    rows = session.exec(
        select(CompetitionAnnouncerAssignment)
        .where(CompetitionAnnouncerAssignment.competition_id == competition_id)
        .order_by(CompetitionAnnouncerAssignment.created_at.desc(), CompetitionAnnouncerAssignment.id.desc())
    ).all()
    return [_assignment_payload(session, row) for row in rows]


@router.delete("/api/competitions/{competition_id}/announcers/{assignment_id}")
def revoke_competition_announcer(
    competition_id: int,
    assignment_id: int,
    session: Session = Depends(get_session),
    user=Depends(require_staff),
):
    require_competition_access(session, competition_id, user)
    assignment = session.get(CompetitionAnnouncerAssignment, assignment_id)
    if not assignment or int(assignment.competition_id) != int(competition_id):
        raise HTTPException(404, "Asignacion no encontrada")
    if assignment.status == "revoked":
        return {"ok": True, "status": "revoked"}
    assignment.status = "revoked"
    assignment.revoked_at = _utcnow()
    session.add(assignment)
    _sync_announcer_enabled_flag(session, assignment.user_id)
    session.commit()
    return {"ok": True, "status": "revoked"}


@router.get("/api/me/announcer-assignments")
def list_my_announcer_assignments(
    session: Session = Depends(get_session),
    user=Depends(require_auth),
):
    user_id = get_user_id(user)
    current_emails = list(_current_user_emails(session, user))
    if user_id is None and not current_emails:
        return []
    filters = []
    if user_id is not None:
        filters.append(CompetitionAnnouncerAssignment.user_id == user_id)
    if current_emails:
        filters.append(CompetitionAnnouncerAssignment.invited_email.in_(current_emails))
    rows = session.exec(
        select(CompetitionAnnouncerAssignment)
        .where(or_(*filters))
        .order_by(CompetitionAnnouncerAssignment.created_at.desc(), CompetitionAnnouncerAssignment.id.desc())
    ).all()
    return [_assignment_payload(session, row) for row in rows]


@router.post("/api/announcer-assignments/{assignment_id}/accept")
def accept_announcer_assignment(
    assignment_id: int,
    session: Session = Depends(get_session),
    user=Depends(require_auth),
):
    assignment = _resolve_my_assignment(session, assignment_id, user)
    if assignment.status == "revoked":
        raise HTTPException(409, "Esta invitacion ya fue revocada")
    if assignment.status == "active":
        return {"ok": True, "status": "active"}

    user_id = get_user_id(user)
    if user_id is None:
        raise HTTPException(403, "Necesitas una cuenta de app para aceptar esta invitacion")

    assignment.user_id = user_id
    assignment.status = "active"
    assignment.accepted_at = _utcnow()
    assignment.rejected_at = None
    assignment.revoked_at = None
    session.add(assignment)
    target_user = session.get(Participant, user_id)
    if target_user and int(target_user.announcer_enabled or 0) != 1:
        target_user.announcer_enabled = 1
        session.add(target_user)
        invalidate_user(target_user.id)
    session.commit()
    session.refresh(assignment)
    return _assignment_payload(session, assignment)


@router.post("/api/announcer-assignments/{assignment_id}/reject")
def reject_announcer_assignment(
    assignment_id: int,
    session: Session = Depends(get_session),
    user=Depends(require_auth),
):
    assignment = _resolve_my_assignment(session, assignment_id, user)
    if assignment.status == "revoked":
        raise HTTPException(409, "Esta invitacion ya fue revocada")
    if assignment.status == "rejected":
        return {"ok": True, "status": "rejected"}

    user_id = get_user_id(user)
    if user_id is not None and assignment.user_id is None:
        assignment.user_id = user_id
    assignment.status = "rejected"
    assignment.rejected_at = _utcnow()
    assignment.accepted_at = None
    session.add(assignment)
    _sync_announcer_enabled_flag(session, assignment.user_id)
    session.commit()
    session.refresh(assignment)
    return _assignment_payload(session, assignment)


@router.get("/api/announcer/competitions/{competition_id}/live")
def announcer_live_view(
    competition_id: int,
    session: Session = Depends(get_session),
    user=Depends(require_auth),
):
    _require_announcer_competition_access(session, competition_id, user)
    competition = session.get(Competition, competition_id)
    if not competition:
        raise HTTPException(404, "Competencia no encontrada")

    heats = session.execute(text("""
        SELECT
            h.id,
            h.phase_id,
            h.categoria,
            h.nombre,
            h.heat_number,
            h.lane_count,
            h.start_at,
            h.end_at,
            h.location_name,
            h.location_detail,
            h.note,
            p.nombre AS phase_name,
            p.estado AS phase_status,
            p.modality AS phase_modality,
            p.team_result_mode,
            COUNT(DISTINCT a.id)::int AS total_lanes,
            COUNT(DISTINCT CASE WHEN r.id IS NOT NULL THEN a.id END)::int AS scored_lanes
        FROM competition_heats h
        JOIN competition_phases p ON p.id = h.phase_id
        LEFT JOIN competition_heat_assignments a ON a.heat_id = h.id
        LEFT JOIN LATERAL (
            SELECT r.id
            FROM results r
            WHERE r.competition_id = h.competition_id
              AND r.phase_id = h.phase_id
              AND (
                (a.user_id IS NOT NULL AND r.user_id = a.user_id)
                OR (a.team_id IS NOT NULL AND r.team_id = a.team_id)
              )
            ORDER BY r.created_at DESC, r.id DESC
            LIMIT 1
        ) r ON TRUE
        WHERE h.competition_id = :cid
        GROUP BY h.id, p.id
        ORDER BY COALESCE(h.start_at, p.start_at), p.orden, h.heat_number, h.id
    """), {"cid": competition_id}).mappings().all()

    heat_ids = [int(row["id"]) for row in heats]
    assignments_by_heat: dict[int, list[dict]] = {heat_id: [] for heat_id in heat_ids}
    if heat_ids:
        assignments = session.execute(text("""
            SELECT
                a.heat_id,
                a.lane_number,
                a.user_id,
                a.team_id,
                p.nombre,
                p.apellido,
                p.display_name,
                p.box,
                cp.categoria AS participant_category,
                t.nombre AS team_name,
                r.id AS result_id,
                r.marca,
                r.extra,
                r.tiebreak,
                r.puntos,
                r.posicion,
                r.result_status
            FROM competition_heat_assignments a
            JOIN competition_heats h ON h.id = a.heat_id
            LEFT JOIN participants p ON p.id = a.user_id
            LEFT JOIN competition_participants cp
              ON cp.competition_id = h.competition_id AND cp.user_id = a.user_id
            LEFT JOIN teams t ON t.id = a.team_id
            LEFT JOIN LATERAL (
                SELECT r.*
                FROM results r
                WHERE r.competition_id = h.competition_id
                  AND r.phase_id = h.phase_id
                  AND (
                    (a.user_id IS NOT NULL AND r.user_id = a.user_id)
                    OR (a.team_id IS NOT NULL AND r.team_id = a.team_id)
                  )
                ORDER BY r.created_at DESC, r.id DESC
                LIMIT 1
            ) r ON TRUE
            WHERE a.heat_id = ANY(:heat_ids)
            ORDER BY a.heat_id, a.lane_number, a.id
        """), {"heat_ids": heat_ids}).mappings().all()
        for row in assignments:
            display_name = (row["display_name"] or f"{row['nombre'] or ''} {row['apellido'] or ''}").strip()
            assignments_by_heat[int(row["heat_id"])].append({
                "lane_number": row["lane_number"],
                "user_id": row["user_id"],
                "team_id": row["team_id"],
                "display_name": display_name or row["team_name"] or "Participante",
                "box": row["box"],
                "category": row["participant_category"],
                "team_name": row["team_name"],
                "result": {
                    "id": row["result_id"],
                    "marca": row["marca"],
                    "extra": row["extra"],
                    "tiebreak": row["tiebreak"],
                    "puntos": row["puntos"],
                    "posicion": row["posicion"],
                    "status": row["result_status"],
                } if row["result_id"] is not None else None,
            })

    heat_payload = []
    for row in heats:
        heat_id = int(row["id"])
        heat_payload.append({
            "id": heat_id,
            "phase_id": row["phase_id"],
            "phase_name": row["phase_name"],
            "phase_status": row["phase_status"],
            "phase_modality": row["phase_modality"],
            "team_result_mode": row["team_result_mode"],
            "category": row["categoria"],
            "name": row["nombre"],
            "heat_number": row["heat_number"],
            "lane_count": row["lane_count"],
            "start_at": row["start_at"].isoformat() if row["start_at"] else None,
            "end_at": row["end_at"].isoformat() if row["end_at"] else None,
            "location_name": row["location_name"],
            "location_detail": row["location_detail"],
            "note": row["note"],
            "total_lanes": row["total_lanes"],
            "scored_lanes": row["scored_lanes"],
            "assignments": assignments_by_heat.get(heat_id, []),
        })

    leaderboard = _build_leaderboard_results_snapshot(competition_id, session)
    return {
        "competition": {
            "id": competition.id,
            "nombre": competition.nombre,
            "lugar": competition.lugar,
            "fecha": competition.competition_start.isoformat() if competition.competition_start else None,
            "competition_start": competition.competition_start.isoformat() if competition.competition_start else None,
            "competition_end": competition.competition_end.isoformat() if competition.competition_end else None,
        },
        "heats": heat_payload,
        "leaderboard": leaderboard,
    }
