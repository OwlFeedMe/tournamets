from collections import defaultdict
import json

from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlmodel import Session, select

from competition_rules import normalize_phase_measurement_method, type_from_measurement_method
from database import get_session
from models import Competition, CompetitionCategory, CompetitionPhase, Team
from phase_status import compute_phase_status_map
from services.leaderboard_cache import (
    get_leaderboard_results_snapshot,
    set_leaderboard_results_snapshot,
)
from services.scoring import (
    competition_total_lower_is_better,
    normalize_scoring_scope,
    normalize_scoring_tiebreak,
    phase_scoring_config,
)

router = APIRouter(prefix="/api/leaderboard", tags=["leaderboard"])


def _parse_phase_activities(raw: str | None) -> list[dict]:
    if not raw:
        return []
    try:
        parsed = json.loads(raw)
    except Exception:
        return []
    if not isinstance(parsed, list):
        return []
    normalized = []
    for item in parsed:
        if not isinstance(item, dict):
            continue
        measurement_method = normalize_phase_measurement_method(item.get("measurement_method"), item.get("tipo"))
        normalized.append({
            **item,
            "measurement_method": measurement_method,
            "tipo": type_from_measurement_method(measurement_method),
        })
    return normalized


def _phase_lower_is_better(phase: CompetitionPhase | None) -> bool:
    if not phase:
        return False
    winner_rule = (getattr(phase, "winner_rule", "") or "").strip().lower()
    if winner_rule in {"higher_wins", "lower_wins"}:
        return winner_rule == "lower_wins"
    phase_type = (getattr(phase, "tipo", "") or "").strip().lower()
    return phase_type in {"tiempo", "posicion"}


def _rank_by_category(rows, *, lower_is_better: bool = False, tiebreak: str = "best_positions") -> dict:
    by_cat: dict[str, list] = defaultdict(list)
    for row in rows:
        entry = dict(row)
        by_cat[entry.get("categoria") or "Sin categoria"].append(entry)

    result: dict[str, list] = {}
    for cat, members in by_cat.items():
        sorted_m = _sort_total_rows(members, lower_is_better=lower_is_better, tiebreak=tiebreak)
        for rank, p in enumerate(sorted_m, 1):
            p["rank"] = rank
        result[cat] = sorted_m
    return result


def _position_count_tiebreak_key(row: dict, max_position: int) -> tuple[int, ...]:
    positions = [
        int(value)
        for value in (row.get("total_position_tiebreak") or [])
        if value is not None and int(value) > 0
    ]
    counts: dict[int, int] = defaultdict(int)
    for position in positions:
        counts[position] += 1
    return tuple(-counts.get(position, 0) for position in range(1, max_position + 1))


def _sort_total_rows(rows: list[dict], *, lower_is_better: bool = False, tiebreak: str = "best_positions") -> list[dict]:
    max_position = 0
    for row in rows:
        for value in row.get("total_position_tiebreak") or []:
            if value is not None:
                max_position = max(max_position, int(value))
    max_position = max(max_position, 1)

    def key(row: dict) -> tuple:
        total_points = int(row.get("total_puntos") or 0)
        point_key = total_points if lower_is_better else -total_points
        positions = [
            int(value)
            for value in (row.get("total_position_tiebreak") or [])
            if value is not None and int(value) > 0
        ]
        final_position = positions[-1] if positions else 999999
        if tiebreak == "first_places":
            tie_key = (-positions.count(1), _position_count_tiebreak_key(row, max_position))
        elif tiebreak == "final_workout":
            tie_key = (final_position, _position_count_tiebreak_key(row, max_position))
        else:
            tie_key = (_position_count_tiebreak_key(row, max_position),)
        return (
            1 if (row.get("total_eventos") or 0) == 0 else 0,
            point_key,
            tie_key,
            int(row.get("id") or 0),
        )

    return sorted(rows, key=key)


def _competition_has_categories(session: Session, competition_id: int) -> bool:
    row = session.execute(text("""
        SELECT 1
        FROM competition_participants
        WHERE competition_id = :cid
          AND COALESCE(TRIM(categoria), '') <> ''
        LIMIT 1
    """), {"cid": competition_id}).first()
    return row is not None


