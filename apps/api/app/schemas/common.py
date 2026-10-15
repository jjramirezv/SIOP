from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field


CONTRACT_VERSION = '1.0.0'
PositiveNumber = Annotated[float, Field(gt=0)]
NonNegativeNumber = Annotated[float, Field(ge=0)]
PositiveQuantity = Annotated[int, Field(gt=0)]
Period = Literal['day', 'month', 'year']


class ContractModel(BaseModel):
    model_config = ConfigDict(
        extra='forbid', strict=True, allow_inf_nan=False,
        str_strip_whitespace=True, validate_default=True,
    )


class HealthResponse(ContractModel):
    status: Literal['ok'] = 'ok'
    service: str = 'SIOP API'
    contract_version: Literal['1.0.0'] = CONTRACT_VERSION
    ai_available: bool = False


class FieldIssue(ContractModel):
    field: str = Field(min_length=1)
    message: str = Field(min_length=1)


class ErrorDetail(ContractModel):
    code: Literal[
        'VALIDATION_ERROR', 'FILE_TOO_LARGE', 'UNSUPPORTED_MEDIA_TYPE',
        'ASSISTANT_UNAVAILABLE', 'UPSTREAM_ERROR', 'UPSTREAM_TIMEOUT',
    ]
    message: str
    details: list[FieldIssue] = Field(default_factory=list)
    retryable: bool = False
    retry_after_seconds: Annotated[int, Field(ge=0, le=86400)] | None = None


class ErrorResponse(ContractModel):
    error: ErrorDetail
