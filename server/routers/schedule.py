from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import text
from sqlmodel import Session, select

from access import require_competition_access
from auth import get_current_user_optional, get_effective_user_id, is_end_user, require_auth, require_staff
from competition_rules import normalize_phase_visibility
from database import get_session
from models import (
    Competition,
    CompetitionCategory,
    CompetitionHeat,
    CompetitionHeatAssignment,
    CompetitionParticipant,
    CompetitionPhase,
    Participant,
    Result,
    Team,
)
from timezones import DEFAULT_COMPETITION_TIMEZONE, to_utc_from_competition_time

router = APIRouter(prefix="/api/competitions", tags=["schedule"])


LANE_PATTERNS: dict[int, list[int]] = {
    1: [1],
    2: [1, 2],
    3: [2, 1, 3],
    4: [2, 3, 1, 4],
    5: [3, 2, 4, 1, 5],
    6: [3, 4, 2, 5, 1, 6],
    7: [4, 3, 5, 2, 6, 1, 7],
    8: [4, 5, 3, 6, 2, 7, 1, 8],
    9: [5, 4, 6, 3, 7, 2, 8, 1, 9],
    10: [5, 6, 4, 7, 3, 8, 2, 9, 1, 10],
}


class HeatAssignmentInput(BaseModel):
    user_id: Optional[int] = None
    team_id: Optional[int] = None
    lane_number: int = 1
    seed_order: int = 0


class HeatInput(BaseModel):
    phase_id: int
    categoria: Optional[str] = None
    nombre: str
    heat_number: int = 1
    lane_count: int = 0
    heat_transition_seconds: int = 0
    category_transition_seconds: int = 0
    start_at: Optional[datetime] = None
    end_at: Optional[datetime] = None
    location_name: Optional[str] = None
    location_detail: Optional[str] = None
    note: Optional[str] = None
    is_published: int = 0
    assignments: list[HeatAssignmentInput] = []


class HeatGenerateInput(BaseModel):
    phase_id: int
    categoria: Optional[str] = None
    generation_mode: str = "mixed"
    heat_numbering_mode: str = "by_category"
    seed_mode: str = "auto"
    lane_count: int = 8
    heat_count: Optional[int] = None
    location_name: Optional[str] = None
    location_detail: Optional[str] = None
    note: Optional[str] = None
    is_published: int = 0
    first_heat_start_at: Optional[datetime] = None
    heat_duration_minutes: int = 15
    heat_gap_minutes: int = 5
    heat_transition_seconds: int = 0
    category_transition_seconds: int = 0
    advance_limit: Optional[int] = None
    delete_existing: int = 1


class HeatMoveInput(BaseModel):
    user_id: Optional[int] = None
    team_id: Optional[int] = None
    target_heat_id: int
    lane_number: Optional[int] = None


class HeatRescheduleInput(BaseModel):
    first_heat_start_at: Optional[datetime] = None
    heat_duration_minutes: int = 15
    heat_gap_minutes: int = 5
    category_transition_minutes: int = 0
    from_heat_id: Optional[int] = None
    shift_following_blocks: bool = False


def _normalize_dt(value: datetime | None, timezone_name: str = DEFAULT_COMPETITION_TIMEZONE) -> datetime | None:
    return to_utc_from_competition_time(value, timezone_name)


