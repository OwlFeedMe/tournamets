"""add competition scoring configuration

Revision ID: 0032_scoring_configuration
Revises: 0031_public_athlete_profiles
Create Date: 2026-07-04
"""

from alembic import op


revision = "0032_scoring_configuration"
down_revision = "0031_public_athlete_profiles"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE competitions ADD COLUMN IF NOT EXISTS scoring_system TEXT NOT NULL DEFAULT 'dynamic_points'")
    op.execute("ALTER TABLE competitions ADD COLUMN IF NOT EXISTS scoring_scope TEXT NOT NULL DEFAULT 'category'")
    op.execute("ALTER TABLE competitions ADD COLUMN IF NOT EXISTS scoring_table TEXT")
    op.execute("ALTER TABLE competitions ADD COLUMN IF NOT EXISTS scoring_tiebreak TEXT NOT NULL DEFAULT 'best_positions'")
    op.execute("ALTER TABLE competitions ADD COLUMN IF NOT EXISTS cumulative_direction TEXT NOT NULL DEFAULT 'higher_wins'")
    op.execute("ALTER TABLE competition_phases ADD COLUMN IF NOT EXISTS scoring_override_enabled INTEGER NOT NULL DEFAULT 0")
    op.execute("ALTER TABLE competition_phases ADD COLUMN IF NOT EXISTS scoring_system TEXT")
    op.execute("ALTER TABLE competition_phases ADD COLUMN IF NOT EXISTS scoring_weight_percent INTEGER NOT NULL DEFAULT 100")
    op.execute("ALTER TABLE competition_phases ADD COLUMN IF NOT EXISTS scoring_table TEXT")
    op.execute("""
        UPDATE competitions
        SET scoring_system = 'placement'
        WHERE scoring_mode = 'lowest_wins'
          AND (scoring_system IS NULL OR TRIM(scoring_system) = '' OR scoring_system = 'dynamic_points')
    """)


def downgrade() -> None:
    op.execute("ALTER TABLE competition_phases DROP COLUMN IF EXISTS scoring_table")
    op.execute("ALTER TABLE competition_phases DROP COLUMN IF EXISTS scoring_weight_percent")
    op.execute("ALTER TABLE competition_phases DROP COLUMN IF EXISTS scoring_system")
    op.execute("ALTER TABLE competition_phases DROP COLUMN IF EXISTS scoring_override_enabled")
    op.execute("ALTER TABLE competitions DROP COLUMN IF EXISTS cumulative_direction")
    op.execute("ALTER TABLE competitions DROP COLUMN IF EXISTS scoring_tiebreak")
    op.execute("ALTER TABLE competitions DROP COLUMN IF EXISTS scoring_table")
    op.execute("ALTER TABLE competitions DROP COLUMN IF EXISTS scoring_scope")
    op.execute("ALTER TABLE competitions DROP COLUMN IF EXISTS scoring_system")
