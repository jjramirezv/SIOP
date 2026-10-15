import type {
  AnalysisRequest,
  AnalysisResponse,
  AssistantMessageRequest,
  AssistantResponse,
  CandidateEvaluation,
  CurrentQuantityComparison,
  ProcedureDetails,
  TimePeriod,
  TranscriptionResponse,
} from '../../src/services/generated/types';

export type ReferenceCaseId = 'ily' | 'wohl' | 'sensibilidad_a' | 'sensibilidad_b';

export interface ReferenceCase {
  id: ReferenceCaseId;
  title: string;
  subtitle: string;
  badge: string;
  request: AnalysisRequest;
  response: AnalysisResponse;
}

const ilyRequest: AnalysisRequest = {
  product_name: 'Caso ILY - Insumos Industriales', currency: 'USD',
  demand: 10000, demand_period: 'year', days_per_year: 365, ordering_cost: 9,
  holding_cost_mode: 'percentage', holding_cost_value: 10, holding_cost_period: 'year',
  current_order_quantity: 316,
  discount_tiers: [
    { min_quantity: 0, unit_price: 20 },
    { min_quantity: 250, unit_price: 18 },
    { min_quantity: 1000, unit_price: 15 },
  ],
};

const wohlRequest: AnalysisRequest = {
  product_name: 'Caso Wohl - Distribución Mayorista', currency: 'USD',
  demand: 5000, demand_period: 'year', days_per_year: 365, ordering_cost: 49,
  holding_cost_mode: 'percentage', holding_cost_value: 20, holding_cost_period: 'year',
  current_order_quantity: 700,
  discount_tiers: [
    { min_quantity: 0, unit_price: 5 },
    { min_quantity: 1000, unit_price: 4.80 },
    { min_quantity: 2000, unit_price: 4.75 },
  ],
};

const sensitivityARequest: AnalysisRequest = {
  product_name: 'Sensibilidad A (Mantenimiento Moderado)', currency: 'PEN',
  demand: 2400, demand_period: 'year', days_per_year: 360, ordering_cost: 40,
  holding_cost_mode: 'fixed', holding_cost_value: 5, holding_cost_period: 'year',
  current_order_quantity: 200,
  discount_tiers: [
    { min_quantity: 0, unit_price: 20 },
    { min_quantity: 200, unit_price: 19.60 },
    { min_quantity: 500, unit_price: 19.20 },
  ],
};

// El contrato indica los mismos datos de A, incluido product_name, con estos dos cambios.
const sensitivityBRequest: AnalysisRequest = {
  ...structuredClone(sensitivityARequest), holding_cost_value: 10, current_order_quantity: 500,
};

// Valores literales de la Sección 4: no se calcula ni se redondea un EOQ en el cliente.
const ilyAlternatives: CandidateEvaluation[] = [
  {
    tier_index: 0, min_quantity: 0, max_quantity: 249, unit_price: 20,
    eoq_raw: 300, feasible_quantity: 249, status_label: 'Descartado',
    annual_purchase_cost: 200000, annual_ordering_cost: 361.45, annual_holding_cost: 249,
    total_annual_cost: 200610.45, order_investment: 4980, orders_per_year: 40.16,
    cycle_time_days: 9.09, is_recommended: false,
  },
  {
    tier_index: 1, min_quantity: 250, max_quantity: 999, unit_price: 18,
    eoq_raw: 316.23, feasible_quantity: 316, status_label: 'EOQ factible en rango',
    annual_purchase_cost: 180000, annual_ordering_cost: 284.81, annual_holding_cost: 284.40,
    total_annual_cost: 180569.21, order_investment: 5688, orders_per_year: 31.65,
    cycle_time_days: 11.53, is_recommended: false,
  },
  {
    tier_index: 2, min_quantity: 1000, max_quantity: null, unit_price: 15,
    eoq_raw: 346.41, feasible_quantity: 1000, status_label: 'Ajustado al mínimo del tramo',
    annual_purchase_cost: 150000, annual_ordering_cost: 90, annual_holding_cost: 750,
    total_annual_cost: 150840, order_investment: 15000, orders_per_year: 10,
    cycle_time_days: 36.5, is_recommended: true,
  },
];

