"""add competition interest notifications

Revision ID: 0002_interest_notifications
Revises: 0001_baseline
Create Date: 2026-04-15
"""
from alembic import op


revision = "0002_interest_notifications"
down_revision = "0001_baseline"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS competition_interest_notifications (
            id SERIAL PRIMARY KEY,
            competition_id INTEGER NOT NULL REFERENCES competitions(id) ON DELETE CASCADE,
            participant_id INTEGER REFERENCES participants(id) ON DELETE SET NULL,
            email TEXT,
            notification_type TEXT NOT NULL DEFAULT 'open_enrollment',
            source TEXT,
            created_at TIMESTAMPTZ DEFAULT NOW()
        )
        """
    )
    op.execute(
        """
        CREATE UNIQUE INDEX IF NOT EXISTS uq_comp_interest_participant
        ON competition_interest_notifications (competition_id, notification_type, participant_id)
        WHERE participant_id IS NOT NULL
        """
    )
    op.execute(
        """
        CREATE UNIQUE INDEX IF NOT EXISTS uq_comp_interest_email
        ON competition_interest_notifications (competition_id, notification_type, email)
        WHERE email IS NOT NULL
        """
    )
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS ix_comp_interest_competition_type
        ON competition_interest_notifications (competition_id, notification_type)
        """
    )
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS ix_comp_interest_participant_id
        ON competition_interest_notifications (participant_id)
        """
    )
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS ix_comp_interest_email
        ON competition_interest_notifications (email)
        """
    )


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS competition_interest_notifications")
