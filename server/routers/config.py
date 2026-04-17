from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select

from auth import require_admin
from database import get_session
from models import Competition, PlatformConfig, PlatformConfigUpdate

router = APIRouter(prefix="/api/config", tags=["config"])

_DEFAULTS = {
    "default_platform_fee_rate": "0.05",
    "bold_processor_rate": "0.0269",
    "bold_processor_fixed_fee": "300",
    "min_platform_fee": "5000",
}


def _load_config(session: Session) -> dict:
    rows = session.exec(select(PlatformConfig)).all()
    cfg = dict(_DEFAULTS)
    for row in rows:
        cfg[row.key] = row.value
    return cfg


def get_pricing_config(session: Session) -> dict:
    cfg = _load_config(session)
    try:
        fee_rate = float(cfg["default_platform_fee_rate"])
    except Exception:
        fee_rate = 0.05
    if fee_rate < 0 or fee_rate > 1:
        fee_rate = 0.05
    try:
        proc_rate = float(cfg["bold_processor_rate"])
    except Exception:
        proc_rate = 0.0269
    try:
        proc_fixed = int(cfg["bold_processor_fixed_fee"])
    except Exception:
        proc_fixed = 300
    try:
        min_fee = int(cfg["min_platform_fee"])
    except Exception:
        min_fee = 5000
    if min_fee < 0:
        min_fee = 0
    return {
        "default_platform_fee_rate": round(fee_rate, 4),
        "bold_processor_rate": round(proc_rate, 6),
        "bold_processor_fixed_fee": proc_fixed,
        "min_platform_fee": min_fee,
    }


@router.get("/pricing")
def read_pricing_config(session: Session = Depends(get_session)):
    """Public endpoint — frontend reads fee rates from here (no hardcoded constants)."""
    return get_pricing_config(session)


@router.put("/pricing")
def update_pricing_config(
    body: PlatformConfigUpdate,
    session: Session = Depends(get_session),
    user=Depends(require_admin),
):
    updates = {}
    if body.default_platform_fee_rate is not None:
        rate = float(body.default_platform_fee_rate)
        if rate < 0 or rate > 1:
            raise HTTPException(400, "default_platform_fee_rate debe estar entre 0 y 1")
        updates["default_platform_fee_rate"] = str(round(rate, 4))
    if body.bold_processor_rate is not None:
        pr = float(body.bold_processor_rate)
        if pr < 0 or pr > 1:
            raise HTTPException(400, "bold_processor_rate debe estar entre 0 y 1")
        updates["bold_processor_rate"] = str(round(pr, 6))
    if body.bold_processor_fixed_fee is not None:
        pf = int(body.bold_processor_fixed_fee)
        if pf < 0:
            raise HTTPException(400, "bold_processor_fixed_fee no puede ser negativo")
        updates["bold_processor_fixed_fee"] = str(pf)
    if body.min_platform_fee is not None:
        mf = int(body.min_platform_fee)
        if mf < 0:
            raise HTTPException(400, "min_platform_fee no puede ser negativo")
        updates["min_platform_fee"] = str(mf)

    for key, value in updates.items():
        row = session.get(PlatformConfig, key)
        if row:
            row.value = value
            session.add(row)
        else:
            session.add(PlatformConfig(key=key, value=value))

    # Keep legacy per-competition column aligned with the global pricing rule.
    if "default_platform_fee_rate" in updates:
        target_rate = float(updates["default_platform_fee_rate"])
        competitions = session.exec(select(Competition)).all()
        for competition in competitions:
            competition.platform_fee_rate = target_rate
            session.add(competition)
    session.commit()
    return {"ok": True, "config": get_pricing_config(session)}
