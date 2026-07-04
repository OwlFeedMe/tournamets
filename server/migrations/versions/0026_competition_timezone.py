"""add competition timezone

Revision ID: 0026_competition_timezone
Revises: 0025_heat_transition_fields
Create Date: 2026-06-27
"""
from alembic import op


revision = "0026_competition_timezone"
down_revision = "0025_heat_transition_fields"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE competitions ADD COLUMN IF NOT EXISTS timezone VARCHAR NOT NULL DEFAULT 'America/Bogota'")
    op.execute("UPDATE competitions SET timezone = 'America/Bogota' WHERE timezone IS NULL OR TRIM(timezone) = ''")


def downgrade() -> None:
    op.execute("ALTER TABLE competitions DROP COLUMN IF EXISTS timezone")
