"""make athlete profiles public

Revision ID: 0031_public_athlete_profiles
Revises: 0030_competition_announcers
Create Date: 2026-07-02
"""

from alembic import op


revision = "0031_public_athlete_profiles"
down_revision = "0030_competition_announcers"
branch_labels = None
depends_on = None


def upgrade():
    op.execute("""
        UPDATE participants
        SET
            public_profile_enabled = 1,
            public_profile_visibility = 'public',
            public_profile_indexable = COALESCE(public_profile_indexable, 1),
            display_name = NULLIF(TRIM(COALESCE(display_name, '')), '')
        WHERE public_profile_enabled IS DISTINCT FROM 1
           OR public_profile_visibility IS DISTINCT FROM 'public'
           OR public_profile_indexable IS NULL
    """)
    op.execute("""
        UPDATE participants
        SET display_name = NULLIF(TRIM(CONCAT(COALESCE(nombre, ''), ' ', COALESCE(apellido, ''))), '')
        WHERE display_name IS NULL OR TRIM(display_name) = ''
    """)
    op.execute("""
        UPDATE participants
        SET username = CONCAT('athlete.', id)
        WHERE username IS NULL OR TRIM(username) = ''
    """)


def downgrade():
    pass
