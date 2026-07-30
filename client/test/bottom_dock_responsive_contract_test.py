import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DOCK_PATH = ROOT / "src" / "components" / "layout" / "BottomDock.jsx"
CSS_PATH = ROOT / "src" / "index.css"


class BottomDockResponsiveContractTest(unittest.TestCase):
    def test_dock_items_can_shrink_on_small_screens(self):
        source = DOCK_PATH.read_text(encoding="utf-8")

        self.assertIn('className="fr-bottom-dock-items"', source)
        self.assertIn('className="fr-bottom-dock-item"', source)
        self.assertIn("minWidth: 0", source)
        self.assertIn('className="fr-bottom-dock-label"', source)
        self.assertIn("overflowWrap: 'anywhere'", source)

    def test_small_mobile_breakpoint_compacts_five_item_dock(self):
        source = CSS_PATH.read_text(encoding="utf-8")

        self.assertIn("@media (max-width: 340px)", source)
        self.assertIn(".fr-bottom-dock-items", source)
        self.assertIn(".fr-bottom-dock-item", source)
        self.assertIn(".fr-bottom-dock-label", source)


if __name__ == "__main__":
    unittest.main()
