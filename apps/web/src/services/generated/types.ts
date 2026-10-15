export type TimePeriod = 'day' | 'month' | 'year';
export type HoldingCostMode = 'fixed' | 'percentage';

export interface DiscountTier {
  min_quantity: number;
  unit_price: number;
}

export interface AnalysisRequest {
  product_name: string;
  currency: string;
  demand: number;
  demand_period: TimePeriod;
  days_per_year: number;
  ordering_cost: number;
  holding_cost_mode: HoldingCostMode;
  holding_cost_value: number; // Si es 'percentage', 10 representa 10%. Si es 'fixed', representa monto monetario.
  holding_cost_period: TimePeriod;
  discount_tiers: DiscountTier[];
  current_order_quantity?: number | null;
}

export interface CandidateEvaluation {
  tier_index: number;
  min_quantity: number;
  max_quantity: number | null;
  unit_price: number;
  eoq_raw: number;
  feasible_quantity: number;
  status_label: 'EOQ factible en rango' | 'Ajustado al mínimo del tramo' | 'Descartado';
  annual_purchase_cost: number;
  annual_ordering_cost: number;
  annual_holding_cost: number;
  total_annual_cost: number;
  order_investment: number;
  orders_per_year: number;
  cycle_time_days: number;
  is_recommended: boolean;
}

export interface CurrentQuantityComparison {
  current_quantity: number;
  unit_price: number;
  annual_purchase_cost: number;
  annual_ordering_cost: number;
  annual_holding_cost: number;
  total_annual_cost: number;
  annual_savings: number;
  savings_percentage: number;
}

export interface ProcedureDetails {
  annualized_demand: number;
  annual_ordering_cost_param: number;
  holding_cost_summary: string;
  formulas_used: string[];
  step_by_step: string[];
  assumptions: string[];
}

export interface AnalysisResponse {
  recommended: CandidateEvaluation;
  alternatives: CandidateEvaluation[];
  current_comparison: CurrentQuantityComparison | null;
  procedure: ProcedureDetails;
}

export interface AssistantMessageRequest {
  message: string;
  current_draft?: Partial<AnalysisRequest> | null;
  current_result?: AnalysisResponse | null;
}

export interface AssistantResponse {
  reply_message: string;
  proposed_data: Partial<AnalysisRequest> | null;
  missing_fields: string[];
  fields_to_review: string[];
  suggested_action: 'propose_data' | 'clarify' | 'evaluate' | 'explain';
}

export interface TranscriptionResponse {
  text: string;
  duration_seconds?: number;
}
