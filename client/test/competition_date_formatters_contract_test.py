from pathlib import Path
import unittest


HOME_MODEL_PATH = Path(__file__).resolve().parents[1] / "src" / "components" / "home" / "homeModel.js"
EXPLORE_PAGES_PATH = Path(__file__).resolve().parents[1] / "src" / "pages" / "ExplorePages.jsx"


class CompetitionDateFormattersContractTest(unittest.TestCase):
    def test_home_and_events_use_shared_competition_date_helpers(self):
        home_model_source = HOME_MODEL_PATH.read_text(encoding="utf-8")
        explore_pages_source = EXPLORE_PAGES_PATH.read_text(encoding="utf-8")

        self.assertIn("formatCompetitionDateRange", home_model_source)
        self.assertIn("formatEnrollmentDateRange", home_model_source)
        self.assertIn("from '../components/home/homeModel'", explore_pages_source)
        self.assertIn("formatCompetitionWindow", explore_pages_source)
        self.assertNotIn("function formatDate(value)", explore_pages_source)
        self.assertNotIn("function formatCompetitionWindow(competition)", explore_pages_source)


if __name__ == "__main__":
    unittest.main()
