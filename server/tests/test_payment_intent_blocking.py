import unittest
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

from routers.enrollments import _is_payment_intent_blocking


def _make_intent(status: str, minutes_ago: int) -> SimpleNamespace:
    updated_at = datetime.now(timezone.utc) - timedelta(minutes=minutes_ago)
    return SimpleNamespace(payment_status=status, payment_updated_at=updated_at)


class PaymentIntentBlockingTests(unittest.TestCase):

    # --- No intent ---

    def test_no_intent_does_not_block(self):
        self.assertFalse(_is_payment_intent_blocking(None))

    # --- Estado 'created' ---

    def test_created_intent_recent_blocks(self):
        """Un intent 'created' de hace 5 minutos debe bloquear (usuario puede estar en checkout)."""
        intent = _make_intent("created", minutes_ago=5)
        self.assertTrue(_is_payment_intent_blocking(intent))

    def test_created_intent_expired_does_not_block(self):
        """Un intent 'created' de hace 20 minutos no debe bloquear (usuario abandono la pestana)."""
        intent = _make_intent("created", minutes_ago=20)
        self.assertFalse(_is_payment_intent_blocking(intent))

    def test_created_intent_at_exact_timeout_does_not_block(self):
        """Un intent 'created' exactamente en el limite (15 min) no bloquea."""
        intent = _make_intent("created", minutes_ago=15)
        self.assertFalse(_is_payment_intent_blocking(intent))

    # --- Estados que siempre bloquean ---

    def test_processing_always_blocks(self):
        intent = _make_intent("processing", minutes_ago=60)
        self.assertTrue(_is_payment_intent_blocking(intent))

    def test_pending_always_blocks(self):
        intent = _make_intent("pending", minutes_ago=60)
        self.assertTrue(_is_payment_intent_blocking(intent))

    def test_approved_always_blocks(self):
        intent = _make_intent("approved", minutes_ago=60)
        self.assertTrue(_is_payment_intent_blocking(intent))

    # --- Estados que nunca bloquean ---

    def test_rejected_does_not_block(self):
        intent = _make_intent("rejected", minutes_ago=1)
        self.assertFalse(_is_payment_intent_blocking(intent))

    def test_failed_does_not_block(self):
        intent = _make_intent("failed", minutes_ago=1)
        self.assertFalse(_is_payment_intent_blocking(intent))

    def test_unknown_status_does_not_block(self):
        intent = _make_intent("some_unknown_state", minutes_ago=1)
        self.assertFalse(_is_payment_intent_blocking(intent))


if __name__ == "__main__":
    unittest.main()
