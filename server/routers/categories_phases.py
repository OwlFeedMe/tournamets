from typing import Optional

import json

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select

from access import require_competition_access
from auth import get_current_user_optional, require_staff
from database import get_session
from phase_status import compute_phase_status_map
from constants import MedicionFase
from competition_rules import (
    PHASE_MEASUREMENT_METHODS_ALLOWED,
    default_measurement_method_for_type,
    normalize_phase_measurement_method,
    normalize_phase_visibility,
    type_from_measurement_method,
)
from models import (
    CompetitionCategory, CompetitionPhase,
    CategoryCreate, CategoryUpdate, PhaseCreate, PhaseUpdate,
    CompetitionHeat,
)

router = APIRouter(tags=["categories_phases"])
PHASE_FORMATS_VALIDOS = {"activity", "wod"}
PHASE_TIPOS_VALIDOS = {"posicion", "cantidad", "tiempo"}
PHASE_ESTADOS_VALIDOS = {"pendiente", "en_progreso", "finalizada"}
PHASE_TEAM_MODES_VALIDOS = {"sum_two", "single_member", "total"}
PHASE_POINTS_MODES_VALIDOS = {"manual", "position_direct", "position_rules"}
PHASE_WINNER_RULES_VALIDOS = {"higher_wins", "lower_wins"}
PHASE_MEASUREMENT_METHODS_VALIDOS = PHASE_MEASUREMENT_METHODS_ALLOWED
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
PHASE_MEASUREMENT_ALIAS = MedicionFase.ALIAS
MODALITY_VALIDOS = {"individual", "teams"}
MODALITY_ALIAS = {
    "individual": "individual",
    "individuales": "individual",
    "user": "individual",
    "teams": "teams",
    "team": "teams",
    "equipo": "teams",
    "equipos": "teams",
    "por_equipo": "teams",
}


def _normalize_phase_type(raw: str | None) -> str:
    value = (raw or "").strip().lower()
    value = PHASE_TIPO_ALIAS.get(value, value)
    return value


def _normalize_phase_format(raw: str | None) -> str:
    value = (raw or "").strip().lower()
    if value in {"actividad", "activity"}:
        return "activity"
    if value in {"wod", "workout"}:
        return "wod"
    return value or "activity"


def _phase_format_from_count(count: int) -> str:
    return "wod" if count > 1 else "activity"


def _default_winner_rule_for_type(phase_type: str | None) -> str:
    if phase_type in {"tiempo", "posicion"}:
        return "lower_wins"
    return "higher_wins"


def _normalize_winner_rule(raw: str | None, phase_type: str | None) -> str:
    value = (raw or "").strip().lower()
    value = PHASE_WINNER_ALIAS.get(value, value)
    if not value:
        return _default_winner_rule_for_type(phase_type)
    return value


def _normalize_measurement_method(raw: str | None, phase_type: str | None) -> str:
    return normalize_phase_measurement_method(raw, phase_type)


def _normalize_phase_status(raw: str | None) -> str:
    value = (raw or "").strip().lower()
    if value == "en progreso":
        return "en_progreso"
    return value


def _normalize_modality(raw: str | None) -> str:
    value = (raw or "").strip().lower()
    value = MODALITY_ALIAS.get(value, value)
    return value if value in MODALITY_VALIDOS else "individual"


def _normalize_enrollment_price(raw: object) -> int:
    try:
        value = int(raw if raw is not None else 0)
    except Exception:
        value = 0
    return max(0, value)


def _normalize_block_name(raw: str | None) -> str | None:
    value = (raw or "").strip()
    return value or None


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


