import { z } from 'zod';
import { analysisWireSchema, assistantWireSchema, fromApiAnalysis, fromApiAssistant, toApiDraft, toApiAssistant } from './api-adapters';
import type {
  AnalysisRequest, AnalysisResponse, AssistantMessageRequest, AssistantResponse,
  TranscriptionResponse,
} from './generated/types';

export class ApiClientError extends Error {
  readonly status?: number;
  readonly code: 'network' | 'http' | 'timeout' | 'invalid_response' | 'cancelled' | 'retry_exhausted';
  readonly details?: unknown;
  readonly retryable: boolean;
  readonly retryAfterMs: number;

  constructor(
    message: string,
    code: ApiClientError['code'],
    options: { status?: number; details?: unknown; cause?: unknown; retryable?: boolean; retryAfterMs?: number } = {},
  ) {
    super(message, { cause: options.cause });
    this.name = 'ApiClientError';
    this.code = code;
    this.status = options.status;
    this.details = options.details;
    this.retryable = options.retryable ?? false;
    this.retryAfterMs = options.retryAfterMs ?? 0;
  }
}

const baseUrl = (import.meta.env.VITE_API_BASE_URL || '/api/v1').replace(/\/+$/, '');

async function request<T>(path: string, schema: z.ZodType<T>, init: RequestInit = {}, timeoutMs = 30000): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const abort = () => controller.abort();
  init.signal?.addEventListener('abort', abort, { once: true });
  if (init.signal?.aborted) controller.abort();
  try {
    if (controller.signal.aborted) throw new ApiClientError('Se canceló la espera.', 'cancelled');
    const headers = new Headers(init.headers);
    headers.set('Accept', 'application/json');
    // El navegador agrega el boundary de FormData; no fijar Content-Type para archivos.
    const result = await fetch(`${baseUrl}${path}`, { ...init, headers, signal: controller.signal });
    if (!result.ok) {
      const details: unknown = await result.json().catch(() => null);
      const message = result.status === 422 || result.status === 400
        ? 'Revisa los datos enviados. El servidor encontró campos incompletos o inválidos.'
        : result.status === 413
          ? 'El archivo es demasiado grande. Intenta con un archivo más pequeño.'
          : result.status === 415
            ? 'El formato del archivo no es compatible. Prueba con otro archivo.'
            : result.status === 429
              ? 'Hay muchas solicitudes en este momento. Espera unos segundos y vuelve a intentar.'
              : 'No pudimos completar la solicitud con el servidor. Vuelve a intentarlo en unos momentos.';
      const serverError = z.object({ error: z.object({
        message: z.string(), retryable: z.boolean().optional(), retry_after_seconds: z.number().nonnegative().nullish(),
      }) }).safeParse(details);
      throw new ApiClientError(serverError.success ? serverError.data.error.message : message, 'http', {
        status: result.status, details,
        retryable: serverError.success && serverError.data.error.retryable === true && [429, 503].includes(result.status),
        retryAfterMs: serverError.success ? (serverError.data.error.retry_after_seconds ?? 0) * 1000 : 0,
      });
    }
    const body: unknown = await result.json().catch((cause: unknown) => {
      throw new ApiClientError('El servidor envió una respuesta que no se pudo leer. Vuelve a intentarlo.', 'invalid_response', { cause });
    });
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      throw new ApiClientError('La respuesta del servidor está incompleta o tiene un formato inesperado. Vuelve a intentarlo.', 'invalid_response', { details: parsed.error.issues });
    }
    return parsed.data;
  } catch (cause) {
    if (cause instanceof ApiClientError) throw cause;
    if (init.signal?.aborted) throw new ApiClientError('Se canceló la espera.', 'cancelled');
    if (controller.signal.aborted) {
      throw new ApiClientError('El servidor está tardando demasiado en responder. Vuelve a intentarlo.', 'timeout', { cause });
    }
    throw new ApiClientError('No pudimos conectar con el servidor. Revisa tu conexión y comprueba que la API esté disponible.', 'network', { cause });
  } finally {
    clearTimeout(timeout);
    init.signal?.removeEventListener('abort', abort);
  }
}

