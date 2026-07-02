from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import bindparam, text
from sqlmodel import Session

from database import get_session
from models import Competition
from routers.leaderboard import _build_leaderboard_results_snapshot
from services.leaderboard_cache import get_leaderboard_results_snapshot, set_leaderboard_results_snapshot

router = APIRouter(prefix="/api/follows", tags=["follows"])


class FollowSummaryItem(BaseModel):
    competitionId: int
    athleteId: int
    competitionName: Optional[str] = None
    athleteName: Optional[str] = None
    username: Optional[str] = None
    category: Optional[str] = None
    avatarUrl: Optional[str] = None
    followedAt: Optional[str] = None


class FollowSummaryRequest(BaseModel):
    follows: list[FollowSummaryItem] = []


def _flatten_individual_rows(individual_data: dict | None) -> list[dict]:
    rows: list[dict] = []
    if not isinstance(individual_data, dict):
        return rows
    for value in individual_data.values():
        if isinstance(value, list):
            rows.extend([item for item in value if isinstance(item, dict)])
    return rows


def _leaderboard_for_competition(session: Session, competition_id: int) -> dict:
    cached = get_leaderboard_results_snapshot(competition_id)
    if isinstance(cached, dict):
        return cached
    payload = _build_leaderboard_results_snapshot(competition_id, session)
    set_leaderboard_results_snapshot(competition_id, payload)
    return payload


def _athlete_snapshot(leaderboard: dict, athlete_id: int) -> dict | None:
    total_row = next(
        (row for row in _flatten_individual_rows(leaderboard.get("individual")) if str(row.get("id")) == str(athlete_id)),
        None,
    )
    if not total_row:
        return None

    phase_results = []
    for phase in leaderboard.get("phases") or []:
        if not isinstance(phase, dict):
            continue
        row = next(
            (item for item in _flatten_individual_rows(phase.get("individual")) if str(item.get("id")) == str(athlete_id)),
            None,
        )
        if not row:
            continue
        phase_results.append({
            "phaseId": str(phase.get("id") or ""),
            "phaseName": phase.get("nombre") or "Workout",
            "rank": row.get("rank"),
            "points": int(row.get("total_puntos") or 0),
            "mark": row.get("mejor_marca"),
            "extra": row.get("extra"),
        })

    return {
        "athleteId": str(total_row.get("id")),
        "athleteName": " ".join([str(total_row.get("nombre") or ""), str(total_row.get("apellido") or "")]).strip() or "Atleta",
        "username": total_row.get("username") or "",
        "category": total_row.get("categoria") or "",
        "avatarUrl": total_row.get("profile_photo_url") or "",
        "rank": total_row.get("rank"),
        "totalPoints": int(total_row.get("total_puntos") or 0),
        "resultsCount": len([item for item in phase_results if item.get("mark") is not None or int(item.get("points") or 0) > 0]),
        "phaseResults": phase_results,
    }


def _next_heats_by_athlete(session: Session, competition_id: int, athlete_ids: list[int]) -> dict[int, dict]:
    if not athlete_ids:
        return {}
    query = text(
            """
            SELECT
                cha.user_id,
                cha.lane_number,
                ch.nombre AS heat_label,
                ch.heat_number,
                ch.start_at,
                ch.location_name,
                ch.location_detail,
                cp.nombre AS phase_name
            FROM competition_heat_assignments cha
            JOIN competition_heats ch ON ch.id = cha.heat_id
            JOIN competition_phases cp ON cp.id = ch.phase_id
            WHERE ch.competition_id = :cid
              AND ch.is_published = 1
              AND COALESCE(cp.is_visible, 1) = 1
              AND cha.user_id IN :athlete_ids
            ORDER BY ch.start_at NULLS LAST, ch.phase_id, ch.heat_number, ch.id, cha.lane_number
            """
        ).bindparams(bindparam("athlete_ids", expanding=True))
    rows = session.execute(
        query,
        {"cid": competition_id, "athlete_ids": athlete_ids},
    ).mappings().all()

    now = datetime.now(timezone.utc)
    out: dict[int, dict] = {}
    for row in rows:
        user_id = int(row["user_id"])
        start_at = row["start_at"]
        if start_at is not None and start_at.tzinfo is None:
            start_at = start_at.replace(tzinfo=timezone.utc)
        if start_at is not None and start_at < now:
            continue
        if user_id in out:
            continue
        out[user_id] = {
            "phaseName": row["phase_name"] or "Workout",
            "heatLabel": row["heat_label"] or f"Heat {row['heat_number'] or ''}".strip(),
            "startAt": start_at.isoformat() if start_at else "",
            "lane": int(row["lane_number"] or 0) or "",
            "location": " · ".join([value for value in [row["location_name"], row["location_detail"]] if value]),
        }
    return out


@router.post("/summary")
def get_follow_summary(body: FollowSummaryRequest, session: Session = Depends(get_session)):
    unique: dict[tuple[int, int], FollowSummaryItem] = {}
    for item in body.follows[:80]:
        if item.competitionId and item.athleteId:
            unique[(int(item.competitionId), int(item.athleteId))] = item

    grouped: dict[int, list[FollowSummaryItem]] = {}
    for (competition_id, _athlete_id), item in unique.items():
        grouped.setdefault(competition_id, []).append(item)

    summaries = []
    for competition_id, follows in grouped.items():
        competition = session.get(Competition, competition_id)
        if not competition or not int(getattr(competition, "activa", 0) or 0):
            continue
        leaderboard = _leaderboard_for_competition(session, competition_id)
        heat_map = _next_heats_by_athlete(session, competition_id, [int(item.athleteId) for item in follows])

        for follow in follows:
            athlete_id = int(follow.athleteId)
            snapshot = _athlete_snapshot(leaderboard, athlete_id)
            summaries.append({
                "key": f"{competition_id}:{athlete_id}",
                "competitionId": str(competition_id),
                "competitionName": competition.nombre or follow.competitionName or "Competencia",
                "athleteId": str(athlete_id),
                "athleteName": (snapshot or {}).get("athleteName") or follow.athleteName or "Atleta",
                "username": (snapshot or {}).get("username") or follow.username or "",
                "category": (snapshot or {}).get("category") or follow.category or "",
                "avatarUrl": (snapshot or {}).get("avatarUrl") or follow.avatarUrl or "",
                "followedAt": follow.followedAt,
                "snapshot": snapshot,
                "nextHeat": heat_map.get(athlete_id),
            })

    return {"items": summaries}
