from pydantic_settings import BaseSettings
from pydantic import field_validator
from functools import lru_cache
from pathlib import Path

ENV_FILE = Path(__file__).parent.parent.parent / ".env"


class Settings(BaseSettings):
    finnhub_api_key: str
    newsapi_key: str
    reddit_client_id: str
    reddit_client_secret: str
    reddit_user_agent: str
    fred_api_key: str

    alpaca_api_key: str
    alpaca_secret_key: str
    alpaca_base_url: str = "https://paper-api.alpaca.markets"

    groq_api_key: str
    openai_api_key: str = ""
    gemini_api_key: str = ""

    database_url: str
    redis_url: str

    env: str = "development"
    log_level: str = "INFO"

    @field_validator("database_url", mode="before")
    @classmethod
    def fix_db_url(cls, v: str) -> str:
        v = v.replace("postgres://", "postgresql+asyncpg://")
        v = v.replace("postgresql://", "postgresql+asyncpg://")
        return v

    model_config = {
        "env_file": str(ENV_FILE),
        "env_file_encoding": "utf-8",
        "extra": "ignore",
    }


@lru_cache
def get_settings() -> Settings:
    return Settings()
