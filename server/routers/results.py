from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from datetime import datetime, timedelta, timezone
from sqlalchemy import text
from sqlmodel import Session, select

from access import get_owned_competition_ids, is_organizer_user, require_competition_access
from auth import (
    get_effective_user_id,
    has_admin_access,
    has_judge_access,
    has_organizer_access,
    is_end_user,
    require_auth,
    require_staff,
)
from database import get_session
from models import Result, ResultCreate, ResultUpdate, Competition, CompetitionParticipant, CompetitionPhase, Team, TeamMember
from phase_status import recompute_and_persist_phase_status
from services.leaderboard_cache import invalidate_leaderboard_results_snapshot
from services.result_notifications import notify_result_saved
from services.scoring import (
    compute_result_points,
    normalize_scoring_scope,
)

router = APIRouter(prefix="/api/results", tags=["results"])
APPEAL_WINDOW_MINUTES = 90
PHASE_TIPOS_VALIDOS = {"posicion", "cantidad", "tiempo"}
PHASE_TIPO_ALIAS = {
    "puntos": "cantidad",
    "peso": "cantidad",
    "posici\u00f3n": "posicion",
}
PHASE_POINTS_MODES_VALIDOS = {"manual", "position_direct", "position_rules"}
PHASE_WINNER_RULES_VALIDOS = {"higher_wins", "lower_wins"}


def appeal_deadline_from_now() -> datetime:
    return datetime.now(timezone.utc) + timedelta(minutes=APPEAL_WINDOW_MINUTES)


def _should_scope_to_authenticated_participant(user: dict | None) -> bool:
    if not user:
        return False
    if has_admin_access(user) or has_organizer_access(user) or has_judge_access(user):
        return False
    return is_end_user(user)


def _normalize_phase_type(raw: str | None) -> str:
    value = (raw or "").strip().lower()
    return PHASE_TIPO_ALIAS.get(value, value)


def _normalize_points_mode(raw: str | None) -> str:
    value = (raw or "").strip().lower()
    if value in PHASE_POINTS_MODES_VALIDOS:
        return value
    return "manual"


def _normalize_winner_rule(raw: str | None) -> str:
    value = (raw or "").strip().lower()
    if value in PHASE_WINNER_RULES_VALIDOS:
        return value
    return ""


def _default_winner_rule_for_type(phase_type: str) -> str:
    if phase_type in {"tiempo", "posicion"}:
        return "lower_wins"
    return "higher_wins"


def _phase_lower_is_better(phase: CompetitionPhase | None, comp: Competition | None) -> bool:
    if phase is not None:
        phase_type = _normalize_phase_type(getattr(phase, "tipo", None))
        winner_rule = _normalize_winner_rule(getattr(phase, "winner_rule", None))
        if not winner_rule:
            winner_rule = _default_winner_rule_for_type(phase_type)
        return winner_rule == "lower_wins"
    return bool(comp and getattr(comp, "scoring_mode", "highest_wins") == "lowest_wins")


def _phase_tiebreak_lower_is_better(phase: CompetitionPhase | None) -> bool:
    method = (getattr(phase, "tie_break_method", None) or "for_time").strip().lower() if phase else "for_time"
    return method in {"for_time", "tiempo_hms", "tiempo", "posicion"}


def _phase_is_time(phase: CompetitionPhase | None) -> bool:
    if phase is None:
        return False
    method = str(getattr(phase, "measurement_method", None) or getattr(phase, "workout_format", None) or "").strip().lower()
    phase_type = _normalize_phase_type(getattr(phase, "tipo", None))
    return phase_type == "tiempo" or method in {"for_time", "tiempo_hms", "tiempo"}


def _validate_time_cap_result(phase: CompetitionPhase | None, mark: int | None, extra: int | None) -> int | None:
    cap = getattr(phase, "time_cap_seconds", None)
    if not _phase_is_time(phase) or cap is None or mark is None:
        return extra
    cap_seconds = int(cap)
    if int(mark) > cap_seconds:
        minutes, seconds = divmod(cap_seconds, 60)
        hours, minutes = divmod(minutes, 60)
        label = f"{hours:02d}:{minutes:02d}:{seconds:02d}" if hours else f"{minutes:02d}:{seconds:02d}"
        raise HTTPException(400, f"El tiempo no puede superar el cap de {label}")
    if int(mark) != cap_seconds:
        return None
    return extra