const wohlAlternatives: CandidateEvaluation[] = [
  {
    tier_index: 0, min_quantity: 0, max_quantity: 999, unit_price: 5,
    eoq_raw: 700, feasible_quantity: 700, status_label: 'EOQ factible en rango',
    annual_purchase_cost: 25000, annual_ordering_cost: 350, annual_holding_cost: 350,
    total_annual_cost: 25700, order_investment: 3500, orders_per_year: 7.14,
    cycle_time_days: 51.1, is_recommended: false,
  },
  {
    tier_index: 1, min_quantity: 1000, max_quantity: 1999, unit_price: 4.80,
    eoq_raw: 714.43, feasible_quantity: 1000, status_label: 'Ajustado al mínimo del tramo',
    annual_purchase_cost: 24000, annual_ordering_cost: 245, annual_holding_cost: 480,
    total_annual_cost: 24725, order_investment: 4800, orders_per_year: 5,
    cycle_time_days: 73, is_recommended: true,
  },
  {
    tier_index: 2, min_quantity: 2000, max_quantity: null, unit_price: 4.75,
    eoq_raw: 718.18, feasible_quantity: 2000, status_label: 'Ajustado al mínimo del tramo',
    annual_purchase_cost: 23750, annual_ordering_cost: 122.5, annual_holding_cost: 950,
    total_annual_cost: 24822.5, order_investment: 9500, orders_per_year: 2.5,
    cycle_time_days: 146, is_recommended: false,
  },
];

const sensitivityAAlternatives: CandidateEvaluation[] = [
  {
    tier_index: 0, min_quantity: 0, max_quantity: 199, unit_price: 20,
    eoq_raw: 195.96, feasible_quantity: 196, status_label: 'EOQ factible en rango',
    annual_purchase_cost: 48000, annual_ordering_cost: 489.80, annual_holding_cost: 490,
    total_annual_cost: 48979.80, order_investment: 3920, orders_per_year: 12.24,
    cycle_time_days: 29.4, is_recommended: false,
  },
  {
    tier_index: 1, min_quantity: 200, max_quantity: 499, unit_price: 19.60,
    eoq_raw: 195.96, feasible_quantity: 200, status_label: 'Ajustado al mínimo del tramo',
    annual_purchase_cost: 47040, annual_ordering_cost: 480, annual_holding_cost: 500,
    total_annual_cost: 48020, order_investment: 3920, orders_per_year: 12,
    cycle_time_days: 30, is_recommended: false,
  },
  {
    tier_index: 2, min_quantity: 500, max_quantity: null, unit_price: 19.20,
    eoq_raw: 195.96, feasible_quantity: 500, status_label: 'Ajustado al mínimo del tramo',
    annual_purchase_cost: 46080, annual_ordering_cost: 192, annual_holding_cost: 1250,
    total_annual_cost: 47522, order_investment: 9600, orders_per_year: 4.8,
    cycle_time_days: 75, is_recommended: true,
  },
];

const sensitivityBAlternatives: CandidateEvaluation[] = [
  {
    tier_index: 0, min_quantity: 0, max_quantity: 199, unit_price: 20,
    eoq_raw: 138.56, feasible_quantity: 139, status_label: 'EOQ factible en rango',
    annual_purchase_cost: 48000, annual_ordering_cost: 690.65, annual_holding_cost: 695,
    total_annual_cost: 49385.65, order_investment: 2780, orders_per_year: 17.27,
    cycle_time_days: 20.85, is_recommended: false,
  },
  {
    tier_index: 1, min_quantity: 200, max_quantity: 499, unit_price: 19.60,
    eoq_raw: 138.56, feasible_quantity: 200, status_label: 'Ajustado al mínimo del tramo',
    annual_purchase_cost: 47040, annual_ordering_cost: 480, annual_holding_cost: 1000,
    total_annual_cost: 48520, order_investment: 3920, orders_per_year: 12,
    cycle_time_days: 30, is_recommended: true,
  },
  {
    tier_index: 2, min_quantity: 500, max_quantity: null, unit_price: 19.20,
    eoq_raw: 138.56, feasible_quantity: 500, status_label: 'Ajustado al mínimo del tramo',
    annual_purchase_cost: 46080, annual_ordering_cost: 192, annual_holding_cost: 2500,
    total_annual_cost: 48772, order_investment: 9600, orders_per_year: 4.8,
    cycle_time_days: 75, is_recommended: false,
  },
];

