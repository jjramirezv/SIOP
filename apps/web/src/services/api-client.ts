import { z } from 'zod';
import {
  mockAssistantMessage, mockExtractImage, mockTranscribeAudio, resolveMockAnalysis,
} from '../mocks/reference-cases';
import type {
  AnalysisRequest, AnalysisResponse, AssistantMessageRequest, AssistantResponse,
  TranscriptionResponse,
} from './generated/types';

export class ApiClientError extends Error {
  readonly status?: number;
  readonly code: 'network' | 'http' | 'timeout' | 'invalid_response' | 'mock';
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

const baseUrl = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api/v1').replace(/\/+$/, '');
let useMocks: boolean = import.meta.env.VITE_USE_MOCKS !== 'false';

export function setUseMocks(value: boolean): void { useMocks = value; }
export function getUseMocks(): boolean { return useMocks; }

const candidateSchema = z.object({
  tier_index: z.number(), min_quantity: z.number(), max_quantity: z.number().nullable(),
  unit_price: z.number(), eoq_raw: z.number(), feasible_quantity: z.number(),
  status_label: z.enum(['EOQ factible en rango', 'Ajustado al mínimo del tramo', 'Descartado']),
  annual_purchase_cost: z.number(), annual_ordering_cost: z.number(), annual_holding_cost: z.number(),
  total_annual_cost: z.number(), order_investment: z.number(), orders_per_year: z.number(),
  cycle_time_days: z.number(), is_recommended: z.boolean(),
});
const requestSchema = z.object({
  product_name: z.string(), currency: z.string(), demand: z.number(),
  demand_period: z.enum(['day', 'month', 'year']), days_per_year: z.number(),
  ordering_cost: z.number(), holding_cost_mode: z.enum(['fixed', 'percentage']),
  holding_cost_value: z.number(), holding_cost_period: z.enum(['day', 'month', 'year']),
  discount_tiers: z.array(z.object({ min_quantity: z.number(), unit_price: z.number() })),
  current_order_quantity: z.number().nullish(),
});
const analysisSchema: z.ZodType<AnalysisResponse> = z.object({
  recommended: candidateSchema, alternatives: z.array(candidateSchema),
  current_comparison: z.object({
    current_quantity: z.number(), unit_price: z.number(), annual_purchase_cost: z.number(),
    annual_ordering_cost: z.number(), annual_holding_cost: z.number(), total_annual_cost: z.number(),
    annual_savings: z.number(), savings_percentage: z.number(),
  }).nullable(),
  procedure: z.object({
    annualized_demand: z.number(), annual_ordering_cost_param: z.number(), holding_cost_summary: z.string(),
    formulas_used: z.array(z.string()), step_by_step: z.array(z.string()), assumptions: z.array(z.string()),
  }),
});
const assistantSchema: z.ZodType<AssistantResponse> = z.object({
  reply_message: z.string(), proposed_data: requestSchema.partial().nullable(),
  missing_fields: z.array(z.string()), fields_to_review: z.array(z.string()),
  suggested_action: z.enum(['propose_data', 'clarify', 'evaluate', 'explain']),
});
const transcriptionSchema: z.ZodType<TranscriptionResponse> = z.object({
  text: z.string(), duration_seconds: z.number().optional(),
});

async function request<T>(path: string, schema: z.ZodType<T>, init: RequestInit = {}): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);
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
      throw new ApiClientError(message, 'http', { status: result.status, details });
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

async function simulated<T>(resolve: () => T): Promise<T> {
  await new Promise<void>((done) => setTimeout(done, 350));
  try { return resolve(); } catch (cause) {
    throw new ApiClientError(
      cause instanceof Error ? cause.message : 'No se pudo preparar la respuesta simulada. Carga un caso de referencia.',
      'mock', { cause },
    );
  }
}

function postJson<T>(path: string, payload: unknown, schema: z.ZodType<T>): Promise<T> {
  return request(path, schema, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
  });
}

export async function checkHealth(): Promise<{ status: string; ai_available: boolean; mode: 'mock' | 'real' }> {
  if (useMocks) return { status: 'ok', ai_available: false, mode: 'mock' };
  const health = await request('/health', z.object({ status: z.string(), ai_available: z.boolean() }));
  return { ...health, mode: 'real' };
}

export function runAnalysis(payload: AnalysisRequest): Promise<AnalysisResponse> {
  return useMocks
    ? simulated(() => resolveMockAnalysis(payload))
    : postJson('/analyses', payload, analysisSchema);
}

export function sendAssistantMessage(payload: AssistantMessageRequest): Promise<AssistantResponse> {
  return useMocks
    ? simulated(() => mockAssistantMessage(payload))
    : postJson('/assistant/messages', payload, assistantSchema);
}

export function extractFromImage(file: File, context?: string): Promise<AssistantResponse> {
  if (useMocks) return simulated(() => mockExtractImage(file, context));
  const body = new FormData();
  body.append('file', file);
  if (context !== undefined) body.append('context', context);
  return request('/assistant/extract-image', assistantSchema, { method: 'POST', body });
}

export function transcribeAudio(audioBlob: Blob, filename = 'grabacion.webm'): Promise<TranscriptionResponse> {
  if (useMocks) return simulated(() => {
    const { text, duration_seconds } = mockTranscribeAudio(audioBlob, filename);
    return { text, duration_seconds };
  });
  const body = new FormData();
  body.append('file', audioBlob, filename);
  return request('/assistant/transcribe', transcriptionSchema, { method: 'POST', body });
}

export const apiClient = {
  get useMocks(): boolean { return useMocks; },
  set useMocks(value: boolean) { setUseMocks(value); },
  setUseMocks, getUseMocks, checkHealth, runAnalysis, sendAssistantMessage, extractFromImage, transcribeAudio,
};