def _fetch_participants_meta(session: Session, competition_id: int) -> list[dict]:
    rows = session.execute(text("""
        SELECT
            p.id,
            p.nombre,
            p.apellido,
            p.username,
            p.profile_photo_url,
            p.ciudad_pais,
            p.box,
            cp.categoria,
            COALESCE(p.genero, p.sexo) AS sexo
        FROM participants p
        JOIN competition_participants cp
          ON cp.user_id = p.id
         AND cp.competition_id = :cid
         AND cp.estado = 'confirmado'
    """), {"cid": competition_id}).mappings().all()
    return [
        {
            "id": int(r["id"]),
            "nombre": r["nombre"],
            "apellido": r["apellido"],
            "username": r["username"],
            "profile_photo_url": r["profile_photo_url"],
            "ciudad_pais": r["ciudad_pais"],
            "box": r["box"],
            "categoria": r["categoria"],
            "sexo": r["sexo"],
        }
        for r in rows
    ]


def _fetch_ind_points_per_phase(session: Session, competition_id: int) -> dict:
    """dict[(phase_id, user_id)] = {sum, count, min, max, min_extra, max_extra, min_tiebreak, max_tiebreak}."""
    rows = session.execute(text("""
        SELECT
            r.phase_id,
            r.user_id,
            COALESCE(SUM(r.puntos), 0)::int AS sum_pts,
            COUNT(r.id)::int                AS cnt,
            MIN(r.marca)                    AS min_mark,
            MAX(r.marca)                    AS max_mark,
            MIN(r.extra)                    AS min_extra,
            MAX(r.extra)                    AS max_extra,
            MIN(r.tiebreak)                 AS min_tiebreak,
            MAX(r.tiebreak)                 AS max_tiebreak,
            MIN(r.posicion)                 AS best_position,
            (COUNT(ra.id) > 0)            AS has_active_appeal
        FROM results r
        LEFT JOIN result_appeals ra
          ON ra.result_id = r.id
         AND ra.status IN ('submitted', 'under_review', 'needs_evidence', 'escalated')
        WHERE r.competition_id = :cid
          AND r.team_id IS NULL
          AND r.user_id IS NOT NULL
        GROUP BY r.phase_id, r.user_id
    """), {"cid": competition_id}).mappings().all()
    return {
        (r["phase_id"], int(r["user_id"])): {
            "sum": int(r["sum_pts"] or 0),
            "count": int(r["cnt"] or 0),
            "min": int(r["min_mark"]) if r["min_mark"] is not None else None,
            "max": int(r["max_mark"]) if r["max_mark"] is not None else None,
            "min_extra": int(r["min_extra"]) if r["min_extra"] is not None else None,
            "max_extra": int(r["max_extra"]) if r["max_extra"] is not None else None,
            "min_tiebreak": int(r["min_tiebreak"]) if r["min_tiebreak"] is not None else None,
            "max_tiebreak": int(r["max_tiebreak"]) if r["max_tiebreak"] is not None else None,
            "best_position": int(r["best_position"]) if r["best_position"] is not None else None,
            "has_active_appeal": bool(r["has_active_appeal"]),
        }
        for r in rows
    }


def _phase_tiebreak_lower_is_better(phase: CompetitionPhase | None) -> bool:
    method = (getattr(phase, "tie_break_method", None) or "for_time").strip().lower() if phase else "for_time"
    return method in {"for_time", "tiempo_hms", "tiempo", "posicion"}


def _fetch_team_member_points_per_phase(session: Session, competition_id: int) -> dict:
    """dict[(phase_id, team_id, user_id)] = {sum, count, min, max}. Results tagged to both team and participant."""
    rows = session.execute(text("""
        SELECT
            r.phase_id,
            r.team_id,
            r.user_id,
            COALESCE(SUM(r.puntos), 0)::int AS sum_pts,
            COUNT(r.id)::int                AS cnt,
            MIN(r.marca)                    AS min_mark,
            MAX(r.marca)                    AS max_mark,
            MIN(r.extra)                    AS min_extra,
            MAX(r.extra)                    AS max_extra,
            MIN(r.posicion)                 AS best_position,
            (COUNT(ra.id) > 0)              AS has_active_appeal
        FROM results r
        JOIN teams t ON t.id = r.team_id
        LEFT JOIN result_appeals ra
          ON ra.result_id = r.id
         AND ra.status IN ('submitted', 'under_review', 'needs_evidence', 'escalated')
        WHERE r.competition_id = :cid
          AND t.competition_id = :cid
          AND r.team_id IS NOT NULL
          AND r.user_id IS NOT NULL
        GROUP BY r.phase_id, r.team_id, r.user_id
    """), {"cid": competition_id}).mappings().all()
    return {
        (r["phase_id"], int(r["team_id"]), int(r["user_id"])): {
            "sum": int(r["sum_pts"] or 0),
            "count": int(r["cnt"] or 0),
            "min": int(r["min_mark"]) if r["min_mark"] is not None else None,
            "max": int(r["max_mark"]) if r["max_mark"] is not None else None,
            "min_extra": int(r["min_extra"]) if r["min_extra"] is not None else None,
            "max_extra": int(r["max_extra"]) if r["max_extra"] is not None else None,
            "best_position": int(r["best_position"]) if r["best_position"] is not None else None,
            "has_active_appeal": bool(r["has_active_appeal"]),
        }
        for r in rows
    }


