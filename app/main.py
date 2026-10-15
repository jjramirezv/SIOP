from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.core.config import get_settings
from app.routes.health import router as health_router
from app.schemas.common import ErrorDetail, ErrorResponse, FieldIssue


settings = get_settings()
app = FastAPI(
    title=f'{settings.app_name} API',
    version='0.1.0',
    description='Base operativa de SIOP. Los contratos de análisis y asistente están en contracts/.',
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=False,
    allow_methods=['GET', 'POST'],
    allow_headers=['Content-Type'],
)
app.include_router(health_router, prefix=settings.api_prefix)


@app.exception_handler(RequestValidationError)
async def validation_error_handler(request: Request, exc: RequestValidationError):
    details = [
        FieldIssue(
            field='.'.join(str(part) for part in error['loc'] if part != 'body') or '$',
            message=error['msg'],
        )
        for error in exc.errors()
    ]
    response = ErrorResponse(error=ErrorDetail(
        code='VALIDATION_ERROR',
        message='Revisa los campos indicados antes de continuar.',
        details=details,
    ))
    return JSONResponse(status_code=422, content=response.model_dump(mode='json'))
