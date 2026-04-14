import os
from typing import Generator

from dotenv import load_dotenv
from sqlalchemy import text
from sqlmodel import SQLModel, Session, create_engine, select

from auth import ADMIN_ID, ADMIN_PASSWORD, hash_password
from constants import EstadoParticipante, Role
from models import AppUser, Participant

load_dotenv()

MAX_TEAM_SIZE = 10

DATABASE_URL = (os.getenv("DATABASE_URL") or "").strip()
if not DATABASE_URL:
    raise RuntimeError("DATABASE_URL es obligatorio y debe apuntar a PostgreSQL.")
if not DATABASE_URL.startswith(("postgresql://", "postgresql+psycopg2://")):
    raise RuntimeError("Solo se admite PostgreSQL en DATABASE_URL.")

engine_options = {"echo": False}

engine = create_engine(DATABASE_URL, **engine_options)


def get_session() -> Generator[Session, None, None]:
    with Session(engine) as session:
        yield session


def _ensure_app_user(
    session: Session,
    *,
    username: str,
    display_name: str,
    role: str,
    password: str,
    organizer_enabled: int = 0,
    participant_id: int | None = None,
):
    existing = session.exec(select(AppUser).where(AppUser.username == username)).first()
    if existing:
        changed = False
        if existing.display_name != display_name:
            existing.display_name = display_name
            changed = True
        if existing.role != role:
            existing.role = role
            changed = True
        if int(existing.organizer_enabled or 0) != int(organizer_enabled or 0):
            existing.organizer_enabled = int(organizer_enabled or 0)
            changed = True
        if participant_id is not None and existing.participant_id != participant_id:
            existing.participant_id = participant_id
            changed = True
        if existing.is_active != 1:
            existing.is_active = 1
            changed = True
        if changed:
            session.add(existing)
            session.commit()
        return

    session.add(
        AppUser(
            username=username,
            display_name=display_name,
            role=role,
            password_hash=hash_password(password),
            organizer_enabled=int(organizer_enabled or 0),
            participant_id=participant_id,
            is_active=1,
        )
    )
    session.commit()


