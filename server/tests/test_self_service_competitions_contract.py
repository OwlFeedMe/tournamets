import inspect
import sys
import unittest
from pathlib import Path
from types import SimpleNamespace


SERVER_PATH = Path(__file__).resolve().parents[1]
if str(SERVER_PATH) not in sys.path:
    sys.path.insert(0, str(SERVER_PATH))

from auth import _effective_role as access_effective_role
from constants import Role
from routers.auth import _effective_role as response_effective_role
from routers import competitions


class SelfServiceCompetitionContractTests(unittest.TestCase):
    def test_organizer_capability_does_not_replace_user_role(self):
        self.assertEqual(
            response_effective_role(Role.USER, [Role.ORGANIZER]),
            Role.USER,
        )
        user = SimpleNamespace(
            admin_enabled=0,
            organizer_enabled=1,
            judge_enabled=0,
            announcer_enabled=0,
        )
        self.assertEqual(access_effective_role(Role.USER, user), Role.USER)

    def test_admin_and_specialist_roles_keep_priority(self):
        self.assertEqual(
            response_effective_role(Role.USER, [Role.ORGANIZER, Role.ADMIN]),
            Role.ADMIN,
        )
        self.assertEqual(
            response_effective_role(Role.USER, [Role.ORGANIZER, Role.JUDGE]),
            Role.JUDGE,
        )

    def test_creation_is_authenticated_and_assigns_the_current_user(self):
        source = inspect.getsource(competitions.create_competition)
        signature = inspect.signature(competitions.create_competition)

        self.assertIn("require_auth", str(signature))
        self.assertIn('payload["organizer_user_id"] = int(owner_user_id)', source)
        self.assertIn("owner.organizer_enabled = 1", source)
        self.assertIn("invalidate_user", source)


if __name__ == "__main__":
    unittest.main()
