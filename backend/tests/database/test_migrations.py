"""The migrations must build exactly the tables the code expects, or a real database would drift from the models."""

from alembic.autogenerate import compare_metadata
from alembic.migration import MigrationContext
from sqlalchemy import create_engine, inspect

from database import models  # noqa: F401
from database.migrate import run_migrations
from database.session import Base


def test_migrations_match_the_models(tmp_path):
    engine = create_engine(f"sqlite:///{tmp_path}/fresh.db")
    run_migrations(engine)
    assert {"checks", "claims", "evidence", "sources", "verdicts", "feedback"} <= set(inspect(engine).get_table_names())
    with engine.connect() as connection:
        assert compare_metadata(MigrationContext.configure(connection), Base.metadata) == []


def test_running_them_twice_is_safe(tmp_path):
    engine = create_engine(f"sqlite:///{tmp_path}/again.db")
    run_migrations(engine)
    run_migrations(engine)
