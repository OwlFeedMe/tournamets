"""add tv auto scroll settings

Revision ID: 0040_tv_auto_scroll
Revises: 0039_heat_schedule_config
Create Date: 2026-07-17
"""

from alembic import op


revision = "0040_tv_auto_scroll"
down_revision = "0039_heat_schedule_config"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        "ALTER TABLE competitions "
        "ADD COLUMN IF NOT EXISTS tv_auto_scroll_enabled INTEGER NOT NULL DEFAULT 1"
    )
    op.execute(
        "ALTER TABLE competitions "
        "ADD COLUMN IF NOT EXISTS tv_auto_scroll_speed INTEGER NOT NULL DEFAULT 36"
    )
    op.execute(
        "UPDATE competitions "
        "SET tv_auto_scroll_enabled = 1 "
        "WHERE tv_auto_scroll_enabled IS NULL OR tv_auto_scroll_enabled NOT IN (0, 1)"
    )
    op.execute(
        "UPDATE competitions "
        "SET tv_auto_scroll_speed = 36 "
        "WHERE tv_auto_scroll_speed IS NULL OR tv_auto_scroll_speed < 10 OR tv_auto_scroll_speed > 120"
    )


def downgrade() -> None:
    op.execute("ALTER TABLE competitions DROP COLUMN IF EXISTS tv_auto_scroll_speed")
    op.execute("ALTER TABLE competitions DROP COLUMN IF EXISTS tv_auto_scroll_enabled")
