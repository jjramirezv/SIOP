import json
from pathlib import Path

import pytest
from fastapi import FastAPI
from fastapi.exceptions import RequestValidationError
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.main import app, validation_error_handler
from app.schemas.analysis import AnalysisResponse
from app.schemas.assistant import AssistantRequest, AssistantResponse
from app.schemas.common import ErrorResponse
from app.schemas.inventory import AnalysisRequest


ROOT = Path(__file__).resolve().parents[4]


def read_json(relative):
    return json.loads((ROOT / relative).read_text(encoding='utf-8'))


@pytest.mark.parametrize('name', ['analysis', 'assistant'])
def test_examples_validate(name):
    request_model, response_model = {
        'analysis': (AnalysisRequest, AnalysisResponse),
        'assistant': (AssistantRequest, AssistantResponse),
    }[name]
    request_model.model_validate(read_json(f'contracts/examples/{name}-request.json'))
    response_model.model_validate(read_json(f'contracts/examples/{name}-response.json'))


def test_error_example_validates():
    ErrorResponse.model_validate(read_json('contracts/examples/validation-error.json'))


@pytest.mark.parametrize('case_name,quantity,total', [
    ('ily', 1000, 150840), ('wohl', 1000, 24725),
    ('sensitivity-a', 500, 47522), ('sensitivity-b', 200, 48520),
])
def test_reference_examples_are_mathematically_consistent(case_name, quantity, total):
    request = AnalysisRequest.model_validate(read_json(f'fixtures/cases/{case_name}.json'))
    result = AnalysisResponse.model_validate(read_json(f'fixtures/expected-results/{case_name}.json'))
    assert result.input == request
    assert result.data_source == 'reference_example'
    assert result.recommended.quantity == quantity
    assert result.recommended.annual_costs.total == pytest.approx(total)
    factors = {'day': request.days_per_year, 'month': 12, 'year': 1}
    annual_demand = request.demand.value * factors[request.demand.period]
    assert result.normalized.annual_demand == annual_demand
    for candidate in result.candidates:
        if candidate.status == 'excluded':
            assert candidate.evaluated_quantity is None
            continue
        q = candidate.evaluated_quantity
        assert q is not None
        price = request.discount_tiers[candidate.tier_index].unit_price
        h = request.holding_cost.value * factors[request.holding_cost.period]
        if request.holding_cost.mode == 'percentage':
            h = h * price / 100
        assert candidate.unit_price == price
        assert candidate.annual_holding_per_unit == h
        assert candidate.annual_costs.purchase == pytest.approx(price * annual_demand)
        assert candidate.annual_costs.ordering == pytest.approx(request.order_cost * annual_demand / q)
        assert candidate.annual_costs.holding == pytest.approx(h * q / 2)
    recommended = result.recommended
    assert recommended.annual_costs.total == min(
        candidate.annual_costs.total for candidate in result.candidates
        if candidate.annual_costs is not None
    )
    assert recommended.investment_per_order == pytest.approx(recommended.quantity * recommended.unit_price)
    assert recommended.orders_per_year == pytest.approx(annual_demand / recommended.quantity)
    assert recommended.cycle_days == pytest.approx(request.days_per_year / recommended.orders_per_year)
    assert result.comparison.annual_savings == pytest.approx(
        result.comparison.current.annual_costs.total - recommended.annual_costs.total)


@pytest.mark.parametrize('mutation', [
    lambda r: r.update(order_cost=-1),
    lambda r: r['demand'].update(value=0),
    lambda r: r['demand'].update(value=float('nan')),
    lambda r: r['demand'].update(period='week'),
    lambda r: r.update(currency='soles'),
    lambda r: r.update(current_order_quantity=0),
    lambda r: r.update(current_order_quantity=True),
    lambda r: r.update(typo_field=1),
    lambda r: r['discount_tiers'][0].update(min_quantity=1),
    lambda r: r['discount_tiers'][1].update(min_quantity=0),
    lambda r: r['discount_tiers'][1].update(unit_price=25),
])
def test_invalid_inputs_are_rejected(mutation):
    request = read_json('contracts/examples/analysis-request.json')
    mutation(request)
    with pytest.raises(ValidationError):
        AnalysisRequest.model_validate(request)


def test_assistant_cannot_skip_confirmation_for_proposed_values():
    response = read_json('contracts/examples/assistant-response.json')
    response['requires_confirmation'] = False
    with pytest.raises(ValidationError):
        AssistantResponse.model_validate(response)


def test_response_rejects_cost_sum_mismatch():
    response = read_json('contracts/examples/analysis-response.json')
    response['recommended']['annual_costs']['total'] += 1
    with pytest.raises(ValidationError):
        AnalysisResponse.model_validate(response)


