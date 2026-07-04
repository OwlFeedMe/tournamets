"""add result appeals

Revision ID: 0027_result_appeals
Revises: 0026_competition_timezone
Create Date: 2026-06-28
"""
from alembic import op


revision = "0027_result_appeals"
down_revision = "0026_competition_timezone"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE results ADD COLUMN IF NOT EXISTS result_status VARCHAR NOT NULL DEFAULT 'valid'")
    op.execute("ALTER TABLE results ADD COLUMN IF NOT EXISTS appeal_deadline_at TIMESTAMP WITH TIME ZONE")
    op.execute("""
        UPDATE results
        SET appeal_deadline_at = COALESCE(appeal_deadline_at, created_at + INTERVAL '90 minutes')
        WHERE created_at IS NOT NULL
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_results_result_status ON results (result_status)")

    op.execute("""
        CREATE TABLE IF NOT EXISTS result_appeals (
            id SERIAL PRIMARY KEY,
            result_id INTEGER NOT NULL REFERENCES results(id) ON DELETE CASCADE,
            competition_id INTEGER NOT NULL REFERENCES competitions(id) ON DELETE CASCADE,
            phase_id INTEGER REFERENCES competition_phases(id) ON DELETE SET NULL,
            user_id INTEGER NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
            status VARCHAR NOT NULL DEFAULT 'submitted',
            reason_type VARCHAR NOT NULL DEFAULT 'score_review',
            description VARCHAR NOT NULL,
            evidence_url VARCHAR,
            user_requested_score VARCHAR,
            assigned_judge_id INTEGER REFERENCES participants(id) ON DELETE SET NULL,
            original_marca INTEGER,
            original_tiebreak INTEGER,
            original_puntos INTEGER,
            original_posicion INTEGER,
            final_marca INTEGER,
            final_tiebreak INTEGER,
            final_puntos INTEGER,
            final_posicion INTEGER,
            resolution_type VARCHAR,
            resolution_note VARCHAR,
            submitted_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
            resolved_at TIMESTAMP WITH TIME ZONE,
            resolved_by_user_id INTEGER REFERENCES participants(id) ON DELETE SET NULL,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_result_appeals_result ON result_appeals (result_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_result_appeals_competition ON result_appeals (competition_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_result_appeals_status ON result_appeals (status)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_result_appeals_user ON result_appeals (user_id)")

    op.execute("""
        CREATE TABLE IF NOT EXISTS result_appeal_messages (
            id SERIAL PRIMARY KEY,
            appeal_id INTEGER NOT NULL REFERENCES result_appeals(id) ON DELETE CASCADE,
            author_user_id INTEGER REFERENCES participants(id) ON DELETE SET NULL,
            author_role VARCHAR NOT NULL DEFAULT 'athlete',
            message VARCHAR NOT NULL,
            evidence_url VARCHAR,
            is_internal_note INTEGER NOT NULL DEFAULT 0,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_result_appeal_messages_appeal ON result_appeal_messages (appeal_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_result_appeal_messages_author ON result_appeal_messages (author_user_id)")

    op.execute("""
        CREATE TABLE IF NOT EXISTS result_score_audit_logs (
            id SERIAL PRIMARY KEY,
            result_id INTEGER NOT NULL REFERENCES results(id) ON DELETE CASCADE,
            appeal_id INTEGER REFERENCES result_appeals(id) ON DELETE SET NULL,
            previous_marca INTEGER,
            previous_tiebreak INTEGER,
            previous_puntos INTEGER,
            previous_posicion INTEGER,
            new_marca INTEGER,
            new_tiebreak INTEGER,
            new_puntos INTEGER,
            new_posicion INTEGER,
            changed_by_user_id INTEGER REFERENCES participants(id) ON DELETE SET NULL,
            reason VARCHAR NOT NULL,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_result_score_audit_result ON result_score_audit_logs (result_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_result_score_audit_appeal ON result_score_audit_logs (appeal_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_result_score_audit_actor ON result_score_audit_logs (changed_by_user_id)")


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS result_score_audit_logs")
    op.execute("DROP TABLE IF EXISTS result_appeal_messages")
    op.execute("DROP TABLE IF EXISTS result_appeals")
    op.execute("DROP INDEX IF EXISTS ix_results_result_status")
    op.execute("ALTER TABLE results DROP COLUMN IF EXISTS appeal_deadline_at")
    op.execute("ALTER TABLE results DROP COLUMN IF EXISTS result_status")
