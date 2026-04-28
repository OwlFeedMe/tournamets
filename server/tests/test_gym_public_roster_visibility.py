from pathlib import Path
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from constants import GymMembershipStatus, GymOwnershipStatus
from models import Gym
from routers.gyms import _gym_public_athlete_count, _gym_public_roster_statuses


def _gym(ownership_status: str) -> Gym:
    return Gym(
        id=1,
        slug="finalrep-box",
        display_name="FinalRep Box",
        status="published",
        ownership_status=ownership_status,
    )


class GymPublicRosterVisibilityTests(unittest.TestCase):
    def test_managed_gyms_keep_all_active_members_in_public_roster(self):
        statuses = _gym_public_roster_statuses(_gym(GymOwnershipStatus.VERIFIED))

        self.assertEqual(statuses, set(GymMembershipStatus.ACTIVE))

    def test_managed_gyms_count_pending_and_declared_athletes(self):
        counts = {
            GymMembershipStatus.DECLARED: 1,
            GymMembershipStatus.PENDING_APPROVAL: 2,
            GymMembershipStatus.APPROVED: 3,
            GymMembershipStatus.REJECTED: 9,
        }

        athlete_count = _gym_public_athlete_count(_gym(GymOwnershipStatus.CLAIMED), counts)

        self.assertEqual(athlete_count, 6)


if __name__ == "__main__":
    unittest.main()
