import os
import asyncio
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text, inspect

from app.config import settings
from app.database import engine, Base, SessionLocal, get_db_type

# ── Import ALL models here so Base.metadata knows about every table ──────────
from app.models import user        # noqa: F401
from app.models import node        # noqa: F401
from app.models import file_record # noqa: F401
from app.models import chunk       # noqa: F401

from app.api.v1 import files, nodes, system, auth
from app.services.node_service import initialize_nodes
from app.services.auth_services import seed_admin
from app.services.heartbeat import heartbeat_loop
from app.services.integrity_checker import integrity_check_loop

Base.metadata.create_all(bind=engine)


def _migrate_user_columns():
    """
    Add security_question + security_answer_hash columns to existing
    users table if they don't exist yet.
    Handles SQLite (no IF NOT EXISTS for ALTER TABLE) and MySQL.
    """
    inspector = inspect(engine)
    existing_columns = {col["name"] for col in inspector.get_columns("users")}

    new_columns = {
        "security_question": "VARCHAR(500)",
        "security_answer_hash": "VARCHAR(255)",
    }

    with engine.connect() as conn:
        for col_name, col_type in new_columns.items():
            if col_name not in existing_columns:
                try:
                    conn.execute(
                        text(f"ALTER TABLE users ADD COLUMN {col_name} {col_type}")
                    )
                    conn.commit()
                    print(f"[MIGRATION] Added column: users.{col_name}")
                except Exception as e:
                    print(f"[MIGRATION] Column users.{col_name} — {e}")


@asynccontextmanager
async def lifespan(app: FastAPI):
    # ── Startup ───────────────────────────────────────────────────────────
    os.makedirs(settings.STORAGE_PATH, exist_ok=True)
    os.makedirs(settings.TEMP_PATH, exist_ok=True)

    # Run column migration for existing databases
    _migrate_user_columns()

    # Validate production secrets
    settings.validate_production_secrets()

    db = SessionLocal()
    try:
        seed_admin(db)          # creates admin account if none exists
        initialize_nodes(db)    # creates node folders if none exist
    finally:
        db.close()

    heartbeat_task = asyncio.create_task(heartbeat_loop())
    integrity_task = asyncio.create_task(integrity_check_loop())

    print(f"[STARTUP] {settings.APP_NAME} v{settings.VERSION} — ready")
    print(f"[STARTUP] Database: {get_db_type().upper()}")
    print(f"[STARTUP] Storage backend: {settings.STORAGE_BACKEND.upper()}")

    yield

    # ── Shutdown ──────────────────────────────────────────────────────────
    heartbeat_task.cancel()
    integrity_task.cancel()
    for task in [heartbeat_task, integrity_task]:
        try:
            await task
        except asyncio.CancelledError:
            pass


app = FastAPI(
    title=settings.APP_NAME,
    version=settings.VERSION,
    description="COSMEON FS-LITE: Orbital Distributed File System Simulation",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.origins_list,
    allow_credentials=True,
    # Restricted methods — no PUT/PATCH needed, reduces attack surface
    allow_methods=["GET", "POST", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/api/v1")
app.include_router(files.router, prefix="/api/v1")
app.include_router(nodes.router, prefix="/api/v1")
app.include_router(system.router, prefix="/api/v1")


@app.get("/")
def root():
    return {
        "system": settings.APP_NAME,
        "version": settings.VERSION,
        "status": "operational",
        "docs": "/docs",
        "api_base": "/api/v1",
    }
