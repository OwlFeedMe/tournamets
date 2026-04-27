"""add discount tables and discount columns to participants and payment intents

Revision ID: 0014_discounts
Revises: 0013_public_category_roster_flag
Create Date: 2026-04-27
"""
from alembic import op


revision = "0014_discounts"
down_revision = "0013_public_category_roster_flag"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE IF NOT EXISTS competition_discounts (
            id SERIAL PRIMARY KEY,
            competition_id INTEGER NOT NULL REFERENCES competitions(id) ON DELETE CASCADE,
            code VARCHAR(50) NOT NULL,
            description TEXT,
            discount_type VARCHAR(20) NOT NULL DEFAULT 'percentage',
            discount_value INTEGER NOT NULL DEFAULT 0,
            max_uses INTEGER,
            uses_count INTEGER NOT NULL DEFAULT 0,
            max_uses_per_user INTEGER NOT NULL DEFAULT 1,
            applies_to_category_id INTEGER REFERENCES competition_categories(id) ON DELETE SET NULL,
            valid_from TIMESTAMPTZ,
            valid_until TIMESTAMPTZ,
            is_active INTEGER NOT NULL DEFAULT 1,
            created_by_user_id INTEGER NOT NULL REFERENCES participants(id) ON DELETE RESTRICT,
            created_at TIMESTAMPTZ DEFAULT NOW(),
            CONSTRAINT uq_comp_discount_code UNIQUE (competition_id, code)
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_comp_discount_competition ON competition_discounts (competition_id)")

    op.execute("""
        CREATE TABLE IF NOT EXISTS competition_discount_usages (
            id SERIAL PRIMARY KEY,
            discount_id INTEGER NOT NULL REFERENCES competition_discounts(id) ON DELETE CASCADE,
            competition_id INTEGER NOT NULL REFERENCES competitions(id) ON DELETE CASCADE,
            user_id INTEGER NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
            discount_code VARCHAR(50) NOT NULL,
            discount_type VARCHAR(20) NOT NULL,
            discount_value INTEGER NOT NULL,
            base_price_before INTEGER NOT NULL DEFAULT 0,
            discount_amount_applied INTEGER NOT NULL DEFAULT 0,
            final_base_price INTEGER NOT NULL DEFAULT 0,
            payment_intent_id INTEGER REFERENCES competition_payment_intents(id) ON DELETE SET NULL,
            enrollment_status VARCHAR(20) NOT NULL DEFAULT 'pending',
            applied_at TIMESTAMPTZ DEFAULT NOW()
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_comp_discount_usage_discount ON competition_discount_usages (discount_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_comp_discount_usage_user ON competition_discount_usages (user_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_comp_discount_usage_competition ON competition_discount_usages (competition_id)")

    op.execute("ALTER TABLE competition_participants ADD COLUMN IF NOT EXISTS discount_id INTEGER REFERENCES competition_discounts(id) ON DELETE SET NULL")
    op.execute("ALTER TABLE competition_participants ADD COLUMN IF NOT EXISTS discount_amount INTEGER NOT NULL DEFAULT 0")

    op.execute("ALTER TABLE competition_payment_intents ADD COLUMN IF NOT EXISTS discount_id INTEGER REFERENCES competition_discounts(id) ON DELETE SET NULL")
    op.execute("ALTER TABLE competition_payment_intents ADD COLUMN IF NOT EXISTS discount_amount INTEGER NOT NULL DEFAULT 0")


def downgrade() -> None:
    op.execute("ALTER TABLE competition_payment_intents DROP COLUMN IF EXISTS discount_amount")
    op.execute("ALTER TABLE competition_payment_intents DROP COLUMN IF EXISTS discount_id")
    op.execute("ALTER TABLE competition_participants DROP COLUMN IF EXISTS discount_amount")
    op.execute("ALTER TABLE competition_participants DROP COLUMN IF EXISTS discount_id")
    op.execute("DROP TABLE IF EXISTS competition_discount_usages")
    op.execute("DROP TABLE IF EXISTS competition_discounts")
