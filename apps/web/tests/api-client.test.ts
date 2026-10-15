import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { REFERENCE_CASES } from './fixtures/reference-cases';
import { ApiClientError, apiClient } from '../src/services/api-client';
import { toApiDraft } from '../src/services/api-adapters';

const read = (path: string) => JSON.parse(readFileSync(new URL(`../../../${path}`, import.meta.url), 'utf8'));
const wireAnalysis = (name = 'ily') => ({ ...read(`fixtures/expected-results/${name}.json`), data_source: 'calculated' });
const jsonResponse = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe('Cliente HTTP real y contrato compartido', () => {
  it.each(['ily', 'wohl', 'sensitivity-a', 'sensitivity-b'])('traduce %s sin calcular números financieros en el navegador', async (name) => {
    const wire = wireAnalysis(name);
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(wire));
    vi.stubGlobal('fetch', fetchMock);
    const flat = name === 'ily' ? REFERENCE_CASES.ily.request : name === 'wohl' ? REFERENCE_CASES.wohl.request : name === 'sensitivity-a' ? REFERENCE_CASES.sensibilidad_a.request : REFERENCE_CASES.sensibilidad_b.request;
    const actual = await apiClient.runAnalysis(flat);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/v1/analyses');
    expect(JSON.parse(init.body)).toEqual(toApiDraft(flat));
    expect(actual.recommended.feasible_quantity).toBe(wire.recommended.quantity);
    expect(actual.recommended.total_annual_cost).toBe(wire.recommended.annual_costs.total);
    expect(actual.alternatives.every((entry) => entry.status_label !== 'Descartado')).toBe(true);
    expect(actual.excluded_candidates).toHaveLength(wire.candidates.filter((entry: { status: string }) => entry.status === 'excluded').length);
    expect(actual.current_comparison?.annual_savings).toBe(wire.comparison.annual_savings);
  });

  it('la explicación envía la entrada verificada y el historial, sin enviar resultados calculados por el cliente', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse(wireAnalysis())).mockResolvedValueOnce(jsonResponse(read('contracts/examples/assistant-response.json')));
    vi.stubGlobal('fetch', fetchMock);
    const result = await apiClient.runAnalysis(REFERENCE_CASES.ily.request);
    await apiClient.sendAssistantMessage({ message: 'Explícame el resultado', current_draft: REFERENCE_CASES.ily.request, current_result: result, history: [{ role: 'user', content: 'Hola' }] });
    const body = JSON.parse(fetchMock.mock.calls[1][1].body);
    expect(body.analysis_input).toEqual(wireAnalysis().input);
    expect(body.history).toEqual([{ role: 'user', content: 'Hola' }]);
    expect(body).not.toHaveProperty('current_result');
    expect(body.draft.order_cost).toBe(9);
  });

  it('respeta borradores parciales, campos faltantes y revisión obligatoria', async () => {
    const wire = read('contracts/examples/assistant-response.json');
    wire.proposed_input.discount_tiers = [{ min_quantity: 0, unit_price: null }];
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(wire)));
    const response = await apiClient.sendAssistantMessage({ message: 'Vendo cuadernos' });
    expect(response.proposed_data?.demand).toBe(200);
    expect(response.proposed_data?.demand_period).toBe('month');
    expect(response.proposed_data).not.toHaveProperty('ordering_cost');
    expect(response.proposed_data?.discount_tiers?.[0].unit_price).toBeNaN();
    expect(response.missing_fields).toContain('ordering_cost');
    expect(response.missing_fields).toContain('holding_cost_period');
    wire.requires_confirmation = false;
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(wire)));
    await expect(apiClient.sendAssistantMessage({ message: 'Hola' })).rejects.toMatchObject({ code: 'invalid_response' });
  });

  it('envía imagen, contexto, borrador y audio como multipart, dejando el boundary al navegador', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse(read('contracts/examples/assistant-response.json'))).mockResolvedValueOnce(jsonResponse({ text: 'Texto transcrito', language: 'es' }));
    vi.stubGlobal('fetch', fetchMock);
    await apiClient.extractFromImage(new File(['png'], 'foto.png', { type: 'image/png' }), 'Cotización', REFERENCE_CASES.ily.request);
    expect(await apiClient.transcribeAudio(new Blob(['audio'], { type: 'audio/webm' }), 'voz.webm')).toMatchObject({ text: 'Texto transcrito' });
    const imageInit = fetchMock.mock.calls[0][1];
    const audioInit = fetchMock.mock.calls[1][1];
    expect(imageInit.body.get('context')).toBe('Cotización');
    expect(JSON.parse(imageInit.body.get('draft'))).toEqual(toApiDraft(REFERENCE_CASES.ily.request));
    expect(imageInit.body.get('file').name).toBe('foto.png');
    expect(audioInit.body.get('file').name).toBe('voz.webm');
    expect(new Headers(imageInit.headers).has('Content-Type')).toBe(false);
    expect(new Headers(audioInit.headers).has('Content-Type')).toBe(false);
  });

  it('consulta la salud y comunica honestamente la ausencia de configuración de IA', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ status: 'ok', service: 'SIOP API', contract_version: '1.0.0', ai_available: false }));
    vi.stubGlobal('fetch', fetchMock);
    expect(await apiClient.checkHealth()).toEqual({ status: 'ok', ai_available: false });
    expect(fetchMock.mock.calls[0][0]).toBe('/api/v1/health');
  });

  it.each([400, 422, 413, 415, 429, 500, 503])('conserva errores tipados HTTP %s, sin respuestas de sustitución', async (status) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ error: { code: 'ERROR', message: 'El asistente necesita configuración en el servidor.', details: [] } }, status)));
    await expect(apiClient.runAnalysis(REFERENCE_CASES.ily.request)).rejects.toMatchObject({ name: 'ApiClientError', code: 'http', status, message: 'El asistente necesita configuración en el servidor.' });
  });

  it('controla fallos de red, JSON inválido y contratos incompletos', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValueOnce(new TypeError('Failed to fetch')).mockResolvedValueOnce(new Response('no es JSON')).mockResolvedValueOnce(jsonResponse({ recommended: {} })));
    await expect(apiClient.checkHealth()).rejects.toBeInstanceOf(ApiClientError);
    await expect(apiClient.checkHealth()).rejects.toMatchObject({ code: 'invalid_response' });
    await expect(apiClient.runAnalysis(REFERENCE_CASES.ily.request)).rejects.toMatchObject({ code: 'invalid_response' });
  });

  it('interrumpe solicitudes que exceden su plazo', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn((_url: string, init: RequestInit) => new Promise((_resolve, reject) => { init.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError'))); })));
    const pending = expect(apiClient.checkHealth()).rejects.toMatchObject({ code: 'timeout' });
    await vi.advanceTimersByTimeAsync(30000);
    await pending;
  });
});
