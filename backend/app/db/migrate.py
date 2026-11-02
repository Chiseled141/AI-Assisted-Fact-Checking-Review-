from pathlib import Path

from alembic import command
from alembic.config import Config
from sqlalchemy.engine import Engine

BACKEND = Path(__file__).parent.parent.parent


def alembic_config() -> Config:
    config = Config(BACKEND / "alembic.ini")
    config.set_main_option("script_location", str(BACKEND / "migrations"))
    return config


def run_migrations(engine: Engine) -> None:
    """Brings the database up to date at startup. With one server process, nothing else can race it."""
    with engine.begin() as connection:
        config = alembic_config()
        config.attributes["connection"] = connection
        command.upgrade(config, "head")
