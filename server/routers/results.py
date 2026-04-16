from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import text
from sqlmodel import Session, select

from access import get_owned_competition_ids, is_organizer_user, require_competition_access
from auth import get_effective_participant_id, is_end_user, require_auth, require_staff
from database import get_session
from models import Result, ResultCreate, ResultUpdate, Competition, CompetitionParticipant, CompetitionPhase, Team, TeamMember
from phase_status import recompute_and_persist_phase_status

router = APIRouter(prefix="/api/results", tags=["results"])
PHASE_TIPOS_VALIDOS = {"posicion", "cantidad", "tiempo"}
PHASE_TIPO_ALIAS = {
    "puntos": "cantidad",
    "peso": "cantidad",
    "posici\u00f3n": "posicion",
}
PHASE_POINTS_MODES_VALIDOS = {"manual", "position_direct", "position_rules"}
PHASE_WINNER_RULES_VALIDOS = {"higher_wins", "lower_wins"}


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
            CompetitionParticipant.participant_id.in_(participant_ids),
        )
    ).all()
    out: dict[int, str] = {}
    for cp in rows:
        out[int(cp.participant_id)] = _normalize_category(cp.categoria)
    return out


def _team_categories_map(session: Session, competition_id: int, team_ids: set[int]) -> dict[int, str]:
    if not team_ids:
        return {}
    members = session.exec(
        select(TeamMember).where(TeamMember.team_id.in_(team_ids))
    ).all()
    participant_ids = {int(m.participant_id) for m in members}
    participant_category = _participant_categories_map(session, competition_id, participant_ids)

    team_categories: dict[int, set[str]] = {}
    for m in members:
        tid = int(m.team_id)
        pid = int(m.participant_id)
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
    score_lower_is_better = (getattr(comp, "scoring_mode", "highest_wins") == "lowest_wins")

    rows = session.exec(
        select(Result)
        .where(Result.competition_id == competition_id, Result.phase_id == phase_id)
        .order_by(Result.id)
    ).all()
    if not rows:
        return

    rank_by_category = _competition_has_categories(session, competition_id)
    phase_mode = ((getattr(phase, "team_result_mode", None) or "").strip().lower()) if phase else ""
    is_team_entity_phase = phase_mode in {"sum_two", "single_member"}

    # Team-based phases: rank by team, then propagate same position/points to member rows.
    if is_team_entity_phase:
        team_rows = [r for r in rows if r.team_id is not None]
        non_team_rows = [r for r in rows if r.team_id is None]

        grouped: dict[int, list[Result]] = {}
        for r in team_rows:
            grouped.setdefault(int(r.team_id), []).append(r)

        team_category = _team_categories_map(session, competition_id, set(grouped.keys())) if rank_by_category else {}
        entities_by_category: dict[str, list[tuple[int, int, list[Result]]]] = {}
        for team_id, items in grouped.items():
            marks = [int(x.marca) for x in items if x.marca is not None]
            if not marks:
                continue
            if phase_mode == "single_member":
                team_mark = min(marks) if lower_is_better else max(marks)
            else:
                team_mark = sum(marks)
            category = team_category.get(team_id, "Sin categoria") if rank_by_category else "__global__"
            entities_by_category.setdefault(category, []).append((team_id, team_mark, items))

        ranked_team_ids = set()
        for category_entities in entities_by_category.values():
            category_entities.sort(key=lambda x: x[1], reverse=not lower_is_better)
            total = len(category_entities)
            for idx, (team_id, _team_mark, items) in enumerate(category_entities, 1):
                ranked_team_ids.add(team_id)
                pts = idx if score_lower_is_better else (total - idx + 1)
                for r in items:
                    r.posicion = idx
                    r.puntos = int(pts)
                    session.add(r)

        for team_id, items in grouped.items():
            if team_id in ranked_team_ids:
                continue
            for r in items:
                r.posicion = None
                session.add(r)

        # Keep legacy non-team rows harmless in this mode.
        for r in non_team_rows:
            r.posicion = None
            session.add(r)
        return

    # Default row-based ranking (individual or team total with one row per team).
    with_metric = [r for r in rows if r.marca is not None]
    without_metric = [r for r in rows if r.marca is None]
    if rank_by_category:
        participant_ids = {int(r.participant_id) for r in with_metric if r.participant_id is not None}
        team_ids = {int(r.team_id) for r in with_metric if r.team_id is not None and r.participant_id is None}
        participant_category = _participant_categories_map(session, competition_id, participant_ids)
        team_category = _team_categories_map(session, competition_id, team_ids)

        grouped_rows: dict[str, list[Result]] = {}
        for r in with_metric:
            if r.participant_id is not None:
                category = participant_category.get(int(r.participant_id), "Sin categoria")
            elif r.team_id is not None:
                category = team_category.get(int(r.team_id), "Sin categoria")
            else:
                category = "Sin categoria"
            grouped_rows.setdefault(category, []).append(r)

        for category_rows in grouped_rows.values():
            category_rows.sort(key=lambda rr: int(rr.marca), reverse=not lower_is_better)
            total = len(category_rows)
            for idx, r in enumerate(category_rows, 1):
                r.posicion = idx
                r.puntos = idx if score_lower_is_better else (total - idx + 1)
                session.add(r)
    else:
        with_metric.sort(key=lambda r: int(r.marca), reverse=not lower_is_better)
        total = len(with_metric)
        for idx, r in enumerate(with_metric, 1):
            r.posicion = idx
            r.puntos = idx if score_lower_is_better else (total - idx + 1)
            session.add(r)
    for r in without_metric:
        r.posicion = None
        session.add(r)


