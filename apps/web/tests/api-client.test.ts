import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { REFERENCE_CASES, mockAssistantMessage } from '../src/mocks/reference-cases';
import { ApiClientError, apiClient } from '../src/services/api-client';

const jsonResponse = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { 'Content-Type': 'application/json' },
});

beforeEach(() => { apiClient.setUseMocks(true); });
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); apiClient.setUseMocks(true); });

describe('Modo simulado', () => {
  it('inicia desde el entorno y expone el estado en memoria', () => {
    expect(apiClient.useMocks).toBe(true);
    apiClient.useMocks = false;
    expect(apiClient.getUseMocks()).toBe(false);
  });

  it('espera 350 ms sin llamar al servidor y anuncia que la IA real no está disponible', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    expect(await apiClient.checkHealth()).toEqual({ status: 'ok', ai_available: false, mode: 'mock' });
    const callback = vi.fn();
    const pending = apiClient.runAnalysis(REFERENCE_CASES.ily.request).then(callback);
    await vi.advanceTimersByTimeAsync(349);
    expect(callback).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    await pending;
    expect(callback).toHaveBeenCalledWith(REFERENCE_CASES.ily.response);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rechaza escenarios no precalculados con ApiClientError', async () => {
    await expect(apiClient.runAnalysis({ ...REFERENCE_CASES.ily.request, demand: 123 })).rejects.toMatchObject({ code: 'mock', name: 'ApiClientError' });
  });

  it('expone transcripción editable y borradores de texto e imagen', async () => {
    const [text, image, transcription] = await Promise.all([
      apiClient.sendAssistantMessage({ message: 'Ayúdame' }),
      apiClient.extractFromImage(new File(['imagen'], 'ejercicio.png')),
      apiClient.transcribeAudio(new Blob(['audio'])),
    ]);
    expect(text.proposed_data).not.toBeNull();
    expect(image.fields_to_review).toEqual(['holding_cost_value', 'discount_tiers']);
    expect(transcription).toEqual({ text: expect.stringContaining('200 unidades al mes'), duration_seconds: 12 });
  });
});

describe('Modo real', () => {
  beforeEach(() => { apiClient.setUseMocks(false); });

  it('consulta health y envía análisis y mensajes como JSON', async () => {
    const assistant = mockAssistantMessage({ message: 'Ayúdame' });
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ status: 'ok', ai_available: true }))
      .mockResolvedValueOnce(jsonResponse(REFERENCE_CASES.wohl.response))
      .mockResolvedValueOnce(jsonResponse(assistant));
    vi.stubGlobal('fetch', fetchMock);
    expect(await apiClient.checkHealth()).toEqual({ status: 'ok', ai_available: true, mode: 'real' });
    expect(await apiClient.runAnalysis(REFERENCE_CASES.wohl.request)).toEqual(REFERENCE_CASES.wohl.response);
    expect(await apiClient.sendAssistantMessage({ message: 'Ayúdame' })).toEqual(assistant);
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      'http://localhost:8000/api/v1/health', 'http://localhost:8000/api/v1/analyses',
      'http://localhost:8000/api/v1/assistant/messages',
    ]);
    const init = fetchMock.mock.calls[1][1] as RequestInit;
    expect(init.method).toBe('POST');
    expect(new Headers(init.headers).get('Content-Type')).toBe('application/json');
    expect(JSON.parse(init.body as string)).toEqual(REFERENCE_CASES.wohl.request);
  });

  it('envía imagen con contexto y audio con nombre en FormData', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse(mockAssistantMessage({ message: 'Ayúdame' })))
      .mockResolvedValueOnce(jsonResponse({ text: 'Texto transcrito', duration_seconds: 3 }));
    vi.stubGlobal('fetch', fetchMock);
    await apiClient.extractFromImage(new File(['imagen'], 'foto.png', { type: 'image/png' }), 'Caso ILY');
    expect(await apiClient.transcribeAudio(new Blob(['voz'], { type: 'audio/webm' }), 'voz.webm')).toEqual({ text: 'Texto transcrito', duration_seconds: 3 });
    const [imageUrl, imageInit] = fetchMock.mock.calls[0] as [string, RequestInit];
    const [audioUrl, audioInit] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(imageUrl).toBe('http://localhost:8000/api/v1/assistant/extract-image');
    expect(audioUrl).toBe('http://localhost:8000/api/v1/assistant/transcribe');
    expect(imageInit.method).toBe('POST');
    expect((imageInit.body as FormData).get('context')).toBe('Caso ILY');
    expect(((imageInit.body as FormData).get('file') as File).name).toBe('foto.png');
    expect(((audioInit.body as FormData).get('file') as File).name).toBe('voz.webm');
    expect(new Headers(imageInit.headers).has('Content-Type')).toBe(false);
    expect(new Headers(audioInit.headers).has('Content-Type')).toBe(false);
  });

  it.each([400, 422, 413, 415, 429, 500, 503])('devuelve error tipado ante HTTP %s sin cambiar a mocks', async (status) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ detail: 'Error interno' }, status)));
    await expect(apiClient.runAnalysis(REFERENCE_CASES.ily.request)).rejects.toMatchObject({ name: 'ApiClientError', code: 'http', status });
    expect(apiClient.useMocks).toBe(false);
  });

  it('controla fallos de red, JSON inválido y contratos incompletos', async () => {
    const fetchMock = vi.fn().mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(new Response('no es JSON'))
      .mockResolvedValueOnce(jsonResponse({ recommended: {} }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(apiClient.checkHealth()).rejects.toBeInstanceOf(ApiClientError);
    await expect(apiClient.checkHealth()).rejects.toMatchObject({ code: 'invalid_response' });
    await expect(apiClient.runAnalysis(REFERENCE_CASES.ily.request)).rejects.toMatchObject({ code: 'invalid_response' });
  });

  it('interrumpe solicitudes que exceden 30 segundos', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn((_url: string, init: RequestInit) => new Promise((_resolve, reject) => {
      init.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
    })));
    const pending = expect(apiClient.checkHealth()).rejects.toMatchObject({ code: 'timeout' });
    await vi.advanceTimersByTimeAsync(30000);
    await pending;
  });
});
