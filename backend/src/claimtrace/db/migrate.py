from pathlib import Path

from alembic import command
from alembic.config import Config
from sqlalchemy.engine import Engine

DB_DIR = Path(__file__).parent


def alembic_config() -> Config:
    config = Config(DB_DIR / "alembic.ini")
    config.set_main_option("script_location", str(DB_DIR / "migrations"))
    return config


def run_migrations(engine: Engine) -> None:
    """Brings the database up to date at startup. With one server process, nothing else can race it."""
    with engine.begin() as connection:
        config = alembic_config()
        config.attributes["connection"] = connection
        command.upgrade(config, "head")
