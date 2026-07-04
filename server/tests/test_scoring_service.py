import sys
import unittest
from pathlib import Path
from types import SimpleNamespace


SERVER_PATH = Path(__file__).resolve().parents[1]
if str(SERVER_PATH) not in sys.path:
    sys.path.insert(0, str(SERVER_PATH))

from services.scoring import (
    compute_result_points,
    competition_total_lower_is_better,
    normalize_scoring_table,
    phase_scoring_config,
)


def competition(**overrides):
    data = {
        "scoring_system": "dynamic_points",
        "scoring_scope": "category",
        "scoring_table": None,
        "scoring_tiebreak": "best_positions",
        "cumulative_direction": "higher_wins",
        "scoring_mode": "highest_wins",
    }
    data.update(overrides)
    return SimpleNamespace(**data)


def phase(**overrides):
    data = {
        "id": 1,
        "nombre": "WOD 1",
        "scoring_override_enabled": 0,
        "scoring_system": None,
        "scoring_weight_percent": 100,
        "scoring_table": None,
    }
    data.update(overrides)
    return SimpleNamespace(**data)


class ScoringServiceTest(unittest.TestCase):
    def test_dynamic_points_decrease_by_position(self):
        points = compute_result_points(position=2, total_ranked=10, mark=120, competition=competition())

        self.assertEqual(points, 9)

    def test_placement_uses_position_and_lower_total_wins(self):
        comp = competition(scoring_system="placement")

        points = compute_result_points(position=3, total_ranked=10, mark=120, competition=comp)

        self.assertEqual(points, 3)
        self.assertTrue(competition_total_lower_is_better(comp))

    def test_fixed_table_uses_exact_rank_and_zero_beyond_table(self):
        comp = competition(scoring_system="fixed_table", scoring_table='[{"rank":1,"points":100},{"rank":2,"points":90}]')

        self.assertEqual(compute_result_points(position=2, total_ranked=10, mark=120, competition=comp), 90)
        self.assertEqual(compute_result_points(position=3, total_ranked=10, mark=120, competition=comp), 0)

    def test_cumulative_uses_mark_and_direction(self):
        comp = competition(scoring_system="cumulative", cumulative_direction="lower_wins")

        points = compute_result_points(position=5, total_ranked=10, mark=312, competition=comp)

        self.assertEqual(points, 312)
        self.assertTrue(competition_total_lower_is_better(comp))

    def test_phase_override_and_weight_are_applied(self):
        comp = competition(scoring_system="dynamic_points")
        ph = phase(scoring_override_enabled=1, scoring_system="fixed_table", scoring_weight_percent=50, scoring_table=[{"rank": 1, "points": 200}])

        config = phase_scoring_config(comp, ph)
        points = compute_result_points(position=1, total_ranked=6, mark=20, competition=comp, phase=ph)

        self.assertEqual(config["system"], "fixed_table")
        self.assertEqual(points, 100)

    def test_dnf_marks_do_not_become_cumulative_points(self):
        comp = competition(scoring_system="cumulative")

        points = compute_result_points(position=10, total_ranked=10, mark=2147483647, competition=comp)

        self.assertEqual(points, 0)

    def test_scoring_table_normalization_sorts_and_deduplicates(self):
        table = normalize_scoring_table([{"rank": 2, "points": 90}, {"rank": 1, "points": 100}, {"rank": 2, "points": 95}])

        self.assertEqual(table, [{"rank": 1, "points": 100}, {"rank": 2, "points": 95}])


if __name__ == "__main__":
    unittest.main()
