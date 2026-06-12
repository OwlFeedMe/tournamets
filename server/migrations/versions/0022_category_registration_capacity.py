"""add category registration capacity controls

Revision ID: 0022_category_capacity
Revises: 0020_allow_free_categories
Create Date: 2026-06-12
"""
from alembic import op


revision = "0022_category_capacity"
down_revision = "0020_allow_free_categories"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        "ALTER TABLE competition_categories "
        "ADD COLUMN IF NOT EXISTS max_capacity INTEGER"
    )
    op.execute(
        "ALTER TABLE competition_categories "
        "ADD COLUMN IF NOT EXISTS registration_enabled INTEGER NOT NULL DEFAULT 1"
    )


def downgrade() -> None:
    op.execute("ALTER TABLE competition_categories DROP COLUMN IF EXISTS registration_enabled")
    op.execute("ALTER TABLE competition_categories DROP COLUMN IF EXISTS max_capacity")
