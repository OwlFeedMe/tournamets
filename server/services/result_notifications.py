import json
import logging
import os

from sqlmodel import Session, select

from competition_rules import normalize_phase_measurement_method, type_from_measurement_method
from models import AppNotification, Competition, CompetitionPhase, Participant, Result, TeamMember
from services.email_templates import render_result_notification
from services.emailer import send_email

logger = logging.getLogger(__name__)


def _base_url() -> str:
    return (os.getenv("LEADERBOARD_BASE_URL") or "https://finalrep.co/").strip().rstrip("/")


def _action_url(competition_id: int) -> str:
    return f"{_base_url()}/leaderboard/{competition_id}"


def _phase_uses_time_input(phase: CompetitionPhase | None) -> bool:
    if phase is None:
        return False
    method = normalize_phase_measurement_method(getattr(phase, "measurement_method", None), getattr(phase, "tipo", None))
    return type_from_measurement_method(method) == "tiempo" or method in {"for_time", "tiempo_hms", "tiempo"}


def _phase_tiebreak_uses_time_input(phase: CompetitionPhase | None) -> bool:
    if phase is None:
        return True
    method = normalize_phase_measurement_method(getattr(phase, "tie_break_method", None), "tiempo")
    return type_from_measurement_method(method) == "tiempo" or method in {"for_time", "tiempo_hms", "tiempo"}


def _format_seconds(total_seconds: int) -> str:
    safe = max(0, int(total_seconds))
    hours = safe // 3600
    minutes = (safe % 3600) // 60
    seconds = safe % 60
    if hours > 0:
        return f"{hours:02d}:{minutes:02d}:{seconds:02d}"
    return f"{minutes:02d}:{seconds:02d}"


def _format_result_mark(result: Result, phase: CompetitionPhase | None) -> str:
    value = result.marca if result.marca is not None else result.puntos
    if value is None:
        return "-"
    parts = [_format_seconds(int(value)) if _phase_uses_time_input(phase) else str(value)]
    if result.extra is not None:
        parts.append(f"+ {result.extra} reps")
    if result.tiebreak is not None:
        tiebreak = _format_seconds(int(result.tiebreak)) if _phase_tiebreak_uses_time_input(phase) else str(result.tiebreak)
        parts.append(f"TB {tiebreak}")
    return " | ".join(parts)


def _result_recipient_ids(session: Session, result: Result) -> list[int]:
    ids: set[int] = set()
    if result.user_id is not None:
        ids.add(int(result.user_id))
    if result.team_id is not None:
        members = session.exec(
            select(TeamMember.user_id).where(TeamMember.team_id == int(result.team_id))
        ).all()
        ids.update(int(user_id) for user_id in members if user_id is not None)
    return sorted(ids)


def notify_result_saved(session: Session, result: Result, *, updated: bool) -> None:
    recipient_ids = _result_recipient_ids(session, result)
    if not recipient_ids:
        return

    competition = session.get(Competition, int(result.competition_id))
    phase = session.get(CompetitionPhase, int(result.phase_id)) if result.phase_id is not None else None
    competition_name = competition.nombre if competition else "Competencia"
    phase_name = phase.nombre if phase else "Workout"
    action = "actualizado" if updated else "cargado"
    title = f"Resultado {action}: {phase_name}"
    mark_label = _format_result_mark(result, phase)
    body = f"{competition_name}: marca {mark_label}"
    if result.posicion is not None:
        body = f"{body} | posicion {result.posicion}"
    url = _action_url(int(result.competition_id))
    data = {
        "competition_id": int(result.competition_id),
        "phase_id": int(result.phase_id) if result.phase_id is not None else None,
        "result_id": int(result.id) if result.id is not None else None,
        "updated": bool(updated),
    }

    users = session.exec(select(Participant).where(Participant.id.in_(recipient_ids))).all()
    for recipient in users:
        notification = AppNotification(
            user_id=int(recipient.id),
            notification_type="result_updated" if updated else "result_created",
            title=title,
            body=body,
            action_url=url,
            data_json=json.dumps(data, separators=(",", ":")),
        )
        session.add(notification)

        email = (recipient.email or "").strip()
        if not email:
            continue
        try:
            subject, text_body, html_body = render_result_notification(
                nombre=(recipient.nombre or "Atleta"),
                competition_name=competition_name,
                phase_name=phase_name,
                mark_label=mark_label,
                position=result.posicion,
                points=result.puntos,
                action_url=url,
                updated=updated,
            )
            send_email(
                to_email=email,
                subject=subject,
                text_body=text_body,
                html_body=html_body,
            )
        except Exception:
            logger.exception("Could not notify result %s to user %s", result.id, recipient.id)
