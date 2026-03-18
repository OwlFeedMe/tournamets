from collections import defaultdict

from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlmodel import Session, select

from database import get_session
from models import Competition, CompetitionPhase, Team
from phase_status import compute_phase_status_map

router = APIRouter(prefix="/api/leaderboard", tags=["leaderboard"])


def _phase_lower_is_better(phase: CompetitionPhase | None) -> bool:
    if not phase:
        return False
    winner_rule = (getattr(phase, "winner_rule", "") or "").strip().lower()
    if winner_rule in {"higher_wins", "lower_wins"}:
        return winner_rule == "lower_wins"
    phase_type = (getattr(phase, "tipo", "") or "").strip().lower()
    return phase_type in {"tiempo", "posicion"}


def _rank_by_category(rows, *, lower_is_better: bool = False) -> dict:
    by_cat: dict[str, list] = defaultdict(list)
    for row in rows:
        entry = dict(row)
        by_cat[entry.get("categoria") or "Sin categoria"].append(entry)

    result: dict[str, list] = {}
    for cat, members in by_cat.items():
        if lower_is_better:
            sorted_m = sorted(members, key=lambda x: (
                1 if (x.get("total_eventos") or 0) == 0 else 0,
                x["total_puntos"]
            ))
        else:
            sorted_m = sorted(members, key=lambda x: x["total_puntos"], reverse=True)
        for rank, p in enumerate(sorted_m, 1):
            p["rank"] = rank
        result[cat] = sorted_m
    return result


def _competition_has_categories(session: Session, competition_id: int) -> bool:
    rows = session.execute(text("""
        SELECT categoria
        FROM competition_participants
        WHERE competition_id = :cid
    """), {"cid": competition_id}).mappings().all()
    return any((r.get("categoria") or "").strip() for r in rows)


def _ind_query(session: Session, competition_id: int, phase_id=None, lower_is_better: bool = False) -> list:
    phase_filter = "AND r.phase_id = :pid" if phase_id else ""
    pid_param = {"cid": competition_id, "pid": phase_id} if phase_id else {"cid": competition_id}
    mark_select = "NULL::int AS mejor_marca"
    if phase_id:
        mark_agg = "MIN" if lower_is_better else "MAX"
        mark_select = f"CASE WHEN COUNT(r.id) = 0 THEN NULL ELSE {mark_agg}(r.marca)::int END AS mejor_marca"

    rows = session.execute(text(f"""
        SELECT
            p.id,
            p.nombre,
            p.apellido,
            cp.categoria,
            p.sexo,
            COALESCE(SUM(r.puntos), 0)::int AS total_puntos,
            COUNT(r.id)::int                AS total_eventos,
            {mark_select}
        FROM participants p
        JOIN competition_participants cp
            ON  cp.participant_id = p.id
            AND cp.competition_id = :cid
            AND cp.estado = 'confirmado'
        LEFT JOIN results r
            ON  r.participant_id = p.id
            AND r.competition_id = :cid
            AND r.team_id IS NULL
            {phase_filter}
        WHERE p.estado = 'activo'
        GROUP BY p.id, cp.categoria
        ORDER BY cp.categoria, total_puntos DESC
    """), pid_param).mappings().all()
    return rows


def _team_members_points(
    session: Session,
    competition_id: int,
    team_id: int,
    phase_id: int | None,
    lower_is_better: bool = False,
):
    phase_filter = "AND r.phase_id = :pid" if phase_id is not None else ""
    params = {"cid": competition_id, "tid": team_id}
    if phase_id is not None:
        params["pid"] = phase_id
    mark_select = "NULL::int AS mejor_marca"
    if phase_id is not None:
        mark_agg = "MIN" if lower_is_better else "MAX"
        mark_select = f"CASE WHEN COUNT(r.id) = 0 THEN NULL ELSE {mark_agg}(r.marca)::int END AS mejor_marca"

    return [dict(r) for r in session.execute(text(f"""
        SELECT
            p.id,
            p.nombre,
            p.apellido,
            cp.categoria,
            p.sexo,
            COALESCE(SUM(r.puntos), 0)::int AS puntos_propios,
            COUNT(r.id)::int                AS intentos,
            {mark_select}
        FROM team_members tm
        JOIN participants p ON p.id = tm.participant_id
        LEFT JOIN competition_participants cp
            ON cp.participant_id = p.id AND cp.competition_id = :cid
        LEFT JOIN results r
            ON  r.participant_id = p.id
            AND r.competition_id = :cid
            AND (r.team_id IS NULL OR r.team_id = :tid)
            {phase_filter}
        WHERE tm.team_id = :tid
        GROUP BY p.id, cp.categoria
        ORDER BY p.apellido, p.nombre
    """), params).mappings().all()]


