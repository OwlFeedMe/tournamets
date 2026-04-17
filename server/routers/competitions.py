import io
import json
import os
import re
import unicodedata
from datetime import datetime, time, timezone
from pathlib import Path
from typing import List, Optional, Union

from fastapi import APIRouter, Depends, HTTPException, File, UploadFile
from fastapi.responses import Response
from pydantic import BaseModel
from PIL import Image, UnidentifiedImageError
import qrcode
from sqlalchemy import text
from sqlmodel import Session, select

from access import get_owned_competition_ids, is_organizer_user, require_competition_access
from auth import get_current_user_id, get_current_user_optional, has_organizer_access, require_staff
from competition_rules import filter_visible_phases, normalize_phase_measurement_method, normalize_phase_visibility, normalize_rm_unit, type_from_measurement_method
from database import MAX_TEAM_SIZE, get_session
from models import Competition, CompetitionCreate, CompetitionUpdate
from phase_status import compute_phase_status_map
from routers.config import get_pricing_config

router = APIRouter(prefix="/api/competitions", tags=["competitions"])
COMP_SCORING_VALIDOS = {"highest_wins", "lowest_wins"}
TV_ROTATION_MIN_SECONDS = 5
TV_ROTATION_MAX_SECONDS = 120
TV_REFRESH_MIN_SECONDS = 2
TV_REFRESH_MAX_SECONDS = 60
TV_MODE_VALIDOS = {"cyclic", "static"}
TV_VIEW_VALIDOS = {"individual", "teams"}
TEAM_MEMBERSHIP_RULES_VALIDOS = {"free", "same_category"}
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
COMPETITION_ASSET_DIR = Path(__file__).resolve().parents[1] / "uploads" / "competition_assets"
COMPETITION_ASSET_DIR.mkdir(parents=True, exist_ok=True)
COMPETITION_ASSET_SPECS = {
    "profile": {"field": "profile_image_url", "width": 512, "height": 512, "mode": "cover"},
    "banner": {"field": "banner_image_url", "mode": "original"},
}
HEX_COLOR_RE = re.compile(r"^#([0-9a-fA-F]{6})$")

def _generate_slug(nombre: str, session, exclude_id: int | None = None) -> str:
    """Generate a unique URL-safe slug from a competition name."""
    normalized = unicodedata.normalize("NFKD", nombre)
    ascii_str = normalized.encode("ascii", "ignore").decode("ascii")
    slug_base = re.sub(r"[^a-z0-9]+", "-", ascii_str.lower()).strip("-")
    if not slug_base:
        slug_base = "competencia"
    candidate = slug_base
    counter = 2
    while True:
        query = select(Competition).where(Competition.slug == candidate)
        if exclude_id is not None:
            query = query.where(Competition.id != exclude_id)
        existing = session.exec(query).first()
        if not existing:
            return candidate
        candidate = f"{slug_base}-{counter}"
        counter += 1


def _resolve_competition(session, id_or_slug: str) -> "Competition":
    """Lookup competition by numeric ID or text slug."""
    try:
        competition = session.get(Competition, int(id_or_slug))
    except ValueError:
        competition = session.exec(
            select(Competition).where(Competition.slug == id_or_slug)
        ).first()
    if not competition:
        raise HTTPException(404, "Competencia no encontrada")
    return competition

COMPETITION_THEME_FIELDS = (
    "theme_background_color",
    "theme_surface_color",
    "theme_primary_color",
    "theme_accent_color",
)


def _serialize_enrollment_questions(payload: dict):
    if "enrollment_questions" not in payload:
        return
    questions = payload.get("enrollment_questions")
    if not questions:
        payload["enrollment_questions"] = None
        return
    normalized = []
    for idx, raw in enumerate(questions):
        label = str((raw or {}).get("label") or "").strip()
        if not label:
            continue
        question_id = str((raw or {}).get("id") or f"q_{idx + 1}").strip() or f"q_{idx + 1}"
        placeholder = str((raw or {}).get("placeholder") or "").strip() or None
        field_type = str((raw or {}).get("field_type") or "text").strip().lower() or "text"
        if field_type not in {"text", "number", "image"}:
            field_type = "text"
        normalized.append({
            "id": question_id,
            "label": label,
            "field_type": field_type,
            "required": 1 if (raw or {}).get("required") else 0,
            "placeholder": placeholder,
        })
    payload["enrollment_questions"] = json.dumps(normalized, ensure_ascii=False) if normalized else None


