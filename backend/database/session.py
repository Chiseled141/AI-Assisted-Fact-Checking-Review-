from collections.abc import Iterator

from sqlalchemy import create_engine
from sqlalchemy.engine import Engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker
from sqlalchemy.pool import StaticPool

from config.settings import get_settings


class Base(DeclarativeBase):
    pass


def make_engine(url: str) -> Engine:
    if url.startswith("sqlite"):
        # The pipeline writes from a worker thread while requests read.
        args: dict = {"connect_args": {"check_same_thread": False}}
        if ":memory:" in url:
            args["poolclass"] = StaticPool
        return create_engine(url, **args)
    # Times are stored and read back in UTC, whatever the server's own time zone is.
    return create_engine(url, pool_pre_ping=True, connect_args={"options": "-c timezone=utc"})


engine = make_engine(get_settings().database_url)
SessionLocal = sessionmaker(bind=engine, expire_on_commit=False)


def get_session() -> Iterator[Session]:
    with SessionLocal() as session:
        yield session
