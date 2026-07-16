import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
SCHEDULE_ROUTER = ROOT / "server" / "routers" / "schedule.py"
ADMIN_PAGE = ROOT / "client" / "src" / "pages" / "AdminCompetitionCommandProposal.jsx"
MODELS = ROOT / "server" / "models.py"


class ScheduleHeatRescheduleContractTests(unittest.TestCase):
    def test_backend_exposes_preview_and_atomic_apply_routes(self):
        source = SCHEDULE_ROUTER.read_text(encoding="utf-8")

        self.assertIn('"/{competition_id}/phases/{phase_id}/heats/reschedule/preview"', source)
        self.assertIn('"/{competition_id}/phases/{phase_id}/heats/reschedule"', source)
        self.assertIn("if conflicts:", source)
        self.assertIn("session.commit()", source)
        self.assertIn("heat.heat_transition_seconds = heat_gap_seconds", source)
        self.assertIn("heat.category_transition_seconds = category_gap_seconds", source)

    def test_phase_persists_duration_configuration(self):
        source = MODELS.read_text(encoding="utf-8")
        self.assertIn("heat_duration_seconds: int = Field(default=900)", source)
        self.assertIn("heat_duration_seconds: Optional[int] = None", source)

    def test_admin_requires_preview_before_applying(self):
        source = ADMIN_PAGE.read_text(encoding="utf-8")

        self.assertIn("Configurar tiempos", source)
        self.assertIn("Previsualizar cambios", source)
        self.assertIn("Aplicar nueva programacion", source)
        self.assertIn("!timingPreview || !!timingPreview.conflicts?.length", source)
        self.assertIn("shift_following_blocks", source)


if __name__ == "__main__":
    unittest.main()