def _serialize_schedule_items(payload: dict):
    if "schedule_items" not in payload:
        return
    items = payload.get("schedule_items")
    if not items:
        payload["schedule_items"] = None
        return
    normalized = []
    for idx, raw in enumerate(items):
        label = str((raw or {}).get("label") or "").strip()
        kind = str((raw or {}).get("kind") or "custom").strip().lower() or "custom"
        start_at = (raw or {}).get("start_at")
        end_at = (raw or {}).get("end_at")
        phase_id = (raw or {}).get("phase_id")
        use_phase_dates = 1 if (raw or {}).get("use_phase_dates") else 0
        note = str((raw or {}).get("note") or "").strip() or None
        if not label and not start_at and not end_at and not note and phase_id in (None, "", False):
            continue
        normalized.append({
            "id": str((raw or {}).get("id") or f"date_{idx + 1}").strip() or f"date_{idx + 1}",
            "label": label or f"Fecha {idx + 1}",
            "kind": kind,
            "start_at": start_at.isoformat() if isinstance(start_at, datetime) else start_at,
            "end_at": end_at.isoformat() if isinstance(end_at, datetime) else end_at,
            "phase_id": int(phase_id) if phase_id not in (None, "", False) else None,
            "use_phase_dates": use_phase_dates,
            "note": note,
        })
    payload["schedule_items"] = json.dumps(normalized, ensure_ascii=False) if normalized else None


def _serialize_landing_sections(payload: dict):
    if "landing_sections" not in payload:
        return
    raw = payload.get("landing_sections")
    if not raw or not isinstance(raw, dict):
        payload["landing_sections"] = None
        return

    experience = raw.get("experience") if isinstance(raw.get("experience"), dict) else {}
    format_section = raw.get("format") if isinstance(raw.get("format"), dict) else {}
    highlights_section = raw.get("highlights") if isinstance(raw.get("highlights"), dict) else {}

    def _clean_items(items, fallback_prefix):
        normalized = []
        for idx, item in enumerate(items or []):
            if not isinstance(item, dict):
                continue
            title = str(item.get("title") or "").strip()
            body = str(item.get("body") or "").strip()
            if not title and not body:
                continue
            normalized.append({
                "id": str(item.get("id") or f"{fallback_prefix}_{idx + 1}").strip() or f"{fallback_prefix}_{idx + 1}",
                "title": title or f"Item {idx + 1}",
                "body": body or None,
            })
        return normalized

    normalized = {
        "experience": {
            "title": str(experience.get("title") or "").strip() or None,
            "intro": str(experience.get("intro") or "").strip() or None,
            "items": _clean_items(experience.get("items"), "exp"),
        },
        "format": {
            "title": str(format_section.get("title") or "").strip() or None,
            "items": _clean_items(format_section.get("items"), "fmt"),
        },
        "highlights": {
            "title": str(highlights_section.get("title") or "").strip() or None,
            "items": _clean_items(highlights_section.get("items"), "hl"),
        },
    }

    has_content = (
        normalized["experience"]["title"]
        or normalized["experience"]["intro"]
        or normalized["experience"]["items"]
        or normalized["format"]["title"]
        or normalized["format"]["items"]
        or normalized["highlights"]["title"]
        or normalized["highlights"]["items"]
    )
    payload["landing_sections"] = json.dumps(normalized, ensure_ascii=False) if has_content else None


def _serialize_social_links(payload: dict):
    if "social_links" not in payload:
        return
    links = payload.get("social_links")
    if not links:
        payload["social_links"] = None
        return
    normalized = []
    for idx, raw in enumerate(links):
        label = str((raw or {}).get("label") or "").strip()
        url = str((raw or {}).get("url") or "").strip()
        if not label and not url:
            continue
        normalized.append({
            "id": str((raw or {}).get("id") or f"social_{idx + 1}").strip() or f"social_{idx + 1}",
            "label": label or f"Red {idx + 1}",
            "url": url,
        })
    payload["social_links"] = json.dumps(normalized, ensure_ascii=False) if normalized else None


def _normalize_date_boundary(value, *, end_of_day: bool = False):
    if not value or not isinstance(value, datetime):
        return value
    if value.tzinfo is not None:
        value = value.replace(tzinfo=None)
    boundary = time(23, 59, 59, 999999) if end_of_day else time(0, 0, 0)
    return datetime.combine(value.date(), boundary)


def _normalize_theme_color(value: object) -> str | None:
    if value is None:
        return None
    color = str(value).strip()
    if not color:
        return None
    if not color.startswith("#") and len(color) == 6:
        color = f"#{color}"
    if not HEX_COLOR_RE.fullmatch(color):
        raise HTTPException(400, "Los colores del tema deben usar formato HEX de 6 digitos, por ejemplo #FF6B00")
    return color.upper()


def _normalize_competition_theme(payload: dict) -> None:
    for field in COMPETITION_THEME_FIELDS:
        if field in payload:
            payload[field] = _normalize_theme_color(payload.get(field))


def _normalize_platform_fee_rate(raw: object) -> float:
    try:
        value = float(raw if raw is not None else 0.05)
    except Exception:
        value = 0.05
    if value < 0:
        value = 0.0
    if value > 1:
        value = 1.0
    return round(value, 4)


def _current_global_platform_fee_rate(session: Session) -> float:
    pricing_cfg = get_pricing_config(session)
    return _normalize_platform_fee_rate(pricing_cfg.get("default_platform_fee_rate"))


