from pathlib import Path
import unittest


LEADERBOARD_PATH = Path(__file__).resolve().parents[1] / "src" / "pages" / "Leaderboard.jsx"


class LeaderboardCompetitionLockContractTest(unittest.TestCase):
    def test_leaderboard_route_locks_competition_selector(self):
        source = LEADERBOARD_PATH.read_text(encoding="utf-8")

        self.assertIn("const lockedCompetitionId = competitionId ? String(competitionId) : ''", source)
        self.assertIn("{!lockedCompetitionId && (", source)
        self.assertIn("setSelectedComp(lockedCompetitionId)", source)

    def test_mobile_rank_cards_use_dark_finalrep_surface(self):
        source = LEADERBOARD_PATH.read_text(encoding="utf-8")

        self.assertIn("const mobileRankCardStyle", source)
        self.assertIn("style={mobileRankCardStyle}", source)
        self.assertIn("style={mobileScoreChipStyle(false)}", source)
        self.assertNotIn("style={{ background: '#fff', border: '1px solid #d5ddd3', borderRadius: 10, padding: '10px 12px' }}", source)
        self.assertNotIn("background: '#f8fbf8'", source)

    def test_leaderboard_renders_modern_athlete_identity(self):
        source = LEADERBOARD_PATH.read_text(encoding="utf-8")

        self.assertIn("function AthleteIdentity", source)
        self.assertIn("function AthleteAvatar", source)
        self.assertIn("normalizeProfilePhoto(athlete?.profile_photo_url)", source)
        self.assertIn("countryCodeFromLocation(athlete?.ciudad_pais, countryCodeByName)", source)
        self.assertIn("flagUrlFromCountryCode(countryCode)", source)
        self.assertIn("https://flagcdn.com/w40/", source)
        self.assertIn("loadCountries()", source)
        self.assertIn("countryLabelFromLocation(athlete?.ciudad_pais)", source)
        self.assertNotIn("athlete?.box,\n    athlete?.categoria,\n    athlete?.ciudad_pais", source)


if __name__ == "__main__":
    unittest.main()
