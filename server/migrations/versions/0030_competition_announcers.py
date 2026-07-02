"""add competition announcers

Revision ID: 0030_competition_announcers
Revises: 0029_phase_time_cap
Create Date: 2026-07-02
"""

from alembic import op


revision = "0030_competition_announcers"
down_revision = "0029_phase_time_cap"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE participants ADD COLUMN IF NOT EXISTS announcer_enabled INTEGER NOT NULL DEFAULT 0")
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS competition_announcer_assignments (
            id SERIAL PRIMARY KEY,
            competition_id INTEGER NOT NULL REFERENCES competitions(id) ON DELETE CASCADE,
            user_id INTEGER REFERENCES participants(id) ON DELETE SET NULL,
            invited_email TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'pending',
            invited_by_user_id INTEGER NOT NULL REFERENCES participants(id) ON DELETE RESTRICT,
            accepted_at TIMESTAMPTZ,
            rejected_at TIMESTAMPTZ,
            revoked_at TIMESTAMPTZ,
            created_at TIMESTAMPTZ DEFAULT now(),
            updated_at TIMESTAMPTZ DEFAULT now()
        )
        """
    )
    op.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS uq_comp_announcer_assignment_user "
        "ON competition_announcer_assignments (competition_id, user_id) "
        "WHERE user_id IS NOT NULL"
    )
    op.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS uq_comp_announcer_assignment_email "
        "ON competition_announcer_assignments (competition_id, invited_email)"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_comp_announcer_assignment_competition "
        "ON competition_announcer_assignments (competition_id)"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_comp_announcer_assignment_status "
        "ON competition_announcer_assignments (status)"
    )


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS competition_announcer_assignments")
    op.execute("ALTER TABLE participants DROP COLUMN IF EXISTS announcer_enabled")
