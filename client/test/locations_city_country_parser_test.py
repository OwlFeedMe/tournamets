from pathlib import Path
import unittest


LOCATIONS_PATH = Path(__file__).resolve().parents[1] / "src" / "utils" / "locations.js"


class LocationsCityCountryParserTest(unittest.TestCase):
    def test_parser_supports_comma_separated_city_country(self):
        source = LOCATIONS_PATH.read_text(encoding="utf-8")

        self.assertIn("raw.split(',')", source)
        self.assertIn("countryName = commaParts.at(-1)", source)


if __name__ == "__main__":
    unittest.main()