def _team_direct_points(
    session: Session,
    competition_id: int,
    team_id: int,
    phase_id: int | None,
    lower_is_better: bool = False,
) -> tuple[int, int, int | None]:
    phase_filter = "AND r.phase_id = :pid" if phase_id is not None else ""
    params = {"cid": competition_id, "tid": team_id}
    if phase_id is not None:
        params["pid"] = phase_id
    mark_select = "NULL::int AS mejor_marca"
    if phase_id is not None:
        mark_agg = "MIN" if lower_is_better else "MAX"
        mark_select = f"CASE WHEN COUNT(r.id) = 0 THEN NULL ELSE {mark_agg}(r.marca)::int END AS mejor_marca"
    row = session.execute(text(f"""
        SELECT
            COALESCE(SUM(r.puntos), 0)::int AS total_puntos,
            COUNT(r.id)::int                AS total_eventos,
            {mark_select}
        FROM results r
        WHERE r.competition_id = :cid
          AND r.team_id = :tid
          AND r.participant_id IS NULL
          {phase_filter}
    """), params).mappings().one()
    return int(row["total_puntos"] or 0), int(row["total_eventos"] or 0), (int(row["mejor_marca"]) if row["mejor_marca"] is not None else None)


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


def _build_team_rows_for_phase(
    session: Session,
    competition_id: int,
    teams: list[Team],
    phase_id: int | None,
    mode: str,
    mark_lower_is_better: bool,
    points_lower_is_better: bool,
    rank_by_category: bool = False,
) -> list[dict]:
    rows = []
    for t in teams:
        members = _team_members_points(session, competition_id, t.id, phase_id, lower_is_better=mark_lower_is_better)
        member_cats = sorted({(m.get("categoria") or "").strip() for m in members if (m.get("categoria") or "").strip()})
        if len(member_cats) == 1:
            team_category = member_cats[0]
        elif len(member_cats) == 0:
            team_category = "Sin categoria"
        else:
            team_category = "Mixta"
        total_eventos = sum(int(m.get("intentos") or 0) for m in members)
        total_puntos = _team_points_for_phase(members, mode)
        total_marca = _team_mark_for_phase(members, mode, mark_lower_is_better)
        direct_points, direct_events, direct_mark = _team_direct_points(
            session, competition_id, t.id, phase_id, lower_is_better=mark_lower_is_better
        )
        if mode == "total":
            total_puntos = direct_points
            total_eventos = direct_events
            total_marca = direct_mark
        else:
            total_puntos += direct_points
            total_eventos += direct_events
        rows.append({
            "id": t.id,
            "nombre": (t.nombre or "").strip() or f"Equipo {t.id}",
            "team_category": team_category,
            "total_puntos": int(total_puntos),
            "total_eventos": int(total_eventos),
            "mejor_marca": total_marca,
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


@router.get("/{competition_id}")
def get_leaderboard(competition_id: int, session: Session = Depends(get_session)):
    comp = session.get(Competition, competition_id)
    comp_lower_is_better = (getattr(comp, "scoring_mode", "highest_wins") == "lowest_wins")
    show_individual = bool(comp.show_individual_leaderboard) if comp else True
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
    rank_by_category = _competition_has_categories(session, competition_id)

    individual = _rank_by_category(
        _ind_query(session, competition_id),
        lower_is_better=comp_lower_is_better,
    ) if show_individual else {}

    phases = session.exec(
        select(CompetitionPhase)
        .where(CompetitionPhase.competition_id == competition_id)
        .order_by(CompetitionPhase.orden, CompetitionPhase.id)
    ).all()
    phase_status_map = compute_phase_status_map(session, competition_id)
    teams = session.exec(select(Team).where(Team.competition_id == competition_id).order_by(Team.id)).all()

    phases_data = []
    for phase in phases:
        phase_lower_is_better = _phase_lower_is_better(phase)
        phase_rows = _ind_query(
            session, competition_id, phase_id=phase.id, lower_is_better=phase_lower_is_better
        ) if show_individual else []
        phase_mode = (phase.team_result_mode or "sum_two").strip().lower()
        if phase_mode not in {"sum_two", "single_member", "total"}:
            phase_mode = "sum_two"
        team_phase_rows = _build_team_rows_for_phase(
            session,
            competition_id,
            teams,
            phase.id,
            phase_mode,
            phase_lower_is_better,
            comp_lower_is_better,
            rank_by_category=rank_by_category,
        )
        phases_data.append({
            "id": phase.id,
            "nombre": phase.nombre,
            "tipo": phase.tipo,
            "measurement_method": getattr(phase, "measurement_method", None),
            "winner_rule": getattr(phase, "winner_rule", None),
            "estado": phase_status_map.get(int(phase.id), phase.estado),
            "descripcion": phase.descripcion,
            "allow_multiple_results": phase.allow_multiple_results,
            "team_result_mode": phase_mode,
            "individual": _rank_by_category(phase_rows, lower_is_better=comp_lower_is_better),
            "teams": team_phase_rows,
        })

    # Team total = suma de puntos por fase respetando el modo de cada fase.
    team_totals_map = {t.id: {
        "id": t.id,
        "nombre": (t.nombre or "").strip() or f"Equipo {t.id}",
        "team_category": "Sin categoria",
        "total_puntos": 0,
        "total_eventos": 0,
        "members": _team_members_points(session, competition_id, t.id, None),
    } for t in teams}
    for ph in phases_data:
        for tr in ph["teams"]:
            base = team_totals_map.get(tr["id"])
            if base is None:
                continue
            base["total_puntos"] += int(tr.get("total_puntos") or 0)
            base["total_eventos"] += int(tr.get("total_eventos") or 0)

    teams_values = list(team_totals_map.values())
    for row in teams_values:
        member_cats = sorted({(m.get("categoria") or "").strip() for m in row.get("members", []) if (m.get("categoria") or "").strip()})
        if len(member_cats) == 1:
            row["team_category"] = member_cats[0]
        elif len(member_cats) == 0:
            row["team_category"] = "Sin categoria"
        else:
            row["team_category"] = "Mixta"

    if rank_by_category:
        by_cat: dict[str, list[dict]] = defaultdict(list)
        for row in teams_values:
            by_cat[row.get("team_category") or "Sin categoria"].append(row)
        teams_list: list[dict] = []
        for cat in sorted(by_cat.keys()):
            cat_rows = by_cat[cat]
            if comp_lower_is_better:
                cat_rows.sort(key=lambda x: (
                    1 if (x.get("total_eventos") or 0) == 0 else 0,
                    x["total_puntos"]
                ))
            else:
                cat_rows.sort(key=lambda x: x["total_puntos"], reverse=True)
            for idx, row in enumerate(cat_rows, 1):
                row["rank"] = idx
            teams_list.extend(cat_rows)
    else:
        if comp_lower_is_better:
            teams_list = sorted(teams_values, key=lambda x: (
                1 if (x.get("total_eventos") or 0) == 0 else 0,
                x["total_puntos"]
            ))
        else:
            teams_list = sorted(teams_values, key=lambda x: x["total_puntos"], reverse=True)
        for idx, row in enumerate(teams_list, 1):
            row["rank"] = idx

    return {
        "individual": individual,
        "phases": phases_data,
        "has_phases": len(phases_data) > 0 and show_individual,
        "show_individual_leaderboard": 1 if show_individual else 0,
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
        "show_event_count": any(bool(p.allow_multiple_results) for p in phases),
        "scoring_mode": getattr(comp, "scoring_mode", "highest_wins") if comp else "highest_wins",
        "teams": teams_list,
        "has_teams": len(teams_list) > 0,
    }
