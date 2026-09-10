"""Optional paid Open qualifier and separate final payment."""
from alembic import op

revision = "0042_open_qualifier"
down_revision = "0041_team_join_links"
branch_labels = None
depends_on = None


def upgrade():
    op.execute("ALTER TABLE competitions ADD COLUMN IF NOT EXISTS open_config VARCHAR")
    op.execute("ALTER TABLE competition_payment_intents ADD COLUMN IF NOT EXISTS purpose VARCHAR NOT NULL DEFAULT 'competition'")
    op.execute("""CREATE TABLE IF NOT EXISTS competition_open_entries (
        competition_id INTEGER REFERENCES competitions(id) ON DELETE CASCADE,
        user_id INTEGER REFERENCES participants(id) ON DELETE CASCADE,
        categoria VARCHAR NOT NULL, status VARCHAR NOT NULL DEFAULT 'paid',
        open_price INTEGER NOT NULL, final_amount INTEGER NOT NULL,
        terms_snapshot VARCHAR NOT NULL, enrollment_answers VARCHAR,
        video_url VARCHAR, answers VARCHAR NOT NULL DEFAULT '{}',
        submitted_at TIMESTAMPTZ, reviewed_at TIMESTAMPTZ, reviewed_by INTEGER,
        paid_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (competition_id, user_id)
    )""")


def downgrade():
    op.execute("DROP TABLE competition_open_entries")
    op.execute("ALTER TABLE competition_payment_intents DROP COLUMN purpose")
    op.execute("ALTER TABLE competitions DROP COLUMN open_config")