def _ranking_value(value: int | None, *, lower_is_better: bool) -> tuple[int, int]:
    if value is None:
        return (1, 0)
    return (0, int(value) if lower_is_better else -int(value))


def _result_rank_key(result: Result, *, lower_is_better: bool, tiebreak_lower_is_better: bool) -> tuple[int, int, int, int, int, int, int]:
    return (
        *_ranking_value(result.marca, lower_is_better=lower_is_better),
        *_ranking_value(getattr(result, "extra", None), lower_is_better=True),
        *_ranking_value(result.tiebreak, lower_is_better=tiebreak_lower_is_better),
        int(result.id or 0),
    )


def _ranked_position_groups(
    rows: list,
    *,
    mark_getter,
    extra_getter=None,
    tiebreak_getter,
    lower_is_better: bool,
    tiebreak_lower_is_better: bool,
) -> list[tuple[int, list]]:
    def split_by_optional_metric(items: list, getter, *, metric_lower_is_better: bool) -> list[list]:
        if len(items) <= 1 or getter is None or not all(getter(item) is not None for item in items):
            return [items]
        ordered_items = sorted(items, key=lambda item: (
            _ranking_value(getter(item), lower_is_better=metric_lower_is_better),
            int(getattr(item, "id", 0) or 0) if hasattr(item, "id") else 0,
        ))
        groups: list[list] = []
        idx = 0
        while idx < len(ordered_items):
            value = getter(ordered_items[idx])
            value_group = [ordered_items[idx]]
            idx += 1
            while idx < len(ordered_items) and getter(ordered_items[idx]) == value:
                value_group.append(ordered_items[idx])
                idx += 1
            groups.append(value_group)
        return groups

    ordered = sorted(rows, key=lambda item: (
        _ranking_value(mark_getter(item), lower_is_better=lower_is_better),
        int(getattr(item, "id", 0) or 0) if hasattr(item, "id") else 0,
    ))
    positioned: list[tuple[int, list]] = []
    position = 1
    index = 0
    while index < len(ordered):
        mark = mark_getter(ordered[index])
        mark_group = [ordered[index]]
        index += 1
        while index < len(ordered) and mark_getter(ordered[index]) == mark:
            mark_group.append(ordered[index])
            index += 1

        extra_groups = split_by_optional_metric(mark_group, extra_getter, metric_lower_is_better=True)
        for extra_group in extra_groups:
            tiebreak_groups = split_by_optional_metric(extra_group, tiebreak_getter, metric_lower_is_better=tiebreak_lower_is_better)
            for tie_items in tiebreak_groups:
                positioned.append((position, tie_items))
                position += len(tie_items)
    return positioned


def _normalize_team_result_mode(raw: str | None) -> str:
    value = (raw or "").strip().lower()
    if value in {"sum_two", "single_member", "total"}:
        return value
    return "sum_two"


def _normalize_category(raw: str | None) -> str:
    return (raw or "").strip() or "Sin categoria"


def _competition_has_categories(session: Session, competition_id: int) -> bool:
    rows = session.exec(
        select(CompetitionParticipant.categoria).where(
            CompetitionParticipant.competition_id == competition_id
        )
    ).all()
    return any((c or "").strip() for c in rows)


def _participant_categories_map(session: Session, competition_id: int, participant_ids: set[int]) -> dict[int, str]:
    if not participant_ids:
        return {}
    rows = session.exec(
        select(CompetitionParticipant).where(
            CompetitionParticipant.competition_id == competition_id,
            CompetitionParticipant.user_id.in_(participant_ids),
        )
    ).all()
    out: dict[int, str] = {}
    for cp in rows:
        out[int(cp.user_id)] = _normalize_category(cp.categoria)
    return out


def _team_categories_map(session: Session, competition_id: int, team_ids: set[int]) -> dict[int, str]:
    if not team_ids:
        return {}
    members = session.exec(
        select(TeamMember).where(TeamMember.team_id.in_(team_ids))
    ).all()
    participant_ids = {int(m.user_id) for m in members}
    participant_category = _participant_categories_map(session, competition_id, participant_ids)

    team_categories: dict[int, set[str]] = {}
    for m in members:
        tid = int(m.team_id)
        pid = int(m.user_id)
        team_categories.setdefault(tid, set()).add(participant_category.get(pid, "Sin categoria"))

    out: dict[int, str] = {}
    for tid in team_ids:
        cats = team_categories.get(int(tid), set())
        if len(cats) == 1:
            out[int(tid)] = next(iter(cats))
        elif len(cats) == 0:
            out[int(tid)] = "Sin categoria"
        else:
            out[int(tid)] = "Mixta"
    return out


