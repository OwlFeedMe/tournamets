from pathlib import Path
import sys
import unittest
import json

from sqlmodel import SQLModel, Session, create_engine
from models import Competition, CompetitionCategory, CompetitionParticipant, OpenEntry, Participant, Team, TeamMember

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from routers.competitions import _build_public_category_roster_payload, _build_public_team_entries, get_public_competition_roster


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
                "username": "ana.lopez",
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
                "username": "luis.perez",
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
            {"id", "nombre", "apellido", "profile_photo_url", "ciudad_pais", "box", "username"},
        )
        self.assertEqual(items[0]["members"][0]["username"], "ana.lopez")
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


class QualifiedPublicRosterTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine('sqlite://')
        SQLModel.metadata.create_all(self.engine, tables=[m.__table__ for m in (
            Participant, Competition, CompetitionCategory, CompetitionParticipant, OpenEntry, Team, TeamMember)])
        self.db = Session(self.engine)
        self.comp = Competition(id=1, nombre='League', activa=1, show_public_category_roster=1,
                                open_config=json.dumps({'enabled': True, 'public_phase': 'competition'}))
        self.db.add(self.comp)
        self.db.add(CompetitionCategory(id=1, competition_id=1, nombre='Rookie Femenino'))
        for uid, status in [(1, 'qualified'), (2, 'qualified'), (3, 'submitted'), (4, 'rejected'), (5, 'preregistered')]:
            self.db.add(Participant(id=uid, cedula=str(uid), nombre=f'Athlete {uid}', apellido='Test', email='private@example.com'))
            self.db.add(OpenEntry(competition_id=1, user_id=uid, categoria='Rookie Femenino', status=status,
                                  open_price=50000, final_amount=50000, terms_snapshot='{}'))
        self.db.add(CompetitionParticipant(competition_id=1, user_id=2, categoria='Rookie Femenino', estado='confirmado'))
        self.db.commit()

    def tearDown(self):
        self.db.close()
        self.engine.dispose()

    def test_qualified_are_public_without_duplicates_or_payment_details(self):
        payload = get_public_competition_roster('1', self.db, None)
        people = payload['individual'][0]['participants']
        self.assertEqual({p['id'] for p in people}, {1, 2})
        self.assertEqual(len(people), 2)
        for person in people:
            self.assertTrue({'email', 'cedula', 'status', 'final_amount', 'terms_snapshot', 'payment_status'}.isdisjoint(person))

    def test_open_phase_keeps_only_confirmed_and_respects_roster_switch(self):
        self.comp.open_config = json.dumps({'enabled': True})
        self.db.add(self.comp); self.db.commit()
        payload = get_public_competition_roster('1', self.db, None)
        self.assertEqual([p['id'] for p in payload['individual'][0]['participants']], [2])
        self.comp.show_public_category_roster = 0
        self.db.add(self.comp); self.db.commit()
        payload = get_public_competition_roster('1', self.db, None)
        self.assertFalse(payload['enabled'])
        self.assertEqual(payload['individual'][0]['participants'], [])


if __name__ == "__main__":
    unittest.main()