def _fetch_team_direct_points_per_phase(session: Session, competition_id: int) -> dict:
    """dict[(phase_id, team_id)] = {sum, count, min, max}. Team-only results (no participant)."""
    rows = session.execute(text("""
        SELECT
            r.phase_id,
            r.team_id,
            COALESCE(SUM(r.puntos), 0)::int AS sum_pts,
            COUNT(r.id)::int                AS cnt,
            MIN(r.marca)                    AS min_mark,
            MAX(r.marca)                    AS max_mark,
            MIN(r.posicion)                 AS best_position,
            (COUNT(ra.id) > 0)              AS has_active_appeal
        FROM results r
        LEFT JOIN result_appeals ra
          ON ra.result_id = r.id
         AND ra.status IN ('submitted', 'under_review', 'needs_evidence', 'escalated')
        WHERE r.competition_id = :cid
          AND r.team_id IS NOT NULL
          AND r.user_id IS NULL
        GROUP BY r.phase_id, r.team_id
    """), {"cid": competition_id}).mappings().all()
    return {
        (r["phase_id"], int(r["team_id"])): {
            "sum": int(r["sum_pts"] or 0),
            "count": int(r["cnt"] or 0),
            "min": int(r["min_mark"]) if r["min_mark"] is not None else None,
            "max": int(r["max_mark"]) if r["max_mark"] is not None else None,
            "best_position": int(r["best_position"]) if r["best_position"] is not None else None,
            "has_active_appeal": bool(r["has_active_appeal"]),
        }
        for r in rows
    }


def _fetch_team_members(session: Session, competition_id: int) -> dict[int, list[dict]]:
    rows = session.execute(text("""
        SELECT
            tm.team_id,
            p.id AS user_id,
            p.nombre,
            p.apellido,
            p.username,
            p.profile_photo_url,
            p.ciudad_pais,
            p.box,
            cp.categoria,
            COALESCE(p.genero, p.sexo) AS sexo
        FROM team_members tm
        JOIN teams t ON t.id = tm.team_id
        JOIN participants p ON p.id = tm.user_id
        LEFT JOIN competition_participants cp
            ON cp.user_id = p.id AND cp.competition_id = :cid
        WHERE t.competition_id = :cid
        ORDER BY p.apellido, p.nombre
    """), {"cid": competition_id}).mappings().all()
    out: dict[int, list[dict]] = defaultdict(list)
    for r in rows:
        out[int(r["team_id"])].append({
            "id": int(r["user_id"]),
            "nombre": r["nombre"],
            "apellido": r["apellido"],
            "username": r["username"],
            "profile_photo_url": r["profile_photo_url"],
            "ciudad_pais": r["ciudad_pais"],
            "box": r["box"],
            "categoria": r["categoria"],
            "sexo": r["sexo"],
        })
    return out


def _fetch_categories_map(session: Session, competition_id: int) -> dict[int, CompetitionCategory]:
    rows = session.exec(
        select(CompetitionCategory).where(CompetitionCategory.competition_id == competition_id)
    ).all()
    return {int(c.id): c for c in rows}


def _combine_mark(a: int | None, b: int | None, lower_is_better: bool) -> int | None:
    if a is None:
        return b
    if b is None:
        return a
    return min(a, b) if lower_is_better else max(a, b)


