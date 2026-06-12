import json
import os
import unittest
from unittest.mock import MagicMock, patch

from services import emailer


class StageEmailerTests(unittest.TestCase):
    def setUp(self):
        self._env = os.environ.copy()
        emailer._stage_allowed_static_emails.cache_clear()

    def tearDown(self):
        os.environ.clear()
        os.environ.update(self._env)
        emailer._stage_allowed_static_emails.cache_clear()

    def test_stage_blocks_non_organizer_email(self):
        os.environ["BREVO_API_KEY"] = "test-key"
        os.environ["APP_ENV"] = "stage"

        with patch.object(emailer, "_is_stage_allowed_recipient", return_value=False), \
                patch.object(emailer.urlrequest, "urlopen") as urlopen:
            sent = emailer.send_email(
                to_email="athlete@example.com",
                subject="Pago aprobado",
                body="body",
            )

        self.assertFalse(sent)
        urlopen.assert_not_called()

    def test_stage_prefixes_subject_for_allowed_email(self):
        os.environ["BREVO_API_KEY"] = "test-key"
        os.environ["APP_ENV"] = "stage"

        response = MagicMock()
        response.status = 202
        response.__enter__.return_value = response
        response.__exit__.return_value = None

        with patch.object(emailer, "_is_stage_allowed_recipient", return_value=True), \
                patch.object(emailer.urlrequest, "urlopen", return_value=response) as urlopen:
            sent = emailer.send_email(
                to_email="organizer@example.com",
                subject="Pago aprobado",
                body="body",
            )

        self.assertTrue(sent)
        request = urlopen.call_args.args[0]
        payload = json.loads(request.data.decode("utf-8"))
        self.assertEqual(payload["subject"], "[PRUEBA STAGE] Pago aprobado")
        self.assertIn("Correo de prueba", payload["textContent"])


if __name__ == "__main__":
    unittest.main()
