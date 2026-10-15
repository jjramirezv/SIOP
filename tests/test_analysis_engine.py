from copy import deepcopy
from decimal import Decimal
from fractions import Fraction
import json
from pathlib import Path
import random

from fastapi.testclient import TestClient
import pytest

from app.domain.models import NormalizedProblem, PriceTier
from app.domain.quantity_discounts import solve_all_units_discount
from app.main import app
from app.schemas.analysis import AnalysisResponse
from app.schemas.inventory import AnalysisRequest
from app.services.analysis_service import analyze


ROOT = Path(__file__).resolve().parents[3]


def load_case(name):
    return json.loads((ROOT / f'fixtures/cases/{name}.json').read_text(encoding='utf-8'))


@pytest.mark.parametrize('name', ['ily', 'wohl', 'sensitivity-a', 'sensitivity-b'])
def test_real_engine_matches_reference_cases(name):
    request = AnalysisRequest.model_validate(load_case(name))
    actual = analyze(request)
    expected = AnalysisResponse.model_validate_json(
        (ROOT / f'fixtures/expected-results/{name}.json').read_text(encoding='utf-8'))
    assert actual.data_source == 'calculated'
    assert actual.input == expected.input
    assert actual.recommended.quantity == expected.recommended.quantity
    assert actual.recommended.unit_price == expected.recommended.unit_price
    assert actual.recommended.annual_costs.model_dump() == pytest.approx(
        expected.recommended.annual_costs.model_dump())
    assert actual.recommended.orders_per_year == pytest.approx(expected.recommended.orders_per_year)
    assert actual.recommended.cycle_days == pytest.approx(expected.recommended.cycle_days)
    assert actual.comparison.annual_savings == pytest.approx(expected.comparison.annual_savings)
    for candidate, reference in zip(actual.candidates, expected.candidates, strict=True):
        assert candidate.status == reference.status
        assert candidate.evaluated_quantity == reference.evaluated_quantity
        assert candidate.theoretical_eoq == pytest.approx(reference.theoretical_eoq)
    assert len(actual.steps) == len(actual.candidates) + 4


def test_monthly_demand_equals_annual_demand():
    monthly = load_case('sensitivity-a')
    annual = deepcopy(monthly)
    annual['demand'] = {'value': 2400, 'period': 'year'}
    a, b = [analyze(AnalysisRequest.model_validate(data)) for data in (monthly, annual)]
    assert a.recommended == b.recommended
    assert a.normalized == b.normalized


@pytest.mark.parametrize('holding_mode', ['fixed', 'percentage'])
def test_holding_period_is_independent_from_demand(holding_mode):
    monthly = load_case('sensitivity-a')
    monthly['demand'] = {'value': 10, 'period': 'day'}
    monthly['holding_cost'] = {'mode': holding_mode, 'value': 2, 'period': 'month'}
    annual = deepcopy(monthly)
    annual['demand'] = {'value': 3600, 'period': 'year'}
    annual['holding_cost']['value'] = 24
    annual['holding_cost']['period'] = 'year'
    a, b = [analyze(AnalysisRequest.model_validate(data)) for data in (monthly, annual)]
    assert a.normalized == b.normalized
    assert a.recommended == b.recommended


def test_percentage_holding_is_calculated_for_each_price():
    result = analyze(AnalysisRequest.model_validate(load_case('wohl')))
    assert [c.annual_holding_per_unit for c in result.candidates] == [1, .96, .95]


@pytest.mark.parametrize('quantity,expected_index,price', [
    (199, 0, 20), (200, 1, 19.6), (499, 1, 19.6), (500, 2, 19.2),
])
def test_current_order_gets_correct_price_at_discount_boundaries(quantity, expected_index, price):
    data = load_case('sensitivity-a')
    data['current_order_quantity'] = quantity
    current = analyze(AnalysisRequest.model_validate(data)).comparison.current
    assert current.tier_index == expected_index
    assert current.unit_price == price
    assert current.investment_per_order == pytest.approx(quantity * price)


def test_no_current_quantity_means_no_comparison():
    data = load_case('sensitivity-a')
    del data['current_order_quantity']
    assert analyze(AnalysisRequest.model_validate(data)).comparison is None


def test_recommended_current_quantity_has_zero_savings():
    data = load_case('sensitivity-a')
    data['current_order_quantity'] = 500
    comparison = analyze(AnalysisRequest.model_validate(data)).comparison
    assert comparison.annual_savings == comparison.savings_percentage == 0


def make_problem(demand, order_cost, holding, tiers):
    return NormalizedProblem(
        annual_demand=Decimal(str(demand)), order_cost=Decimal(str(order_cost)),
        holding_mode='fixed', annual_holding_value=Decimal(str(holding)), days_per_year=360,
        tiers=tuple(PriceTier(minimum, Decimal(str(price))) for minimum, price in tiers),
    )


