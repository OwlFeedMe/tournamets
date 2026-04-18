from pathlib import Path
import unittest


EXPLORE_PAGES_PATH = Path(__file__).resolve().parents[1] / "src" / "pages" / "ExplorePages.jsx"
PARTICIPANT_PROFILE_PATH = Path(__file__).resolve().parents[1] / "src" / "pages" / "ParticipantProfile.jsx"
ENROLLMENT_PAGE_PATH = Path(__file__).resolve().parents[1] / "src" / "pages" / "CompetitionEnrollmentPage.jsx"
PAYMENT_RESULT_PAGE_PATH = Path(__file__).resolve().parents[1] / "src" / "pages" / "CompetitionPaymentResultPage.jsx"


class PendingPaymentVisibilityContractTest(unittest.TestCase):
    def test_athlete_views_render_pending_payment_state(self):
        explore_source = EXPLORE_PAGES_PATH.read_text(encoding="utf-8")
        profile_source = PARTICIPANT_PROFILE_PATH.read_text(encoding="utf-8")
        enrollment_source = ENROLLMENT_PAGE_PATH.read_text(encoding="utf-8")
        payment_result_source = PAYMENT_RESULT_PAGE_PATH.read_text(encoding="utf-8")

        self.assertIn("pago_en_verificacion", explore_source)
        self.assertIn("Pago en verificacion", explore_source)
        self.assertIn("pago_en_verificacion", profile_source)
        self.assertIn("Pago en verificacion", profile_source)
        self.assertIn("pago_en_verificacion", enrollment_source)
        self.assertIn("Estamos validando tu pago con Bold", enrollment_source)
        self.assertNotIn("Consultar estado del pago", enrollment_source)
        self.assertIn("statusCopy(status, enrollmentState)", payment_result_source)


if __name__ == "__main__":
    unittest.main()
