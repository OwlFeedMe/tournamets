"""unify users on participants

Revision ID: 0010_unify_users_on_participants
Revises: 0009_competition_judges
Create Date: 2026-04-17
"""
from alembic import op
from sqlalchemy import text


revision = "0010_unify_users_on_participants"
down_revision = "0009_competition_judges"
branch_labels = None
depends_on = None


def _drop_fk(table_name: str, column_name: str) -> None:
    op.execute(
        f"""
        DO $$
        DECLARE item RECORD;
        BEGIN
            FOR item IN
                SELECT con.conname
                FROM pg_constraint con
                JOIN pg_class rel ON rel.oid = con.conrelid
                JOIN unnest(con.conkey) AS cols(attnum) ON TRUE
                JOIN pg_attribute attr ON attr.attrelid = rel.oid AND attr.attnum = cols.attnum
                WHERE con.contype = 'f'
                  AND rel.relname = '{table_name}'
                  AND attr.attname = '{column_name}'
            LOOP
                EXECUTE format('ALTER TABLE {table_name} DROP CONSTRAINT %I', item.conname);
            END LOOP;
        END $$;
        """
    )


def _repoint_fk(table_name: str, column_name: str, on_delete: str) -> None:
    _drop_fk(table_name, column_name)
    op.execute(
        f"""
        UPDATE {table_name} target
        SET {column_name} = source.participant_id
        FROM app_users source
        WHERE target.{column_name} = source.id
          AND source.participant_id IS NOT NULL
        """
    )
    op.execute(
        f"""
        ALTER TABLE {table_name}
        ADD CONSTRAINT fk_{table_name}_{column_name}_participants
        FOREIGN KEY ({column_name}) REFERENCES participants(id) ON DELETE {on_delete}
        """
    )


