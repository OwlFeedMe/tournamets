"""add wod scoring parts

Revision ID: 0037_wod_scoring_parts
Revises: 0036_scoring_point_step
Create Date: 2026-07-14
"""

from alembic import op


revision = "0037_wod_scoring_parts"
down_revision = "0036_scoring_point_step"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE competition_phases ADD COLUMN IF NOT EXISTS parent_phase_id INTEGER REFERENCES competition_phases(id) ON DELETE CASCADE")
    op.execute("ALTER TABLE competition_phases ADD COLUMN IF NOT EXISTS score_key TEXT")
    op.execute("ALTER TABLE competition_phases ADD COLUMN IF NOT EXISTS is_scoring_unit INTEGER NOT NULL DEFAULT 1")
    op.execute("ALTER TABLE competition_phases ADD COLUMN IF NOT EXISTS is_result_container INTEGER NOT NULL DEFAULT 0")
    op.execute("CREATE INDEX IF NOT EXISTS ix_competition_phases_parent_phase ON competition_phases(parent_phase_id)")


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_competition_phases_parent_phase")
    op.execute("ALTER TABLE competition_phases DROP COLUMN IF EXISTS is_result_container")
    op.execute("ALTER TABLE competition_phases DROP COLUMN IF EXISTS is_scoring_unit")
    op.execute("ALTER TABLE competition_phases DROP COLUMN IF EXISTS score_key")
    op.execute("ALTER TABLE competition_phases DROP COLUMN IF EXISTS parent_phase_id")