def _as_utc(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def _normalize_transition_seconds(value: object) -> int:
    try:
        return max(0, int(value or 0))
    except (TypeError, ValueError):
        return 0


def _phase_sort_key(phase: CompetitionPhase) -> tuple[int, int, int]:
    return (int(phase.block_order or 0), int(phase.orden or 0), int(phase.id or 0))


def _build_lane_order(lane_count: int) -> list[int]:
    if lane_count <= 0:
        return [1]
    if lane_count in LANE_PATTERNS:
        return LANE_PATTERNS[lane_count]
    midpoint = (lane_count + 1) // 2
    ordered = [midpoint]
    left = midpoint - 1
    right = midpoint + 1
    while len(ordered) < lane_count:
        if right <= lane_count:
            ordered.append(right)
        if left >= 1 and len(ordered) < lane_count:
            ordered.append(left)
        right += 1
        left -= 1
    return ordered


def _normalize_category_label(value: str | None) -> str:
    return str(value or "").strip()


def _display_category_label(value: str | None) -> str:
    return _normalize_category_label(value) or "Sin categoria"


def _normalize_generation_mode(value: str | None, categoria: str | None) -> str:
    raw = str(value or "").strip().lower()
    if raw in {"by_category", "por_categoria", "categories", "category_order"}:
        return "by_category"
    if raw in {"single_category", "categoria", "category"}:
        return "single_category"
    if raw in {"mixed", "all_mixed", "todos_mezclados", "all"}:
        return "mixed"
    return "single_category" if _normalize_category_label(categoria) else "mixed"


def _uses_continuous_heat_numbers(value: str | None) -> bool:
    raw = str(value or "").strip().lower()
    return raw in {"continuous", "global", "global_continuous", "sequential", "ascending"}


def _category_order_map(session: Session, competition_id: int, modality: str | None) -> dict[str, tuple[int, str]]:
    normalized_modality = str(modality or "individual").strip().lower()
    rows = session.exec(
        select(CompetitionCategory)
        .where(CompetitionCategory.competition_id == competition_id)
        .order_by(CompetitionCategory.orden, CompetitionCategory.nombre)
    ).all()
    out: dict[str, tuple[int, str]] = {}
    for idx, row in enumerate(rows):
        row_modality = str(getattr(row, "modality", "individual") or "individual").strip().lower()
        if row_modality != normalized_modality:
            continue
        label = _normalize_category_label(row.nombre)
        if label:
            out[label.lower()] = (int(row.orden if row.orden is not None else idx), label)
    return out


def _category_sort_key(order_map: dict[str, tuple[int, str]], category: str | None) -> tuple[int, int, str]:
    label = _normalize_category_label(category)
    if not label:
        return (1, 999999, "Sin categoria")
    configured = order_map.get(label.lower())
    if configured:
        return (0, configured[0], configured[1].lower())
    return (0, 999998, label.lower())


def _group_entries_by_category(
    entries: list[dict],
    order_map: dict[str, tuple[int, str]],
) -> list[tuple[str, list[dict]]]:
    groups: dict[str, list[dict]] = {}
    display_names: dict[str, str] = {}
    for entry in entries:
        label = _display_category_label(entry.get("categoria"))
        key = label.lower()
        groups.setdefault(key, []).append(entry)
        display_names.setdefault(key, label)
    return [
        (display_names[key], groups[key])
        for key in sorted(groups, key=lambda item: _category_sort_key(order_map, display_names[item]))
    ]


def _phase_seed_mode(session: Session, competition_id: int, phase: CompetitionPhase) -> str:
    phases = session.exec(
        select(CompetitionPhase)
        .where(CompetitionPhase.competition_id == competition_id, CompetitionPhase.modality == phase.modality)
    ).all()
    ordered = sorted(phases, key=_phase_sort_key)
    if not ordered or int(ordered[0].id or 0) == int(phase.id or 0):
        return "registration"
    return "leaderboard"


def _resolve_seed_mode(session: Session, competition_id: int, phase: CompetitionPhase, requested: str | None = None) -> str:
    raw = str(requested or "auto").strip().lower()
    if raw in {"leaderboard", "ranking", "position", "positions", "current_position", "posicion_actual"}:
        return "leaderboard"
    if raw in {"registration", "inscription", "signup", "inscripcion", "manual"}:
        return "registration"
    return _phase_seed_mode(session, competition_id, phase)


def _leaderboard_seed_map(session: Session, competition_id: int, phase: CompetitionPhase, categoria: str | None) -> dict[int, dict]:
    previous_phases = session.exec(
        select(CompetitionPhase)
        .where(CompetitionPhase.competition_id == competition_id, CompetitionPhase.modality == phase.modality)
    ).all()
    previous_ids = [
        int(item.id)
        for item in previous_phases
        if item.id is not None and _phase_sort_key(item) < _phase_sort_key(phase)
    ]
    if not previous_ids:
        return {}

    result_rows = session.exec(
        select(Result).where(
            Result.competition_id == competition_id,
            Result.user_id.is_not(None),
            Result.phase_id.in_(previous_ids),
        )
    ).all()
    if not result_rows:
        return {}
    participant_ids = {int(row.user_id) for row in result_rows if row.user_id is not None}
    participant_map = {
        int(item.id): item
        for item in session.exec(select(Participant).where(Participant.id.in_(participant_ids))).all()
        if item.id is not None
    }
    competition_participant_map = {
        int(item.user_id): item
        for item in session.exec(
            select(CompetitionParticipant).where(
                CompetitionParticipant.competition_id == competition_id,
                CompetitionParticipant.user_id.in_(participant_ids),
            )
        ).all()
    }
    out: dict[int, dict] = {}
    target_category = (categoria or "").strip().lower()
    for row in result_rows:
        pid = int(row.user_id)
        competition_row = competition_participant_map.get(pid)
        participant = participant_map.get(pid)
        cat = str((competition_row.categoria if competition_row else None) or (participant.categoria if participant else None) or "").strip()
        if target_category and cat.lower() != target_category:
            continue
        current = out.setdefault(
            pid,
            {
                "total_points": 0,
                "best_position": 999999,
                "enrolled_at": competition_row.inscrito_at if competition_row else row.created_at,
            },
        )
        current["total_points"] += int(row.puntos or 0)
        current["best_position"] = min(current["best_position"], int(row.posicion or 999999))
        enrolled_at = competition_row.inscrito_at if competition_row else row.created_at
        if current["enrolled_at"] is None or (enrolled_at is not None and enrolled_at < current["enrolled_at"]):
            current["enrolled_at"] = enrolled_at
    return out


def _is_team_phase(phase: CompetitionPhase) -> bool:
    return str(getattr(phase, "modality", "") or "").strip().lower() in {"teams", "team", "equipo", "equipos"}


def _team_leaderboard_seed_map(session: Session, competition_id: int, phase: CompetitionPhase, categoria: str | None) -> dict[int, dict]:
    previous_phases = session.exec(
        select(CompetitionPhase)
        .where(CompetitionPhase.competition_id == competition_id, CompetitionPhase.modality == phase.modality)
    ).all()
    previous_ids = [
        int(item.id)
        for item in previous_phases
        if item.id is not None and _phase_sort_key(item) < _phase_sort_key(phase)
    ]
    if not previous_ids:
        return {}

    result_rows = session.exec(
        select(Result).where(
            Result.competition_id == competition_id,
            Result.team_id.is_not(None),
            Result.phase_id.in_(previous_ids),
        )
    ).all()
    if not result_rows:
        return {}

    team_ids = {int(row.team_id) for row in result_rows if row.team_id is not None}
    team_map = {
        int(item.id): item
        for item in session.exec(select(Team).where(Team.id.in_(team_ids))).all()
        if item.id is not None
    }
    category_ids = {int(team.team_category_id) for team in team_map.values() if team.team_category_id}
    category_map = {
        int(item.id): item
        for item in session.exec(select(CompetitionCategory).where(CompetitionCategory.id.in_(category_ids))).all()
        if item.id is not None
    } if category_ids else {}

    out: dict[int, dict] = {}
    target_category = (categoria or "").strip().lower()
    for row in result_rows:
        team_id = int(row.team_id)
        team = team_map.get(team_id)
        category = category_map.get(int(team.team_category_id)) if team and team.team_category_id else None
        cat = str(category.nombre if category else "").strip()
        if target_category and cat.lower() != target_category:
            continue
        current = out.setdefault(
            team_id,
            {
                "total_points": 0,
                "best_position": 999999,
                "enrolled_at": team.created_at if team else row.created_at,
            },
        )
        current["total_points"] += int(row.puntos or 0)
        current["best_position"] = min(current["best_position"], int(row.posicion or 999999))
        enrolled_at = team.created_at if team else row.created_at
        if current["enrolled_at"] is None or (enrolled_at is not None and enrolled_at < current["enrolled_at"]):
            current["enrolled_at"] = enrolled_at
    return out


def _eligible_participants(session: Session, competition_id: int, categoria: str | None) -> list[dict]:
    rows = session.execute(
        text(
            """
            SELECT
                p.id,
                p.nombre,
                p.apellido,
                COALESCE(cp.categoria, p.categoria, '') AS categoria,
                cp.inscrito_at
            FROM competition_participants cp
            JOIN participants p ON p.id = cp.user_id
            WHERE cp.competition_id = :cid
              AND cp.estado = 'confirmado'
            ORDER BY cp.inscrito_at, p.id
            """
        ),
        {"cid": competition_id},
    ).mappings().all()
    target_category = (categoria or "").strip().lower()
    items = []
    for row in rows:
        row_category = str(row["categoria"] or "").strip()
        if target_category and row_category.lower() != target_category:
            continue
        items.append(
            {
                "user_id": int(row["id"]),
                "name": f"{row['nombre']} {row['apellido']}".strip(),
                "categoria": row_category,
                "inscrito_at": row["inscrito_at"],
            }
        )
    return items


def _eligible_teams(session: Session, competition_id: int, categoria: str | None) -> list[dict]:
    teams = session.exec(
        select(Team)
        .where(Team.competition_id == competition_id)
        .order_by(Team.created_at, Team.id)
    ).all()
    if not teams:
        return []

    category_ids = {int(team.team_category_id) for team in teams if team.team_category_id}
    category_map = {
        int(item.id): item
        for item in session.exec(select(CompetitionCategory).where(CompetitionCategory.id.in_(category_ids))).all()
        if item.id is not None
    } if category_ids else {}
    target_category = (categoria or "").strip().lower()
    items = []
    for team in teams:
        category = category_map.get(int(team.team_category_id)) if team.team_category_id else None
        row_category = str(category.nombre if category else "").strip()
        if target_category and row_category.lower() != target_category:
            continue
        items.append(
            {
                "team_id": int(team.id),
                "name": team.nombre,
                "categoria": row_category,
                "inscrito_at": team.created_at,
            }
        )
    return items


def _seed_entries_for_phase(session: Session, competition_id: int, phase: CompetitionPhase, categoria: str | None, seed_mode: str | None = None) -> list[dict]:
    if _is_team_phase(phase):
        items = _eligible_teams(session, competition_id, categoria)
        resolved_seed_mode = _resolve_seed_mode(session, competition_id, phase, seed_mode)
        if resolved_seed_mode == "registration":
            return items

        seed_map = _team_leaderboard_seed_map(session, competition_id, phase, categoria)
        enriched = [
            {
                **item,
                "seed_points": seed_map.get(item["team_id"], {}).get("total_points"),
                "seed_position": (
                    seed_map.get(item["team_id"], {}).get("best_position")
                    if seed_map.get(item["team_id"], {}).get("best_position") != 999999
                    else None
                ),
            }
            for item in items
        ]
        return sorted(
            enriched,
            key=lambda item: (
                0 if item["team_id"] in seed_map else 1,
                -(seed_map.get(item["team_id"], {}).get("total_points", -999999)),
                seed_map.get(item["team_id"], {}).get("best_position", 999999),
                seed_map.get(item["team_id"], {}).get("enrolled_at") or item["inscrito_at"] or datetime.max.replace(tzinfo=timezone.utc),
                item["team_id"],
            ),
        )

    items = _eligible_participants(session, competition_id, categoria)
    resolved_seed_mode = _resolve_seed_mode(session, competition_id, phase, seed_mode)
    if resolved_seed_mode == "registration":
        return items

    seed_map = _leaderboard_seed_map(session, competition_id, phase, categoria)
    enriched = [
        {
            **item,
            "seed_points": seed_map.get(item["user_id"], {}).get("total_points"),
            "seed_position": (
                seed_map.get(item["user_id"], {}).get("best_position")
                if seed_map.get(item["user_id"], {}).get("best_position") != 999999
                else None
            ),
        }
        for item in items
    ]
    return sorted(
        enriched,
        key=lambda item: (
            0 if item["user_id"] in seed_map else 1,
            -(seed_map.get(item["user_id"], {}).get("total_points", -999999)),
            seed_map.get(item["user_id"], {}).get("best_position", 999999),
            seed_map.get(item["user_id"], {}).get("enrolled_at") or item["inscrito_at"] or datetime.max.replace(tzinfo=timezone.utc),
            item["user_id"],
        ),
    )


def _apply_advance_limit(entries: list[dict], limit: int | None) -> list[dict]:
    if limit is None:
        return entries
    try:
        normalized_limit = int(limit or 0)
    except (TypeError, ValueError):
        normalized_limit = 0
    if normalized_limit <= 0:
        return entries
    return entries[:normalized_limit]


def _serialize_heat_payload(
    heat: CompetitionHeat,
    phase_name: str,
    assignments: list[dict],
) -> dict:
    return {
        "id": int(heat.id),
        "kind": "heat",
        "phase_id": int(heat.phase_id),
        "phase_name": phase_name,
        "categoria": heat.categoria,
        "heat_label": heat.nombre,
        "heat_number": int(heat.heat_number or 0),
        "lane_count": int(heat.lane_count or 0),
        "heat_transition_seconds": _normalize_transition_seconds(getattr(heat, "heat_transition_seconds", 0)),
        "category_transition_seconds": _normalize_transition_seconds(getattr(heat, "category_transition_seconds", 0)),
        "start_at": heat.start_at.isoformat() if heat.start_at else None,
        "end_at": heat.end_at.isoformat() if heat.end_at else None,
        "location_name": heat.location_name,
        "location_detail": heat.location_detail,
        "note": heat.note,
        "is_published": int(heat.is_published or 0),
        "participants": assignments,
    }


def _schedule_payload(
    session: Session,
    competition: Competition,
    *,
    published_only: bool,
    user_id: int | None = None,
) -> dict:
    phases = session.exec(
        select(CompetitionPhase)
        .where(CompetitionPhase.competition_id == competition.id)
        .order_by(CompetitionPhase.block_order, CompetitionPhase.orden, CompetitionPhase.id)
    ).all()
    if published_only:
        visible_phase_ids = {
            int(phase.id)
            for phase in phases
            if phase.id is not None and normalize_phase_visibility(getattr(phase, "is_visible", 1))
        }
        phases = [phase for phase in phases if phase.id is not None and int(phase.id) in visible_phase_ids]
    else:
        visible_phase_ids = {
            int(phase.id)
            for phase in phases
            if phase.id is not None
        }
    phase_name_map = {int(phase.id): phase.nombre for phase in phases if phase.id is not None}
    phase_payload = [
        {
            "id": int(phase.id),
            "nombre": phase.nombre,
            "descripcion": phase.descripcion,
            "modality": phase.modality,
            "start_at": phase.start_at.isoformat() if phase.start_at else None,
            "end_at": phase.end_at.isoformat() if phase.end_at else None,
            "orden": int(phase.orden or 0),
        }
        for phase in phases
        if phase.id is not None
    ]

    query = select(CompetitionHeat).where(CompetitionHeat.competition_id == competition.id)
    if published_only:
        query = query.where(CompetitionHeat.is_published == 1)
        query = query.where(CompetitionHeat.phase_id.in_(visible_phase_ids))
    heats = session.exec(
        query.order_by(
            CompetitionHeat.start_at,
            CompetitionHeat.phase_id,
            CompetitionHeat.heat_number,
            CompetitionHeat.id,
        )
    ).all()
    heat_ids = [int(heat.id) for heat in heats if heat.id is not None]
    assignments_by_heat: dict[int, list[dict]] = {}
    participant_total: set[int] = set()

    if heat_ids:
        assignment_rows = session.exec(
            select(CompetitionHeatAssignment)
            .where(CompetitionHeatAssignment.heat_id.in_(heat_ids))
            .order_by(
                CompetitionHeatAssignment.heat_id,
                CompetitionHeatAssignment.seed_order,
                CompetitionHeatAssignment.lane_number,
                CompetitionHeatAssignment.id,
            )
        ).all()
        participant_ids = {int(item.user_id) for item in assignment_rows if item.user_id is not None}
        team_ids = {int(item.team_id) for item in assignment_rows if item.team_id is not None}
        participant_map = {
            int(item.id): item
            for item in session.exec(select(Participant).where(Participant.id.in_(participant_ids))).all()
            if item.id is not None
        } if participant_ids else {}
        competition_participant_map = {
            int(item.user_id): item
            for item in session.exec(
                select(CompetitionParticipant).where(
                    CompetitionParticipant.competition_id == int(competition.id),
                    CompetitionParticipant.user_id.in_(participant_ids),
                )
            ).all()
        } if participant_ids else {}
        team_map = {
            int(item.id): item
            for item in session.exec(select(Team).where(Team.id.in_(team_ids))).all()
            if item.id is not None
        } if team_ids else {}
        for row in assignment_rows:
            pid = row.user_id
            if user_id is not None and int(pid or 0) != int(user_id):
                continue
            heat_id = int(row.heat_id)
            participant = participant_map.get(int(pid)) if pid is not None else None
            competition_row = competition_participant_map.get(int(pid)) if pid is not None else None
            team = team_map.get(int(row.team_id)) if row.team_id is not None else None
            assignments_by_heat.setdefault(heat_id, []).append(
                {
                "id": int(row.id),
                    "user_id": int(pid) if pid is not None else None,
                    "user_id": int(pid) if pid is not None else None,
                    "team_id": int(row.team_id) if row.team_id is not None else None,
                    "user_name": (
                        f"{participant.nombre} {participant.apellido}".strip()
                        if pid is not None
                        else str(team.nombre if team else "Equipo")
                    ),
                    "participant_name": (
                        f"{participant.nombre} {participant.apellido}".strip()
                        if pid is not None
                        else str(team.nombre if team else "Equipo")
                    ),
                    "categoria": str((competition_row.categoria if competition_row else None) or (participant.categoria if participant else None) or "").strip(),
                    "lane_number": int(row.lane_number or 0),
                    "seed_order": int(row.seed_order or 0),
                }
            )
            if pid is not None:
                participant_total.add(int(pid))

    items = []
    for heat in heats:
        current_assignments = assignments_by_heat.get(int(heat.id or 0), [])
        if user_id is not None and not current_assignments:
            continue
        items.append(_serialize_heat_payload(heat, phase_name_map.get(int(heat.phase_id), "Fase"), current_assignments))

    updated_at = None
    if heats:
        timestamps = [heat.updated_at or heat.created_at for heat in heats if heat.updated_at or heat.created_at]
        if timestamps:
            updated_at = max(timestamps)

    return {
        "scope": "personal" if user_id is not None else "public",
        "competition": competition.model_dump(),
        "phases": phase_payload,
        "items": items,
        "updated_at": updated_at.isoformat() if updated_at else None,
        "summary": {
            "heats_total": len(items),
            "participants_total": len(participant_total),
        },
    }


def _replace_assignments(
    session: Session,
    heat: CompetitionHeat,
    assignments: list[HeatAssignmentInput],
) -> None:
    existing = session.exec(
        select(CompetitionHeatAssignment).where(CompetitionHeatAssignment.heat_id == int(heat.id))
    ).all()
    for item in existing:
        session.delete(item)
    session.flush()

    seen_users: set[int] = set()
    seen_teams: set[int] = set()
    for idx, entry in enumerate(assignments):
        resolved_user_id = entry.user_id
        if resolved_user_id is None and entry.team_id is None:
            continue
        if resolved_user_id is not None:
            user_key = int(resolved_user_id)
            if user_key in seen_users:
                continue
            seen_users.add(user_key)
            duplicate_rows = session.exec(
                select(CompetitionHeatAssignment)
                .join(CompetitionHeat, CompetitionHeat.id == CompetitionHeatAssignment.heat_id)
                .where(
                    CompetitionHeat.competition_id == int(heat.competition_id),
                    CompetitionHeat.phase_id == int(heat.phase_id),
                    CompetitionHeatAssignment.user_id == user_key,
                    CompetitionHeatAssignment.heat_id != int(heat.id),
                )
            ).all()
            for duplicate in duplicate_rows:
                session.delete(duplicate)
        if entry.team_id is not None:
            team_key = int(entry.team_id)
            if team_key in seen_teams:
                continue
            seen_teams.add(team_key)
            duplicate_rows = session.exec(
                select(CompetitionHeatAssignment)
                .join(CompetitionHeat, CompetitionHeat.id == CompetitionHeatAssignment.heat_id)
                .where(
                    CompetitionHeat.competition_id == int(heat.competition_id),
                    CompetitionHeat.phase_id == int(heat.phase_id),
                    CompetitionHeatAssignment.team_id == team_key,
                    CompetitionHeatAssignment.heat_id != int(heat.id),
                )
            ).all()
            for duplicate in duplicate_rows:
                session.delete(duplicate)
        session.flush()
        session.add(
                CompetitionHeatAssignment(
                    heat_id=int(heat.id),
                user_id=resolved_user_id,
                team_id=entry.team_id,
                lane_number=max(1, int(entry.lane_number or 1)),
                seed_order=int(entry.seed_order if entry.seed_order else idx + 1),
            )
        )


def _validate_heat_input(session: Session, competition_id: int, payload: HeatInput, timezone_name: str) -> CompetitionPhase:
    phase = session.get(CompetitionPhase, payload.phase_id)
    if not phase or int(phase.competition_id) != int(competition_id):
        raise HTTPException(400, "La fase no pertenece a esta competencia")
    start_at = _normalize_dt(payload.start_at, timezone_name)
    end_at = _normalize_dt(payload.end_at, timezone_name)
    if end_at and start_at and start_at > end_at:
        raise HTTPException(400, "La hora de inicio no puede ser mayor a la hora final")
    return phase


def _heat_schedule_label(value: object) -> str:
    return str(getattr(value, "nombre", None) or getattr(value, "heat_label", None) or f"Heat {getattr(value, 'heat_number', '')}").strip()


def _location_key(value: str | None) -> str:
    return str(value or "").strip().lower()


def _heat_schedule_range(heat: CompetitionHeat) -> dict | None:
    start_at = _as_utc(heat.start_at)
    end_at = _as_utc(heat.end_at)
    location = str(heat.location_name or "").strip()
    if not start_at or not end_at or not location:
        return None
    return {
        "heat_id": int(heat.id or 0),
        "label": _heat_schedule_label(heat),
        "location": location,
        "location_key": _location_key(location),
        "start_at": start_at,
        "end_at": end_at,
    }


def _proposed_heat_schedule_range(
    *,
    heat_id: int | None = None,
    label: str = "Heat",
    location_name: str | None = None,
    start_at: datetime | None = None,
    end_at: datetime | None = None,
) -> dict | None:
    start = _as_utc(start_at)
    end = _as_utc(end_at)
    location = str(location_name or "").strip()
    if not start or not end or not location:
        return None
    return {
        "heat_id": int(heat_id or 0),
        "label": str(label or "Heat").strip() or "Heat",
        "location": location,
        "location_key": _location_key(location),
        "start_at": start,
        "end_at": end,
    }


def _ranges_overlap(left: dict, right: dict) -> bool:
    return (
        left["location_key"] == right["location_key"]
        and left["start_at"] < right["end_at"]
        and left["end_at"] > right["start_at"]
    )


def _find_heat_location_conflicts(
    session: Session,
    competition_id: int,
    proposed_ranges: list[dict],
    *,
    ignore_heat_ids: set[int] | None = None,
) -> list[dict]:
    proposed = [item for item in proposed_ranges if item]
    if not proposed:
        return []
    ignored = ignore_heat_ids or set()
    existing_heats = session.exec(
        select(CompetitionHeat).where(CompetitionHeat.competition_id == int(competition_id))
    ).all()
    existing_ranges = [
        item
        for item in (_heat_schedule_range(heat) for heat in existing_heats)
        if item and int(item["heat_id"]) not in ignored
    ]
    conflicts: list[dict] = []
    seen_pairs: set[tuple[str, str]] = set()

    for index, left in enumerate(proposed):
        for right in existing_ranges:
            if _ranges_overlap(left, right):
                pair = tuple(sorted((f"p:{id(left)}", f"e:{right['heat_id']}")))
                if pair in seen_pairs:
                    continue
                seen_pairs.add(pair)
                conflicts.append({
                    "location_name": left["location"],
                    "labels": [left["label"], right["label"]],
                    "heat_ids": [left.get("heat_id"), right.get("heat_id")],
                })
        for right in proposed[index + 1:]:
            if _ranges_overlap(left, right):
                pair = tuple(sorted((f"p:{id(left)}", f"p:{id(right)}")))
                if pair in seen_pairs:
                    continue
                seen_pairs.add(pair)
                conflicts.append({
                    "location_name": left["location"],
                    "labels": [left["label"], right["label"]],
                    "heat_ids": [left.get("heat_id"), right.get("heat_id")],
                })
    return conflicts


def _raise_heat_location_conflict(conflicts: list[dict]) -> None:
    if not conflicts:
        return
    first = conflicts[0]
    labels = first.get("labels") or ["Heat", "otro heat"]
    location = first.get("location_name") or "la misma ubicacion"
    raise HTTPException(
        409,
        f"No puedes programar heats solapados en {location}: {labels[0]} se cruza con {labels[1]}",
    )


def _phase_schedule_bounds(heats: list[CompetitionHeat]) -> tuple[datetime | None, datetime | None]:
    starts = [_as_utc(heat.start_at) for heat in heats if _as_utc(heat.start_at)]
    ends = [_as_utc(heat.end_at) for heat in heats if _as_utc(heat.end_at)]
    return (min(starts) if starts else None, max(ends) if ends else None)


def _heat_duration_seconds(heat: CompetitionHeat, phase: CompetitionPhase) -> int:
    start_at = _as_utc(heat.start_at)
    end_at = _as_utc(heat.end_at)
    if start_at and end_at and end_at > start_at:
        return max(60, int((end_at - start_at).total_seconds()))
    return max(60, int(getattr(phase, "heat_duration_seconds", 900) or 900))


def _transition_seconds_between(previous_heat: CompetitionHeat | None, next_heat: CompetitionHeat, phase: CompetitionPhase) -> int:
    if previous_heat is None:
        return 0
    heat_gap = _normalize_transition_seconds(
        getattr(previous_heat, "heat_transition_seconds", None) or getattr(phase, "heat_transition_seconds", 0)
    )
    category_gap = _normalize_transition_seconds(
        getattr(previous_heat, "category_transition_seconds", None) or getattr(phase, "category_transition_seconds", 0)
    )
    previous_category = _normalize_category_label(previous_heat.categoria).lower()
    next_category = _normalize_category_label(next_heat.categoria).lower()
    if previous_category != next_category and category_gap > heat_gap:
        return category_gap
    return heat_gap


def _reflow_phase_heats_after_delete(
    session: Session,
    competition_id: int,
    phase: CompetitionPhase,
    deleted_heat: CompetitionHeat,
) -> int:
    deleted_start = _as_utc(deleted_heat.start_at)
    phase_heats = session.exec(
        select(CompetitionHeat)
        .where(
            CompetitionHeat.competition_id == int(competition_id),
            CompetitionHeat.phase_id == int(deleted_heat.phase_id),
            CompetitionHeat.id != int(deleted_heat.id),
        )
        .order_by(CompetitionHeat.start_at, CompetitionHeat.heat_number, CompetitionHeat.id)
    ).all()
    if not phase_heats:
        phase.start_at = None
        phase.end_at = None
        session.add(phase)
        return 0
    if not deleted_start:
        phase.start_at, phase.end_at = _phase_schedule_bounds(phase_heats)
        session.add(phase)
        return 0

    def is_after_deleted(heat: CompetitionHeat) -> bool:
        start_at = _as_utc(heat.start_at)
        if not start_at:
            return False
        if start_at > deleted_start:
            return True
        if start_at == deleted_start:
            return int(heat.heat_number or 0) > int(deleted_heat.heat_number or 0) or int(heat.id or 0) > int(deleted_heat.id or 0)
        return False

    following = [heat for heat in phase_heats if is_after_deleted(heat)]
    if not following:
        phase.start_at, phase.end_at = _phase_schedule_bounds(phase_heats)
        session.add(phase)
        return 0

    cursor = deleted_start
    previous_heat: CompetitionHeat | None = None
    changes: list[dict] = []
    for heat in following:
        cursor = cursor + timedelta(seconds=_transition_seconds_between(previous_heat, heat, phase))
        duration_seconds = _heat_duration_seconds(heat, phase)
        next_start = cursor
        next_end = next_start + timedelta(seconds=duration_seconds)
        changes.append({
            "heat": heat,
            "start_at": next_start,
            "end_at": next_end,
        })
        cursor = next_end
        previous_heat = heat

    proposed_ranges = [
        _proposed_heat_schedule_range(
            heat_id=int(item["heat"].id),
            label=_heat_schedule_label(item["heat"]),
            location_name=item["heat"].location_name,
            start_at=item["start_at"],
            end_at=item["end_at"],
        )
        for item in changes
    ]
    _raise_heat_location_conflict(_find_heat_location_conflicts(
        session,
        competition_id,
        [item for item in proposed_ranges if item],
        ignore_heat_ids={int(deleted_heat.id), *[int(item["heat"].id) for item in changes]},
    ))

    for item in changes:
        heat = item["heat"]
        heat.start_at = item["start_at"]
        heat.end_at = item["end_at"]
        session.add(heat)

    phase.start_at, phase.end_at = _phase_schedule_bounds(phase_heats)
    session.add(phase)
    return len(changes)


def _heat_reschedule_plan(
    session: Session,
    competition: Competition,
    phase_id: int,
    body: HeatRescheduleInput,
) -> tuple[CompetitionPhase, list[CompetitionHeat], list[dict], list[dict], dict]:
    phase = session.get(CompetitionPhase, phase_id)
    if not phase or int(phase.competition_id) != int(competition.id):
        raise HTTPException(404, "WOD no encontrado")
    all_heats = session.exec(
        select(CompetitionHeat).where(CompetitionHeat.competition_id == int(competition.id))
    ).all()
    phase_heats = [heat for heat in all_heats if int(heat.phase_id) == int(phase_id)]
    if not phase_heats:
        raise HTTPException(400, "Este WOD no tiene heats para reprogramar")

    order_map = _category_order_map(session, int(competition.id), phase.modality)
    ordered = sorted(
        phase_heats,
        key=lambda heat: (
            _category_sort_key(order_map, heat.categoria),
            int(heat.heat_number or 0),
            int(heat.id or 0),
        ),
    )
    start_index = 0
    if body.from_heat_id:
        start_index = next(
            (index for index, heat in enumerate(ordered) if int(heat.id or 0) == int(body.from_heat_id)),
            -1,
        )
        if start_index < 0:
            raise HTTPException(400, "El heat inicial no pertenece a este WOD")
    selected = ordered[start_index:]

    duration_seconds = max(60, int(body.heat_duration_minutes or 15) * 60)
    if phase.time_cap_seconds and duration_seconds < int(phase.time_cap_seconds):
        raise HTTPException(400, "La duracion del heat no puede ser menor al time cap del WOD")
    heat_gap_seconds = max(0, int(body.heat_gap_minutes or 0) * 60)
    category_gap_seconds = max(0, int(body.category_transition_minutes or 0) * 60)
    anchor = _as_utc(_normalize_dt(body.first_heat_start_at, competition.timezone))
    if not anchor:
        anchor = _as_utc(selected[0].start_at)
    if not anchor:
        raise HTTPException(400, "Define la fecha y hora del primer heat")

    changes: list[dict] = []
    cursor = anchor
    previous_category: str | None = None
    for heat in selected:
        category = _normalize_category_label(heat.categoria).lower()
        start_at = cursor
        if previous_category is not None:
            gap_seconds = category_gap_seconds if category != previous_category else heat_gap_seconds
            start_at = start_at + timedelta(seconds=gap_seconds)
        end_at = start_at + timedelta(seconds=duration_seconds)
        changes.append({
            "heat": heat,
            "heat_id": int(heat.id),
            "phase_id": int(heat.phase_id),
            "phase_name": phase.nombre,
            "heat_label": heat.nombre,
            "categoria": heat.categoria,
            "location_name": heat.location_name,
            "old_start_at": heat.start_at,
            "old_end_at": heat.end_at,
            "start_at": start_at,
            "end_at": end_at,
            "shifted_following": False,
        })
        cursor = end_at
        previous_category = category

    old_end = max(
        (_as_utc(heat.end_at or heat.start_at) for heat in selected if heat.end_at or heat.start_at),
        default=None,
    )
    new_end = changes[-1]["end_at"]
    delta = new_end - old_end if old_end else timedelta(0)
    following_changes: list[dict] = []
    selected_ids = {int(heat.id) for heat in selected}
    selected_locations = {
        str(heat.location_name or "").strip().lower()
        for heat in selected
        if str(heat.location_name or "").strip()
    }
    if body.shift_following_blocks and delta != timedelta(0) and old_end and selected_locations:
        for heat in all_heats:
            location = str(heat.location_name or "").strip().lower()
            if (
                int(heat.id or 0) not in selected_ids
                and int(heat.phase_id) != int(phase_id)
                and location in selected_locations
                and _as_utc(heat.start_at)
                and _as_utc(heat.start_at) >= old_end
            ):
                following_start = _as_utc(heat.start_at)
                following_end = _as_utc(heat.end_at)
                following_changes.append({
                    "heat": heat,
                    "heat_id": int(heat.id),
                    "phase_id": int(heat.phase_id),
                    "phase_name": "",
                    "heat_label": heat.nombre,
                    "categoria": heat.categoria,
                    "location_name": heat.location_name,
                    "old_start_at": heat.start_at,
                    "old_end_at": heat.end_at,
                    "start_at": following_start + delta,
                    "end_at": following_end + delta if following_end else None,
                    "shifted_following": True,
                })

    proposed = {item["heat_id"]: item for item in changes + following_changes}
    ranges: list[dict] = []
    for heat in all_heats:
        item = proposed.get(int(heat.id or 0))
        start_at = item["start_at"] if item else _as_utc(heat.start_at)
        end_at = item["end_at"] if item else _as_utc(heat.end_at)
        if start_at and end_at and heat.location_name:
            ranges.append({
                "heat_id": int(heat.id),
                "label": heat.nombre,
                "location": str(heat.location_name).strip(),
                "start_at": start_at,
                "end_at": end_at,
            })
    conflicts: list[dict] = []
    seen_pairs: set[tuple[int, int]] = set()
    for index, left in enumerate(ranges):
        for right in ranges[index + 1:]:
            if left["location"].lower() != right["location"].lower():
                continue
            if left["start_at"] < right["end_at"] and left["end_at"] > right["start_at"]:
                pair = tuple(sorted((left["heat_id"], right["heat_id"])))
                if pair in seen_pairs or not (pair[0] in proposed or pair[1] in proposed):
                    continue
                seen_pairs.add(pair)
                conflicts.append({
                    "location_name": left["location"],
                    "heat_ids": list(pair),
                    "labels": [left["label"], right["label"]],
                })

    summary = {
        "phase_id": int(phase.id),
        "phase_name": phase.nombre,
        "affected_heats": len(changes),
        "shifted_following_heats": len(following_changes),
        "old_end_at": old_end,
        "new_end_at": new_end,
        "delta_minutes": round(delta.total_seconds() / 60) if old_end else 0,
        "heat_duration_minutes": duration_seconds // 60,
        "heat_gap_minutes": heat_gap_seconds // 60,
        "category_transition_minutes": category_gap_seconds // 60,
    }
    return phase, selected, changes + following_changes, conflicts, summary


def _serialize_reschedule_plan(changes: list[dict], conflicts: list[dict], summary: dict) -> dict:
    return {
        "ok": True,
        "summary": {
            **summary,
            "old_end_at": summary["old_end_at"].isoformat() if summary["old_end_at"] else None,
            "new_end_at": summary["new_end_at"].isoformat() if summary["new_end_at"] else None,
        },
        "conflicts": conflicts,
        "changes": [
            {
                key: value.isoformat() if isinstance(value, datetime) else value
                for key, value in item.items()
                if key != "heat"
            }
            for item in changes
        ],
    }


def _existing_heat_summary(session: Session, competition_id: int, phase_id: int) -> dict:
    rows = session.exec(
        select(CompetitionHeat).where(
            CompetitionHeat.competition_id == competition_id,
            CompetitionHeat.phase_id == phase_id,
        )
    ).all()
    heat_ids = [int(row.id) for row in rows if row.id is not None]
    assignment_count = 0
    if heat_ids:
        assignment_count = int(session.exec(
            select(CompetitionHeatAssignment)
            .where(CompetitionHeatAssignment.heat_id.in_(heat_ids))
        ).all().__len__())
    categories: dict[str, int] = {}
    for row in rows:
        categories[_display_category_label(row.categoria)] = categories.get(_display_category_label(row.categoria), 0) + 1
    return {
        "heats": len(rows),
        "assignments": assignment_count,
        "categories": [
            {"categoria": label, "heats": count}
            for label, count in sorted(categories.items(), key=lambda item: item[0].lower())
        ],
    }


def _build_generation_plan(
    session: Session,
    competition_id: int,
    body: HeatGenerateInput,
) -> tuple[CompetitionPhase, str, list[dict], dict]:
    phase = session.get(CompetitionPhase, body.phase_id)
    if not phase or int(phase.competition_id) != int(competition_id):
        raise HTTPException(400, "La fase no pertenece a esta competencia")
    mode = _normalize_generation_mode(body.generation_mode, body.categoria)
    if mode == "single_category" and not _normalize_category_label(body.categoria):
        raise HTTPException(400, "Selecciona una categoria para generar solo esa categoria")
    lane_count = max(1, int(body.lane_count or 1))
    advance_limit = max(0, int(body.advance_limit or 0)) if body.advance_limit is not None else 0
    seed_mode = "leaderboard" if advance_limit else _resolve_seed_mode(session, competition_id, phase, body.seed_mode)
    all_entries = _seed_entries_for_phase(session, competition_id, phase, None, seed_mode)
    if not all_entries:
        raise HTTPException(400, "No hay equipos creados para generar heats" if _is_team_phase(phase) else "No hay participantes confirmados para generar heats")
    order_map = _category_order_map(session, competition_id, phase.modality)

    if mode == "by_category":
        groups = _group_entries_by_category(all_entries, order_map)
    elif mode == "single_category":
        entries = _seed_entries_for_phase(session, competition_id, phase, body.categoria, seed_mode)
        groups = [(_display_category_label(body.categoria), entries)]
    else:
        groups = [("Todos mezclados", _seed_entries_for_phase(session, competition_id, phase, None, seed_mode))]

    plan_items: list[dict] = []
    for label, entries in groups:
        entries = _apply_advance_limit(entries, advance_limit)
        if not entries:
            continue
        requested_count = max(1, int(body.heat_count or 0)) if body.heat_count and mode != "by_category" else 0
        heat_count = requested_count or ((len(entries) + lane_count - 1) // lane_count)
        plan_items.append({
            "categoria": label,
            "heat_categoria": None if mode == "mixed" else (None if label == "Sin categoria" else label),
            "participants": len(entries),
            "heats": heat_count,
            "entries": entries,
            "mixed": mode == "mixed",
        })

    if not plan_items:
        raise HTTPException(400, "No hay equipos creados para generar heats" if _is_team_phase(phase) else "No hay participantes confirmados para generar heats")

    return phase, mode, plan_items, {
        "lane_count": lane_count,
        "seed_mode": seed_mode,
        "advance_limit": advance_limit,
        "existing": _existing_heat_summary(session, competition_id, body.phase_id),
    }


def _build_heat_generation_preview(
    competition: Competition,
    phase: CompetitionPhase,
    body: HeatGenerateInput,
    plan_items: list[dict],
    lane_count: int,
    seed_mode: str,
) -> list[dict]:
    first_start = _normalize_dt(body.first_heat_start_at, competition.timezone) or _normalize_dt(phase.start_at, competition.timezone)
    duration = max(1, int(body.heat_duration_minutes or 15))
    gap = max(0, int(body.heat_gap_minutes or 0))
    heat_transition_seconds = _normalize_transition_seconds(body.heat_transition_seconds)
    category_transition_seconds = _normalize_transition_seconds(body.category_transition_seconds)
    if heat_transition_seconds == 0 and gap > 0:
        heat_transition_seconds = gap * 60
    lane_order = _build_lane_order(lane_count)
    current_start = first_start
    previous_category: str | None = None
    continuous_numbers = _uses_continuous_heat_numbers(body.heat_numbering_mode)
    next_heat_number = 1
    out: list[dict] = []

    for plan_item in plan_items:
        entries = plan_item["entries"]
        chunks = [entries[i:i + lane_count] for i in range(0, len(entries), lane_count)]
        if seed_mode == "leaderboard":
            chunks = list(reversed(chunks))
        for heat_index, current_chunk in enumerate(chunks):
            if not current_chunk:
                continue
            display_number = next_heat_number if continuous_numbers else heat_index + 1
            if continuous_numbers:
                next_heat_number += 1
            current_category = str(plan_item["heat_categoria"] or "")
            start_at = current_start
            if (
                start_at
                and previous_category is not None
                and current_category != previous_category
                and category_transition_seconds > heat_transition_seconds
            ):
                start_at = start_at + timedelta(seconds=category_transition_seconds - heat_transition_seconds)
            end_at = start_at + timedelta(minutes=duration) if start_at else None
            out.append({
                "heat_number": display_number,
                "heat_label": f"Heat {display_number}",
                "categoria": plan_item["heat_categoria"],
                "start_at": start_at.isoformat() if start_at else None,
                "end_at": end_at.isoformat() if end_at else None,
                "location_name": (body.location_name or "").strip() or None,
                "location_detail": (body.location_detail or "").strip() or None,
                "participants": [
                    {
                        "user_id": int(entry["user_id"]) if entry.get("user_id") is not None else None,
                        "team_id": int(entry["team_id"]) if entry.get("team_id") is not None else None,
                        "name": entry.get("name") or "Atleta",
                        "categoria": entry.get("categoria"),
                        "lane_number": lane_order[seed_index] if seed_index < len(lane_order) else seed_index + 1,
                        "seed_order": seed_index + 1,
                        "seed_position": entry.get("seed_position"),
                        "seed_points": entry.get("seed_points"),
                    }
                    for seed_index, entry in enumerate(current_chunk)
                ],
            })
            if current_start:
                current_start = end_at + timedelta(seconds=heat_transition_seconds) if end_at else None
                previous_category = current_category
    return out


@router.get("/{competition_id}/schedule")
def get_public_schedule(
    competition_id: int,
    session: Session = Depends(get_session),
    user=Depends(get_current_user_optional),
):
    competition = require_competition_access(session, competition_id, user)
    return _schedule_payload(session, competition, published_only=True)


@router.get("/{competition_id}/my-schedule")
@router.get("/users/me/competitions/{competition_id}/schedule")
def get_my_schedule(
    competition_id: int,
    session: Session = Depends(get_session),
    user=Depends(require_auth),
):
    competition = require_competition_access(session, competition_id, user)
    user_id = get_effective_user_id(user)
    if not is_end_user(user) or user_id is None:
        raise HTTPException(403, "Solo participantes autenticados pueden ver su cronograma")
    enrollment = session.get(CompetitionParticipant, (competition_id, user_id))
    if not enrollment or str(enrollment.estado or "").strip().lower() != "confirmado":
        raise HTTPException(403, "Tu inscripcion aun no esta confirmada para esta competencia")
    return _schedule_payload(session, competition, published_only=True, user_id=user_id)


@router.get("/{competition_id}/schedule/me")
def get_my_schedule_alias(
    competition_id: int,
    session: Session = Depends(get_session),
    user=Depends(require_auth),
):
    return get_my_schedule(competition_id, session=session, user=user)


@router.get("/{competition_id}/heats")
def list_heats(
    competition_id: int,
    session: Session = Depends(get_session),
    user=Depends(require_staff),
):
    competition = require_competition_access(session, competition_id, user)
    return _schedule_payload(session, competition, published_only=False)


@router.post("/{competition_id}/heats")
def create_heat(
    competition_id: int,
    body: HeatInput,
    session: Session = Depends(get_session),
    user=Depends(require_staff),
):
    competition = require_competition_access(session, competition_id, user)
    _validate_heat_input(session, competition_id, body, competition.timezone)
    start_at = _normalize_dt(body.start_at, competition.timezone)
    end_at = _normalize_dt(body.end_at, competition.timezone)
    location_name = (body.location_name or "").strip() or None
    _raise_heat_location_conflict(_find_heat_location_conflicts(
        session,
        competition_id,
        [_proposed_heat_schedule_range(
            label=body.nombre.strip() or f"Heat {body.heat_number or 1}",
            location_name=location_name,
            start_at=start_at,
            end_at=end_at,
        )],
    ))
    heat = CompetitionHeat(
        competition_id=competition_id,
        phase_id=body.phase_id,
        categoria=(body.categoria or "").strip() or None,
        nombre=body.nombre.strip(),
        heat_number=max(1, int(body.heat_number or 1)),
        lane_count=max(0, int(body.lane_count or 0)),
        heat_transition_seconds=_normalize_transition_seconds(body.heat_transition_seconds),
        category_transition_seconds=_normalize_transition_seconds(body.category_transition_seconds),
        start_at=start_at,
        end_at=end_at,
        location_name=location_name,
        location_detail=(body.location_detail or "").strip() or None,
        note=(body.note or "").strip() or None,
        is_published=1 if body.is_published else 0,
        published_at=datetime.now(timezone.utc) if body.is_published else None,
    )
    session.add(heat)
    session.commit()
    session.refresh(heat)
    _replace_assignments(session, heat, body.assignments)
    session.add(heat)
    session.commit()
    session.refresh(heat)
    return {"ok": True, "heat_id": int(heat.id)}


@router.post("/{competition_id}/phases/{phase_id}/heats/reschedule/preview")
def preview_reschedule_heats(
    competition_id: int,
    phase_id: int,
    body: HeatRescheduleInput,
    session: Session = Depends(get_session),
    user=Depends(require_staff),
):
    competition = require_competition_access(session, competition_id, user)
    _phase, _selected, changes, conflicts, summary = _heat_reschedule_plan(
        session, competition, phase_id, body
    )
    return _serialize_reschedule_plan(changes, conflicts, summary)


@router.post("/{competition_id}/phases/{phase_id}/heats/reschedule")
def reschedule_heats(
    competition_id: int,
    phase_id: int,
    body: HeatRescheduleInput,
    session: Session = Depends(get_session),
    user=Depends(require_staff),
):
    competition = require_competition_access(session, competition_id, user)
    phase, selected, changes, conflicts, summary = _heat_reschedule_plan(
        session, competition, phase_id, body
    )
    if conflicts:
        raise HTTPException(409, "La nueva programacion genera solapes en la ubicacion")

    duration_seconds = max(60, int(body.heat_duration_minutes or 15) * 60)
    heat_gap_seconds = max(0, int(body.heat_gap_minutes or 0) * 60)
    category_gap_seconds = max(0, int(body.category_transition_minutes or 0) * 60)
    phase.heat_duration_seconds = duration_seconds
    phase.heat_transition_seconds = heat_gap_seconds
    phase.category_transition_seconds = category_gap_seconds
    if selected and not body.from_heat_id:
        phase.start_at = changes[0]["start_at"]
    phase.end_at = summary["new_end_at"]
    session.add(phase)
    for item in changes:
        heat = item["heat"]
        heat.start_at = item["start_at"]
        heat.end_at = item["end_at"]
        if not item["shifted_following"]:
            heat.heat_transition_seconds = heat_gap_seconds
            heat.category_transition_seconds = category_gap_seconds
        session.add(heat)
    session.commit()
    return _serialize_reschedule_plan(changes, conflicts, summary)


@router.put("/{competition_id}/heats/{heat_id}")
def update_heat(
    competition_id: int,
    heat_id: int,
    body: HeatInput,
    session: Session = Depends(get_session),
    user=Depends(require_staff),
):
    competition = require_competition_access(session, competition_id, user)
    _validate_heat_input(session, competition_id, body, competition.timezone)
    heat = session.get(CompetitionHeat, heat_id)
    if not heat or int(heat.competition_id) != int(competition_id):
        raise HTTPException(404, "Heat no encontrado")
    start_at = _normalize_dt(body.start_at, competition.timezone)
    end_at = _normalize_dt(body.end_at, competition.timezone)
    location_name = (body.location_name or "").strip() or None
    _raise_heat_location_conflict(_find_heat_location_conflicts(
        session,
        competition_id,
        [_proposed_heat_schedule_range(
            heat_id=int(heat.id),
            label=body.nombre.strip() or f"Heat {body.heat_number or 1}",
            location_name=location_name,
            start_at=start_at,
            end_at=end_at,
        )],
        ignore_heat_ids={int(heat.id)},
    ))
    was_published = int(heat.is_published or 0) == 1
    heat.phase_id = body.phase_id
    heat.categoria = (body.categoria or "").strip() or None
    heat.nombre = body.nombre.strip()
    heat.heat_number = max(1, int(body.heat_number or 1))
    heat.lane_count = max(0, int(body.lane_count or 0))
    heat.heat_transition_seconds = _normalize_transition_seconds(body.heat_transition_seconds)
    heat.category_transition_seconds = _normalize_transition_seconds(body.category_transition_seconds)
    heat.start_at = start_at
    heat.end_at = end_at
    heat.location_name = location_name
    heat.location_detail = (body.location_detail or "").strip() or None
    heat.note = (body.note or "").strip() or None
    heat.is_published = 1 if body.is_published else 0
    if body.is_published and not was_published:
        heat.published_at = datetime.now(timezone.utc)
    if not body.is_published:
        heat.published_at = None
    session.add(heat)
    session.commit()
    session.refresh(heat)
    _replace_assignments(session, heat, body.assignments)
    session.add(heat)
    session.commit()
    return {"ok": True}


@router.delete("/{competition_id}/heats/{heat_id}", status_code=204)
def delete_heat(
    competition_id: int,
    heat_id: int,
    session: Session = Depends(get_session),
    user=Depends(require_staff),
):
    require_competition_access(session, competition_id, user)
    heat = session.get(CompetitionHeat, heat_id)
    if not heat or int(heat.competition_id) != int(competition_id):
        raise HTTPException(404, "Heat no encontrado")
    phase = session.get(CompetitionPhase, heat.phase_id)
    if phase and int(phase.competition_id) == int(competition_id):
        _reflow_phase_heats_after_delete(session, competition_id, phase, heat)
    session.delete(heat)
    session.commit()


@router.delete("/{competition_id}/heats/phase/{phase_id}")
def delete_phase_heats(
    competition_id: int,
    phase_id: int,
    session: Session = Depends(get_session),
    user=Depends(require_staff),
):
    require_competition_access(session, competition_id, user)
    phase = session.get(CompetitionPhase, phase_id)
    if not phase or int(phase.competition_id) != int(competition_id):
        raise HTTPException(404, "WOD no encontrado")
    heats = session.exec(
        select(CompetitionHeat).where(
            CompetitionHeat.competition_id == competition_id,
            CompetitionHeat.phase_id == phase_id,
        )
    ).all()
    deleted_count = len(heats)
    for heat in heats:
        session.delete(heat)
    session.commit()
    return {"ok": True, "phase_id": phase_id, "deleted_heats": deleted_count}


@router.put("/{competition_id}/heats/{heat_id}/assignments")
def replace_heat_assignments(
    competition_id: int,
    heat_id: int,
    body: list[HeatAssignmentInput],
    session: Session = Depends(get_session),
    user=Depends(require_staff),
):
    require_competition_access(session, competition_id, user)
    heat = session.get(CompetitionHeat, heat_id)
    if not heat or int(heat.competition_id) != int(competition_id):
        raise HTTPException(404, "Heat no encontrado")
    _replace_assignments(session, heat, body)
    session.commit()
    return {"ok": True}


@router.put("/{competition_id}/heats/{heat_id}/move-assignment")
def move_heat_assignment(
    competition_id: int,
    heat_id: int,
    body: HeatMoveInput,
    session: Session = Depends(get_session),
    user=Depends(require_staff),
):
    require_competition_access(session, competition_id, user)
    source_heat = session.get(CompetitionHeat, heat_id)
    target_heat = session.get(CompetitionHeat, body.target_heat_id)
    if not source_heat or int(source_heat.competition_id) != int(competition_id):
        raise HTTPException(404, "Heat origen no encontrado")
    if not target_heat or int(target_heat.competition_id) != int(competition_id):
        raise HTTPException(404, "Heat destino no encontrado")
    if int(source_heat.phase_id) != int(target_heat.phase_id):
        raise HTTPException(400, "Solo puedes mover atletas dentro del mismo evento")
    if int(source_heat.id) == int(target_heat.id):
        raise HTTPException(400, "Selecciona un heat destino diferente")
    if body.user_id is None and body.team_id is None:
        raise HTTPException(400, "Selecciona un atleta o equipo para mover")

    source_assignment = None
    source_rows = session.exec(
        select(CompetitionHeatAssignment).where(CompetitionHeatAssignment.heat_id == int(source_heat.id))
    ).all()
    for row in source_rows:
        if body.user_id is not None and int(row.user_id or 0) == int(body.user_id):
            source_assignment = row
            break
        if body.team_id is not None and int(row.team_id or 0) == int(body.team_id):
            source_assignment = row
            break
    if not source_assignment:
        raise HTTPException(404, "Asignacion no encontrada en el heat origen")

    target_rows = session.exec(
        select(CompetitionHeatAssignment).where(CompetitionHeatAssignment.heat_id == int(target_heat.id))
    ).all()
    used_lanes = {int(row.lane_number or 0) for row in target_rows}
    next_lane = body.lane_number
    if not next_lane:
        for lane in range(1, max(1, int(target_heat.lane_count or 1)) + 1):
            if lane not in used_lanes:
                next_lane = lane
                break
        if not next_lane:
            next_lane = len(target_rows) + 1

    session.delete(source_assignment)
    session.flush()
    _replace_assignments(
        session,
        target_heat,
        [
            *[
                HeatAssignmentInput(
                    user_id=row.user_id,
                    team_id=row.team_id,
                    lane_number=row.lane_number,
                    seed_order=row.seed_order,
                )
                for row in target_rows
            ],
            HeatAssignmentInput(
                user_id=body.user_id,
                team_id=body.team_id,
                lane_number=max(1, int(next_lane or 1)),
                seed_order=len(target_rows) + 1,
            ),
        ],
    )
    session.commit()

    remaining = session.exec(
        select(CompetitionHeatAssignment).where(CompetitionHeatAssignment.heat_id == int(source_heat.id))
    ).all()
    source_empty = len(remaining) == 0
    if source_empty:
        session.delete(source_heat)
        session.commit()
    return {
        "ok": True,
        "source_heat_id": int(source_heat.id),
        "target_heat_id": int(target_heat.id),
        "source_empty": source_empty,
        "source_deleted": source_empty,
        "target_count": len(target_rows) + 1,
    }


@router.post("/{competition_id}/heats/generate/preview")
def preview_generate_heats(
    competition_id: int,
    body: HeatGenerateInput,
    session: Session = Depends(get_session),
    user=Depends(require_staff),
):
    competition = require_competition_access(session, competition_id, user)
    phase, mode, plan_items, meta = _build_generation_plan(session, competition_id, body)
    seed_mode = meta["seed_mode"]
    heats_preview = _build_heat_generation_preview(
        competition,
        phase,
        body,
        plan_items,
        meta["lane_count"],
        seed_mode,
    )
    return {
        "ok": True,
        "phase_id": int(phase.id),
        "phase_name": phase.nombre,
        "generation_mode": mode,
        "seed_mode": seed_mode,
        "advance_limit": meta.get("advance_limit", 0),
        "lane_count": meta["lane_count"],
        "existing": meta["existing"],
        "plan": [
            {
                "categoria": item["categoria"],
                "participants": item["participants"],
                "heats": item["heats"],
                "mixed": item["mixed"],
            }
            for item in plan_items
        ],
        "heats_preview": heats_preview,
    }


@router.post("/{competition_id}/heats/generate")
def generate_heats(
    competition_id: int,
    body: HeatGenerateInput,
    session: Session = Depends(get_session),
    user=Depends(require_staff),
):
    competition = require_competition_access(session, competition_id, user)
    phase, mode, plan_items, meta = _build_generation_plan(session, competition_id, body)
    lane_count = meta["lane_count"]
    existing_query = select(CompetitionHeat).where(
        CompetitionHeat.competition_id == competition_id,
        CompetitionHeat.phase_id == body.phase_id,
    )
    if mode == "single_category":
        existing_query = existing_query.where(
            CompetitionHeat.categoria == (_normalize_category_label(body.categoria) or None)
        )
    existing_heats = session.exec(existing_query).all()
    first_start = _normalize_dt(body.first_heat_start_at, competition.timezone) or _normalize_dt(phase.start_at, competition.timezone)
    duration = max(1, int(body.heat_duration_minutes or 15))
    gap = max(0, int(body.heat_gap_minutes or 0))
    heat_transition_seconds = _normalize_transition_seconds(body.heat_transition_seconds)
    category_transition_seconds = _normalize_transition_seconds(body.category_transition_seconds)
    if heat_transition_seconds == 0 and gap > 0:
        heat_transition_seconds = gap * 60
    location_name = (body.location_name or "").strip() or None
    proposed_ranges: list[dict] = []
    preview_start = first_start
    preview_previous_category: str | None = None
    preview_continuous_numbers = _uses_continuous_heat_numbers(body.heat_numbering_mode)
    preview_next_heat_number = 1
    for plan_item in plan_items:
        entries = plan_item["entries"]
        chunks = [entries[i:i + lane_count] for i in range(0, len(entries), lane_count)]
        if meta["seed_mode"] == "leaderboard":
            chunks = list(reversed(chunks))
        for heat_index, current_chunk in enumerate(chunks):
            if not current_chunk:
                continue
            display_number = preview_next_heat_number if preview_continuous_numbers else heat_index + 1
            if preview_continuous_numbers:
                preview_next_heat_number += 1
            current_category = str(plan_item["heat_categoria"] or "")
            start_at = preview_start
            if (
                start_at
                and preview_previous_category is not None
                and current_category != preview_previous_category
                and category_transition_seconds > heat_transition_seconds
            ):
                start_at = start_at + timedelta(seconds=category_transition_seconds - heat_transition_seconds)
            end_at = start_at + timedelta(minutes=duration) if start_at else None
            proposed = _proposed_heat_schedule_range(
                label=f"Heat {display_number}",
                location_name=location_name,
                start_at=start_at,
                end_at=end_at,
            )
            if proposed:
                proposed_ranges.append(proposed)
            if preview_start:
                preview_start = end_at + timedelta(seconds=heat_transition_seconds) if end_at else None
                preview_previous_category = current_category
    _raise_heat_location_conflict(_find_heat_location_conflicts(
        session,
        competition_id,
        proposed_ranges,
        ignore_heat_ids={int(heat.id) for heat in existing_heats if heat.id is not None},
    ))

    for heat in existing_heats:
        session.delete(heat)
    session.commit()

    lane_order = _build_lane_order(lane_count)
    seed_mode = meta["seed_mode"]
    phase.heat_duration_seconds = duration * 60
    phase.heat_transition_seconds = heat_transition_seconds
    phase.category_transition_seconds = category_transition_seconds
    if first_start:
        phase.start_at = first_start
    session.add(phase)

    created_ids: list[int] = []
    current_start = first_start
    previous_category: str | None = None
    continuous_numbers = _uses_continuous_heat_numbers(body.heat_numbering_mode)
    next_heat_number = 1
    for plan_item in plan_items:
        entries = plan_item["entries"]
        chunks = [entries[i:i + lane_count] for i in range(0, len(entries), lane_count)]
        if seed_mode == "leaderboard":
            chunks = list(reversed(chunks))
        for heat_index, current_chunk in enumerate(chunks):
            if not current_chunk:
                continue
            display_number = next_heat_number if continuous_numbers else heat_index + 1
            if continuous_numbers:
                next_heat_number += 1
            current_category = str(plan_item["heat_categoria"] or "")
            start_at = current_start
            if (
                start_at
                and previous_category is not None
                and current_category != previous_category
                and category_transition_seconds > heat_transition_seconds
            ):
                start_at = start_at + timedelta(seconds=category_transition_seconds - heat_transition_seconds)
            end_at = start_at + timedelta(minutes=duration) if start_at else None
            heat = CompetitionHeat(
                competition_id=competition_id,
                phase_id=body.phase_id,
                categoria=plan_item["heat_categoria"],
                nombre=f"Heat {display_number}",
                heat_number=display_number,
                lane_count=lane_count,
                heat_transition_seconds=heat_transition_seconds,
                category_transition_seconds=category_transition_seconds,
                start_at=start_at,
                end_at=end_at,
                location_name=location_name,
                location_detail=(body.location_detail or "").strip() or None,
                note=(body.note or "").strip() or None,
                is_published=1 if body.is_published else 0,
                published_at=datetime.now(timezone.utc) if body.is_published else None,
            )
            session.add(heat)
            session.commit()
            session.refresh(heat)
            created_ids.append(int(heat.id))
            assignments = []
            for seed_index, entry in enumerate(current_chunk):
                lane_number = lane_order[seed_index] if seed_index < len(lane_order) else seed_index + 1
                assignments.append(
                    HeatAssignmentInput(
                        user_id=int(entry["user_id"]) if entry.get("user_id") is not None else None,
                        team_id=int(entry["team_id"]) if entry.get("team_id") is not None else None,
                        lane_number=lane_number,
                        seed_order=seed_index + 1,
                    )
                )
            _replace_assignments(session, heat, assignments)
            session.commit()
            if current_start:
                current_start = end_at + timedelta(seconds=heat_transition_seconds) if end_at else None
                previous_category = current_category

    if created_ids:
        generated_heats = session.exec(
            select(CompetitionHeat).where(CompetitionHeat.id.in_(created_ids))
        ).all()
        phase.end_at = max(
            (heat.end_at for heat in generated_heats if heat.end_at),
            default=phase.end_at,
        )
        session.add(phase)
        session.commit()

    return {
        "ok": True,
        "phase_id": body.phase_id,
        "generation_mode": mode,
        "seed_mode": seed_mode,
        "advance_limit": meta.get("advance_limit", 0),
        "generated_heats": len(created_ids),
        "heat_ids": created_ids,
    }
