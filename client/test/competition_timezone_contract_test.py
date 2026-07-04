from pathlib import Path
import unittest


ROOT = Path(__file__).resolve().parents[1] / "src"
TIMEZONE_UTIL_PATH = ROOT / "utils" / "competitionTimeZone.js"
ADMIN_DASHBOARD_PATH = ROOT / "pages" / "AdminDashboard.jsx"
SCHEDULE_PANEL_PATH = ROOT / "pages" / "adminCompetitionSchedulePanel.jsx"
PUBLIC_SCHEDULE_PATH = ROOT / "pages" / "CompetitionSchedule.jsx"


class CompetitionTimezoneContractTest(unittest.TestCase):
    def test_timezone_utility_defines_official_competition_conversions(self):
        source = TIMEZONE_UTIL_PATH.read_text(encoding="utf-8")

        self.assertIn("DEFAULT_COMPETITION_TIMEZONE = 'America/Bogota'", source)
        self.assertIn("competitionDateTimeInputToUtc", source)
        self.assertIn("utcToCompetitionDateTimeInput", source)
        self.assertIn("timeZoneOffsetMs", source)

    def test_admin_and_schedule_views_use_competition_timezone_helpers(self):
        admin_source = ADMIN_DASHBOARD_PATH.read_text(encoding="utf-8")
        panel_source = SCHEDULE_PANEL_PATH.read_text(encoding="utf-8")
        public_source = PUBLIC_SCHEDULE_PATH.read_text(encoding="utf-8")

        self.assertIn("timezone: competitionTimeZone(form.timezone)", admin_source)
        self.assertIn("COMPETITION_TIMEZONE_OPTIONS", admin_source)
        self.assertIn("competitionDateTimeInputToUtc(form.first_heat_start_at, competition?.timezone)", panel_source)
        self.assertIn("utcToCompetitionDateTimeInput(item.start_at, competition?.timezone)", panel_source)
        self.assertIn("formatCompetitionDateTime(value, timeZone", public_source)
        self.assertIn("formatCompetitionTimeZoneLabel(timeZone)", public_source)


if __name__ == "__main__":
    unittest.main()