def _enrich(session: Session, result_id: int) -> dict:
    row = session.execute(text("""
        SELECT r.id, r.participant_id, r.team_id, r.competition_id, r.phase_id, r.marca, r.puntos, r.posicion, r.created_at,
               p.nombre        AS nombre,
               p.apellido      AS apellido,
               p.categoria     AS categoria,
               c.nombre        AS competencia,
               t.nombre        AS equipo,
               ph.nombre       AS fase
        FROM results r
        LEFT JOIN participants       p  ON p.id  = r.participant_id
        LEFT JOIN teams              t  ON t.id  = r.team_id
        JOIN  competitions           c  ON c.id  = r.competition_id
        LEFT JOIN competition_phases ph ON ph.id = r.phase_id
        WHERE r.id = :rid
    """), {"rid": result_id}).mappings().one()
    return dict(row)


def _has_phase_duplicate(
    session: Session,
    *,
    competition_id: int,
    phase_id: int,
    participant_id: int | None,
    team_id: int | None,
    exclude_result_id: int | None = None,
) -> bool:
    query = select(Result).where(
        Result.competition_id == competition_id,
        Result.phase_id == phase_id,
    )
    if exclude_result_id is not None:
        query = query.where(Result.id != exclude_result_id)
    if participant_id is not None:
        query = query.where(Result.participant_id == participant_id)
    elif team_id is not None:
        query = query.where(Result.team_id == team_id)
    else:
        return False
    return session.exec(query).first() is not None


def _participant_team_in_competition(
    session: Session,
    *,
    competition_id: int,
    participant_id: int,
) -> int | None:
    rows = session.exec(
        select(Team.id)
        .join(TeamMember, TeamMember.team_id == Team.id)
        .where(
            Team.competition_id == competition_id,
            TeamMember.participant_id == participant_id,
        )
    ).all()
    if not rows:
        return None
    if len(rows) > 1:
        raise HTTPException(409, "El participante pertenece a multiples equipos en esta competencia")
    return int(rows[0])


@router.get("")
def list_results(
    competition_id: Optional[int] = None,
    participant_id: Optional[int] = None,
    team_id: Optional[int] = None,
    session: Session = Depends(get_session),
    user=Depends(require_auth),
):
    if is_end_user(user):
        participant_id = get_effective_participant_id(user)

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

    if participant_id:
        conditions.append("r.participant_id = :pid")
        params["pid"] = participant_id
    if team_id:
        conditions.append("r.team_id = :tid")
        params["tid"] = team_id

    where_clause = ("WHERE " + " AND ".join(conditions)) if conditions else ""

    rows = session.execute(text(f"""
        SELECT r.id, r.participant_id, r.team_id, r.competition_id, r.phase_id,
               r.marca, r.puntos, r.posicion, r.created_at,
               p.nombre   AS nombre,
               p.apellido AS apellido,
               p.categoria AS categoria,
               c.nombre   AS competencia,
               t.nombre   AS equipo,
               ph.nombre  AS fase
        FROM results r
        LEFT JOIN participants       p  ON p.id  = r.participant_id
        LEFT JOIN teams              t  ON t.id  = r.team_id
        JOIN      competitions       c  ON c.id  = r.competition_id
        LEFT JOIN competition_phases ph ON ph.id = r.phase_id
        {where_clause}
        ORDER BY r.created_at DESC
    """), params).mappings().all()
    return [dict(r) for r in rows]


