import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from routers.enrollments import PENDING_VERIFICATION_STATE, _merge_participant_competition_rows


def _competition_row(competition_id: int, estado: str = "confirmado", **extra):
    row = {
        "id": competition_id,
        "nombre": f"Comp {competition_id}",
        "enrollment_estado": estado,
        "payment_status": None,
        "payment_updated_at": None,
    }
    row.update(extra)
    return row


def _intent_row(competition_id: int, payment_status: str, minutes_ago: int = 1, **extra):
    row = {
        "id": competition_id,
        "nombre": f"Comp {competition_id}",
        "enrollment_estado": PENDING_VERIFICATION_STATE,
        "payment_status": payment_status,
        "payment_updated_at": datetime.now(timezone.utc) - timedelta(minutes=minutes_ago),
        "payment_reference": f"FR-{competition_id}",
    }
    row.update(extra)
    return row


class ParticipantCompetitionsPendingPaymentTests(unittest.TestCase):
    def test_adds_pending_verification_row_when_only_payment_intent_exists(self):
        rows = _merge_participant_competition_rows([], [_intent_row(11, "approved")])

        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["id"], 11)
        self.assertEqual(rows[0]["enrollment_estado"], PENDING_VERIFICATION_STATE)
        self.assertEqual(rows[0]["payment_status"], "approved")

    def test_prefers_existing_enrollment_over_payment_intent_for_same_competition(self):
        rows = _merge_participant_competition_rows(
            [_competition_row(11, estado="confirmado")],
            [_intent_row(11, "approved")],
        )

        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["enrollment_estado"], "confirmado")

    def test_ignores_non_visible_or_expired_intents(self):
        rows = _merge_participant_competition_rows(
            [],
            [
                _intent_row(21, "prepared"),
                _intent_row(22, "created", minutes_ago=20),
                _intent_row(23, "rejected"),
            ],
        )

        self.assertEqual(rows, [])


if __name__ == "__main__":
    unittest.main()
