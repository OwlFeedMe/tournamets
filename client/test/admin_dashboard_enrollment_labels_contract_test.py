from pathlib import Path
import unittest


ADMIN_DASHBOARD_PATH = Path(__file__).resolve().parents[1] / "src" / "pages" / "AdminDashboard.jsx"


class AdminDashboardEnrollmentLabelsContractTest(unittest.TestCase):
    def test_enrollment_list_separates_enrollment_and_checkin_labels(self):
        source = ADMIN_DASHBOARD_PATH.read_text(encoding="utf-8")

        self.assertIn("Ver inscritos", source)
        self.assertIn("Estado check-in", source)
        self.assertIn("Inscripcion:", source)
        self.assertIn("<th>Inscripcion</th>", source)
        self.assertIn("<CheckinStatusChip participant={p} labeled />", source)
        self.assertIn("const labelPrefix = labeled ? 'Check-in: ' : ''", source)


if __name__ == "__main__":
    unittest.main()
