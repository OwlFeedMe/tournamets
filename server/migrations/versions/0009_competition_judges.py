"""add competition judge assignments and audit

Revision ID: 0009_competition_judges
Revises: 0008_ticket_products_days
Create Date: 2026-04-17
"""
from alembic import op


revision = "0009_competition_judges"
down_revision = "0008_ticket_products_days"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS competition_judge_assignments (
            id SERIAL PRIMARY KEY,
            competition_id INTEGER NOT NULL REFERENCES competitions(id) ON DELETE CASCADE,
            app_user_id INTEGER REFERENCES app_users(id) ON DELETE SET NULL,
            invited_email TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'pending',
            invited_by_app_user_id INTEGER NOT NULL REFERENCES app_users(id) ON DELETE RESTRICT,
            accepted_at TIMESTAMPTZ NULL,
            rejected_at TIMESTAMPTZ NULL,
            revoked_at TIMESTAMPTZ NULL,
            created_at TIMESTAMPTZ NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NULL DEFAULT NOW()
        )
        """
    )
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS competition_judge_action_audit (
            id SERIAL PRIMARY KEY,
            competition_id INTEGER NOT NULL REFERENCES competitions(id) ON DELETE CASCADE,
            judge_assignment_id INTEGER REFERENCES competition_judge_assignments(id) ON DELETE SET NULL,
            actor_app_user_id INTEGER REFERENCES app_users(id) ON DELETE SET NULL,
            action TEXT NOT NULL DEFAULT 'unknown',
            target_type TEXT NULL,
            target_id TEXT NULL,
            result TEXT NOT NULL DEFAULT 'accepted',
            meta_json TEXT NULL,
            created_at TIMESTAMPTZ NULL DEFAULT NOW()
        )
        """
    )
    op.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS uq_comp_judge_assignment_user "
        "ON competition_judge_assignments (competition_id, app_user_id) "
        "WHERE app_user_id IS NOT NULL"
    )
    op.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS uq_comp_judge_assignment_email "
        "ON competition_judge_assignments (competition_id, invited_email)"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_comp_judge_assignment_competition "
        "ON competition_judge_assignments (competition_id)"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_comp_judge_assignment_status "
        "ON competition_judge_assignments (status)"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_comp_judge_audit_competition "
        "ON competition_judge_action_audit (competition_id)"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_comp_judge_audit_assignment "
        "ON competition_judge_action_audit (judge_assignment_id)"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_comp_judge_audit_actor "
        "ON competition_judge_action_audit (actor_app_user_id)"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_comp_judge_audit_action "
        "ON competition_judge_action_audit (action)"
    )


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS competition_judge_action_audit")
    op.execute("DROP TABLE IF EXISTS competition_judge_assignments")
