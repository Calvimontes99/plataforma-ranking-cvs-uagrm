import os
from collections.abc import Generator
from contextlib import contextmanager

from sqlalchemy import create_engine, text
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session, sessionmaker

from app.models import Base


def database_url() -> str:
    return os.getenv(
        "DATABASE_URL",
        "postgresql+psycopg://cqrs_read:cqrs_read@localhost:5432/cqrs",
    )


def report_database_url() -> str:
    return os.getenv("REPORT_DATABASE_URL", database_url())


def build_engine(url: str | None = None) -> Engine:
    target = url or database_url()
    return create_engine(target, pool_pre_ping=True, future=True)


engine = build_engine()
report_engine = build_engine(report_database_url())
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


def initialize_schema(target_engine: Engine = engine) -> None:
    Base.metadata.create_all(target_engine)


@contextmanager
def readonly_session(target_engine: Engine | None = None) -> Generator[Session, None, None]:
    """Yield a session whose PostgreSQL transaction is explicitly read-only."""
    session = Session(bind=target_engine or report_engine, autoflush=False, expire_on_commit=False)
    try:
        connection = session.connection()
        if connection.dialect.name == "postgresql":
            connection.execute(text("SET TRANSACTION READ ONLY"))
        yield session
    finally:
        session.close()
