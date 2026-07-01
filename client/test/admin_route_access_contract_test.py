from pathlib import Path
import unittest


APP_PATH = Path(__file__).resolve().parents[1] / "src" / "App.jsx"


class AdminRouteAccessContractTest(unittest.TestCase):
    def test_admin_workspace_accepts_admins_and_organizers(self):
        source = APP_PATH.read_text(encoding="utf-8")

        admin_route_index = source.index('path="/admin"')
        admin_wildcard_index = source.index('path="/admin/*"')

        self.assertIn("allowedRoles={['organizer', 'admin']}", source[admin_route_index:admin_wildcard_index])
        self.assertIn("allowedRoles={['organizer', 'admin']}", source[admin_wildcard_index:])

    def test_legacy_admin_remains_admin_only(self):
        source = APP_PATH.read_text(encoding="utf-8")

        legacy_route_index = source.index('path="/admin-legacy"')
        legacy_wildcard_index = source.index('path="/admin-legacy/*"')
        admin_route_index = source.index('path="/admin"')

        self.assertIn("allowedRoles={['admin']}", source[legacy_route_index:legacy_wildcard_index])
        self.assertIn("allowedRoles={['admin']}", source[legacy_wildcard_index:admin_route_index])


if __name__ == "__main__":
    unittest.main()
