"""
Database access for the API. The engine is created on first use, so importing this
module never connects. Alembic keeps its own connection setup.

Assumes core.config.settings has DATABASE_URL, or that DATABASE_URL is an environment
variable. Special characters in the password must be percent-encoded in the URL.

Call warm_up() once at app start so the first visitor does not pay for creating the
engine and opening the first connection.
"""
import os
import threading

from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

_engine = None
_Session = None
_init_lock = threading.Lock()


def _database_url() -> str:
    url = None
    try:
        from core.config import settings
        url = getattr(settings, "DATABASE_URL", None)
    except Exception:
        pass
    url = url or os.environ.get("DATABASE_URL")
    if not url:
        raise RuntimeError("DATABASE_URL is not set")
    if url.startswith("postgres://"):
        url = "postgresql://" + url[len("postgres://"):]
    return url


def _init_engine() -> None:
    """Create the engine and session factory once. The lock matters because routes call
    the database from threadpool threads, so two first requests can arrive together."""
    global _engine, _Session
    with _init_lock:
        if _Session is not None:
            return
        engine = create_engine(
            _database_url(),
            pool_pre_ping=True,       # the Supabase pooler drops idle connections
            pool_recycle=300,         # replace connections before the pooler drops them
            pool_size=5,
            max_overflow=2,
            pool_timeout=10,          # fail in 10 s instead of waiting 30 s for a free connection
            connect_args={"connect_timeout": 10},   # libpq option: give up connecting after 10 s
        )
        _engine = engine
        _Session = sessionmaker(bind=engine, expire_on_commit=False)


def get_session():
    """Return a new Session. Use as: with get_session() as db: ..."""
    if _Session is None:
        _init_engine()
    return _Session()


def warm_up() -> None:
    """Create the engine and open one connection now. Raises if the database is
    unreachable, so the caller should wrap it in try/except at startup."""
    with get_session() as db:
        db.execute(text("select 1"))