def _recompute_phase_positions_and_points(session: Session, competition_id: int, phase_id: int):
    comp = session.get(Competition, competition_id)
    if not comp:
        return
    phase = session.get(CompetitionPhase, phase_id)
    lower_is_better = _phase_lower_is_better(phase, comp)
    tiebreak_enabled = bool(int(getattr(phase, "tie_break_enabled", 0) or 0))
    tiebreak_lower_is_better = _phase_tiebreak_lower_is_better(phase)

    rows = session.exec(
        select(Result)
        .where(Result.competition_id == competition_id, Result.phase_id == phase_id)
        .order_by(Result.id)
    ).all()
    if not rows:
        return

    rank_by_category = (
        _competition_has_categories(session, competition_id)
        and normalize_scoring_scope(getattr(comp, "scoring_scope", None)) == "category"
    )
    phase_mode = ((getattr(phase, "team_result_mode", None) or "").strip().lower()) if phase else ""
    phase_modality = ((getattr(phase, "modality", None) or "individual").strip().lower()) if phase else "individual"
    is_team_entity_phase = phase_modality == "teams" and phase_mode in {"sum_two", "single_member"}

    # Team-based phases: rank by team, then propagate same position/points to member rows.
    if is_team_entity_phase:
        team_rows = [r for r in rows if r.team_id is not None]
        non_team_rows = [r for r in rows if r.team_id is None]

        grouped: dict[int, list[Result]] = {}
        for r in team_rows:
            grouped.setdefault(int(r.team_id), []).append(r)

        team_category = _team_categories_map(session, competition_id, set(grouped.keys())) if rank_by_category else {}
        entities_by_category: dict[str, list[tuple[int, int, int | None, int | None, list[Result]]]] = {}
        for team_id, items in grouped.items():
            marks = [int(x.marca) for x in items if x.marca is not None]
            if not marks:
                continue
            if phase_mode == "single_member":
                team_mark = min(marks) if lower_is_better else max(marks)
            else:
                team_mark = sum(marks)
            extra_values = [int(getattr(x, "extra", 0)) for x in items if getattr(x, "extra", None) is not None]
            team_extra = min(extra_values) if extra_values else None
            tie_values = [int(x.tiebreak) for x in items if x.tiebreak is not None]
            team_tiebreak = (min(tie_values) if tiebreak_lower_is_better else max(tie_values)) if tie_values else None
            category = team_category.get(team_id, "Sin categoria") if rank_by_category else "__global__"
            entities_by_category.setdefault(category, []).append((team_id, team_mark, team_extra, team_tiebreak, items))

        ranked_team_ids = set()
        for category_entities in entities_by_category.values():
            total = len(category_entities)
            for position, positioned_items in _ranked_position_groups(
                category_entities,
                mark_getter=lambda item: item[1],
                extra_getter=lambda item: item[2],
                tiebreak_getter=(lambda item: item[3]) if tiebreak_enabled else None,
                lower_is_better=lower_is_better,
                tiebreak_lower_is_better=tiebreak_lower_is_better,
            ):
                pts = compute_result_points(
                    position=position,
                    total_ranked=total,
                    mark=positioned_items[0][1] if positioned_items else None,
                    competition=comp,
                    phase=phase,
                )
                for team_id, _team_mark, _team_extra, _team_tiebreak, items in positioned_items:
                    ranked_team_ids.add(team_id)
                    for r in items:
                        r.posicion = position
                        r.puntos = int(pts)
                        session.add(r)

        for team_id, items in grouped.items():
            if team_id in ranked_team_ids:
                continue
            for r in items:
                r.posicion = None
                r.puntos = 0
                session.add(r)

        # Keep legacy non-team rows harmless in this mode.
        for r in non_team_rows:
            r.posicion = None
            r.puntos = 0
            session.add(r)
        return

    # Default row-based ranking (individual or team total with one row per team).
    with_metric = [r for r in rows if r.marca is not None]
    without_metric = [r for r in rows if r.marca is None]
    if rank_by_category:
        participant_ids = {int(r.user_id) for r in with_metric if r.user_id is not None}
        team_ids = {int(r.team_id) for r in with_metric if r.team_id is not None and r.user_id is None}
        participant_category = _participant_categories_map(session, competition_id, participant_ids)
        team_category = _team_categories_map(session, competition_id, team_ids)

        grouped_rows: dict[str, list[Result]] = {}
        for r in with_metric:
            if r.user_id is not None:
                category = participant_category.get(int(r.user_id), "Sin categoria")
            elif r.team_id is not None:
                category = team_category.get(int(r.team_id), "Sin categoria")
            else:
                category = "Sin categoria"
            grouped_rows.setdefault(category, []).append(r)

        for category_rows in grouped_rows.values():
            total = len(category_rows)
            for position, positioned_items in _ranked_position_groups(
                category_rows,
                mark_getter=lambda item: item.marca,
                extra_getter=lambda item: getattr(item, "extra", None),
                tiebreak_getter=(lambda item: item.tiebreak) if tiebreak_enabled else None,
                lower_is_better=lower_is_better,
                tiebreak_lower_is_better=tiebreak_lower_is_better,
            ):
                pts = compute_result_points(
                    position=position,
                    total_ranked=total,
                    mark=positioned_items[0].marca if positioned_items else None,
                    competition=comp,
                    phase=phase,
                )
                for r in positioned_items:
                    r.posicion = position
                    r.puntos = int(pts)
                    session.add(r)
    else:
        total = len(with_metric)
        for position, positioned_items in _ranked_position_groups(
            with_metric,
            mark_getter=lambda item: item.marca,
            extra_getter=lambda item: getattr(item, "extra", None),
            tiebreak_getter=(lambda item: item.tiebreak) if tiebreak_enabled else None,
            lower_is_better=lower_is_better,
            tiebreak_lower_is_better=tiebreak_lower_is_better,
        ):
            pts = compute_result_points(
                position=position,
                total_ranked=total,
                mark=positioned_items[0].marca if positioned_items else None,
                competition=comp,
                phase=phase,
            )
            for r in positioned_items:
                r.posicion = position
                r.puntos = int(pts)
                session.add(r)
    for r in without_metric:
        r.posicion = None
        r.puntos = 0
        session.add(r)


