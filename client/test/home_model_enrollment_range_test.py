from pathlib import Path
import unittest


HOME_MODEL_PATH = Path(__file__).resolve().parents[1] / "src" / "components" / "home" / "homeModel.js"


class HomeModelEnrollmentRangeTest(unittest.TestCase):
    def test_home_model_builds_full_enrollment_range(self):
        source = HOME_MODEL_PATH.read_text(encoding="utf-8")

        self.assertIn("export function formatEnrollmentDateRange(competition, options = {})", source)
        self.assertIn("return formatCompetitionDateRange(competition?.enrollment_start, competition?.enrollment_end, options)", source)
        self.assertIn("const enrollmentStartLabel = formatEnrollmentDateRange(competition, { fallback: 'Por confirmar' })", source)
        self.assertNotIn("const enrollmentStartLabel = formatDate(competition.enrollment_start) || 'Por confirmar'", source)


if __name__ == "__main__":
    unittest.main()
