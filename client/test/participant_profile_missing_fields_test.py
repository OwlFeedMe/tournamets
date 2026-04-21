from pathlib import Path
import unittest


PARTICIPANT_PROFILE_UTIL_PATH = Path(__file__).resolve().parents[1] / "src" / "utils" / "participantProfile.js"


class ParticipantProfileMissingFieldsTest(unittest.TestCase):
    def test_missing_profile_fields_are_formatted_for_users(self):
        source = PARTICIPANT_PROFILE_UTIL_PATH.read_text(encoding="utf-8")

        self.assertIn("formatMissingParticipantProfileFields", source)
        self.assertIn("fecha nacimiento", source)
        self.assertIn("ciudad / país", source)
        self.assertIn("cédula", source)
        self.assertNotIn("return fields.join(', ')", source)


if __name__ == "__main__":
    unittest.main()
