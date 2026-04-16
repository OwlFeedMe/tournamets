"""Redis cache wrapper with safe fallback.

Diseñado para degradar a DB sin crash si Redis esta caido.
Uso:
    from cache import Cache, Keys

    data = Cache.get(Keys.APP_USER.format(user_id=42))
    if data is None:
        data = load_from_db()
        Cache.set(Keys.APP_USER.format(user_id=42), data, ttl=60)
"""

from __future__ import annotations

import json
import logging
import os
import time
from threading import Lock
from typing import Any, Optional

try:
    import redis
    from redis.exceptions import RedisError
    _REDIS_AVAILABLE = True
except ImportError:  # pragma: no cover
    redis = None  # type: ignore
    RedisError = Exception  # type: ignore
    _REDIS_AVAILABLE = False

logger = logging.getLogger(__name__)

REDIS_URL = os.getenv("REDIS_URL", "").strip()
CACHE_ENABLED = os.getenv("CACHE_ENABLED", "1") == "1" and _REDIS_AVAILABLE and bool(REDIS_URL)

_CIRCUIT_FAIL_THRESHOLD = int(os.getenv("CACHE_CIRCUIT_FAIL_THRESHOLD", "10"))
_CIRCUIT_RESET_SECONDS = int(os.getenv("CACHE_CIRCUIT_RESET_SECONDS", "30"))

_pool: Optional["redis.ConnectionPool"] = None
_pool_lock = Lock()


def _get_pool() -> Optional["redis.ConnectionPool"]:
    global _pool
    if not CACHE_ENABLED:
        return None
    if _pool is not None:
        return _pool
    with _pool_lock:
        if _pool is None:
            _pool = redis.ConnectionPool.from_url(
                REDIS_URL,
                max_connections=int(os.getenv("REDIS_MAX_CONNECTIONS", "50")),
                socket_timeout=float(os.getenv("REDIS_SOCKET_TIMEOUT", "2")),
                socket_connect_timeout=float(os.getenv("REDIS_CONNECT_TIMEOUT", "2")),
                health_check_interval=30,
                decode_responses=True,
            )
    return _pool


def get_redis() -> Optional["redis.Redis"]:
    pool = _get_pool()
    if pool is None:
        return None
    return redis.Redis(connection_pool=pool)


class _CircuitBreaker:
    """Breaker simple. Si Redis falla N veces seguidas, abre circuito por T seg."""

    def __init__(self) -> None:
        self._fails = 0
        self._opened_at: float = 0.0
        self._lock = Lock()

    def allow(self) -> bool:
        with self._lock:
            if self._opened_at == 0.0:
                return True
            if time.monotonic() - self._opened_at >= _CIRCUIT_RESET_SECONDS:
                self._opened_at = 0.0
                self._fails = 0
                return True
            return False

    def record_success(self) -> None:
        with self._lock:
            self._fails = 0
            self._opened_at = 0.0

    def record_failure(self) -> None:
        with self._lock:
            self._fails += 1
            if self._fails >= _CIRCUIT_FAIL_THRESHOLD and self._opened_at == 0.0:
                self._opened_at = time.monotonic()
                logger.warning(
                    "cache circuit OPEN after %s failures, pausing %ss",
                    self._fails,
                    _CIRCUIT_RESET_SECONDS,
                )


_breaker = _CircuitBreaker()


class Cache:
    """Safe wrapper. Redis down → degrada a None silencioso."""

    @staticmethod
    def get(key: str) -> Optional[Any]:
        if not CACHE_ENABLED or not _breaker.allow():
            return None
        client = get_redis()
        if client is None:
            return None
        try:
            raw = client.get(key)
        except RedisError as e:
            _breaker.record_failure()
            logger.warning("cache.get fail %s: %s", key, e)
            return None
        _breaker.record_success()
        if raw is None:
            return None
        try:
            return json.loads(raw)
        except (ValueError, TypeError) as e:
            logger.warning("cache.get decode fail %s: %s", key, e)
            return None

    @staticmethod
    def set(key: str, value: Any, ttl: int = 60) -> None:
        if not CACHE_ENABLED or not _breaker.allow():
            return
        client = get_redis()
        if client is None:
            return
        try:
            payload = json.dumps(value, default=str)
        except (TypeError, ValueError) as e:
            logger.warning("cache.set encode fail %s: %s", key, e)
            return
        try:
            client.setex(key, ttl, payload)
        except RedisError as e:
            _breaker.record_failure()
            logger.warning("cache.set fail %s: %s", key, e)
            return
        _breaker.record_success()

    @staticmethod
    def delete(*keys: str) -> None:
        if not CACHE_ENABLED or not keys or not _breaker.allow():
            return
        client = get_redis()
        if client is None:
            return
        try:
            client.delete(*keys)
        except RedisError as e:
            _breaker.record_failure()
            logger.warning("cache.delete fail %s: %s", keys, e)
            return
        _breaker.record_success()

    @staticmethod
    def delete_pattern(pattern: str) -> None:
        if not CACHE_ENABLED or not _breaker.allow():
            return
        client = get_redis()
        if client is None:
            return
        try:
            for key in client.scan_iter(match=pattern, count=500):
                client.delete(key)
        except RedisError as e:
            _breaker.record_failure()
            logger.warning("cache.delete_pattern fail %s: %s", pattern, e)
            return
        _breaker.record_success()

    @staticmethod
    def ping() -> bool:
        if not CACHE_ENABLED:
            return False
        client = get_redis()
        if client is None:
            return False
        try:
            return bool(client.ping())
        except RedisError:
            return False


class Keys:
    """Namespaces de claves. Centralizados para evitar typos."""

    APP_USER = "auth:user:{user_id}"
    OWNED_COMPS = "auth:owned_comps:{user_id}"
    LEADERBOARD = "leaderboard:{competition_id}"
    COMP_CONFIG = "comp:{competition_id}:config"
    RATE_LIMIT = "rl:{scope}:{ident}"
    JWT_REVOKED = "revoked:{jti}"
