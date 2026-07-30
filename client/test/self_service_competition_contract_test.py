import unittest
from pathlib import Path


CLIENT_ROOT = Path(__file__).resolve().parents[1]


class SelfServiceCompetitionClientContractTests(unittest.TestCase):
    def test_authenticated_users_can_open_the_creation_flow(self):
        app_source = (CLIENT_ROOT / "src" / "App.jsx").read_text(encoding="utf-8")
        profile_source = (CLIENT_ROOT / "src" / "pages" / "ParticipantProfile.jsx").read_text(encoding="utf-8")

        self.assertIn('path="/competitions/new"', app_source)
        self.assertIn('to="/competitions/new"', profile_source)
        self.assertIn("crea un borrador", profile_source.lower())

    def test_creation_keeps_the_competition_private_and_refreshes_capabilities(self):
        source = (CLIENT_ROOT / "src" / "pages" / "CreateCompetitionPage.jsx").read_text(encoding="utf-8")

        self.assertIn("activa: 0", source)
        self.assertIn("await refreshSession({ force: true })", source)
        self.assertIn("/admin?competition=", source)

    def test_organizer_capability_keeps_user_as_primary_role(self):
        source = (CLIENT_ROOT / "src" / "context" / "AuthContext.jsx").read_text(encoding="utf-8")

        self.assertIn("normalizedBaseRole === 'user' && extraRoles.includes('organizer')", source)
        self.assertIn("return 'user'", source)


if __name__ == "__main__":
    unittest.main()
