"""add competition category audit log

Revision ID: 0023_category_audit
Revises: 0021_profile_reminder
Create Date: 2026-06-19
"""
from alembic import op


revision = "0023_category_audit"
down_revision = "0021_profile_reminder"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE IF NOT EXISTS competition_category_audit (
            id SERIAL PRIMARY KEY,
            competition_id INTEGER NOT NULL REFERENCES competitions(id) ON DELETE CASCADE,
            category_id INTEGER,
            action VARCHAR NOT NULL,
            actor_user_id INTEGER REFERENCES participants(id) ON DELETE SET NULL,
            before_data JSONB,
            after_data JSONB,
            reason TEXT,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_competition_category_audit_competition ON competition_category_audit (competition_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_competition_category_audit_category ON competition_category_audit (category_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_competition_category_audit_actor ON competition_category_audit (actor_user_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_competition_category_audit_created ON competition_category_audit (created_at)")


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS competition_category_audit")
