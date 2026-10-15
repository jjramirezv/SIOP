import type { AnalysisRequest } from '../../services/generated/types';
export type ReferenceCaseId = 'ily' | 'wohl' | 'sensibilidad_a' | 'sensibilidad_b';
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


export const REFERENCE_CASES = {
 ily: {id: 'ily', request: ilyRequest},
 wohl: {id: 'wohl', request: wohlRequest},
 sensibilidad_a: {id: 'sensibilidad_a', request: sensitivityARequest},
 sensibilidad_b: {id: 'sensibilidad_b', request: sensitivityBRequest},
} as const;