def _enrich(session: Session, result_id: int) -> dict:
    row = session.execute(text("""
        SELECT r.id, r.user_id, r.user_id AS user_id, r.team_id, r.competition_id, r.phase_id, r.marca, r.extra, r.tiebreak, r.puntos, r.posicion,
               r.result_status, r.appeal_deadline_at, r.created_at,
               ra.id AS active_appeal_id,
               ra.status AS active_appeal_status,
               p.nombre        AS nombre,
               p.apellido      AS apellido,
               TRIM(CONCAT(COALESCE(p.nombre, ''), ' ', COALESCE(p.apellido, ''))) AS user_name,
               p.categoria     AS categoria,
               c.nombre        AS competencia,
               t.nombre        AS equipo,
               ph.nombre       AS fase
        FROM results r
        LEFT JOIN participants       p  ON p.id  = r.user_id
        LEFT JOIN teams              t  ON t.id  = r.team_id
        JOIN  competitions           c  ON c.id  = r.competition_id
        LEFT JOIN competition_phases ph ON ph.id = r.phase_id
        LEFT JOIN LATERAL (
            SELECT id, status
            FROM result_appeals
            WHERE result_id = r.id
              AND status IN ('submitted', 'under_review', 'needs_evidence', 'escalated')
            ORDER BY created_at DESC, id DESC
            LIMIT 1
        ) ra ON true
        WHERE r.id = :rid
    """), {"rid": result_id}).mappings().one()
    return dict(row)


def _has_phase_duplicate(
    session: Session,
    *,
    competition_id: int,
    phase_id: int,
    user_id: int | None,
    team_id: int | None,
    exclude_result_id: int | None = None,
) -> bool:
    query = select(Result).where(
        Result.competition_id == competition_id,
        Result.phase_id == phase_id,
    )
    if exclude_result_id is not None:
        query = query.where(Result.id != exclude_result_id)
    if user_id is not None:
        query = query.where(Result.user_id == user_id)
    elif team_id is not None:
        query = query.where(Result.team_id == team_id)
    else:
        return False
    return session.exec(query).first() is not None