function procedure(request: AnalysisRequest, alternatives: CandidateEvaluation[]): ProcedureDetails {
  const recommended = alternatives.find((candidate) => candidate.is_recommended)!;
  return {
    annualized_demand: request.demand,
    annual_ordering_cost_param: request.ordering_cost,
    holding_cost_summary: request.holding_cost_mode === 'percentage'
      ? `${request.holding_cost_value}% anual del precio de cada tramo: H = (tasa / 100) × P.`
      : `${request.holding_cost_value} ${request.currency} por unidad y año, constante en todos los tramos.`,
    formulas_used: [
      'D anual = demanda diaria × días por año; D anual = demanda mensual × 12; D anual = demanda anual.',
      'H anual = mantenimiento por período × factor anual (día: días por año; mes: 12; año: 1).',
      'H = (porcentaje anual / 100) × P, o H = costo fijo anual por unidad.',
      'Q* = √((2 × D × S) / H)',
      'CT(Q) = D·P + (D/Q)·S + (Q/2)·H',
      'Inversión = Q × P; pedidos/año = D/Q; ciclo en días = (Q/D) × días por año.',
    ],
    step_by_step: [
      `Normalizar la demanda: ${request.demand} unidades/año × 1 = ${request.demand} unidades/año. Doce meses por año y ${request.days_per_year} días por año.`,
      ...(request.demand === 2400 ? ['Equivalencia mensual: 200 unidades/mes × 12 meses/año = 2400 unidades/año.'] : []),
      `El costo por pedido S = ${request.ordering_cost} ${request.currency} se conserva por pedido; no se multiplica por 12 ni por los días del año.`,
      `Normalizar mantenimiento: ${request.holding_cost_value}${request.holding_cost_mode === 'percentage' ? '%' : ` ${request.currency}/unidad`} al año × 1. Si se ingresa por mes, multiplicar por 12; por día, por ${request.days_per_year}.`,
      ...alternatives.map((candidate) =>
        `Tramo ${candidate.tier_index + 1}: P = ${candidate.unit_price}; Q* precalculado = ${candidate.eoq_raw}; cantidad evaluada = ${candidate.feasible_quantity} (${candidate.status_label}). CT = ${candidate.annual_purchase_cost} + ${candidate.annual_ordering_cost} + ${candidate.annual_holding_cost} = ${candidate.total_annual_cost} ${request.currency}/año.`,
      ),
      `Recomendación precalculada: ${recommended.feasible_quantity} unidades a ${recommended.unit_price} ${request.currency}; costo anual ${recommended.total_annual_cost} ${request.currency}.`,
    ],
    assumptions: [
      'Demanda conocida, constante y uniforme; reposición completa e instantánea, sin faltantes.',
      'El descuento se aplica a todas las unidades del pedido; los tramos no tienen huecos ni superposiciones.',
      'El inventario promedio es la mitad del pedido y todos los costos se comparan en base anual.',
      'El mantenimiento porcentual se aplica al precio de cada tramo; el mantenimiento fijo no depende del precio.',
      'La moneda solo es una etiqueta de presentación; no se convierten divisas.',
      'Datos simulados: las cantidades y costos de las alternativas conservan exactamente la referencia, incluidos sus redondeos. El motor oficial está en el backend.',
    ],
  };
}

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/** Única aritmética del mock: costo de la compra actual (RF-05), sin optimizar EOQ. */
function compareCurrent(
  request: AnalysisRequest, alternatives: CandidateEvaluation[], recommended: CandidateEvaluation,
): CurrentQuantityComparison | null {
  const quantity = request.current_order_quantity;
  if (quantity == null) return null;
  if (!Number.isFinite(quantity) || quantity <= 0) {
    throw new Error('La cantidad de compra actual debe ser un número mayor que cero.');
  }
  const tier = [...request.discount_tiers].reverse().find((entry) => quantity >= entry.min_quantity)!;
  const existing = alternatives.find((entry) => entry.feasible_quantity === quantity);
  const holding = request.holding_cost_mode === 'fixed'
    ? request.holding_cost_value
    : request.holding_cost_value / 100 * tier.unit_price;
  // Si existe un candidato precalculado, sus centavos son la fuente de verdad.
  const purchase = existing?.annual_purchase_cost ?? request.demand * tier.unit_price;
  const ordering = existing?.annual_ordering_cost ?? request.demand / quantity * request.ordering_cost;
  const storage = existing?.annual_holding_cost ?? quantity / 2 * holding;
  const total = existing?.total_annual_cost ?? purchase + ordering + storage;
  const savings = total - recommended.total_annual_cost;
  return {
    current_quantity: quantity, unit_price: tier.unit_price,
    annual_purchase_cost: roundMoney(purchase), annual_ordering_cost: roundMoney(ordering),
    annual_holding_cost: roundMoney(storage), total_annual_cost: roundMoney(total),
    annual_savings: roundMoney(savings), savings_percentage: roundMoney(savings / total * 100),
  };
}