def _normalize_competition_dates(payload: dict):
    if "enrollment_start" in payload:
        payload["enrollment_start"] = _normalize_date_boundary(payload.get("enrollment_start"), end_of_day=False)
    if "enrollment_end" in payload:
        payload["enrollment_end"] = _normalize_date_boundary(payload.get("enrollment_end"), end_of_day=True)
    if "competition_start" in payload:
        payload["competition_start"] = _normalize_date_boundary(payload.get("competition_start"), end_of_day=False)
    if "competition_end" in payload:
        payload["competition_end"] = _normalize_date_boundary(payload.get("competition_end"), end_of_day=True)


def _validate_competition_dates(payload: dict):
    enrollment_start = payload.get("enrollment_start")
    enrollment_end = payload.get("enrollment_end")
    competition_start = payload.get("competition_start")
    competition_end = payload.get("competition_end")
    if enrollment_start and enrollment_end and enrollment_start > enrollment_end:
        raise HTTPException(400, "La fecha de inicio de inscripciones no puede ser mayor a la de cierre")
    if competition_start and competition_end and competition_start > competition_end:
        raise HTTPException(400, "La fecha de inicio de competencia no puede ser mayor a la fecha final")


def _normalize_competition_visibility(payload: dict):
    # Only force enrollment closure when visibility is explicitly set to inactive.
    # In partial updates (e.g. toggling enrollment_open only), `activa` may be omitted.
    if "activa" in payload and not payload.get("activa"):
        payload["enrollment_open"] = 0


def _normalize_rm_unit_field(payload: dict):
    if "rm_unit" in payload:
        payload["rm_unit"] = normalize_rm_unit(payload.get("rm_unit"))


def _delete_local_competition_asset(asset_url: Optional[str]) -> None:
    if not asset_url or not asset_url.startswith("/uploads/competition_assets/"):
        return
    target = COMPETITION_ASSET_DIR / asset_url.rsplit("/", 1)[-1]
    try:
        if target.exists():
            target.unlink()
    except OSError:
        pass


def _resize_contain(image: Image.Image, target_width: int, target_height: int) -> Image.Image:
    img = image.copy()
    img.thumbnail((target_width, target_height), Image.Resampling.LANCZOS)
    background = Image.new("RGB", (target_width, target_height), (13, 15, 18))
    x = int((target_width - img.size[0]) / 2)
    y = int((target_height - img.size[1]) / 2)
    background.paste(img, (x, y))
    return background


def _resize_cover(image: Image.Image, target_width: int, target_height: int) -> Image.Image:
    src_ratio = image.width / image.height if image.height else 1
    target_ratio = target_width / target_height if target_height else 1
    if src_ratio > target_ratio:
        crop_height = image.height
        crop_width = int(crop_height * target_ratio)
        left = int((image.width - crop_width) / 2)
        top = 0
    else:
        crop_width = image.width
        crop_height = int(crop_width / target_ratio)
        left = 0
        top = int((image.height - crop_height) / 2)
    cropped = image.crop((left, top, left + crop_width, top + crop_height))
    return cropped.resize((target_width, target_height), Image.Resampling.LANCZOS)


def _competition_asset_extension(file: UploadFile) -> str:
    suffix = Path(file.filename or "").suffix.lower()
    if suffix in {".jpg", ".jpeg", ".png", ".webp"}:
        return suffix
    content_type = (file.content_type or "").lower()
    if content_type == "image/png":
        return ".png"
    if content_type == "image/webp":
        return ".webp"
    return ".jpg"


def _process_competition_asset(file: UploadFile, competition_id: int, asset_type: str) -> str:
    if asset_type not in COMPETITION_ASSET_SPECS:
        raise HTTPException(400, "asset_type invalido")
    if not (file.content_type or "").startswith("image/"):
        raise HTTPException(400, "El archivo debe ser una imagen")
    try:
        raw = file.file.read()
        image = Image.open(io.BytesIO(raw)).convert("RGB")
    except (UnidentifiedImageError, OSError):
        raise HTTPException(400, "No se pudo procesar la imagen")

    spec = COMPETITION_ASSET_SPECS[asset_type]
    if spec["mode"] == "original":
        filename = f"competition_{competition_id}_{asset_type}_{datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S')}{_competition_asset_extension(file)}"
        output_path = COMPETITION_ASSET_DIR / filename
        output_path.write_bytes(raw)
        return f"/uploads/competition_assets/{filename}"
    if spec["mode"] == "cover":
        output = _resize_cover(image, spec["width"], spec["height"])
    else:
        output = _resize_contain(image, spec["width"], spec["height"])

    filename = f"competition_{competition_id}_{asset_type}_{datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S')}.jpg"
    output_path = COMPETITION_ASSET_DIR / filename
    output.save(output_path, format="JPEG", quality=86, optimize=True)
    return f"/uploads/competition_assets/{filename}"


