import unittest
from pathlib import Path


PAGE_PATH = Path(__file__).resolve().parents[1] / "src" / "pages" / "HomeVariants.jsx"


class HomeMobileGridContractTest(unittest.TestCase):
    def test_off_season_and_finished_grids_can_shrink_on_narrow_phones(self):
        source = PAGE_PATH.read_text(encoding="utf-8")

        self.assertIn("function FinishedCompetitionsPanel", source)
        self.assertIn("gridTemplateColumns: isMobile ? 'minmax(0, 1fr)'", source)
        self.assertIn("function OffSeasonHome", source)
        self.assertIn("<div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 20, minWidth: 0 }}>", source)


if __name__ == "__main__":
    unittest.main()