def _build_ind_rows(
    participants_meta: list[dict],
    ind_points_per_phase: dict,
    ind_totals_by_pid: dict,
    phase_id: int | None,
    lower_is_better: bool,
    tiebreak_lower_is_better: bool = True,
    tiebreak_enabled: bool = False,
) -> list[dict]:
    rows: list[dict] = []
    if phase_id is None:
        for p in participants_meta:
            agg = ind_totals_by_pid.get(p["id"]) or {"sum": 0, "count": 0, "has_active_appeal": False}
            rows.append({
                "id": p["id"],
                "nombre": p["nombre"],
                "apellido": p["apellido"],
                "username": p.get("username"),
                "profile_photo_url": p.get("profile_photo_url"),
                "ciudad_pais": p.get("ciudad_pais"),
                "box": p.get("box"),
                "categoria": p["categoria"],
                "sexo": p["sexo"],
                "total_puntos": int(agg["sum"]),
                "total_eventos": int(agg["count"]),
                "total_position_tiebreak": list(agg.get("positions") or []),
                "mejor_marca": None,
                "has_active_appeal": bool(agg.get("has_active_appeal")),
            })
    else:
        for p in participants_meta:
            data = ind_points_per_phase.get((phase_id, p["id"]))
            if data:
                mark = data["min"] if lower_is_better else data["max"]
                extra = data["min_extra"]
                tiebreak = (data["min_tiebreak"] if tiebreak_lower_is_better else data["max_tiebreak"]) if tiebreak_enabled else None
                total = int(data["sum"])
                events = int(data["count"])
                has_active_appeal = bool(data.get("has_active_appeal"))
            else:
                mark = None
                extra = None
                tiebreak = None
                total = 0
                events = 0
                has_active_appeal = False
            rows.append({
                "id": p["id"],
                "nombre": p["nombre"],
                "apellido": p["apellido"],
                "username": p.get("username"),
                "profile_photo_url": p.get("profile_photo_url"),
                "ciudad_pais": p.get("ciudad_pais"),
                "box": p.get("box"),
                "categoria": p["categoria"],
                "sexo": p["sexo"],
                "total_puntos": total,
                "total_eventos": events,
                "mejor_marca": mark,
                "extra": extra,
                "tiebreak": tiebreak,
                "has_active_appeal": has_active_appeal,
            })
    return rows


def _team_members_for_phase(
    team_id: int,
    phase_id: int,
    team_members_by_team: dict[int, list[dict]],
    ind_points_per_phase: dict,
    team_member_points_per_phase: dict,
    lower_is_better: bool,
) -> list[dict]:
    out: list[dict] = []
    for member in team_members_by_team.get(team_id, []):
        pid = member["id"]
        ind_data = ind_points_per_phase.get((phase_id, pid))
        tm_data = team_member_points_per_phase.get((phase_id, team_id, pid))
        sum_pts = (ind_data["sum"] if ind_data else 0) + (tm_data["sum"] if tm_data else 0)
        cnt = (ind_data["count"] if ind_data else 0) + (tm_data["count"] if tm_data else 0)
        has_active_appeal = bool((ind_data or {}).get("has_active_appeal") or (tm_data or {}).get("has_active_appeal"))
        ind_mark = (ind_data["min"] if lower_is_better else ind_data["max"]) if ind_data else None
        tm_mark = (tm_data["min"] if lower_is_better else tm_data["max"]) if tm_data else None
        ind_extra = (ind_data["min_extra"] if lower_is_better else ind_data["max_extra"]) if ind_data else None
        tm_extra = (tm_data["min_extra"] if lower_is_better else tm_data["max_extra"]) if tm_data else None
        mark = _combine_mark(ind_mark, tm_mark, lower_is_better)
        extra = ind_extra if mark == ind_mark else tm_extra if mark == tm_mark else None
        out.append({
            "id": pid,
            "nombre": member["nombre"],
            "apellido": member["apellido"],
            "username": member.get("username"),
            "profile_photo_url": member.get("profile_photo_url"),
            "ciudad_pais": member.get("ciudad_pais"),
            "box": member.get("box"),
            "categoria": member["categoria"],
            "sexo": member["sexo"],
            "puntos_propios": int(sum_pts),
            "intentos": int(cnt),
            "mejor_marca": mark,
            "extra": extra,
            "has_active_appeal": has_active_appeal,
        })
    return out


