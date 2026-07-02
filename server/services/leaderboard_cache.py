import os

from cache import Cache, Keys

LEADERBOARD_RESULTS_SNAPSHOT_TTL_SECONDS = int(
    os.getenv("LEADERBOARD_RESULTS_SNAPSHOT_TTL_SECONDS", "900")
)
LEADERBOARD_RESULTS_SNAPSHOT_SCHEMA_VERSION = "v4"


def leaderboard_results_snapshot_key(competition_id: int) -> str:
    base_key = Keys.RESULTS_SNAPSHOT.format(competition_id=int(competition_id))
    return f"{base_key}:{LEADERBOARD_RESULTS_SNAPSHOT_SCHEMA_VERSION}"


def get_leaderboard_results_snapshot(competition_id: int):
    return Cache.get(leaderboard_results_snapshot_key(competition_id))


def set_leaderboard_results_snapshot(competition_id: int, payload: dict) -> None:
    Cache.set(
        leaderboard_results_snapshot_key(competition_id),
        payload,
        ttl=LEADERBOARD_RESULTS_SNAPSHOT_TTL_SECONDS,
    )


def invalidate_leaderboard_results_snapshot(competition_id: int | None) -> None:
    if competition_id is None:
        return
    Cache.delete(leaderboard_results_snapshot_key(int(competition_id)))
