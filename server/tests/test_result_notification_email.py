import os
import sys
import unittest
from pathlib import Path
from unittest.mock import patch


SERVER_PATH = Path(__file__).resolve().parents[1]
if str(SERVER_PATH) not in sys.path:
    sys.path.insert(0, str(SERVER_PATH))

from services.email_templates import render_result_notification
from services.result_notifications import _result_action_url


class ResultNotificationEmailTest(unittest.TestCase):
    def setUp(self):
        self.env_patch = patch.dict(
            os.environ,
            {"LEADERBOARD_BASE_URL": "https://finalrep.co/"},
        )
        self.env_patch.start()

    def tearDown(self):
        self.env_patch.stop()

    def test_result_email_omits_snapshot_position_and_links_to_current_result(self):
        action_url = _result_action_url(42, phase_id=17, athlete_id=315)

        subject, text, html = render_result_notification(
            nombre="Laura",
            competition_name="FinalRep Challenge",
            phase_name="WOD 2",
            mark_label="120 reps",
            points=95,
            action_url=action_url,
        )

        self.assertEqual(subject, "Resultado cargado - FinalRep Challenge")
        self.assertEqual(action_url, "https://finalrep.co/leaderboard/42?phase=17&athlete=315")
        self.assertNotIn("Posicion:", text)
        self.assertNotIn("Posicion:</span>", html)
        self.assertIn("Puntos: 95", text)
        self.assertIn("consultar tu resultado y posición actual", text)
        self.assertIn(action_url, text)
        self.assertIn(action_url, html)
        self.assertIn("Ver mi resultado y posición", html)

    def test_updated_team_result_links_to_team_workout_context(self):
        action_url = _result_action_url(42, phase_id=18, athlete_id=316, team_id=9)

        subject, text, html = render_result_notification(
            nombre="Mateo",
            competition_name="FinalRep Challenge",
            phase_name="WOD Equipos",
            mark_label="08:31",
            points=88,
            action_url=action_url,
            updated=True,
        )

        self.assertEqual(subject, "Resultado actualizado - FinalRep Challenge")
        self.assertEqual(
            action_url,
            "https://finalrep.co/leaderboard/42?phase=18&athlete=316&team=9",
        )
        self.assertIn("resultado fue actualizado", text)
        self.assertIn(action_url, html)

    def test_result_action_url_falls_back_to_competition(self):
        self.assertEqual(_result_action_url(42), "https://finalrep.co/leaderboard/42")


if __name__ == "__main__":
    unittest.main()
