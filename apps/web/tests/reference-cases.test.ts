import { describe, expect, it } from 'vitest';
import {
  mockAssistantMessage, mockExtractImage, mockTranscribeAudio,
  REFERENCE_CASES, resolveMockAnalysis,
} from './fixtures/reference-cases';

describe('Casos de aceptación del contrato', () => {
  it.each([
    ['ily', 1000, 150840], ['wohl', 1000, 24725],
    ['sensibilidad_a', 500, 47522], ['sensibilidad_b', 200, 48520],
  ] as const)('%s conserva su recomendación y todos los valores de referencia', (id, quantity, total) => {
    const entry = REFERENCE_CASES[id];
    const result = resolveMockAnalysis(entry.request);
    expect(result).toEqual(entry.response);
    expect(result.recommended.feasible_quantity).toBe(quantity);
    expect(result.recommended.total_annual_cost).toBe(total);
    expect(result.alternatives.filter((alternative) => alternative.is_recommended)).toHaveLength(1);
    expect(result.procedure.formulas_used).toContain('Q* = √((2 × D × S) / H)');
    expect(result.procedure.formulas_used).toContain('CT(Q) = D·P + (D/Q)·S + (Q/2)·H');
  });

  it('200 unidades por mes equivale exactamente a 2400 por año', () => {
    const entry = REFERENCE_CASES.sensibilidad_a;
    expect(resolveMockAnalysis({ ...entry.request, demand: 200, demand_period: 'month' })).toEqual(entry.response);
  });

  it('reconoce períodos diarios y mantenimiento mensual equivalentes', () => {
    const entry = REFERENCE_CASES.sensibilidad_a;
    expect(resolveMockAnalysis({
      ...entry.request, demand: 2400 / 360, demand_period: 'day',
      holding_cost_value: 5 / 12, holding_cost_period: 'month',
    })).toEqual(entry.response);
  });

  it('subir el mantenimiento de A a 10 devuelve B conservando la cantidad actual', () => {
    const result = resolveMockAnalysis({ ...REFERENCE_CASES.sensibilidad_a.request, holding_cost_value: 10 });
    expect(result.recommended).toEqual(REFERENCE_CASES.sensibilidad_b.response.recommended);
    expect(result.alternatives).toEqual(REFERENCE_CASES.sensibilidad_b.response.alternatives);
    expect(result.current_comparison?.current_quantity).toBe(200);
    expect(result.current_comparison?.annual_savings).toBe(0);
  });

  it.each([
    [199, 20], [200, 19.60], [499, 19.60], [500, 19.20], [750, 19.20],
  ])('compara una compra de %s unidades al precio correcto de %s', (quantity, price) => {
    const result = resolveMockAnalysis({ ...REFERENCE_CASES.sensibilidad_a.request, current_order_quantity: quantity });
    expect(result.recommended).toEqual(REFERENCE_CASES.sensibilidad_a.response.recommended);
    expect(result.current_comparison?.unit_price).toBe(price);
    if (quantity === 750) {
      expect(result.current_comparison).toEqual({
        current_quantity: 750, unit_price: 19.20, annual_purchase_cost: 46080,
        annual_ordering_cost: 128, annual_holding_cost: 1875,
        total_annual_cost: 48083, annual_savings: 561, savings_percentage: 1.17,
      });
    }
  });

  it('conserva los centavos de ILY y calcula la comparación de B', () => {
    expect(REFERENCE_CASES.ily.response.current_comparison?.total_annual_cost).toBe(180569.21);
    expect(REFERENCE_CASES.ily.response.current_comparison?.annual_savings).toBe(29729.21);
    expect(REFERENCE_CASES.sensibilidad_b.response.current_comparison?.annual_savings).toBe(252);
  });

  it('omite la comparación opcional y rechaza cantidades inválidas o escenarios desconocidos', () => {
    const request = REFERENCE_CASES.ily.request;
    expect(resolveMockAnalysis({ ...request, current_order_quantity: null }).current_comparison).toBeNull();
    expect(resolveMockAnalysis({ ...request, current_order_quantity: undefined }).current_comparison).toBeNull();
    for (const invalid of [0, -2, NaN, Infinity]) {
      expect(() => resolveMockAnalysis({ ...request, current_order_quantity: invalid })).toThrow('mayor que cero');
    }
    expect(() => resolveMockAnalysis({ ...request, demand: 123 })).toThrow('API real');
    expect(() => resolveMockAnalysis({ ...request, discount_tiers: [...request.discount_tiers].reverse() })).toThrow('API real');
  });

  it('devuelve copias para no contaminar otros análisis', () => {
    const result = resolveMockAnalysis(REFERENCE_CASES.ily.request);
    result.alternatives[0].total_annual_cost = 1;
    result.procedure.assumptions.length = 0;
    expect(resolveMockAnalysis(REFERENCE_CASES.ily.request)).toEqual(REFERENCE_CASES.ily.response);
  });
});

describe('Borradores del asistente simulado', () => {
  it('solicita datos faltantes para texto corto y deja solo datos presentes en el borrador', () => {
    const result = mockAssistantMessage({ message: 'Ayúdame' });
    expect(result.missing_fields).toContain('demand');
    expect(result.proposed_data?.demand).toBeUndefined();
    expect(result.fields_to_review).toEqual(['holding_cost_value', 'discount_tiers']);
    expect(result.suggested_action).toBe('clarify');
  });

  it('texto, imagen y audio proponen datos revisables sin modificar los casos', () => {
    const original = structuredClone(REFERENCE_CASES.sensibilidad_a.request);
    const message = 'Vendo 200 unidades al mes, pedido de 40 soles y mantenimiento fijo de 5 soles al año.';
    const text = mockAssistantMessage({ message });
    const image = mockExtractImage(new File(['imagen'], 'ejercicio.png'), message);
    const audio = mockTranscribeAudio(new Blob(['audio']));
    for (const result of [text, image, audio]) {
      expect(result.proposed_data?.demand).toBe(200);
      expect(result.proposed_data?.demand_period).toBe('month');
      expect(result.fields_to_review).toEqual(['holding_cost_value', 'discount_tiers']);
      expect(result.missing_fields).toEqual([]);
    }
    expect(audio.text).toContain('200 unidades al mes');
    expect(REFERENCE_CASES.sensibilidad_a.request).toEqual(original);
  });
});
