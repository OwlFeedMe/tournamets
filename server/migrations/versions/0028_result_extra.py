"""add result extra field

Revision ID: 0028_result_extra
Revises: 0027_result_appeals
Create Date: 2026-06-30
"""

from alembic import op


revision = "0028_result_extra"
down_revision = "0027_result_appeals"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE results ADD COLUMN IF NOT EXISTS extra INTEGER")


def downgrade() -> None:
    op.execute("ALTER TABLE results DROP COLUMN IF EXISTS extra")
