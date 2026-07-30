import unittest
from pathlib import Path


PAGES = Path(__file__).resolve().parents[1] / "src" / "pages"


class AthleteModalAccessibilityContractTest(unittest.TestCase):
    def read_page(self, name):
        return (PAGES / name).read_text(encoding="utf-8")

    def test_enrollment_terms_modal_locks_background_and_is_named(self):
        source = self.read_page("CompetitionEnrollmentPage.jsx")

        self.assertIn('role="dialog" aria-modal="true" aria-label={title}', source)
        self.assertIn("document.body.classList.add('fr-modal-open')", source)
        self.assertIn("position: 'sticky', top: 0", source)

    def test_competition_detail_modal_is_named(self):
        source = self.read_page("ParticipantProfile.jsx")

        self.assertIn('role="dialog" aria-modal="true" aria-label={`Detalle de ${comp.nombre}`}', source)
        self.assertIn('aria-label="Cerrar detalle de competencia"', source)

    def test_team_rename_icon_buttons_have_accessible_names(self):
        source = self.read_page("ParticipantProfile.jsx")

        self.assertIn('aria-label="Guardar nombre del equipo"', source)
        self.assertIn('aria-label="Cancelar cambio de nombre"', source)

    def test_invitation_errors_clear_when_inputs_change(self):
        source = self.read_page("CompetitionInvitationEnrollPage.jsx")

        self.assertIn("const setP = (k, v) => {\n    setSubmitErr('')", source)
        self.assertGreaterEqual(source.count("setSubmitErr('')"), 7)


if __name__ == "__main__":
    unittest.main()
