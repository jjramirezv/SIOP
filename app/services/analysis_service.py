from decimal import Decimal, DecimalException, localcontext

from app.domain.cost_breakdown import evaluate_order
from app.domain.models import CalculationError, CostBreakdown, EvaluatedOrder, NormalizedProblem, PriceTier
from app.domain.normalization import annualize, decimal_number, periods_per_year, wire_number
from app.domain.quantity_discounts import solve_all_units_discount
from app.schemas.analysis import (
    AnalysisResponse, AnnualCosts, AnnualHoldingCost, CalculationStep, Candidate,
    CurrentComparison, NormalizedInput, OrderEvaluation,
)
from app.schemas.inventory import AnalysisRequest


def costs_to_contract(costs: CostBreakdown) -> AnnualCosts:
    return AnnualCosts(**{key: wire_number(getattr(costs, key)) for key in
                          ('purchase', 'ordering', 'holding', 'total')})


def order_to_contract(order: EvaluatedOrder) -> OrderEvaluation:
    return OrderEvaluation(
        tier_index=order.tier_index, quantity=order.quantity,
        unit_price=wire_number(order.unit_price),
        annual_holding_per_unit=wire_number(order.annual_holding_per_unit),
        investment_per_order=wire_number(order.investment_per_order),
        orders_per_year=wire_number(order.orders_per_year), cycle_days=wire_number(order.cycle_days),
        annual_costs=costs_to_contract(order.costs),
    )


def short(value: Decimal) -> str:
    return f'{value:.2f}'


def analyze(request: AnalysisRequest) -> AnalysisResponse:
    try:
        with localcontext() as context:
            context.prec = 50
            return _analyze(request)
    except DecimalException as exc:
        raise CalculationError('Los valores exceden el rango numérico admitido.') from exc


def _analyze(request: AnalysisRequest) -> AnalysisResponse:
    problem = NormalizedProblem(
        annual_demand=annualize(request.demand.value, request.demand.period, request.days_per_year),
        order_cost=decimal_number(request.order_cost), holding_mode=request.holding_cost.mode,
        annual_holding_value=annualize(request.holding_cost.value, request.holding_cost.period,
                                      request.days_per_year),
        days_per_year=request.days_per_year,
        tiers=tuple(PriceTier(tier.min_quantity, decimal_number(tier.unit_price))
                    for tier in request.discount_tiers),
    )
    # Validate representability before returning any non-finite JSON number.
    annual_demand = wire_number(problem.annual_demand, 'demand.value')
    annual_holding = wire_number(problem.annual_holding_value, 'holding_cost.value')
    solution = solve_all_units_discount(problem)
    recommended = order_to_contract(solution.recommended)
    candidates = [Candidate(
        tier_index=item.tier_index, min_quantity=item.min_quantity,
        max_quantity_exclusive=item.max_quantity_exclusive,
        unit_price=wire_number(item.unit_price),
        annual_holding_per_unit=wire_number(item.annual_holding_per_unit),
        theoretical_eoq=wire_number(item.theoretical_eoq), status=item.status,
        evaluated_quantity=item.order.quantity if item.order else None,
        annual_costs=costs_to_contract(item.order.costs) if item.order else None,
        reason=item.reason,
    ) for item in solution.candidates]
    comparison = None
    if request.current_order_quantity is not None:
        current = evaluate_order(problem, request.current_order_quantity)
        savings = current.costs.total - solution.recommended.costs.total
        comparison = CurrentComparison(
            current=order_to_contract(current), annual_savings=wire_number(savings),
            savings_percentage=wire_number(savings / current.costs.total * 100),
        )

    steps = [CalculationStep(
        title='Demanda anual', formula='D = demanda × períodos por año',
        substitution=f'{request.demand.value:g} × '
                     f'{periods_per_year(request.demand.period, request.days_per_year)}',
        result=f'{short(problem.annual_demand)} unidades/año',
    ), CalculationStep(
        title='Mantenimiento anual',
        formula=('h_j = tasa anual / 100 × precio_j' if problem.holding_mode == 'percentage' else
                 'h = importe por unidad × períodos por año'),
        substitution=f'{request.holding_cost.value:g} × '
                     f'{periods_per_year(request.holding_cost.period, request.days_per_year)}',
        result=(f'{short(problem.annual_holding_value)} % anual, aplicado a cada precio'
                if problem.holding_mode == 'percentage' else
                f'{short(problem.annual_holding_value)} {request.currency}/unidad/año'),
    )]
    for item in solution.candidates:
        interval = f'[{item.min_quantity}, {item.max_quantity_exclusive})' if \
            item.max_quantity_exclusive is not None else f'desde {item.min_quantity}'
        steps.append(CalculationStep(
            title=f'CEP del precio {short(item.unit_price)}; tramo {interval}',
            formula='Q_j = sqrt(2 × D × C2 / h_j)',
            substitution=f'sqrt(2 × {short(problem.annual_demand)} × '
                         f'{short(problem.order_cost)} / {short(item.annual_holding_per_unit)})',
            result=(f'CEP teórica {short(item.theoretical_eoq)}; '
                    + (f'cantidad entera evaluada {item.order.quantity}. ' if item.order else '')
                    + item.reason),
        ))
    costs = solution.recommended.costs
    steps.extend([CalculationStep(
        title='Alternativa de menor costo anual',
        formula='CT = precio × D + C2 × D / Q + h × Q / 2',
        substitution=f'{short(costs.purchase)} + {short(costs.ordering)} + {short(costs.holding)}',
        result=f'{short(costs.total)} {request.currency}/año; '
               f'{solution.recommended.quantity} unidades por pedido',
    ), CalculationStep(
        title='Frecuencia y duración del ciclo', formula='N = D / Q; T = Q / D × días por año',
        substitution=f'N = {short(problem.annual_demand)} / {solution.recommended.quantity}; '
                     f'T = {solution.recommended.quantity} / {short(problem.annual_demand)} '
                     f'× {request.days_per_year}',
        result=f'{short(solution.recommended.orders_per_year)} pedidos/año; '
               f'{short(solution.recommended.cycle_days)} días entre pedidos',
    )])
    return AnalysisResponse(
        data_source='calculated', input=request,
        normalized=NormalizedInput(
            annual_demand=annual_demand, days_per_year=request.days_per_year,
            holding_cost=AnnualHoldingCost(mode=problem.holding_mode, value=annual_holding),
        ),
        candidates=candidates, recommended=recommended, comparison=comparison,
        assumptions=[
            'Demanda constante, reposición instantánea y sin faltantes.',
            'El descuento aplica a todas las unidades del pedido.',
            'Cada mínimo pertenece a su tramo; la cota superior es exclusiva.',
            f'Un año tiene 12 meses y {request.days_per_year} días de cálculo.',
            'Se comparan cantidades enteras factibles; la CEP teórica puede tener decimales.',
            'El costo anual incluye compra, pedidos y mantenimiento; no incluye costos no ingresados.',
            'Los importes conservan precisión interna y se redondean solo al presentar.',
            'La moneda es una etiqueta; no se convierten divisas.',
        ],
        steps=steps,
    )
