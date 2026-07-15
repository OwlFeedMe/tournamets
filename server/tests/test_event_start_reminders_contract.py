from pathlib import Path
import unittest


SERVICE_PATH = Path(__file__).resolve().parents[1] / "services" / "event_start_reminders.py"
MAIN_PATH = Path(__file__).resolve().parents[1] / "main.py"
MIGRATION_PATH = Path(__file__).resolve().parents[1] / "migrations" / "versions" / "0038_event_start_reminder_notifications.py"


class EventStartRemindersContractTests(unittest.TestCase):
    def test_reminder_service_targets_next_confirmed_active_heat(self):
        source = SERVICE_PATH.read_text(encoding="utf-8")
        self.assertIn("NOTIFICATION_TYPE = \"event_start_reminder\"", source)
        self.assertIn("\"key\": \"60m\"", source)
        self.assertIn("\"key\": \"30m\"", source)
        self.assertIn("\"key\": \"15m\"", source)
        self.assertIn("timedelta(hours=1)", source)
        self.assertIn("timedelta(minutes=30)", source)
        self.assertIn("timedelta(minutes=15)", source)
        self.assertIn("DISTINCT ON (user_id)", source)
        self.assertIn("JOIN competition_heat_assignments a ON a.heat_id = h.id", source)
        self.assertIn("JOIN team_members", source)
        self.assertIn("cp.estado = 'confirmado'", source)
        self.assertIn("c.activa = 1", source)
        self.assertIn("h.is_published = 1", source)
        self.assertIn("COALESCE(p.is_visible, 1) = 1", source)

    def test_reminder_worker_starts_after_migrations(self):
        source = MAIN_PATH.read_text(encoding="utf-8")
        self.assertIn("run_db_migrations()", source)
        self.assertIn("start_event_start_reminder_worker()", source)

    def test_event_reminders_are_unique_per_user_and_event(self):
        source = MIGRATION_PATH.read_text(encoding="utf-8")
        self.assertIn("CREATE UNIQUE INDEX IF NOT EXISTS uq_app_notifications_event_start_reminder", source)
        self.assertIn("event_start_reminder", source)


if __name__ == "__main__":
    unittest.main()
