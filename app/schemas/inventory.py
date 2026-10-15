from typing import Annotated, Literal

from pydantic import Field, field_validator

from app.schemas.common import ContractModel, Period, PositiveNumber, PositiveQuantity


class Demand(ContractModel):
    value: PositiveNumber
    period: Period


class HoldingCost(ContractModel):
    mode: Literal['fixed', 'percentage']
    value: PositiveNumber
    period: Period


class DiscountTier(ContractModel):
    min_quantity: Annotated[int, Field(ge=0)]
    unit_price: PositiveNumber


class AnalysisRequest(ContractModel):
    product_name: str = Field(min_length=1, max_length=120)
    currency: str = Field(pattern=r'^[A-Z]{3}$')
    demand: Demand
    order_cost: PositiveNumber
    holding_cost: HoldingCost
    days_per_year: Annotated[int, Field(ge=1, le=366)]
    discount_tiers: list[DiscountTier] = Field(min_length=1, max_length=20)
    current_order_quantity: PositiveQuantity | None = None

    @field_validator('discount_tiers')
    @classmethod
    def validate_tier_order(cls, tiers: list[DiscountTier]) -> list[DiscountTier]:
        if tiers[0].min_quantity != 0:
            raise ValueError('El primer tramo debe comenzar en 0 unidades.')
        for previous, current in zip(tiers, tiers[1:]):
            if current.min_quantity <= previous.min_quantity:
                raise ValueError('Las cantidades mínimas deben ser únicas y crecientes.')
            if current.unit_price > previous.unit_price:
                raise ValueError('Los precios deben mantenerse o bajar al aumentar la cantidad.')
        return tiers
