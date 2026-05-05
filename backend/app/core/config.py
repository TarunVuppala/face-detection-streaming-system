from functools import lru_cache

from pydantic import AnyUrl
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    database_url: str = (
        "postgresql+asyncpg://postgres:root@localhost:5432/face_detection_streaming_system"
    )
    frontend_origin: AnyUrl | str = "http://localhost:5173"
    app_name: str = "Face Detection Streaming API"

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")


@lru_cache
def get_settings() -> Settings:
    return Settings()
