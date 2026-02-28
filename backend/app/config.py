from pydantic_settings import BaseSettings
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent


class Settings(BaseSettings):
    APP_NAME: str = "COSMEON FS-LITE"
    VERSION: str = "1.0.0"
    DEBUG: bool = True

    # Paths
    STORAGE_PATH: str = str(BASE_DIR / "storage")
    TEMP_PATH: str = str(BASE_DIR / "temp")
    DB_PATH: str = str(BASE_DIR / "fs_lite.db")

    # Chunking & Replication
    CHUNK_SIZE_BYTES: int = 524288  # 512KB
    REPLICATION_FACTOR: int = 2
    NUM_NODES: int = 5

    # Heartbeat
    HEARTBEAT_INTERVAL: int = 5  # seconds

    # LRU Cache
    CACHE_MAX_SIZE: int = 100

    # CORS origins for frontend integration
    ALLOWED_ORIGINS: str = "http://localhost:3000,http://localhost:5173,http://localhost:8080,http://localhost:4200"

    @property
    def origins_list(self) -> list:
        return [o.strip() for o in self.ALLOWED_ORIGINS.split(",")]

    class Config:
        env_file = ".env"


settings = Settings()