def test_candidate_cannot_cross_discount_boundary():
    response = read_json('contracts/examples/analysis-response.json')
    response['candidates'][0]['evaluated_quantity'] = 200
    with pytest.raises(ValidationError):
        AnalysisResponse.model_validate(response)


def test_health_and_implemented_route_status(monkeypatch):
    from types import SimpleNamespace
    from app.routes import health as health_route
    monkeypatch.setattr(health_route, 'get_settings', lambda: SimpleNamespace(
        gemini_api_key=None, gemini_text_model='',
    ))
    with TestClient(app) as client:
        health = client.get('/api/v1/health')
        assert health.status_code == 200
        assert health.json() == {'status': 'ok', 'service': 'SIOP API', 'contract_version': '1.0.0', 'ai_available': False}
        assert client.get('/docs').status_code == 200
        request = read_json('contracts/examples/analysis-request.json')
        assert client.post('/api/v1/analyses', json=request).status_code == 200
        assert '/api/v1/analyses' in client.get('/openapi.json').json()['paths']
        assert client.post('/api/v1/assistant/messages', json={}).status_code == 422
        cors = client.options('/api/v1/health', headers={
            'Origin': 'http://localhost:5173', 'Access-Control-Request-Method': 'GET',
        })
        assert cors.headers['access-control-allow-origin'] == 'http://localhost:5173'


def test_health_reports_configuration_without_exposing_credentials(monkeypatch):
    from types import SimpleNamespace
    from pydantic import SecretStr
    from app.routes import health as health_route
    monkeypatch.setattr(health_route, 'get_settings', lambda: SimpleNamespace(
        gemini_api_key=SecretStr('test-only-key'), gemini_text_model='test-only-model',
    ))
    with TestClient(app) as client:
        response = client.get('/api/v1/health')
    assert response.json()['ai_available'] is True
    assert 'test-only-key' not in response.text


def test_candidate_details_are_calculated_by_backend():
    with TestClient(app) as client:
        result = client.post('/api/v1/analyses', json=read_json('fixtures/cases/ily.json')).json()
    for candidate in result['candidates']:
        if candidate['status'] == 'excluded':
            assert candidate['order'] is None
            continue
        order = candidate['order']
        assert order['quantity'] == candidate['evaluated_quantity']
        assert order['annual_costs'] == candidate['annual_costs']
        assert order['investment_per_order'] == pytest.approx(order['quantity'] * order['unit_price'])


def test_field_error_contract_matches_http_handler():
    validation_app = FastAPI()
    validation_app.add_exception_handler(RequestValidationError, validation_error_handler)

    @validation_app.post('/validate')
    def validate(body: AnalysisRequest):
        return body

    invalid = read_json('contracts/examples/analysis-request.json')
    invalid['demand']['value'] = -5
    with TestClient(validation_app) as client:
        response = client.post('/validate', json=invalid)
    assert response.status_code == 422
    error = ErrorResponse.model_validate(response.json())
    assert error.error.details[0].field == 'demand.value'
    assert 'input' not in response.text


def test_exported_contract_resolves_references_and_marks_implemented_routes():
    document = read_json('contracts/openapi.json')

    def visit(node):
        if isinstance(node, dict):
            if '$ref' in node and node['$ref'].startswith('#/'):
                target = document
                for part in node['$ref'][2:].split('/'):
                    target = target[part.replace('~1', '/').replace('~0', '~')]
            for child in node.values():
                visit(child)
        elif isinstance(node, list):
            for child in node:
                visit(child)

    visit(document)
    assert len(document['paths']) == 5
    assert document['paths']['/api/v1/health']['get']['x-implementation-status'] == 'implemented'
    for path, operations in document['paths'].items():
        if path.endswith('/health') or path.endswith('/analyses'):
            continue
        assert operations['post']['x-implementation-status'] == 'implemented'


def test_env_template_has_no_secret_value_and_env_is_ignored():
    template = (ROOT / 'apps/api/.env.example').read_text(encoding='utf-8')
    line = next(line for line in template.splitlines() if line.startswith('GEMINI_API_KEY='))
    assert line == 'GEMINI_API_KEY='
    ignored = (ROOT / '.gitignore').read_text(encoding='utf-8').splitlines()
    assert '.env' in ignored and 'venv/' in ignored and '!.env.example' in ignored


def test_exported_contract_matches_live_route_identifiers():
    exported = read_json('contracts/openapi.json')
    live = app.openapi()
    assert set(exported['paths']) == set(live['paths'])
    for path, operations in live['paths'].items():
        for method, operation in operations.items():
            assert exported['paths'][path][method]['operationId'] == operation['operationId']
