"""Track delivery of requested Open opening notices."""
from alembic import op

revision = "0043_open_interest_delivery"
down_revision = "0042_open_qualifier"
branch_labels = None
depends_on = None


def upgrade():
    op.execute("ALTER TABLE competition_interest_notifications ADD COLUMN IF NOT EXISTS sent_at TIMESTAMPTZ")


def downgrade():
    op.execute("ALTER TABLE competition_interest_notifications DROP COLUMN sent_at")