def _validate_tv_settings(payload: dict):
    if "tv_rotation_interval_seconds" in payload:
        v = int(payload["tv_rotation_interval_seconds"])
        if v < TV_ROTATION_MIN_SECONDS or v > TV_ROTATION_MAX_SECONDS:
            raise HTTPException(400, f"tv_rotation_interval_seconds invalido. Usa {TV_ROTATION_MIN_SECONDS}-{TV_ROTATION_MAX_SECONDS}")
        payload["tv_rotation_interval_seconds"] = v
    if "tv_data_refresh_interval_seconds" in payload:
        v = int(payload["tv_data_refresh_interval_seconds"])
        if v < TV_REFRESH_MIN_SECONDS or v > TV_REFRESH_MAX_SECONDS:
            raise HTTPException(400, f"tv_data_refresh_interval_seconds invalido. Usa {TV_REFRESH_MIN_SECONDS}-{TV_REFRESH_MAX_SECONDS}")
        payload["tv_data_refresh_interval_seconds"] = v
    if "tv_mode" in payload:
        v = (payload["tv_mode"] or "").strip().lower()
        if v not in TV_MODE_VALIDOS:
            raise HTTPException(400, "tv_mode invalido. Usa: cyclic o static")
        payload["tv_mode"] = v
    if "tv_static_view" in payload:
        v = (payload["tv_static_view"] or "").strip().lower()
        if v not in TV_VIEW_VALIDOS:
            raise HTTPException(400, "tv_static_view invalido. Usa: individual o teams")
        payload["tv_static_view"] = v
    if "tv_static_phase_id" in payload and payload["tv_static_phase_id"] is not None:
        payload["tv_static_phase_id"] = int(payload["tv_static_phase_id"])
    if "tv_static_individual_category" in payload and payload["tv_static_individual_category"] is not None:
        payload["tv_static_individual_category"] = str(payload["tv_static_individual_category"]).strip() or None
    if "tv_static_team_category_mode" in payload and payload["tv_static_team_category_mode"] is not None:
        payload["tv_static_team_category_mode"] = str(payload["tv_static_team_category_mode"]).strip() or "__by_category__"


def _normalize_modality(raw: str | None) -> str:
    value = (raw or "").strip().lower()
    value = MODALITY_ALIAS.get(value, value)
    return value if value in MODALITY_VALIDOS else "individual"


def _normalize_team_membership_rule(raw: str | None) -> str:
    value = (raw or "").strip().lower()
    return value if value in TEAM_MEMBERSHIP_RULES_VALIDOS else "free"


def _normalize_toggle(raw: object, fallback: int = 0) -> int:
    if isinstance(raw, bool):
        return 1 if raw else 0
    if raw is None:
        return fallback
    if isinstance(raw, str):
        value = raw.strip().lower()
        if value in {"1", "true", "yes", "on"}:
            return 1
        if value in {"0", "false", "no", "off", ""}:
            return 0
    try:
        return 1 if int(raw) else 0
    except Exception:
        return fallback


def _normalize_team_size(raw: object, fallback: int = 2) -> int:
    try:
        size = int(raw if raw is not None else fallback)
    except Exception:
        size = fallback
    return max(1, min(MAX_TEAM_SIZE, size))


def _normalize_competition_team_settings(payload: dict) -> None:
    if "individual_enabled" in payload:
        payload["individual_enabled"] = _normalize_toggle(payload.get("individual_enabled"), fallback=1)
    if "team_enabled" in payload:
        payload["team_enabled"] = _normalize_toggle(payload.get("team_enabled"), fallback=0)
    if "team_categories_enabled" in payload:
        payload["team_categories_enabled"] = _normalize_toggle(payload.get("team_categories_enabled"), fallback=1)
    if "team_size" in payload:
        payload["team_size"] = _normalize_team_size(payload.get("team_size"))
    if "team_membership_rule" in payload:
        payload["team_membership_rule"] = _normalize_team_membership_rule(payload.get("team_membership_rule"))


def _validate_competition_team_settings(payload: dict) -> None:
    if not payload.get("individual_enabled") and not payload.get("team_enabled"):
        raise HTTPException(400, "La competencia debe tener al menos una modalidad activa")
    if int(payload.get("team_size") or 0) < 1:
        raise HTTPException(400, "team_size invalido")


def _competition_modality_config(competition: Competition | None) -> dict:
    if not competition:
        return {
            "individual_enabled": True,
            "team_enabled": False,
            "team_categories_enabled": True,
            "team_size": 2,
            "team_membership_rule": "free",
        }
    return {
        "individual_enabled": bool(getattr(competition, "individual_enabled", 1)),
        "team_enabled": bool(getattr(competition, "team_enabled", 0)),
        "team_categories_enabled": bool(getattr(competition, "team_categories_enabled", 1)),
        "team_size": _normalize_team_size(getattr(competition, "team_size", 2), fallback=2),
        "team_membership_rule": _normalize_team_membership_rule(getattr(competition, "team_membership_rule", "free")),
    }


def _group_rows_by_modality(rows: list[dict]) -> dict[str, list[dict]]:
    grouped = {"individual": [], "teams": []}
    for row in rows:
        modality = _normalize_modality(row.get("modality"))
        grouped.setdefault(modality, []).append(row)
    return grouped


