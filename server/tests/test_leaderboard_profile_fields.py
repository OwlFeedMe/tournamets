from pathlib import Path
import unittest


LEADERBOARD_ROUTER_PATH = Path(__file__).resolve().parents[1] / "routers" / "leaderboard.py"
LEADERBOARD_CACHE_PATH = Path(__file__).resolve().parents[1] / "services" / "leaderboard_cache.py"


class LeaderboardProfileFieldsContractTest(unittest.TestCase):
    def test_profile_fields_are_selected_and_serialized(self):
        source = LEADERBOARD_ROUTER_PATH.read_text(encoding="utf-8")

        for field in ("profile_photo_url", "ciudad_pais", "box"):
            self.assertIn(f"p.{field}", source)
            self.assertIn(f'"{field}": r["{field}"]', source)
            self.assertIn(f'"{field}": p.get("{field}")', source)
            self.assertIn(f'"{field}": member.get("{field}")', source)

    def test_leaderboard_snapshot_cache_is_schema_versioned(self):
        source = LEADERBOARD_CACHE_PATH.read_text(encoding="utf-8")

        self.assertIn("LEADERBOARD_RESULTS_SNAPSHOT_SCHEMA_VERSION", source)
        self.assertIn('return f"{base_key}:{LEADERBOARD_RESULTS_SNAPSHOT_SCHEMA_VERSION}"', source)


if __name__ == "__main__":
    unittest.main()
