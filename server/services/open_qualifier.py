"""Open terms and entry state, independent from confirmed competition rosters."""
import json
from datetime import datetime, timezone
from decimal import Decimal, ROUND_HALF_UP

from fastapi import HTTPException


def config_for(comp):
    return json.loads(getattr(comp, "open_config", None) or "{}")


def require_direct_registration(comp):
    if config_for(comp).get("enabled"):
        raise HTTPException(409, "Debes pagar y completar el Open para clasificar a esta competencia")


def utc(value):
    if isinstance(value, str):
        value = datetime.fromisoformat(value.replace("Z", "+00:00"))
    return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value.astimezone(timezone.utc)


def final_price(full_price, open_price, mode, discount):
    if mode == "none":
        return 0
    if mode == "difference":
        return max(0, full_price - open_price)
    if mode == "discount":
        return int((Decimal(full_price) * (100 - Decimal(str(discount))) / 100).quantize(Decimal("1"), rounding=ROUND_HALF_UP))
    return full_price


def entry_state(entry, config):
    if entry.status == "paid" and datetime.now(timezone.utc) >= utc(config["deadline"]):
        return "missing"
    return entry.status