def _leaderboard_public_url(competition_id: int) -> str:
    base = (os.getenv("LEADERBOARD_BASE_URL") or "http://localhost:5173/").strip()
    if not base.endswith("/"):
        base += "/"
    return f"{base}leaderboard/{competition_id}"


@router.get("", response_model=List[Competition])
def list_competitions(
    scope: str | None = None,
    session: Session = Depends(get_session),
    user=Depends(get_current_user_optional),
):
    query = select(Competition).order_by(Competition.created_at.desc())
    global_fee_rate = _current_global_platform_fee_rate(session)
    if scope == "public":
        query = query.where(Competition.activa == 1)
        items = session.exec(query).all()
        for item in items:
            item.platform_fee_rate = global_fee_rate
        return items
    scoped_user = user
    if scope == "owned" and user and user.get("role") != "admin" and has_organizer_access(user):
        scoped_user = {**user, "staff_mode": "organizer"}
    owned_ids = get_owned_competition_ids(session, scoped_user)
    if scope == "owned" and is_organizer_user(scoped_user):
        query = query.where(Competition.id.in_(owned_ids))
    elif not (user and user.get("role") == "admin"):
        query = query.where(Competition.activa == 1)
    items = session.exec(query).all()
    for item in items:
        item.platform_fee_rate = global_fee_rate
    return items


@router.get("/{competition_id}", response_model=Competition)
def get_competition(
    competition_id: int,
    session: Session = Depends(get_session),
    user=Depends(get_current_user_optional),
):
    competition = require_competition_access(session, competition_id, user)
    competition.platform_fee_rate = _current_global_platform_fee_rate(session)
    return competition


@router.get("/{competition_id}/public")
def get_public_competition_detail(
    competition_id: str,
    session: Session = Depends(get_session),
    user=Depends(get_current_user_optional),
):
    competition = _resolve_competition(session, competition_id)
    competition_id_int = competition.id
    if not competition.activa:
        scoped_user = user
        if user and user.get("role") != "admin" and has_organizer_access(user):
            scoped_user = {**user, "staff_mode": "organizer"}
        owned_ids = get_owned_competition_ids(session, scoped_user)
        can_preview = bool(
            user
            and (
                user.get("role") == "admin"
                or (is_organizer_user(scoped_user) and competition_id_int in owned_ids)
            )
        )
        if not can_preview:
            raise HTTPException(404, "Competencia no encontrada")

    categories = session.execute(
        text("""
            SELECT id, nombre, descripcion, orden, modality, enrollment_price
            FROM competition_categories
            WHERE competition_id = :cid
            ORDER BY modality, orden, nombre
        """),
        {"cid": competition_id_int},
    ).mappings().all()

    phases = session.execute(
        text("""
            SELECT id, nombre, descripcion, modality, block_name, block_order, phase_format, tipo, measurement_method, winner_rule, scoring_rules, activities, points_mode, allow_multiple_results, team_result_mode, estado, is_visible, start_at, end_at, orden
            FROM competition_phases
            WHERE competition_id = :cid
            ORDER BY block_order, orden, id
        """),
        {"cid": competition_id_int},
    ).mappings().all()
    auto_status = compute_phase_status_map(session, competition_id_int)
    normalized_phases = []
    for phase in phases:
        item = dict(phase)
        phase_id = item.get("id")
        if phase_id in auto_status:
            item["estado"] = auto_status[phase_id]
        item["modality"] = _normalize_modality(item.get("modality"))
        item["block_name"] = str(item.get("block_name") or "").strip() or None
        item["block_order"] = int(item.get("block_order") or 0)
        item["measurement_method"] = normalize_phase_measurement_method(item.get("measurement_method"), item.get("tipo"))
        item["tipo"] = type_from_measurement_method(item["measurement_method"])
        phase_format = str(item.get("phase_format") or "activity").strip().lower()
        if phase_format in {"actividad", "activity"}:
            phase_format = "activity"
        elif phase_format in {"wod", "workout"}:
            phase_format = "wod"
        else:
            phase_format = "activity"
        item["phase_format"] = phase_format
        item["points_mode"] = item.get("points_mode") or "manual"
        item["allow_multiple_results"] = int(item.get("allow_multiple_results") or 0)
        item["team_result_mode"] = item.get("team_result_mode") or "sum_two"
        item["is_visible"] = normalize_phase_visibility(item.get("is_visible"))
        try:
            parsed_activities = json.loads(item.get("activities") or "[]")
        except Exception:
            parsed_activities = []
        if isinstance(parsed_activities, list) and parsed_activities:
            item["activities"] = [
                {
                    **activity,
                    "measurement_method": normalize_phase_measurement_method((activity or {}).get("measurement_method"), (activity or {}).get("tipo")),
                    "tipo": type_from_measurement_method(normalize_phase_measurement_method((activity or {}).get("measurement_method"), (activity or {}).get("tipo"))),
                }
                for activity in parsed_activities
                if isinstance(activity, dict)
            ]
        else:
            item["activities"] = [{
                "nombre": item.get("nombre"),
                "descripcion": item.get("descripcion"),
                "tipo": item.get("tipo"),
                "measurement_method": item.get("measurement_method"),
                "winner_rule": item.get("winner_rule"),
                "points_mode": item.get("points_mode"),
                "team_result_mode": item.get("team_result_mode"),
                "allow_multiple_results": item.get("allow_multiple_results"),
                "orden": 0,
            }]
        normalized_phases.append(item)
    normalized_phases = filter_visible_phases(normalized_phases)

    normalized_categories = []
    for category in categories:
        item = dict(category)
        item["modality"] = _normalize_modality(item.get("modality"))
        item["enrollment_price"] = max(0, int(item.get("enrollment_price") or 0))
        normalized_categories.append(item)
    categories_by_modality = _group_rows_by_modality(normalized_categories)
    phases_by_modality = _group_rows_by_modality(normalized_phases)
    blocks_by_key: dict[tuple[str | None, int], dict] = {}
    for phase in normalized_phases:
        key = (phase.get("block_name"), int(phase.get("block_order") or 0))
        bucket = blocks_by_key.setdefault(
            key,
            {
                "block_name": phase.get("block_name"),
                "block_order": int(phase.get("block_order") or 0),
                "phases": [],
            },
        )
        bucket["phases"].append(phase)
    blocks = sorted(
        blocks_by_key.values(),
        key=lambda item: (int(item.get("block_order") or 0), (item.get("block_name") or "").lower()),
    )

    stats = session.execute(
        text("""
            SELECT
                COUNT(*) FILTER (WHERE estado = 'confirmado') AS inscritos_confirmados,
                COUNT(*) FILTER (WHERE estado = 'pendiente') AS solicitudes_pendientes,
                COUNT(*) FILTER (WHERE estado = 'rechazado') AS solicitudes_rechazadas
            FROM competition_participants
            WHERE competition_id = :cid
        """),
        {"cid": competition_id_int},
    ).mappings().first() or {}

    competition_payload = competition.model_dump()
    competition_payload["platform_fee_rate"] = _current_global_platform_fee_rate(session)
    competition_payload["rm_unit"] = normalize_rm_unit(competition_payload.get("rm_unit"))

    return {
        "competition": competition_payload,
        "categories": normalized_categories,
        "phases": normalized_phases,
        "categories_by_modality": categories_by_modality,
        "phases_by_modality": phases_by_modality,
        "blocks": blocks,
        "modality_config": _competition_modality_config(competition),
        "stats": {
            "inscritos_confirmados": int(stats.get("inscritos_confirmados") or 0),
            "solicitudes_pendientes": int(stats.get("solicitudes_pendientes") or 0),
            "solicitudes_rechazadas": int(stats.get("solicitudes_rechazadas") or 0),
            "fases_total": len(normalized_phases),
            "categorias_total": len(categories),
        },
        "leaderboard_url": _leaderboard_public_url(competition_id_int),
    }


