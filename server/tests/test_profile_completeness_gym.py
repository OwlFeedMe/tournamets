import unittest
from types import SimpleNamespace
from unittest.mock import patch

from fastapi import HTTPException

from routers.participants import _get_missing_profile_fields, _remove_immutable_email


def _profile(**extra):
    data = {
        "id": 7,
        "email": "ana@example.com",
        "celular": "3001234567",
        "genero": "F",
        "sexo": "F",
        "fecha_nacimiento": "1994-05-10",
        "ciudad_pais": "Bogota, Colombia",
        "profile_photo_url": "/uploads/profile_photos/a.jpg",
        "box": "",
    }
    data.update(extra)
    return SimpleNamespace(**data)


class ProfileCompletenessGymTests(unittest.TestCase):
    def test_missing_gym_when_membership_is_absent(self):
        self.assertIn("gym", _get_missing_profile_fields(_profile()))

    def test_legacy_box_does_not_complete_gym_requirement(self):
        self.assertIn("gym", _get_missing_profile_fields(_profile(box="FinalRep Box")))

    def test_active_gym_membership_completes_gym_requirement(self):
        with patch("routers.participants._has_active_gym_membership", return_value=True):
            self.assertNotIn("gym", _get_missing_profile_fields(_profile(), session=object()))

    def test_profile_email_is_removed_when_unchanged(self):
        payload = {"email": "ana@example.com", "nombre": "Ana"}

        _remove_immutable_email(payload, _profile(email="ana@example.com"))

        self.assertNotIn("email", payload)
        self.assertEqual(payload["nombre"], "Ana")

    def test_profile_email_change_is_rejected(self):
        with self.assertRaises(HTTPException) as ctx:
            _remove_immutable_email({"email": "otra@example.com"}, _profile(email="ana@example.com"))

        self.assertEqual(ctx.exception.status_code, 400)
        self.assertEqual(ctx.exception.detail, "El email no se puede cambiar")


if __name__ == "__main__":
    unittest.main()
