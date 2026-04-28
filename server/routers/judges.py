import json
import base64
import hashlib
import hmac
import os
import re
from datetime import datetime, timezone
from urllib.parse import parse_qs, urlparse

from fastapi import APIRouter, Body, Depends, HTTPException, Query
from sqlalchemy import func, or_
from sqlalchemy.exc import IntegrityError
from sqlmodel import Session, select

from access import get_active_judge_assignment, get_user_id, require_competition_access, require_competition_operator_access
from auth import invalidate_user, require_auth, require_staff
from services.emailer import send_email
from services.email_templates import render_judge_invitation
from competition_rules import normalize_phase_measurement_method
from database import get_session
from models import (
    Competition,
    CompetitionHeat,
    CompetitionHeatAssignment,
    CompetitionJudgeActionAudit,
    CompetitionJudgeAssignment,
    CompetitionParticipant,
    CompetitionPhase,
    Participant,
    Result,
    Team,
    TeamMember,
)
from phase_status import recompute_and_persist_phase_status
from routers.results import (
    _normalize_team_result_mode,
    _participant_team_in_competition,
    _recompute_phase_positions_and_points,
    _team_categories_map,
)

router = APIRouter(tags=["judges"])

EMAIL_REGEX = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _normalize_email(value: str | None) -> str:
    email = str(value or "").strip().lower()
    if not email or not EMAIL_REGEX.fullmatch(email):
        raise HTTPException(400, "Ingresa un email valido")
    return email


def _b64url_decode(raw: str) -> bytes:
    padded = raw + "=" * (-len(raw) % 4)
    return base64.urlsafe_b64decode(padded.encode("ascii"))


def _extract_score_token(raw: str | None) -> str:
    value = str(raw or "").strip()
    if not value:
        return ""
    if value.startswith("http://") or value.startswith("https://"):
        try:
            query = parse_qs(urlparse(value).query)
            candidate = str((query.get("token") or [""])[0]).strip()
            return candidate or value
        except Exception:
            return value
    if "token=" in value:
        try:
            query = parse_qs(value if value.startswith("token=") else value.split("?", 1)[-1])
            candidate = str((query.get("token") or [""])[0]).strip()
            if candidate:
                return candidate
        except Exception:
            pass
    return value


def _judge_score_secret() -> str:
    value = (os.getenv("CHECKIN_QR_SECRET") or os.getenv("SECRET_KEY") or "").strip()
    if not value:
        raise HTTPException(500, "Falta CHECKIN_QR_SECRET o SECRET_KEY en el servidor")
    return value


def _parse_judge_score_token(token: str | None) -> tuple[dict, str]:
    extracted = _extract_score_token(token)
    if "." not in extracted:
        raise HTTPException(400, "Token QR invalido")
    payload_b64, signature_b64 = extracted.split(".", 1)
    expected_sig = hmac.new(_judge_score_secret().encode("utf-8"), payload_b64.encode("utf-8"), hashlib.sha256).digest()
    try:
        received_sig = _b64url_decode(signature_b64)
    except Exception:
        raise HTTPException(400, "Firma de token invalida")
    if not hmac.compare_digest(expected_sig, received_sig):
        raise HTTPException(400, "Firma de token invalida")
    try:
        payload = json.loads(_b64url_decode(payload_b64).decode("utf-8"))
    except Exception:
        raise HTTPException(400, "Token QR invalido")
    if not isinstance(payload, dict):
        raise HTTPException(400, "Token QR invalido")
    if str(payload.get("scope") or "") != "judge_score":
        raise HTTPException(400, "Token no corresponde a puntuacion")
    required = ("c", "p", "ph", "exp")
    if not all(payload.get(key) is not None for key in required):
        raise HTTPException(400, "Token incompleto")
    now_ts = int(_utcnow().timestamp())
    if int(payload.get("exp") or 0) < now_ts:
        raise HTTPException(409, "Token QR expirado")
    return payload, extracted


def _result_from_token(session: Session, *, competition_id: int, phase_id: int, user_id: int) -> Result | None:
    return session.exec(
        select(Result)
        .where(
            Result.competition_id == competition_id,
            Result.phase_id == phase_id,
            Result.user_id == user_id,
        )
        .order_by(Result.created_at.desc(), Result.id.desc())
    ).first()


def _resolve_result_judge_meta(session: Session, result_id: int) -> tuple[str | None, str | None]:
    audit = session.exec(
        select(CompetitionJudgeActionAudit)
        .where(
            CompetitionJudgeActionAudit.target_type == "result",
            CompetitionJudgeActionAudit.target_id == str(result_id),
            CompetitionJudgeActionAudit.action.in_(["judge_score_submitted", "judge_score_edited"]),
        )
        .order_by(CompetitionJudgeActionAudit.created_at.desc(), CompetitionJudgeActionAudit.id.desc())
    ).first()
    if not audit:
        return None, None
    actor = session.get(Participant, int(audit.actor_user_id)) if audit.actor_user_id else None
    return (actor.display_name if actor else None), (audit.created_at.isoformat() if audit.created_at else None)


