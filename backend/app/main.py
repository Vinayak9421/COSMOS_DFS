import os
import asyncio
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.database import engine, Base, SessionLocal
from app.api.v1 import files, nodes, system
from app.services.node_service import initialize_nodes
from app.services.heartbeat import heartbeat_loop
from app.services.integrity_checker import integrity_check_loop

Base.metadata.create_all(bind=engine)


@asynccontextmanager
async def lifespan(app: FastAPI):
    os.makedirs(settings.STORAGE_PATH, exist_ok=True)
    os.makedirs(settings.TEMP_PATH, exist_ok=True)

    db = SessionLocal()
    try:
        initialize_nodes(db)
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
