"""add gyms domain tables

Revision ID: 0016_gyms
Revises: 0015_competitor_invitations
Create Date: 2026-04-27
"""
from alembic import op


revision = "0016_gyms"
down_revision = "0015_competitor_invitations"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE IF NOT EXISTS gyms (
            id SERIAL PRIMARY KEY,
            slug VARCHAR NOT NULL UNIQUE,
            display_name VARCHAR NOT NULL,
            legal_name VARCHAR,
            short_description TEXT,
            full_description TEXT,
            status VARCHAR NOT NULL DEFAULT 'pending_review',
            ownership_status VARCHAR NOT NULL DEFAULT 'unclaimed',
            plan_tier VARCHAR NOT NULL DEFAULT 'free',
            verification_badge INTEGER NOT NULL DEFAULT 0,
            founded_year INTEGER,
            logo_url VARCHAR,
            cover_image_url VARCHAR,
            primary_color VARCHAR,
            accent_color VARCHAR,
            country VARCHAR,
            state_region VARCHAR,
            city VARCHAR,
            address_line VARCHAR,
            geo_lat DOUBLE PRECISION,
            geo_lng DOUBLE PRECISION,
            website_url VARCHAR,
            instagram_url VARCHAR,
            whatsapp_url VARCHAR,
            contact_email VARCHAR,
            contact_phone VARCHAR,
            head_coach_name VARCHAR,
            is_franchise INTEGER NOT NULL DEFAULT 0,
            is_featured INTEGER NOT NULL DEFAULT 0,
            created_by_user_id INTEGER REFERENCES participants(id) ON DELETE SET NULL,
            claimed_by_user_id INTEGER REFERENCES participants(id) ON DELETE SET NULL,
            published_at TIMESTAMPTZ,
            created_at TIMESTAMPTZ DEFAULT NOW(),
            updated_at TIMESTAMPTZ DEFAULT NOW()
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_gyms_slug ON gyms (slug)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_gyms_status ON gyms (status)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_gyms_ownership_status ON gyms (ownership_status)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_gyms_country_city ON gyms (country, city)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_gyms_created_by ON gyms (created_by_user_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_gyms_is_featured ON gyms (is_featured)")

    op.execute("""
        CREATE TABLE IF NOT EXISTS gym_locations (
            id SERIAL PRIMARY KEY,
            gym_id INTEGER NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
            name VARCHAR,
            country VARCHAR,
            state_region VARCHAR,
            city VARCHAR,
            address_line VARCHAR,
            geo_lat DOUBLE PRECISION,
            geo_lng DOUBLE PRECISION,
            contact_phone VARCHAR,
            schedule_summary TEXT,
            is_primary INTEGER NOT NULL DEFAULT 0,
            status VARCHAR NOT NULL DEFAULT 'active',
            created_at TIMESTAMPTZ DEFAULT NOW()
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_gym_locations_gym ON gym_locations (gym_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_gym_locations_country_city ON gym_locations (country, city)")

    op.execute("""
        CREATE TABLE IF NOT EXISTS gym_submissions (
            id SERIAL PRIMARY KEY,
            submitted_by_user_id INTEGER REFERENCES participants(id) ON DELETE SET NULL,
            proposed_name VARCHAR NOT NULL,
            country VARCHAR,
            state_region VARCHAR,
            city VARCHAR,
            instagram_url VARCHAR,
            website_url VARCHAR,
            contact_name VARCHAR,
            contact_email VARCHAR,
            submission_type VARCHAR NOT NULL DEFAULT 'suggest',
            notes TEXT,
            status VARCHAR NOT NULL DEFAULT 'pending',
            matched_gym_id INTEGER REFERENCES gyms(id) ON DELETE SET NULL,
            reviewed_by_admin_id INTEGER REFERENCES participants(id) ON DELETE SET NULL,
            reviewed_at TIMESTAMPTZ,
            created_at TIMESTAMPTZ DEFAULT NOW()
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_gym_submissions_status ON gym_submissions (status)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_gym_submissions_submitted_by ON gym_submissions (submitted_by_user_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_gym_submissions_matched_gym ON gym_submissions (matched_gym_id)")

    op.execute("""
        CREATE TABLE IF NOT EXISTS gym_claims (
            id SERIAL PRIMARY KEY,
            gym_id INTEGER NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
            requested_by_user_id INTEGER NOT NULL REFERENCES participants(id) ON DELETE RESTRICT,
            role_requested VARCHAR NOT NULL DEFAULT 'owner',
            evidence_type VARCHAR,
            evidence_url VARCHAR,
            notes TEXT,
            status VARCHAR NOT NULL DEFAULT 'pending',
            reviewed_by_admin_id INTEGER REFERENCES participants(id) ON DELETE SET NULL,
            reviewed_at TIMESTAMPTZ,
            created_at TIMESTAMPTZ DEFAULT NOW()
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_gym_claims_gym ON gym_claims (gym_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_gym_claims_status ON gym_claims (status)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_gym_claims_requester ON gym_claims (requested_by_user_id)")

    op.execute("""
        CREATE TABLE IF NOT EXISTS gym_memberships (
            id SERIAL PRIMARY KEY,
            gym_id INTEGER NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
            user_id INTEGER NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
            membership_type VARCHAR NOT NULL DEFAULT 'athlete',
            status VARCHAR NOT NULL DEFAULT 'declared',
            requested_at TIMESTAMPTZ DEFAULT NOW(),
            approved_at TIMESTAMPTZ,
            approved_by_user_id INTEGER REFERENCES participants(id) ON DELETE SET NULL,
            ended_at TIMESTAMPTZ,
            is_primary INTEGER NOT NULL DEFAULT 0,
            visibility VARCHAR NOT NULL DEFAULT 'public'
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_gym_memberships_gym ON gym_memberships (gym_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_gym_memberships_user ON gym_memberships (user_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_gym_memberships_status ON gym_memberships (status)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_gym_memberships_gym_user ON gym_memberships (gym_id, user_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_gym_memberships_is_primary ON gym_memberships (user_id, is_primary)")

    op.execute("""
        CREATE TABLE IF NOT EXISTS gym_staff (
            id SERIAL PRIMARY KEY,
            gym_id INTEGER NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
            user_id INTEGER NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
            role VARCHAR NOT NULL DEFAULT 'staff',
            status VARCHAR NOT NULL DEFAULT 'active',
            permissions_scope TEXT,
            created_at TIMESTAMPTZ DEFAULT NOW(),
            CONSTRAINT uq_gym_staff_gym_user UNIQUE (gym_id, user_id)
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_gym_staff_gym ON gym_staff (gym_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_gym_staff_user ON gym_staff (user_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_gym_staff_role ON gym_staff (role)")

    op.execute("""
        CREATE TABLE IF NOT EXISTS gym_audit_log (
            id SERIAL PRIMARY KEY,
            gym_id INTEGER NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
            actor_user_id INTEGER REFERENCES participants(id) ON DELETE SET NULL,
            action_type VARCHAR NOT NULL,
            before_snapshot TEXT,
            after_snapshot TEXT,
            created_at TIMESTAMPTZ DEFAULT NOW()
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_gym_audit_log_gym ON gym_audit_log (gym_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_gym_audit_log_actor ON gym_audit_log (actor_user_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_gym_audit_log_action ON gym_audit_log (action_type)")


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS gym_audit_log")
    op.execute("DROP TABLE IF EXISTS gym_staff")
    op.execute("DROP TABLE IF EXISTS gym_memberships")
    op.execute("DROP TABLE IF EXISTS gym_claims")
    op.execute("DROP TABLE IF EXISTS gym_submissions")
    op.execute("DROP TABLE IF EXISTS gym_locations")
    op.execute("DROP TABLE IF EXISTS gyms")
