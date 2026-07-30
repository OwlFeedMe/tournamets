from pathlib import Path
import unittest


ADMIN_WORKSPACE_PATH = Path(__file__).resolve().parents[1] / "src" / "pages" / "AdminCompetitionCommandProposal.jsx"


class AdminWorkspaceEnrollmentContractTest(unittest.TestCase):
    def test_enrollment_list_exposes_current_management_actions(self):
        source = ADMIN_WORKSPACE_PATH.read_text(encoding="utf-8")

        self.assertIn("function ParticipantsPanel", source)
        self.assertIn("Inscritos", source)
        self.assertIn("Confirmar reemplazo", source)
        self.assertIn("Cambiar categoria", source)
        self.assertIn("participants/export.xlsx", source)
        self.assertIn("Eliminar inscripcion de", source)

    def test_workspace_uses_the_current_competition_portfolio(self):
        source = ADMIN_WORKSPACE_PATH.read_text(encoding="utf-8")

        self.assertIn("export default function AdminCompetitionCommandProposal", source)
        self.assertIn("Mis competencias", source)
        self.assertIn("Crear competencia", source)
        self.assertNotIn("AdminDashboard", source)


if __name__ == "__main__":
    unittest.main()
