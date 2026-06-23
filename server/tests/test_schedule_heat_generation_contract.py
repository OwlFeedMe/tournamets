from pathlib import Path
import unittest


SCHEDULE_ROUTER_PATH = Path(__file__).resolve().parents[1] / "routers" / "schedule.py"
CATEGORIES_ROUTER_PATH = Path(__file__).resolve().parents[1] / "routers" / "categories_phases.py"
SCHEDULE_PANEL_PATH = Path(__file__).resolve().parents[2] / "client" / "src" / "pages" / "adminCompetitionSchedulePanel.jsx"


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
        source = SCHEDULE_PANEL_PATH.read_text(encoding="utf-8")

        self.assertIn("Generar por categoria", source)
        self.assertIn("Generar una categoria", source)
        self.assertIn("Generar todos mezclados", source)
        self.assertIn("Ver resumen", source)
        self.assertIn("Mover atleta", source)
        self.assertNotIn("Todas / sin categoria", source)

    def test_category_order_has_dedicated_endpoint(self):
        backend = CATEGORIES_ROUTER_PATH.read_text(encoding="utf-8")
        frontend = SCHEDULE_PANEL_PATH.read_text(encoding="utf-8")

        self.assertIn("/categories/order", backend)
        self.assertIn("CategoryOrderUpdate", backend)
        self.assertIn("/categories/order", frontend)


if __name__ == "__main__":
    unittest.main()
