import unittest
from datetime import datetime, timezone
from types import SimpleNamespace

from routers.enrollments import _serialize_enrolled_rows


class EnrollmentCheckinStatusTests(unittest.TestCase):
    def test_serialized_rows_include_checkin_flags(self):
        used_at = datetime(2026, 4, 16, 8, 14, tzinfo=timezone.utc)
        participant_done = SimpleNamespace(
            id=1,
            model_dump=lambda: {"id": 1, "nombre": "Maria", "apellido": "Lopez"},
        )
        participant_pending = SimpleNamespace(
            id=2,
            model_dump=lambda: {"id": 2, "nombre": "Juan", "apellido": "Perez"},
        )
        rows = [
            (
                SimpleNamespace(
                    categoria="Scaled",
                    estado="confirmado",
                    enrollment_answers=None,
                    payment_status="paid",
                    payment_reference="ref-1",
                    payment_transaction_id="tx-1",
                    payment_processor_fee=300,
                    payment_platform_net=9700,
                    payment_amount_total=10000,
                ),
                participant_done,
            ),
            (
                SimpleNamespace(
                    categoria="Rx",
                    estado="confirmado",
                    enrollment_answers=None,
                    payment_status="paid",
                    payment_reference="ref-2",
                    payment_transaction_id="tx-2",
                    payment_processor_fee=300,
                    payment_platform_net=9700,
                    payment_amount_total=10000,
                ),
                participant_pending,
            ),
        ]

        items = _serialize_enrolled_rows(rows, {1: used_at})

        self.assertTrue(items[0]["check_in_done"])
        self.assertEqual(items[0]["check_in_used_at"], used_at)
        self.assertFalse(items[1]["check_in_done"])
        self.assertIsNone(items[1]["check_in_used_at"])


if __name__ == "__main__":
    unittest.main()
