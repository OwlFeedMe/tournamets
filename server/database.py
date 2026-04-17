import logging
import os
from pathlib import Path
from typing import Generator

from alembic import command
from alembic.config import Config
from dotenv import load_dotenv
from sqlmodel import Session, create_engine

logger = logging.getLogger(__name__)

SERVER_DIR = Path(__file__).resolve().parent
ROOT_ENV_PATH = SERVER_DIR / ".env"
ALEMBIC_INI_PATH = SERVER_DIR / "alembic.ini"
ALEMBIC_SCRIPT_LOCATION = SERVER_DIR / "migrations"

load_dotenv(ROOT_ENV_PATH)

MAX_TEAM_SIZE = 10

DATABASE_URL = (os.getenv("DATABASE_URL") or "").strip()
if not DATABASE_URL:
    raise RuntimeError("DATABASE_URL es obligatorio y debe apuntar a PostgreSQL.")
if not DATABASE_URL.startswith(("postgresql://", "postgresql+psycopg2://")):
    raise RuntimeError("Solo se admite PostgreSQL en DATABASE_URL.")

engine_options = {
    "echo": False,
    # Valores conservadores para entornos gestionados con pocos connection slots.
    # Se pueden ampliar via .env si la base lo soporta.
    "pool_size": int(os.getenv("DB_POOL_SIZE", "3")),
    "max_overflow": int(os.getenv("DB_MAX_OVERFLOW", "2")),
    "pool_pre_ping": True,
    "pool_recycle": int(os.getenv("DB_POOL_RECYCLE_SECONDS", "1800")),
    "pool_timeout": int(os.getenv("DB_POOL_TIMEOUT_SECONDS", "15")),
}

engine = create_engine(DATABASE_URL, **engine_options)


def get_session() -> Generator[Session, None, None]:
    with Session(engine) as session:
        yield session


def run_db_migrations() -> None:
    alembic_config = Config(str(ALEMBIC_INI_PATH))
    alembic_config.set_main_option("script_location", str(ALEMBIC_SCRIPT_LOCATION))
    command.upgrade(alembic_config, "head")
