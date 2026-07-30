import re
import unittest
from pathlib import Path


APP_PATH = Path(__file__).resolve().parents[1] / "src" / "App.jsx"


class RouteResponsiveInventoryTest(unittest.TestCase):
    def test_every_declared_route_is_present_in_the_qa_inventory(self):
        source = APP_PATH.read_text(encoding="utf-8")
        declared = set(re.findall(r'path="([^"]+)"', source))
        inventory = {
            "/",
            "/home1",
            "/competition1",
            "/competition2",
            "/competition3",
            "/competition4",
            "/competition5",
            "/admin-command-proposal",
            "/competitions/:competitionId",
            "/competitions/:competitionId/inscritos",
            "/competitions/:competitionId/schedule",
            "/competitions/:competitionId/register",
            "/competitions/:competitionId/register/team/:teamToken",
            "/competitions/:competitionId/payment-result",
            "/competitions/:competitionId/tickets",
            "/competitions/:competitionId/tickets/payment-result",
            "/competitions/:competitionId/invitation/:invitationId",
            "/gyms",
            "/gyms/:slug",
            "/a/:username",
            "/gyms/:slug/manage",
            "/events",
            "/notifications",
            "/leaderboard/:competitionId",
            "/leaderboard",
            "/login",
            "/profile",
            "/gyms/suggest",
            "/competitions/:competitionId/my-schedule",
            "/my-events",
            "/judge",
            "/judge/score/*",
            "/organizer/command-proposal",
            "/announcer",
            "/organizer",
            "/organizer/*",
            "/admin/gyms",
            "/admin/finance",
            "/competitions/new",
            "/admin/users",
            "/admin",
            "/admin/*",
            "*",
        }

        self.assertEqual(declared, inventory)

    def test_inventory_has_no_retired_routes(self):
        source = APP_PATH.read_text(encoding="utf-8")

        self.assertNotIn("/admin-legacy", source)
        self.assertNotIn("AdminDashboard", source)


if __name__ == "__main__":
    unittest.main()
