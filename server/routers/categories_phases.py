from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select

from access import require_competition_access
from auth import get_current_user_optional, require_staff
from database import get_session
from phase_status import compute_phase_status_map
from models import (
    Competition, CompetitionCategory, CompetitionPhase,
    CategoryCreate, PhaseCreate, PhaseUpdate,
)

router = APIRouter(tags=["categories_phases"])
PHASE_TIPOS_VALIDOS = {"posicion", "cantidad", "tiempo"}
PHASE_ESTADOS_VALIDOS = {"pendiente", "en_progreso", "finalizada"}
PHASE_TEAM_MODES_VALIDOS = {"sum_two", "single_member", "total"}
PHASE_POINTS_MODES_VALIDOS = {"manual", "position_direct", "position_rules"}
PHASE_WINNER_RULES_VALIDOS = {"higher_wins", "lower_wins"}
PHASE_MEASUREMENT_METHODS_VALIDOS = {"unidades", "metros", "tiempo_hms", "repeticiones", "kilogramos", "gramos", "libras", "posicion"}
PHASE_TIPO_ALIAS = {
    "puntos": "cantidad",
    "peso": "cantidad",
    "posicion": "posicion",
    "posici\u00f3n": "posicion",
}
PHASE_WINNER_ALIAS = {
    "mayor_gana": "higher_wins",
    "gana_mayor": "higher_wins",
    "higher": "higher_wins",
    "menor_gana": "lower_wins",
    "gana_menor": "lower_wins",
    "lower": "lower_wins",
}
PHASE_MEASUREMENT_ALIAS = {
    "unidad": "unidades",
    "unidades": "unidades",
    "metros": "metros",
    "metro": "metros",
    "tiempo": "tiempo_hms",
    "hh:mm:ss": "tiempo_hms",
    "hms": "tiempo_hms",
    "tiempo_hms": "tiempo_hms",
    "reps": "repeticiones",
    "rep": "repeticiones",
    "repeticiones": "repeticiones",
    "kg": "kilogramos",
    "kilogramos": "kilogramos",
    "g": "gramos",
    "gramos": "gramos",
    "lb": "libras",
    "lbs": "libras",
    "libras": "libras",
    "posicion": "posicion",
    "posición": "posicion",
}


def _normalize_phase_type(raw: str | None) -> str:
    value = (raw or "").strip().lower()
    value = PHASE_TIPO_ALIAS.get(value, value)
    return value


def _default_winner_rule_for_type(phase_type: str | None) -> str:
    if phase_type in {"tiempo", "posicion"}:
        return "lower_wins"
    return "higher_wins"


def _default_measurement_method_for_type(phase_type: str | None) -> str:
    if phase_type == "tiempo":
        return "tiempo_hms"
    if phase_type == "posicion":
        return "posicion"
    return "unidades"


def _type_from_measurement_method(method: str | None) -> str:
    m = (method or "").strip().lower()
    if m in {"tiempo_hms"}:
        return "tiempo"
    if m in {"posicion"}:
        return "posicion"
    return "cantidad"


def _normalize_winner_rule(raw: str | None, phase_type: str | None) -> str:
    value = (raw or "").strip().lower()
    value = PHASE_WINNER_ALIAS.get(value, value)
    if not value:
        return _default_winner_rule_for_type(phase_type)
    return value


def _normalize_measurement_method(raw: str | None, phase_type: str | None) -> str:
    value = (raw or "").strip().lower()
    value = PHASE_MEASUREMENT_ALIAS.get(value, value)
    if not value:
        return _default_measurement_method_for_type(phase_type)
    return value


def _normalize_phase_status(raw: str | None) -> str:
    value = (raw or "").strip().lower()
    if value == "en progreso":
        return "en_progreso"
    return value


def _normalize_team_mode(raw: str | None) -> str:
    value = (raw or "").strip().lower()
    if value in {"ambos", "suma", "sum", "sumatoria"}:
        return "sum_two"
    if value in {"total", "equipo_total", "team_total"}:
        return "total"
    if value in {"uno", "single", "single_member"}:
        return "single_member"
    return value


