from pathlib import Path
import unittest


LANDING_PATH = Path(__file__).resolve().parents[1] / "src" / "pages" / "CompetitionLanding.jsx"
ROSTER_PAGE_PATH = Path(__file__).resolve().parents[1] / "src" / "pages" / "CompetitionPublicRosterPage.jsx"
ADMIN_DASHBOARD_PATH = Path(__file__).resolve().parents[1] / "src" / "pages" / "AdminDashboard.jsx"
APP_PATH = Path(__file__).resolve().parents[1] / "src" / "App.jsx"


class CompetitionPublicCategoryRosterContractTest(unittest.TestCase):
    def test_competition_landing_links_to_public_roster_view(self):
        source = LANDING_PATH.read_text(encoding="utf-8")

        self.assertIn("show_public_category_roster", source)
        self.assertIn("/competitions/${competition.id}/inscritos", source)
        self.assertIn("Ver inscritos", source)
        self.assertIn("<Users size={15} />", source)

    def test_public_roster_page_loads_public_roster_payload(self):
        source = ROSTER_PAGE_PATH.read_text(encoding="utf-8")
        route_source = APP_PATH.read_text(encoding="utf-8")

        self.assertIn("public-roster", source)
        self.assertIn("selectedCategoryKey", source)
        self.assertIn("setSelectedCategoryKey", source)
        self.assertIn("selectedParticipant", source)
        self.assertIn("searchQuery", source)
        self.assertIn("visibleCount", source)
        self.assertIn("CatDropdown", source)
        self.assertIn("useRef", source)
        self.assertIn("dropIn", source)
        self.assertIn("Categoria", source)
        self.assertIn("Temporada", source)
        self.assertIn("Atletas", source)
        self.assertIn("Paises", source)
        self.assertIn("Buscar atleta, pais o box", source)
        self.assertIn("Ver mas", source)
        self.assertIn("animationDelay", source)
        self.assertIn("translateY(18px)", source)
        self.assertIn("loadCountries", source)
        self.assertIn("parseCityCountry", source)
        self.assertIn("flagcdn.com/w40", source)
        self.assertIn("fr-modal-open", source)
        self.assertIn("Cerrar ficha", source)
        self.assertIn("Aun no hay inscritos confirmados en esta categoria", source)
        self.assertIn("mobileView", source)
        self.assertIn("setMobileView", source)
        self.assertIn("LayoutGrid", source)
        self.assertIn("Ver atletas en tarjetas", source)
        self.assertIn("Ver atletas en lista", source)
        self.assertIn("AthleteListRow", source)
        self.assertIn("repeat(2, minmax(0, 1fr))", source)
        self.assertIn("compact={isMobile}", source)
        self.assertIn("CompetitionPublicRosterPage", route_source)
        self.assertIn('path="/competitions/:competitionId/inscritos"', route_source)

    def test_admin_dashboard_can_toggle_public_category_roster(self):
        source = ADMIN_DASHBOARD_PATH.read_text(encoding="utf-8")

        self.assertIn("show_public_category_roster: 0", source)
        self.assertIn("source.show_public_category_roster == null ? 0 : source.show_public_category_roster", source)
        self.assertIn("show_public_category_roster: form.show_public_category_roster ? 1 : 0", source)
        self.assertIn("Mostrar inscritos publicamente por categoria", source)
        self.assertIn("Publica en la landing los atletas y equipos confirmados dentro de cada categoria.", source)


if __name__ == "__main__":
    unittest.main()