def init_db():
    SQLModel.metadata.create_all(engine)

    # Column migrations for tables that may already exist
    _migrations = [
        "ALTER TABLE competition_participants ADD COLUMN IF NOT EXISTS categoria TEXT",
        "ALTER TABLE results ADD COLUMN IF NOT EXISTS phase_id INTEGER REFERENCES competition_phases(id) ON DELETE SET NULL",
        "ALTER TABLE results ADD COLUMN IF NOT EXISTS marca INTEGER",
        "ALTER TABLE results DROP COLUMN IF EXISTS notas",
        "ALTER TABLE competition_participants ADD COLUMN IF NOT EXISTS estado TEXT NOT NULL DEFAULT 'confirmado'",
        "ALTER TABLE competitions ADD COLUMN IF NOT EXISTS enrollment_open INTEGER NOT NULL DEFAULT 0",
        "ALTER TABLE competitions ADD COLUMN IF NOT EXISTS show_individual_leaderboard INTEGER NOT NULL DEFAULT 1",
        "ALTER TABLE competitions ADD COLUMN IF NOT EXISTS show_team_all_by_category_option INTEGER NOT NULL DEFAULT 1",
        "ALTER TABLE competitions ADD COLUMN IF NOT EXISTS show_team_all_global_option INTEGER NOT NULL DEFAULT 1",
        "ALTER TABLE competitions ADD COLUMN IF NOT EXISTS individual_enabled INTEGER NOT NULL DEFAULT 1",
        "ALTER TABLE competitions ADD COLUMN IF NOT EXISTS team_enabled INTEGER NOT NULL DEFAULT 0",
        "ALTER TABLE competitions ADD COLUMN IF NOT EXISTS team_categories_enabled INTEGER NOT NULL DEFAULT 1",
        "ALTER TABLE competitions ADD COLUMN IF NOT EXISTS team_size INTEGER NOT NULL DEFAULT 2",
        "ALTER TABLE competitions ADD COLUMN IF NOT EXISTS team_membership_rule TEXT NOT NULL DEFAULT 'free'",
        "ALTER TABLE competitions ADD COLUMN IF NOT EXISTS tv_show_qr INTEGER NOT NULL DEFAULT 1",
        "ALTER TABLE competitions ADD COLUMN IF NOT EXISTS tv_show_timer INTEGER NOT NULL DEFAULT 1",
        "ALTER TABLE competitions ADD COLUMN IF NOT EXISTS tv_include_total_slide INTEGER NOT NULL DEFAULT 1",
        "ALTER TABLE competitions ADD COLUMN IF NOT EXISTS tv_only_finalized_phases INTEGER NOT NULL DEFAULT 1",
        "ALTER TABLE competitions ADD COLUMN IF NOT EXISTS tv_rotation_interval_seconds INTEGER NOT NULL DEFAULT 24",
        "ALTER TABLE competitions ADD COLUMN IF NOT EXISTS tv_data_refresh_interval_seconds INTEGER NOT NULL DEFAULT 5",
        "ALTER TABLE competitions ADD COLUMN IF NOT EXISTS tv_mode TEXT NOT NULL DEFAULT 'cyclic'",
        "ALTER TABLE competitions ADD COLUMN IF NOT EXISTS tv_static_view TEXT NOT NULL DEFAULT 'individual'",
        "ALTER TABLE competitions ADD COLUMN IF NOT EXISTS tv_static_phase_id INTEGER",
        "ALTER TABLE competitions ADD COLUMN IF NOT EXISTS tv_static_individual_category TEXT",
        "ALTER TABLE competitions ADD COLUMN IF NOT EXISTS tv_static_team_category_mode TEXT NOT NULL DEFAULT '__by_category__'",
        "ALTER TABLE competitions ADD COLUMN IF NOT EXISTS enrollment_start TIMESTAMPTZ",
        "ALTER TABLE competitions ADD COLUMN IF NOT EXISTS enrollment_end TIMESTAMPTZ",
        "ALTER TABLE competitions ADD COLUMN IF NOT EXISTS competition_start TIMESTAMPTZ",
        "ALTER TABLE competitions ADD COLUMN IF NOT EXISTS competition_end TIMESTAMPTZ",
        "ALTER TABLE competitions ADD COLUMN IF NOT EXISTS schedule_items TEXT",
        "ALTER TABLE competitions ADD COLUMN IF NOT EXISTS landing_sections TEXT",
        "ALTER TABLE competitions ADD COLUMN IF NOT EXISTS contact_phone TEXT",
        "ALTER TABLE competitions ADD COLUMN IF NOT EXISTS website_url TEXT",
        "ALTER TABLE competitions ADD COLUMN IF NOT EXISTS social_links TEXT",
        "ALTER TABLE competitions ADD COLUMN IF NOT EXISTS profile_image_url TEXT",
        "ALTER TABLE competitions ADD COLUMN IF NOT EXISTS banner_image_url TEXT",
        "ALTER TABLE competitions ADD COLUMN IF NOT EXISTS banner_desktop_url TEXT",
        "ALTER TABLE competitions ADD COLUMN IF NOT EXISTS banner_mobile_url TEXT",
        "ALTER TABLE competitions ADD COLUMN IF NOT EXISTS theme_background_color TEXT",
        "ALTER TABLE competitions ADD COLUMN IF NOT EXISTS theme_surface_color TEXT",
        "ALTER TABLE competitions ADD COLUMN IF NOT EXISTS theme_primary_color TEXT",
        "ALTER TABLE competitions ADD COLUMN IF NOT EXISTS theme_accent_color TEXT",
        "ALTER TABLE competitions ADD COLUMN IF NOT EXISTS enrollment_intro_text TEXT",
        "ALTER TABLE competitions ADD COLUMN IF NOT EXISTS general_info_text TEXT",
        "ALTER TABLE competitions ADD COLUMN IF NOT EXISTS enrollment_payment_methods TEXT",
        "ALTER TABLE competitions ADD COLUMN IF NOT EXISTS enrollment_questions TEXT",
        "ALTER TABLE competitions ADD COLUMN IF NOT EXISTS enrollment_terms_text TEXT",
        "ALTER TABLE competitions ADD COLUMN IF NOT EXISTS require_payment_receipt INTEGER NOT NULL DEFAULT 0",
        "ALTER TABLE competitions ADD COLUMN IF NOT EXISTS platform_fee_rate DOUBLE PRECISION NOT NULL DEFAULT 0.05",
        "ALTER TABLE competitions ADD COLUMN IF NOT EXISTS imagen_url TEXT",
        "ALTER TABLE competitions ADD COLUMN IF NOT EXISTS lugar TEXT",
        "ALTER TABLE competition_categories ADD COLUMN IF NOT EXISTS descripcion TEXT",
        "ALTER TABLE competition_categories ADD COLUMN IF NOT EXISTS modality TEXT NOT NULL DEFAULT 'individual'",
        "ALTER TABLE competition_categories ADD COLUMN IF NOT EXISTS enrollment_price INTEGER NOT NULL DEFAULT 0",
        "ALTER TABLE competition_phases ADD COLUMN IF NOT EXISTS scoring_rules TEXT",
        "ALTER TABLE competition_phases ADD COLUMN IF NOT EXISTS modality TEXT NOT NULL DEFAULT 'individual'",
        "ALTER TABLE competition_phases ADD COLUMN IF NOT EXISTS block_name TEXT",
        "ALTER TABLE competition_phases ADD COLUMN IF NOT EXISTS block_order INTEGER NOT NULL DEFAULT 0",
        "ALTER TABLE competition_phases ADD COLUMN IF NOT EXISTS phase_format TEXT NOT NULL DEFAULT 'activity'",
        "ALTER TABLE competition_phases ADD COLUMN IF NOT EXISTS activities TEXT",
        "ALTER TABLE competition_phases ADD COLUMN IF NOT EXISTS winner_rule TEXT NOT NULL DEFAULT 'higher_wins'",
        "ALTER TABLE competition_phases ADD COLUMN IF NOT EXISTS measurement_method TEXT NOT NULL DEFAULT 'unidades'",
        "ALTER TABLE competition_phases ADD COLUMN IF NOT EXISTS points_mode TEXT NOT NULL DEFAULT 'manual'",
        "ALTER TABLE competition_phases ADD COLUMN IF NOT EXISTS allow_multiple_results INTEGER NOT NULL DEFAULT 0",
        "ALTER TABLE competition_phases ADD COLUMN IF NOT EXISTS team_result_mode TEXT NOT NULL DEFAULT 'sum_two'",
        "ALTER TABLE competition_phases ADD COLUMN IF NOT EXISTS estado TEXT NOT NULL DEFAULT 'pendiente'",
        "ALTER TABLE competition_phases ADD COLUMN IF NOT EXISTS start_at TIMESTAMPTZ",
        "ALTER TABLE competition_phases ADD COLUMN IF NOT EXISTS end_at TIMESTAMPTZ",
        "ALTER TABLE competitions ADD COLUMN IF NOT EXISTS timer_duration INTEGER NOT NULL DEFAULT 0",
        "ALTER TABLE competitions ADD COLUMN IF NOT EXISTS timer_started_at TIMESTAMPTZ",
        "ALTER TABLE competitions ADD COLUMN IF NOT EXISTS timer_elapsed_before_pause INTEGER NOT NULL DEFAULT 0",
        "ALTER TABLE competitions ADD COLUMN IF NOT EXISTS timer_mode TEXT NOT NULL DEFAULT 'countdown'",
        "ALTER TABLE competitions ADD COLUMN IF NOT EXISTS timer_format TEXT NOT NULL DEFAULT 'mm:ss'",
        "ALTER TABLE competitions ADD COLUMN IF NOT EXISTS scoring_mode TEXT NOT NULL DEFAULT 'highest_wins'",
        "ALTER TABLE competitions ADD COLUMN IF NOT EXISTS organizer_user_id INTEGER REFERENCES app_users(id) ON DELETE SET NULL",
        "ALTER TABLE teams ADD COLUMN IF NOT EXISTS team_category_id INTEGER REFERENCES competition_categories(id) ON DELETE SET NULL",
        "ALTER TABLE results DROP COLUMN IF EXISTS evento",
        "UPDATE competitions SET individual_enabled = CASE WHEN individual_enabled IN (0,1) THEN individual_enabled ELSE 1 END",
        "UPDATE competitions SET team_enabled = CASE WHEN team_enabled IN (0,1) THEN team_enabled ELSE 0 END",
        "UPDATE competitions SET team_categories_enabled = CASE WHEN team_categories_enabled IN (0,1) THEN team_categories_enabled ELSE 1 END",
        f"UPDATE competitions SET team_size = CASE WHEN team_size IS NULL OR team_size < 1 THEN 1 WHEN team_size > {MAX_TEAM_SIZE} THEN {MAX_TEAM_SIZE} ELSE team_size END",
        "UPDATE competitions SET team_membership_rule = CASE WHEN LOWER(TRIM(team_membership_rule)) IN ('free', 'same_category') THEN LOWER(TRIM(team_membership_rule)) ELSE 'free' END",
        "UPDATE competitions SET team_enabled = 1 WHERE team_enabled = 0 AND EXISTS (SELECT 1 FROM teams WHERE teams.competition_id = competitions.id)",
        "UPDATE competition_categories SET modality = CASE WHEN LOWER(TRIM(modality)) IN ('individual', 'teams') THEN LOWER(TRIM(modality)) ELSE 'individual' END",
        "UPDATE competition_phases SET modality = CASE WHEN LOWER(TRIM(modality)) IN ('individual', 'teams') THEN LOWER(TRIM(modality)) WHEN EXISTS (SELECT 1 FROM results r WHERE r.phase_id = competition_phases.id AND r.team_id IS NOT NULL) THEN 'teams' ELSE 'individual' END",
        "UPDATE competition_phases SET block_order = CASE WHEN block_order IS NULL THEN 0 ELSE block_order END",
        "UPDATE competition_phases SET tipo = 'cantidad' WHERE tipo IS NULL OR LOWER(TRIM(tipo)) IN ('', 'puntos', 'peso')",
        "UPDATE competition_phases SET phase_format = 'activity' WHERE phase_format IS NULL OR LOWER(TRIM(phase_format)) NOT IN ('activity', 'wod')",
        "UPDATE competition_phases SET tipo = 'posicion' WHERE LOWER(TRIM(tipo)) = 'posición'",
        "UPDATE competition_phases SET winner_rule = 'higher_wins' WHERE winner_rule IS NULL OR LOWER(TRIM(winner_rule)) NOT IN ('higher_wins', 'lower_wins')",
        "UPDATE competition_phases SET measurement_method = 'unidades' WHERE measurement_method IS NULL OR TRIM(measurement_method) = ''",
        "UPDATE competition_phases SET measurement_method = LOWER(TRIM(measurement_method))",
        # Si se agrega un valor a MedicionFase.ALL en constants.py, actualizar esta lista tambien
        "UPDATE competition_phases SET measurement_method = 'unidades' WHERE measurement_method NOT IN ('amrap', 'emom', 'for_time', 'rm', 'unidades', 'metros', 'tiempo_hms', 'repeticiones', 'kilogramos', 'gramos', 'libras', 'posicion')",
        "UPDATE competition_phases SET measurement_method = 'posicion' WHERE LOWER(TRIM(tipo)) = 'posicion'",
        "UPDATE competition_phases SET measurement_method = 'tiempo_hms' WHERE LOWER(TRIM(tipo)) = 'tiempo' AND LOWER(TRIM(measurement_method)) = 'unidades'",
        "UPDATE competition_phases SET winner_rule = 'lower_wins' WHERE LOWER(TRIM(tipo)) IN ('tiempo', 'posicion')",
        "UPDATE competition_phases SET winner_rule = 'higher_wins' WHERE LOWER(TRIM(tipo)) = 'cantidad'",
        "UPDATE competition_phases SET team_result_mode = 'sum_two' WHERE team_result_mode IS NULL OR LOWER(TRIM(team_result_mode)) NOT IN ('sum_two', 'single_member', 'total')",
        "UPDATE competition_phases SET points_mode = 'manual' WHERE points_mode IS NULL OR LOWER(TRIM(points_mode)) NOT IN ('manual', 'position_direct', 'position_rules')",
        "UPDATE competition_phases SET estado = 'pendiente' WHERE estado IS NULL OR LOWER(TRIM(estado)) NOT IN ('pendiente', 'en_progreso', 'finalizada')",
        "UPDATE competitions SET scoring_mode = 'highest_wins' WHERE scoring_mode IS NULL OR LOWER(TRIM(scoring_mode)) NOT IN ('highest_wins', 'lowest_wins')",
        "UPDATE competitions SET tv_show_qr = 1 WHERE tv_show_qr IS NULL OR tv_show_qr NOT IN (0,1)",
        "UPDATE competitions SET tv_show_timer = 1 WHERE tv_show_timer IS NULL OR tv_show_timer NOT IN (0,1)",
        "UPDATE competitions SET tv_include_total_slide = 1 WHERE tv_include_total_slide IS NULL OR tv_include_total_slide NOT IN (0,1)",
        "UPDATE competitions SET tv_only_finalized_phases = 1 WHERE tv_only_finalized_phases IS NULL OR tv_only_finalized_phases NOT IN (0,1)",
        "UPDATE competitions SET tv_rotation_interval_seconds = 24 WHERE tv_rotation_interval_seconds IS NULL OR tv_rotation_interval_seconds < 5 OR tv_rotation_interval_seconds > 120",
        "UPDATE competitions SET tv_data_refresh_interval_seconds = 5 WHERE tv_data_refresh_interval_seconds IS NULL OR tv_data_refresh_interval_seconds < 2 OR tv_data_refresh_interval_seconds > 60",
        "UPDATE competitions SET tv_mode = 'cyclic' WHERE tv_mode IS NULL OR LOWER(TRIM(tv_mode)) NOT IN ('cyclic', 'static')",
        "UPDATE competitions SET tv_static_view = 'individual' WHERE tv_static_view IS NULL OR LOWER(TRIM(tv_static_view)) NOT IN ('individual', 'teams')",
        "UPDATE competitions SET tv_static_team_category_mode = '__by_category__' WHERE tv_static_team_category_mode IS NULL OR TRIM(tv_static_team_category_mode) = ''",
        "UPDATE competitions SET require_payment_receipt = 0 WHERE require_payment_receipt IS NULL OR require_payment_receipt NOT IN (0,1)",
        "UPDATE competitions SET platform_fee_rate = 0.05 WHERE platform_fee_rate IS NULL OR platform_fee_rate < 0 OR platform_fee_rate > 1",
        "UPDATE competition_categories SET enrollment_price = 0 WHERE enrollment_price IS NULL OR enrollment_price < 0",
        "DELETE FROM competition_heat_assignments WHERE heat_id IN (SELECT h.id FROM competition_heats h LEFT JOIN competition_phases ph ON ph.id = h.phase_id WHERE ph.id IS NULL)",
        "DELETE FROM competition_heats WHERE phase_id IN (SELECT h.phase_id FROM competition_heats h LEFT JOIN competition_phases ph ON ph.id = h.phase_id WHERE ph.id IS NULL)",
        "ALTER TABLE teams ADD COLUMN IF NOT EXISTS captain_id INTEGER REFERENCES participants(id) ON DELETE SET NULL",
        "ALTER TABLE participants ADD COLUMN IF NOT EXISTS genero TEXT",
        "ALTER TABLE participants ADD COLUMN IF NOT EXISTS box TEXT",
        "ALTER TABLE participants ADD COLUMN IF NOT EXISTS talla_camiseta TEXT",
        "ALTER TABLE competition_participants ADD COLUMN IF NOT EXISTS enrollment_answers TEXT",
        "ALTER TABLE competition_participants ADD COLUMN IF NOT EXISTS payment_provider TEXT",
        "ALTER TABLE competition_participants ADD COLUMN IF NOT EXISTS payment_reference TEXT",
        "ALTER TABLE competition_participants ADD COLUMN IF NOT EXISTS payment_order_id TEXT",
        "ALTER TABLE competition_participants ADD COLUMN IF NOT EXISTS payment_status TEXT",
        "ALTER TABLE competition_participants ADD COLUMN IF NOT EXISTS payment_transaction_id TEXT",
        "ALTER TABLE competition_participants ADD COLUMN IF NOT EXISTS payment_base_amount INTEGER NOT NULL DEFAULT 0",
        "ALTER TABLE competition_participants ADD COLUMN IF NOT EXISTS payment_platform_fee INTEGER NOT NULL DEFAULT 0",
        "ALTER TABLE competition_participants ADD COLUMN IF NOT EXISTS payment_processor_fee INTEGER NOT NULL DEFAULT 0",
        "ALTER TABLE competition_participants ADD COLUMN IF NOT EXISTS payment_platform_net INTEGER NOT NULL DEFAULT 0",
        "ALTER TABLE competition_participants ADD COLUMN IF NOT EXISTS payment_amount_total INTEGER NOT NULL DEFAULT 0",
        "ALTER TABLE competition_participants ADD COLUMN IF NOT EXISTS payment_processed_at TIMESTAMPTZ",
        "ALTER TABLE competition_participants ADD COLUMN IF NOT EXISTS payment_updated_at TIMESTAMPTZ",
        """
        CREATE TABLE IF NOT EXISTS competition_payment_intents (
            id SERIAL PRIMARY KEY,
            competition_id INTEGER NOT NULL REFERENCES competitions(id) ON DELETE CASCADE,
            participant_id INTEGER NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
            categoria TEXT,
            enrollment_answers TEXT,
            payment_provider TEXT NOT NULL DEFAULT 'bold',
            payment_reference TEXT NOT NULL UNIQUE,
            payment_order_id TEXT,
            payment_status TEXT NOT NULL DEFAULT 'created',
            payment_transaction_id TEXT,
            payment_base_amount INTEGER NOT NULL DEFAULT 0,
            payment_platform_fee INTEGER NOT NULL DEFAULT 0,
            payment_processor_fee INTEGER NOT NULL DEFAULT 0,
            payment_platform_net INTEGER NOT NULL DEFAULT 0,
            payment_amount_total INTEGER NOT NULL DEFAULT 0,
            payment_processed_at TIMESTAMPTZ,
            payment_updated_at TIMESTAMPTZ,
            created_at TIMESTAMPTZ DEFAULT NOW()
        )
        """,
        "CREATE INDEX IF NOT EXISTS idx_competition_payment_intents_competition_id ON competition_payment_intents(competition_id)",
        "CREATE INDEX IF NOT EXISTS idx_competition_payment_intents_participant_id ON competition_payment_intents(participant_id)",
        "ALTER TABLE competition_withdrawal_requests ADD COLUMN IF NOT EXISTS terms_accepted_at TIMESTAMPTZ",
        "ALTER TABLE competition_withdrawal_requests ADD COLUMN IF NOT EXISTS terms_version TEXT",
        "ALTER TABLE participants ADD COLUMN IF NOT EXISTS profile_photo_url TEXT",
        "ALTER TABLE participants ADD COLUMN IF NOT EXISTS fecha_nacimiento DATE",
        "ALTER TABLE participants ADD COLUMN IF NOT EXISTS ciudad_pais TEXT",
        "ALTER TABLE app_users ADD COLUMN IF NOT EXISTS display_name TEXT",
        "ALTER TABLE app_users ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'user'",
        "ALTER TABLE app_users ADD COLUMN IF NOT EXISTS password_hash TEXT",
        "ALTER TABLE app_users ADD COLUMN IF NOT EXISTS organizer_enabled INTEGER NOT NULL DEFAULT 0",
        "ALTER TABLE app_users ADD COLUMN IF NOT EXISTS participant_id INTEGER REFERENCES participants(id) ON DELETE SET NULL",
        "ALTER TABLE app_users ADD COLUMN IF NOT EXISTS is_active INTEGER NOT NULL DEFAULT 1",
        "UPDATE participants SET genero = sexo WHERE genero IS NULL AND sexo IS NOT NULL",
        "UPDATE app_users SET role = 'user' WHERE role IS NULL OR TRIM(role) = ''",
        "UPDATE app_users SET organizer_enabled = 0 WHERE organizer_enabled IS NULL",
        "UPDATE app_users SET organizer_enabled = 1 WHERE role = 'organizer'",
        "UPDATE app_users SET role = 'user' WHERE role = 'organizer' AND participant_id IS NOT NULL",
        "UPDATE app_users SET is_active = 1 WHERE is_active IS NULL",
        "UPDATE competition_participants SET payment_base_amount = 0 WHERE payment_base_amount IS NULL OR payment_base_amount < 0",
        "UPDATE competition_participants SET payment_platform_fee = 0 WHERE payment_platform_fee IS NULL OR payment_platform_fee < 0",
        "UPDATE competition_participants SET payment_processor_fee = CASE WHEN COALESCE(payment_amount_total, 0) > 0 THEN CAST(ROUND(COALESCE(payment_amount_total, 0) * 0.0269) AS INTEGER) + 300 ELSE 0 END WHERE payment_processor_fee IS NULL OR payment_processor_fee < 0 OR payment_processor_fee = 0",
        "UPDATE competition_participants SET payment_platform_net = COALESCE(payment_platform_fee, 0) - COALESCE(payment_processor_fee, 0) WHERE payment_platform_net IS NULL OR payment_platform_net = 0",
        "UPDATE competition_participants SET payment_amount_total = 0 WHERE payment_amount_total IS NULL OR payment_amount_total < 0",
        "ALTER TABLE competition_payment_intents ADD COLUMN IF NOT EXISTS payment_processor_fee INTEGER NOT NULL DEFAULT 0",
        "ALTER TABLE competition_payment_intents ADD COLUMN IF NOT EXISTS payment_platform_net INTEGER NOT NULL DEFAULT 0",
        "UPDATE competition_payment_intents SET payment_processor_fee = CASE WHEN COALESCE(payment_amount_total, 0) > 0 THEN CAST(ROUND(COALESCE(payment_amount_total, 0) * 0.0269) AS INTEGER) + 300 ELSE 0 END WHERE payment_processor_fee IS NULL OR payment_processor_fee < 0 OR payment_processor_fee = 0",
        "UPDATE competition_payment_intents SET payment_platform_net = COALESCE(payment_platform_fee, 0) - COALESCE(payment_processor_fee, 0) WHERE payment_platform_net IS NULL OR payment_platform_net = 0",
        """
        CREATE TABLE IF NOT EXISTS organizer_applications (
            id SERIAL PRIMARY KEY,
            app_user_id INTEGER NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
            participant_id INTEGER NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
            status TEXT NOT NULL DEFAULT 'pending',
            requested_event_name TEXT NOT NULL,
            requested_event_location TEXT,
            requested_event_date DATE,
            requested_event_description TEXT,
            why_organizer TEXT NOT NULL,
            prior_events_summary TEXT,
            why_finalrep TEXT NOT NULL,
            profile_snapshot_json TEXT NOT NULL,
            review_note TEXT,
            reviewed_by_user_id INTEGER REFERENCES app_users(id) ON DELETE SET NULL,
            reviewed_at TIMESTAMPTZ,
            created_at TIMESTAMPTZ DEFAULT NOW(),
            updated_at TIMESTAMPTZ DEFAULT NOW()
        )
        """,
        "CREATE INDEX IF NOT EXISTS idx_organizer_applications_app_user_id ON organizer_applications(app_user_id)",
        "CREATE INDEX IF NOT EXISTS idx_organizer_applications_participant_id ON organizer_applications(participant_id)",
        "CREATE INDEX IF NOT EXISTS idx_organizer_applications_status ON organizer_applications(status)",
    ]
    with engine.connect() as conn:
        for sql in _migrations:
            try:
                conn.execute(text(sql))
                conn.commit()
            except Exception:
                conn.rollback()

    with Session(engine) as session:
        _ensure_app_user(
            session,
            username=ADMIN_ID,
            display_name="Administrador",
            role=Role.ADMIN,
            password=ADMIN_PASSWORD,
        )

        organizer_username = os.getenv("APP_ORGANIZER_USERNAME", "organizer").strip()
        organizer_password = os.getenv("APP_ORGANIZER_PASSWORD", "organizer123").strip()
        organizer_display_name = os.getenv("APP_ORGANIZER_DISPLAY_NAME", "Organizador").strip()
        organizer_participant_id_raw = os.getenv("APP_ORGANIZER_PARTICIPANT_ID", "").strip()
        if organizer_username and organizer_password and organizer_display_name:
            organizer_participant_id = None
            if organizer_participant_id_raw:
                try:
                    organizer_participant_id = int(organizer_participant_id_raw)
                except ValueError:
                    organizer_participant_id = None
            _ensure_app_user(
                session,
                username=organizer_username,
                display_name=organizer_display_name,
                role=Role.ORGANIZER,
                password=organizer_password,
                organizer_enabled=1,
                participant_id=organizer_participant_id,
            )

        participants = session.exec(select(Participant).where(Participant.estado == EstadoParticipante.ACTIVO)).all()
        for participant in participants:
            existing = session.exec(
                select(AppUser).where(AppUser.participant_id == participant.id)
            ).first()
            display_name = f"{participant.nombre} {participant.apellido}".strip() or participant.cedula
            preferred_username = (participant.email or participant.cedula or "").strip().lower()
            if not preferred_username:
                continue
            if existing:
                changed = False
                if existing.username != preferred_username:
                    existing.username = preferred_username
                    changed = True
                if existing.display_name != display_name:
                    existing.display_name = display_name
                    changed = True
                if existing.role not in Role.STAFF and existing.role != Role.USER:
                    existing.role = Role.USER
                    changed = True
                if existing.is_active != 1:
                    existing.is_active = 1
                    changed = True
                if changed:
                    session.add(existing)
                    try:
                        session.commit()
                    except Exception:
                        session.rollback()
                continue

            username_taken = session.exec(
                select(AppUser).where(AppUser.username == preferred_username)
            ).first()
            if username_taken:
                continue

            session.add(
                AppUser(
                    username=preferred_username,
                    display_name=display_name,
                    role=Role.USER,
                    password_hash=hash_password(participant.cedula),
                    organizer_enabled=0,
                    participant_id=participant.id,
                    is_active=1,
                )
            )
            session.commit()
