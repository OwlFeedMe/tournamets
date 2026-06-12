"""add profile reminder tracking to participants

Revision ID: 0021_profile_reminder
Revises: 0022_category_capacity
Create Date: 2026-05-07
"""
from alembic import op


revision = "0021_profile_reminder"
down_revision = "0022_category_capacity"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        "ALTER TABLE participants "
        "ADD COLUMN IF NOT EXISTS profile_reminder_sent_at TIMESTAMP WITH TIME ZONE"
    )


def downgrade() -> None:
    op.execute("ALTER TABLE participants DROP COLUMN IF EXISTS profile_reminder_sent_at")