def _serialize_phase_activities(
    activities: list[dict] | None,
    *,
    fallback_tipo: str,
    fallback_measurement_method: str,
    fallback_winner_rule: str,
    fallback_points_mode: str,
) -> str | None:
    cleaned: list[dict] = []
    for idx, item in enumerate(activities or []):
        if not isinstance(item, dict):
            continue
        name = str(item.get("nombre") or item.get("name") or "").strip() or f"Actividad {idx + 1}"
        activity_type = _normalize_phase_type(item.get("tipo"))
        if activity_type not in PHASE_TIPOS_VALIDOS:
            activity_type = fallback_tipo
        measurement_method = _normalize_measurement_method(item.get("measurement_method"), activity_type)
        if measurement_method not in PHASE_MEASUREMENT_METHODS_VALIDOS:
            measurement_method = fallback_measurement_method
        activity_type = type_from_measurement_method(measurement_method)
        winner_rule = _normalize_winner_rule(item.get("winner_rule"), activity_type)
        if winner_rule not in PHASE_WINNER_RULES_VALIDOS:
            winner_rule = fallback_winner_rule
        points_mode = _normalize_points_mode(item.get("points_mode"))
        if points_mode not in PHASE_POINTS_MODES_VALIDOS:
            points_mode = fallback_points_mode
        scoring_rules = item.get("scoring_rules")
        if scoring_rules is not None and not isinstance(scoring_rules, str):
            try:
                scoring_rules = json.dumps(scoring_rules, ensure_ascii=False)
            except Exception:
                scoring_rules = None
        serialized_item = {
            "nombre": name,
            "descripcion": str(item.get("descripcion") or "").strip() or None,
            "tipo": activity_type,
            "measurement_method": measurement_method,
            "winner_rule": winner_rule,
            "points_mode": points_mode,
            "scoring_rules": scoring_rules,
            "orden": int(item.get("orden") or idx),
        }
        # Preserve optional category-specific override metadata used by the app UI.
        if item.get("_cat") is not None:
            serialized_item["_cat"] = str(item.get("_cat")).strip() or None
        if item.get("_cat_name") is not None:
            serialized_item["_cat_name"] = str(item.get("_cat_name")).strip() or None
        if item.get("time_cap") is not None:
            try:
                serialized_item["time_cap"] = int(item.get("time_cap"))
            except Exception:
                serialized_item["time_cap"] = None
        if item.get("part_b_descripcion") is not None:
            serialized_item["part_b_descripcion"] = str(item.get("part_b_descripcion") or "").strip() or None
        if item.get("part_b_time_cap") is not None:
            try:
                serialized_item["part_b_time_cap"] = int(item.get("part_b_time_cap"))
            except Exception:
                serialized_item["part_b_time_cap"] = None
        cleaned.append(serialized_item)
    return json.dumps(cleaned, ensure_ascii=False) if cleaned else None


def _build_default_phase_activity(
    *,
    phase_name: str | None,
    description: str | None,
    phase_type: str,
    measurement_method: str,
    winner_rule: str,
    points_mode: str,
    scoring_rules: str | None = None,
) -> list[dict]:
    return [{
        "nombre": (phase_name or "").strip() or "Actividad 1",
        "descripcion": (description or "").strip() or None,
        "tipo": phase_type,
        "measurement_method": measurement_method,
        "winner_rule": winner_rule,
        "points_mode": points_mode,
        "scoring_rules": scoring_rules,
        "orden": 0,
    }]


def _coerce_phase_activities(
    activities: list[dict] | None,
    *,
    phase_name: str | None,
    description: str | None,
    phase_type: str,
    measurement_method: str,
    winner_rule: str,
    points_mode: str,
    scoring_rules: str | None = None,
) -> tuple[str, list[dict]]:
    serialized = _serialize_phase_activities(
        activities,
        fallback_tipo=phase_type,
        fallback_measurement_method=measurement_method,
        fallback_winner_rule=winner_rule,
        fallback_points_mode=points_mode,
    )
    if serialized:
        try:
            parsed = json.loads(serialized)
            if isinstance(parsed, list) and parsed:
                return serialized, [dict(item) for item in parsed if isinstance(item, dict)]
        except Exception:
            pass
    fallback_items = _build_default_phase_activity(
        phase_name=phase_name,
        description=description,
        phase_type=phase_type,
        measurement_method=measurement_method,
        winner_rule=winner_rule,
        points_mode=points_mode,
        scoring_rules=scoring_rules,
    )
    return json.dumps(fallback_items, ensure_ascii=False), fallback_items


