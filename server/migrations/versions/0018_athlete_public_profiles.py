"""add athlete public profile fields

Revision ID: 0018_athlete_public_profiles
Revises: 0017_gym_reports
Create Date: 2026-04-27
"""
from alembic import op


revision = "0018_athlete_public_profiles"
down_revision = "0017_gym_reports"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        ALTER TABLE participants
        ADD COLUMN IF NOT EXISTS public_profile_enabled INTEGER NOT NULL DEFAULT 0
    """)
    op.execute("""
        ALTER TABLE participants
        ADD COLUMN IF NOT EXISTS public_profile_indexable INTEGER NOT NULL DEFAULT 1
    """)
    op.execute("""
        ALTER TABLE participants
        ADD COLUMN IF NOT EXISTS public_profile_visibility VARCHAR NOT NULL DEFAULT 'private'
    """)
    op.execute("""
        ALTER TABLE participants
        ADD COLUMN IF NOT EXISTS public_bio TEXT
    """)
    op.execute("""
        ALTER TABLE participants
        ADD COLUMN IF NOT EXISTS public_cover_url VARCHAR
    """)
    op.execute("""
        ALTER TABLE participants
        ADD COLUMN IF NOT EXISTS public_show_city INTEGER NOT NULL DEFAULT 1
    """)
    op.execute("""
        ALTER TABLE participants
        ADD COLUMN IF NOT EXISTS public_show_gym INTEGER NOT NULL DEFAULT 1
    """)
    op.execute("""
        ALTER TABLE participants
        ADD COLUMN IF NOT EXISTS public_show_age INTEGER NOT NULL DEFAULT 0
    """)
    op.execute("""
        ALTER TABLE participants
        ADD COLUMN IF NOT EXISTS public_show_results INTEGER NOT NULL DEFAULT 1
    """)
    op.execute("""
        ALTER TABLE participants
        ADD COLUMN IF NOT EXISTS verified_athlete INTEGER NOT NULL DEFAULT 0
    """)
    op.execute("""
        CREATE TABLE IF NOT EXISTS athlete_username_aliases (
            id SERIAL PRIMARY KEY,
            user_id INTEGER NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
            alias VARCHAR NOT NULL,
            created_at TIMESTAMPTZ DEFAULT NOW()
        )
    """)
    op.execute("""
        CREATE INDEX IF NOT EXISTS ix_athlete_username_aliases_user_id
        ON athlete_username_aliases (user_id)
    """)
    op.execute("""
        CREATE UNIQUE INDEX IF NOT EXISTS ix_participants_username_lower
        ON participants (LOWER(username))
        WHERE username IS NOT NULL
    """)
    op.execute("""
        CREATE UNIQUE INDEX IF NOT EXISTS ix_athlete_username_aliases_alias_lower
        ON athlete_username_aliases (LOWER(alias))
    """)
    op.execute("""
        UPDATE participants
        SET display_name = TRIM(CONCAT(COALESCE(nombre, ''), ' ', COALESCE(apellido, '')))
        WHERE COALESCE(display_name, '') = ''
    """)
    op.execute("""
        UPDATE participants
        SET username = CONCAT('athlete.', id)
        WHERE username IS NULL OR TRIM(username) = ''
    """)


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_athlete_username_aliases_alias_lower")
    op.execute("DROP INDEX IF EXISTS ix_participants_username_lower")
    op.execute("DROP INDEX IF EXISTS ix_athlete_username_aliases_user_id")
    op.execute("DROP TABLE IF EXISTS athlete_username_aliases")
    op.execute("ALTER TABLE participants DROP COLUMN IF EXISTS verified_athlete")
    op.execute("ALTER TABLE participants DROP COLUMN IF EXISTS public_show_results")
    op.execute("ALTER TABLE participants DROP COLUMN IF EXISTS public_show_age")
    op.execute("ALTER TABLE participants DROP COLUMN IF EXISTS public_show_gym")
    op.execute("ALTER TABLE participants DROP COLUMN IF EXISTS public_show_city")
    op.execute("ALTER TABLE participants DROP COLUMN IF EXISTS public_cover_url")
    op.execute("ALTER TABLE participants DROP COLUMN IF EXISTS public_bio")
    op.execute("ALTER TABLE participants DROP COLUMN IF EXISTS public_profile_visibility")
    op.execute("ALTER TABLE participants DROP COLUMN IF EXISTS public_profile_indexable")
    op.execute("ALTER TABLE participants DROP COLUMN IF EXISTS public_profile_enabled")
