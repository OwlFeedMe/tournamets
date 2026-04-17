from pathlib import Path
import unittest


SCHEDULE_ROUTER_PATH = Path(__file__).resolve().parents[1] / "routers" / "schedule.py"


class ScheduleVisibilityFilterTests(unittest.TestCase):
    def test_schedule_payload_filters_hidden_phases(self):
        source = SCHEDULE_ROUTER_PATH.read_text(encoding="utf-8")

        self.assertIn("visible_phase_ids", source)
        self.assertIn("int(phase.id) in visible_phase_ids", source)
        self.assertIn("CompetitionHeat.phase_id.in_(visible_phase_ids)", source)


if __name__ == "__main__":
    unittest.main()