def _parse_phase_activities(phase: CompetitionPhase) -> list[dict]:
    raw = getattr(phase, "activities", None)
    parsed: list[dict] = []
    if raw:
        try:
            data = json.loads(raw)
            if isinstance(data, list):
                parsed = [dict(item) for item in data if isinstance(item, dict)]
        except Exception:
            parsed = []
    if parsed:
        normalized_items: list[dict] = []
        for item in parsed:
            measurement_method = _normalize_measurement_method(item.get("measurement_method"), item.get("tipo"))
            normalized_items.append({
                **item,
                "measurement_method": measurement_method,
                "tipo": type_from_measurement_method(measurement_method),
            })
        return normalized_items
    return [{
        "nombre": phase.nombre,
        "descripcion": phase.descripcion,
        "tipo": type_from_measurement_method(getattr(phase, "measurement_method", None)),
        "measurement_method": _normalize_measurement_method(getattr(phase, "measurement_method", None), getattr(phase, "tipo", None)),
        "winner_rule": getattr(phase, "winner_rule", None),
        "points_mode": getattr(phase, "points_mode", None),
        "scoring_rules": getattr(phase, "scoring_rules", None),
        "orden": 0,
    }]


def _phase_response(phase: CompetitionPhase) -> dict:
    payload = phase.model_dump()
    payload["modality"] = _normalize_modality(getattr(phase, "modality", None))
    payload["block_name"] = _normalize_block_name(getattr(phase, "block_name", None))
    payload["measurement_method"] = _normalize_measurement_method(getattr(phase, "measurement_method", None), getattr(phase, "tipo", None))
    payload["tipo"] = type_from_measurement_method(payload["measurement_method"])
    payload["is_visible"] = normalize_phase_visibility(getattr(phase, "is_visible", 1))
    payload["activities"] = _parse_phase_activities(phase)
    payload["phase_format"] = _phase_format_from_count(len(payload["activities"]))
    return payload


@router.get("/api/competitions/{competition_id}/categories")
def list_categories(
    competition_id: int,
    modality: Optional[str] = None,
    session: Session = Depends(get_session),
    user=Depends(get_current_user_optional),
):
    require_competition_access(session, competition_id, user)
    items = session.exec(
        select(CompetitionCategory)
        .where(CompetitionCategory.competition_id == competition_id)
        .order_by(CompetitionCategory.modality, CompetitionCategory.orden, CompetitionCategory.nombre)
    ).all()
    if modality:
        normalized = _normalize_modality(modality)
        items = [cat for cat in items if _normalize_modality(getattr(cat, "modality", None)) == normalized]
    return [
        {
            **cat.model_dump(),
            "modality": _normalize_modality(getattr(cat, "modality", None)),
            "enrollment_price": _normalize_enrollment_price(getattr(cat, "enrollment_price", 0)),
        }
        for cat in items
    ]


@router.post("/api/competitions/{competition_id}/categories", status_code=201)
def create_category(competition_id: int, body: CategoryCreate,
                    session: Session = Depends(get_session), user=Depends(require_staff)):
    require_competition_access(session, competition_id, user)
    cat = CompetitionCategory(
        competition_id=competition_id,
        nombre=body.nombre,
        descripcion=body.descripcion,
        modality=_normalize_modality(body.modality),
        enrollment_price=_normalize_enrollment_price(body.enrollment_price),
        orden=body.orden,
    )
    session.add(cat)
    session.commit()
    session.refresh(cat)
    return cat


