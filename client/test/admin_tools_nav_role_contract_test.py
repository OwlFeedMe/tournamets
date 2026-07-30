import unittest
from pathlib import Path


NAV_PATH = Path(__file__).resolve().parents[1] / "src" / "components" / "admin" / "AdminToolsNav.jsx"


class AdminToolsNavRoleContractTest(unittest.TestCase):
    def test_organizers_only_see_the_competitions_admin_tool(self):
        source = NAV_PATH.read_text(encoding="utf-8")

        self.assertIn("const { adminEnabled } = useAuth()", source)
        self.assertIn("const visibleItems = adminEnabled ? adminItems", source)
        self.assertIn("item.to === '/admin'", source)
        self.assertIn("{adminEnabled ? 'Admin' : 'Organización'}", source)
        self.assertIn("visibleItems.map", source)


if __name__ == "__main__":
    unittest.main()
