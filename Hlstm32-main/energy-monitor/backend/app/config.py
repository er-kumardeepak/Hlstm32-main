"""Application configuration loaded from environment / .env file."""
from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # Application
    APP_NAME: str = "Energy Monitoring System"
    APP_VERSION: str = "1.0.0"
    DEBUG: bool = True

    # Database — switch between SQLite (dev fallback) and PostgreSQL via env
    DATABASE_URL: str = "sqlite:///./energy_monitor.db"

    # CORS
    ALLOWED_ORIGINS: str = "http://localhost:5173"

    # Device auth (optional). If set, device clients on /ws/device must send
    # an {"type": "auth", "data": {"api_key": "..."}} handshake first.
    DEVICE_API_KEY: str = ""

    # Alert thresholds
    LOW_VOLTAGE_THRESHOLD: float = 200.0
    HIGH_VOLTAGE_THRESHOLD: float = 250.0
    EM2M_MAX_CURRENT: float = 10.0
    EM2M_MAX_POWER: float = 2200.0
    EM4M_MAX_CURRENT: float = 20.0
    EM4M_MAX_POWER: float = 5000.0

    # Device / alert behaviour
    DEVICE_OFFLINE_SECONDS: int = 30
    ALERT_COOLDOWN_SECONDS: int = 300

    # ML preparation (not used yet — see backend/app/ml/README.md)
    ML_ENABLED: bool = False

    @property
    def allowed_origins_list(self) -> list[str]:
        return [o.strip() for o in self.ALLOWED_ORIGINS.split(",") if o.strip()]

    @property
    def is_sqlite(self) -> bool:
        return self.DATABASE_URL.startswith("sqlite")


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