def _participant_team_in_competition(
    session: Session,
    *,
    competition_id: int,
    user_id: int,
) -> int | None:
    rows = session.exec(
        select(Team.id)
        .join(TeamMember, TeamMember.team_id == Team.id)
        .where(
            Team.competition_id == competition_id,
            TeamMember.user_id == user_id,
        )
    ).all()
    if not rows:
        return None
    if len(rows) > 1:
        raise HTTPException(409, "El usuario pertenece a multiples equipos en esta competencia")
    return int(rows[0])


@router.get("")
def list_results(
    competition_id: Optional[int] = None,
    user_id: Optional[int] = None,
    team_id: Optional[int] = None,
    session: Session = Depends(get_session),
    user=Depends(require_auth),
):
    resolved_user_id = user_id
    if _should_scope_to_authenticated_participant(user):
        resolved_user_id = get_effective_user_id(user)

    conditions: list[str] = []
    params: dict = {}

    if competition_id:
        require_competition_access(session, competition_id, user)
        conditions.append("r.competition_id = :cid")
        params["cid"] = competition_id
    else:
        if is_organizer_user(user):
            owned_ids = get_owned_competition_ids(session, user)
            if not owned_ids:
                return []
            conditions.append("r.competition_id = ANY(:owned_ids)")
            params["owned_ids"] = owned_ids

    if resolved_user_id:
        conditions.append("r.user_id = :uid")
        params["uid"] = resolved_user_id
    if team_id:
        conditions.append("r.team_id = :tid")
        params["tid"] = team_id

    where_clause = ("WHERE " + " AND ".join(conditions)) if conditions else ""

    rows = session.execute(text(f"""
        SELECT r.id, r.user_id, r.user_id AS user_id, r.team_id, r.competition_id, r.phase_id,
               r.marca, r.extra, r.tiebreak, r.puntos, r.posicion, r.result_status, r.appeal_deadline_at, r.created_at,
               ra.id AS active_appeal_id,
               ra.status AS active_appeal_status,
               p.nombre   AS nombre,
               p.apellido AS apellido,
               TRIM(CONCAT(COALESCE(p.nombre, ''), ' ', COALESCE(p.apellido, ''))) AS user_name,
               p.categoria AS categoria,
               c.nombre   AS competencia,
               t.nombre   AS equipo,
               ph.nombre  AS fase
        FROM results r
        LEFT JOIN participants       p  ON p.id  = r.user_id
        LEFT JOIN teams              t  ON t.id  = r.team_id
        JOIN      competitions       c  ON c.id  = r.competition_id
        LEFT JOIN competition_phases ph ON ph.id = r.phase_id
        LEFT JOIN LATERAL (
            SELECT id, status
            FROM result_appeals
            WHERE result_id = r.id
              AND status IN ('submitted', 'under_review', 'needs_evidence', 'escalated')
            ORDER BY created_at DESC, id DESC
            LIMIT 1
        ) ra ON true
        {where_clause}
        ORDER BY r.created_at DESC
    """), params).mappings().all()
    return [dict(r) for r in rows]