@router.put("/api/competitions/{competition_id}/categories/{cat_id}")
def update_category(
    competition_id: int,
    cat_id: int,
    body: CategoryUpdate,
    session: Session = Depends(get_session),
    user=Depends(require_staff),
):
    require_competition_access(session, competition_id, user)
    cat = session.get(CompetitionCategory, cat_id)
    if not cat or cat.competition_id != competition_id:
        raise HTTPException(404, "Categoria no encontrada")
    data = body.model_dump(exclude_unset=True)
    if "modality" in data:
        data["modality"] = _normalize_modality(data["modality"])
    if "enrollment_price" in data:
        data["enrollment_price"] = _normalize_enrollment_price(data["enrollment_price"])
    for key, value in data.items():
        setattr(cat, key, value)
    session.add(cat)
    session.commit()
    session.refresh(cat)
    payload = cat.model_dump()
    payload["modality"] = _normalize_modality(getattr(cat, "modality", None))
    payload["enrollment_price"] = _normalize_enrollment_price(getattr(cat, "enrollment_price", 0))
    return payload


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
    modality: Optional[str] = None,
    block_name: Optional[str] = None,
    session: Session = Depends(get_session),
    user=Depends(get_current_user_optional),
):
    require_competition_access(session, competition_id, user)
    auto_status = compute_phase_status_map(session, competition_id)
    items = session.exec(
        select(CompetitionPhase)
        .where(CompetitionPhase.competition_id == competition_id)
        .order_by(CompetitionPhase.block_order, CompetitionPhase.orden, CompetitionPhase.id)
    ).all()
    for ph in items:
        next_state = auto_status.get(int(ph.id))
        if next_state:
            ph.estado = next_state
    if estado:
        normalized = _normalize_phase_status(estado)
        items = [ph for ph in items if (ph.estado or "").strip().lower() == normalized]
    if modality:
        normalized_modality = _normalize_modality(modality)
        items = [ph for ph in items if _normalize_modality(getattr(ph, "modality", None)) == normalized_modality]
    if block_name is not None:
        normalized_block = _normalize_block_name(block_name)
        items = [ph for ph in items if _normalize_block_name(getattr(ph, "block_name", None)) == normalized_block]
    return [_phase_response(ph) for ph in items]


@router.post("/api/competitions/{competition_id}/phases", status_code=201)
def create_phase(competition_id: int, body: PhaseCreate,
                 session: Session = Depends(get_session), user=Depends(require_staff)):
    require_competition_access(session, competition_id, user)
    modality = _normalize_modality(body.modality)
    phase_type = _normalize_phase_type(body.tipo)
    if phase_type not in PHASE_TIPOS_VALIDOS:
        raise HTTPException(400, "Tipo de fase invalido. Usa: posicion, cantidad o tiempo")
    measurement_method = _normalize_measurement_method(body.measurement_method, phase_type)
    if measurement_method not in PHASE_MEASUREMENT_METHODS_VALIDOS:
        raise HTTPException(400, "measurement_method invalido")
    phase_type = type_from_measurement_method(measurement_method)
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
    activities, parsed_activities = _coerce_phase_activities(
        body.activities,
        phase_name=body.nombre,
        description=body.descripcion,
        phase_type=phase_type,
        measurement_method=measurement_method,
        winner_rule=winner_rule,
        points_mode=points_mode,
        scoring_rules=body.scoring_rules,
    )
    primary_activity = parsed_activities[0]
    phase_format = _phase_format_from_count(len(parsed_activities))
    if body.start_at and body.end_at and body.start_at > body.end_at:
        raise HTTPException(400, "La fecha inicial de la fase no puede ser mayor a la final")
    phase = CompetitionPhase(
        competition_id=competition_id,
        nombre=body.nombre,
        descripcion=body.descripcion,
        modality=modality,
        block_name=_normalize_block_name(body.block_name),
        block_order=body.block_order,
        phase_format=phase_format,
        tipo=primary_activity["tipo"],
        measurement_method=primary_activity["measurement_method"],
        winner_rule=primary_activity["winner_rule"],
        scoring_rules=body.scoring_rules,
        activities=activities,
        points_mode=primary_activity["points_mode"],
        allow_multiple_results=1 if body.allow_multiple_results else 0,
        team_result_mode=team_mode,
        estado=phase_status,
        is_visible=normalize_phase_visibility(body.is_visible),
        start_at=body.start_at,
        end_at=body.end_at,
        orden=body.orden,
    )
    session.add(phase)
    session.commit()
    session.refresh(phase)
    return _phase_response(phase)


