"""add phase visibility and competition rm unit

Revision ID: 0005_phase_rm_unit
Revises: 0004_checkin_qr
Create Date: 2026-04-16
"""
from alembic import op


revision = "0005_phase_rm_unit"
down_revision = "0004_checkin_qr"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE competitions ADD COLUMN IF NOT EXISTS rm_unit TEXT NOT NULL DEFAULT 'kg'")
    op.execute("UPDATE competitions SET rm_unit = 'kg' WHERE rm_unit IS NULL OR TRIM(rm_unit) = ''")

    op.execute("ALTER TABLE competition_phases ADD COLUMN IF NOT EXISTS is_visible INTEGER NOT NULL DEFAULT 1")
    op.execute("UPDATE competition_phases SET is_visible = 1 WHERE is_visible IS NULL")


def downgrade() -> None:
    op.execute("ALTER TABLE competition_phases DROP COLUMN IF EXISTS is_visible")
    op.execute("ALTER TABLE competitions DROP COLUMN IF EXISTS rm_unit")
