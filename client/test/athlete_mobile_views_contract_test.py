import unittest
from pathlib import Path


PAGES = Path(__file__).resolve().parents[1] / "src" / "pages"


class AthleteMobileViewsContractTest(unittest.TestCase):
    def read_page(self, name):
        return (PAGES / name).read_text(encoding="utf-8")

    def test_home_primary_competition_can_shrink(self):
        source = self.read_page("HomeVariants.jsx")

        self.assertIn("gridTemplateColumns: isMobile ? 'minmax(0, 1fr)'", source)
        self.assertIn("maxWidth: '100%', overflowWrap: 'anywhere'", source)
        self.assertIn("<div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 18, minWidth: 0, maxWidth: '100%' }}>", source)

    def test_profile_event_cards_are_shrinkable_and_not_nested_buttons(self):
        source = self.read_page("ParticipantProfile.jsx")

        self.assertIn("gridTemplateColumns: isMobile ? 'minmax(0, 1fr)'", source)
        self.assertIn("<article\n                    key={c.id}", source)
        self.assertNotIn("role={canOpen ? 'button' : undefined}", source)

    def test_public_profile_name_wraps_on_small_screens(self):
        source = self.read_page("AthletePublicProfile.jsx")

        self.assertIn("fontSize: 'clamp(30px, 10vw, 42px)'", source)
        self.assertIn("overflowWrap: 'anywhere' }}>{profile.display_name}", source)

    def test_phase_category_select_is_bounded_on_mobile(self):
        source = self.read_page("CompetitionLanding.jsx")

        self.assertIn("width: isMobile ? '100%' : 'auto'", source)
        self.assertIn("textOverflow: 'ellipsis'", source)

    def test_leaderboard_category_header_wraps(self):
        source = self.read_page("Leaderboard.jsx")

        self.assertIn("whiteSpace: 'normal', overflowWrap: 'anywhere'", source)
        self.assertIn("minWidth: 0, flexWrap: 'wrap'", source)


if __name__ == "__main__":
    unittest.main()
