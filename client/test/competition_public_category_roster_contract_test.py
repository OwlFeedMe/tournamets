from pathlib import Path
import unittest


LANDING_PATH = Path(__file__).resolve().parents[1] / "src" / "pages" / "CompetitionLanding.jsx"
ROSTER_PAGE_PATH = Path(__file__).resolve().parents[1] / "src" / "pages" / "CompetitionPublicRosterPage.jsx"
ROSTER_PANEL_PATH = Path(__file__).resolve().parents[1] / "src" / "components" / "competition" / "CompetitionRosterPanel.jsx"
ADMIN_WORKSPACE_PATH = Path(__file__).resolve().parents[1] / "src" / "pages" / "AdminCompetitionCommandProposal.jsx"
APP_PATH = Path(__file__).resolve().parents[1] / "src" / "App.jsx"


class CompetitionPublicCategoryRosterContractTest(unittest.TestCase):
    def test_competition_landing_links_to_public_roster_view(self):
        source = LANDING_PATH.read_text(encoding="utf-8")

        self.assertIn("show_public_category_roster", source)
        self.assertIn("const openRosterView = () =>", source)
        self.assertIn("nextParams.set('view', 'inscritos')", source)
        self.assertIn("Ver inscritos", source)
        self.assertIn("<Users size={14}", source)

    def test_public_roster_page_loads_public_roster_payload(self):
        page_source = ROSTER_PAGE_PATH.read_text(encoding="utf-8")
        source = ROSTER_PANEL_PATH.read_text(encoding="utf-8")
        route_source = APP_PATH.read_text(encoding="utf-8")

        self.assertIn("CompetitionRosterPanel", page_source)
        self.assertIn("<CompetitionRosterPanel competitionId={competitionId} />", page_source)
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
        self.assertIn("Inscritos confirmados", source)
        self.assertIn("Inscritos", source)
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

    def test_admin_workspace_can_toggle_public_category_roster(self):
        source = ADMIN_WORKSPACE_PATH.read_text(encoding="utf-8")

        self.assertIn("show_public_category_roster: item?.show_public_category_roster ? 1 : 0", source)
        self.assertIn("key: 'show_public_category_roster'", source)
        self.assertIn("title: 'Roster publico por categoria'", source)
        self.assertIn("Muestra al publico la lista de inscritos separada por categoria", source)


if __name__ == "__main__":
    unittest.main()
