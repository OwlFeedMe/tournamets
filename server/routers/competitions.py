import io
import os
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel
import qrcode
from sqlmodel import Session, select

from access import get_owned_competition_ids, require_competition_access
from auth import get_current_user_optional, require_staff
from database import get_session
from models import Competition, CompetitionCreate, CompetitionUpdate

router = APIRouter(prefix="/api/competitions", tags=["competitions"])
COMP_SCORING_VALIDOS = {"highest_wins", "lowest_wins"}
TV_ROTATION_MIN_SECONDS = 5
TV_ROTATION_MAX_SECONDS = 120
TV_REFRESH_MIN_SECONDS = 2
TV_REFRESH_MAX_SECONDS = 60
TV_MODE_VALIDOS = {"cyclic", "static"}
TV_VIEW_VALIDOS = {"individual", "teams"}


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


def _leaderboard_public_url(competition_id: int) -> str:
    base = (os.getenv("LEADERBOARD_BASE_URL") or "http://localhost:5173/").strip()
    if not base.endswith("/"):
        base += "/"
    return f"{base}leaderboard/{competition_id}"


@router.get("", response_model=List[Competition])
def list_competitions(
    session: Session = Depends(get_session),
    user=Depends(get_current_user_optional),
):
    query = select(Competition).order_by(Competition.created_at.desc())
    owned_ids = get_owned_competition_ids(session, user)
    if user and user.get("role") == "organizer":
        query = query.where(Competition.id.in_(owned_ids))
    return session.exec(query).all()


@router.get("/{competition_id}", response_model=Competition)
def get_competition(
    competition_id: int,
    session: Session = Depends(get_session),
    user=Depends(get_current_user_optional),
):
    return require_competition_access(session, competition_id, user)


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
    _validate_tv_settings(payload)
    if user.get("role") == "organizer":
        payload["organizer_user_id"] = user.get("app_user_id")
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
    _validate_tv_settings(data)
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
