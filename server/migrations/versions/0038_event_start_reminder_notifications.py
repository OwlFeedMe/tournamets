"""add event start reminder notification uniqueness

Revision ID: 0038_event_start_reminders
Revises: 0037_wod_scoring_parts
Create Date: 2026-07-15
"""

from alembic import op


revision = "0038_event_start_reminders"
down_revision = "0037_wod_scoring_parts"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("DROP INDEX IF EXISTS uq_app_notifications_event_start_reminder")
    op.execute(
        """
        CREATE UNIQUE INDEX IF NOT EXISTS uq_app_notifications_event_start_reminder
        ON app_notifications (user_id, notification_type, COALESCE(data_json, ''))
        WHERE notification_type = 'event_start_reminder'
        """
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS uq_app_notifications_event_start_reminder")
