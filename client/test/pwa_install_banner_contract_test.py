from pathlib import Path
import unittest


PWA_INSTALL_BANNER_PATH = Path(__file__).resolve().parents[1] / "src" / "pwa" / "PwaInstallBanner.jsx"


class PwaInstallBannerContractTest(unittest.TestCase):
    def test_banner_uses_solid_finalrep_surface_instead_of_blurred_light_glass(self):
        source = PWA_INSTALL_BANNER_PATH.read_text(encoding="utf-8")

        self.assertIn("background: '#171B21'", source)
        self.assertIn("border: '1px solid #252A33'", source)
        self.assertIn("color: '#F5F7FA'", source)
        self.assertIn("background: '#FF6B00'", source)
        self.assertIn("color: '#0D0F12'", source)
        self.assertNotIn("backdropFilter", source)
        self.assertNotIn("linear-gradient(135deg, rgba(241,244,248,0.98)", source)


if __name__ == "__main__":
    unittest.main()
