import unittest
from pathlib import Path


PAGE_PATH = Path(__file__).resolve().parents[1] / "src" / "pages" / "AdminCompetitionCommandProposal.jsx"


class AdminCompetitionImageGridContractTest(unittest.TestCase):
    def test_mixed_aspect_previews_do_not_stretch_grid_tracks(self):
        source = PAGE_PATH.read_text(encoding="utf-8")

        self.assertIn('className="fr-image-card"', source)
        self.assertIn("alignContent: 'space-between'", source)
        self.assertIn('className="fr-image-preview"', source)
        self.assertIn("maxWidth: '100%'", source)


if __name__ == "__main__":
    unittest.main()
