from pathlib import Path
import unittest


EXPLORE_PAGES_PATH = Path(__file__).resolve().parents[1] / "src" / "pages" / "ExplorePages.jsx"


class ExplorePagesCompetitionDatesTest(unittest.TestCase):
    def test_events_and_my_events_use_competition_dates_copy(self):
        source = EXPLORE_PAGES_PATH.read_text(encoding="utf-8")

        self.assertIn("from '../components/home/homeModel'", source)
        self.assertIn("formatCompetitionWindow(competition, { includeYear: false, fallback: 'Fechas de competencia por confirmar' })", source)
        self.assertIn("formatCompetitionDate(payload.check_in_used_at)", source)
        self.assertIn("Fechas de competencia por confirmar", source)
        self.assertIn("MapPin", source)
        self.assertIn("competition.lugar || 'Lugar por confirmar'", source)
        self.assertNotIn("Pagina publica", source)
        self.assertNotIn("function formatDate(value)", source)
        self.assertNotIn("function formatCompetitionWindow(competition)", source)
        self.assertNotIn("Trophy", source)


if __name__ == "__main__":
    unittest.main()
