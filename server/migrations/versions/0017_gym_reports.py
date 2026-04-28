"""add gym_reports table

Revision ID: 0017_gym_reports
Revises: 0016_gyms
Create Date: 2026-04-27
"""
from alembic import op

revision = "0017_gym_reports"
down_revision = "0016_gyms"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE IF NOT EXISTS gym_reports (
            id SERIAL PRIMARY KEY,
            gym_id INTEGER NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
            reported_by_user_id INTEGER REFERENCES participants(id) ON DELETE SET NULL,
            category VARCHAR NOT NULL DEFAULT 'wrong_info',
            details TEXT,
            status VARCHAR NOT NULL DEFAULT 'pending',
            resolved_by_admin_id INTEGER REFERENCES participants(id) ON DELETE SET NULL,
            resolved_at TIMESTAMPTZ,
            created_at TIMESTAMPTZ DEFAULT NOW()
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_gym_reports_gym ON gym_reports (gym_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_gym_reports_status ON gym_reports (status)")


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS gym_reports")