def _normalize_points_mode(raw: str | None) -> str:
    value = (raw or "").strip().lower()
    if value in {"manual", "normal"}:
        return "manual"
    if value in {"position_direct", "posicion_directa", "posicion", "inversa"}:
        return "position_direct"
    if value in {"position_rules", "reglas", "rules"}:
        return "position_rules"
    return value


@router.get("/api/competitions/{competition_id}/categories")
def list_categories(
    competition_id: int,
    session: Session = Depends(get_session),
    user=Depends(get_current_user_optional),
):
    require_competition_access(session, competition_id, user)
    return session.exec(
        select(CompetitionCategory)
        .where(CompetitionCategory.competition_id == competition_id)
        .order_by(CompetitionCategory.orden, CompetitionCategory.nombre)
    ).all()


@router.post("/api/competitions/{competition_id}/categories", status_code=201)
def create_category(competition_id: int, body: CategoryCreate,
                    session: Session = Depends(get_session), user=Depends(require_staff)):
    require_competition_access(session, competition_id, user)
    cat = CompetitionCategory(competition_id=competition_id, nombre=body.nombre, orden=body.orden)
    session.add(cat)
    session.commit()
    session.refresh(cat)
    return cat


@router.delete("/api/competitions/{competition_id}/categories/{cat_id}", status_code=204)
def delete_category(competition_id: int, cat_id: int,
                    session: Session = Depends(get_session), user=Depends(require_staff)):
    require_competition_access(session, competition_id, user)
    cat = session.get(CompetitionCategory, cat_id)
    if cat and cat.competition_id == competition_id:
        session.delete(cat)
        session.commit()


@router.get("/api/competitions/{competition_id}/phases")
def list_phases(
    competition_id: int,
    estado: Optional[str] = None,
    session: Session = Depends(get_session),
    user=Depends(get_current_user_optional),
):
    require_competition_access(session, competition_id, user)
    auto_status = compute_phase_status_map(session, competition_id)
    items = session.exec(
        select(CompetitionPhase)
        .where(CompetitionPhase.competition_id == competition_id)
        .order_by(CompetitionPhase.orden, CompetitionPhase.id)
    ).all()
    for ph in items:
        next_state = auto_status.get(int(ph.id))
        if next_state:
            ph.estado = next_state
    if estado:
        normalized = _normalize_phase_status(estado)
        items = [ph for ph in items if (ph.estado or "").strip().lower() == normalized]
    return items


@router.post("/api/competitions/{competition_id}/phases", status_code=201)
def create_phase(competition_id: int, body: PhaseCreate,
                 session: Session = Depends(get_session), user=Depends(require_staff)):
    require_competition_access(session, competition_id, user)
    phase_type = _normalize_phase_type(body.tipo)
    if phase_type not in PHASE_TIPOS_VALIDOS:
        raise HTTPException(400, "Tipo de fase invalido. Usa: posicion, cantidad o tiempo")
    measurement_method = _normalize_measurement_method(body.measurement_method, phase_type)
    if measurement_method not in PHASE_MEASUREMENT_METHODS_VALIDOS:
        raise HTTPException(400, "measurement_method invalido")
    phase_type = _type_from_measurement_method(measurement_method)
    phase_status = _normalize_phase_status(body.estado)
    if phase_status not in PHASE_ESTADOS_VALIDOS:
        raise HTTPException(400, "Estado de fase invalido. Usa: pendiente, en_progreso o finalizada")
    team_mode = _normalize_team_mode(body.team_result_mode)
    if team_mode not in PHASE_TEAM_MODES_VALIDOS:
        raise HTTPException(400, "Modo de resultado de equipo invalido. Usa: sum_two, total o single_member")
    points_mode = _normalize_points_mode(body.points_mode)
    if points_mode not in PHASE_POINTS_MODES_VALIDOS:
        raise HTTPException(400, "Modo de puntos invalido. Usa: manual, position_direct o position_rules")
    winner_rule = _normalize_winner_rule(body.winner_rule, phase_type)
    if winner_rule not in PHASE_WINNER_RULES_VALIDOS:
        raise HTTPException(400, "winner_rule invalido. Usa: higher_wins o lower_wins")
    phase = CompetitionPhase(
        competition_id=competition_id,
        nombre=body.nombre,
        descripcion=body.descripcion,
        tipo=phase_type,
        measurement_method=measurement_method,
        winner_rule=winner_rule,
        scoring_rules=body.scoring_rules,
        points_mode=points_mode,
        allow_multiple_results=1 if body.allow_multiple_results else 0,
        team_result_mode=team_mode,
        estado=phase_status,
        orden=body.orden,
    )
    session.add(phase)
    session.commit()
    session.refresh(phase)
    return phase


