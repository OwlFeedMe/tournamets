from pathlib import Path
import unittest


AUTHENTICATED_SHELL_PATH = Path(__file__).resolve().parents[1] / "src" / "components" / "layout" / "AuthenticatedShell.jsx"


class AuthenticatedShellFooterLegalLinksTest(unittest.TestCase):
    def test_footer_includes_iubenda_privacy_and_cookie_links(self):
        source = AUTHENTICATED_SHELL_PATH.read_text(encoding="utf-8")

        self.assertIn("https://www.iubenda.com/privacy-policy/54305130", source)
        self.assertIn("https://www.iubenda.com/privacy-policy/54305130/cookie-policy", source)
        self.assertIn("Política de Privacidad", source)
        self.assertIn("Política de Cookies", source)

    def test_footer_loads_iubenda_script_once_from_react(self):
        source = AUTHENTICATED_SHELL_PATH.read_text(encoding="utf-8")

        self.assertIn("https://cdn.iubenda.com/iubenda.js", source)
        self.assertIn("script[data-iubenda-loader='true']", source)
        self.assertIn("document.createElement('script')", source)


if __name__ == "__main__":
    unittest.main()
