import logging
import os
from pathlib import Path
from typing import Generator

from alembic import command
from alembic.config import Config
from dotenv import load_dotenv
from sqlmodel import SQLModel, Session, create_engine, select

from auth import ADMIN_ID, ADMIN_PASSWORD, hash_password
from constants import Role
from models import AppUser, Participant

logger = logging.getLogger(__name__)

SERVER_DIR = Path(__file__).resolve().parent
ROOT_ENV_PATH = SERVER_DIR / ".env"
ALEMBIC_INI_PATH = SERVER_DIR / "alembic.ini"
ALEMBIC_SCRIPT_LOCATION = SERVER_DIR / "migrations"

load_dotenv(ROOT_ENV_PATH)

DATABASE_URL = (os.getenv("DATABASE_URL") or "").strip()
if not DATABASE_URL:
    raise RuntimeError("DATABASE_URL es obligatorio y debe apuntar a PostgreSQL.")
if not DATABASE_URL.startswith(("postgresql://", "postgresql+psycopg2://")):
    raise RuntimeError("Solo se admite PostgreSQL en DATABASE_URL.")

engine_options = {
    "echo": False,
    "pool_size": int(os.getenv("DB_POOL_SIZE", "20")),
    "max_overflow": int(os.getenv("DB_MAX_OVERFLOW", "40")),
    "pool_pre_ping": True,
    "pool_recycle": int(os.getenv("DB_POOL_RECYCLE_SECONDS", "1800")),
    "pool_timeout": int(os.getenv("DB_POOL_TIMEOUT_SECONDS", "30")),
}

engine = create_engine(DATABASE_URL, **engine_options)


def get_session() -> Generator[Session, None, None]:
    with Session(engine) as session:
        yield session


def run_db_migrations() -> None:
    alembic_config = Config(str(ALEMBIC_INI_PATH))
    alembic_config.set_main_option("script_location", str(ALEMBIC_SCRIPT_LOCATION))
    command.upgrade(alembic_config, "head")


def _ensure_app_user(
    session: Session,
    *,
    username: str,
    display_name: str,
    role: str,
    password: str,
    organizer_enabled: int = 0,
    judge_enabled: int = 0,
    admin_enabled: int = 0,
    participant_id: int | None = None,
) -> None:
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
        if int(existing.judge_enabled or 0) != int(judge_enabled or 0):
            existing.judge_enabled = int(judge_enabled or 0)
            changed = True
        if int(existing.admin_enabled or 0) != int(admin_enabled or 0):
            existing.admin_enabled = int(admin_enabled or 0)
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
            judge_enabled=int(judge_enabled or 0),
            admin_enabled=int(admin_enabled or 0),
            participant_id=participant_id,
            is_active=1,
        )
    )
    session.commit()


def init_db() -> None:
    SQLModel.metadata.create_all(engine)

    with Session(engine) as session:
        _ensure_app_user(
            session,
            username=ADMIN_ID,
            display_name="Administrador",
            role=Role.ADMIN,
            password=ADMIN_PASSWORD,
            admin_enabled=1,
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

        participants = session.exec(select(Participant)).all()
        app_users = session.exec(select(AppUser)).all()

        app_users_by_participant_id = {
            item.participant_id: item
            for item in app_users
            if item.participant_id is not None
        }
        usernames_in_use = {
            (item.username or "").strip().lower()
            for item in app_users
            if (item.username or "").strip()
        }

        for participant in participants:
            existing = app_users_by_participant_id.get(participant.id)
            display_name = f"{participant.nombre} {participant.apellido}".strip() or participant.cedula
            preferred_username = (participant.email or participant.cedula or "").strip().lower()
            if not preferred_username:
                continue

            if existing:
                changed = False
                previous_username = (existing.username or "").strip().lower()
                if existing.username != preferred_username:
                    existing.username = preferred_username
                    changed = True
                if existing.display_name != display_name:
                    existing.display_name = display_name
                    changed = True
                if existing.role not in Role.STAFF and existing.role != Role.USER:
                    existing.role = Role.USER
                    changed = True
                if existing.participant_id is not None and existing.role != Role.USER:
                    existing.role = Role.USER
                    changed = True
                if existing.is_active != 1:
                    existing.is_active = 1
                    changed = True
                if changed:
                    session.add(existing)
                    try:
                        session.commit()
                        if previous_username and previous_username != preferred_username:
                            usernames_in_use.discard(previous_username)
                        usernames_in_use.add(preferred_username)
                    except Exception:
                        session.rollback()
                continue

            if preferred_username in usernames_in_use:
                continue

            new_app_user = AppUser(
                username=preferred_username,
                display_name=display_name,
                role=Role.USER,
                password_hash=hash_password(participant.cedula),
                organizer_enabled=0,
                participant_id=participant.id,
                is_active=1,
            )
            session.add(new_app_user)
            try:
                session.commit()
            except Exception:
                session.rollback()
                continue

            app_users_by_participant_id[participant.id] = new_app_user
            usernames_in_use.add(preferred_username)
