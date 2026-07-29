from pathlib import Path
import unittest


ROOT = Path(__file__).resolve().parents[1] / "src"
HOME_VARIANTS_PATH = ROOT / "pages" / "HomeVariants.jsx"
HOME_MODEL_PATH = ROOT / "components" / "home" / "homeModel.js"


class HomeFinishedCompetitionsContractTest(unittest.TestCase):
    def test_home_model_selects_finished_and_confirmed_participations(self):
        source = HOME_MODEL_PATH.read_text(encoding="utf-8")

        self.assertIn("export function isFinishedCompetition", source)
        self.assertIn("endMs < nowMs && !competition?.enrollment_open", source)
        self.assertIn("export function selectFinishedCompetitions", source)
        self.assertIn("export function selectLastParticipatedCompetition", source)
        self.assertIn(".filter(isConfirmedEnrollment)", source)

    def test_personal_home_has_useful_off_season_state(self):
        source = HOME_VARIANTS_PATH.read_text(encoding="utf-8")

        self.assertIn("No hay competencias abiertas", source)
        self.assertIn("Tu última competencia", source)
        self.assertIn("Competencias finalizadas", source)
        self.assertIn("Ver mis resultados", source)
        self.assertIn("Participaste", source)
        self.assertIn("<OffSeasonHome", source)

    def test_past_competition_details_skip_schedule_but_load_results(self):
        source = HOME_VARIANTS_PATH.read_text(encoding="utf-8")

        self.assertIn("const scheduleRequest = hasCurrentOrFuture", source)
        self.assertIn(": Promise.resolve({ data: null })", source)
        self.assertIn("api.get(`/leaderboard/${lastParticipatedCompetition.id}`)", source)
        self.assertIn("api.get(`/results?competition_id=${lastParticipatedCompetition.id}`)", source)


if __name__ == "__main__":
    unittest.main()
