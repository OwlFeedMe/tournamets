import json
from typing import Any


SCORING_SYSTEM_DYNAMIC = "dynamic_points"
SCORING_SYSTEM_DYNAMIC_STEP = "dynamic_step"
SCORING_SYSTEM_PLACEMENT = "placement"
SCORING_SYSTEM_FIXED_TABLE = "fixed_table"
SCORING_SYSTEM_AUTO_TABLE = "auto_table"
SCORING_SYSTEM_CUMULATIVE = "cumulative"

SCORING_SYSTEMS = {
    SCORING_SYSTEM_DYNAMIC,
    SCORING_SYSTEM_DYNAMIC_STEP,
    SCORING_SYSTEM_PLACEMENT,
    SCORING_SYSTEM_FIXED_TABLE,
    SCORING_SYSTEM_AUTO_TABLE,
    SCORING_SYSTEM_CUMULATIVE,
}
SCORING_SCOPES = {"category", "global"}
SCORING_TIEBREAKS = {"best_positions", "first_places", "final_workout"}
SCORING_DIRECTIONS = {"higher_wins", "lower_wins"}

DEFAULT_FIXED_TABLE = [
    {"rank": 1, "points": 100},
    {"rank": 2, "points": 95},
    {"rank": 3, "points": 90},
    {"rank": 4, "points": 85},
    {"rank": 5, "points": 80},
    {"rank": 6, "points": 75},
    {"rank": 7, "points": 70},
    {"rank": 8, "points": 65},
    {"rank": 9, "points": 60},
    {"rank": 10, "points": 55},
]

DNF_MARKS = {2147483647, -2147483648}


def normalize_scoring_system(raw: Any, fallback: str = SCORING_SYSTEM_DYNAMIC) -> str:
    value = str(raw or "").strip().lower()
    aliases = {
        "dynamic": SCORING_SYSTEM_DYNAMIC,
        "dynamic_points": SCORING_SYSTEM_DYNAMIC,
        "points_dynamic": SCORING_SYSTEM_DYNAMIC,
        "dynamic_step": SCORING_SYSTEM_DYNAMIC_STEP,
        "step_points": SCORING_SYSTEM_DYNAMIC_STEP,
        "fixed_step": SCORING_SYSTEM_DYNAMIC_STEP,
        "point_step": SCORING_SYSTEM_DYNAMIC_STEP,
        "placement": SCORING_SYSTEM_PLACEMENT,
        "position": SCORING_SYSTEM_PLACEMENT,
        "rank": SCORING_SYSTEM_PLACEMENT,
        "fixed": SCORING_SYSTEM_FIXED_TABLE,
        "table": SCORING_SYSTEM_FIXED_TABLE,
        "fixed_table": SCORING_SYSTEM_FIXED_TABLE,
        "auto": SCORING_SYSTEM_AUTO_TABLE,
        "auto_table": SCORING_SYSTEM_AUTO_TABLE,
        "relative_table": SCORING_SYSTEM_AUTO_TABLE,
        "games_table": SCORING_SYSTEM_AUTO_TABLE,
        "crossfit_games": SCORING_SYSTEM_AUTO_TABLE,
        "cumulative": SCORING_SYSTEM_CUMULATIVE,
        "raw": SCORING_SYSTEM_CUMULATIVE,
    }
    value = aliases.get(value, value)
    return value if value in SCORING_SYSTEMS else fallback


def normalize_scoring_scope(raw: Any) -> str:
    value = str(raw or "").strip().lower()
    return value if value in SCORING_SCOPES else "category"


def normalize_scoring_tiebreak(raw: Any) -> str:
    value = str(raw or "").strip().lower()
    return value if value in SCORING_TIEBREAKS else "best_positions"


def normalize_scoring_direction(raw: Any) -> str:
    value = str(raw or "").strip().lower()
    return value if value in SCORING_DIRECTIONS else "higher_wins"


def normalize_weight_percent(raw: Any) -> int:
    try:
        value = int(raw if raw is not None else 100)
    except Exception:
        value = 100
    return max(0, min(value, 1000))


def normalize_point_step(raw: Any) -> int:
    try:
        value = int(raw if raw is not None else 1)
    except Exception:
        value = 1
    return max(1, min(value, 99))


def normalize_scoring_table(raw: Any) -> list[dict]:
    if raw is None or raw == "":
        return []
    if isinstance(raw, str):
        try:
            raw = json.loads(raw)
        except Exception:
            return []
    if isinstance(raw, dict):
        raw = [{"rank": key, "points": value} for key, value in raw.items()]
    if not isinstance(raw, list):
        return []

    table: dict[int, int] = {}
    for item in raw:
        if not isinstance(item, dict):
            continue
        try:
            rank = int(item.get("rank"))
            points = int(item.get("points"))
        except Exception:
            continue
        if rank <= 0:
            continue
        table[rank] = max(0, points)
    return [{"rank": rank, "points": table[rank]} for rank in sorted(table)]


def serialize_scoring_table(raw: Any) -> str | None:
    table = normalize_scoring_table(raw)
    return json.dumps(table, ensure_ascii=False) if table else None


def scoring_mode_for_system(system: str, direction: str = "higher_wins") -> str:
    system = normalize_scoring_system(system)
    direction = normalize_scoring_direction(direction)
    if system == SCORING_SYSTEM_PLACEMENT:
        return "lowest_wins"
    if system == SCORING_SYSTEM_CUMULATIVE and direction == "lower_wins":
        return "lowest_wins"
    return "highest_wins"


