"""add push subscriptions

Revision ID: 0034_push_subscriptions
Revises: 0033_app_notifications
Create Date: 2026-07-06
"""

from alembic import op


revision = "0034_push_subscriptions"
down_revision = "0033_app_notifications"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE IF NOT EXISTS push_subscriptions (
            id SERIAL PRIMARY KEY,
            user_id INTEGER NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
            endpoint TEXT NOT NULL,
            p256dh TEXT NOT NULL,
            auth TEXT NOT NULL,
            user_agent TEXT,
            failure_count INTEGER NOT NULL DEFAULT 0,
            disabled_at TIMESTAMP WITH TIME ZONE,
            last_success_at TIMESTAMP WITH TIME ZONE,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
        )
    """)
    op.execute("CREATE UNIQUE INDEX IF NOT EXISTS uq_push_subscriptions_endpoint ON push_subscriptions (endpoint)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_push_subscriptions_user ON push_subscriptions (user_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_push_subscriptions_disabled ON push_subscriptions (disabled_at)")


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS push_subscriptions")