export interface AssistantRequestOptions { signal?: AbortSignal }
const cancelled = () => new ApiClientError('Se canceló la espera.', 'cancelled');
const delayed = () => new ApiClientError('No pudimos terminar en este momento. Conservamos tu solicitud para que puedas volver a intentarlo sin ingresar los datos otra vez.', 'retry_exhausted');

function waitForRetry(milliseconds: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) { reject(cancelled()); return; }
    const abort = () => { clearTimeout(timer); reject(cancelled()); };
    const timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolve(); }, milliseconds);
    signal.addEventListener('abort', abort, { once: true });
  });
}

// Reutiliza el JSON/FormData original. Solo reintenta rechazos temporales
// explícitos del servidor; configuración, permisos y archivos inválidos fallan directamente.
async function assistantRequest<T>(path: string, schema: z.ZodType<T>, init: RequestInit, options: AssistantRequestOptions = {}): Promise<T> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  options.signal?.addEventListener('abort', abort, { once: true });
  if (options.signal?.aborted) controller.abort();
  const deadline = setTimeout(abort, 180000);
  try {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      try { return await request(path, schema, { ...init, signal: controller.signal }, 130000); }
      catch (cause) {
        if (controller.signal.aborted) throw cause;
        if (cause instanceof ApiClientError && cause.code === 'timeout') throw delayed();
        if (cause instanceof ApiClientError && cause.retryAfterMs >= 180000) throw delayed();
        if (!(cause instanceof ApiClientError) || !cause.retryable) throw cause;
        if (attempt === 4) throw delayed();
        await waitForRetry(Math.max([3000, 6000, 12000, 20000][attempt], cause.retryAfterMs), controller.signal);
      }
    }
    throw delayed();
  } catch (cause) {
    if (options.signal?.aborted) throw cancelled();
    if (controller.signal.aborted) throw delayed();
    throw cause;
  } finally {
    clearTimeout(deadline);
    options.signal?.removeEventListener('abort', abort);
  }
}

function postJson<T>(path: string, payload: unknown, schema: z.ZodType<T>, timeoutMs = 130000): Promise<T> {
  return request(path, schema, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
  }, timeoutMs);
}

export function checkHealth(): Promise<{ status: string; ai_available: boolean }> {
  return request('/health', z.object({ status: z.literal('ok'), ai_available: z.boolean() }));
}

export async function runAnalysis(payload: AnalysisRequest): Promise<AnalysisResponse> {
  return fromApiAnalysis(await postJson('/analyses', toApiDraft(payload), analysisWireSchema, 30000));
}

export async function sendAssistantMessage(payload: AssistantMessageRequest, options?: AssistantRequestOptions): Promise<AssistantResponse> {
  return fromApiAssistant(await assistantRequest('/assistant/messages', assistantWireSchema, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(toApiAssistant(payload)),
  }, options));
}

export async function extractFromImage(file: File, context?: string, draft?: Partial<AnalysisRequest>, options?: AssistantRequestOptions): Promise<AssistantResponse> {
  const body = new FormData();
  body.append('file', file);
  if (context) body.append('context', context);
  if (draft) body.append('draft', JSON.stringify(toApiDraft(draft)));
  return fromApiAssistant(await assistantRequest('/assistant/extract-image', assistantWireSchema, { method: 'POST', body }, options));
}

export function transcribeAudio(audioBlob: Blob, filename = 'grabacion.webm', options?: AssistantRequestOptions): Promise<TranscriptionResponse> {
  const body = new FormData();
  body.append('file', audioBlob, filename);
  return assistantRequest('/assistant/transcribe', z.object({ text: z.string().trim().min(1), language: z.string().nullish() }), { method: 'POST', body }, options);
}

export const apiClient = { checkHealth, runAnalysis, sendAssistantMessage, extractFromImage, transcribeAudio };
