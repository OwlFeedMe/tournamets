"""rename legacy app_user columns to user columns

Revision ID: 0011_rename_app_user_columns
Revises: 0010_unify_users_on_participants
Create Date: 2026-04-17
"""
from alembic import op


revision = "0011_rename_app_user_columns"
down_revision = "0010_unify_users_on_participants"
branch_labels = None
depends_on = None


def upgrade() -> None:
    statements = [
        "ALTER TABLE organizer_applications RENAME COLUMN app_user_id TO user_id",
        "ALTER TABLE competition_judge_assignments RENAME COLUMN app_user_id TO user_id",
        "ALTER TABLE competition_judge_assignments RENAME COLUMN invited_by_app_user_id TO invited_by_user_id",
        "ALTER TABLE competition_judge_action_audit RENAME COLUMN actor_app_user_id TO actor_user_id",
        "ALTER TABLE spectator_ticket_checkin_audit RENAME COLUMN actor_app_user_id TO actor_user_id",
        "ALTER TABLE competition_qr_identities RENAME COLUMN created_by_app_user_id TO created_by_user_id",
        "ALTER TABLE competition_qr_identities RENAME COLUMN revoked_by_app_user_id TO revoked_by_user_id",
        "ALTER TABLE competition_checkin_usages RENAME COLUMN used_by_app_user_id TO used_by_user_id",
        "ALTER TABLE competition_checkin_audit RENAME COLUMN actor_app_user_id TO actor_user_id",
    ]
    for statement in statements:
        try:
            op.execute(statement)
        except Exception:
            pass

    index_statements = [
        "DROP INDEX IF EXISTS uq_comp_judge_assignment_user",
        "CREATE UNIQUE INDEX IF NOT EXISTS uq_comp_judge_assignment_user ON competition_judge_assignments (competition_id, user_id) WHERE user_id IS NOT NULL",
        "DROP INDEX IF EXISTS ix_comp_judge_audit_actor",
        "CREATE INDEX IF NOT EXISTS ix_comp_judge_audit_actor ON competition_judge_action_audit (actor_user_id)",
    ]
    for statement in index_statements:
        op.execute(statement)


def downgrade() -> None:
    statements = [
        "ALTER TABLE organizer_applications RENAME COLUMN user_id TO app_user_id",
        "ALTER TABLE competition_judge_assignments RENAME COLUMN user_id TO app_user_id",
        "ALTER TABLE competition_judge_assignments RENAME COLUMN invited_by_user_id TO invited_by_app_user_id",
        "ALTER TABLE competition_judge_action_audit RENAME COLUMN actor_user_id TO actor_app_user_id",
        "ALTER TABLE spectator_ticket_checkin_audit RENAME COLUMN actor_user_id TO actor_app_user_id",
        "ALTER TABLE competition_qr_identities RENAME COLUMN created_by_user_id TO created_by_app_user_id",
        "ALTER TABLE competition_qr_identities RENAME COLUMN revoked_by_user_id TO revoked_by_app_user_id",
        "ALTER TABLE competition_checkin_usages RENAME COLUMN used_by_user_id TO used_by_app_user_id",
        "ALTER TABLE competition_checkin_audit RENAME COLUMN actor_user_id TO actor_app_user_id",
    ]
    for statement in statements:
        try:
            op.execute(statement)
        except Exception:
            pass

    index_statements = [
        "DROP INDEX IF EXISTS uq_comp_judge_assignment_user",
        "CREATE UNIQUE INDEX IF NOT EXISTS uq_comp_judge_assignment_user ON competition_judge_assignments (competition_id, app_user_id) WHERE app_user_id IS NOT NULL",
        "DROP INDEX IF EXISTS ix_comp_judge_audit_actor",
        "CREATE INDEX IF NOT EXISTS ix_comp_judge_audit_actor ON competition_judge_action_audit (actor_app_user_id)",
    ]
    for statement in index_statements:
        op.execute(statement)
