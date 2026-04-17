from pathlib import Path
import unittest


ADMIN_DASHBOARD_PATH = Path(__file__).resolve().parents[1] / "src" / "pages" / "AdminDashboard.jsx"


class AdminDashboardCompetitionDaysTimezoneTest(unittest.TestCase):
    def test_competition_day_generation_uses_calendar_safe_parser(self):
        source = ADMIN_DASHBOARD_PATH.read_text(encoding="utf-8")

        self.assertIn("function parseCalendarDate", source)
        self.assertNotIn("new Date(form.competition_start)", source)
        self.assertNotIn("new Date(form.competition_end)", source)
        self.assertNotIn("new Date(competition.competition_start)", source)
        self.assertNotIn("new Date(competition.competition_end)", source)


if __name__ == "__main__":
    unittest.main()
