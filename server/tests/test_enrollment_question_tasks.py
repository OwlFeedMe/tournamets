import json
import unittest
from types import SimpleNamespace

from fastapi import HTTPException

from routers.enrollments import (
    _merge_enrollment_answers,
    _missing_required_enrollment_questions,
    _parse_enrollment_answers,
)


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


if __name__ == "__main__":
    unittest.main()
