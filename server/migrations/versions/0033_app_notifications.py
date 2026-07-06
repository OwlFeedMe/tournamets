"""add app notifications

Revision ID: 0033_app_notifications
Revises: 0032_scoring_configuration
Create Date: 2026-07-06
"""

from alembic import op


revision = "0033_app_notifications"
down_revision = "0032_scoring_configuration"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE IF NOT EXISTS app_notifications (
            id SERIAL PRIMARY KEY,
            user_id INTEGER NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
            notification_type VARCHAR NOT NULL DEFAULT 'result_created',
            title VARCHAR NOT NULL,
            body VARCHAR NOT NULL,
            action_url VARCHAR,
            data_json TEXT,
            read_at TIMESTAMP WITH TIME ZONE,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_app_notifications_user_id ON app_notifications (user_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_app_notifications_type ON app_notifications (notification_type)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_app_notifications_user_created ON app_notifications (user_id, created_at)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_app_notifications_user_read ON app_notifications (user_id, read_at)")


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS app_notifications")
