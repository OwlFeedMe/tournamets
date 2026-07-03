from pathlib import Path
import unittest


PARTICIPANT_PROFILE_PATH = Path(__file__).resolve().parents[1] / "src" / "pages" / "ParticipantProfile.jsx"


class ParticipantProfilePhoneRequiredTest(unittest.TestCase):
    def test_phone_is_required_before_saving_profile(self):
        source = PARTICIPANT_PROFILE_PATH.read_text(encoding="utf-8")

        self.assertIn("payload.celular = (editForm.celular || '').trim()", source)
        self.assertIn("Ingresa tu celular para guardar el perfil", source)
        self.assertIn("inputMode=\"tel\" required", source)


if __name__ == "__main__":
    unittest.main()
