import os
import platform
import time
from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.engine.url import make_url
from auth import require_admin
from cache import Cache
from database import engine

router = APIRouter(prefix="/api/system", tags=["system"])

APP_STARTED_AT = datetime.now(timezone.utc)
APP_STARTED_MONOTONIC = time.monotonic()
SYSTEM_STATUS_DB_TIMEOUT_MS = max(250, int(os.getenv("SYSTEM_STATUS_DB_TIMEOUT_MS", "2500")))


def _safe_database_target() -> dict:
    try:
        url = make_url(os.getenv("DATABASE_URL", ""))
        return {
            "driver": url.drivername,
            "host": url.host,
            "port": url.port,
            "database": url.database,
        }
    except Exception:
        return {
            "driver": None,
            "host": None,
            "port": None,
            "database": None,
        }


def _pool_snapshot() -> dict:
    pool = engine.pool
    size = None
    checked_out = None
    overflow = None
    status_text = ""
    try:
        size = int(pool.size())
    except Exception:
        size = None
    try:
        checked_out = int(pool.checkedout())
    except Exception:
        checked_out = None
    try:
        overflow = int(pool.overflow())
    except Exception:
        overflow = None
    try:
        status_text = str(pool.status())
    except Exception:
        status_text = ""
    return {
        "size": size,
        "checked_out": checked_out,
        "overflow": overflow,
        "status_text": status_text,
        "configured_pool_size": int(os.getenv("DB_POOL_SIZE", "3")),
        "configured_max_overflow": int(os.getenv("DB_MAX_OVERFLOW", "2")),
        "configured_pool_timeout_seconds": int(os.getenv("DB_POOL_TIMEOUT_SECONDS", "15")),
        "configured_pool_recycle_seconds": int(os.getenv("DB_POOL_RECYCLE_SECONDS", "1800")),
    }


@router.get("/status")
def read_system_status(user=Depends(require_admin)):
    del user

    now = datetime.now(timezone.utc)
    uptime_seconds = max(0, int(time.monotonic() - APP_STARTED_MONOTONIC))
    cache_ok = Cache.ping()
    db_target = _safe_database_target()

    database = {
        "ok": True,
        "latency_ms": None,
        "server_version": None,
        "current_database": None,
        "current_user": None,
        "max_connections": None,
        "superuser_reserved_connections": None,
        "activity_totals": {
            "total": None,
            "active": None,
            "idle": None,
            "idle_in_transaction": None,
        },
        "activity_summary": [],
        "target": db_target,
    }

    try:
        started = time.perf_counter()
        with engine.begin() as conn:
            # Keep timeout scoped to this transaction only; never leak it back into pooled connections.
            conn.execute(text(f"SET LOCAL statement_timeout = {SYSTEM_STATUS_DB_TIMEOUT_MS}"))
            database["current_database"] = conn.execute(text("select current_database()")).scalar_one()
            database["current_user"] = conn.execute(text("select current_user")).scalar_one()
            database["server_version"] = conn.execute(text("show server_version")).scalar_one()
            database["max_connections"] = int(conn.execute(text("show max_connections")).scalar_one())
            database["superuser_reserved_connections"] = int(
                conn.execute(text("show superuser_reserved_connections")).scalar_one()
            )
            database["latency_ms"] = round((time.perf_counter() - started) * 1000, 1)

            totals = conn.execute(text("""
                select
                    count(*)::int as total,
                    count(*) filter (where state = 'active')::int as active,
                    count(*) filter (where state = 'idle')::int as idle,
                    count(*) filter (where state = 'idle in transaction')::int as idle_in_transaction
                from pg_stat_activity
                where datname = current_database()
            """)).mappings().one()
            database["activity_totals"] = {
                "total": int(totals["total"] or 0),
                "active": int(totals["active"] or 0),
                "idle": int(totals["idle"] or 0),
                "idle_in_transaction": int(totals["idle_in_transaction"] or 0),
            }

            summary_rows = conn.execute(text("""
                select
                    coalesce(nullif(application_name, ''), '(sin nombre)') as application_name,
                    coalesce(state, 'unknown') as state,
                    count(*)::int as total
                from pg_stat_activity
                where datname = current_database()
                group by application_name, state
                order by total desc, application_name asc, state asc
                limit 12
            """)).mappings().all()
            database["activity_summary"] = [
                {
                    "application_name": row["application_name"],
                    "state": row["state"],
                    "total": int(row["total"] or 0),
                }
                for row in summary_rows
            ]
    except Exception as exc:
        database["ok"] = False
        database["error"] = str(exc)

    return {
        "generated_at": now,
        "app": {
            "name": "FinalRep API",
            "environment": os.getenv("APP_ENV", "development"),
            "started_at": APP_STARTED_AT,
            "uptime_seconds": uptime_seconds,
            "python_version": platform.python_version(),
            "platform": platform.platform(),
            "process_id": os.getpid(),
        },
        "server": {
            "host": os.getenv("HOST", "0.0.0.0"),
            "port": int(os.getenv("PORT", "8000")),
            "cors_allowed_origins": [
                origin.strip()
                for origin in os.getenv("CORS_ALLOWED_ORIGINS", "http://localhost:5173,http://localhost:3000").split(",")
                if origin.strip()
            ],
        },
        "database": database,
        "pool": _pool_snapshot(),
        "cache": {
            "enabled": os.getenv("CACHE_ENABLED", "1") == "1",
            "connected": bool(cache_ok),
            "redis_url_configured": bool(os.getenv("REDIS_URL", "").strip()),
        },
    }