def _score_payload(session: Session, *, competition_id: int, phase_id: int, user_id: int, result: Result | None) -> dict:
    participant = session.get(Participant, user_id)
    phase = session.get(CompetitionPhase, phase_id)
    measurement_method = normalize_phase_measurement_method(getattr(phase, "measurement_method", None), getattr(phase, "tipo", None))
    user_payload = {
        "id": user_id,
        "user_id": user_id,
        "name": (
            f"{(participant.nombre or '').strip()} {(participant.apellido or '').strip()}".strip()
            if participant
            else f"Usuario {user_id}"
        ),
        "category": str(participant.categoria or "").strip() if participant else "",
    }
    payload = {
        "competition_id": competition_id,
        "phase": {
            "id": phase_id,
            "name": str(phase.nombre or "").strip() if phase else f"Fase {phase_id}",
            "tipo": str(getattr(phase, "tipo", None) or "").strip().lower() if phase else "cantidad",
            "measurement_method": measurement_method,
            "modality": str(getattr(phase, "modality", None) or "individual").strip().lower() if phase else "individual",
            "team_result_mode": str(getattr(phase, "team_result_mode", None) or "sum_two").strip().lower() if phase else "sum_two",
            "allow_multiple_results": int(getattr(phase, "allow_multiple_results", 0) or 0) if phase else 0,
        },
        "user_id": user_id,
        "user": user_payload,
    }
    if result:
        judge_name, judge_at = _resolve_result_judge_meta(session, int(result.id))
        payload["existing"] = {
            "result_id": int(result.id),
            "marca": int(result.marca) if result.marca is not None else None,
            "formatted_mark": _format_mark_for_phase(result.marca, phase),
            "puntos": int(result.puntos or 0),
            "posicion": int(result.posicion) if result.posicion is not None else None,
            "created_at": result.created_at.isoformat() if result.created_at else None,
            "judge_name": judge_name,
            "judge_at": judge_at,
        }
    else:
        payload["existing"] = None
    return payload


def _score_payload_for_entity(
    session: Session,
    *,
    competition_id: int,
    phase_id: int,
    user_id: int | None,
    team_id: int | None,
    result: Result | None,
) -> dict:
    if user_id is not None:
        payload = _score_payload(
            session,
            competition_id=competition_id,
            phase_id=phase_id,
            user_id=user_id,
            result=result,
        )
        payload["entity_type"] = "user"
        payload["team"] = None
        if team_id is not None:
            team = session.get(Team, team_id)
            payload["team"] = {
                "id": team_id,
                "name": str(getattr(team, "nombre", None) or f"Equipo {team_id}").strip(),
            }
        return payload

    phase = session.get(CompetitionPhase, phase_id)
    team = session.get(Team, team_id) if team_id is not None else None
    team_category = _team_categories_map(session, competition_id, {int(team_id)}) if team_id is not None else {}
    measurement_method = normalize_phase_measurement_method(getattr(phase, "measurement_method", None), getattr(phase, "tipo", None))
    payload = {
        "competition_id": competition_id,
        "phase": {
            "id": phase_id,
            "name": str(phase.nombre or "").strip() if phase else f"Fase {phase_id}",
            "tipo": str(getattr(phase, "tipo", None) or "").strip().lower() if phase else "cantidad",
            "measurement_method": measurement_method,
            "modality": str(getattr(phase, "modality", None) or "teams").strip().lower() if phase else "teams",
            "team_result_mode": str(getattr(phase, "team_result_mode", None) or "total").strip().lower() if phase else "total",
            "allow_multiple_results": int(getattr(phase, "allow_multiple_results", 0) or 0) if phase else 0,
        },
        "user": {
            "id": None,
            "name": str(getattr(team, "nombre", None) or f"Equipo {team_id}").strip(),
            "category": team_category.get(int(team_id), "Sin categoria") if team_id is not None else "Sin categoria",
        },
        "team": {
            "id": team_id,
            "name": str(getattr(team, "nombre", None) or f"Equipo {team_id}").strip(),
            "category": team_category.get(int(team_id), "Sin categoria") if team_id is not None else "Sin categoria",
        },
        "entity_type": "team",
    }
    if result:
        judge_name, judge_at = _resolve_result_judge_meta(session, int(result.id))
        payload["existing"] = {
            "result_id": int(result.id),
            "marca": int(result.marca) if result.marca is not None else None,
            "formatted_mark": _format_mark_for_phase(result.marca, phase),
            "puntos": int(result.puntos or 0),
            "posicion": int(result.posicion) if result.posicion is not None else None,
            "created_at": result.created_at.isoformat() if result.created_at else None,
            "judge_name": judge_name,
            "judge_at": judge_at,
        }
    else:
        payload["existing"] = None
    return payload