function response(request: AnalysisRequest, alternatives: CandidateEvaluation[]): AnalysisResponse {
  const recommended = alternatives.find((candidate) => candidate.is_recommended)!;
  return {
    recommended, alternatives,
    current_comparison: compareCurrent(request, alternatives, recommended),
    procedure: procedure(request, alternatives),
  };
}

export const REFERENCE_CASES: Record<ReferenceCaseId, ReferenceCase> = {
  ily: {
    id: 'ily', title: 'Caso ILY', subtitle: 'Insumos industriales · mantenimiento porcentual',
    badge: 'Referencia', request: ilyRequest, response: response(ilyRequest, ilyAlternatives),
  },
  wohl: {
    id: 'wohl', title: 'Caso Wohl', subtitle: 'Distribución mayorista · descuentos por volumen',
    badge: 'Referencia', request: wohlRequest, response: response(wohlRequest, wohlAlternatives),
  },
  sensibilidad_a: {
    id: 'sensibilidad_a', title: 'Sensibilidad A', subtitle: 'Mantenimiento moderado · 5 por unidad/año',
    badge: 'Simulado', request: sensitivityARequest,
    response: response(sensitivityARequest, sensitivityAAlternatives),
  },
  sensibilidad_b: {
    id: 'sensibilidad_b', title: 'Sensibilidad B', subtitle: 'Mantenimiento alto · 10 por unidad/año',
    badge: 'Simulado', request: sensitivityBRequest,
    response: response(sensitivityBRequest, sensitivityBAlternatives),
  },
};

const annualFactor = (period: TimePeriod, days: number): number =>
  period === 'month' ? 12 : period === 'day' ? days : 1;

const equivalent = (left: number, right: number): boolean =>
  Number.isFinite(left) && Math.abs(left - right) <= 1e-9 * Math.max(1, Math.abs(right));

export function resolveMockAnalysis(req: AnalysisRequest): AnalysisResponse {
  const reference = Object.values(REFERENCE_CASES).find(({ request }) =>
    equivalent(req.demand * annualFactor(req.demand_period, req.days_per_year), request.demand)
    && req.days_per_year === request.days_per_year
    && req.ordering_cost === request.ordering_cost
    && req.holding_cost_mode === request.holding_cost_mode
    && equivalent(req.holding_cost_value * annualFactor(req.holding_cost_period, req.days_per_year), request.holding_cost_value)
    && req.discount_tiers.length === request.discount_tiers.length
    && req.discount_tiers.every((tier, index) =>
      tier.min_quantity === request.discount_tiers[index].min_quantity
      && tier.unit_price === request.discount_tiers[index].unit_price),
  );
  if (!reference) {
    throw new Error('El modo simulado admite los casos ILY, Wohl y Sensibilidad A/B. Carga un caso de referencia o activa la API real para analizar otros datos.');
  }
  const result = structuredClone(reference.response);
  result.current_comparison = compareCurrent(
    { ...reference.request, current_order_quantity: req.current_order_quantity },
    result.alternatives, result.recommended,
  );
  return result;
}

