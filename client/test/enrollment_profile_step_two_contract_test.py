from pathlib import Path
import unittest


HOME_PAGE_PATH = Path(__file__).resolve().parents[1] / "src" / "pages" / "Home.jsx"
LANDING_PAGE_PATH = Path(__file__).resolve().parents[1] / "src" / "pages" / "CompetitionLanding.jsx"
ENROLLMENT_PAGE_PATH = Path(__file__).resolve().parents[1] / "src" / "pages" / "CompetitionEnrollmentPage.jsx"
ENROLLMENT_NAVIGATION_UTIL_PATH = Path(__file__).resolve().parents[1] / "src" / "utils" / "enrollmentNavigation.js"


class EnrollmentProfileStepTwoContractTest(unittest.TestCase):
    def test_entry_points_go_straight_to_register_without_profile_bounce(self):
        home_source = HOME_PAGE_PATH.read_text(encoding="utf-8")
        landing_source = LANDING_PAGE_PATH.read_text(encoding="utf-8")
        util_source = ENROLLMENT_NAVIGATION_UTIL_PATH.read_text(encoding="utf-8")

        self.assertNotIn("profileRequiredForEnrollment", home_source)
        self.assertNotIn("getMissingParticipantProfileFields", home_source)
        self.assertIn("getCompetitionEnrollmentNavigationTarget", home_source)

        self.assertIn("navigate(registerHref)", landing_source)
        self.assertNotIn("profileRequiredForEnrollment", landing_source)
        self.assertNotIn("getMissingParticipantProfileFields", landing_source)
        self.assertNotIn("api.get('/users/me')", landing_source)

        variants_source = (HOME_PAGE_PATH.parent / "HomeVariants.jsx").read_text(encoding="utf-8")
        self.assertNotIn("profileRequiredForEnrollment", variants_source)
        self.assertNotIn("getMissingParticipantProfileFields", variants_source)
        self.assertIn("getCompetitionEnrollmentNavigationTarget", variants_source)

        self.assertIn("return `/competitions/${competition.id}/register`", util_source)
        self.assertIn("return '/login'", util_source)
        self.assertIn("return getHomePath(role)", util_source)

    def test_enrollment_step_two_updates_profile_before_payment(self):
        source = ENROLLMENT_PAGE_PATH.read_text(encoding="utf-8")

        self.assertIn("title=\"Completar inscripcion\"", source)
        self.assertIn("Datos del atleta", source)
        self.assertIn("Preguntas de la competencia", source)
        self.assertIn("api.patch('/users/me'", source)
        self.assertIn("setProfileMissingFields(getMissingParticipantProfileFields(savedProfile))", source)
        self.assertIn("Registrado", source)
        self.assertIn("Necesario para continuar", source)
        self.assertIn("No hay preguntas adicionales para esta competencia.", source)
        self.assertIn("outstandingProfileMissingFields", source)
        self.assertIn("editableProfileFields", source)
        self.assertIn("Bloqueado en esta inscripcion", source)
        self.assertIn("Si necesitas corregirlos, hazlo desde tu perfil.", source)
        self.assertIn("const stepTwoBlocked", source)
        self.assertIn("loadCountries", source)
        self.assertIn("loadCitiesByCountry", source)
        self.assertIn("buildCityCountry", source)
        self.assertIn("parseCityCountry", source)
        self.assertIn("countryCode", source)
        self.assertIn("allCities.map((city)", source)
        self.assertIn("disabled={!profileDraft.countryCode || !allCities.length}", source)
        self.assertIn("La cedula debe tener entre 6 y 11 numeros.", source)
        self.assertIn("minLength={field.key === 'cedula' ? 6 : undefined}", source)
        self.assertIn("maxLength={field.key === 'cedula' ? 11 : undefined}", source)
        self.assertNotIn("Completa tu perfil antes de continuar con esta inscripcion.", source)
        self.assertNotIn(">Completar perfil<", source)


if __name__ == "__main__":
    unittest.main()
