from typing import Optional

from sqlalchemy import text
from sqlmodel import Session, select

from constants import EstadoFase
from models import CompetitionPhase


def _count_expected_participants(session: Session, competition_id: int) -> int:
    return int(session.execute(text("""
        SELECT COUNT(*)::int
        FROM competition_participants cp
        JOIN participants p ON p.id = cp.participant_id
        WHERE cp.competition_id = :cid
          AND cp.estado = 'confirmado'
    """), {"cid": competition_id}).scalar() or 0)


def _count_expected_teams(session: Session, competition_id: int) -> int:
    return int(session.execute(text("""
        SELECT COUNT(*)::int
        FROM teams t
        WHERE t.competition_id = :cid
    """), {"cid": competition_id}).scalar() or 0)


def _count_loaded_participants_for_phase(session: Session, competition_id: int, phase_id: int) -> int:
    return int(session.execute(text("""
        SELECT COUNT(DISTINCT r.participant_id)::int
        FROM results r
        WHERE r.competition_id = :cid
          AND r.phase_id = :pid
          AND r.participant_id IS NOT NULL
    """), {"cid": competition_id, "pid": phase_id}).scalar() or 0)


def _count_loaded_teams_for_phase(session: Session, competition_id: int, phase_id: int) -> int:
    return int(session.execute(text("""
        SELECT COUNT(DISTINCT r.team_id)::int
        FROM results r
        WHERE r.competition_id = :cid
          AND r.phase_id = :pid
          AND r.team_id IS NOT NULL
          AND r.participant_id IS NULL
    """), {"cid": competition_id, "pid": phase_id}).scalar() or 0)


def _status_from_counts(expected: int, loaded: int) -> str:
    if loaded <= 0:
        return EstadoFase.PENDIENTE
    if expected > 0 and loaded >= expected:
        return EstadoFase.FINALIZADA
    return EstadoFase.EN_PROGRESO


def compute_phase_status_map(session: Session, competition_id: int) -> dict[int, str]:
    phases = session.exec(
        select(CompetitionPhase)
        .where(CompetitionPhase.competition_id == competition_id)
        .order_by(CompetitionPhase.orden, CompetitionPhase.id)
    ).all()
    if not phases:
        return {}

    expected_participants = _count_expected_participants(session, competition_id)
    expected_teams = _count_expected_teams(session, competition_id)

    out: dict[int, str] = {}
    for phase in phases:
        mode = (getattr(phase, "team_result_mode", None) or "sum_two").strip().lower()
        if mode == "total":
            loaded = _count_loaded_teams_for_phase(session, competition_id, int(phase.id))
            out[int(phase.id)] = _status_from_counts(expected_teams, loaded)
        else:
            loaded = _count_loaded_participants_for_phase(session, competition_id, int(phase.id))
            out[int(phase.id)] = _status_from_counts(expected_participants, loaded)
    return out


def recompute_and_persist_phase_status(
    session: Session,
    competition_id: int,
    phase_id: Optional[int] = None,
) -> dict[int, str]:
    status_map = compute_phase_status_map(session, competition_id)
    if not status_map:
        return {}

    target_ids = {int(phase_id)} if phase_id is not None else set(status_map.keys())
    phases = session.exec(
        select(CompetitionPhase).where(
            CompetitionPhase.competition_id == competition_id,
            CompetitionPhase.id.in_(target_ids),
        )
    ).all()
    changed = False
    for phase in phases:
        next_state = status_map.get(int(phase.id))
        if next_state and phase.estado != next_state:
            phase.estado = next_state
            session.add(phase)
            changed = True
    if changed:
        session.flush()
    return status_map
