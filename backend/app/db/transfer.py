"""Move saved checks from the old SQLite file into PostgreSQL, and give checks from before accounts an owner.

    uv run python -m app.db.transfer copy                     # app/db/claimtrace.db → DATABASE_URL
    uv run python -m app.db.transfer copy --owner lan         # the same, and the copied checks go to user "lan"
    uv run python -m app.db.transfer claim lan                # every check without an owner goes to "lan"
    uv run python -m app.db.transfer claim lan chk_1 chk_2    # only these, if they have no owner

`copy` never writes to the SQLite file. It brings PostgreSQL up to date, refuses to copy into tables that already hold
rows, copies everything in one transaction (so a failure copies nothing), then compares row counts. Sign-in sessions
are not copied. `claim` only touches checks with no owner; it never moves a check from one user to another.
"""

import argparse
import sys
from datetime import UTC, datetime
from pathlib import Path

from sqlalchemy import func, inspect, select, update
from sqlalchemy.engine import Engine

from ..core.config import get_settings
from . import models
from .migrate import run_migrations
from .session import Base, make_engine

OLD_SQLITE = f"sqlite:///{Path(__file__).parent / 'claimtrace.db'}"
SKIPPED = {"user_sessions"}
BATCH = 500


class TransferError(Exception):
    pass


def _utc(value):
    # SQLite kept times as text without a zone, and every one of them is UTC.
    if isinstance(value, datetime) and value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value


def claim_unowned(engine: Engine, username: str, check_ids: list[str] | None = None) -> int:
    """Gives checks with no owner to `username`. Returns how many changed."""
    with engine.begin() as connection:
        user_id = connection.scalar(select(models.User.id).where(models.User.username == username.strip().lower()))
        if user_id is None:
            raise TransferError(f"There is no user called {username!r}. Sign up in the app first.")
        statement = update(models.Check).where(models.Check.user_id.is_(None))
        if check_ids:
            statement = statement.where(models.Check.id.in_(check_ids))
        return connection.execute(statement.values(user_id=user_id)).rowcount


def copy_database(source: Engine, target: Engine, owner: str | None = None) -> dict[str, int]:
    """Copies every table the source has into the target. Returns the row count copied per table."""
    if source.url == target.url:
        raise TransferError("The source and target are the same database.")
    if source.url.get_backend_name() == "sqlite" and not Path(source.url.database or "").is_file():
        raise TransferError(f"There is no SQLite file at {source.url.database}.")
    run_migrations(target)
    source_tables = set(inspect(source).get_table_names())
    if "checks" not in source_tables:
        raise TransferError("The source has no checks table. Is it a ClaimTrace database?")
    tables = [table for table in Base.metadata.sorted_tables if table.name in source_tables and table.name not in SKIPPED]
    counts: dict[str, int] = {}
    with source.connect() as reading, target.begin() as writing:
        for table in tables:
            if reading.scalar(select(func.count()).select_from(table)) and writing.scalar(
                select(func.count()).select_from(table)
            ):
                raise TransferError(f"The target already has rows in {table.name}. Copy into an empty database.")
        for table in tables:
            names = [column["name"] for column in inspect(source).get_columns(table.name)]
            columns = [table.c[name] for name in names if name in table.c]
            rows = reading.execute(select(*columns)).mappings()
            copied = 0
            while batch := rows.fetchmany(BATCH):
                writing.execute(table.insert(), [{key: _utc(value) for key, value in row.items()} for row in batch])
                copied += len(batch)
            counts[table.name] = copied
        for table in tables:
            saved = writing.scalar(select(func.count()).select_from(table))
            if saved != counts[table.name]:
                raise TransferError(f"{table.name}: copied {counts[table.name]} rows but found {saved}. Nothing was saved.")
        if owner:
            user_id = writing.scalar(select(models.User.id).where(models.User.username == owner.strip().lower()))
            if user_id is None:
                raise TransferError(f"There is no user called {owner!r}. Sign up in the app first. Nothing was saved.")
            writing.execute(update(models.Check).where(models.Check.user_id.is_(None)).values(user_id=user_id))
    return counts


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="python -m app.db.transfer", description=__doc__.split("\n\n")[0])
    commands = parser.add_subparsers(dest="command", required=True)
    copy = commands.add_parser("copy", help="Copy the old SQLite database into PostgreSQL.")
    copy.add_argument("--from", dest="source", default=OLD_SQLITE, help="Source URL. Default: app/db/claimtrace.db")
    copy.add_argument("--to", dest="target", default=None, help="Target URL. Default: DATABASE_URL")
    copy.add_argument("--owner", help="Give every copied check without an owner to this existing user.")
    claim = commands.add_parser("claim", help="Give checks with no owner to a user.")
    claim.add_argument("username")
    claim.add_argument("check_ids", nargs="*", help="Only these checks. Default: every check with no owner.")
    args = parser.parse_args(argv)
    try:
        if args.command == "copy":
            counts = copy_database(make_engine(args.source), make_engine(args.target or get_settings().database_url), args.owner)
            for name, count in counts.items():
                print(f"{name}: {count}")
            print("Copied. The SQLite file was left as it was.")
            if not args.owner:
                print("Copied checks have no owner yet, so nobody sees them. Run `claim USERNAME` to give them one.")
        else:
            changed = claim_unowned(make_engine(get_settings().database_url), args.username, args.check_ids or None)
            print(f"{changed} checks now belong to {args.username.strip().lower()}.")
    except TransferError as error:
        print(error, file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
