import os
import asyncio
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.database import engine, Base, SessionLocal

# ── Import ALL models here so Base.metadata knows about every table ──────────
# This must happen BEFORE Base.metadata.create_all()
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


@asynccontextmanager
async def lifespan(app: FastAPI):
    os.makedirs(settings.STORAGE_PATH, exist_ok=True)
    os.makedirs(settings.TEMP_PATH, exist_ok=True)

    db = SessionLocal()
    try:
        seed_admin(db)          # creates admin account if none exists
        initialize_nodes(db)    # creates node folders if none exist
    finally:
        db.close()

    heartbeat_task = asyncio.create_task(heartbeat_loop())
    integrity_task = asyncio.create_task(integrity_check_loop())

    yield

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
    allow_methods=["*"],
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