@router.put("/api/competitions/{competition_id}/phases/{phase_id}")
def update_phase(competition_id: int, phase_id: int, body: PhaseUpdate,
                 session: Session = Depends(get_session), user=Depends(require_staff)):
    require_competition_access(session, competition_id, user)
    phase = session.get(CompetitionPhase, phase_id)
    if not phase or phase.competition_id != competition_id:
        raise HTTPException(404, "Fase no encontrada")
    data = body.model_dump(exclude_unset=True)
    if "modality" in data:
        data["modality"] = _normalize_modality(data["modality"])
    if "block_name" in data:
        data["block_name"] = _normalize_block_name(data["block_name"])
    if "block_order" in data:
        data["block_order"] = int(data["block_order"] or 0)
    if "phase_format" in data:
        data["phase_format"] = _normalize_phase_format(data["phase_format"])
        if data["phase_format"] not in PHASE_FORMATS_VALIDOS:
            data["phase_format"] = _normalize_phase_format(phase.phase_format)
    if "tipo" in data:
        data["tipo"] = _normalize_phase_type(data["tipo"])
        if data["tipo"] not in PHASE_TIPOS_VALIDOS:
            raise HTTPException(400, "Tipo de fase invalido. Usa: posicion, cantidad o tiempo")
    if "measurement_method" in data:
        data["measurement_method"] = _normalize_measurement_method(data["measurement_method"], data.get("tipo", phase.tipo))
        if data["measurement_method"] not in PHASE_MEASUREMENT_METHODS_VALIDOS:
            raise HTTPException(400, "measurement_method invalido")
        data["tipo"] = type_from_measurement_method(data["measurement_method"])
    elif "tipo" in data:
        data["measurement_method"] = default_measurement_method_for_type(data["tipo"])
    if "is_visible" in data:
        data["is_visible"] = normalize_phase_visibility(data["is_visible"])
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
    if "activities" in data:
        next_tipo = data.get("tipo", phase.tipo)
        next_measurement = data.get("measurement_method", phase.measurement_method)
        next_winner_rule = data.get("winner_rule", phase.winner_rule)
        next_points_mode = data.get("points_mode", phase.points_mode)
        serialized_activities, parsed_activities = _coerce_phase_activities(
            data["activities"],
            phase_name=data.get("nombre", phase.nombre),
            description=data.get("descripcion", phase.descripcion),
            phase_type=next_tipo,
            measurement_method=next_measurement,
            winner_rule=next_winner_rule,
            points_mode=next_points_mode,
            scoring_rules=data.get("scoring_rules", phase.scoring_rules),
        )
        data["activities"] = serialized_activities
        primary_activity = parsed_activities[0]
        data["tipo"] = primary_activity["tipo"]
        data["measurement_method"] = primary_activity["measurement_method"]
        data["winner_rule"] = primary_activity["winner_rule"]
        data["points_mode"] = primary_activity["points_mode"]
        data["phase_format"] = _phase_format_from_count(len(parsed_activities))
    next_start_at = data.get("start_at", phase.start_at)
    next_end_at = data.get("end_at", phase.end_at)
    if next_start_at and next_end_at and next_start_at > next_end_at:
        raise HTTPException(400, "La fecha inicial de la fase no puede ser mayor a la final")
    for field, value in data.items():
        setattr(phase, field, value)
    session.add(phase)
    session.commit()
    session.refresh(phase)
    return _phase_response(phase)


@router.delete("/api/competitions/{competition_id}/phases/{phase_id}", status_code=204)
def delete_phase(competition_id: int, phase_id: int,
                 session: Session = Depends(get_session), user=Depends(require_staff)):
    require_competition_access(session, competition_id, user)
    phase = session.get(CompetitionPhase, phase_id)
    if phase and phase.competition_id == competition_id:
        heats = session.exec(
            select(CompetitionHeat).where(
                CompetitionHeat.competition_id == competition_id,
                CompetitionHeat.phase_id == phase_id,
            )
        ).all()
        for heat in heats:
            session.delete(heat)
        session.delete(phase)
        session.commit()
