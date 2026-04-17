from pathlib import Path
import unittest


HOME_MODEL_PATH = Path(__file__).resolve().parents[1] / "src" / "components" / "home" / "homeModel.js"
EXPLORE_PAGES_PATH = Path(__file__).resolve().parents[1] / "src" / "pages" / "ExplorePages.jsx"
COMPETITION_ENROLLMENT_PATH = Path(__file__).resolve().parents[1] / "src" / "pages" / "CompetitionEnrollmentPage.jsx"
COMPETITION_LANDING_PATH = Path(__file__).resolve().parents[1] / "src" / "pages" / "CompetitionLanding.jsx"
COMPETITION_VARIANTS_PATH = Path(__file__).resolve().parents[1] / "src" / "pages" / "CompetitionVariants.jsx"
CALENDAR_DATE_PATH = Path(__file__).resolve().parents[1] / "src" / "utils" / "calendarDate.js"


class CompetitionDateFormattersContractTest(unittest.TestCase):
    def test_home_and_events_use_shared_competition_date_helpers(self):
        home_model_source = HOME_MODEL_PATH.read_text(encoding="utf-8")
        explore_pages_source = EXPLORE_PAGES_PATH.read_text(encoding="utf-8")
        calendar_date_source = CALENDAR_DATE_PATH.read_text(encoding="utf-8")

        self.assertIn("formatCompetitionDateRange", home_model_source)
        self.assertIn("formatEnrollmentDateRange", home_model_source)
        self.assertIn("formatCalendarDate", home_model_source)
        self.assertIn("slice(0, 10)", calendar_date_source)
        self.assertIn("new Date(year, month - 1, day)", calendar_date_source)
        self.assertNotIn("new Date(value)", home_model_source)
        self.assertIn("from '../components/home/homeModel'", explore_pages_source)
        self.assertIn("formatCompetitionWindow", explore_pages_source)
        self.assertNotIn("function formatDate(value)", explore_pages_source)
        self.assertNotIn("function formatCompetitionWindow(competition)", explore_pages_source)

    def test_competition_pages_use_calendar_date_helper_for_date_only_ranges(self):
        enrollment_source = COMPETITION_ENROLLMENT_PATH.read_text(encoding="utf-8")
        landing_source = COMPETITION_LANDING_PATH.read_text(encoding="utf-8")
        variants_source = COMPETITION_VARIANTS_PATH.read_text(encoding="utf-8")

        self.assertIn("formatCalendarDateRange", enrollment_source)
        self.assertIn("formatCalendarDateRange", landing_source)
        self.assertIn("formatCalendarDateRange", variants_source)
        self.assertNotIn("new Date(value)", enrollment_source)
        self.assertNotIn("new Date(value)", landing_source)
        self.assertNotIn("new Date(value)", variants_source)


if __name__ == "__main__":
    unittest.main()
