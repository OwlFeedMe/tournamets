"""add robust checkin qr schema

Revision ID: 0004_checkin_qr
Revises: 0003_competition_slug
Create Date: 2026-04-16
"""
from alembic import op


revision = "0004_checkin_qr"
down_revision = "0003_competition_slug"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS competition_qr_identities (
            id SERIAL PRIMARY KEY,
            qr_uid TEXT NOT NULL UNIQUE,
            competition_id INTEGER NOT NULL REFERENCES competitions(id) ON DELETE CASCADE,
            participant_id INTEGER NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
            version INTEGER NOT NULL DEFAULT 1,
            status TEXT NOT NULL DEFAULT 'active',
            issued_at TIMESTAMPTZ DEFAULT NOW(),
            last_reissued_at TIMESTAMPTZ,
            revoked_at TIMESTAMPTZ,
            revoked_reason TEXT,
            created_by_app_user_id INTEGER REFERENCES app_users(id) ON DELETE SET NULL,
            revoked_by_app_user_id INTEGER REFERENCES app_users(id) ON DELETE SET NULL,
            updated_at TIMESTAMPTZ DEFAULT NOW(),
            CONSTRAINT uq_comp_qr_identity_enrollment UNIQUE (competition_id, participant_id)
        )
        """
    )
    op.execute("CREATE INDEX IF NOT EXISTS ix_comp_qr_identity_competition ON competition_qr_identities(competition_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_comp_qr_identity_participant ON competition_qr_identities(participant_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_competition_qr_identities_status ON competition_qr_identities(status)")

    op.execute(
        """
        CREATE TABLE IF NOT EXISTS competition_checkin_phases (
            id SERIAL PRIMARY KEY,
            competition_id INTEGER NOT NULL REFERENCES competitions(id) ON DELETE CASCADE,
            code TEXT NOT NULL,
            label TEXT NOT NULL,
            description TEXT,
            order_index INTEGER NOT NULL DEFAULT 0,
            enabled INTEGER NOT NULL DEFAULT 1,
            max_uses INTEGER NOT NULL DEFAULT 1,
            is_system INTEGER NOT NULL DEFAULT 0,
            created_at TIMESTAMPTZ DEFAULT NOW(),
            updated_at TIMESTAMPTZ DEFAULT NOW(),
            CONSTRAINT uq_comp_checkin_phase_code UNIQUE (competition_id, code)
        )
        """
    )
    op.execute("CREATE INDEX IF NOT EXISTS ix_comp_checkin_phase_competition ON competition_checkin_phases(competition_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_competition_checkin_phases_code ON competition_checkin_phases(code)")

    op.execute(
        """
        CREATE TABLE IF NOT EXISTS competition_checkin_usages (
            id SERIAL PRIMARY KEY,
            competition_id INTEGER NOT NULL REFERENCES competitions(id) ON DELETE CASCADE,
            participant_id INTEGER NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
            qr_identity_id INTEGER NOT NULL REFERENCES competition_qr_identities(id) ON DELETE CASCADE,
            phase_id INTEGER NOT NULL REFERENCES competition_checkin_phases(id) ON DELETE CASCADE,
            use_number INTEGER NOT NULL DEFAULT 1,
            idempotency_key TEXT,
            station TEXT,
            device_id TEXT,
            used_by_app_user_id INTEGER REFERENCES app_users(id) ON DELETE SET NULL,
            used_at TIMESTAMPTZ DEFAULT NOW(),
            CONSTRAINT uq_comp_checkin_usage_slot UNIQUE (qr_identity_id, phase_id, use_number)
        )
        """
    )
    op.execute("CREATE INDEX IF NOT EXISTS ix_comp_checkin_usage_competition ON competition_checkin_usages(competition_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_comp_checkin_usage_phase ON competition_checkin_usages(phase_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_comp_checkin_usage_participant ON competition_checkin_usages(participant_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_competition_checkin_usages_idempotency_key ON competition_checkin_usages(idempotency_key)")

    op.execute(
        """
        CREATE TABLE IF NOT EXISTS competition_checkin_audit (
            id SERIAL PRIMARY KEY,
            competition_id INTEGER NOT NULL REFERENCES competitions(id) ON DELETE CASCADE,
            participant_id INTEGER REFERENCES participants(id) ON DELETE SET NULL,
            qr_identity_id INTEGER REFERENCES competition_qr_identities(id) ON DELETE SET NULL,
            phase_id INTEGER REFERENCES competition_checkin_phases(id) ON DELETE SET NULL,
            action TEXT NOT NULL DEFAULT 'scan',
            result TEXT NOT NULL DEFAULT 'accepted',
            reason TEXT,
            token_fingerprint TEXT,
            station TEXT,
            device_id TEXT,
            idempotency_key TEXT,
            actor_app_user_id INTEGER REFERENCES app_users(id) ON DELETE SET NULL,
            meta_json TEXT,
            created_at TIMESTAMPTZ DEFAULT NOW()
        )
        """
    )
    op.execute("CREATE INDEX IF NOT EXISTS ix_comp_checkin_audit_competition ON competition_checkin_audit(competition_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_comp_checkin_audit_phase ON competition_checkin_audit(phase_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_comp_checkin_audit_result ON competition_checkin_audit(result)")

    op.execute(
        """
        INSERT INTO competition_checkin_phases (competition_id, code, label, description, order_index, enabled, max_uses, is_system)
        SELECT c.id, 'check_in', 'Check-in', 'Ingreso oficial al evento', 0, 1, 1, 1
        FROM competitions c
        WHERE NOT EXISTS (
            SELECT 1
            FROM competition_checkin_phases p
            WHERE p.competition_id = c.id AND p.code = 'check_in'
        )
        """
    )


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS competition_checkin_audit")
    op.execute("DROP TABLE IF EXISTS competition_checkin_usages")
    op.execute("DROP TABLE IF EXISTS competition_checkin_phases")
    op.execute("DROP TABLE IF EXISTS competition_qr_identities")
