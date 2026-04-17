from constants import MedicionFase, UnidadRM


PHASE_MEASUREMENT_METHODS_ALLOWED = {
    MedicionFase.FOR_TIME,
    MedicionFase.AMRAP,
    MedicionFase.EMOM,
    MedicionFase.METROS,
    MedicionFase.RM,
}


def normalize_rm_unit(raw: object) -> str:
    value = str(raw or "").strip().lower()
    if value in {"lb", "lbs", UnidadRM.LB}:
        return UnidadRM.LB
    return UnidadRM.KG


def normalize_phase_visibility(raw: object) -> int:
    if raw is None:
        return 1
    if isinstance(raw, str):
        value = raw.strip().lower()
        if value in {"", "1", "true", "yes", "on"}:
            return 1
        if value in {"0", "false", "no", "off"}:
            return 0
    return 1 if int(bool(raw)) else 0


def default_measurement_method_for_type(phase_type: str | None) -> str:
    if (phase_type or "").strip().lower() == "tiempo":
        return MedicionFase.FOR_TIME
    return MedicionFase.AMRAP


def type_from_measurement_method(method: str | None) -> str:
    normalized = normalize_phase_measurement_method(method)
    if normalized == MedicionFase.FOR_TIME:
        return "tiempo"
    return "cantidad"


def normalize_phase_measurement_method(raw: object, phase_type: str | None = None) -> str:
    value = str(raw or "").strip().lower()
    value = MedicionFase.ALIAS.get(value, value)

    if value in PHASE_MEASUREMENT_METHODS_ALLOWED:
        return value
    if value in {MedicionFase.TIEMPO_HMS, MedicionFase.POSICION}:
        return MedicionFase.FOR_TIME
    if value in {MedicionFase.UNIDADES, MedicionFase.REPETICIONES}:
        return MedicionFase.AMRAP
    if value in {MedicionFase.KILOGRAMOS, MedicionFase.GRAMOS, MedicionFase.LIBRAS}:
        return MedicionFase.RM
    return default_measurement_method_for_type(phase_type)


def filter_visible_phases(phases: list[dict]) -> list[dict]:
    return [phase for phase in phases if normalize_phase_visibility((phase or {}).get("is_visible"))]
