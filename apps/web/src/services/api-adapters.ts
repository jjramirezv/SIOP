import { z } from 'zod';
import type { AnalysisRequest, AnalysisResponse, AssistantMessageRequest, AssistantResponse, CandidateEvaluation } from './generated/types';

// Contrato HTTP de FastAPI. Los modelos planos de la interfaz se mantienen en
// generated/types.ts; esta frontera solo traduce datos, nunca calcula costos.
const period = z.enum(['day', 'month', 'year']);
const holding = z.object({ mode: z.enum(['fixed', 'percentage']), value: z.number(), period });
const tier = z.object({ min_quantity: z.number().int(), unit_price: z.number() });
const input = z.object({
  product_name: z.string(), currency: z.string(), demand: z.object({ value: z.number(), period }),
  order_cost: z.number(), holding_cost: holding, days_per_year: z.number().int(),
  discount_tiers: z.array(tier), current_order_quantity: z.number().int().nullish(),
});
const costs = z.object({ purchase: z.number(), ordering: z.number(), holding: z.number(), total: z.number() });
const order = z.object({
  tier_index: z.number().int(), quantity: z.number().int().positive(), unit_price: z.number(),
  annual_holding_per_unit: z.number(), investment_per_order: z.number(),
  orders_per_year: z.number(), cycle_days: z.number(), annual_costs: costs,
});
const candidate = z.object({
  tier_index: z.number().int(), min_quantity: z.number().int(), max_quantity_exclusive: z.number().int().nullable(),
  unit_price: z.number(), annual_holding_per_unit: z.number(), theoretical_eoq: z.number(),
  status: z.enum(['feasible', 'adjusted', 'excluded']), evaluated_quantity: z.number().int().nullable(),
  annual_costs: costs.nullable(), reason: z.string(), order: order.nullable(),
}).refine((value) => value.status === 'excluded'
  ? value.evaluated_quantity === null && value.annual_costs === null && value.order === null
  : value.order !== null && value.evaluated_quantity === value.order.quantity && value.annual_costs !== null,
{ message: 'Alternativa incompatible con su evaluación' });
export const analysisWireSchema = z.object({
  contract_version: z.literal('1.0.0'), model: z.literal('all_units_discount'), data_source: z.literal('calculated'),
  input, normalized: z.object({ annual_demand: z.number(), days_per_year: z.number(), holding_cost: holding }),
  candidates: z.array(candidate).min(1), recommended: order,
  comparison: z.object({ current: order, annual_savings: z.number(), savings_percentage: z.number() }).nullable(),
  assumptions: z.array(z.string()),
  steps: z.array(z.object({ title: z.string(), formula: z.string(), substitution: z.string(), result: z.string() })),
}).refine((value) => value.candidates.some((entry) => entry.tier_index === value.recommended.tier_index && entry.order?.quantity === value.recommended.quantity),
{ message: 'Falta la alternativa recomendada' });

const draft = z.object({
  product_name: z.string().nullish(), currency: z.string().nullish(),
  demand: z.object({ value: z.number().nullish(), period: period.nullish() }).nullish(),
  order_cost: z.number().nullish(), holding_cost: holding.partial().extend({
    mode: holding.shape.mode.nullish(), value: z.number().nullish(), period: period.nullish(),
  }).nullish(), days_per_year: z.number().int().nullish(),
  discount_tiers: z.array(z.object({ min_quantity: z.number().int().nullish(), unit_price: z.number().nullish() })).nullish(),
  current_order_quantity: z.number().int().nullish(),
});
const issue = z.object({ field: z.string(), message: z.string() });
export const assistantWireSchema = z.object({
  contract_version: z.literal('1.0.0'), data_source: z.literal('assistant'), message: z.string().min(1),
  action: z.enum(['clarify', 'review_input', 'explain', 'review_scenario']), proposed_input: draft.nullable(),
  missing_fields: z.array(issue), review_fields: z.array(issue), requires_confirmation: z.boolean(),
}).refine((value) => value.proposed_input === null || value.requires_confirmation,
{ message: 'La propuesta requiere revisión humana' });

export function toApiDraft(value: Partial<AnalysisRequest>) {
  return {
    product_name: value.product_name, currency: value.currency,
    demand: value.demand !== undefined || value.demand_period !== undefined
      ? { value: value.demand, period: value.demand_period } : undefined,
    order_cost: value.ordering_cost,
    holding_cost: value.holding_cost_mode !== undefined || value.holding_cost_value !== undefined || value.holding_cost_period !== undefined
      ? { mode: value.holding_cost_mode, value: value.holding_cost_value, period: value.holding_cost_period } : undefined,
    days_per_year: value.days_per_year, discount_tiers: value.discount_tiers,
    current_order_quantity: value.current_order_quantity,
  };
}

