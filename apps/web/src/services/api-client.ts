import { z } from 'zod';
import { analysisWireSchema, assistantWireSchema, fromApiAnalysis, fromApiAssistant, toApiDraft, toApiAssistant } from './api-adapters';
import type {
  AnalysisRequest, AnalysisResponse, AssistantMessageRequest, AssistantResponse,
  TranscriptionResponse,
} from './generated/types';

export class ApiClientError extends Error {
  readonly status?: number;
  readonly code: 'network' | 'http' | 'timeout' | 'invalid_response';
  readonly details?: unknown;

  constructor(
    message: string,
    code: ApiClientError['code'],
    options: { status?: number; details?: unknown; cause?: unknown } = {},
  ) {
    super(message, { cause: options.cause });
    this.name = 'ApiClientError';
    this.code = code;
    this.status = options.status;
    this.details = options.details;
  }
}

const baseUrl = (import.meta.env.VITE_API_BASE_URL || '/api/v1').replace(/\/+$/, '');

async function request<T>(path: string, schema: z.ZodType<T>, init: RequestInit = {}, timeoutMs = 30000): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
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
      const serverError = z.object({ error: z.object({ message: z.string() }) }).safeParse(details);
      throw new ApiClientError(serverError.success ? serverError.data.error.message : message, 'http', { status: result.status, details });
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
    if (controller.signal.aborted) {
      throw new ApiClientError('El servidor está tardando demasiado en responder. Vuelve a intentarlo.', 'timeout', { cause });
    }
    throw new ApiClientError('No pudimos conectar con el servidor. Revisa tu conexión y comprueba que la API esté disponible.', 'network', { cause });
  } finally {
    clearTimeout(timeout);
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

export async function sendAssistantMessage(payload: AssistantMessageRequest): Promise<AssistantResponse> {
  return fromApiAssistant(await postJson('/assistant/messages', toApiAssistant(payload), assistantWireSchema));
}

export async function extractFromImage(file: File, context?: string, draft?: Partial<AnalysisRequest>): Promise<AssistantResponse> {
  const body = new FormData();
  body.append('file', file);
  if (context) body.append('context', context);
  if (draft) body.append('draft', JSON.stringify(toApiDraft(draft)));
  return fromApiAssistant(await request('/assistant/extract-image', assistantWireSchema, { method: 'POST', body }, 130000));
}

export function transcribeAudio(audioBlob: Blob, filename = 'grabacion.webm'): Promise<TranscriptionResponse> {
  const body = new FormData();
  body.append('file', audioBlob, filename);
  return request('/assistant/transcribe', z.object({ text: z.string().trim().min(1), language: z.string().nullish() }), { method: 'POST', body }, 130000);
}

export const apiClient = { checkHealth, runAnalysis, sendAssistantMessage, extractFromImage, transcribeAudio };