@router.get("/{competition_id}/leaderboard-qr")
def get_leaderboard_qr(competition_id: int, session: Session = Depends(get_session)):
    c = session.get(Competition, competition_id)
    if not c:
        raise HTTPException(404, "Competencia no encontrada")

    url = _leaderboard_public_url(competition_id)
    qr = qrcode.QRCode(version=1, error_correction=qrcode.constants.ERROR_CORRECT_M, box_size=10, border=2)
    qr.add_data(url)
    qr.make(fit=True)
    img = qr.make_image(fill_color="black", back_color="white")

    buf = io.BytesIO()
    img.save(buf, format="PNG")
    png = buf.getvalue()
    return Response(content=png, media_type="image/png", headers={"Cache-Control": "no-store"})


@router.post("", response_model=Competition, status_code=201)
def create_competition(body: CompetitionCreate, session: Session = Depends(get_session), user=Depends(require_staff)):
    payload = body.model_dump()
    if payload.get("scoring_mode") not in COMP_SCORING_VALIDOS:
        raise HTTPException(400, "scoring_mode invalido. Usa: highest_wins o lowest_wins")
    _normalize_competition_team_settings(payload)
    _validate_competition_team_settings(payload)
    _validate_tv_settings(payload)
    if "lugar" in payload:
        payload["lugar"] = str(payload.get("lugar") or "").strip() or None
    if "contact_phone" in payload:
        payload["contact_phone"] = str(payload.get("contact_phone") or "").strip() or None
    if "website_url" in payload:
        payload["website_url"] = str(payload.get("website_url") or "").strip() or None
    if "enrollment_intro_text" in payload:
        payload["enrollment_intro_text"] = str(payload.get("enrollment_intro_text") or "").strip() or None
    if "general_info_text" in payload:
        payload["general_info_text"] = str(payload.get("general_info_text") or "").strip() or None
    if "enrollment_terms_text" in payload:
        payload["enrollment_terms_text"] = str(payload.get("enrollment_terms_text") or "").strip() or None
    pricing_cfg = get_pricing_config(session)
    payload["platform_fee_rate"] = _normalize_platform_fee_rate(pricing_cfg["default_platform_fee_rate"])
    payload["require_payment_receipt"] = 0
    payload["enrollment_payment_methods"] = None
    _normalize_competition_theme(payload)
    _normalize_competition_visibility(payload)
    _normalize_rm_unit_field(payload)
    _normalize_competition_dates(payload)
    _validate_competition_dates(payload)
    _serialize_schedule_items(payload)
    _serialize_landing_sections(payload)
    _serialize_social_links(payload)
    _serialize_enrollment_questions(payload)
    if is_organizer_user(user):
        payload["organizer_user_id"] = get_current_user_id(user)
    payload["slug"] = _generate_slug(payload["nombre"], session)
    competition = Competition.model_validate(payload)
    session.add(competition)
    session.commit()
    session.refresh(competition)
    return competition


