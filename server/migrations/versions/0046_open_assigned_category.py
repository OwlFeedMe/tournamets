"""Keep Open entrants uncategorized until organizer review."""
from alembic import op

revision = "0046_open_assigned_category"
down_revision = "0045_open_pending_price"
branch_labels = None
depends_on = None


def upgrade():
    op.execute("ALTER TABLE competition_open_entries ALTER COLUMN categoria DROP NOT NULL")
    op.execute("ALTER TABLE competition_open_entries ADD COLUMN division VARCHAR")


def downgrade():
    op.execute("ALTER TABLE competition_open_entries ALTER COLUMN categoria SET NOT NULL")
    op.execute("ALTER TABLE competition_open_entries DROP COLUMN division")
