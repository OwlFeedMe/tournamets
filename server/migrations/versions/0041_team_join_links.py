"""team join links

Revision ID: 0041_team_join_links
Revises: 0040_tv_auto_scroll
Create Date: 2026-07-24
"""

from alembic import op


revision = "0041_team_join_links"
down_revision = "0040_tv_auto_scroll"
branch_labels = None
depends_on = None


def upgrade():
    op.execute("""
        CREATE TABLE IF NOT EXISTS team_join_links (
            id SERIAL PRIMARY KEY,
            team_id INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
            token VARCHAR NOT NULL UNIQUE,
            max_uses INTEGER NOT NULL DEFAULT 1,
            used_count INTEGER NOT NULL DEFAULT 0,
            active INTEGER NOT NULL DEFAULT 1,
            created_by_user_id INTEGER REFERENCES participants(id) ON DELETE SET NULL,
            created_at TIMESTAMPTZ DEFAULT NOW()
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_team_join_links_team ON team_join_links(team_id)")
    op.execute("CREATE UNIQUE INDEX IF NOT EXISTS ix_team_join_links_token ON team_join_links(token)")
    op.execute("ALTER TABLE competition_payment_intents ADD COLUMN IF NOT EXISTS team_join_token VARCHAR")


def downgrade():
    op.execute("ALTER TABLE competition_payment_intents DROP COLUMN IF EXISTS team_join_token")
    op.execute("DROP TABLE IF EXISTS team_join_links")
