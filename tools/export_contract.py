"""Export the agreed API contract; this module is not a runnable server."""
import json
from pathlib import Path
import sys
from typing import Annotated

from fastapi import FastAPI, File, Form, UploadFile

API_ROOT = Path(__file__).resolve().parents[1]
PROJECT_ROOT = API_ROOT.parents[1]
sys.path.insert(0, str(API_ROOT))

from app.routes.health import router as health_router
from app.routes.analyses import router as analyses_router
from app.schemas.analysis import AnalysisResponse
from app.schemas.assistant import AssistantRequest, AssistantResponse, TranscriptionResponse
from app.schemas.common import ErrorResponse
from app.schemas.inventory import AnalysisRequest


def generate_contract() -> dict:
    contract = FastAPI(
        title='SIOP - Contrato de integración', version='1.0.0',
        description=(
            'Contrato acordado para frontend y backend. Salud y análisis están implementados. '
            'Las operaciones del asistente están planificadas y NO están montadas en app.main.'
        ),
    )
    contract.include_router(health_router, prefix='/api/v1')
    contract.include_router(analyses_router, prefix='/api/v1')
    errors = {422: {'model': ErrorResponse, 'description': 'Datos inválidos.'}}

    def message(body: AssistantRequest) -> AssistantResponse:
        raise NotImplementedError('Operación de contrato; no es una implementación.')

    def image(file: Annotated[UploadFile, File()],
              draft: Annotated[str | None, Form()] = None) -> AssistantResponse:
        raise NotImplementedError('Operación de contrato; no es una implementación.')

    def transcribe(file: Annotated[UploadFile, File()]) -> TranscriptionResponse:
        raise NotImplementedError('Operación de contrato; no es una implementación.')

    descriptions = [
        ('/assistant/messages', message, AssistantResponse, 'Interpretar texto o explicar un escenario.'),
        ('/assistant/extract-image', image, AssistantResponse,
         'Interpretar una imagen. draft es JSON serializado del borrador opcional.'),
        ('/assistant/transcribe', transcribe, TranscriptionResponse, 'Transcribir un mensaje grabado.'),
    ]
    for path, endpoint, response_model, description in descriptions:
        contract.add_api_route(
            '/api/v1' + path, endpoint, methods=['POST'],
            response_model=response_model, responses=errors,
            description=description + ' Estado: planificado, aún no implementado.',
            openapi_extra={'x-implementation-status': 'planned'},
        )

    document = contract.openapi()
    document['servers'] = [{'url': 'http://127.0.0.1:8000'}]
    document['paths']['/api/v1/health']['get']['x-implementation-status'] = 'implemented'
    for path in ('/api/v1/assistant/extract-image', '/api/v1/assistant/transcribe'):
        operation = document['paths'][path]['post']
        for status, description in {
            '413': 'Archivo demasiado grande.', '415': 'Formato no admitido.',
            '502': 'Error del proveedor.', '503': 'Asistente no configurado.',
            '504': 'Tiempo de espera agotado.',
        }.items():
            operation['responses'][status] = {
                'description': description,
                'content': {'application/json': {'schema': {'$ref': '#/components/schemas/ErrorResponse'}}},
            }
    for name, path in [('analysis', '/api/v1/analyses'),
                       ('assistant', '/api/v1/assistant/messages')]:
        examples = PROJECT_ROOT / 'contracts/examples'
        operation = document['paths'][path]['post']
        operation['requestBody']['content']['application/json']['example'] = json.loads(
            (examples / f'{name}-request.json').read_text(encoding='utf-8'))
        operation['responses']['200']['content']['application/json']['example'] = json.loads(
            (examples / f'{name}-response.json').read_text(encoding='utf-8'))
    return document


if __name__ == '__main__':
    target = PROJECT_ROOT / 'contracts/openapi.json'
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(generate_contract(), ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    schemas = {
        'analysis-request': AnalysisRequest, 'analysis-response': AnalysisResponse,
        'assistant-request': AssistantRequest, 'assistant-response': AssistantResponse,
        'transcription-response': TranscriptionResponse, 'error-response': ErrorResponse,
    }
    for name, model in schemas.items():
        schema_path = PROJECT_ROOT / 'contracts/schemas' / f'{name}.schema.json'
        schema_path.parent.mkdir(parents=True, exist_ok=True)
        schema = model.model_json_schema(mode='validation')
        schema['$schema'] = 'https://json-schema.org/draft/2020-12/schema'
        schema_path.write_text(json.dumps(schema, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(f'Contrato exportado: {target}')