def _phase_type_value(phase: CompetitionPhase | None) -> str:
    return str(getattr(phase, "tipo", None) or "").strip().lower() or "cantidad"


def _phase_measurement_method(phase: CompetitionPhase | None) -> str:
    return normalize_phase_measurement_method(getattr(phase, "measurement_method", None), getattr(phase, "tipo", None))


def _phase_uses_time_input(phase: CompetitionPhase | None) -> bool:
    return _phase_type_value(phase) == "tiempo" or _phase_measurement_method(phase) == "for_time"


def _parse_time_to_seconds(value: object) -> int | None:
    raw = str(value or "").strip()
    if not raw:
        return None
    if raw.isdigit():
        return int(raw)
    parts = [item.strip() for item in raw.split(":")]
    if len(parts) not in {2, 3}:
        return None
    try:
        nums = [int(item) for item in parts]
    except Exception:
        return None
    if any(item < 0 for item in nums):
        return None
    hours = 0
    minutes = 0
    seconds = 0
    if len(nums) == 2:
        minutes, seconds = nums
    else:
        hours, minutes, seconds = nums
    if minutes > 59 or seconds > 59:
        return None
    return (hours * 3600) + (minutes * 60) + seconds


def _parse_mark_for_phase(raw: object, phase: CompetitionPhase | None) -> int:
    phase_type = _phase_type_value(phase)
    if phase_type == "tiempo" or _phase_uses_time_input(phase):
        parsed = _parse_time_to_seconds(raw)
        if parsed is None:
            raise HTTPException(400, "Tiempo invalido. Usa HH:MM:SS o MM:SS")
        return int(parsed)
    try:
        parsed_number = int(str(raw).strip())
    except Exception:
        raise HTTPException(400, "La puntuacion debe ser numerica")
    if phase_type == "posicion" and parsed_number <= 0:
        raise HTTPException(400, "La posicion debe ser mayor a 0")
    return parsed_number


def _format_mark_for_phase(mark: int | None, phase: CompetitionPhase | None) -> str | None:
    if mark is None:
        return None
    if not _phase_uses_time_input(phase):
        return str(int(mark))
    total_seconds = int(mark)
    hours = total_seconds // 3600
    minutes = (total_seconds % 3600) // 60
    seconds = total_seconds % 60
    if hours > 0:
        return f"{hours:02d}:{minutes:02d}:{seconds:02d}"
    return f"{minutes:02d}:{seconds:02d}"


def _result_for_entity(
    session: Session,
    *,
    competition_id: int,
    phase_id: int,
    user_id: int | None,
    team_id: int | None,
    phase_mode: str,
) -> Result | None:
    query = (
        select(Result)
        .where(Result.competition_id == competition_id, Result.phase_id == phase_id)
        .order_by(Result.created_at.desc(), Result.id.desc())
    )
    if phase_mode == "total":
        if team_id is None:
            return None
        query = query.where(Result.team_id == team_id)
    else:
        if user_id is None:
            return None
        query = query.where(Result.user_id == user_id)
    return session.exec(query).first()


def _resolve_score_target(
    session: Session,
    *,
    competition_id: int,
    phase_id: int,
    user_id: int | None = None,
    team_id: int | None = None,
) -> tuple[CompetitionPhase, int | None, int | None, str]:
    phase = session.get(CompetitionPhase, phase_id)
    if not phase or int(phase.competition_id) != int(competition_id):
        raise HTTPException(404, "La fase indicada no pertenece a la competencia")

    phase_mode = _normalize_team_result_mode(getattr(phase, "team_result_mode", None))
    resolved_user_id = int(user_id) if user_id is not None else None
    resolved_team_id = int(team_id) if team_id is not None else None

    if resolved_user_id is not None:
        enrollment = session.get(CompetitionParticipant, (competition_id, resolved_user_id))
        if not enrollment or enrollment.estado != "confirmado":
            raise HTTPException(409, "El participante no esta confirmado para esta competencia")
        participant_team_id = _participant_team_in_competition(
            session,
            competition_id=competition_id,
            user_id=resolved_user_id,
        )
        if resolved_team_id is None:
            resolved_team_id = participant_team_id
        elif participant_team_id is not None and int(participant_team_id) != int(resolved_team_id):
            raise HTTPException(400, "El participante no pertenece al equipo indicado")

    if resolved_team_id is not None:
        team = session.get(Team, resolved_team_id)
        if not team or int(team.competition_id) != int(competition_id):
            raise HTTPException(400, "El equipo no pertenece a esta competencia")

    if phase_mode == "total":
        if resolved_team_id is None:
            raise HTTPException(400, "Esta fase requiere seleccionar un equipo")
        resolved_user_id = None
    elif resolved_user_id is None:
        raise HTTPException(400, "Debes indicar un participante")

    return phase, resolved_user_id, resolved_team_id, phase_mode