@router.put("/{competition_id}", response_model=Competition)
def update_competition(competition_id: int, body: CompetitionUpdate,
                       session: Session = Depends(get_session), user=Depends(require_staff)):
    c = require_competition_access(session, competition_id, user)

    data = body.model_dump(exclude_unset=True)
    if "scoring_mode" in data and data["scoring_mode"] not in COMP_SCORING_VALIDOS:
        raise HTTPException(400, "scoring_mode invalido. Usa: highest_wins o lowest_wins")
    if user.get("role") != "admin":
        data.pop("organizer_user_id", None)
    merged = c.model_dump()
    merged.update(data)
    _normalize_competition_team_settings(merged)
    _validate_competition_team_settings(merged)
    for key in ("individual_enabled", "team_enabled", "team_categories_enabled", "team_size", "team_membership_rule"):
        if key in data:
            data[key] = merged[key]
    _validate_tv_settings(data)
    if "lugar" in data:
        data["lugar"] = str(data.get("lugar") or "").strip() or None
    if "contact_phone" in data:
        data["contact_phone"] = str(data.get("contact_phone") or "").strip() or None
    if "website_url" in data:
        data["website_url"] = str(data.get("website_url") or "").strip() or None
    if "enrollment_intro_text" in data:
        data["enrollment_intro_text"] = str(data.get("enrollment_intro_text") or "").strip() or None
    if "general_info_text" in data:
        data["general_info_text"] = str(data.get("general_info_text") or "").strip() or None
    if "enrollment_terms_text" in data:
        data["enrollment_terms_text"] = str(data.get("enrollment_terms_text") or "").strip() or None
    pricing_cfg = get_pricing_config(session)
    data["platform_fee_rate"] = _normalize_platform_fee_rate(pricing_cfg["default_platform_fee_rate"])
    data["require_payment_receipt"] = 0
    data["enrollment_payment_methods"] = None
    _normalize_competition_theme(data)
    _normalize_competition_visibility(data)
    _normalize_rm_unit_field(data)
    _normalize_competition_dates(data)
    _validate_competition_dates(data)
    _serialize_schedule_items(data)
    _serialize_landing_sections(data)
    _serialize_social_links(data)
    _serialize_enrollment_questions(data)
    if c.slug is None or ("nombre" in data and data["nombre"] and data["nombre"].strip() != c.nombre.strip()):
        data["slug"] = _generate_slug(data.get("nombre", c.nombre), session, exclude_id=competition_id)
    for field, value in data.items():
        setattr(c, field, value)

    session.add(c)
    session.commit()
    session.refresh(c)
    return c


@router.delete("/{competition_id}", status_code=204)
def delete_competition(competition_id: int, session: Session = Depends(get_session), user=Depends(require_staff)):
    c = require_competition_access(session, competition_id, user)
    session.delete(c)
    session.commit()


@router.post("/{competition_id}/assets")
def upload_competition_asset(
    competition_id: int,
    asset_type: str,
    file: UploadFile = File(...),
    session: Session = Depends(get_session),
    user=Depends(require_staff),
):
    competition = require_competition_access(session, competition_id, user)
    spec = COMPETITION_ASSET_SPECS.get(asset_type)
    if not spec:
        raise HTTPException(400, "asset_type invalido")
    field_name = spec["field"]
    previous_asset = getattr(competition, field_name, None)
    new_asset = _process_competition_asset(file, competition_id, asset_type)
    setattr(competition, field_name, new_asset)
    session.add(competition)
    session.commit()
    session.refresh(competition)
    _delete_local_competition_asset(previous_asset)
    return {
        "ok": True,
        "asset_type": asset_type,
        "url": new_asset,
        "competition": competition.model_dump(),
    }


@router.delete("/{competition_id}/assets")
def delete_competition_asset(
    competition_id: int,
    asset_type: str,
    session: Session = Depends(get_session),
    user=Depends(require_staff),
):
    competition = require_competition_access(session, competition_id, user)
    spec = COMPETITION_ASSET_SPECS.get(asset_type)
    if not spec:
        raise HTTPException(400, "asset_type invalido")
    field_name = spec["field"]
    previous_asset = getattr(competition, field_name, None)
    setattr(competition, field_name, None)
    session.add(competition)
    session.commit()
    session.refresh(competition)
    _delete_local_competition_asset(previous_asset)
    return {
        "ok": True,
        "asset_type": asset_type,
        "competition": competition.model_dump(),
    }


