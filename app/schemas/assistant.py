from typing import Annotated, Literal

from pydantic import Field, model_validator

from app.schemas.common import ContractModel, FieldIssue, Period, PositiveNumber, PositiveQuantity
from app.schemas.inventory import AnalysisRequest


class DraftDemand(ContractModel):
    value: PositiveNumber | None = None
    period: Period | None = None


class DraftHoldingCost(ContractModel):
    mode: Literal['fixed', 'percentage'] | None = None
    value: PositiveNumber | None = None
    period: Period | None = None


class DraftTier(ContractModel):
    min_quantity: Annotated[int, Field(ge=0)] | None = None
    unit_price: PositiveNumber | None = None


class InventoryDraft(ContractModel):
    product_name: str | None = Field(default=None, min_length=1, max_length=120)
    currency: str | None = Field(default=None, pattern=r'^[A-Z]{3}$')
    demand: DraftDemand | None = None
    order_cost: PositiveNumber | None = None
    holding_cost: DraftHoldingCost | None = None
    days_per_year: Annotated[int, Field(ge=1, le=366)] | None = None
    discount_tiers: list[DraftTier] | None = Field(default=None, min_length=1, max_length=20)
    current_order_quantity: PositiveQuantity | None = None


class ChatMessage(ContractModel):
    role: Literal['user', 'assistant']
    content: str = Field(min_length=1, max_length=4000)


class AssistantRequest(ContractModel):
    message: str = Field(min_length=1, max_length=4000)
    draft: InventoryDraft | None = None
    analysis_input: AnalysisRequest | None = None
    history: list[ChatMessage] = Field(default_factory=list, max_length=10)


class AssistantResponse(ContractModel):
    contract_version: Literal['1.0.0'] = '1.0.0'
    data_source: Literal['assistant', 'reference_example']
    message: str = Field(min_length=1)
    action: Literal['clarify', 'review_input', 'explain', 'review_scenario']
    proposed_input: InventoryDraft | None
    missing_fields: list[FieldIssue]
    review_fields: list[FieldIssue]
    requires_confirmation: bool

    @model_validator(mode='after')
    def proposal_requires_review(self):
        if self.proposed_input is not None and not self.requires_confirmation:
            raise ValueError('Los datos propuestos requieren revisión del usuario.')
        if self.action in ('review_input', 'review_scenario') and self.proposed_input is None:
            raise ValueError('La acción requiere un borrador propuesto.')
        return self


class TranscriptionResponse(ContractModel):
    text: str = Field(min_length=1)
    language: str | None = None
