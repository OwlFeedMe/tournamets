from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import text
from sqlmodel import Session, select

from access import require_competition_access
from auth import get_current_user_optional, get_effective_participant_id, is_end_user, require_auth, require_staff
from database import get_session
from models import (
    Competition,
    CompetitionHeat,
    CompetitionHeatAssignment,
    CompetitionParticipant,
    CompetitionPhase,
    Participant,
    Result,
    Team,
)

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
    participant_id: Optional[int] = None
    team_id: Optional[int] = None
    lane_number: int = 1
    seed_order: int = 0


class HeatInput(BaseModel):
    phase_id: int
    categoria: Optional[str] = None
    nombre: str
    heat_number: int = 1
    lane_count: int = 0
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
    lane_count: int = 8
    heat_count: Optional[int] = None
    location_name: Optional[str] = None
    location_detail: Optional[str] = None
    note: Optional[str] = None
    is_published: int = 0
    first_heat_start_at: Optional[datetime] = None
    heat_duration_minutes: int = 15
    heat_gap_minutes: int = 5
    delete_existing: int = 1


def _normalize_dt(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    if value.tzinfo is not None:
        return value.astimezone(timezone.utc)
    return value.replace(tzinfo=timezone.utc)


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


def _phase_seed_mode(session: Session, competition_id: int, phase: CompetitionPhase) -> str:
    phases = session.exec(
        select(CompetitionPhase)
        .where(CompetitionPhase.competition_id == competition_id, CompetitionPhase.modality == phase.modality)
    ).all()
    ordered = sorted(phases, key=_phase_sort_key)
    if not ordered or int(ordered[0].id or 0) == int(phase.id or 0):
        return "registration"
    return "leaderboard"


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
            Result.participant_id.is_not(None),
            Result.phase_id.in_(previous_ids),
        )
    ).all()
    if not result_rows:
        return {}
    participant_ids = {int(row.participant_id) for row in result_rows if row.participant_id is not None}
    participant_map = {
        int(item.id): item
        for item in session.exec(select(Participant).where(Participant.id.in_(participant_ids))).all()
        if item.id is not None
    }
    competition_participant_map = {
        int(item.participant_id): item
        for item in session.exec(
            select(CompetitionParticipant).where(
                CompetitionParticipant.competition_id == competition_id,
                CompetitionParticipant.participant_id.in_(participant_ids),
            )
        ).all()
    }
    out: dict[int, dict] = {}
    target_category = (categoria or "").strip().lower()
    for row in result_rows:
        pid = int(row.participant_id)
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
            JOIN participants p ON p.id = cp.participant_id
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
                "participant_id": int(row["id"]),
                "name": f"{row['nombre']} {row['apellido']}".strip(),
                "categoria": row_category,
                "inscrito_at": row["inscrito_at"],
            }
        )
    return items


