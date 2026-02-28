from pydantic_settings import BaseSettings
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent


class Settings(BaseSettings):
    APP_NAME: str = "COSMEON FS-LITE"
    VERSION: str = "1.0.0"
    DEBUG: bool = True

    STORAGE_PATH: str = str(BASE_DIR / "storage")
    TEMP_PATH: str = str(BASE_DIR / "temp")
    DB_PATH: str = str(BASE_DIR / "fs_lite.db")

    CHUNK_SIZE_BYTES: int = 524288
    REPLICATION_FACTOR: int = 2
    NUM_NODES: int = 5

    HEARTBEAT_INTERVAL: int = 5
    INTEGRITY_CHECK_INTERVAL: int = 60

    CACHE_MAX_SIZE: int = 100

    DISTRIBUTION_STRATEGY: str = "round_robin"
    ENABLE_COMPRESSION: bool = True

    # JWT
    JWT_SECRET_KEY: str = "cosmeon-fs-lite-super-secret-jwt-key-change-in-production"
    JWT_ALGORITHM: str = "HS256"
    JWT_EXPIRE_MINUTES: int = 1440  # 24 hours

    # Seeded admin credentials
    ADMIN_USERNAME: str = "admin"
    ADMIN_EMAIL: str = "admin@cosmeon.space"
    ADMIN_PASSWORD: str = "CosmeonAdmin2026!"

    ALLOWED_ORIGINS: str = "http://localhost:3000,http://localhost:5173,http://localhost:8080,http://localhost:4200"

    @property
    def origins_list(self) -> list:
        return [o.strip() for o in self.ALLOWED_ORIGINS.split(",")]

    class Config:
        env_file = ".env"


settings = Settings()
