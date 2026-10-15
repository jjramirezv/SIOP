from dataclasses import dataclass
from decimal import Decimal
from typing import Literal


class CalculationError(ValueError):
    def __init__(self, message: str, field: str = '$'):
        super().__init__(message)
        self.field = field


@dataclass(frozen=True)
class PriceTier:
    min_quantity: int
    unit_price: Decimal


@dataclass(frozen=True)
class NormalizedProblem:
    annual_demand: Decimal
    order_cost: Decimal
    holding_mode: Literal['fixed', 'percentage']
    annual_holding_value: Decimal
    days_per_year: int
    tiers: tuple[PriceTier, ...]


@dataclass(frozen=True)
class CostBreakdown:
    purchase: Decimal
    ordering: Decimal
    holding: Decimal
    total: Decimal


@dataclass(frozen=True)
class EvaluatedOrder:
    tier_index: int
    quantity: int
    unit_price: Decimal
    annual_holding_per_unit: Decimal
    investment_per_order: Decimal
    orders_per_year: Decimal
    cycle_days: Decimal
    costs: CostBreakdown


@dataclass(frozen=True)
class EvaluatedCandidate:
    tier_index: int
    min_quantity: int
    max_quantity_exclusive: int | None
    unit_price: Decimal
    annual_holding_per_unit: Decimal
    theoretical_eoq: Decimal
    status: Literal['feasible', 'adjusted', 'excluded']
    order: EvaluatedOrder | None
    reason: str


@dataclass(frozen=True)
class Solution:
    candidates: tuple[EvaluatedCandidate, ...]
    recommended: EvaluatedOrder
