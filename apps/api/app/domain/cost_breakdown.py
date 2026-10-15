from bisect import bisect_right
from decimal import Decimal, localcontext

from app.domain.models import CalculationError, CostBreakdown, EvaluatedOrder, NormalizedProblem


def holding_per_unit(problem: NormalizedProblem, tier_index: int) -> Decimal:
    if problem.holding_mode == 'fixed':
        return problem.annual_holding_value
    return problem.annual_holding_value * problem.tiers[tier_index].unit_price / 100


def evaluate_order(problem: NormalizedProblem, quantity: int) -> EvaluatedOrder:
    if isinstance(quantity, bool) or not isinstance(quantity, int) or quantity < 1:
        raise CalculationError('La cantidad debe ser un entero positivo.', 'current_order_quantity')
    tier_index = bisect_right([tier.min_quantity for tier in problem.tiers], quantity) - 1
    if tier_index < 0:
        raise CalculationError('La cantidad no pertenece a un tramo de precios.', 'discount_tiers')
    with localcontext() as context:
        context.prec = 50
        q = Decimal(quantity)
        price = problem.tiers[tier_index].unit_price
        h = holding_per_unit(problem, tier_index)
        purchase = price * problem.annual_demand
        ordering = problem.order_cost * problem.annual_demand / q
        holding = h * q / 2
        return EvaluatedOrder(
            tier_index=tier_index, quantity=quantity,
            unit_price=price, annual_holding_per_unit=h,
            investment_per_order=q * price,
            orders_per_year=problem.annual_demand / q,
            cycle_days=q / problem.annual_demand * problem.days_per_year,
            costs=CostBreakdown(
                purchase=purchase, ordering=ordering, holding=holding,
                total=purchase + ordering + holding,
            ),
        )