def _team_global_members(
    team_id: int,
    team_members_by_team: dict[int, list[dict]],
    ind_totals_by_pid: dict,
    team_member_totals_by_team_pid: dict,
) -> list[dict]:
    out: list[dict] = []
    for member in team_members_by_team.get(team_id, []):
        pid = member["id"]
        ind_agg = ind_totals_by_pid.get(pid) or {"sum": 0, "count": 0, "has_active_appeal": False}
        tm_agg = team_member_totals_by_team_pid.get((team_id, pid)) or {"sum": 0, "count": 0, "has_active_appeal": False}
        out.append({
            "id": pid,
            "nombre": member["nombre"],
            "apellido": member["apellido"],
            "username": member.get("username"),
            "profile_photo_url": member.get("profile_photo_url"),
            "ciudad_pais": member.get("ciudad_pais"),
            "box": member.get("box"),
            "categoria": member["categoria"],
            "sexo": member["sexo"],
            "puntos_propios": int(ind_agg["sum"] + tm_agg["sum"]),
            "intentos": int(ind_agg["count"] + tm_agg["count"]),
            "mejor_marca": None,
            "has_active_appeal": bool(ind_agg.get("has_active_appeal") or tm_agg.get("has_active_appeal")),
        })
    return out


def _team_points_for_phase(members: list[dict], mode: str) -> int:
    vals = [int(m.get("puntos_propios") or 0) for m in members]
    if not vals:
        return 0
    if mode == "single_member":
        return max(vals)
    if mode == "total":
        return 0
    # In sum_two mode the phase ranking is by team; members may share the same team score.
    # Use the team score once instead of double-counting by number of members.
    return max(vals)


def _team_mark_for_phase(members: list[dict], mode: str, lower_is_better: bool) -> int | None:
    vals = [int(m["mejor_marca"]) for m in members if m.get("mejor_marca") is not None]
    if not vals:
        return None
    if mode == "single_member":
        return min(vals) if lower_is_better else max(vals)
    if mode == "total":
        return None
    return sum(vals)


def _resolve_team_category(
    team: Team,
    members: list[dict],
    competition_id: int,
    categories_map: dict[int, CompetitionCategory],
) -> str:
    category_id = getattr(team, "team_category_id", None)
    explicit = categories_map.get(int(category_id)) if category_id else None
    member_cats = sorted({(m.get("categoria") or "").strip() for m in members if (m.get("categoria") or "").strip()})
    if explicit and explicit.competition_id == competition_id:
        return (explicit.nombre or "").strip() or "Sin categoria"
    if len(member_cats) == 1:
        return member_cats[0]
    if len(member_cats) == 0:
        return "Sin categoria"
    return "Mixta"


def _build_team_rows_for_phase(
    teams: list[Team],
    competition_id: int,
    phase_id: int,
    mode: str,
    mark_lower_is_better: bool,
    points_lower_is_better: bool,
    team_members_by_team: dict[int, list[dict]],
    ind_points_per_phase: dict,
    team_member_points_per_phase: dict,
    team_direct_per_phase: dict,
    categories_map: dict[int, CompetitionCategory],
    rank_by_category: bool = False,
) -> list[dict]:
    rows: list[dict] = []
    for t in teams:
        members = _team_members_for_phase(
            int(t.id),
            phase_id,
            team_members_by_team,
            ind_points_per_phase,
            team_member_points_per_phase,
            mark_lower_is_better,
        )
        team_category = _resolve_team_category(t, members, competition_id, categories_map)
        total_eventos = sum(int(m.get("intentos") or 0) for m in members)
        total_puntos = _team_points_for_phase(members, mode)
        total_marca = _team_mark_for_phase(members, mode, mark_lower_is_better)
        direct = team_direct_per_phase.get((phase_id, int(t.id)))
        direct_points = int(direct["sum"]) if direct else 0
        direct_events = int(direct["count"]) if direct else 0
        if direct:
            direct_mark = direct["min"] if mark_lower_is_better else direct["max"]
            direct_extra = direct["min_extra"] if mark_lower_is_better else direct["max_extra"]
        else:
            direct_mark = None
            direct_extra = None
        has_active_appeal = bool((direct or {}).get("has_active_appeal") or any(m.get("has_active_appeal") for m in members))
        if mode == "total":
            total_puntos = direct_points
            total_eventos = direct_events
            total_marca = direct_mark
            total_extra = direct_extra
        else:
            total_puntos += direct_points
            total_eventos += direct_events
            total_extra = None
        rows.append({
            "id": t.id,
            "nombre": (t.nombre or "").strip() or f"Equipo {t.id}",
            "team_category": team_category,
            "total_puntos": int(total_puntos),
            "total_eventos": int(total_eventos),
            "mejor_marca": total_marca,
            "extra": total_extra,
            "has_active_appeal": has_active_appeal,
            "members": members,
        })
    if rank_by_category:
        by_cat: dict[str, list[dict]] = defaultdict(list)
        for row in rows:
            by_cat[row.get("team_category") or "Sin categoria"].append(row)
        ordered_rows: list[dict] = []
        for cat in sorted(by_cat.keys()):
            cat_rows = by_cat[cat]
            if points_lower_is_better:
                cat_rows.sort(key=lambda x: (
                    1 if (x.get("total_eventos") or 0) == 0 else 0,
                    x["total_puntos"]
                ))
            else:
                cat_rows.sort(key=lambda x: x["total_puntos"], reverse=True)
            for idx, row in enumerate(cat_rows, 1):
                row["rank"] = idx
            ordered_rows.extend(cat_rows)
        rows = ordered_rows
    else:
        if points_lower_is_better:
            rows.sort(key=lambda x: (
                1 if (x.get("total_eventos") or 0) == 0 else 0,
                x["total_puntos"]
            ))
        else:
            rows.sort(key=lambda x: x["total_puntos"], reverse=True)
        for idx, row in enumerate(rows, 1):
            row["rank"] = idx
    return rows


