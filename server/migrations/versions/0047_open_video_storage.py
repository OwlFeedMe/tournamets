"""Store uploaded Open video separately from the external link."""
from alembic import op
import sqlalchemy as sa

revision = '0047_open_video_storage'
down_revision = '0046_open_assigned_category'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('competition_open_entries', sa.Column('video_object_key', sa.String(), nullable=True))


def downgrade():
    op.drop_column('competition_open_entries', 'video_object_key')
