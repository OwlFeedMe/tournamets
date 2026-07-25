import unittest
from pathlib import Path
from types import SimpleNamespace

from routers.leaderboard import _aggregate_parent_team_rows, _build_team_rows_for_phase


LEADERBOARD_SOURCE = Path(__file__).resolve().parents[1] / "routers" / "leaderboard.py"


class TeamScoringPartsLeaderboardContractTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.source = LEADERBOARD_SOURCE.read_text(encoding="utf-8")

    def test_hidden_scoring_parts_are_loaded_for_visible_parent(self):
        phase_query_start = self.source.index("all_phases = session.exec(")
        phase_partition_end = self.source.index("phase_status_map =", phase_query_start)
        phase_block = self.source[phase_query_start:phase_partition_end]

        self.assertNotIn(".where(CompetitionPhase.is_visible == 1)", phase_block)
        self.assertIn(
            'elif int(getattr(phase, "is_visible", 1) or 0) == 1:',
            phase_block,
        )
        self.assertIn("children_by_parent[parent_id].append(phase)", phase_block)

    def test_team_scoring_parts_are_aggregated_into_parent(self):
        self.assertIn("def _aggregate_parent_team_rows(", self.source)
        self.assertIn(
            'payload["teams"] = _aggregate_parent_team_rows(',
            self.source,
        )

        parent_rows = [
            {"id": 1, "team_category": "Intermedio", "total_puntos": 0, "total_eventos": 0},
            {"id": 2, "team_category": "Intermedio", "total_puntos": 0, "total_eventos": 0},
        ]
        child_payloads = [
            {
                "teams": [
                    {"id": 1, "total_puntos": 2, "total_eventos": 1, "rank": 2},
                    {"id": 2, "total_puntos": 1, "total_eventos": 1, "rank": 1},
                ],
            },
            {
                "teams": [
                    {"id": 1, "total_puntos": 2, "total_eventos": 1, "rank": 2},
                    {"id": 2, "total_puntos": 1, "total_eventos": 1, "rank": 1},
                ],
            },
        ]

        rows = _aggregate_parent_team_rows(
            parent_rows,
            child_payloads,
            rank_by_category=True,
            lower_is_better=True,
            tiebreak="best_positions",
        )
        by_id = {row["id"]: row for row in rows}

        self.assertEqual(by_id[1]["total_puntos"], 4)
        self.assertEqual(by_id[1]["total_eventos"], 2)
        self.assertEqual(by_id[1]["total_position_tiebreak"], [2, 2])
        self.assertEqual(by_id[1]["rank"], 2)
        self.assertEqual(by_id[2]["total_puntos"], 2)
        self.assertEqual(by_id[2]["rank"], 1)

    def test_direct_team_result_keeps_metric_in_single_member_part(self):
        rows = _build_team_rows_for_phase(
            teams=[SimpleNamespace(id=1, nombre="Loyal Team", team_category_id=None)],
            competition_id=7,
            phase_id=24,
            mode="single_member",
            mark_lower_is_better=False,
            points_lower_is_better=True,
            team_members_by_team={},
            ind_points_per_phase={},
            team_member_points_per_phase={},
            team_direct_per_phase={
                (24, 1): {
                    "sum": 3,
                    "count": 1,
                    "min": 12,
                    "max": 12,
                    "min_extra": None,
                    "max_extra": None,
                    "has_active_appeal": False,
                },
            },
            categories_map={},
        )

        self.assertEqual(rows[0]["total_puntos"], 3)
        self.assertEqual(rows[0]["total_eventos"], 1)
        self.assertEqual(rows[0]["mejor_marca"], 12)
        self.assertIsNone(rows[0]["extra"])

    def test_direct_team_time_result_keeps_cap_extra(self):
        rows = _build_team_rows_for_phase(
            teams=[SimpleNamespace(id=1, nombre="Loyal Team", team_category_id=None)],
            competition_id=7,
            phase_id=25,
            mode="single_member",
            mark_lower_is_better=True,
            points_lower_is_better=True,
            team_members_by_team={},
            ind_points_per_phase={},
            team_member_points_per_phase={},
            team_direct_per_phase={
                (25, 1): {
                    "sum": 2,
                    "count": 1,
                    "min": 600,
                    "max": 600,
                    "min_extra": 93,
                    "max_extra": 93,
                    "has_active_appeal": False,
                },
            },
            categories_map={},
        )

        self.assertEqual(rows[0]["mejor_marca"], 600)
        self.assertEqual(rows[0]["extra"], 93)


if __name__ == "__main__":
    unittest.main()
