from pathlib import Path
import unittest


ROOT = Path(__file__).resolve().parents[1] / "src"
HOME_VARIANTS_PATH = ROOT / "pages" / "HomeVariants.jsx"
HOME_MODEL_PATH = ROOT / "components" / "home" / "homeModel.js"
AUTH_CONTEXT_PATH = ROOT / "context" / "AuthContext.jsx"


class HomeUserFirstContractTest(unittest.TestCase):
    def test_user_home_path_points_to_personal_start(self):
        source = AUTH_CONTEXT_PATH.read_text(encoding="utf-8")

        self.assertIn("export function getHomePath(role)", source)
        self.assertIn("if (normalized === 'organizer') return '/admin'", source)
        self.assertIn("if (normalized === 'judge') return '/judge'", source)
        self.assertIn("return '/'", source)
        self.assertNotIn("return '/profile'\n}", source)

    def test_home_personal_branch_uses_user_context(self):
        source = HOME_VARIANTS_PATH.read_text(encoding="utf-8")

        self.assertIn("session && isAthlete && userId", source)
        self.assertIn("<PersonalHome", source)
        self.assertIn("publicCompetitions={featuredCompetitions}", source)

    def test_home_loads_deep_personal_competition_data(self):
        source = HOME_VARIANTS_PATH.read_text(encoding="utf-8")

        self.assertIn("api.get(`/competitions/${primaryCompetition.id}/my-schedule`)", source)
        self.assertIn("api.get(`/leaderboard/${primaryCompetition.id}`)", source)
        self.assertIn("api.get(`/results?competition_id=${primaryCompetition.id}`)", source)
        self.assertIn("Leaderboard completo", source)
        self.assertIn("Mi cronograma", source)
        self.assertIn("Ver mi QR", source)

    def test_home_model_selects_current_then_upcoming_then_recent(self):
        source = HOME_MODEL_PATH.read_text(encoding="utf-8")

        self.assertIn("export function selectPrimaryUserCompetition", source)
        self.assertIn("isCurrentCompetition(competition, nowMs)", source)
        self.assertIn("isFutureCompetition(competition, nowMs)", source)
        self.assertIn("return [...candidates].sort", source)

    def test_home_model_extracts_user_rank_heat_and_results(self):
        source = HOME_MODEL_PATH.read_text(encoding="utf-8")

        self.assertIn("export function extractUserLeaderboardSummary", source)
        self.assertIn("Number(row.id) === targetId", source)
        self.assertIn("totalTeam?.rank", source)
        self.assertIn("export function getNextPersonalHeat", source)
        self.assertIn("export function normalizeUserResults", source)


if __name__ == "__main__":
    unittest.main()
