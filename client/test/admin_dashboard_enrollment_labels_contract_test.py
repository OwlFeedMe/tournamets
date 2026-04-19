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

    def test_admin_sees_delete_competition_action(self):
        source = ADMIN_DASHBOARD_PATH.read_text(encoding="utf-8")
        competitions_tab_index = source.index("function CompetitionsTab()")
        participants_tab_index = source.index("function ParticipantsTab()")
        delete_modal_index = source.index("deleteCompetitionTarget && (")

        self.assertIn("const isAdmin = role === 'admin'", source)
        self.assertIn("const [deleteCompetitionTarget, setDeleteCompetitionTarget] = useState(null)", source)
        self.assertIn("Eliminar competencia", source)
        self.assertIn("onClick={() => setDeleteCompetitionTarget(c)}", source)
        self.assertIn("onClick={() => setDeleteCompetitionTarget(selectedCompetition)}", source)
        self.assertIn("deleteCompetitionTarget && (", source)
        self.assertGreater(delete_modal_index, competitions_tab_index)
        self.assertLess(delete_modal_index, participants_tab_index)
        self.assertNotIn("confirm(`Eliminar competencia", source)


if __name__ == "__main__":
    unittest.main()
