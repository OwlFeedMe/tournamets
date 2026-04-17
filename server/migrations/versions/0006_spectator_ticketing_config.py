"""add spectator ticketing configuration

Revision ID: 0006_spectator_ticketing_config
Revises: 0005_phase_rm_unit
Create Date: 2026-04-17
"""
from alembic import op


revision = "0006_spectator_ticketing_config"
down_revision = "0005_phase_rm_unit"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS competition_spectator_ticketing_config (
            id SERIAL PRIMARY KEY,
            competition_id INTEGER NOT NULL REFERENCES competitions(id) ON DELETE CASCADE,
            status TEXT NOT NULL DEFAULT 'draft',
            enabled INTEGER NOT NULL DEFAULT 0,
            activated_at TIMESTAMPTZ,
            max_capacity INTEGER NOT NULL DEFAULT 0,
            product_title TEXT,
            product_description TEXT,
            benefits_text TEXT,
            access_text TEXT,
            price_unit INTEGER NOT NULL DEFAULT 0,
            bulk_pricing_tiers TEXT,
            limit_per_identity INTEGER NOT NULL DEFAULT 1,
            max_tickets_per_person INTEGER,
            max_tickets_per_transaction INTEGER,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            CONSTRAINT uq_comp_spectator_ticketing_competition UNIQUE (competition_id)
        )
        """
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_comp_spectator_ticketing_competition "
        "ON competition_spectator_ticketing_config(competition_id)"
    )


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS competition_spectator_ticketing_config")