def upgrade() -> None:
    bind = op.get_bind()

    for statement in [
        "ALTER TABLE participants ADD COLUMN IF NOT EXISTS username TEXT",
        "ALTER TABLE participants ADD COLUMN IF NOT EXISTS display_name TEXT",
        "ALTER TABLE participants ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'user'",
        "ALTER TABLE participants ADD COLUMN IF NOT EXISTS password_hash TEXT",
        "ALTER TABLE participants ADD COLUMN IF NOT EXISTS organizer_enabled INTEGER NOT NULL DEFAULT 0",
        "ALTER TABLE participants ADD COLUMN IF NOT EXISTS judge_enabled INTEGER NOT NULL DEFAULT 0",
        "ALTER TABLE participants ADD COLUMN IF NOT EXISTS admin_enabled INTEGER NOT NULL DEFAULT 0",
        "ALTER TABLE participants ADD COLUMN IF NOT EXISTS is_active INTEGER NOT NULL DEFAULT 1",
    ]:
        bind.execute(text(statement))

    bind.execute(text("DROP INDEX IF EXISTS uq_participants_username"))
    bind.execute(text("CREATE UNIQUE INDEX IF NOT EXISTS uq_participants_username ON participants (username) WHERE username IS NOT NULL"))

    # Create participant rows for any legacy app_user that was not linked yet.
    bind.execute(
        text(
            """
            INSERT INTO participants (
                cedula,
                nombre,
                apellido,
                email,
                estado,
                username,
                display_name,
                role,
                password_hash,
                organizer_enabled,
                judge_enabled,
                admin_enabled,
                is_active,
                created_at
            )
            SELECT
                CONCAT('pending:legacy-user-', au.id),
                COALESCE(NULLIF(TRIM(au.display_name), ''), 'Usuario'),
                '',
                CASE
                    WHEN POSITION('@' IN COALESCE(au.username, '')) > 0 THEN LOWER(TRIM(au.username))
                    ELSE NULL
                END,
                'activo',
                NULLIF(LOWER(TRIM(au.username)), ''),
                COALESCE(NULLIF(TRIM(au.display_name), ''), NULLIF(TRIM(au.username), ''), CONCAT('Usuario ', au.id)),
                COALESCE(NULLIF(TRIM(au.role), ''), 'user'),
                au.password_hash,
                COALESCE(au.organizer_enabled, 0),
                COALESCE(au.judge_enabled, 0),
                COALESCE(au.admin_enabled, 0),
                COALESCE(au.is_active, 1),
                COALESCE(au.created_at, NOW())
            FROM app_users au
            LEFT JOIN participants p ON p.id = au.participant_id
            WHERE p.id IS NULL
            """
        )
    )

    bind.execute(
        text(
            """
            UPDATE app_users au
            SET participant_id = p.id
            FROM participants p
            WHERE (au.participant_id IS NULL OR NOT EXISTS (SELECT 1 FROM participants px WHERE px.id = au.participant_id))
              AND p.username IS NOT NULL
              AND LOWER(p.username) = LOWER(au.username)
            """
        )
    )

    bind.execute(
        text(
            """
            UPDATE participants p
            SET
                username = COALESCE(NULLIF(LOWER(TRIM(p.username)), ''), NULLIF(LOWER(TRIM(au.username)), '')),
                display_name = COALESCE(NULLIF(TRIM(p.display_name), ''), NULLIF(TRIM(au.display_name), ''), TRIM(CONCAT(COALESCE(p.nombre, ''), ' ', COALESCE(p.apellido, '')))),
                role = COALESCE(NULLIF(TRIM(au.role), ''), COALESCE(NULLIF(TRIM(p.role), ''), 'user')),
                password_hash = COALESCE(NULLIF(au.password_hash, ''), p.password_hash),
                organizer_enabled = GREATEST(COALESCE(p.organizer_enabled, 0), COALESCE(au.organizer_enabled, 0)),
                judge_enabled = GREATEST(COALESCE(p.judge_enabled, 0), COALESCE(au.judge_enabled, 0)),
                admin_enabled = GREATEST(COALESCE(p.admin_enabled, 0), COALESCE(au.admin_enabled, 0)),
                is_active = CASE WHEN COALESCE(au.is_active, 1) = 1 THEN 1 ELSE COALESCE(p.is_active, 1) END
            FROM app_users au
            WHERE au.participant_id = p.id
            """
        )
    )

    bind.execute(
        text(
            """
            UPDATE participants
            SET
                display_name = COALESCE(NULLIF(TRIM(display_name), ''), NULLIF(TRIM(CONCAT(COALESCE(nombre, ''), ' ', COALESCE(apellido, ''))), ''), cedula),
                role = COALESCE(NULLIF(TRIM(role), ''), 'user'),
                is_active = COALESCE(is_active, 1),
                organizer_enabled = COALESCE(organizer_enabled, 0),
                judge_enabled = COALESCE(judge_enabled, 0),
                admin_enabled = COALESCE(admin_enabled, 0)
            """
        )
    )

    _repoint_fk("organizer_applications", "app_user_id", "CASCADE")
    _repoint_fk("organizer_applications", "reviewed_by_user_id", "SET NULL")
    _repoint_fk("competitions", "organizer_user_id", "SET NULL")
    _repoint_fk("competition_judge_assignments", "app_user_id", "SET NULL")
    _repoint_fk("competition_judge_assignments", "invited_by_app_user_id", "RESTRICT")
    _repoint_fk("competition_judge_action_audit", "actor_app_user_id", "SET NULL")
    _repoint_fk("competition_qr_identities", "created_by_app_user_id", "SET NULL")
    _repoint_fk("competition_qr_identities", "revoked_by_app_user_id", "SET NULL")
    _repoint_fk("competition_checkin_usages", "used_by_app_user_id", "SET NULL")
    _repoint_fk("competition_checkin_audit", "actor_app_user_id", "SET NULL")
    _repoint_fk("spectator_ticket_checkin_audit", "actor_app_user_id", "SET NULL")
    _repoint_fk("competition_withdrawal_requests", "requested_by_user_id", "RESTRICT")
    _repoint_fk("competition_withdrawal_requests", "reviewed_by_user_id", "SET NULL")

    bind.execute(text("DROP TABLE IF EXISTS app_users"))


def downgrade() -> None:
    pass
