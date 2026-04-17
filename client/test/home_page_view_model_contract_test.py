from pathlib import Path
import unittest


HOME_PAGE_PATH = Path(__file__).resolve().parents[1] / "src" / "pages" / "Home.jsx"
HOME_MODEL_PATH = Path(__file__).resolve().parents[1] / "src" / "components" / "home" / "homeModel.js"


class HomePageViewModelContractTest(unittest.TestCase):
    def test_home_page_uses_shared_home_model(self):
        source = HOME_PAGE_PATH.read_text(encoding="utf-8")

        self.assertIn("from '../components/home/homeModel'", source)
        self.assertIn("mapCompetitionViewModel", source)
        self.assertIn("homePageBg", source)

    def test_shared_home_model_builds_labels_expected_by_home_card(self):
        source = HOME_MODEL_PATH.read_text(encoding="utf-8")

        self.assertIn("enrollmentStartLabel", source)
        self.assertIn("competitionDateLabel", source)
        self.assertIn("formatEnrollmentDateRange", source)
        self.assertIn("formatCompetitionWindow", source)
        self.assertIn("const enrollmentStartLabel = formatEnrollmentDateRange(competition, { fallback: 'Por confirmar' })", source)


if __name__ == "__main__":
    unittest.main()
