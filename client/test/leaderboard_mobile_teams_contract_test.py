import unittest
from pathlib import Path


PAGE_PATH = Path(__file__).resolve().parents[1] / "src" / "pages" / "Leaderboard.jsx"


class LeaderboardMobileTeamsContractTest(unittest.TestCase):
    def test_team_cards_and_member_preview_can_shrink(self):
        source = PAGE_PATH.read_text(encoding="utf-8")

        self.assertIn('className="fr-team-mobile-grid"', source)
        self.assertIn("gridTemplateColumns: 'minmax(0, 1fr)'", source)
        self.assertIn("maxWidth: '100%', flex: 1, overflow: 'hidden'", source)
        self.assertIn("width: '100%', minWidth: 0, border: 'none'", source)
        self.assertIn("overflowWrap: 'anywhere'", source)


if __name__ == "__main__":
    unittest.main()
