"""Persist unpaid Open registrations without recording a payment."""
from alembic import op

revision = "0044_open_preregistration"
down_revision = "0043_open_interest_delivery"
branch_labels = None
depends_on = None


def upgrade():
    op.execute("ALTER TABLE competition_open_entries ADD COLUMN registered_at TIMESTAMPTZ")
    op.execute("UPDATE competition_open_entries SET registered_at = paid_at")
    op.execute("ALTER TABLE competition_open_entries ALTER COLUMN registered_at SET DEFAULT NOW()")
    op.execute("ALTER TABLE competition_open_entries ALTER COLUMN registered_at SET NOT NULL")
    op.execute("ALTER TABLE competition_open_entries ALTER COLUMN paid_at DROP NOT NULL")
    op.execute("ALTER TABLE competition_open_entries ALTER COLUMN paid_at DROP DEFAULT")


def downgrade():
    # Unpaid registrations cannot be represented by the previous schema.
    op.execute("DELETE FROM competition_open_entries WHERE status = 'preregistered'")
    op.execute("ALTER TABLE competition_open_entries ALTER COLUMN paid_at SET NOT NULL")
    op.execute("ALTER TABLE competition_open_entries ALTER COLUMN paid_at SET DEFAULT NOW()")
    op.execute("ALTER TABLE competition_open_entries DROP COLUMN registered_at")
