"""add ticket products by days support

Revision ID: 0008_ticket_products_days
Revises: 0007_spectator_ticketing_orders
Create Date: 2026-04-17
"""
from alembic import op


revision = "0008_ticket_products_days"
down_revision = "0007_spectator_ticketing_orders"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        "ALTER TABLE competition_spectator_ticketing_config "
        "ADD COLUMN IF NOT EXISTS ticket_products TEXT"
    )
    op.execute(
        "ALTER TABLE spectator_ticket_orders "
        "ADD COLUMN IF NOT EXISTS product_id TEXT"
    )
    op.execute(
        "ALTER TABLE spectator_ticket_orders "
        "ADD COLUMN IF NOT EXISTS product_label TEXT"
    )
    op.execute(
        "ALTER TABLE spectator_ticket_orders "
        "ADD COLUMN IF NOT EXISTS access_days TEXT"
    )


def downgrade() -> None:
    op.execute(
        "ALTER TABLE spectator_ticket_orders "
        "DROP COLUMN IF EXISTS access_days"
    )
    op.execute(
        "ALTER TABLE spectator_ticket_orders "
        "DROP COLUMN IF EXISTS product_label"
    )
    op.execute(
        "ALTER TABLE spectator_ticket_orders "
        "DROP COLUMN IF EXISTS product_id"
    )
    op.execute(
        "ALTER TABLE competition_spectator_ticketing_config "
        "DROP COLUMN IF EXISTS ticket_products"
    )