def _resolve_score_request_target(
    session: Session,
    *,
    body: dict,
    user: dict,
) -> tuple[int, CompetitionPhase, int | None, int | None, str, str | None]:
    token = body.get("token")
    if token is not None and str(token).strip():
        payload, raw_token = _parse_judge_score_token(token)
        competition_id = int(payload.get("c"))
        assignment = get_active_judge_assignment(session, competition_id, user)
        if assignment is None:
            raise HTTPException(403, "No tienes acceso de juez activo para esta competencia")
        phase, user_id, team_id, phase_mode = _resolve_score_target(
            session,
            competition_id=competition_id,
            phase_id=int(payload.get("ph")),
            user_id=int(payload.get("p")) if payload.get("p") is not None else None,
            team_id=int(payload.get("t")) if payload.get("t") is not None else None,
        )
        return competition_id, phase, user_id, team_id, phase_mode, raw_token

    try:
        competition_id = int(body.get("competition_id"))
        phase_id = int(body.get("phase_id"))
    except Exception:
        raise HTTPException(400, "Debes indicar competition_id y phase_id")
    assignment = get_active_judge_assignment(session, competition_id, user)
    if assignment is None:
        raise HTTPException(403, "No tienes acceso de juez activo para esta competencia")
    user_id = body.get("user_id")
    team_id = body.get("team_id")
    phase, user_id, team_id, phase_mode = _resolve_score_target(
        session,
        competition_id=competition_id,
        phase_id=phase_id,
        user_id=int(user_id) if user_id is not None and str(user_id).strip() != "" else None,
        team_id=int(team_id) if team_id is not None and str(team_id).strip() != "" else None,
    )
    return competition_id, phase, user_id, team_id, phase_mode, None


def _score_context_response(
    session: Session,
    *,
    competition_id: int,
    phase: CompetitionPhase,
    user_id: int | None,
    team_id: int | None,
    phase_mode: str,
    token: str | None,
) -> dict:
    existing = _result_for_entity(
        session,
        competition_id=competition_id,
        phase_id=int(phase.id),
        user_id=user_id,
        team_id=team_id,
        phase_mode=phase_mode,
    )
    payload = _score_payload_for_entity(
        session,
        competition_id=competition_id,
        phase_id=int(phase.id),
        user_id=user_id,
        team_id=team_id,
        result=existing,
    )
    if token:
        payload["token"] = token
    payload["status"] = "already_used" if existing and not int(getattr(phase, "allow_multiple_results", 0) or 0) else "ready"
    payload["can_edit"] = bool(existing)
    payload["existing_formatted"] = _format_mark_for_phase(existing.marca if existing else None, phase)
    return payload


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
    actor_user_id: int | None = None,
    target_type: str | None = None,
    target_id: str | None = None,
    meta: dict | None = None,
) -> None:
    session.add(
        CompetitionJudgeActionAudit(
            competition_id=competition_id,
            judge_assignment_id=judge_assignment_id,
            actor_user_id=actor_user_id,
            action=action,
            target_type=target_type,
            target_id=target_id,
            result=result,
            meta_json=json.dumps(meta or {}, ensure_ascii=False) if meta is not None else None,
        )
    )


def _sync_judge_enabled_flag(session: Session, user_id: int | None) -> None:
    if user_id is None:
        return
    target_user = session.get(Participant, int(user_id))
    if not target_user:
        return
    active_count = int(
        session.exec(
            select(func.count(CompetitionJudgeAssignment.id)).where(
                CompetitionJudgeAssignment.user_id == int(user_id),
                CompetitionJudgeAssignment.status == "active",
            )
        ).one()
        or 0
    )
    next_value = 1 if active_count > 0 else 0
    if int(target_user.judge_enabled or 0) != next_value:
        target_user.judge_enabled = next_value
        session.add(target_user)
        invalidate_user(target_user.id)


