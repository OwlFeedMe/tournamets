"""add heat transition fields

Revision ID: 0025_heat_transition_fields
Revises: 0024_result_tiebreak_ops
Create Date: 2026-06-27
"""
from alembic import op


revision = "0025_heat_transition_fields"
down_revision = "0024_result_tiebreak_ops"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE competition_heats ADD COLUMN IF NOT EXISTS heat_transition_seconds INTEGER NOT NULL DEFAULT 0")
    op.execute("ALTER TABLE competition_heats ADD COLUMN IF NOT EXISTS category_transition_seconds INTEGER NOT NULL DEFAULT 0")
    op.execute("""
        UPDATE competition_heats AS heat
        SET
            heat_transition_seconds = CASE
                WHEN COALESCE(heat.heat_transition_seconds, 0) = 0 THEN COALESCE(phase.heat_transition_seconds, 0)
                ELSE heat.heat_transition_seconds
            END,
            category_transition_seconds = CASE
                WHEN COALESCE(heat.category_transition_seconds, 0) = 0 THEN COALESCE(phase.category_transition_seconds, 0)
                ELSE heat.category_transition_seconds
            END
        FROM competition_phases AS phase
        WHERE heat.phase_id = phase.id
    """)


def downgrade() -> None:
    op.execute("ALTER TABLE competition_heats DROP COLUMN IF EXISTS category_transition_seconds")
    op.execute("ALTER TABLE competition_heats DROP COLUMN IF EXISTS heat_transition_seconds")
