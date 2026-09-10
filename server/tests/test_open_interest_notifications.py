import json
import unittest
from datetime import datetime, timedelta, timezone
from unittest.mock import patch

from sqlmodel import SQLModel, Session, create_engine, select
from models import Competition, CompetitionCategory, CompetitionInterestNotification, AppNotification, Participant
from services.open_interest_notifications import deliver_open_notices


class OpenInterestTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine('sqlite://')
        SQLModel.metadata.create_all(self.engine, tables=[m.__table__ for m in [Participant, Competition, CompetitionCategory, CompetitionInterestNotification, AppNotification]])
        self.db = Session(self.engine)
        self.now = datetime.now(timezone.utc)
        self.comp = Competition(id=1, nombre='Open QA', activa=1, enrollment_open=0,
                                open_config=json.dumps({'enabled': True, 'deadline': (self.now + timedelta(days=1)).isoformat()}))
        self.db.add(self.comp)
        self.db.add(Participant(id=1, cedula='qa-notice', nombre='QA', apellido='Notice'))
        self.db.add(CompetitionCategory(competition_id=1, nombre='RX', registration_enabled=1))
        self.subscription = CompetitionInterestNotification(competition_id=1, user_id=1, email='qa@example.invalid', notification_type='open_qualifier')
        self.db.add(self.subscription)
        self.db.commit()

    def tearDown(self):
        self.db.close()
        self.engine.dispose()

    @patch('services.open_interest_notifications.send_email', return_value=True)
    def test_waits_for_open_then_delivers_once(self, mail):
        self.assertEqual(deliver_open_notices(self.db, self.now), 0)
        mail.assert_not_called()
        self.comp.enrollment_open = 1
        self.db.add(self.comp); self.db.commit()
        self.assertEqual(deliver_open_notices(self.db, self.now), 1)
        self.db.commit()
        self.assertEqual(deliver_open_notices(self.db, self.now), 0)
        mail.assert_called_once()
        self.assertEqual(len(self.db.exec(select(AppNotification)).all()), 1)

    @patch('services.open_interest_notifications.send_email', return_value=False)
    def test_email_retry_does_not_duplicate_account_notice(self, mail):
        self.comp.enrollment_open = 1
        self.db.add(self.comp); self.db.commit()
        for _ in range(2):
            deliver_open_notices(self.db, self.now); self.db.commit()
        self.assertIsNone(self.subscription.sent_at)
        self.assertEqual(mail.call_count, 2)
        self.assertEqual(len(self.db.exec(select(AppNotification)).all()), 1)

    @patch('services.open_interest_notifications.send_email', return_value=True)
    def test_does_not_announce_without_categories_or_after_deadline(self, mail):
        self.comp.enrollment_open = 1
        cat = self.db.exec(select(CompetitionCategory)).first()
        cat.registration_enabled = 0
        self.db.add(cat); self.db.add(self.comp); self.db.commit()
        self.assertEqual(deliver_open_notices(self.db, self.now), 0)
        cat.registration_enabled = 1
        self.db.add(cat); self.db.commit()
        self.assertEqual(deliver_open_notices(self.db, self.now + timedelta(days=2)), 0)
        mail.assert_not_called()
