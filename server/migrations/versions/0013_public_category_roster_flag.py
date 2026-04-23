"""add public category roster flag

Revision ID: 0013_public_category_roster_flag
Revises: 0012_rename_participant_columns
Create Date: 2026-04-21
"""
from alembic import op


revision = "0013_public_category_roster_flag"
down_revision = "0012_rename_participant_columns"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        "ALTER TABLE competitions "
        "ADD COLUMN IF NOT EXISTS show_public_category_roster INTEGER NOT NULL DEFAULT 0"
    )


def downgrade() -> None:
    op.execute(
        "ALTER TABLE competitions "
        "DROP COLUMN IF EXISTS show_public_category_roster"
    )
