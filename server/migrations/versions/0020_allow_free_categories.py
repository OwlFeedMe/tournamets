"""add allow_free_categories flag on competitions

Revision ID: 0020_allow_free_categories
Revises: 0019_sanitize_public_usernames
Create Date: 2026-04-30
"""
from alembic import op


revision = "0020_allow_free_categories"
down_revision = "0019_sanitize_public_usernames"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        "ALTER TABLE competitions "
        "ADD COLUMN IF NOT EXISTS allow_free_categories INTEGER NOT NULL DEFAULT 0"
    )


def downgrade() -> None:
    op.execute("ALTER TABLE competitions DROP COLUMN IF EXISTS allow_free_categories")