@router.post("", status_code=201)
def create_result(body: ResultCreate, session: Session = Depends(get_session), user=Depends(require_auth)):
    scoped_end_user = _should_scope_to_authenticated_participant(user)
    target_user_id = body.user_id
    if not target_user_id and not body.team_id:
        raise HTTPException(400, "Se requiere user_id o team_id")
    if not scoped_end_user:
        require_competition_access(session, body.competition_id, user)

    resolved_team_id = body.team_id
    computed_points: int | None = None
    computed_position: int | None = body.posicion
    computed_mark: int | None = body.marca if body.marca is not None else body.puntos

    if body.team_id:
        team = session.get(Team, body.team_id)
        if not team or team.competition_id != body.competition_id:
            raise HTTPException(400, "El equipo no pertenece a esta competencia")

    if target_user_id:
        enrolled = session.get(CompetitionParticipant, (body.competition_id, target_user_id))
        if not enrolled or enrolled.estado != "confirmado":
            raise HTTPException(403, "El usuario no está inscrito y confirmado en esta competencia")
        participant_team_id = _participant_team_in_competition(
            session, competition_id=body.competition_id, user_id=target_user_id
        )
        if resolved_team_id is None:
            resolved_team_id = participant_team_id
        elif participant_team_id is None or int(participant_team_id) != int(resolved_team_id):
            raise HTTPException(400, "El usuario no pertenece al equipo indicado")

    if scoped_end_user:
        current_participant_id = get_effective_user_id(user)
        if body.team_id:
            raise HTTPException(403, "Los usuarios no pueden cargar resultados de equipo")
        if current_participant_id is None or current_participant_id != target_user_id:
            raise HTTPException(403, "Solo puedes cargar tus propios resultados")

        comp = session.get(Competition, body.competition_id)
        if not comp or not comp.activa:
            raise HTTPException(403, "La competencia no está activa")
        if not comp.allow_user_results:
            raise HTTPException(403, "La carga de resultados por usuarios está deshabilitada")

    phase_mode = ""
    if body.phase_id:
        phase = session.get(CompetitionPhase, body.phase_id)
        if not phase or phase.competition_id != body.competition_id:
            raise HTTPException(400, "La fase no pertenece a esta competencia")
        phase_mode = _normalize_team_result_mode(getattr(phase, "team_result_mode", None))
        phase_type = _normalize_phase_type(phase.tipo)
        if phase_type not in PHASE_TIPOS_VALIDOS:
            raise HTTPException(400, "Tipo de fase invalido")
        if phase_type == "posicion" and computed_position is not None:
            computed_mark = int(computed_position)

        # simplified global flow: position + points are auto from mark
        if computed_mark is None:
            raise HTTPException(400, "Esta fase requiere un valor (marca) para calcular posicion y puntos")
        body.extra = _validate_time_cap_result(phase, computed_mark, body.extra)

        if phase_mode == "total" and resolved_team_id is None:
            raise HTTPException(400, "Esta fase requiere un resultado por equipo")

        duplicate_participant_id = target_user_id
        duplicate_team_id = resolved_team_id
        if phase_mode == "total" and resolved_team_id is not None:
            duplicate_participant_id = None

        if _has_phase_duplicate(
            session,
            competition_id=body.competition_id,
            phase_id=body.phase_id,
            user_id=duplicate_participant_id,
            team_id=duplicate_team_id,
        ):
            raise HTTPException(409, "Esta fase permite un solo resultado por participante/equipo")

    payload = body.model_dump()
    payload["user_id"] = target_user_id
    if phase_mode == "total" and resolved_team_id is not None:
        payload["user_id"] = None
    payload["team_id"] = resolved_team_id
    payload["marca"] = computed_mark
    if computed_points is not None:
        payload["puntos"] = int(computed_points)
    if computed_position is not None:
        payload["posicion"] = int(computed_position)
    payload["result_status"] = "valid"
    payload["appeal_deadline_at"] = appeal_deadline_from_now()
    result = Result.model_validate(payload)
    session.add(result)
    session.flush()
    if body.phase_id:
        _recompute_phase_positions_and_points(session, body.competition_id, int(body.phase_id))
        recompute_and_persist_phase_status(session, body.competition_id, int(body.phase_id))
    session.flush()
    session.refresh(result)
    notify_result_saved(session, result, updated=False)
    session.commit()
    session.refresh(result)
    invalidate_leaderboard_results_snapshot(body.competition_id)
    return _enrich(session, result.id)


