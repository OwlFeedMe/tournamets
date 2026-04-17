"""rename legacy participant_id columns to user_id

Revision ID: 0012_rename_participant_columns
Revises: 0011_rename_app_user_columns
Create Date: 2026-04-17
"""
from alembic import op


revision = "0012_rename_participant_columns"
down_revision = "0011_rename_app_user_columns"
branch_labels = None
depends_on = None


def _drop_constraint_if_exists(table_name: str, constraint_name: str) -> None:
    op.execute(f"ALTER TABLE {table_name} DROP CONSTRAINT IF EXISTS {constraint_name}")


def _drop_index_if_exists(index_name: str) -> None:
    op.execute(f"DROP INDEX IF EXISTS {index_name}")


def upgrade() -> None:
    rename_statements = [
        "ALTER TABLE competition_interest_notifications RENAME COLUMN participant_id TO user_id",
        "ALTER TABLE team_members RENAME COLUMN participant_id TO user_id",
        "ALTER TABLE competition_heat_assignments RENAME COLUMN participant_id TO user_id",
        "ALTER TABLE competition_participants RENAME COLUMN participant_id TO user_id",
        "ALTER TABLE competition_payment_intents RENAME COLUMN participant_id TO user_id",
        "ALTER TABLE competition_qr_identities RENAME COLUMN participant_id TO user_id",
        "ALTER TABLE competition_checkin_usages RENAME COLUMN participant_id TO user_id",
        "ALTER TABLE competition_checkin_audit RENAME COLUMN participant_id TO user_id",
        "ALTER TABLE results RENAME COLUMN participant_id TO user_id",
    ]
    for statement in rename_statements:
        try:
            op.execute(statement)
        except Exception:
            pass

    _drop_constraint_if_exists("competition_interest_notifications", "uq_comp_interest_participant")
    _drop_index_if_exists("uq_comp_interest_participant")
    index_statements = [
        "CREATE UNIQUE INDEX IF NOT EXISTS uq_comp_interest_user ON competition_interest_notifications (competition_id, notification_type, user_id) WHERE user_id IS NOT NULL",
        "DROP INDEX IF EXISTS ix_comp_qr_identity_participant",
        "CREATE INDEX IF NOT EXISTS ix_comp_qr_identity_user ON competition_qr_identities (user_id)",
        "DROP INDEX IF EXISTS ix_comp_checkin_usage_participant",
        "CREATE INDEX IF NOT EXISTS ix_comp_checkin_usage_user ON competition_checkin_usages (user_id)",
        "DROP INDEX IF EXISTS ix_results_comp_participant",
        "CREATE INDEX IF NOT EXISTS ix_results_comp_user ON results (competition_id, user_id)",
    ]
    for statement in index_statements:
        op.execute(statement)


def downgrade() -> None:
    _drop_constraint_if_exists("competition_interest_notifications", "uq_comp_interest_user")
    _drop_index_if_exists("uq_comp_interest_user")
    index_statements = [
        "CREATE UNIQUE INDEX IF NOT EXISTS uq_comp_interest_participant ON competition_interest_notifications (competition_id, notification_type, participant_id) WHERE participant_id IS NOT NULL",
        "DROP INDEX IF EXISTS ix_comp_qr_identity_user",
        "CREATE INDEX IF NOT EXISTS ix_comp_qr_identity_participant ON competition_qr_identities (participant_id)",
        "DROP INDEX IF EXISTS ix_comp_checkin_usage_user",
        "CREATE INDEX IF NOT EXISTS ix_comp_checkin_usage_participant ON competition_checkin_usages (participant_id)",
        "DROP INDEX IF EXISTS ix_results_comp_user",
        "CREATE INDEX IF NOT EXISTS ix_results_comp_participant ON results (competition_id, participant_id)",
    ]
    for statement in index_statements:
        try:
            op.execute(statement)
        except Exception:
            pass

    rename_statements = [
        "ALTER TABLE competition_interest_notifications RENAME COLUMN user_id TO participant_id",
        "ALTER TABLE team_members RENAME COLUMN user_id TO participant_id",
        "ALTER TABLE competition_heat_assignments RENAME COLUMN user_id TO participant_id",
        "ALTER TABLE competition_participants RENAME COLUMN user_id TO participant_id",
        "ALTER TABLE competition_payment_intents RENAME COLUMN user_id TO participant_id",
        "ALTER TABLE competition_qr_identities RENAME COLUMN user_id TO participant_id",
        "ALTER TABLE competition_checkin_usages RENAME COLUMN user_id TO participant_id",
        "ALTER TABLE competition_checkin_audit RENAME COLUMN user_id TO participant_id",
        "ALTER TABLE results RENAME COLUMN user_id TO participant_id",
    ]
    for statement in rename_statements:
        try:
            op.execute(statement)
        except Exception:
            pass