def _assignment_payload(session: Session, assignment: CompetitionJudgeAssignment) -> dict:
    competition = session.get(Competition, assignment.competition_id)
    target_user = session.get(Participant, assignment.user_id) if assignment.user_id else None
    participant = target_user
    invited_by = session.get(Participant, assignment.invited_by_user_id)
    return {
        **assignment.model_dump(),
        "competition_name": competition.nombre if competition else f"Competencia {assignment.competition_id}",
        "judge_display_name": target_user.display_name if target_user else None,
        "judge_username": target_user.username if target_user else None,
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
    user_id = get_user_id(user)
    if user_id is not None:
        target_user = session.get(Participant, user_id)
        if target_user and target_user.username and EMAIL_REGEX.fullmatch(target_user.username.strip().lower()):
            values.add(target_user.username.strip().lower())
        if target_user and target_user.email and EMAIL_REGEX.fullmatch(target_user.email.strip().lower()):
            values.add(target_user.email.strip().lower())
    return values


def _resolve_my_assignment(session: Session, assignment_id: int, user: dict) -> CompetitionJudgeAssignment:
    assignment = session.get(CompetitionJudgeAssignment, assignment_id)
    if not assignment:
        raise HTTPException(404, "Invitacion no encontrada")
    user_id = get_user_id(user)
    current_emails = _current_user_emails(session, user)
    if assignment.user_id is not None and user_id is not None and int(assignment.user_id) == int(user_id):
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
        raise HTTPException(400, "No puedes invitarte como juez")

    existing = session.exec(
        select(CompetitionJudgeAssignment).where(
            CompetitionJudgeAssignment.competition_id == competition_id,
            or_(
                CompetitionJudgeAssignment.invited_email == invited_email,
                CompetitionJudgeAssignment.user_id == (target_user.id if target_user else -1),
            ),
        )
    ).first()

    if existing and existing.status in {"pending", "active"}:
        raise HTTPException(409, "Ese juez ya esta invitado o activo en esta competencia")

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
        assignment = CompetitionJudgeAssignment(
            competition_id=competition_id,
            user_id=target_user.id if target_user else None,
            invited_email=invited_email,
            invited_by_user_id=inviter_user_id,
            status="pending",
        )
        session.add(assignment)

    _append_judge_audit(
        session,
        competition_id=competition_id,
        judge_assignment_id=assignment.id,
        actor_user_id=inviter_user_id,
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

    inviter = session.get(Participant, inviter_user_id)
    inviter_name = (inviter.display_name or inviter.nombre or invited_email) if inviter else "El organizador"
    invitation_url = f"https://app.finalrep.com/judge-assignments/{assignment.id}"
    try:
        subject, text_body, html_body = render_judge_invitation(
            nombre=invited_email,
            competition_name=competition.nombre,
            invited_by_name=inviter_name,
            invitation_url=invitation_url,
        )
        send_email(to_email=invited_email, subject=subject, text_body=text_body, html_body=html_body)
    except Exception:
        pass

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
        actor_user_id=get_user_id(user),
        action="judge_revoked",
        result="accepted",
        target_type="assignment",
        target_id=str(assignment.id),
        meta={"invited_email": assignment.invited_email},
    )
    _sync_judge_enabled_flag(session, assignment.user_id)
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
        actor = session.get(Participant, row.actor_user_id) if row.actor_user_id else None
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
    user_id = get_user_id(user)
    current_emails = list(_current_user_emails(session, user))
    if user_id is None and not current_emails:
        return []
    query = select(CompetitionJudgeAssignment)
    filters = []
    if user_id is not None:
        filters.append(CompetitionJudgeAssignment.user_id == user_id)
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

    user_id = get_user_id(user)
    if user_id is None:
        raise HTTPException(403, "Necesitas una cuenta de app para aceptar esta invitacion")

    assignment.user_id = user_id
    assignment.status = "active"
    assignment.accepted_at = _utcnow()
    assignment.rejected_at = None
    assignment.revoked_at = None
    session.add(assignment)
    _append_judge_audit(
        session,
        competition_id=assignment.competition_id,
        judge_assignment_id=assignment.id,
        actor_user_id=user_id,
        action="judge_accepted",
        result="accepted",
        target_type="assignment",
        target_id=str(assignment.id),
    )
    target_user = session.get(Participant, user_id)
    if target_user and int(target_user.judge_enabled or 0) != 1:
        target_user.judge_enabled = 1
        session.add(target_user)
        invalidate_user(target_user.id)
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

    user_id = get_user_id(user)
    if user_id is not None and assignment.user_id is None:
        assignment.user_id = user_id
    assignment.status = "rejected"
    assignment.rejected_at = _utcnow()
    assignment.accepted_at = None
    session.add(assignment)
    _append_judge_audit(
        session,
        competition_id=assignment.competition_id,
        judge_assignment_id=assignment.id,
        actor_user_id=user_id,
        action="judge_rejected",
        result="accepted",
        target_type="assignment",
        target_id=str(assignment.id),
    )
    _sync_judge_enabled_flag(session, assignment.user_id)
    session.commit()
    session.refresh(assignment)
    return _assignment_payload(session, assignment)


@router.post("/api/judge/score/scan")
def judge_score_scan(
    body: dict = Body(...),
    session: Session = Depends(get_session),
    user=Depends(require_auth),
):
    competition_id, phase, user_id, team_id, phase_mode, raw_token = _resolve_score_request_target(
        session,
        body=body,
        user=user,
    )
    return _score_context_response(
        session,
        competition_id=competition_id,
        phase=phase,
        user_id=user_id,
        team_id=team_id,
        phase_mode=phase_mode,
        token=raw_token,
    )


@router.get("/api/judge/competitions/{competition_id}/score/phases")
def list_judge_score_phases(
    competition_id: int,
    session: Session = Depends(get_session),
    user=Depends(require_auth),
):
    require_competition_operator_access(session, competition_id, user)
    rows = session.exec(
        select(CompetitionPhase)
        .where(CompetitionPhase.competition_id == competition_id)
        .order_by(CompetitionPhase.block_order.asc(), CompetitionPhase.orden.asc(), CompetitionPhase.id.asc())
    ).all()
    payload: list[dict] = []
    for phase in rows:
        payload.append(
            {
                "id": int(phase.id),
                "nombre": str(phase.nombre or "").strip() or f"Fase {phase.id}",
                "tipo": _phase_type_value(phase),
                "measurement_method": _phase_measurement_method(phase),
                "modality": str(getattr(phase, "modality", None) or "individual").strip().lower(),
                "team_result_mode": _normalize_team_result_mode(getattr(phase, "team_result_mode", None)),
                "allow_multiple_results": int(getattr(phase, "allow_multiple_results", 0) or 0),
            }
        )
    return payload


@router.get("/api/judge/competitions/{competition_id}/score/manual-options")
def list_judge_score_manual_options(
    competition_id: int,
    phase_id: int = Query(...),
    q: str | None = Query(default=None),
    category: str | None = Query(default=None),
    heat_id: int | None = Query(default=None),
    status: str = Query(default="all"),
    session: Session = Depends(get_session),
    user=Depends(require_auth),
):
    require_competition_operator_access(session, competition_id, user)
    phase = session.get(CompetitionPhase, phase_id)
    if not phase or int(phase.competition_id) != int(competition_id):
        raise HTTPException(404, "La fase indicada no pertenece a la competencia")
    phase_mode = _normalize_team_result_mode(getattr(phase, "team_result_mode", None))

    normalized_query = str(q or "").strip().lower()
    normalized_category = str(category or "").strip().lower()
    normalized_status = str(status or "all").strip().lower()

    heat_rows = session.exec(
        select(CompetitionHeat)
        .where(
            CompetitionHeat.competition_id == competition_id,
            CompetitionHeat.phase_id == phase_id,
        )
        .order_by(CompetitionHeat.heat_number.asc(), CompetitionHeat.start_at.asc(), CompetitionHeat.id.asc())
    ).all()
    heat_map = {int(item.id): item for item in heat_rows if item.id is not None}
    assignment_rows = session.exec(
        select(CompetitionHeatAssignment)
        .where(CompetitionHeatAssignment.heat_id.in_(list(heat_map.keys())) if heat_map else False)
    ).all() if heat_map else []

    if phase_mode == "total":
        teams = session.exec(
            select(Team)
            .where(Team.competition_id == competition_id)
            .order_by(Team.nombre.asc(), Team.id.asc())
        ).all()
        team_ids = {int(team.id) for team in teams if team.id is not None}
        team_categories = _team_categories_map(session, competition_id, team_ids)
        members = session.exec(
            select(TeamMember).where(TeamMember.team_id.in_(list(team_ids)) if team_ids else False)
        ).all() if team_ids else []
        member_names: dict[int, list[str]] = {}
        participant_map: dict[int, Participant] = {}
        participant_ids = {int(item.user_id) for item in members}
        if participant_ids:
            for participant in session.exec(select(Participant).where(Participant.id.in_(list(participant_ids)))).all():
                participant_map[int(participant.id)] = participant
        for member in members:
            participant = participant_map.get(int(member.user_id))
            label = f"{(participant.nombre or '').strip()} {(participant.apellido or '').strip()}".strip() if participant else ""
            if label:
                member_names.setdefault(int(member.team_id), []).append(label)

        result_rows = session.exec(
            select(Result).where(Result.competition_id == competition_id, Result.phase_id == phase_id)
        ).all()
        existing_by_team = {int(item.team_id): item for item in result_rows if item.team_id is not None}
        assignment_by_team: dict[int, CompetitionHeatAssignment] = {}
        for assignment in assignment_rows:
            if assignment.team_id is None:
                continue
            assignment_by_team[int(assignment.team_id)] = assignment

        items: list[dict] = []
        for team in teams:
            team_id_value = int(team.id)
            assignment = assignment_by_team.get(team_id_value)
            heat = heat_map.get(int(assignment.heat_id)) if assignment and assignment.heat_id is not None else None
            existing = existing_by_team.get(team_id_value)
            team_name = str(team.nombre or "").strip() or f"Equipo {team_id_value}"
            search_blob = " ".join([team_name, *member_names.get(team_id_value, [])]).lower()
            team_category = team_categories.get(team_id_value, "Sin categoria")
            if normalized_query and normalized_query not in search_blob:
                continue
            if normalized_category and team_category.lower() != normalized_category:
                continue
            if heat_id is not None and (heat is None or int(heat.id) != int(heat_id)):
                continue
            item_status = "scored" if existing else "pending"
            if normalized_status in {"pending", "scored"} and item_status != normalized_status:
                continue
            items.append(
                {
                    "entity_type": "team",
                    "team_id": team_id_value,
                    "user_id": None,
                    "display_name": team_name,
                    "category": team_category,
                    "heat_id": int(heat.id) if heat else None,
                    "heat_name": str(getattr(heat, "nombre", None) or "").strip() if heat else "",
                    "lane_number": int(getattr(assignment, "lane_number", 0) or 0) if assignment else 0,
                    "existing_mark": int(existing.marca) if existing and existing.marca is not None else None,
                    "existing_formatted": _format_mark_for_phase(existing.marca if existing else None, phase),
                    "status": item_status,
                    "member_names": member_names.get(team_id_value, []),
                }
            )
        items.sort(key=lambda row: (row["heat_id"] or 0, row["lane_number"] or 0, row["display_name"]))
        return {
            "phase": {
                "id": int(phase.id),
                "nombre": str(phase.nombre or "").strip() or f"Fase {phase.id}",
                "tipo": _phase_type_value(phase),
                "measurement_method": _phase_measurement_method(phase),
                "team_result_mode": phase_mode,
            },
            "heats": [
                {"id": int(item.id), "nombre": str(item.nombre or "").strip() or f"Heat {item.heat_number}"}
                for item in heat_rows
            ],
            "items": items,
        }

    cp_rows = session.exec(
        select(CompetitionParticipant, Participant)
        .join(Participant, Participant.id == CompetitionParticipant.user_id)
        .where(CompetitionParticipant.competition_id == competition_id, CompetitionParticipant.estado == "confirmado")
    ).all()
    assignment_by_participant: dict[int, CompetitionHeatAssignment] = {}
    for assignment in assignment_rows:
        if assignment.user_id is None:
            continue
        assignment_by_participant[int(assignment.user_id)] = assignment
    result_rows = session.exec(
        select(Result).where(Result.competition_id == competition_id, Result.phase_id == phase_id)
    ).all()
    existing_by_participant = {int(item.user_id): item for item in result_rows if item.user_id is not None}
    items = []
    for enrollment, participant in cp_rows:
        participant_id_value = int(participant.id)
        assignment = assignment_by_participant.get(participant_id_value)
        heat = heat_map.get(int(assignment.heat_id)) if assignment and assignment.heat_id is not None else None
        full_name = f"{(participant.nombre or '').strip()} {(participant.apellido or '').strip()}".strip() or f"Participante {participant_id_value}"
        participant_category = str(enrollment.categoria or participant.categoria or "").strip() or "Sin categoria"
        existing = existing_by_participant.get(participant_id_value)
        search_blob = " ".join([full_name, str(participant.cedula or ""), participant_category]).lower()
        if normalized_query and normalized_query not in search_blob:
            continue
        if normalized_category and participant_category.lower() != normalized_category:
            continue
        if heat_id is not None and (heat is None or int(heat.id) != int(heat_id)):
            continue
        item_status = "scored" if existing else "pending"
        if normalized_status in {"pending", "scored"} and item_status != normalized_status:
            continue
        items.append(
                {
                    "entity_type": "user",
                    "user_id": participant_id_value,
                    "team_id": _participant_team_in_competition(session, competition_id=competition_id, user_id=participant_id_value),
                "display_name": full_name,
                "category": participant_category,
                "cedula": str(participant.cedula or "").strip(),
                "heat_id": int(heat.id) if heat else None,
                "heat_name": str(getattr(heat, "nombre", None) or "").strip() if heat else "",
                "lane_number": int(getattr(assignment, "lane_number", 0) or 0) if assignment else 0,
                "existing_mark": int(existing.marca) if existing and existing.marca is not None else None,
                "existing_formatted": _format_mark_for_phase(existing.marca if existing else None, phase),
                "status": item_status,
            }
        )
    items.sort(key=lambda row: (row["heat_id"] or 0, row["lane_number"] or 0, row["display_name"]))
    return {
        "phase": {
            "id": int(phase.id),
            "nombre": str(phase.nombre or "").strip() or f"Fase {phase.id}",
            "tipo": _phase_type_value(phase),
            "measurement_method": _phase_measurement_method(phase),
            "team_result_mode": phase_mode,
        },
        "heats": [
            {"id": int(item.id), "nombre": str(item.nombre or "").strip() or f"Heat {item.heat_number}"}
            for item in heat_rows
        ],
        "items": items,
    }


@router.post("/api/judge/score/manual-resolve")
def judge_score_manual_resolve(
    body: dict = Body(...),
    session: Session = Depends(get_session),
    user=Depends(require_auth),
):
    competition_id, phase, user_id, team_id, phase_mode, _raw_token = _resolve_score_request_target(
        session,
        body=body,
        user=user,
    )
    return _score_context_response(
        session,
        competition_id=competition_id,
        phase=phase,
        user_id=user_id,
        team_id=team_id,
        phase_mode=phase_mode,
        token=None,
    )


@router.post("/api/judge/score/submit")
def judge_score_submit(
    body: dict = Body(...),
    session: Session = Depends(get_session),
    user=Depends(require_auth),
):
    competition_id, phase, user_id, team_id, phase_mode, raw_token = _resolve_score_request_target(
        session,
        body=body,
        user=user,
    )
    raw_mark = body.get("marca_raw", body.get("marca"))
    if raw_mark is None or str(raw_mark).strip() == "":
        raise HTTPException(400, "Debes indicar la puntuacion (marca)")
    mark_int = _parse_mark_for_phase(raw_mark, phase)

    existing = _result_for_entity(
        session,
        competition_id=competition_id,
        phase_id=int(phase.id),
        user_id=user_id,
        team_id=team_id,
        phase_mode=phase_mode,
    )
    if existing and not int(getattr(phase, "allow_multiple_results", 0) or 0):
        out = _score_context_response(
            session,
            competition_id=competition_id,
            phase=phase,
            user_id=user_id,
            team_id=team_id,
            phase_mode=phase_mode,
            token=raw_token,
        )
        out["status"] = "already_used"
        out["can_edit"] = True
        return out

    result = Result(
        competition_id=competition_id,
        user_id=user_id,
        team_id=team_id,
        phase_id=int(phase.id),
        marca=mark_int,
        puntos=0,
        posicion=None,
    )
    session.add(result)
    session.flush()
    _recompute_phase_positions_and_points(session, competition_id, int(phase.id))
    recompute_and_persist_phase_status(session, competition_id, int(phase.id))
    append_judge_action_audit(
        session,
        competition_id=competition_id,
        user=user,
        action="judge_score_submitted",
        result="accepted",
        target_type="result",
        target_id=str(result.id),
        meta={
            "phase_id": int(phase.id),
            "user_id": user_id,
            "team_id": team_id,
            "marca": mark_int,
            "source": "qr" if raw_token else "manual",
            "marca_raw": str(raw_mark).strip(),
        },
    )
    session.commit()
    session.refresh(result)
    out = _score_payload_for_entity(
        session,
        competition_id=competition_id,
        phase_id=int(phase.id),
        user_id=user_id,
        team_id=team_id,
        result=result,
    )
    out["status"] = "created"
    out["can_edit"] = True
    out["existing_formatted"] = _format_mark_for_phase(result.marca, phase)
    return out


@router.post("/api/judge/score/edit")
def judge_score_edit(
    body: dict = Body(...),
    session: Session = Depends(get_session),
    user=Depends(require_auth),
):
    competition_id, phase, user_id, team_id, phase_mode, raw_token = _resolve_score_request_target(
        session,
        body=body,
        user=user,
    )
    raw_mark = body.get("marca_raw", body.get("marca"))
    if raw_mark is None or str(raw_mark).strip() == "":
        raise HTTPException(400, "Debes indicar la nueva puntuacion (marca)")
    mark_int = _parse_mark_for_phase(raw_mark, phase)

    existing = _result_for_entity(
        session,
        competition_id=competition_id,
        phase_id=int(phase.id),
        user_id=user_id,
        team_id=team_id,
        phase_mode=phase_mode,
    )
    if not existing:
        raise HTTPException(404, "No existe un resultado previo para editar")

    existing.marca = mark_int
    session.add(existing)
    session.flush()
    _recompute_phase_positions_and_points(session, competition_id, int(phase.id))
    recompute_and_persist_phase_status(session, competition_id, int(phase.id))
    append_judge_action_audit(
        session,
        competition_id=competition_id,
        user=user,
        action="judge_score_edited",
        result="accepted",
        target_type="result",
        target_id=str(existing.id),
        meta={
            "phase_id": int(phase.id),
            "user_id": user_id,
            "team_id": team_id,
            "marca": mark_int,
            "source": "qr" if raw_token else "manual",
            "marca_raw": str(raw_mark).strip(),
        },
    )
    session.commit()
    session.refresh(existing)
    out = _score_payload_for_entity(
        session,
        competition_id=competition_id,
        phase_id=int(phase.id),
        user_id=user_id,
        team_id=team_id,
        result=existing,
    )
    out["status"] = "updated"
    out["can_edit"] = True
    out["existing_formatted"] = _format_mark_for_phase(existing.marca, phase)
    return out


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
    actor_user_id = get_user_id(user)
    if assignment is None and actor_user_id is None:
        return
    _append_judge_audit(
        session,
        competition_id=competition_id,
        judge_assignment_id=assignment.id if assignment else None,
        actor_user_id=actor_user_id,
        action=action,
        result=result,
        target_type=target_type,
        target_id=target_id,
        meta=meta,
    )