@router.put("/{result_id}")
def update_result(result_id: int, body: ResultUpdate,
                  session: Session = Depends(get_session), user=Depends(require_staff)):
    r = session.get(Result, result_id)
    if not r:
        raise HTTPException(404, "Resultado no encontrado")
    require_competition_access(session, int(r.competition_id), user)
    prev_phase_id = int(r.phase_id) if r.phase_id is not None else None

    computed_points: int | None = None
    computed_position: int | None = body.posicion if body.posicion is not None else r.posicion
    computed_mark: int | None = body.marca if body.marca is not None else (body.puntos if body.puntos is not None else r.marca)
    computed_extra: int | None = body.extra if body.extra is not None else r.extra
    phase_id = body.phase_id if body.phase_id is not None else r.phase_id
    phase_mode = ""
    if phase_id:
        phase = session.get(CompetitionPhase, phase_id)
        if not phase or phase.competition_id != r.competition_id:
            raise HTTPException(400, "La fase no pertenece a esta competencia")
        phase_mode = _normalize_team_result_mode(getattr(phase, "team_result_mode", None))
        phase_type = _normalize_phase_type(phase.tipo)
        if phase_type not in PHASE_TIPOS_VALIDOS:
            raise HTTPException(400, "Tipo de fase invalido")
        if phase_type == "posicion" and computed_position is not None:
            computed_mark = int(computed_position)

        # simplified global flow: position + points are auto from mark
        if computed_mark is None:
            raise HTTPException(400, "Esta fase requiere un valor (marca) para calcular posicion y puntos")
        computed_extra = _validate_time_cap_result(phase, computed_mark, computed_extra)

        if phase_mode == "total" and r.team_id is None:
            raise HTTPException(400, "Esta fase requiere un resultado por equipo")

        duplicate_participant_id = r.user_id
        duplicate_team_id = r.team_id
        if phase_mode == "total" and r.team_id is not None:
            duplicate_participant_id = None

        if body.phase_id is not None and _has_phase_duplicate(
            session,
            competition_id=r.competition_id,
            phase_id=phase_id,
            user_id=duplicate_participant_id,
            team_id=duplicate_team_id,
            exclude_result_id=r.id,
        ):
            raise HTTPException(409, "Esta fase permite un solo resultado por participante/equipo")

    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(r, field, value)
    if phase_mode == "total" and r.team_id is not None:
        r.user_id = None
    r.marca = computed_mark
    r.extra = computed_extra
    if computed_points is not None:
        r.puntos = int(computed_points)
    if computed_position is not None:
        r.posicion = int(computed_position)

    session.add(r)
    session.flush()
    if phase_id:
        _recompute_phase_positions_and_points(session, r.competition_id, int(phase_id))
        recompute_and_persist_phase_status(session, r.competition_id, int(phase_id))
    if prev_phase_id is not None and (phase_id is None or int(phase_id) != prev_phase_id):
        _recompute_phase_positions_and_points(session, r.competition_id, prev_phase_id)
        recompute_and_persist_phase_status(session, r.competition_id, prev_phase_id)
    session.flush()
    session.refresh(r)
    notify_result_saved(session, r, updated=True)
    session.commit()
    invalidate_leaderboard_results_snapshot(r.competition_id)
    return _enrich(session, result_id)


@router.delete("/{result_id}", status_code=204)
def delete_result(result_id: int, session: Session = Depends(get_session), user=Depends(require_staff)):
    r = session.get(Result, result_id)
    if r:
        require_competition_access(session, int(r.competition_id), user)
        competition_id = int(r.competition_id)
        phase_id = int(r.phase_id) if r.phase_id is not None else None
        session.delete(r)
        session.flush()
        if phase_id is not None:
            recompute_and_persist_phase_status(session, competition_id, phase_id)
        session.commit()
        invalidate_leaderboard_results_snapshot(competition_id)


@router.delete("/competition/{competition_id}/phase/{phase_id}")
def delete_results_by_phase(
    competition_id: int,
    phase_id: int,
    session: Session = Depends(get_session),
    user=Depends(require_staff),
):
    require_competition_access(session, competition_id, user)

    phase = session.get(CompetitionPhase, phase_id)
    if not phase or int(phase.competition_id) != int(competition_id):
        raise HTTPException(404, "Fase no encontrada en esta competencia")

    deleted = session.execute(
        text("""
            DELETE FROM results
            WHERE competition_id = :cid
              AND phase_id = :pid
        """),
        {"cid": competition_id, "pid": phase_id},
    ).rowcount or 0

    recompute_and_persist_phase_status(session, competition_id)
    session.commit()
    invalidate_leaderboard_results_snapshot(competition_id)
    return {"deleted": int(deleted)}


@router.delete("/competition/{competition_id}")
def delete_results_by_competition(
    competition_id: int,
    session: Session = Depends(get_session),
    user=Depends(require_staff),
):
    require_competition_access(session, competition_id, user)

    deleted = session.execute(
        text("""
            DELETE FROM results
            WHERE competition_id = :cid
        """),
        {"cid": competition_id},
    ).rowcount or 0

    recompute_and_persist_phase_status(session, competition_id)
    session.commit()
    invalidate_leaderboard_results_snapshot(competition_id)
    return {"deleted": int(deleted)}
