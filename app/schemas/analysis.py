from math import isclose
from typing import Annotated, Literal

from pydantic import Field, model_validator

from app.schemas.common import (
    ContractModel, NonNegativeNumber, PositiveNumber, PositiveQuantity,
)
from app.schemas.inventory import AnalysisRequest, HoldingCost


class AnnualHoldingCost(HoldingCost):
    period: Literal['year'] = 'year'


class NormalizedInput(ContractModel):
    annual_demand: PositiveNumber
    days_per_year: Annotated[int, Field(ge=1, le=366)]
    holding_cost: AnnualHoldingCost


class AnnualCosts(ContractModel):
    purchase: NonNegativeNumber
    ordering: NonNegativeNumber
    holding: NonNegativeNumber
    total: NonNegativeNumber

    @model_validator(mode='after')
    def validate_sum(self):
        if not isclose(self.purchase + self.ordering + self.holding,
                       self.total, rel_tol=1e-10, abs_tol=1e-7):
            raise ValueError('El total debe coincidir con compra + pedidos + mantenimiento.')
        return self


class Candidate(ContractModel):
    tier_index: Annotated[int, Field(ge=0)]
    min_quantity: Annotated[int, Field(ge=0)]
    max_quantity_exclusive: PositiveQuantity | None
    unit_price: PositiveNumber
    annual_holding_per_unit: PositiveNumber
    theoretical_eoq: PositiveNumber
    status: Literal['feasible', 'adjusted', 'excluded']
    evaluated_quantity: PositiveQuantity | None
    annual_costs: AnnualCosts | None
    reason: str

    @model_validator(mode='after')
    def validate_evaluated_candidate(self):
        if self.status == 'excluded':
            if self.evaluated_quantity is not None or self.annual_costs is not None:
                raise ValueError('Un candidato excluido no debe incluir cantidad ni costos evaluados.')
        else:
            if self.evaluated_quantity is None or self.annual_costs is None:
                raise ValueError('Un candidato permitido requiere cantidad y costos.')
            if self.evaluated_quantity < self.min_quantity:
                raise ValueError('La cantidad no alcanza el mínimo de su descuento.')
            if (self.max_quantity_exclusive is not None
                    and self.evaluated_quantity >= self.max_quantity_exclusive):
                raise ValueError('La cantidad pertenece al siguiente tramo.')
        return self


class OrderEvaluation(ContractModel):
    tier_index: Annotated[int, Field(ge=0)]
    quantity: PositiveQuantity
    unit_price: PositiveNumber
    annual_holding_per_unit: PositiveNumber
    investment_per_order: PositiveNumber
    orders_per_year: PositiveNumber
    cycle_days: PositiveNumber
    annual_costs: AnnualCosts


class CurrentComparison(ContractModel):
    current: OrderEvaluation
    annual_savings: float
    savings_percentage: float


class CalculationStep(ContractModel):
    title: str
    formula: str
    substitution: str
    result: str


class AnalysisResponse(ContractModel):
    contract_version: Literal['1.0.0'] = '1.0.0'
    model: Literal['all_units_discount'] = 'all_units_discount'
    data_source: Literal['calculated', 'reference_example']
    input: AnalysisRequest
    normalized: NormalizedInput
    candidates: list[Candidate] = Field(min_length=1)
    recommended: OrderEvaluation
    comparison: CurrentComparison | None
    assumptions: list[str]
    steps: list[CalculationStep]
