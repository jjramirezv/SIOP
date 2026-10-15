from decimal import Decimal, localcontext

from app.domain.candidate_selection import best_order, integer_candidates
from app.domain.cost_breakdown import evaluate_order, holding_per_unit
from app.domain.models import EvaluatedCandidate, NormalizedProblem, Solution


def solve_all_units_discount(problem: NormalizedProblem) -> Solution:
    candidates = []
    allowed_orders = []
    with localcontext() as context:
        context.prec = 50
        for index, tier in enumerate(problem.tiers):
            upper = problem.tiers[index + 1].min_quantity if index + 1 < len(problem.tiers) else None
            h = holding_per_unit(problem, index)
            eoq = (2 * problem.annual_demand * problem.order_cost / h).sqrt()
            excluded = upper is not None and eoq >= Decimal(upper)
            choices = integer_candidates(eoq, tier.min_quantity, upper) if not excluded else ()
            order = None
            status = 'excluded'
            if excluded:
                reason = 'La CEP alcanza o supera el siguiente tramo; se compara la alternativa de ese tramo.'
            elif not choices:
                reason = 'El tramo no contiene cantidades enteras positivas para realizar un pedido.'
            else:
                order = best_order([evaluate_order(problem, q) for q in choices])
                allowed_orders.append(order)
                status = 'adjusted' if eoq < tier.min_quantity else 'feasible'
                reason = ('Se ajusta al mínimo del descuento.' if status == 'adjusted' else
                          'Se comparan las cantidades enteras vecinas y los límites factibles del tramo.')
            candidates.append(EvaluatedCandidate(
                tier_index=index, min_quantity=tier.min_quantity, max_quantity_exclusive=upper,
                unit_price=tier.unit_price, annual_holding_per_unit=h, theoretical_eoq=eoq,
                status=status, order=order, reason=reason,
            ))
    return Solution(candidates=tuple(candidates), recommended=best_order(allowed_orders))
