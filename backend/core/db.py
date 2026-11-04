"""
Database access for the API. The engine is created on first use, so importing this
module never connects. Alembic keeps its own connection setup.

Assumes core.config.settings has DATABASE_URL, or that DATABASE_URL is an environment
variable. Special characters in the password must be percent-encoded in the URL.
"""
import os

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

_engine = None
_Session = None


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


def get_session():
    """Return a new Session. Use as: with get_session() as db: ..."""
    global _engine, _Session
    if _Session is None:
        _engine = create_engine(
            _database_url(),
            pool_pre_ping=True,   # the Supabase pooler drops idle connections
            pool_size=3,
            max_overflow=0,
        )
        _Session = sessionmaker(bind=_engine, expire_on_commit=False)
    return _Session()
