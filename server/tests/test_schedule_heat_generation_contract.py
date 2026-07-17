from pathlib import Path
import unittest


SCHEDULE_ROUTER_PATH = Path(__file__).resolve().parents[1] / "routers" / "schedule.py"
CATEGORIES_ROUTER_PATH = Path(__file__).resolve().parents[1] / "routers" / "categories_phases.py"
COMMAND_PAGE_PATH = Path(__file__).resolve().parents[2] / "client" / "src" / "pages" / "AdminCompetitionCommandProposal.jsx"


class ScheduleHeatGenerationContractTests(unittest.TestCase):
    def test_backend_exposes_safe_generation_modes_and_preview(self):
        source = SCHEDULE_ROUTER_PATH.read_text(encoding="utf-8")

        self.assertIn("generation_mode", source)
        self.assertIn("by_category", source)
        self.assertIn('heats/generate/preview', source)
        self.assertIn("_group_entries_by_category", source)
        self.assertIn("_category_order_map", source)

    def test_backend_transfers_assignments_instead_of_duplicating(self):
        source = SCHEDULE_ROUTER_PATH.read_text(encoding="utf-8")

        self.assertIn("move-assignment", source)
        self.assertIn("CompetitionHeatAssignment.user_id == user_key", source)
        self.assertIn("CompetitionHeatAssignment.heat_id != int(heat.id)", source)
        self.assertIn('"source_empty"', source)

    def test_frontend_uses_explicit_generation_labels(self):
        source = COMMAND_PAGE_PATH.read_text(encoding="utf-8")

        self.assertIn("Generar heats", source)
        self.assertIn("Por categoria", source)
        self.assertIn("Mixto", source)
        self.assertIn("Previsualizar plan", source)
        self.assertIn("move-assignment", source)
        self.assertNotIn("Todas / sin categoria", source)

    def test_category_order_has_dedicated_endpoint(self):
        backend = CATEGORIES_ROUTER_PATH.read_text(encoding="utf-8")
        frontend = COMMAND_PAGE_PATH.read_text(encoding="utf-8")

        self.assertIn("/categories/order", backend)
        self.assertIn("CategoryOrderUpdate", backend)
        self.assertIn("/categories/order", frontend)

    def test_backend_blocks_overlapping_heats_in_same_location(self):
        source = SCHEDULE_ROUTER_PATH.read_text(encoding="utf-8")

        self.assertIn("_find_heat_location_conflicts", source)
        self.assertIn("_raise_heat_location_conflict", source)
        self.assertIn("No puedes programar heats solapados", source)
        self.assertIn("ignore_heat_ids", source)


if __name__ == "__main__":
    unittest.main()