def competition_total_lower_is_better(competition: Any) -> bool:
    system = normalize_scoring_system(getattr(competition, "scoring_system", None))
    direction = normalize_scoring_direction(getattr(competition, "cumulative_direction", None))
    if system == SCORING_SYSTEM_PLACEMENT:
        return True
    if system == SCORING_SYSTEM_CUMULATIVE:
        return direction == "lower_wins"
    return str(getattr(competition, "scoring_mode", "highest_wins") or "").strip().lower() == "lowest_wins"


def phase_scoring_config(competition: Any, phase: Any = None) -> dict:
    comp_system = normalize_scoring_system(getattr(competition, "scoring_system", None))
    phase_override = bool(int(getattr(phase, "scoring_override_enabled", 0) or 0)) if phase is not None else False
    phase_system = normalize_scoring_system(getattr(phase, "scoring_system", None), fallback=comp_system) if phase_override else comp_system
    raw_table = getattr(phase, "scoring_table", None) if phase_override and getattr(phase, "scoring_table", None) else getattr(competition, "scoring_table", None)
    table = normalize_scoring_table(raw_table)
    if phase_system == SCORING_SYSTEM_FIXED_TABLE and not table:
        table = DEFAULT_FIXED_TABLE
    return {
        "system": phase_system,
        "scope": normalize_scoring_scope(getattr(competition, "scoring_scope", None)),
        "tiebreak": normalize_scoring_tiebreak(getattr(competition, "scoring_tiebreak", None)),
        "cumulative_direction": normalize_scoring_direction(getattr(competition, "cumulative_direction", None)),
        "weight_percent": normalize_weight_percent(getattr(phase, "scoring_weight_percent", 100) if phase is not None else 100),
        "point_step": normalize_point_step(getattr(phase, "scoring_point_step", None) if phase_override and getattr(phase, "scoring_point_step", None) is not None else getattr(competition, "scoring_point_step", None)),
        "table": table,
        "override_enabled": 1 if phase_override else 0,
    }


def _table_points(table: list[dict], position: int) -> int:
    by_rank = {int(item["rank"]): int(item["points"]) for item in table if item.get("rank") is not None}
    if position in by_rank:
        return by_rank[position]
    if not by_rank:
        return 0
    lower_ranks = [rank for rank in by_rank if rank <= position]
    if lower_ranks:
        # Positions beyond the configured table get zero unless an exact rank was configured.
        return 0
    return 0


def auto_table_points(position: int, total_ranked: int) -> int:
    """Distribute 100 points to first place and 0 to last place with integer gaps."""
    position = int(position)
    total_ranked = int(total_ranked)
    if position <= 0 or total_ranked <= 0 or position > total_ranked:
        return 0
    if total_ranked == 1:
        return 100

    gaps = total_ranked - 1
    base_drop = 100 // gaps
    larger_drop_count = 100 % gaps
    completed_gaps = position - 1
    larger_gaps_used = min(completed_gaps, larger_drop_count)
    regular_gaps_used = completed_gaps - larger_gaps_used
    points = 100 - (larger_gaps_used * (base_drop + 1)) - (regular_gaps_used * base_drop)
    return max(0, int(points))


def compute_result_points(
    *,
    position: int,
    total_ranked: int,
    mark: int | None,
    competition: Any,
    phase: Any = None,
) -> int:
    if mark in DNF_MARKS:
        return 0
    config = phase_scoring_config(competition, phase)
    system = config["system"]
    if system == SCORING_SYSTEM_PLACEMENT:
        base = int(position)
    elif system == SCORING_SYSTEM_FIXED_TABLE:
        base = _table_points(config["table"], int(position))
    elif system == SCORING_SYSTEM_AUTO_TABLE:
        base = auto_table_points(int(position), int(total_ranked))
    elif system == SCORING_SYSTEM_CUMULATIVE:
        base = int(mark or 0)
    elif system == SCORING_SYSTEM_DYNAMIC_STEP:
        base = max(0, int(total_ranked) - int(position) + 1) * int(config["point_step"])
    else:
        base = max(0, int(total_ranked) - int(position) + 1)
    return int(round(base * int(config["weight_percent"]) / 100))


def scoring_summary_payload(competition: Any, phases: list[Any] | None = None, results_count: int = 0) -> dict:
    phases = phases or []
    comp_system = normalize_scoring_system(getattr(competition, "scoring_system", None))
    payload = {
        "scoring_system": comp_system,
        "scoring_mode": scoring_mode_for_system(comp_system, getattr(competition, "cumulative_direction", None)),
        "scoring_scope": normalize_scoring_scope(getattr(competition, "scoring_scope", None)),
        "scoring_table": normalize_scoring_table(getattr(competition, "scoring_table", None)) or (DEFAULT_FIXED_TABLE if comp_system == SCORING_SYSTEM_FIXED_TABLE else []),
        "scoring_point_step": normalize_point_step(getattr(competition, "scoring_point_step", None)),
        "scoring_tiebreak": normalize_scoring_tiebreak(getattr(competition, "scoring_tiebreak", None)),
        "cumulative_direction": normalize_scoring_direction(getattr(competition, "cumulative_direction", None)),
        "results_count": int(results_count or 0),
        "phases": [],
    }
    for phase in phases:
        config = phase_scoring_config(competition, phase)
        payload["phases"].append({
            "id": phase.id,
            "nombre": phase.nombre,
            "scoring_override_enabled": config["override_enabled"],
            "scoring_system": config["system"],
            "scoring_weight_percent": config["weight_percent"],
            "scoring_point_step": config["point_step"],
            "scoring_table": config["table"],
        })
    return payload
