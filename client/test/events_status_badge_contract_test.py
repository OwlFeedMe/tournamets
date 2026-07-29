from pathlib import Path
import unittest


EXPLORE_PAGES_PATH = Path(__file__).resolve().parents[1] / "src" / "pages" / "ExplorePages.jsx"


class EventsStatusBadgeContractTest(unittest.TestCase):
    def test_event_cards_show_useful_lifecycle_status(self):
        source = EXPLORE_PAGES_PATH.read_text(encoding="utf-8")

        self.assertIn("function eventStatusBadge(competition", source)
        self.assertIn("Inscripciones abiertas", source)
        self.assertIn("En curso", source)
        self.assertIn("Próximamente", source)
        self.assertIn("Finalizada", source)
        self.assertIn("Inscripciones cerradas", source)
        self.assertIn("{eventStatus.label}", source)
        self.assertNotIn("? 'Abierta' : 'Visible'", source)
        self.assertNotIn("competencias visibles", source)


if __name__ == "__main__":
    unittest.main()
