import io
import json
import os
import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest.mock import patch

from fastapi import HTTPException, UploadFile
from sqlmodel import Session, SQLModel, create_engine, select

from models import (Competition, CompetitionCategory, CompetitionParticipant, CompetitionPaymentIntent,
                    OpenEntry, Participant, PlatformConfig, EnrollmentAnswerItem)
from routers.open_qualifier import (Checkout, Decision, OpenConfig, Submission, apply_open_payment,
                                    checkout, configure_open, decide, my_open, submit, upload_video,
                                    preregister, Preregistration, list_entries, FinalPrices, publish_final_prices,
                                    WorkoutDetails, update_workout)
from routers.enrollments import _apply_bold_notification, free_enroll, self_enroll, stage_test_payment_enroll, set_enrolled
from services.open_qualifier import final_price, entry_state, config_for


class OpenQualifierTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine('sqlite://')
        SQLModel.metadata.create_all(self.engine, tables=[m.__table__ for m in (
            Participant, Competition, CompetitionCategory, CompetitionParticipant, CompetitionPaymentIntent, OpenEntry, PlatformConfig)])
        self.db = Session(self.engine)
        self.admin = {'role': 'admin', 'sub': '9'}
        self.user = {'role': 'user', 'sub': '1'}
        self.comp = Competition(id=1, nombre='Test Open', activa=1, enrollment_open=1, organizer_user_id=9)
        self.db.add(self.comp)
        self.db.add(Participant(id=1, cedula='123456', nombre='Test', apellido='Athlete'))
        self.db.add(CompetitionCategory(id=1, competition_id=1, nombre='RX', enrollment_price=200000))
        self.db.commit()
        self.env = patch.dict(os.environ, {'APP_ENV': 'stage'})
        self.env.start()
        self.cache = patch('services.leaderboard_cache.invalidate_leaderboard_results_snapshot')
        self.cache.start()
        self.configure()

    def tearDown(self):
        self.db.close()
        self.engine.dispose()
        self.cache.stop()
        self.env.stop()

    def configure(self, mode='full', **kwargs):
        values = dict(enabled=True, price=50000, deadline=datetime.now(timezone.utc) + timedelta(days=1),
                      instructions='20 reps. Video completo.', final_payment=mode, discount_percent=25,
                      fields=[{'id': 'score', 'label': 'Puntaje 1', 'field_type': 'number', 'required': True}])
        values.update(kwargs)
        configure_open(1, OpenConfig(**values), self.db, self.admin)

    def pay(self, final=False, **kwargs):
        return checkout(1, Checkout(categoria='RX', terms_accepted=True, stage_test=True, final=final, **kwargs), self.db, self.user)

    def deliver(self):
        return submit(1, Submission(video_url='https://example.com/video', answers={'score': '42'}), self.db, self.user)

    def expires(self):
        cfg = config_for(self.comp)
        cfg['deadline'] = (datetime.now(timezone.utc) - timedelta(seconds=1)).isoformat()
        self.comp.open_config = json.dumps(cfg)
        self.db.add(self.comp); self.db.commit()

    def preregister(self):
        return preregister(1, Preregistration(categoria='RX', terms_accepted=True), self.db, self.user)

    def test_free_preregistration_visible_to_admin_without_payment_or_final_slot(self):
        first = self.preregister()
        self.assertEqual(first['status'], 'preregistered')
        self.assertIsNone(first['paid_at'])
        self.assertIsNotNone(first['registered_at'])
        self.assertEqual(self.preregister()['registered_at'], first['registered_at'])
        rows = list_entries(1, self.db, self.admin)
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]['status'], 'preregistered')
        self.assertEqual(self.db.exec(select(CompetitionPaymentIntent)).all(), [])
        self.assertIsNone(self.db.get(CompetitionParticipant, (1, 1)))
        with self.assertRaises(HTTPException) as caught:
            self.deliver()
        self.assertEqual(caught.exception.status_code, 403)

        with self.assertRaises(HTTPException) as caught:
            upload_video(1, UploadFile(filename='v.mp4', file=io.BytesIO(b'0000ftypvideo')), self.db, self.user)
        self.assertEqual(caught.exception.status_code, 403)

    def test_organizer_assigns_category_only_after_open_review(self):
        self.db.add(CompetitionCategory(competition_id=1, nombre='Male', enrollment_price=200000))
        self.db.commit()
        self.configure(mode='pending', category_assignment='organizer', category_divisions={'RX': 'Femenino', 'Male': 'Masculino'})
        with self.assertRaises(HTTPException):
            checkout(1, Checkout(terms_accepted=True, stage_test=True), self.db, self.user)
        for body in [Preregistration(terms_accepted=True), Preregistration(categoria='RX', division='Femenino', terms_accepted=True)]:
            with self.assertRaises(HTTPException):
                preregister(1, body, self.db, self.user)
        result = preregister(1, Preregistration(division='Femenino', terms_accepted=True), self.db, self.user)
        self.assertIsNone(result['categoria'])
        self.assertEqual(result['division'], 'Femenino')
        checkout(1, Checkout(terms_accepted=True, stage_test=True), self.db, self.user)
        self.assertIsNone(my_open(1, self.db, self.user)['categoria'])
        self.deliver()
        for category in [None, 'Male']:
            with self.assertRaises(HTTPException):
                decide(1, 1, Decision(qualify=True, categoria=category), self.db, self.admin)
        publish_final_prices(1, FinalPrices(prices={'RX': 150000, 'Male': 180000}), self.db, self.admin)
        self.assertIsNone(self.db.get(OpenEntry, (1, 1)).final_amount)
        decide(1, 1, Decision(qualify=True, categoria='RX'), self.db, self.admin)
        entry = self.db.get(OpenEntry, (1, 1))
        self.assertEqual((entry.categoria, entry.final_amount, entry.status), ('RX', 150000, 'qualified'))
        self.assertIsNone(self.db.get(CompetitionParticipant, (1, 1)))
        checkout(1, Checkout(final=True, terms_accepted=True, stage_test=True), self.db, self.user)
        self.assertEqual(self.db.get(CompetitionParticipant, (1, 1)).categoria, 'RX')
        with self.assertRaises(HTTPException):
            decide(1, 1, Decision(qualify=True, categoria='Male'), self.db, self.admin)

    def test_organizer_assignment_keeps_unknown_qualifier_price_pending(self):
        self.configure(mode='pending', category_assignment='organizer', category_divisions={'RX': 'Femenino'})
        preregister(1, Preregistration(division='Femenino', terms_accepted=True), self.db, self.user)
        checkout(1, Checkout(terms_accepted=True, stage_test=True), self.db, self.user)
        self.deliver()
        decide(1, 1, Decision(qualify=True, categoria='RX'), self.db, self.admin)
        self.assertIsNone(self.db.get(OpenEntry, (1, 1)).final_amount)
        self.assertIsNone(self.db.get(CompetitionParticipant, (1, 1)))
        publish_final_prices(1, FinalPrices(prices={'RX': 100000}), self.db, self.admin)
        self.assertEqual(self.db.get(OpenEntry, (1, 1)).final_amount, 100000)

    def test_preregistration_can_pay_later_after_new_registration_closes(self):
        first = self.preregister()
        self.comp.enrollment_open = 0
        self.db.add(self.comp); self.db.commit()
        self.pay()
        entry = self.db.get(OpenEntry, (1, 1))
        self.assertEqual(entry.status, 'paid')
        self.assertIsNotNone(entry.paid_at)
        self.assertEqual(entry.registered_at, first['registered_at'])
        self.assertEqual(len(self.db.exec(select(OpenEntry)).all()), 1)
        self.deliver()

    def test_preregistration_preserves_answers_and_price_when_paying_later(self):
        self.comp.enrollment_questions = json.dumps([{'id': 'box', 'label': 'Box', 'field_type': 'text', 'required': True}])
        self.db.add(self.comp); self.db.commit()
        preregister(1, Preregistration(categoria='RX', terms_accepted=True,
                    answers=[EnrollmentAnswerItem(question_id='box', answer='My box')]), self.db, self.user)
        category = self.db.get(CompetitionCategory, 1)
        category.enrollment_price = 300000
        self.db.add(category); self.db.commit()
        self.pay()
        entry = self.db.get(OpenEntry, (1, 1))
        self.assertEqual(entry.final_amount, 200000)
        self.assertEqual(json.loads(entry.enrollment_answers)[0]['answer'], 'My box')

    def test_preregistration_requires_terms_athlete_and_open_registration(self):
        for body, user in [(Preregistration(categoria='RX'), self.user),
                           (Preregistration(categoria='RX', terms_accepted=True), {'role': 'unknown', 'sub': '9'}),
                           (Preregistration(categoria='unknown', terms_accepted=True), self.user)]:
            with self.assertRaises(HTTPException):
                preregister(1, body, self.db, user)
        self.comp.enrollment_open = 0
        self.db.add(self.comp); self.db.commit()
        with self.assertRaises(HTTPException):
            self.preregister()

    def test_unpaid_entry_survives_failed_payment_and_cannot_pay_after_deadline(self):
        self.preregister()
        with patch.dict(os.environ, {'APP_ENV': 'production', 'BOLD_ENABLED': 'true', 'BOLD_IDENTITY_KEY': 'test', 'BOLD_SECRET_KEY': 'test'}), patch('routers.enrollments._ensure_bold_payments_enabled'):
            checkout(1, Checkout(categoria='RX', terms_accepted=True), self.db, self.user)
        intent = self.db.exec(select(CompetitionPaymentIntent)).first()
        apply_open_payment(self.db, intent, 'rejected', 'test', intent.payment_amount_total)
        self.db.commit()
        self.assertEqual(my_open(1, self.db, self.user)['status'], 'preregistered')
        self.assertIsNone(my_open(1, self.db, self.user)['paid_at'])
        self.expires()
        with self.assertRaises(HTTPException):
            self.pay()

    def test_future_submission_opening_allows_registration_and_payment_but_not_delivery(self):
        opening = datetime.now(timezone.utc) + timedelta(hours=1)
        self.configure(submissions_open_at=opening)
        self.preregister(); self.pay()
        with self.assertRaises(HTTPException) as caught:
            self.deliver()
        self.assertEqual(caught.exception.status_code, 409)
        with self.assertRaises(HTTPException) as caught:
            upload_video(1, UploadFile(filename='v.mp4', file=io.BytesIO(b'0000ftypvideo')), self.db, self.user)
        self.assertEqual(caught.exception.status_code, 409)
        with patch('routers.open_qualifier.datetime', wraps=datetime) as clock:
            clock.now.return_value = opening
            self.assertEqual(self.deliver()['status'], 'submitted')

    def test_submission_opening_must_have_timezone_and_precede_deadline(self):
        for opening in [datetime.now() + timedelta(hours=1), datetime.now(timezone.utc) + timedelta(days=2)]:
            with self.assertRaises(HTTPException):
                self.configure(submissions_open_at=opening)

    def test_four_payment_modes(self):
        for mode, expected in [('full', 200000), ('difference', 150000), ('discount', 150000), ('none', 0)]:
            self.assertEqual(final_price(200000, 50000, mode, 25), expected)
        self.assertEqual(final_price(100, 200, 'difference', 0), 0)

    def test_unpublished_final_price_allows_open_but_never_confirms_for_free(self):
        self.configure(mode='pending')
        self.assertIsNone(self.preregister()['final_amount'])
        self.pay(); self.deliver()
        result = decide(1, 1, Decision(qualify=True), self.db, self.admin)
        self.assertEqual(result['status'], 'qualified')
        self.assertIsNone(result['final_amount'])
        self.assertIsNone(self.db.get(CompetitionParticipant, (1, 1)))
        with self.assertRaises(HTTPException):
            self.pay(final=True)
        publish_final_prices(1, FinalPrices(prices={'RX': 125000}), self.db, self.admin)
        self.assertEqual(my_open(1, self.db, self.user)['final_amount'], 125000)
        self.pay(final=True)
        self.assertEqual(my_open(1, self.db, self.user)['status'], 'confirmed')

    def test_workout_can_be_completed_after_registration_only_before_delivery_opens(self):
        opening = datetime.now(timezone.utc) + timedelta(hours=1)
        self.configure(submissions_open_at=opening)
        self.preregister(); self.pay()
        original = config_for(self.comp)
        details = WorkoutDetails(instructions='Official WOD', fields=[{'id': 'reps', 'label': 'Repeticiones', 'field_type': 'number', 'required': True}])
        updated = update_workout(1, details, self.db, self.admin)
        self.assertEqual(updated['instructions'], 'Official WOD')
        for key in ['price', 'final_payment', 'deadline', 'submissions_open_at']:
            self.assertEqual(updated[key], original[key])
        with patch('routers.open_qualifier.datetime', wraps=datetime) as clock:
            clock.now.return_value = opening
            with self.assertRaises(HTTPException):
                update_workout(1, details, self.db, self.admin)

    def test_published_prices_apply_to_future_entries_and_are_immutable(self):
        self.configure(mode='pending')
        publish_final_prices(1, FinalPrices(prices={'RX': 125000}), self.db, self.admin)
        self.assertEqual(self.preregister()['final_amount'], 125000)
        self.pay()
        self.assertEqual(my_open(1, self.db, self.user)['final_amount'], 125000)
        with self.assertRaises(HTTPException):
            publish_final_prices(1, FinalPrices(prices={'RX': 99000}), self.db, self.admin)
        with self.assertRaises(HTTPException):
            self.configure(mode='pending')

    def test_publishing_final_prices_requires_all_categories_and_access(self):
        self.configure(mode='pending')
        for prices in [{}, {'RX': -1}, {'RX': 100000001}, {'RX': 1000, 'unknown': 1000}]:
            with self.assertRaises(HTTPException):
                publish_final_prices(1, FinalPrices(prices=prices), self.db, self.admin)
        with self.assertRaises(HTTPException):
            publish_final_prices(1, FinalPrices(prices={'RX': 1000}), self.db, {'role': 'organizer', 'sub': '999'})

    def test_explicit_zero_publication_confirms_already_qualified_entry(self):
        self.configure(mode='pending')
        self.pay(); self.deliver()
        decide(1, 1, Decision(qualify=True), self.db, self.admin)
        publish_final_prices(1, FinalPrices(prices={'RX': 0}), self.db, self.admin)
        self.assertEqual(my_open(1, self.db, self.user)['status'], 'confirmed')

    def test_late_open_approval_uses_published_price_without_rewriting_payment_snapshot(self):
        self.configure(mode='pending')
        with patch.dict(os.environ, {'APP_ENV': 'production', 'BOLD_IDENTITY_KEY': 'test', 'BOLD_SECRET_KEY': 'test'}), patch('routers.enrollments._ensure_bold_payments_enabled'):
            checkout(1, Checkout(categoria='RX', terms_accepted=True), self.db, self.user)
        intent = self.db.exec(select(CompetitionPaymentIntent)).first()
        original_snapshot = intent.enrollment_answers
        publish_final_prices(1, FinalPrices(prices={'RX': 125000}), self.db, self.admin)
        apply_open_payment(self.db, intent, 'approved', 'test', intent.payment_amount_total)
        self.db.commit()
        self.assertEqual(my_open(1, self.db, self.user)['final_amount'], 125000)
        self.assertEqual(intent.enrollment_answers, original_snapshot)

    def test_paid_open_does_not_enroll_in_competition(self):
        self.pay()
        self.assertIsNone(self.db.get(CompetitionParticipant, (1, 1)))
        self.assertEqual(self.db.get(OpenEntry, (1, 1)).status, 'paid')
        self.assertEqual(len(self.db.exec(select(CompetitionPaymentIntent)).all()), 1)

    def test_organizer_can_list_paid_entries_and_scores(self):
        from routers.open_qualifier import list_entries
        self.pay(); self.deliver()
        rows = list_entries(1, self.db, self.admin)
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]['name'], 'Test Athlete')
        self.assertEqual(rows[0]['answers']['score'], '42')

    def test_qualification_requires_separate_full_payment(self):
        self.pay(); self.deliver()
        decision = decide(1, 1, Decision(qualify=True), self.db, self.admin)
        self.assertEqual(decision['final_amount'], 200000)
        self.assertEqual(decision['user_id'], 1)
        self.assertIsNone(self.db.get(CompetitionParticipant, (1, 1)))
        self.assertEqual(self.db.get(OpenEntry, (1, 1)).status, 'qualified')
        result = self.pay(final=True)
        self.assertEqual(result['pricing']['organizer_price'], 200000)
        self.assertEqual(self.db.get(OpenEntry, (1, 1)).status, 'confirmed')
        self.assertEqual(self.db.get(CompetitionParticipant, (1, 1)).estado, 'confirmado')
        self.assertEqual(len(self.db.exec(select(CompetitionPaymentIntent)).all()), 2)

    def test_none_confirms_without_second_payment(self):
        self.configure('none'); self.pay(); self.deliver()
        decide(1, 1, Decision(qualify=True), self.db, self.admin)
        self.assertEqual(self.db.get(CompetitionParticipant, (1, 1)).estado, 'confirmado')

    def test_difference_and_discount_checkout(self):
        self.configure('difference'); self.pay(); self.deliver()
        decide(1, 1, Decision(qualify=True), self.db, self.admin)
        self.assertEqual(self.pay(final=True)['pricing']['organizer_price'], 150000)

    def test_discount_checkout(self):
        self.configure('discount', discount_percent=40); self.pay(); self.deliver()
        decide(1, 1, Decision(qualify=True), self.db, self.admin)
        self.assertEqual(self.pay(final=True)['pricing']['organizer_price'], 120000)

    def test_terms_required(self):
        with self.assertRaises(HTTPException):
            checkout(1, Checkout(categoria='RX', stage_test=True), self.db, self.user)
        self.assertIsNone(self.db.get(OpenEntry, (1, 1)))

    def test_cannot_deliver_without_payment(self):
        with self.assertRaises(HTTPException) as ctx: self.deliver()
        self.assertEqual(ctx.exception.status_code, 403)

    def test_no_submission_after_deadline(self):
        self.pay(); self.expires()
        with self.assertRaises(HTTPException): self.deliver()
        self.assertEqual(my_open(1, self.db, self.user)['status'], 'missing')
        self.assertEqual(self.db.exec(select(CompetitionPaymentIntent)).first().payment_status, 'approved')
        with self.assertRaises(HTTPException): decide(1, 1, Decision(qualify=True), self.db, self.admin)

    def test_no_registration_after_deadline(self):
        self.expires()
        with self.assertRaises(HTTPException): self.pay()

    def test_duplicate_payment_and_early_final_blocked(self):
        self.pay()
        with self.assertRaises(HTTPException): self.pay()
        with self.assertRaises(HTTPException): self.pay(final=True)

    def test_required_scores_and_safe_urls(self):
        self.pay()
        for url, score in [('javascript:alert(1)', '42'), ('https://example.com', ''), ('https://example.com', 'NaN')]:
            with self.assertRaises(HTTPException):
                submit(1, Submission(video_url=url, answers={'score': score}), self.db, self.user)

    def test_edit_until_review_then_locked(self):
        self.pay(); self.deliver(); self.deliver()
        decide(1, 1, Decision(qualify=False), self.db, self.admin)
        with self.assertRaises(HTTPException): self.deliver()
        with self.assertRaises(HTTPException): self.pay(final=True)

    def test_cannot_change_terms_after_payment(self):
        self.pay()
        with self.assertRaises(HTTPException): self.configure('none')

    def test_final_price_snapshot_survives_category_changes(self):
        self.pay()
        cat = self.db.get(CompetitionCategory, 1); cat.enrollment_price = 900000
        self.db.add(cat); self.db.commit(); self.deliver()
        decide(1, 1, Decision(qualify=True), self.db, self.admin)
        self.assertEqual(self.pay(final=True)['pricing']['organizer_price'], 200000)

    def test_stage_simulation_unavailable_in_production(self):
        with patch.dict(os.environ, {'APP_ENV': 'production'}):
            with self.assertRaises(HTTPException) as ctx: self.pay()
        self.assertEqual(ctx.exception.status_code, 403)

    def test_other_organizer_cannot_review(self):
        self.pay(); self.deliver()
        with self.assertRaises(HTTPException):
            decide(1, 1, Decision(qualify=True), self.db, {'role': 'organizer', 'sub': '10'})

    def test_approved_webhook_replay_never_downgrades_entry(self):
        self.pay(); self.deliver()
        intent = self.db.exec(select(CompetitionPaymentIntent)).first()
        for status in ['approved', 'failed', 'pending']:
            apply_open_payment(self.db, intent, status, 'repeat', intent.payment_amount_total)
        self.assertEqual(self.db.get(OpenEntry, (1, 1)).status, 'submitted')
        self.assertEqual(intent.payment_status, 'approved')

    def test_direct_registration_paths_blocked(self):
        from models import SelfEnrollRequest, EnrollBody
        for fn in [free_enroll, self_enroll, stage_test_payment_enroll]:
            with self.assertRaises(HTTPException) as ctx: fn(1, SelfEnrollRequest(categoria='RX'), self.db, self.user)
            self.assertEqual(ctx.exception.status_code, 409)
        with self.assertRaises(HTTPException): set_enrolled(1, EnrollBody(participants=[]), self.db, self.admin)

    def test_enrollment_questions_preserved(self):
        self.comp.enrollment_questions = json.dumps([{'id': 'box', 'label': 'Box', 'required': True}])
        self.db.add(self.comp); self.db.commit()
        self.pay(answers=[EnrollmentAnswerItem(question_id='box', answer='Test Box')])
        self.assertIn('Test Box', self.db.get(OpenEntry, (1, 1)).enrollment_answers)

    def test_video_upload_and_submission(self):
        self.pay()
        with tempfile.TemporaryDirectory() as tmp, patch('routers.open_qualifier.UPLOADS', Path(tmp)):
            result = upload_video(1, UploadFile(filename='open.mp4', file=io.BytesIO(b'0000ftyp' + b'0' * 30)), self.db, self.user)
            submit(1, Submission(video_url=result['url'], answers={'score': 0}), self.db, self.user)
            self.assertTrue(self.db.get(OpenEntry, (1, 1)).video_url.startswith('/uploads/open_videos/'))
            with self.assertRaises(HTTPException):
                upload_video(1, UploadFile(filename='open.mp4', file=io.BytesIO(b'not a video')), self.db, self.user)

    def prepared_payment(self):
        with patch.dict(os.environ, {'APP_ENV': 'production', 'PAYMENTS_ENABLED': '1', 'PAYMENT_PROVIDER': 'bold', 'BOLD_IDENTITY_KEY': 'test', 'BOLD_SECRET_KEY': 'test'}):
            result = checkout(1, Checkout(categoria='RX', terms_accepted=True), self.db, self.user)
        return result, self.db.exec(select(CompetitionPaymentIntent)).first()

    def test_prepared_and_rejected_payments_never_enroll(self):
        result, intent = self.prepared_payment()
        self.assertIsNone(self.db.get(OpenEntry, (1, 1)))
        apply_open_payment(self.db, intent, 'rejected', 'test', 0)
        self.db.commit()
        self.assertIsNone(self.db.get(OpenEntry, (1, 1)))
        self.assertIsNone(self.db.get(CompetitionParticipant, (1, 1)))

    def test_webhook_validates_amount_then_creates_paid_entry(self):
        result, intent = self.prepared_payment()
        payload = {'type': 'SALE_APPROVED', 'data': {'reference': intent.payment_reference, 'payment_id': 'test', 'amount': {'total': 1}}}
        with self.assertRaises(HTTPException): _apply_bold_notification(self.db, payload)
        self.assertIsNone(self.db.get(OpenEntry, (1, 1)))
        payload['data']['amount']['total'] = intent.payment_amount_total
        _apply_bold_notification(self.db, payload); self.db.commit()
        self.assertEqual(self.db.get(OpenEntry, (1, 1)).status, 'paid')
        self.assertIsNone(self.db.get(CompetitionParticipant, (1, 1)))

    def test_open_payments_do_not_reserve_final_category_capacity(self):
        from services.category_registration import get_category_usage
        self.pay()
        self.assertEqual(get_category_usage(self.db, 1), {})

    def test_configuration_locked_when_payment_prepared(self):
        self.prepared_payment()
        with self.assertRaises(HTTPException): self.configure('none')


if __name__ == '__main__':
    unittest.main()