@router.put("/api/competitions/{competition_id}/phases/{phase_id}")
def update_phase(competition_id: int, phase_id: int, body: PhaseUpdate,
                 session: Session = Depends(get_session), user=Depends(require_staff)):
    require_competition_access(session, competition_id, user)
    phase = session.get(CompetitionPhase, phase_id)
    if not phase or phase.competition_id != competition_id:
        raise HTTPException(404, "Fase no encontrada")
    data = body.model_dump(exclude_unset=True)
    if "tipo" in data:
        data["tipo"] = _normalize_phase_type(data["tipo"])
        if data["tipo"] not in PHASE_TIPOS_VALIDOS:
            raise HTTPException(400, "Tipo de fase invalido. Usa: posicion, cantidad o tiempo")
    if "measurement_method" in data:
        data["measurement_method"] = _normalize_measurement_method(data["measurement_method"], data.get("tipo", phase.tipo))
        if data["measurement_method"] not in PHASE_MEASUREMENT_METHODS_VALIDOS:
            raise HTTPException(400, "measurement_method invalido")
        data["tipo"] = _type_from_measurement_method(data["measurement_method"])
    elif "tipo" in data:
        data["measurement_method"] = _default_measurement_method_for_type(data["tipo"])
    if "winner_rule" in data:
        data["winner_rule"] = _normalize_winner_rule(data["winner_rule"], data.get("tipo", phase.tipo))
        if data["winner_rule"] not in PHASE_WINNER_RULES_VALIDOS:
            raise HTTPException(400, "winner_rule invalido. Usa: higher_wins o lower_wins")
    elif "tipo" in data:
        data["winner_rule"] = _default_winner_rule_for_type(data["tipo"])
    if "allow_multiple_results" in data:
        data["allow_multiple_results"] = 1 if data["allow_multiple_results"] else 0
    if "team_result_mode" in data:
        data["team_result_mode"] = _normalize_team_mode(data["team_result_mode"])
        if data["team_result_mode"] not in PHASE_TEAM_MODES_VALIDOS:
            raise HTTPException(400, "Modo de resultado de equipo invalido. Usa: sum_two, total o single_member")
    if "points_mode" in data:
        data["points_mode"] = _normalize_points_mode(data["points_mode"])
        if data["points_mode"] not in PHASE_POINTS_MODES_VALIDOS:
            raise HTTPException(400, "Modo de puntos invalido. Usa: manual, position_direct o position_rules")
    if "estado" in data:
        data["estado"] = _normalize_phase_status(data["estado"])
        if data["estado"] not in PHASE_ESTADOS_VALIDOS:
            raise HTTPException(400, "Estado de fase invalido. Usa: pendiente, en_progreso o finalizada")
    for field, value in data.items():
        setattr(phase, field, value)
    session.add(phase)
    session.commit()
    session.refresh(phase)
    return phase


@router.delete("/api/competitions/{competition_id}/phases/{phase_id}", status_code=204)
def delete_phase(competition_id: int, phase_id: int,
                 session: Session = Depends(get_session), user=Depends(require_staff)):
    require_competition_access(session, competition_id, user)
    phase = session.get(CompetitionPhase, phase_id)
    if phase and phase.competition_id == competition_id:
        session.delete(phase)
        session.commit()