def _build_leaderboard_results_snapshot(competition_id: int, session: Session) -> dict:
    comp = session.get(Competition, competition_id)
    comp_lower_is_better = competition_total_lower_is_better(comp)
    comp_tiebreak = normalize_scoring_tiebreak(getattr(comp, "scoring_tiebreak", None))
    individual_enabled = bool(getattr(comp, "individual_enabled", 1)) if comp else True
    team_enabled = bool(getattr(comp, "team_enabled", 0)) if comp else False
    show_individual = bool(comp.show_individual_leaderboard) if comp else True
    show_individual = show_individual and individual_enabled
    show_team_all_by_category_option = bool(comp.show_team_all_by_category_option) if comp else True
    show_team_all_global_option = bool(comp.show_team_all_global_option) if comp else True
    tv_show_qr = bool(comp.tv_show_qr) if comp else True
    tv_show_timer = bool(comp.tv_show_timer) if comp else True
    tv_include_total_slide = bool(comp.tv_include_total_slide) if comp else True
    tv_only_finalized_phases = bool(comp.tv_only_finalized_phases) if comp else True
    tv_rotation_interval_seconds = int(getattr(comp, "tv_rotation_interval_seconds", 24) or 24)
    tv_rotation_interval_seconds = min(120, max(5, tv_rotation_interval_seconds))
    tv_data_refresh_interval_seconds = int(getattr(comp, "tv_data_refresh_interval_seconds", 5) or 5)
    tv_data_refresh_interval_seconds = min(60, max(2, tv_data_refresh_interval_seconds))
    tv_mode = (getattr(comp, "tv_mode", "cyclic") or "cyclic").strip().lower() if comp else "cyclic"
    if tv_mode not in {"cyclic", "static"}:
        tv_mode = "cyclic"
    tv_static_view = (getattr(comp, "tv_static_view", "individual") or "individual").strip().lower() if comp else "individual"
    if tv_static_view not in {"individual", "teams"}:
        tv_static_view = "individual"
    tv_static_phase_id = getattr(comp, "tv_static_phase_id", None) if comp else None
    tv_static_individual_category = (getattr(comp, "tv_static_individual_category", None) or None) if comp else None
    tv_static_team_category_mode = (getattr(comp, "tv_static_team_category_mode", "__by_category__") or "__by_category__") if comp else "__by_category__"
    rank_by_category = (
        _competition_has_categories(session, competition_id)
        and normalize_scoring_scope(getattr(comp, "scoring_scope", None)) == "category"
    )

    participants_meta = _fetch_participants_meta(session, competition_id)
    ind_points_per_phase = _fetch_ind_points_per_phase(session, competition_id)

    ind_totals_by_pid: dict[int, dict] = defaultdict(lambda: {"sum": 0, "count": 0, "positions": [], "has_active_appeal": False})
    for (_ph, pid), data in ind_points_per_phase.items():
        ind_totals_by_pid[pid]["sum"] += data["sum"]
        ind_totals_by_pid[pid]["count"] += data["count"]
        if data.get("best_position") is not None:
            ind_totals_by_pid[pid]["positions"].append(int(data["best_position"]))
        ind_totals_by_pid[pid]["has_active_appeal"] = bool(ind_totals_by_pid[pid]["has_active_appeal"] or data.get("has_active_appeal"))

    individual = _rank_by_category(
        _build_ind_rows(participants_meta, ind_points_per_phase, ind_totals_by_pid, phase_id=None, lower_is_better=False),
        lower_is_better=comp_lower_is_better,
        tiebreak=comp_tiebreak,
    ) if show_individual else {}

    phases = session.exec(
        select(CompetitionPhase)
        .where(CompetitionPhase.competition_id == competition_id)
        .where(CompetitionPhase.is_visible == 1)
        .order_by(CompetitionPhase.orden, CompetitionPhase.id)
    ).all()
    phase_status_map = compute_phase_status_map(session, competition_id)

    if team_enabled:
        teams = session.exec(select(Team).where(Team.competition_id == competition_id).order_by(Team.id)).all()
        team_members_by_team = _fetch_team_members(session, competition_id)
        team_member_points_per_phase = _fetch_team_member_points_per_phase(session, competition_id)
        team_direct_per_phase = _fetch_team_direct_points_per_phase(session, competition_id)
        categories_map = _fetch_categories_map(session, competition_id)
        team_member_totals_by_team_pid: dict[tuple[int, int], dict] = defaultdict(lambda: {"sum": 0, "count": 0, "positions": [], "has_active_appeal": False})
        for (_ph, tid, pid), data in team_member_points_per_phase.items():
            key = (tid, pid)
            team_member_totals_by_team_pid[key]["sum"] += data["sum"]
            team_member_totals_by_team_pid[key]["count"] += data["count"]
            if data.get("best_position") is not None:
                team_member_totals_by_team_pid[key]["positions"].append(int(data["best_position"]))
            team_member_totals_by_team_pid[key]["has_active_appeal"] = bool(team_member_totals_by_team_pid[key]["has_active_appeal"] or data.get("has_active_appeal"))
    else:
        teams = []
        team_members_by_team = {}
        team_member_points_per_phase = {}
        team_direct_per_phase = {}
        categories_map = {}
        team_member_totals_by_team_pid = {}

    phases_data = []
    for phase in phases:
        phase_lower_is_better = _phase_lower_is_better(phase)
        phase_tiebreak_lower_is_better = _phase_tiebreak_lower_is_better(phase)
        phase_rows = _build_ind_rows(
            participants_meta,
            ind_points_per_phase,
            ind_totals_by_pid,
            phase_id=int(phase.id),
            lower_is_better=phase_lower_is_better,
            tiebreak_lower_is_better=phase_tiebreak_lower_is_better,
            tiebreak_enabled=bool(int(getattr(phase, "tie_break_enabled", 0) or 0)),
        ) if show_individual else []
        phase_mode = (phase.team_result_mode or "sum_two").strip().lower()
        if phase_mode not in {"sum_two", "single_member", "total"}:
            phase_mode = "sum_two"
        team_phase_rows = _build_team_rows_for_phase(
            teams,
            competition_id,
            int(phase.id),
            phase_mode,
            phase_lower_is_better,
            comp_lower_is_better,
            team_members_by_team,
            ind_points_per_phase,
            team_member_points_per_phase,
            team_direct_per_phase,
            categories_map,
            rank_by_category=rank_by_category,
        ) if team_enabled else []
        phases_data.append({
            "id": phase.id,
            "nombre": phase.nombre,
            "modality": getattr(phase, "modality", "individual") or "individual",
            "block_name": getattr(phase, "block_name", None),
            "block_order": int(getattr(phase, "block_order", 0) or 0),
            "phase_format": getattr(phase, "phase_format", "activity") or "activity",
            "tipo": type_from_measurement_method(getattr(phase, "measurement_method", None)),
            "measurement_method": normalize_phase_measurement_method(getattr(phase, "measurement_method", None), getattr(phase, "tipo", None)),
            "winner_rule": getattr(phase, "winner_rule", None),
            "tie_break_enabled": int(getattr(phase, "tie_break_enabled", 0) or 0),
            "tie_break_method": normalize_phase_measurement_method(getattr(phase, "tie_break_method", None), "tiempo"),
            "time_cap_seconds": int(getattr(phase, "time_cap_seconds")) if getattr(phase, "time_cap_seconds", None) is not None else None,
            "scoring": phase_scoring_config(comp, phase),
            "activities": _parse_phase_activities(getattr(phase, "activities", None)),
            "estado": phase_status_map.get(int(phase.id), phase.estado),
            "descripcion": phase.descripcion,
            "allow_multiple_results": phase.allow_multiple_results,
            "team_result_mode": phase_mode,
            "individual": _rank_by_category(phase_rows, lower_is_better=comp_lower_is_better, tiebreak=comp_tiebreak) if (getattr(phase, "modality", "individual") or "individual") == "individual" and show_individual else {},
            "teams": team_phase_rows if (getattr(phase, "modality", "individual") or "individual") == "teams" and team_enabled else [],
        })

    # Team total = suma de puntos por fase respetando el modo de cada fase.
    team_totals_map: dict[int, dict] = {}
    for t in teams:
        global_members = _team_global_members(
            int(t.id),
            team_members_by_team,
            ind_totals_by_pid,
            team_member_totals_by_team_pid,
        )
        team_totals_map[t.id] = {
            "id": t.id,
            "nombre": (t.nombre or "").strip() or f"Equipo {t.id}",
            "team_category": _resolve_team_category(t, global_members, competition_id, categories_map),
            "total_puntos": 0,
            "total_eventos": 0,
            "total_position_tiebreak": [],
            "has_active_appeal": any(member.get("has_active_appeal") for member in global_members),
            "members": global_members,
        }

    for ph in phases_data:
        for tr in ph["teams"]:
            base = team_totals_map.get(tr["id"])
            if base is None:
                continue
            base["total_puntos"] += int(tr.get("total_puntos") or 0)
            base["total_eventos"] += int(tr.get("total_eventos") or 0)
            if tr.get("rank") is not None:
                base["total_position_tiebreak"].append(int(tr["rank"]))
            base["has_active_appeal"] = bool(base.get("has_active_appeal") or tr.get("has_active_appeal"))

    teams_values = list(team_totals_map.values())

    if rank_by_category:
        by_cat: dict[str, list[dict]] = defaultdict(list)
        for row in teams_values:
            by_cat[row.get("team_category") or "Sin categoria"].append(row)
        teams_list: list[dict] = []
        for cat in sorted(by_cat.keys()):
            cat_rows = by_cat[cat]
            cat_rows = _sort_total_rows(cat_rows, lower_is_better=comp_lower_is_better, tiebreak=comp_tiebreak)
            for idx, row in enumerate(cat_rows, 1):
                row["rank"] = idx
            teams_list.extend(cat_rows)
    else:
        teams_list = _sort_total_rows(teams_values, lower_is_better=comp_lower_is_better, tiebreak=comp_tiebreak)
        for idx, row in enumerate(teams_list, 1):
            row["rank"] = idx

    return {
        "individual": individual,
        "phases": phases_data,
        "has_phases": len(phases_data) > 0 and show_individual,
        "show_individual_leaderboard": 1 if show_individual else 0,
        "individual_enabled": 1 if individual_enabled else 0,
        "team_enabled": 1 if team_enabled else 0,
        "show_team_all_by_category_option": 1 if show_team_all_by_category_option else 0,
        "show_team_all_global_option": 1 if show_team_all_global_option else 0,
        "tv_show_qr": 1 if tv_show_qr else 0,
        "tv_show_timer": 1 if tv_show_timer else 0,
        "tv_include_total_slide": 1 if tv_include_total_slide else 0,
        "tv_only_finalized_phases": 1 if tv_only_finalized_phases else 0,
        "tv_rotation_interval_seconds": tv_rotation_interval_seconds,
        "tv_data_refresh_interval_seconds": tv_data_refresh_interval_seconds,
        "tv_mode": tv_mode,
        "tv_static_view": tv_static_view,
        "tv_static_phase_id": tv_static_phase_id,
        "tv_static_individual_category": tv_static_individual_category,
        "tv_static_team_category_mode": tv_static_team_category_mode,
        "show_event_count": False,
        "scoring_mode": getattr(comp, "scoring_mode", "highest_wins") if comp else "highest_wins",
        "scoring_system": getattr(comp, "scoring_system", "dynamic_points") if comp else "dynamic_points",
        "scoring_scope": normalize_scoring_scope(getattr(comp, "scoring_scope", None)) if comp else "category",
        "scoring_tiebreak": comp_tiebreak,
        "cumulative_direction": getattr(comp, "cumulative_direction", "higher_wins") if comp else "higher_wins",
        "teams": teams_list,
        "has_teams": team_enabled and len(teams_list) > 0,
    }


@router.get("/{competition_id}")
def get_leaderboard(competition_id: int, session: Session = Depends(get_session)):
    cached = get_leaderboard_results_snapshot(competition_id)
    if isinstance(cached, dict):
        return cached

    payload = _build_leaderboard_results_snapshot(competition_id, session)
    set_leaderboard_results_snapshot(competition_id, payload)
    return payload
