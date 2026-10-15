from decimal import Decimal, InvalidOperation
from math import isfinite

from app.domain.models import CalculationError


def decimal_number(value: int | float) -> Decimal:
    try:
        result = Decimal(str(value))
    except (InvalidOperation, ValueError) as exc:
        raise CalculationError('El valor debe ser un número finito.') from exc
    if not result.is_finite():
        raise CalculationError('El valor debe ser un número finito.')
    return result


def periods_per_year(period: str, days_per_year: int) -> int:
    if period == 'year':
        return 1
    if period == 'month':
        return 12
    if period == 'day':
        return days_per_year
    raise CalculationError('El período debe ser día, mes o año.')


def annualize(value: int | float, period: str, days_per_year: int) -> Decimal:
    return decimal_number(value) * periods_per_year(period, days_per_year)


def wire_number(value: Decimal, field: str = '$') -> float:
    try:
        result = float(value)
    except (OverflowError, ValueError) as exc:
        raise CalculationError('Los valores exceden el rango numérico admitido.', field) from exc
    if not isfinite(result) or (result == 0 and value != 0):
        raise CalculationError('Los valores exceden el rango numérico admitido.', field)
    return result
