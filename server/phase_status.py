from typing import Optional

from sqlalchemy import text
from sqlmodel import Session, select

from constants import EstadoFase
from models import CompetitionPhase


def _fetch_expected_counts(session: Session, competition_id: int) -> tuple[int, int]:
    """Una query: participantes confirmados + teams registrados."""
    row = session.execute(text("""
        SELECT
            (
                SELECT COUNT(*)::int
                FROM competition_participants cp
                WHERE cp.competition_id = :cid
                  AND cp.estado = 'confirmado'
            ) AS expected_participants,
            (
                SELECT COUNT(*)::int
                FROM teams t
                WHERE t.competition_id = :cid
            ) AS expected_teams
    """), {"cid": competition_id}).mappings().one()
    return int(row["expected_participants"] or 0), int(row["expected_teams"] or 0)


def _fetch_loaded_counts_by_phase(session: Session, competition_id: int) -> dict[int, dict[str, int]]:
    """Una query GROUP BY phase_id. Retorna dict {phase_id: {'participants': N, 'teams': M}}."""
    rows = session.execute(text("""
        SELECT
            phase_id,
            COUNT(DISTINCT user_id)
                FILTER (WHERE user_id IS NOT NULL)::int AS loaded_participants,
            COUNT(DISTINCT team_id)
                FILTER (WHERE team_id IS NOT NULL AND user_id IS NULL)::int AS loaded_teams
        FROM results
        WHERE competition_id = :cid
          AND phase_id IS NOT NULL
        GROUP BY phase_id
    """), {"cid": competition_id}).mappings().all()
    return {
        int(r["phase_id"]): {
            "participants": int(r["loaded_participants"] or 0),
            "teams": int(r["loaded_teams"] or 0),
        }
        for r in rows
    }


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

    expected_participants, expected_teams = _fetch_expected_counts(session, competition_id)
    loaded_by_phase = _fetch_loaded_counts_by_phase(session, competition_id)

    out: dict[int, str] = {}
    for phase in phases:
        mode = (getattr(phase, "team_result_mode", None) or "sum_two").strip().lower()
        counts = loaded_by_phase.get(int(phase.id), {"participants": 0, "teams": 0})
        if mode == "total":
            out[int(phase.id)] = _status_from_counts(expected_teams, counts["teams"])
        else:
            out[int(phase.id)] = _status_from_counts(expected_participants, counts["participants"])
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
