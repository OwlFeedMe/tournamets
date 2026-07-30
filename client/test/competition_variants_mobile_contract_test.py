import unittest
from pathlib import Path


PAGE_PATH = Path(__file__).resolve().parents[1] / "src" / "pages" / "CompetitionVariants.jsx"


class CompetitionVariantsMobileContractTest(unittest.TestCase):
    def test_variant_four_uses_a_shrinkable_single_column_grid(self):
        source = PAGE_PATH.read_text(encoding="utf-8")

        self.assertIn('className="fr-competition-v4-grid"', source)
        self.assertIn("gridTemplateColumns: 'minmax(0, 1fr)'", source)
        self.assertIn("minWidth: 0, maxWidth: '100%', aspectRatio", source)


if __name__ == "__main__":
    unittest.main()
