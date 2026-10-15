from decimal import Decimal, ROUND_CEILING, ROUND_FLOOR

from app.domain.models import CalculationError, EvaluatedOrder


def integer_candidates(eoq: Decimal, minimum: int, upper_exclusive: int | None) -> tuple[int, ...]:
    lower = max(1, minimum)
    options = {
        lower,
        max(lower, int(eoq.to_integral_value(rounding=ROUND_FLOOR))),
        max(lower, int(eoq.to_integral_value(rounding=ROUND_CEILING))),
    }
    if upper_exclusive is not None:
        options.add(upper_exclusive - 1)
    return tuple(sorted(q for q in options if q >= lower and
                        (upper_exclusive is None or q < upper_exclusive)))


def best_order(orders: list[EvaluatedOrder]) -> EvaluatedOrder:
    if not orders:
        raise CalculationError('No se encontró una cantidad de pedido factible.', 'discount_tiers')
    return min(orders, key=lambda item: (item.costs.total, item.quantity, item.tier_index))
