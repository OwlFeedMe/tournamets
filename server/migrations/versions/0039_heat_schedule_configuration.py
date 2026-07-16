"""add persistent heat schedule duration

Revision ID: 0039_heat_schedule_config
Revises: 0038_event_start_reminders
Create Date: 2026-07-16
"""

from alembic import op


revision = "0039_heat_schedule_config"
down_revision = "0038_event_start_reminders"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        "ALTER TABLE competition_phases "
        "ADD COLUMN IF NOT EXISTS heat_duration_seconds INTEGER NOT NULL DEFAULT 900"
    )
    op.execute(
        """
        UPDATE competition_phases phase
        SET heat_duration_seconds = derived.duration_seconds
        FROM (
            SELECT phase_id,
                   GREATEST(
                       60,
                       CAST(EXTRACT(EPOCH FROM (MAX(end_at) - MAX(start_at))) AS INTEGER)
                   ) AS duration_seconds
            FROM competition_heats
            WHERE start_at IS NOT NULL AND end_at IS NOT NULL AND end_at > start_at
            GROUP BY phase_id
        ) derived
        WHERE phase.id = derived.phase_id
          AND phase.heat_duration_seconds = 900
        """
    )


def downgrade() -> None:
    op.execute("ALTER TABLE competition_phases DROP COLUMN IF EXISTS heat_duration_seconds")
