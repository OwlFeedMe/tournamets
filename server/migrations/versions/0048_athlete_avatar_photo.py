"""Private photo supplied by a qualified athlete for their competition avatar."""
from alembic import op
import sqlalchemy as sa

revision = '0048_athlete_avatar_photo'
down_revision = '0047_open_video_storage'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('competition_open_entries', sa.Column('avatar_photo_object_key', sa.String(), nullable=True))
    op.add_column('competition_open_entries', sa.Column('avatar_photo_uploaded_at', sa.DateTime(timezone=True), nullable=True))


def downgrade():
    op.drop_column('competition_open_entries', 'avatar_photo_uploaded_at')
    op.drop_column('competition_open_entries', 'avatar_photo_object_key')
