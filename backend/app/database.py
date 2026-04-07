import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base
from app.config import settings

# ── Database URL ─────────────────────────────────────────────────────────────
# LOCAL DEV  : sqlite:///./fs_lite.db  (auto-detected if DATABASE_URL not set)
# AWS PROD   : mysql+pymysql://user:pass@rds-endpoint:3306/cosmeon_dfs
#
# To switch to MySQL: set DATABASE_URL in your .env or EC2/ECS environment.
# Zero code changes required — SQLAlchemy handles the rest.
# ─────────────────────────────────────────────────────────────────────────────

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    f"sqlite:///{settings.DB_PATH}",  # local dev fallback
)

_is_sqlite = DATABASE_URL.startswith("sqlite")

# SQLite requires check_same_thread=False (multi-threaded FastAPI).
# MySQL/PostgreSQL do NOT accept this argument — only pass it for SQLite.
connect_args = {"check_same_thread": False} if _is_sqlite else {}

engine = create_engine(
    DATABASE_URL,
    connect_args=connect_args,
    # ── Connection pooling tweaks (important for AWS RDS) ──────────────────
    pool_pre_ping=True,   # validates connection before use — handles RDS 8h idle timeout
    pool_recycle=1800,    # recycle connections every 30 min (avoids stale MySQL connections)
    # SQLite doesn't use a real connection pool, so these are ignored for local dev
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def get_db_type() -> str:
    """Returns 'sqlite' or 'mysql' — useful for migration helpers."""
    return "sqlite" if _is_sqlite else "mysql"
