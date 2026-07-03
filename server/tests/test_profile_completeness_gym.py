import unittest
from types import SimpleNamespace
from unittest.mock import patch

from fastapi import HTTPException

from routers.participants import _get_missing_profile_fields, _require_profile_phone


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

    def test_profile_phone_is_required_when_updating_profile(self):
        with self.assertRaises(HTTPException) as ctx:
            _require_profile_phone({"celular": ""}, _profile(celular="3001234567"))

        self.assertEqual(ctx.exception.status_code, 400)
        self.assertEqual(ctx.exception.detail, "El celular es obligatorio")


if __name__ == "__main__":
    unittest.main()