function assistantDraft(text: string, source: string): AssistantResponse {
  const sensitivity = /sensibilidad|2400|2[.,]400|200|mantenimient[oa]\s+fijo/i.test(text);
  const draft = structuredClone(sensitivity ? sensitivityARequest : ilyRequest);
  const short = text.trim().length < 40;
  if (sensitivity && /mensual|al mes|por mes|\/mes/i.test(text)) {
    draft.demand = 200;
    draft.demand_period = 'month';
  }
  const proposed: Partial<AnalysisRequest> = { ...draft };
  const missing = short ? ['demand', 'demand_period', 'ordering_cost'] : [];
  for (const field of missing) delete proposed[field as keyof AnalysisRequest];
  return {
    reply_message: short
      ? `Simulación de ${source}: preparé un borrador de ejemplo. ¿Cuántas unidades vendes, en qué período y cuánto cuesta cada pedido? Revisa también mantenimiento y descuentos antes de aplicarlo.`
      : `Simulación de ${source}: este borrador usa el caso ${sensitivity ? 'Sensibilidad A' : 'ILY'} como ejemplo; no es una extracción real. Revisa los datos y aplícalos solo cuando los confirmes.`,
    proposed_data: proposed, missing_fields: missing,
    fields_to_review: ['holding_cost_value', 'discount_tiers'],
    suggested_action: short ? 'clarify' : 'propose_data',
  };
}

export function mockAssistantMessage(payload: AssistantMessageRequest): AssistantResponse {
  if (/expl[ií]came el resultado/i.test(payload.message)) {
    if (!payload.current_result) return {
      reply_message: 'Calcula con los datos actuales para que pueda explicar una recomendación vigente.',
      proposed_data: null, missing_fields: [], fields_to_review: [], suggested_action: 'clarify',
    };
    const { recommended, current_comparison } = payload.current_result;
    const currency = payload.current_draft?.currency ?? 'unidades monetarias';
    return {
      reply_message: `Explicación simulada del cálculo enviado: conviene pedir ${recommended.feasible_quantity} unidades para conseguir un precio de ${recommended.unit_price} ${currency} por unidad. El desembolso de cada pedido es ${recommended.order_investment} ${currency}, mientras que el costo total anual es ${recommended.total_annual_cost} ${currency}. Al comparar las alternativas evaluadas, este tramo combina el menor costo anual de compra, pedidos y almacenamiento.${current_comparison ? ` Frente a tu compra actual, el ahorro anual indicado por el análisis es ${current_comparison.annual_savings} ${currency}.` : ''}`,
      proposed_data: null, missing_fields: [], fields_to_review: [], suggested_action: 'explain',
    };
  }
  if (/prueba otro escenario/i.test(payload.message)) {
    const draft = payload.current_draft?.holding_cost_mode === 'fixed'
      ? structuredClone(payload.current_draft) : structuredClone(sensitivityARequest);
    draft.holding_cost_value = draft.holding_cost_value === 5 ? 10 : 5;
    return {
      reply_message: 'Propuesta simulada: prueba otro costo de mantenimiento para comparar su efecto. Revisa el borrador antes de aplicarlo; la recomendación se pedirá al servicio de análisis después de tu confirmación.',
      proposed_data: draft, missing_fields: [], fields_to_review: ['holding_cost_value', 'discount_tiers'],
      suggested_action: 'propose_data',
    };
  }
  return assistantDraft(payload.message, 'texto');
}

export function mockExtractImage(file: File, context = ''): AssistantResponse {
  if (file.name === 'cotizacion-demo.png') {
    return assistantDraft('Sensibilidad A: demanda 2400 unidades al año, pedido 40 soles, mantenimiento fijo 5 por unidad al año y precios 20, 19.60 y 19.20.', 'fotografía de demostración');
  }
  return assistantDraft(context, 'fotografía');
}

// Incluye el borrador solicitado y el texto editable del contrato de transcripción.
export const MOCK_TRANSCRIPTION_TEXT = 'Vendo 200 unidades al mes. Hacer un pedido cuesta 40 soles y guardar cada unidad cuesta 5 soles al año. Los precios son 20 soles, 19.60 desde 200 unidades y 19.20 desde 500.';

export function mockTranscribeAudio(
  _audioBlob: Blob, _filename = 'grabacion.webm',
): AssistantResponse & TranscriptionResponse {
  const text = MOCK_TRANSCRIPTION_TEXT;
  return { ...assistantDraft(text, 'voz'), text, duration_seconds: 12 };
}