def _seed_entries_for_phase(session: Session, competition_id: int, phase: CompetitionPhase, categoria: str | None) -> list[dict]:
    items = _eligible_participants(session, competition_id, categoria)
    seed_mode = _phase_seed_mode(session, competition_id, phase)
    if seed_mode == "registration":
        return items

    seed_map = _leaderboard_seed_map(session, competition_id, phase, categoria)
    return sorted(
        items,
        key=lambda item: (
            0 if item["participant_id"] in seed_map else 1,
            -(seed_map.get(item["participant_id"], {}).get("total_points", -999999)),
            seed_map.get(item["participant_id"], {}).get("best_position", 999999),
            seed_map.get(item["participant_id"], {}).get("enrolled_at") or item["inscrito_at"] or datetime.max.replace(tzinfo=timezone.utc),
            item["participant_id"],
        ),
    )


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
        "heat_label": heat.nombre,
        "heat_number": int(heat.heat_number or 0),
        "lane_count": int(heat.lane_count or 0),
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
    participant_id: int | None = None,
) -> dict:
    phases = session.exec(
        select(CompetitionPhase)
        .where(CompetitionPhase.competition_id == competition.id)
        .order_by(CompetitionPhase.block_order, CompetitionPhase.orden, CompetitionPhase.id)
    ).all()
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
    heats = session.exec(query.order_by(CompetitionHeat.phase_id, CompetitionHeat.heat_number, CompetitionHeat.id)).all()
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
        participant_ids = {int(item.participant_id) for item in assignment_rows if item.participant_id is not None}
        team_ids = {int(item.team_id) for item in assignment_rows if item.team_id is not None}
        participant_map = {
            int(item.id): item
            for item in session.exec(select(Participant).where(Participant.id.in_(participant_ids))).all()
            if item.id is not None
        } if participant_ids else {}
        competition_participant_map = {
            int(item.participant_id): item
            for item in session.exec(
                select(CompetitionParticipant).where(
                    CompetitionParticipant.competition_id == int(competition.id),
                    CompetitionParticipant.participant_id.in_(participant_ids),
                )
            ).all()
        } if participant_ids else {}
        team_map = {
            int(item.id): item
            for item in session.exec(select(Team).where(Team.id.in_(team_ids))).all()
            if item.id is not None
        } if team_ids else {}
        for row in assignment_rows:
            pid = row.participant_id
            if participant_id is not None and int(pid or 0) != int(participant_id):
                continue
            heat_id = int(row.heat_id)
            participant = participant_map.get(int(pid)) if pid is not None else None
            competition_row = competition_participant_map.get(int(pid)) if pid is not None else None
            team = team_map.get(int(row.team_id)) if row.team_id is not None else None
            assignments_by_heat.setdefault(heat_id, []).append(
                {
                    "id": int(row.id),
                    "participant_id": int(pid) if pid is not None else None,
                    "team_id": int(row.team_id) if row.team_id is not None else None,
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
        if participant_id is not None and not current_assignments:
            continue
        items.append(_serialize_heat_payload(heat, phase_name_map.get(int(heat.phase_id), "Fase"), current_assignments))

    updated_at = None
    if heats:
        timestamps = [heat.updated_at or heat.created_at for heat in heats if heat.updated_at or heat.created_at]
        if timestamps:
            updated_at = max(timestamps)

    return {
        "scope": "personal" if participant_id is not None else "public",
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

    for idx, entry in enumerate(assignments):
        if entry.participant_id is None and entry.team_id is None:
            continue
        session.add(
            CompetitionHeatAssignment(
                heat_id=int(heat.id),
                participant_id=entry.participant_id,
                team_id=entry.team_id,
                lane_number=max(1, int(entry.lane_number or 1)),
                seed_order=int(entry.seed_order if entry.seed_order else idx + 1),
            )
        )


def _validate_heat_input(session: Session, competition_id: int, payload: HeatInput) -> CompetitionPhase:
    phase = session.get(CompetitionPhase, payload.phase_id)
    if not phase or int(phase.competition_id) != int(competition_id):
        raise HTTPException(400, "La fase no pertenece a esta competencia")
    if payload.end_at and payload.start_at and payload.start_at > payload.end_at:
        raise HTTPException(400, "La hora de inicio no puede ser mayor a la hora final")
    return phase


@router.get("/{competition_id}/schedule")
def get_public_schedule(
    competition_id: int,
    session: Session = Depends(get_session),
    user=Depends(get_current_user_optional),
):
    competition = require_competition_access(session, competition_id, user)
    return _schedule_payload(session, competition, published_only=True)


@router.get("/{competition_id}/my-schedule")
def get_my_schedule(
    competition_id: int,
    session: Session = Depends(get_session),
    user=Depends(require_auth),
):
    competition = require_competition_access(session, competition_id, user)
    participant_id = get_effective_participant_id(user)
    if not is_end_user(user) or participant_id is None:
        raise HTTPException(403, "Solo participantes autenticados pueden ver su cronograma")
    enrollment = session.get(CompetitionParticipant, (competition_id, participant_id))
    if not enrollment or str(enrollment.estado or "").strip().lower() != "confirmado":
        raise HTTPException(403, "Tu inscripcion aun no esta confirmada para esta competencia")
    return _schedule_payload(session, competition, published_only=True, participant_id=participant_id)


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
    _validate_heat_input(session, competition_id, body)
    require_competition_access(session, competition_id, user)
    heat = CompetitionHeat(
        competition_id=competition_id,
        phase_id=body.phase_id,
        categoria=(body.categoria or "").strip() or None,
        nombre=body.nombre.strip(),
        heat_number=max(1, int(body.heat_number or 1)),
        lane_count=max(0, int(body.lane_count or 0)),
        start_at=_normalize_dt(body.start_at),
        end_at=_normalize_dt(body.end_at),
        location_name=(body.location_name or "").strip() or None,
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


@router.put("/{competition_id}/heats/{heat_id}")
def update_heat(
    competition_id: int,
    heat_id: int,
    body: HeatInput,
    session: Session = Depends(get_session),
    user=Depends(require_staff),
):
    _validate_heat_input(session, competition_id, body)
    require_competition_access(session, competition_id, user)
    heat = session.get(CompetitionHeat, heat_id)
    if not heat or int(heat.competition_id) != int(competition_id):
        raise HTTPException(404, "Heat no encontrado")
    was_published = int(heat.is_published or 0) == 1
    heat.phase_id = body.phase_id
    heat.categoria = (body.categoria or "").strip() or None
    heat.nombre = body.nombre.strip()
    heat.heat_number = max(1, int(body.heat_number or 1))
    heat.lane_count = max(0, int(body.lane_count or 0))
    heat.start_at = _normalize_dt(body.start_at)
    heat.end_at = _normalize_dt(body.end_at)
    heat.location_name = (body.location_name or "").strip() or None
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
    session.delete(heat)
    session.commit()


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


@router.post("/{competition_id}/heats/generate")
def generate_heats(
    competition_id: int,
    body: HeatGenerateInput,
    session: Session = Depends(get_session),
    user=Depends(require_staff),
):
    require_competition_access(session, competition_id, user)
    phase = session.get(CompetitionPhase, body.phase_id)
    if not phase or int(phase.competition_id) != int(competition_id):
        raise HTTPException(400, "La fase no pertenece a esta competencia")
    lane_count = max(1, int(body.lane_count or 1))
    entries = _seed_entries_for_phase(session, competition_id, phase, body.categoria)
    if not entries:
        raise HTTPException(400, "No hay participantes confirmados para generar heats")
    heat_count = max(1, int(body.heat_count or 0)) if body.heat_count else 0
    if heat_count <= 0:
        heat_count = (len(entries) + lane_count - 1) // lane_count
    if body.delete_existing:
        existing_heats = session.exec(
            select(CompetitionHeat).where(
                CompetitionHeat.competition_id == competition_id,
                CompetitionHeat.phase_id == body.phase_id,
                CompetitionHeat.categoria == ((body.categoria or "").strip() or None),
            )
        ).all()
        for heat in existing_heats:
            session.delete(heat)
        session.commit()

    first_start = _normalize_dt(body.first_heat_start_at) or _normalize_dt(phase.start_at)
    duration = max(1, int(body.heat_duration_minutes or 15))
    gap = max(0, int(body.heat_gap_minutes or 0))
    lane_order = _build_lane_order(lane_count)
    seed_mode = _phase_seed_mode(session, competition_id, phase)

    created_ids: list[int] = []
    for heat_index in range(heat_count):
        if seed_mode == "leaderboard":
            ordered_chunks = list(reversed([entries[i:i + lane_count] for i in range(0, len(entries), lane_count)]))
            current_chunk = ordered_chunks[heat_index] if heat_index < len(ordered_chunks) else []
            display_number = heat_count - heat_index
        else:
            current_chunk = entries[heat_index * lane_count:(heat_index + 1) * lane_count]
            display_number = heat_index + 1
        if not current_chunk:
            continue
        start_at = first_start + timedelta(minutes=((display_number - 1) * (duration + gap))) if first_start else None
        end_at = start_at + timedelta(minutes=duration) if start_at else None
        heat = CompetitionHeat(
            competition_id=competition_id,
            phase_id=body.phase_id,
            categoria=(body.categoria or "").strip() or None,
            nombre=f"{phase.nombre} · Heat {display_number}",
            heat_number=display_number,
            lane_count=lane_count,
            start_at=start_at,
            end_at=end_at,
            location_name=(body.location_name or "").strip() or None,
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
                    participant_id=int(entry["participant_id"]),
                    lane_number=lane_number,
                    seed_order=seed_index + 1,
                )
            )
        _replace_assignments(session, heat, assignments)
        session.commit()

    return {
        "ok": True,
        "phase_id": body.phase_id,
        "seed_mode": seed_mode,
        "generated_heats": len(created_ids),
        "heat_ids": created_ids,
    }