# ── Timer ──────────────────────────────────────────────────────────────────────

def _compute_timer(c: Competition, now: Optional[datetime] = None) -> dict:
    duration = c.timer_duration or 0
    elapsed_before = c.timer_elapsed_before_pause or 0
    started_at = c.timer_started_at
    mode = c.timer_mode or "countdown"
    fmt = c.timer_format or "mm:ss"
    current_time = now or datetime.now(timezone.utc)

    # For countdown mode, require a valid duration
    if mode == "countdown" and duration <= 0:
        return {"duration": 0, "elapsed_before_pause": 0, "started_at": None, "state": "stopped", "mode": mode, "format": fmt}

    if started_at is not None:
        total_elapsed = elapsed_before + (current_time - started_at).total_seconds()
        if mode == "countdown":
            state = "finished" if total_elapsed >= duration else "running"
        else:
            state = "running"
    elif elapsed_before > 0:
        state = "paused"
    else:
        state = "stopped"

    return {
        "duration": duration,
        "elapsed_before_pause": elapsed_before,
        "started_at": started_at.isoformat() if started_at else None,
        "state": state,
        "mode": mode,
        "format": fmt,
        "server_now": current_time.isoformat(),
    }


@router.get("/{competition_id}/timer")
def get_timer(
    competition_id: int,
    session: Session = Depends(get_session),
    user=Depends(get_current_user_optional),
):
    c = require_competition_access(session, competition_id, user)
    return _compute_timer(c, now=datetime.now(timezone.utc))


class TimerActionBody(BaseModel):
    action: str               # start | pause | reset | set | config | set_current
    duration: Optional[int] = None   # seconds, required for "set" countdown
    current_seconds: Optional[int] = None  # seconds shown on clock (elapsed for stopwatch, remaining for countdown)
    mode: Optional[str] = None       # "countdown" | "stopwatch"
    format: Optional[str] = None     # "mm:ss" | "mmm:ss" | "hh:mm:ss"


@router.post("/{competition_id}/timer")
def control_timer(
    competition_id: int,
    body: TimerActionBody,
    session: Session = Depends(get_session),
    user=Depends(require_staff),
):
    c = require_competition_access(session, competition_id, user)

    now = datetime.now(timezone.utc)

    if body.action == "config":
        # Update mode and/or format without resetting timer
        if body.mode in ("countdown", "stopwatch"):
            c.timer_mode = body.mode
        if body.format in ("mm:ss", "mmm:ss", "hh:mm:ss"):
            c.timer_format = body.format
        # If switching to stopwatch, clear duration requirement
        if body.mode == "stopwatch":
            c.timer_duration = 0
            c.timer_started_at = None
            c.timer_elapsed_before_pause = 0

    elif body.action == "set":
        if not body.duration or body.duration <= 0:
            raise HTTPException(400, "Se requiere duration en segundos mayor a 0")
        c.timer_duration = body.duration
        c.timer_started_at = None
        c.timer_elapsed_before_pause = 0
        c.timer_mode = "countdown"

    elif body.action == "start":
        mode = c.timer_mode or "countdown"
        if mode == "countdown" and (not c.timer_duration or c.timer_duration <= 0):
            raise HTTPException(400, "Configura la duracion antes de iniciar")
        if c.timer_started_at is None:
            c.timer_started_at = now

    elif body.action == "pause":
        if c.timer_started_at is not None:
            elapsed = c.timer_elapsed_before_pause + (now - c.timer_started_at).total_seconds()
            if (c.timer_mode or "countdown") == "stopwatch":
                c.timer_elapsed_before_pause = int(max(0, elapsed))
            else:
                c.timer_elapsed_before_pause = int(min(max(0, elapsed), c.timer_duration or 0))
            c.timer_started_at = None

    elif body.action == "set_current":
        if body.current_seconds is None or body.current_seconds < 0:
            raise HTTPException(400, "Se requiere current_seconds mayor o igual a 0")
        mode = c.timer_mode or "countdown"
        if mode == "stopwatch":
            c.timer_elapsed_before_pause = int(body.current_seconds)
            c.timer_started_at = None
        else:
            if not c.timer_duration or c.timer_duration <= 0:
                raise HTTPException(400, "Configura la duracion antes de ajustar el valor actual")
            remaining = int(min(body.current_seconds, c.timer_duration))
            c.timer_elapsed_before_pause = int(c.timer_duration - remaining)
            c.timer_started_at = None

    elif body.action == "reset":
        c.timer_started_at = None
        c.timer_elapsed_before_pause = 0

    else:
        raise HTTPException(400, "Accion invalida: start | pause | reset | set | config | set_current")

    session.add(c)
    session.commit()
    session.refresh(c)
    return _compute_timer(c, now=now)
