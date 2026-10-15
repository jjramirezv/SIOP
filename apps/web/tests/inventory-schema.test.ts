import { describe, expect, it } from 'vitest';
import { analysisFormSchema } from '../src/features/inventory-form/schema';
import { REFERENCE_CASES } from '../src/mocks/reference-cases';

describe('Validación de ingreso de datos RF-01 y RF-02', () => {
  it.each(Object.values(REFERENCE_CASES))('acepta todos los datos de $title', ({ request }) => {
    expect(analysisFormSchema.parse(request)).toEqual(request);
  });

  it('ubica cada error de rango y precio en el campo editable correspondiente', () => {
    const result = analysisFormSchema.safeParse({
      ...REFERENCE_CASES.ily.request,
      discount_tiers: [
        { min_quantity: 10, unit_price: 20 },
        { min_quantity: 10, unit_price: 21 },
        { min_quantity: 5, unit_price: 22 },
      ],
    });
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: ['discount_tiers', 0, 'min_quantity'], message: 'El primer tramo siempre debe iniciar desde 0 unidades' }),
      expect.objectContaining({ path: ['discount_tiers', 1, 'min_quantity'], message: 'La cantidad mínima debe ser mayor a la del tramo anterior (10)' }),
      expect.objectContaining({ path: ['discount_tiers', 2, 'min_quantity'], message: 'La cantidad mínima debe ser mayor a la del tramo anterior (10)' }),
      expect.objectContaining({ path: ['discount_tiers', 1, 'unit_price'], message: 'A mayor volumen, el precio unitario no puede subir respecto al tramo anterior (20)' }),
    ]));
  });

  it('exige dos tramos pero permite precios iguales', () => {
    const request = REFERENCE_CASES.ily.request;
    expect(analysisFormSchema.safeParse({ ...request, discount_tiers: [{ min_quantity: 0, unit_price: 20 }] }).success).toBe(false);
    expect(analysisFormSchema.safeParse({ ...request, discount_tiers: [{ min_quantity: 0, unit_price: 20 }, { min_quantity: 200, unit_price: 20 }] }).success).toBe(true);
  });

  it.each([
    ['demand', 0], ['ordering_cost', -1], ['holding_cost_value', 0], ['days_per_year', 0],
    ['current_order_quantity', -3], ['demand', NaN], ['product_name', '  '],
    ['currency', 'EUR'], ['demand_period', 'week'], ['holding_cost_period', 'week'],
    ['holding_cost_mode', 'invalid'], ['current_order_quantity', 1.5],
  ])('rechaza %s = %s con un mensaje en español', (field, value) => {
    const result = analysisFormSchema.safeParse({ ...REFERENCE_CASES.ily.request, [field]: value });
    expect(result.success).toBe(false);
    if (result.success) return;
    const issue = result.error.issues.find((entry) => entry.path[0] === field);
    expect(issue).toBeDefined();
    expect(issue?.message).not.toMatch(/Invalid|Expected|Too small|undefined/);
  });

  it('acepta la compra actual vacía, tanto nula como ausente', () => {
    for (const quantity of [null, undefined]) {
      expect(analysisFormSchema.safeParse({ ...REFERENCE_CASES.ily.request, current_order_quantity: quantity }).success).toBe(true);
    }
  });
});
