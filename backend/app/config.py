import os
from pydantic_settings import BaseSettings
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent


class Settings(BaseSettings):
    APP_NAME: str = "COSMEON FS-LITE"
    VERSION: str = "1.1.0"
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

    # ── JWT ────────────────────────────────────────────────────────────────
    # CRITICAL: Override in .env for production. Never ship the default.
    JWT_SECRET_KEY: str = "cosmeon-fs-lite-super-secret-jwt-key-change-in-production"
    JWT_ALGORITHM: str = "HS256"
    JWT_EXPIRE_MINUTES: int = 1440  # 24 hours

    # ── Seeded admin credentials ──────────────────────────────────────────
    ADMIN_USERNAME: str = "admin"
    ADMIN_EMAIL: str = "admin@cosmeon.space"
    ADMIN_PASSWORD: str = "CosmeonAdmin2026!"

    # ── CORS ──────────────────────────────────────────────────────────────
    ALLOWED_ORIGINS: str = "http://localhost:3000,http://localhost:5173,http://localhost:8080,http://localhost:4200"

    # ── Rate limiting ─────────────────────────────────────────────────────
    MAX_LOGIN_ATTEMPTS: int = 5
    LOCKOUT_MINUTES: int = 15

    # ── Upload limits ─────────────────────────────────────────────────────
    MAX_FILE_SIZE_MB: int = 500  # per file

    # ── Storage backend ───────────────────────────────────────────────────
    # "local" (default) or "s3"
    STORAGE_BACKEND: str = "local"
    AWS_S3_BUCKET: str = ""
    AWS_REGION: str = "ap-south-1"

    @property
    def origins_list(self) -> list:
        return [o.strip() for o in self.ALLOWED_ORIGINS.split(",")]

    @property
    def max_file_size_bytes(self) -> int:
        return self.MAX_FILE_SIZE_MB * 1024 * 1024

    def validate_production_secrets(self):
        """Called at startup — warns about default secrets."""
        warnings = []
        if not self.DEBUG:
            if "change-in-production" in self.JWT_SECRET_KEY:
                warnings.append(
                    "⚠  JWT_SECRET_KEY is still the default! Set it in .env for production."
                )
            if self.ADMIN_PASSWORD == "CosmeonAdmin2026!":
                warnings.append(
                    "⚠  ADMIN_PASSWORD is still the default! Set it in .env for production."
                )
        for w in warnings:
            print(f"[SECURITY WARNING] {w}")
        return warnings

    class Config:
        env_file = ".env"


settings = Settings()
