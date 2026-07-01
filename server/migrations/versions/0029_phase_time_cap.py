"""add phase time cap

Revision ID: 0029_phase_time_cap
Revises: 0028_result_extra
Create Date: 2026-07-01
"""

from alembic import op


revision = "0029_phase_time_cap"
down_revision = "0028_result_extra"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE competition_phases ADD COLUMN IF NOT EXISTS time_cap_seconds INTEGER")


def downgrade() -> None:
    op.execute("ALTER TABLE competition_phases DROP COLUMN IF EXISTS time_cap_seconds")
