from fastapi import APIRouter

from app.schemas.common import HealthResponse
from app.core.config import get_settings


router = APIRouter(tags=['health'])


@router.get('/health', response_model=HealthResponse)
def health() -> HealthResponse:
    settings = get_settings()
    return HealthResponse(ai_available=bool(
        settings.gemini_api_key and settings.gemini_api_key.get_secret_value().strip()
        and settings.gemini_text_model.strip()
    ))
