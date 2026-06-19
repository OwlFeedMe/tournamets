import json
import unittest
from types import SimpleNamespace

from fastapi import HTTPException

from routers.enrollments import (
    _merge_enrollment_answers,
    _missing_required_enrollment_questions,
    _parse_enrollment_answers,
    _serialize_enrolled_rows,
)


class ParticipantStub:
    def __init__(self, user_id, box=""):
        self.id = user_id
        self.box = box

    def model_dump(self):
        return {"id": self.id, "box": self.box, "nombre": "Ana", "apellido": "Rojas"}


class EnrollmentQuestionTaskTests(unittest.TestCase):
    def test_missing_required_question_added_after_enrollment(self):
        questions = [
            {"id": "shirt", "label": "Talla camiseta", "field_type": "text", "required": 1},
            {"id": "notes", "label": "Notas", "field_type": "text", "required": 0},
        ]
        answers = _parse_enrollment_answers(json.dumps([
            {"question_id": "old", "question_label": "Box", "question_type": "text", "answer": "FinalRep Box"}
        ]))

        missing = _missing_required_enrollment_questions(questions, answers)

        self.assertEqual([item["id"] for item in missing], ["shirt"])

    def test_merge_keeps_existing_answers_and_historical_extras(self):
        questions = [
            {"id": "box", "label": "Box", "field_type": "text", "required": 1},
            {"id": "city", "label": "Ciudad", "field_type": "text", "required": 1},
        ]
        existing = _parse_enrollment_answers(json.dumps([
            {"question_id": "box", "question_label": "Box", "question_type": "text", "answer": "FinalRep Box"},
            {"question_id": "removed", "question_label": "Pregunta vieja", "question_type": "text", "answer": "Dato historico"},
        ]))
        incoming = [SimpleNamespace(question_id="city", answer="Bogota")]

        merged = json.loads(_merge_enrollment_answers(questions, existing, incoming))

        self.assertEqual(merged[0]["answer"], "FinalRep Box")
        self.assertEqual(merged[1]["answer"], "Bogota")
        self.assertEqual(merged[2]["question_id"], "removed")
        self.assertEqual(merged[2]["answer"], "Dato historico")

    def test_merge_rejects_missing_required_answer(self):
        questions = [{"id": "cedula", "label": "Cedula", "field_type": "text", "required": 1}]

        with self.assertRaises(HTTPException):
            _merge_enrollment_answers(questions, [], [])

    def test_serialized_rows_use_represented_gym_when_box_is_empty(self):
        enrollment = SimpleNamespace(
            categoria="RX",
            estado="confirmado",
            enrollment_answers=None,
            payment_status=None,
            payment_reference=None,
            payment_transaction_id=None,
            payment_processor_fee=0,
            payment_platform_net=0,
            payment_amount_total=0,
            payment_processed_at=None,
            inscrito_at=None,
        )

        rows = _serialize_enrolled_rows(
            [(enrollment, ParticipantStub(7, box=""))],
            {},
            [],
            {7: "FinalRep Box"},
        )

        self.assertEqual(rows[0]["box"], "FinalRep Box")

    def test_serialized_rows_keep_legacy_box_over_membership(self):
        enrollment = SimpleNamespace(
            categoria="RX",
            estado="confirmado",
            enrollment_answers=None,
            payment_status=None,
            payment_reference=None,
            payment_transaction_id=None,
            payment_processor_fee=0,
            payment_platform_net=0,
            payment_amount_total=0,
            payment_processed_at=None,
            inscrito_at=None,
        )

        rows = _serialize_enrolled_rows(
            [(enrollment, ParticipantStub(7, box="Legacy Box"))],
            {},
            [],
            {7: "FinalRep Box"},
        )

        self.assertEqual(rows[0]["box"], "Legacy Box")


if __name__ == "__main__":
    unittest.main()
