import json
import logging
import os
from urllib.parse import urlencode

from sqlmodel import Session, select

from competition_rules import normalize_phase_measurement_method, type_from_measurement_method
from models import AppNotification, AthleteFollow, Competition, CompetitionPhase, Participant, Result, TeamMember
from services.email_templates import render_result_notification
from services.emailer import send_email
from services.push_notifications import send_push_to_user

logger = logging.getLogger(__name__)


def _base_url() -> str:
    return (os.getenv("LEADERBOARD_BASE_URL") or "https://finalrep.co/").strip().rstrip("/")


def _action_url(competition_id: int) -> str:
    return f"{_base_url()}/leaderboard/{competition_id}"


def _result_action_url(
    competition_id: int,
    *,
    phase_id: int | None = None,
    athlete_id: int | None = None,
    team_id: int | None = None,
) -> str:
    params = {}
    if phase_id is not None:
        params["phase"] = int(phase_id)
    if athlete_id is not None:
        params["athlete"] = int(athlete_id)
    if team_id is not None:
        params["team"] = int(team_id)
    query = urlencode(params)
    url = _action_url(competition_id)
    return f"{url}?{query}" if query else url


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
        session.flush()
        send_push_to_user(
            session,
            user_id=int(recipient.id),
            title=title,
            body=body,
            url=url,
            notification_id=int(notification.id) if notification.id is not None else None,
        )

        email = (recipient.email or "").strip()
        if not email:
            continue
        try:
            email_action_url = _result_action_url(
                int(result.competition_id),
                phase_id=int(result.phase_id) if result.phase_id is not None else None,
                athlete_id=int(recipient.id),
                team_id=int(result.team_id) if result.team_id is not None else None,
            )
            subject, text_body, html_body = render_result_notification(
                nombre=(recipient.nombre or "Atleta"),
                competition_name=competition_name,
                phase_name=phase_name,
                mark_label=mark_label,
                points=result.puntos,
                action_url=email_action_url,
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

    if result.user_id is not None:
        notify_followers_result_saved(
            session,
            result=result,
            competition_name=competition_name,
            phase_name=phase_name,
            mark_label=mark_label,
            updated=updated,
            action_url=url,
        )


def notify_followers_result_saved(
    session: Session,
    *,
    result: Result,
    competition_name: str,
    phase_name: str,
    mark_label: str,
    updated: bool,
    action_url: str,
) -> None:
    if result.user_id is None:
        return
    athlete = session.get(Participant, int(result.user_id))
    athlete_name = (
        f"{(athlete.nombre or '').strip()} {(athlete.apellido or '').strip()}".strip()
        if athlete
        else ""
    ) or "Atleta"
    followers = session.exec(
        select(AthleteFollow).where(
            AthleteFollow.competition_id == int(result.competition_id),
            AthleteFollow.athlete_user_id == int(result.user_id),
            AthleteFollow.follower_user_id != int(result.user_id),
        )
    ).all()
    if not followers:
        return

    action = "actualizado" if updated else "cargado"
    title = f"{athlete_name}: resultado {action}"
    body = f"{competition_name} | {phase_name}: {mark_label}"
    if result.posicion is not None:
        body = f"{body} | posicion {result.posicion}"

    data = {
        "competition_id": int(result.competition_id),
        "phase_id": int(result.phase_id) if result.phase_id is not None else None,
        "result_id": int(result.id) if result.id is not None else None,
        "athlete_user_id": int(result.user_id),
        "followed": True,
        "updated": bool(updated),
    }
    notified_user_ids: set[int] = set()
    for follow in followers:
        follower_id = int(follow.follower_user_id)
        if follower_id in notified_user_ids:
            continue
        notified_user_ids.add(follower_id)
        notification = AppNotification(
            user_id=follower_id,
            notification_type="followed_result_updated" if updated else "followed_result_created",
            title=title,
            body=body,
            action_url=action_url,
            data_json=json.dumps(data, separators=(",", ":")),
        )
        session.add(notification)
        session.flush()
        send_push_to_user(
            session,
            user_id=follower_id,
            title=title,
            body=body,
            url=action_url,
            notification_id=int(notification.id) if notification.id is not None else None,
        )
