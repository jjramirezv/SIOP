# Analiza la imagen o el texto, prepara el contexto y consulta al modelo.
# Controla los errores y los traduce a respuestas HTTP.

from typing import Annotated

from fastapi import APIRouter, File, Form, UploadFile
from fastapi.responses import JSONResponse
from pydantic import ValidationError
from starlette.concurrency import run_in_threadpool

from app.schemas.assistant import (
    AssistantRequest,
    AssistantResponse,
    InventoryDraft,
    TranscriptionResponse,
)
from app.schemas.common import ErrorDetail, ErrorResponse, FieldIssue
from app.services.assistant_service import (
    AssistantFailure,
    ask_assistant,
)


from app.services.audio_validation import audio_mime
from app.services.transcription_service import transcribe_audio


router = APIRouter(tags=["assistant"])

MAX_IMAGE_BYTES = 5 * 1024 * 1024
MAX_AUDIO_BYTES = 10 * 1024 * 1024

ERRORS = {
    status: {"model": ErrorResponse}
    for status in (413, 415, 422, 502, 503, 504)
}


def failure_response(exc):
    body = ErrorResponse(
        error=ErrorDetail(
            code=exc.code,
            message=str(exc),
            details=[
                FieldIssue(field=exc.field, message=str(exc))
            ],
        )
    )

    return JSONResponse(
        status_code=exc.status,
        content=body.model_dump(mode="json"),
    )


def image_mime(data):
    if data.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png"

    if data.startswith(b"\xff\xd8\xff"):
        return "image/jpeg"

    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "image/webp"

    raise AssistantFailure(
        415,
        "UNSUPPORTED_MEDIA_TYPE",
        "Sube una imagen PNG, JPEG o WebP válida.",
        "file",
    )


@router.post(
    "/assistant/messages",
    response_model=AssistantResponse,
    responses=ERRORS,
    operation_id="message_api_v1_assistant_messages_post",
    openapi_extra={"x-implementation-status": "implemented"},
)
def messages(body: AssistantRequest):
    try:
        return ask_assistant(body)
    except AssistantFailure as exc:
        return failure_response(exc)


@router.post(
    "/assistant/extract-image",
    response_model=AssistantResponse,
    responses=ERRORS,
    operation_id="image_api_v1_assistant_extract_image_post",
    openapi_extra={"x-implementation-status": "implemented"},
)
async def image(
    file: Annotated[UploadFile, File()],
    draft: Annotated[str | None, Form()] = None,
    context: Annotated[str | None, Form(max_length=4000)] = None,
):
    try:
        try:
            data = await file.read(MAX_IMAGE_BYTES + 1)
        finally:
            await file.close()

        if len(data) > MAX_IMAGE_BYTES:
            raise AssistantFailure(
                413,
                "FILE_TOO_LARGE",
                "La imagen supera 5 MiB.",
                "file",
            )

        mime = image_mime(data)

        try:
            draft_text = draft.strip() if draft is not None else ""
            parsed_draft = (
                InventoryDraft.model_validate_json(draft_text)
                if draft_text else None
            )
        except ValidationError as exc:
            raise AssistantFailure(
                422,
                "VALIDATION_ERROR",
                "El campo draft debe ser un borrador JSON válido.",
                "draft",
            ) from exc

        body = AssistantRequest(
            message=context or (
                "Extrae los datos del ejercicio o cotización. "
                "Identifica lo ilegible y pide los datos faltantes."
            ),
            draft=parsed_draft,
        )

        return await run_in_threadpool(
            ask_assistant,
            body,
            (data, mime),
        )

    except AssistantFailure as exc:
        return failure_response(exc)

@router.post(
    "/assistant/transcribe",
    response_model=TranscriptionResponse,
    responses=ERRORS,
    operation_id="transcribe_api_v1_assistant_transcribe_post",
    summary="Transcribir una grabación",
    description=(
        "Recibe WebM, WAV PCM, MP3 o MP4/M4A hasta 10 MiB. "
        "Devuelve texto editable; el usuario debe revisarlo antes de enviarlo a messages. "
        "La interfaz de grabación debe limitarse a 60 segundos. "
        "El servidor valida tamaño y cabeceras; Gemini realiza la decodificación."
    ),
    openapi_extra={"x-implementation-status": "implemented"},
)
async def transcribe(file: Annotated[UploadFile, File()]):
    declared_type = file.content_type
    try:
        try:
            data = await file.read(MAX_AUDIO_BYTES + 1)
        finally:
            await file.close()
        if len(data) > MAX_AUDIO_BYTES:
            raise AssistantFailure(
                413, "FILE_TOO_LARGE", "El audio supera 10 MiB.", "file",
            )
        mime = audio_mime(data, declared_type)
        return await run_in_threadpool(transcribe_audio, data, mime)
    except AssistantFailure as exc:
        return failure_response(exc)
