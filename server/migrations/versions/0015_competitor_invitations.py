"""add competitor invitations table and invitations_enabled flag on competitions

Revision ID: 0015_competitor_invitations
Revises: 0014_discounts
Create Date: 2026-04-27
"""
from alembic import op


revision = "0015_competitor_invitations"
down_revision = "0014_discounts"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        "ALTER TABLE competitions "
        "ADD COLUMN IF NOT EXISTS invitations_enabled INTEGER NOT NULL DEFAULT 0"
    )
    op.execute("""
        CREATE TABLE IF NOT EXISTS competition_competitor_invitations (
            id SERIAL PRIMARY KEY,
            competition_id INTEGER NOT NULL REFERENCES competitions(id) ON DELETE CASCADE,
            user_id INTEGER REFERENCES participants(id) ON DELETE SET NULL,
            invited_email VARCHAR NOT NULL,
            categoria VARCHAR,
            note TEXT,
            status VARCHAR NOT NULL DEFAULT 'pending',
            invited_by_user_id INTEGER NOT NULL REFERENCES participants(id) ON DELETE RESTRICT,
            accepted_at TIMESTAMPTZ,
            rejected_at TIMESTAMPTZ,
            revoked_at TIMESTAMPTZ,
            created_at TIMESTAMPTZ DEFAULT NOW(),
            CONSTRAINT uq_comp_competitor_invitation_email UNIQUE (competition_id, invited_email)
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_comp_competitor_invitation_competition ON competition_competitor_invitations (competition_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_comp_competitor_invitation_status ON competition_competitor_invitations (status)")


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS competition_competitor_invitations")
    op.execute("ALTER TABLE competitions DROP COLUMN IF EXISTS invitations_enabled")
