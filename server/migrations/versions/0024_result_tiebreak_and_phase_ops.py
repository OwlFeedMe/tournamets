"""add result tiebreak and phase operation fields

Revision ID: 0024_result_tiebreak_ops
Revises: 0023_category_audit
Create Date: 2026-06-26
"""
from alembic import op


revision = "0024_result_tiebreak_ops"
down_revision = "0023_category_audit"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE results ADD COLUMN IF NOT EXISTS tiebreak INTEGER")
    op.execute("ALTER TABLE competition_phases ADD COLUMN IF NOT EXISTS workout_format TEXT")
    op.execute("ALTER TABLE competition_phases ADD COLUMN IF NOT EXISTS tie_break_enabled INTEGER NOT NULL DEFAULT 0")
    op.execute("ALTER TABLE competition_phases ADD COLUMN IF NOT EXISTS tie_break_method TEXT NOT NULL DEFAULT 'for_time'")
    op.execute("ALTER TABLE competition_phases ADD COLUMN IF NOT EXISTS heat_transition_seconds INTEGER NOT NULL DEFAULT 0")
    op.execute("ALTER TABLE competition_phases ADD COLUMN IF NOT EXISTS category_transition_seconds INTEGER NOT NULL DEFAULT 0")
    op.execute("""
        UPDATE competition_phases
        SET workout_format = COALESCE(NULLIF(TRIM(workout_format), ''), measurement_method, 'for_time')
        WHERE workout_format IS NULL OR TRIM(workout_format) = ''
    """)


def downgrade() -> None:
    op.execute("ALTER TABLE competition_phases DROP COLUMN IF EXISTS category_transition_seconds")
    op.execute("ALTER TABLE competition_phases DROP COLUMN IF EXISTS heat_transition_seconds")
    op.execute("ALTER TABLE competition_phases DROP COLUMN IF EXISTS tie_break_method")
    op.execute("ALTER TABLE competition_phases DROP COLUMN IF EXISTS tie_break_enabled")
    op.execute("ALTER TABLE competition_phases DROP COLUMN IF EXISTS workout_format")
    op.execute("ALTER TABLE results DROP COLUMN IF EXISTS tiebreak")
