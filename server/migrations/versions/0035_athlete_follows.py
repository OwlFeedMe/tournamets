"""add athlete follows

Revision ID: 0035_athlete_follows
Revises: 0034_push_subscriptions
Create Date: 2026-07-06
"""

from alembic import op


revision = "0035_athlete_follows"
down_revision = "0034_push_subscriptions"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE IF NOT EXISTS athlete_follows (
            id SERIAL PRIMARY KEY,
            follower_user_id INTEGER NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
            competition_id INTEGER NOT NULL REFERENCES competitions(id) ON DELETE CASCADE,
            athlete_user_id INTEGER NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
            competition_name TEXT,
            athlete_name TEXT,
            username VARCHAR,
            category VARCHAR,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
        )
    """)
    op.execute("""
        CREATE UNIQUE INDEX IF NOT EXISTS uq_athlete_follows_user_comp_athlete
        ON athlete_follows (follower_user_id, competition_id, athlete_user_id)
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_athlete_follows_athlete ON athlete_follows (competition_id, athlete_user_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_athlete_follows_follower ON athlete_follows (follower_user_id)")


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS athlete_follows")
