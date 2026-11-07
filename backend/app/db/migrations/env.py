"""Uses the connection the app hands over, or `DATABASE_URL` when run from the command line."""

from alembic import context
from sqlalchemy import create_engine

from app.core.config import get_settings
from app.db import models  # noqa: F401  Registers the tables on Base.
from app.db.session import Base


def run_with(connection) -> None:
    context.configure(connection=connection, target_metadata=Base.metadata, render_as_batch=True)
    with context.begin_transaction():
        context.run_migrations()


connection = context.config.attributes.get("connection")
if connection is not None:
    run_with(connection)
else:
    with create_engine(get_settings().database_url).connect() as new_connection:
        run_with(new_connection)
        new_connection.commit()
