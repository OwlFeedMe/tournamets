"""add spectator ticketing orders, tickets and audit

Revision ID: 0007_spectator_ticketing_orders
Revises: 0006_spectator_ticketing_config
Create Date: 2026-04-17
"""
from alembic import op


revision = "0007_spectator_ticketing_orders"
down_revision = "0006_spectator_ticketing_config"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS spectator_ticket_orders (
            id SERIAL PRIMARY KEY,
            competition_id INTEGER NOT NULL REFERENCES competitions(id) ON DELETE CASCADE,
            buyer_full_name TEXT NOT NULL,
            buyer_email TEXT NOT NULL,
            buyer_phone TEXT NOT NULL,
            buyer_document TEXT NOT NULL,
            quantity INTEGER NOT NULL DEFAULT 1,
            unit_price_applied INTEGER NOT NULL DEFAULT 0,
            payment_provider TEXT NOT NULL DEFAULT 'bold',
            payment_reference TEXT NOT NULL,
            payment_order_id TEXT,
            payment_status TEXT NOT NULL DEFAULT 'created',
            payment_transaction_id TEXT,
            payment_base_amount INTEGER NOT NULL DEFAULT 0,
            payment_platform_fee INTEGER NOT NULL DEFAULT 0,
            payment_platform_fee_rate DOUBLE PRECISION NOT NULL DEFAULT 0.05,
            payment_processor_fee INTEGER NOT NULL DEFAULT 0,
            payment_platform_net INTEGER NOT NULL DEFAULT 0,
            payment_amount_total INTEGER NOT NULL DEFAULT 0,
            tickets_pdf_url TEXT,
            tickets_email_sent_at TIMESTAMPTZ,
            paid_at TIMESTAMPTZ,
            updated_at TIMESTAMPTZ,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            CONSTRAINT uq_spectator_ticket_order_payment_reference UNIQUE (payment_reference)
        )
        """
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_spectator_ticket_orders_competition_id "
        "ON spectator_ticket_orders(competition_id)"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_spectator_ticket_orders_email "
        "ON spectator_ticket_orders(buyer_email)"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_spectator_ticket_orders_identity "
        "ON spectator_ticket_orders(buyer_document)"
    )

    op.execute(
        """
        CREATE TABLE IF NOT EXISTS spectator_tickets (
            id SERIAL PRIMARY KEY,
            competition_id INTEGER NOT NULL REFERENCES competitions(id) ON DELETE CASCADE,
            order_id INTEGER NOT NULL REFERENCES spectator_ticket_orders(id) ON DELETE CASCADE,
            ticket_number INTEGER NOT NULL DEFAULT 1,
            ticket_uid TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'active',
            scanned_at TIMESTAMPTZ,
            scanned_station TEXT,
            scanned_device_id TEXT,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            CONSTRAINT uq_spectator_tickets_uid UNIQUE (ticket_uid),
            CONSTRAINT uq_spectator_tickets_order_number UNIQUE (order_id, ticket_number)
        )
        """
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_spectator_tickets_competition_id "
        "ON spectator_tickets(competition_id)"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_spectator_tickets_order_id "
        "ON spectator_tickets(order_id)"
    )

    op.execute(
        """
        CREATE TABLE IF NOT EXISTS spectator_ticket_checkin_audit (
            id SERIAL PRIMARY KEY,
            competition_id INTEGER NOT NULL REFERENCES competitions(id) ON DELETE CASCADE,
            ticket_id INTEGER REFERENCES spectator_tickets(id) ON DELETE SET NULL,
            order_id INTEGER REFERENCES spectator_ticket_orders(id) ON DELETE SET NULL,
            action TEXT NOT NULL DEFAULT 'scan',
            result TEXT NOT NULL DEFAULT 'invalid',
            reason TEXT,
            station TEXT,
            device_id TEXT,
            actor_app_user_id INTEGER REFERENCES app_users(id) ON DELETE SET NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
        """
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_spectator_ticket_checkin_audit_competition_id "
        "ON spectator_ticket_checkin_audit(competition_id)"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_spectator_ticket_checkin_audit_ticket_id "
        "ON spectator_ticket_checkin_audit(ticket_id)"
    )


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS spectator_ticket_checkin_audit")
    op.execute("DROP TABLE IF EXISTS spectator_tickets")
    op.execute("DROP TABLE IF EXISTS spectator_ticket_orders")
