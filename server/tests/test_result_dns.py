import unittest
from types import SimpleNamespace
from unittest.mock import MagicMock

from fastapi import HTTPException

from models import ResultCreate, ResultUpdate
from routers.leaderboard import _aggregate_parent_team_rows, _build_team_rows_for_phase
from routers.results import _normalize_result_entry_status, _team_categories_map


class ResultDnsTests(unittest.TestCase):
    def test_team_scoring_uses_explicit_category_without_members(self):
        session = MagicMock()
        session.exec.side_effect = [
            SimpleNamespace(all=lambda: [
                SimpleNamespace(id=4, competition_id=7, team_category_id=2),
            ]),
            SimpleNamespace(all=lambda: [
                SimpleNamespace(id=2, competition_id=7, nombre="Intermedio"),
            ]),
            SimpleNamespace(all=lambda: []),
        ]

        categories = _team_categories_map(session, 7, {4})

        self.assertEqual(categories, {4: "Intermedio"})

    def test_result_schemas_accept_dns(self):
        create = ResultCreate(competition_id=7, team_id=12, phase_id=26, result_status="dns")
        update = ResultUpdate(result_status="dns")

        self.assertEqual(create.result_status, "dns")
        self.assertEqual(update.result_status, "dns")

    def test_result_status_validation(self):
        self.assertEqual(_normalize_result_entry_status("DNS"), "dns")
        self.assertEqual(_normalize_result_entry_status(None), "valid")
        with self.assertRaises(HTTPException):
            _normalize_result_entry_status("absent")

    def test_direct_team_dns_is_not_counted_as_attempt(self):
        rows = _build_team_rows_for_phase(
            teams=[SimpleNamespace(id=12, nombre="Kronos Team", team_category_id=None)],
            competition_id=7,
            phase_id=26,
            mode="total",
            mark_lower_is_better=False,
            points_lower_is_better=True,
            team_members_by_team={},
            ind_points_per_phase={},
            team_member_points_per_phase={},
            team_direct_per_phase={
                (26, 12): {
                    "sum": 0,
                    "count": 0,
                    "min": None,
                    "max": None,
                    "min_extra": None,
                    "max_extra": None,
                    "has_active_appeal": False,
                    "is_dns": True,
                },
            },
            categories_map={},
        )

        self.assertTrue(rows[0]["is_dns"])
        self.assertEqual(rows[0]["total_puntos"], 0)
        self.assertEqual(rows[0]["total_eventos"], 0)
        self.assertIsNone(rows[0]["mejor_marca"])

    def test_parent_is_dns_only_when_all_parts_are_dns(self):
        parent_rows = [{"id": 12, "team_category": "Avanzado"}]
        parts = [
            {"teams": [{"id": 12, "total_puntos": 0, "total_eventos": 0, "rank": 3, "is_dns": True}]},
            {"teams": [{"id": 12, "total_puntos": 0, "total_eventos": 0, "rank": 3, "is_dns": True}]},
        ]

        rows = _aggregate_parent_team_rows(
            parent_rows,
            parts,
            rank_by_category=True,
            lower_is_better=True,
            tiebreak="best_positions",
        )

        self.assertTrue(rows[0]["is_dns"])
        self.assertEqual(rows[0]["total_eventos"], 0)


if __name__ == "__main__":
    unittest.main()
