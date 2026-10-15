from functools import lru_cache
from pathlib import Path

from pydantic import SecretStr, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


PROJECT_ROOT = Path(__file__).resolve().parents[4]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=PROJECT_ROOT / '.env',
        env_file_encoding='utf-8-sig',
        extra='ignore',
    )

    app_name: str = 'SIOP'
    environment: str = 'development'
    api_prefix: str = '/api/v1'
    cors_origins: list[str] = [
        'http://localhost:5173', 'http://127.0.0.1:5173',
    ]
    openai_api_key: SecretStr | None = None
    openai_text_model: str = ''
    openai_transcription_model: str = ''

    @field_validator('openai_api_key', mode='before')
    @classmethod
    def empty_key_is_unconfigured(cls, value):
        return None if value == '' else value

    @field_validator('api_prefix')
    @classmethod
    def valid_prefix(cls, value: str) -> str:
        if not value.startswith('/') or value.endswith('/'):
            raise ValueError('API_PREFIX debe comenzar con / y no terminar con /.')
        return value


@lru_cache
def get_settings() -> Settings:
    return Settings()
