from fastapi import APIRouter

from app.schemas.analysis import AnalysisResponse
from app.schemas.common import ErrorResponse
from app.schemas.inventory import AnalysisRequest
from app.services.analysis_service import analyze


router = APIRouter(tags=['analyses'])


@router.post(
    '/analyses', response_model=AnalysisResponse,
    operation_id='analysis_api_v1_analyses_post',
    responses={422: {'model': ErrorResponse, 'description': 'Datos inválidos o fuera de rango.'}},
    summary='Calcular la mejor alternativa de compra',
    description='Motor real de descuentos sobre todas las unidades, con cantidades enteras factibles.',
    openapi_extra={'x-implementation-status': 'implemented'},
)
def create_analysis(body: AnalysisRequest) -> AnalysisResponse:
    return analyze(body)
