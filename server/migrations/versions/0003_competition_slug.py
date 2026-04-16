"""add slug to competitions

Revision ID: 0003_competition_slug
Revises: 0002_interest_notifications
Create Date: 2026-04-16
"""
from alembic import op


revision = "0003_competition_slug"
down_revision = "0002_interest_notifications"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        ALTER TABLE competitions
        ADD COLUMN slug VARCHAR
        """
    )
    op.execute(
        """
        CREATE UNIQUE INDEX IF NOT EXISTS ix_competitions_slug ON competitions (slug)
        """
    )
    # Backfill slugs for existing competitions using pure SQL
    op.execute(
        """
        UPDATE competitions
        SET slug = (
            SELECT lower(
                trim(
                    both '-' from
                    regexp_replace(nombre, '[^a-zA-Z0-9]+', '-', 'g')
                )
            )
        )
        WHERE slug IS NULL
        """
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_competitions_slug")
    op.execute("ALTER TABLE competitions DROP COLUMN IF EXISTS slug")
