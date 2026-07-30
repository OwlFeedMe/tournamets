import unittest
from pathlib import Path


PAGE_PATH = Path(__file__).resolve().parents[1] / "src" / "pages" / "AdminCompetitionCommandProposal.jsx"


class AdminCompetitionModalContractTest(unittest.TestCase):
    def test_shared_admin_modal_is_accessible_and_blocks_background(self):
        source = PAGE_PATH.read_text(encoding="utf-8")

        self.assertIn('className="fr-command-modal" role="dialog"', source)
        self.assertIn('aria-modal="true"', source)
        self.assertIn("aria-label={title}", source)
        self.assertIn("document.body.style.overflow = 'hidden'", source)
        self.assertIn("document.body.classList.add('fr-modal-open')", source)
        self.assertIn("position: 'sticky'", source)

    def test_invitation_rows_allow_long_emails_to_wrap(self):
        source = PAGE_PATH.read_text(encoding="utf-8")

        self.assertIn("gridTemplateColumns: 'minmax(0, 1fr) auto auto'", source)
        self.assertIn("<strong style={{ overflowWrap: 'anywhere' }}>{item.invited_email}</strong>", source)

    def test_results_editor_shell_can_shrink_below_select_intrinsic_width(self):
        source = PAGE_PATH.read_text(encoding="utf-8")

        self.assertEqual(source.count('className="fr-results-editor-shell"'), 2)
        self.assertIn("gridTemplateColumns: 'minmax(0, 1fr)'", source)


if __name__ == "__main__":
    unittest.main()
