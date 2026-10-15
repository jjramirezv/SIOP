from functools import lru_cache
from pathlib import Path

from pydantic import SecretStr, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


PROJECT_ROOT = Path(__file__).resolve().parents[4]
API_ROOT = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(PROJECT_ROOT / '.env', API_ROOT / '.env'),
        env_file_encoding='utf-8-sig',
        extra='ignore',
    )

    app_name: str = 'SIOP'
    environment: str = 'development'
    api_prefix: str = '/api/v1'
    cors_origins: list[str] = [
        'http://localhost:5173', 'http://127.0.0.1:5173',
    ]
    gemini_api_key: SecretStr | None = None
    gemini_text_model: str = ''

    @field_validator('gemini_api_key', mode='before')
    @classmethod
    def empty_key_is_unconfigured(cls, value):
        if isinstance(value, str) and not value.strip():
            return None
        return value

    @field_validator('api_prefix')
    @classmethod
    def valid_prefix(cls, value: str) -> str:
        if not value.startswith('/') or value.endswith('/'):
            raise ValueError('API_PREFIX debe comenzar con / y no terminar con /.')
        return value


@lru_cache
def get_settings() -> Settings:
    return Settings()