function fromApiDraft(value: z.infer<typeof draft>): Partial<AnalysisRequest> {
  const result: Partial<AnalysisRequest> = {};
  if (value.product_name != null) result.product_name = value.product_name;
  if (value.currency != null) result.currency = value.currency;
  if (value.demand?.value != null) result.demand = value.demand.value;
  if (value.demand?.period != null) result.demand_period = value.demand.period;
  if (value.order_cost != null) result.ordering_cost = value.order_cost;
  if (value.holding_cost?.mode != null) result.holding_cost_mode = value.holding_cost.mode;
  if (value.holding_cost?.value != null) result.holding_cost_value = value.holding_cost.value;
  if (value.holding_cost?.period != null) result.holding_cost_period = value.holding_cost.period;
  if (value.days_per_year != null) result.days_per_year = value.days_per_year;
  if (value.current_order_quantity != null) result.current_order_quantity = value.current_order_quantity;
  // NaN representa un input vacío pendiente de revisión, nunca un número inventado.
  if (value.discount_tiers != null) result.discount_tiers = value.discount_tiers.map((entry) => ({
    min_quantity: entry.min_quantity ?? NaN, unit_price: entry.unit_price ?? NaN,
  }));
  return result;
}

export function toApiAssistant(value: AssistantMessageRequest) {
  return {
    message: value.message, draft: value.current_draft ? toApiDraft(value.current_draft) : null,
    analysis_input: value.current_result?.analyzed_input ? toApiDraft(value.current_result.analyzed_input) : null,
    history: value.history?.slice(-10),
  };
}

export function fromApiAnalysis(value: z.infer<typeof analysisWireSchema>): AnalysisResponse {
  const alternatives = value.candidates.filter((entry) => entry.status !== 'excluded').map((entry): CandidateEvaluation => {
    const evaluated = entry.order!;
    return {
      tier_index: entry.tier_index, min_quantity: entry.min_quantity,
      max_quantity: entry.max_quantity_exclusive === null ? null : entry.max_quantity_exclusive - 1,
      unit_price: entry.unit_price, eoq_raw: entry.theoretical_eoq, feasible_quantity: evaluated.quantity,
      status_label: entry.status === 'feasible' ? 'EOQ factible en rango' : 'Ajustado al mínimo del tramo',
      annual_purchase_cost: evaluated.annual_costs.purchase, annual_ordering_cost: evaluated.annual_costs.ordering,
      annual_holding_cost: evaluated.annual_costs.holding, total_annual_cost: evaluated.annual_costs.total,
      order_investment: evaluated.investment_per_order, orders_per_year: evaluated.orders_per_year,
      cycle_time_days: evaluated.cycle_days, is_recommended: entry.tier_index === value.recommended.tier_index,
    };
  });
  const comparison = value.comparison;
  const normalizedHolding = value.normalized.holding_cost;
  return {
    recommended: alternatives.find((entry) => entry.is_recommended)!, alternatives,
    excluded_candidates: value.candidates.filter((entry) => entry.status === 'excluded').map((entry) => ({
      tier_index: entry.tier_index, min_quantity: entry.min_quantity,
      max_quantity: entry.max_quantity_exclusive === null ? null : entry.max_quantity_exclusive - 1,
      unit_price: entry.unit_price, reason: entry.reason,
    })),
    analyzed_input: fromApiDraft(value.input) as AnalysisRequest,
    current_comparison: comparison ? {
      current_quantity: comparison.current.quantity, unit_price: comparison.current.unit_price,
      annual_purchase_cost: comparison.current.annual_costs.purchase,
      annual_ordering_cost: comparison.current.annual_costs.ordering,
      annual_holding_cost: comparison.current.annual_costs.holding, total_annual_cost: comparison.current.annual_costs.total,
      annual_savings: comparison.annual_savings, savings_percentage: comparison.savings_percentage,
    } : null,
    procedure: {
      annualized_demand: value.normalized.annual_demand, annual_ordering_cost_param: value.input.order_cost,
      holding_cost_summary: `${normalizedHolding.value} ${normalizedHolding.mode === 'percentage' ? '% del precio' : `${value.input.currency} por unidad`} al año`,
      formulas_used: [...new Set(value.steps.map((entry) => entry.formula).filter(Boolean))],
      step_by_step: value.steps.map((entry) => `${entry.title}: ${entry.substitution} → ${entry.result}`),
      assumptions: value.assumptions,
    },
  };
}

export function mapApiField(path: string): string {
  const aliases: Record<string, string> = {
    'demand.value': 'demand', 'demand.period': 'demand_period', order_cost: 'ordering_cost',
    'holding_cost.mode': 'holding_cost_mode', 'holding_cost.value': 'holding_cost_value',
    'holding_cost.period': 'holding_cost_period', holding_cost: 'holding_cost_value',
  };
  return aliases[path] ?? path;
}

export function fromApiAssistant(value: z.infer<typeof assistantWireSchema>): AssistantResponse {
  return {
    reply_message: value.message, proposed_data: value.proposed_input ? fromApiDraft(value.proposed_input) : null,
    missing_fields: value.missing_fields.flatMap((entry) => entry.field === 'demand' ? ['demand', 'demand_period']
      : entry.field === 'holding_cost' ? ['holding_cost_mode', 'holding_cost_value', 'holding_cost_period'] : [mapApiField(entry.field)]),
    fields_to_review: value.review_fields.map((entry) => mapApiField(entry.field)),
    suggested_action: ({ clarify: 'clarify', review_input: 'propose_data', explain: 'explain', review_scenario: 'evaluate' } as const)[value.action],
  };
}