@router.post("", status_code=201)
def create_result(body: ResultCreate, session: Session = Depends(get_session), user=Depends(require_auth)):
    if not body.participant_id and not body.team_id:
        raise HTTPException(400, "Se requiere participant_id o team_id")
    if not is_end_user(user):
        require_competition_access(session, body.competition_id, user)

    resolved_team_id = body.team_id
    computed_points: int | None = None
    computed_position: int | None = body.posicion
    computed_mark: int | None = body.marca if body.marca is not None else body.puntos

    if body.team_id:
        team = session.get(Team, body.team_id)
        if not team or team.competition_id != body.competition_id:
            raise HTTPException(400, "El equipo no pertenece a esta competencia")

    if body.participant_id:
        enrolled = session.get(CompetitionParticipant, (body.competition_id, body.participant_id))
        if not enrolled or enrolled.estado != "confirmado":
            raise HTTPException(403, "El participante no está inscrito y confirmado en esta competencia")
        participant_team_id = _participant_team_in_competition(
            session, competition_id=body.competition_id, participant_id=body.participant_id
        )
        if resolved_team_id is None:
            resolved_team_id = participant_team_id
        elif participant_team_id is None or int(participant_team_id) != int(resolved_team_id):
            raise HTTPException(400, "El participante no pertenece al equipo indicado")

    if is_end_user(user):
        current_participant_id = get_effective_participant_id(user)
        if body.team_id:
            raise HTTPException(403, "Los usuarios no pueden cargar resultados de equipo")
        if current_participant_id is None or current_participant_id != body.participant_id:
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

        if phase_mode == "total" and resolved_team_id is None:
            raise HTTPException(400, "Esta fase requiere un resultado por equipo")

        duplicate_participant_id = body.participant_id
        duplicate_team_id = resolved_team_id
        if phase_mode == "total" and resolved_team_id is not None:
            duplicate_participant_id = None

        if not phase.allow_multiple_results and _has_phase_duplicate(
            session,
            competition_id=body.competition_id,
            phase_id=body.phase_id,
            participant_id=duplicate_participant_id,
            team_id=duplicate_team_id,
        ):
            raise HTTPException(409, "Esta fase permite un solo resultado por participante/equipo")

    payload = body.model_dump()
    if phase_mode == "total" and resolved_team_id is not None:
        payload["participant_id"] = None
    payload["team_id"] = resolved_team_id
    payload["marca"] = computed_mark
    if computed_points is not None:
        payload["puntos"] = int(computed_points)
    if computed_position is not None:
        payload["posicion"] = int(computed_position)
    result = Result.model_validate(payload)
    session.add(result)
    session.flush()
    if body.phase_id:
        _recompute_phase_positions_and_points(session, body.competition_id, int(body.phase_id))
        recompute_and_persist_phase_status(session, body.competition_id, int(body.phase_id))
    session.commit()
    session.refresh(result)
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

        if phase_mode == "total" and r.team_id is None:
            raise HTTPException(400, "Esta fase requiere un resultado por equipo")

        duplicate_participant_id = r.participant_id
        duplicate_team_id = r.team_id
        if phase_mode == "total" and r.team_id is not None:
            duplicate_participant_id = None

        if body.phase_id is not None and not phase.allow_multiple_results and _has_phase_duplicate(
            session,
            competition_id=r.competition_id,
            phase_id=phase_id,
            participant_id=duplicate_participant_id,
            team_id=duplicate_team_id,
            exclude_result_id=r.id,
        ):
            raise HTTPException(409, "Esta fase permite un solo resultado por participante/equipo")

    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(r, field, value)
    if phase_mode == "total" and r.team_id is not None:
        r.participant_id = None
    r.marca = computed_mark
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
    session.commit()
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
    return {"deleted": int(deleted)}
