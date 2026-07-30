import unittest
from pathlib import Path


PAGE_PATH = Path(__file__).resolve().parents[1] / "src" / "pages" / "AnnouncerDesk.jsx"


class AnnouncerMultipleCompetitionsContractTest(unittest.TestCase):
    def test_announcer_can_switch_between_active_competitions(self):
        source = PAGE_PATH.read_text(encoding="utf-8")

        self.assertIn("activeAssignments.find(", source)
        self.assertIn('aria-label="Competencia de locución"', source)
        self.assertIn("setCompetitionId(event.target.value)", source)
        self.assertIn("activeAssignments.map((item)", source)

    def test_switching_competition_clears_stale_live_state(self):
        source = PAGE_PATH.read_text(encoding="utf-8")

        self.assertIn("setLive(null)", source)
        self.assertIn("setManualHeatId('')", source)
        self.assertIn("setLiveMode(true)", source)


if __name__ == "__main__":
    unittest.main()
