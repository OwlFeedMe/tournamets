import sys
import unittest
from pathlib import Path


SERVER_PATH = Path(__file__).resolve().parents[1]
if str(SERVER_PATH) not in sys.path:
    sys.path.insert(0, str(SERVER_PATH))

from routers.leaderboard import _sort_total_rows


class LeaderboardTotalTiebreakTest(unittest.TestCase):
    def test_total_tie_uses_best_phase_positions(self):
        rows = [
            {"id": 1, "total_puntos": 100, "total_eventos": 3, "total_position_tiebreak": [2, 3, 4]},
            {"id": 2, "total_puntos": 100, "total_eventos": 3, "total_position_tiebreak": [1, 7, 5]},
        ]

        ordered = _sort_total_rows(rows, lower_is_better=False)

        self.assertEqual([row["id"] for row in ordered], [2, 1])

    def test_total_tie_counts_next_best_position(self):
        rows = [
            {"id": 1, "total_puntos": 100, "total_eventos": 3, "total_position_tiebreak": [1, 3, 4]},
            {"id": 2, "total_puntos": 100, "total_eventos": 3, "total_position_tiebreak": [1, 2, 5]},
        ]

        ordered = _sort_total_rows(rows, lower_is_better=False)

        self.assertEqual([row["id"] for row in ordered], [2, 1])


if __name__ == "__main__":
    unittest.main()
