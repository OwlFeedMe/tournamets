from pathlib import Path
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from routers.competitions import _build_public_category_roster_payload, _build_public_team_entries


class PublicCategoryRosterTests(unittest.TestCase):
    def test_build_public_team_entries_prefers_explicit_category_and_sanitizes_members(self):
        team_rows = [
            {
                "team_id": 17,
                "team_name": "Wolves",
                "team_category_name": "Elite Teams",
                "member_id": 3,
                "nombre": "Ana",
                "apellido": "Lopez",
                "profile_photo_url": "/img/ana.jpg",
                "ciudad_pais": "Bogota, Colombia",
                "box": "Cross Box",
                "member_category": "Scaled",
                "email": "secret@example.com",
            },
            {
                "team_id": 17,
                "team_name": "Wolves",
                "team_category_name": "Elite Teams",
                "member_id": 4,
                "nombre": "Luis",
                "apellido": "Perez",
                "profile_photo_url": None,
                "ciudad_pais": "Medellin, Colombia",
                "box": "Downtown Box",
                "member_category": "Rx",
                "cedula": "999999",
            },
        ]

        items = _build_public_team_entries(team_rows)

        self.assertEqual(len(items), 1)
        self.assertEqual(items[0]["category_name"], "Elite Teams")
        self.assertEqual(items[0]["nombre"], "Wolves")
        self.assertEqual(
            set(items[0]["members"][0].keys()),
            {"id", "nombre", "apellido", "profile_photo_url", "ciudad_pais", "box"},
        )
        self.assertNotIn("email", items[0]["members"][0])
        self.assertNotIn("cedula", items[0]["members"][1])

    def test_build_public_category_roster_payload_keeps_category_order_and_empty_entries(self):
        categories = [
            {"id": 1, "nombre": "Rx Elite", "modality": "individual"},
            {"id": 2, "nombre": "Scaled", "modality": "individual"},
            {"id": 3, "nombre": "Equipos Elite", "modality": "teams"},
        ]
        individual_rows = [
            {
                "id": 8,
                "nombre": "Sara",
                "apellido": "Gomez",
                "profile_photo_url": "/img/sara.jpg",
                "ciudad_pais": "Cali, Colombia",
                "box": "Iron Box",
                "categoria": "Scaled",
                "payment_reference": "FR-123",
            }
        ]
        team_entries = [
            {
                "id": 20,
                "nombre": "Storm",
                "category_name": "Equipos Elite",
                "members": [
                    {
                        "id": 9,
                        "nombre": "Mia",
                        "apellido": "Ruiz",
                        "profile_photo_url": None,
                        "ciudad_pais": "Bogota, Colombia",
                        "box": "North Box",
                        "phone": "3000000000",
                    }
                ],
            }
        ]

        payload = _build_public_category_roster_payload(categories, individual_rows, team_entries)

        self.assertEqual(
            [item["category_name"] for item in payload["individual"]],
            ["Rx Elite", "Scaled"],
        )
        self.assertEqual(payload["individual"][0]["participants"], [])
        self.assertEqual(payload["individual"][1]["participants"][0]["nombre"], "Sara")
        self.assertNotIn("payment_reference", payload["individual"][1]["participants"][0])
        self.assertEqual(payload["teams"][0]["teams"][0]["nombre"], "Storm")
        self.assertNotIn("phone", payload["teams"][0]["teams"][0]["members"][0])


if __name__ == "__main__":
    unittest.main()
