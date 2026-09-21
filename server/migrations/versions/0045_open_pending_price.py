"""Represent unpublished qualification prices without implying free entry."""
from alembic import op

revision = "0045_open_pending_price"
down_revision = "0044_open_preregistration"
branch_labels = None
depends_on = None


def upgrade():
    op.execute("ALTER TABLE competition_open_entries ALTER COLUMN final_amount DROP NOT NULL")


def downgrade():
    # Refuse downgrade if unpublished prices exist rather than invent a price.
    op.execute("ALTER TABLE competition_open_entries ALTER COLUMN final_amount SET NOT NULL")
