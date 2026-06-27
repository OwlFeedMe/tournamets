from datetime import datetime, timezone
from pathlib import Path
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from timezones import normalize_timezone, to_utc_from_competition_time


class CompetitionTimezoneTest(unittest.TestCase):
    def test_naive_competition_time_is_stored_as_utc(self):
        value = datetime(2026, 7, 10, 9, 30)

        result = to_utc_from_competition_time(value, "America/Bogota")

        self.assertEqual(result, datetime(2026, 7, 10, 14, 30, tzinfo=timezone.utc))

    def test_invalid_timezone_is_rejected(self):
        with self.assertRaises(ValueError):
            normalize_timezone("UTC-5")


if __name__ == "__main__":
    unittest.main()
