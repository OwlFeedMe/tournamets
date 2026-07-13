"""add scoring point step

Revision ID: 0036_scoring_point_step
Revises: 0035_athlete_follows
Create Date: 2026-07-13
"""

from alembic import op


revision = "0036_scoring_point_step"
down_revision = "0035_athlete_follows"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE competitions ADD COLUMN IF NOT EXISTS scoring_point_step INTEGER NOT NULL DEFAULT 1")
    op.execute("ALTER TABLE competition_phases ADD COLUMN IF NOT EXISTS scoring_point_step INTEGER NOT NULL DEFAULT 1")


def downgrade() -> None:
    op.execute("ALTER TABLE competition_phases DROP COLUMN IF EXISTS scoring_point_step")
    op.execute("ALTER TABLE competitions DROP COLUMN IF EXISTS scoring_point_step")