def test_integer_choice_does_not_always_round_up():
    problem = make_problem(1, '2.205', 1, [(0, 10)])
    solution = solve_all_units_discount(problem)
    assert float(solution.candidates[0].theoretical_eoq) == pytest.approx(2.1)
    assert solution.recommended.quantity == 2


def test_nearest_integer_can_be_wrong_so_both_neighbors_are_compared():
    problem = make_problem(1, '3.10005', 1, [(0, 10)])
    solution = solve_all_units_discount(problem)
    assert float(solution.candidates[0].theoretical_eoq) == pytest.approx(2.49)
    assert solution.recommended.quantity == 3


def test_exact_tie_prefers_smaller_order():
    solution = solve_all_units_discount(make_problem(1, 1, 1, [(0, 10)]))
    assert solution.recommended.quantity == 1


def test_first_interval_with_no_positive_integer_is_excluded():
    solution = solve_all_units_discount(make_problem(.01, 1, 100, [(0, 20), (1, 19)]))
    assert solution.candidates[0].status == 'excluded'
    assert solution.candidates[0].order is None
    assert solution.recommended.quantity == 1
    assert solution.recommended.tier_index == 1


def test_exact_eoq_at_next_minimum_uses_new_price():
    solution = solve_all_units_discount(make_problem(100, 50, 1, [(0, 20), (100, 19)]))
    assert solution.candidates[0].theoretical_eoq == 100
    assert solution.candidates[0].status == 'excluded'
    assert solution.recommended.quantity == 100
    assert solution.recommended.tier_index == 1


@pytest.mark.parametrize('seed', range(40))
def test_solution_matches_independent_exhaustive_search(seed):
    rng = random.Random(seed)
    demand, order_cost = rng.randint(1, 80), rng.randint(1, 12)
    holding_value = rng.randint(1, 10)
    minimum_1 = rng.randint(2, 10)
    minimum_2 = minimum_1 + rng.randint(2, 12)
    tiers = [(0, 20), (minimum_1, 15), (minimum_2, 10)]
    problem = make_problem(demand, order_cost, holding_value, tiers)
    if seed % 2:
        problem = NormalizedProblem(
            annual_demand=problem.annual_demand, order_cost=problem.order_cost,
            holding_mode='percentage', annual_holding_value=problem.annual_holding_value,
            days_per_year=360, tiers=problem.tiers,
        )
    result = solve_all_units_discount(problem)

    def exact_cost(quantity):
        index = max(i for i, (minimum, _) in enumerate(tiers) if quantity >= minimum)
        price = tiers[index][1]
        h = Fraction(holding_value * price, 100) if seed % 2 else Fraction(holding_value)
        return price * demand + Fraction(order_cost * demand, quantity) + h * quantity / 2

    # Even the largest possible EOQ in this fixture is < 139; all later costs rise.
    expected = min(range(1, 301), key=lambda q: (exact_cost(q), q))
    assert result.recommended.quantity == expected


def test_api_returns_real_analysis_and_preserves_contract():
    with TestClient(app) as client:
        response = client.post('/api/v1/analyses', json=load_case('sensitivity-a'))
    assert response.status_code == 200
    result = AnalysisResponse.model_validate(response.json())
    assert result.data_source == 'calculated'
    assert result.contract_version == '1.0.0'
    assert result.recommended.quantity == 500
    assert result.recommended.annual_costs.total == 47522
    assert result.comparison.annual_savings == 498


@pytest.mark.parametrize('mutation,expected_field', [
    (lambda data: data['demand'].update(value=0), 'demand.value'),
    (lambda data: data['discount_tiers'][1].update(min_quantity=0), 'discount_tiers'),
    (lambda data: data.update(current_order_quantity=0), 'current_order_quantity'),
])
def test_api_returns_field_errors_not_internal_server_errors(mutation, expected_field):
    data = load_case('sensitivity-a')
    mutation(data)
    with TestClient(app) as client:
        response = client.post('/api/v1/analyses', json=data)
    assert response.status_code == 422
    assert response.json()['error']['code'] == 'VALIDATION_ERROR'
    assert expected_field in [item['field'] for item in response.json()['error']['details']]


def test_extreme_numbers_have_controlled_422_response():
    data = load_case('sensitivity-a')
    data['demand'] = {'value': 1e308, 'period': 'day'}
    with TestClient(app) as client:
        response = client.post('/api/v1/analyses', json=data)
    assert response.status_code == 422
    assert response.json()['error']['code'] == 'VALIDATION_ERROR'


def test_actual_openapi_analysis_has_same_operation_id_as_shared_contract():
    with TestClient(app) as client:
        schema = client.get('/openapi.json').json()
    operation = schema['paths']['/api/v1/analyses']['post']
    assert operation['operationId'] == 'analysis_api_v1_analyses_post'
    assert operation['x-implementation-status'] == 'implemented'
