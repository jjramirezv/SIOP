// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '../src/App';
import { REFERENCE_CASES, resolveMockAnalysis } from '../src/mocks/reference-cases';
import { apiClient } from '../src/services/api-client';
import { RecommendationHeroCard } from '../src/features/results/RecommendationHeroCard';
import { AlternativesComparisonSection, CostBreakdownTooltip } from '../src/features/results/AlternativesComparisonSection';
import { ProcedureAccordion } from '../src/features/results/ProcedureAccordion';
import { SensitivityAndComparisonBar } from '../src/features/results/SensitivityAndComparisonBar';

afterEach(() => { cleanup(); vi.restoreAllMocks(); apiClient.setUseMocks(true); });

describe('Contenido de resultados', () => {
  it('distingue inversión por pedido y costo total anual con los valores exactos de ILY', () => {
    render(<RecommendationHeroCard recommended={REFERENCE_CASES.ily.response.recommended} currency="USD" productName="Caso ILY" mode="mock" />);
    expect(screen.getByText('Desembolso / Inversión por cada pedido')).toBeDefined();
    expect(screen.getByText('Costo Total Anual (Compra + Pedidos + Mantenimiento)')).toBeDefined();
    expect(screen.getByText(/USD\s+15,000\.00/)).toBeDefined();
    expect(screen.getByText(/USD\s+150,840\.00/)).toBeDefined();
    expect(screen.getByText('Se realizan 10.0 pedidos al año (cada 37 días)')).toBeDefined();
    expect(screen.getByText('Datos simulados de referencia')).toBeDefined();
  });

  it('incluye todos los tramos, resalta el mejor y agrega la compra actual al gráfico', () => {
    const { container } = render(<AlternativesComparisonSection response={REFERENCE_CASES.wohl.response} currency="USD" />);
    const table = screen.getByRole('table');
    expect(within(table).getAllByRole('row')).toHaveLength(4);
    expect(within(table).getByText('Mejor opción').closest('tr')?.classList.contains('bg-emerald-50/70')).toBe(true);
    expect(within(table).getByText(/USD\s+24,725\.00/)).toBeDefined();
    expect(container.querySelectorAll('.recharts-bar-rectangle')).toHaveLength(4);
    expect(screen.getByText('Tu compra actual')).toBeDefined();
  });

  it('el tooltip usa el desglose proporcionado sin recalcular los centavos', () => {
    render(<CostBreakdownTooltip active currency="USD" payload={[{ payload: {
      label: 'Compra actual ILY', color: '#4f46e5', annual_purchase_cost: 180000,
      annual_ordering_cost: 284.81, annual_holding_cost: 284.40, total_annual_cost: 180569.21,
    } }]} />);
    expect(screen.getByText(/USD\s+180,569\.21/)).toBeDefined();
    expect(screen.getByText(/USD\s+284\.81/)).toBeDefined();
    expect(screen.getByText(/USD\s+284\.40/)).toBeDefined();
    for (const label of ['Compra', 'Pedidos', 'Mantenimiento', 'Total']) expect(screen.getByText(label)).toBeDefined();
  });

  it('permite abrir las fórmulas, símbolos, normalización y supuestos', async () => {
    const { container } = render(<ProcedureAccordion procedure={REFERENCE_CASES.sensibilidad_a.response.procedure} />);
    expect(container.querySelector('details')?.open).toBe(false);
    await userEvent.setup().click(screen.getByText('Ver procedimiento matemático, fórmulas y supuestos del modelo'));
    expect(container.querySelector('details')?.open).toBe(true);
    expect(screen.getByText('Q* = √((2 × D × S) / H)')).toBeDefined();
    expect(screen.getByText('CT(Q) = D·P + (D/Q)·S + (Q/2)·H')).toBeDefined();
    expect(screen.getByText('Equivalencia mensual: 200 unidades/mes × 12 meses/año = 2400 unidades/año.')).toBeDefined();
  });

  it('ofrece una guía cuando no se indicó la compra actual y transmite cambios del 10%', async () => {
    const callback = vi.fn();
    render(<SensitivityAndComparisonBar response={{ ...REFERENCE_CASES.ily.response, current_comparison: null }} request={REFERENCE_CASES.ily.request} currency="USD" onQuickRecalculate={callback} isLoading={false} useMocks={false} />);
    expect(screen.getByText(/Ingresa cuántas unidades sueles pedir en el formulario/)).toBeDefined();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Aumentar demanda un 10%' }));
    expect(callback).toHaveBeenLastCalledWith({ ...REFERENCE_CASES.ily.request, demand: 11000 });
    await user.click(screen.getByRole('button', { name: 'Reducir mantenimiento un 10%' }));
    expect(callback).toHaveBeenLastCalledWith({ ...REFERENCE_CASES.ily.request, holding_cost_value: 9 });
  });
});

describe('Integración de cálculo y protección contra resultados antiguos', () => {
  beforeEach(() => {
    apiClient.setUseMocks(true);
    vi.spyOn(apiClient, 'runAnalysis').mockImplementation(async (request) => resolveMockAnalysis(request));
  });

  async function openApp() {
    render(<App />);
    await screen.findByText('RECOMENDACIÓN ÓPTIMA VERIFICADA');
    return userEvent.setup();
  }

  it('carga y calcula ILY al iniciar sin intervención del usuario', async () => {
    await openApp();
    expect(apiClient.runAnalysis).toHaveBeenCalledWith(REFERENCE_CASES.ily.request);
    expect(screen.queryByText(/Los datos del ejercicio cambiaron/)).toBeNull();
    expect(within(screen.getByTestId('results-panel')).getAllByText(/USD\s+150,840\.00/).length).toBeGreaterThan(0);
  });

  it('el botón del aviso envía los valores actuales y respeta la validación del formulario', async () => {
    const user = await openApp();
    const demand = screen.getByLabelText('¿Cuántas unidades vendes o necesitas?');
    await user.clear(demand);
    vi.mocked(apiClient.runAnalysis).mockClear();
    await user.click(screen.getByRole('button', { name: 'Actualizar cálculo ahora' }));
    expect(await screen.findByText('Ingresa cuántas unidades vendes (debe ser mayor a 0)')).toBeDefined();
    expect(apiClient.runAnalysis).not.toHaveBeenCalled();
    await user.type(demand, '10000');
    await user.click(screen.getByRole('button', { name: 'Actualizar cálculo ahora' }));
    await waitFor(() => expect(apiClient.runAnalysis).toHaveBeenCalledWith(REFERENCE_CASES.ily.request));
    await waitFor(() => expect(screen.queryByText(/Los datos del ejercicio cambiaron/)).toBeNull());
  });

  it('el mantenimiento de 5 a 10 cambia A a B y preserva las ediciones aún no calculadas', async () => {
    const user = await openApp();
    await user.click(screen.getByRole('button', { name: 'Sensibilidad A (Mant. = 5)' }));
    const current = screen.getByLabelText(/¿Cuántas unidades sueles pedir actualmente/);
    await user.clear(current);
    await user.type(current, '500');
    await user.click(screen.getByRole('button', { name: 'Probar Mantenimiento = 10' }));
    await waitFor(() => expect(apiClient.runAnalysis).toHaveBeenLastCalledWith({ ...REFERENCE_CASES.sensibilidad_a.request, holding_cost_value: 10, current_order_quantity: 500 }));
    await waitFor(() => expect(screen.queryByText(/Los datos del ejercicio cambiaron/)).toBeNull());
    expect((screen.getByLabelText('¿Cuánto cuesta guardar 1 unidad en inventario?') as HTMLInputElement).value).toBe('10');
    expect(screen.getByText('Pedido óptimo recomendado (200 u.)')).toBeDefined();
    expect(screen.getByText(/S\/\s?252\.00/)).toBeDefined();
  });

  it('un cambio no precalculado conserva el resultado anterior, marcado como desactualizado', async () => {
    const user = await openApp();
    await user.click(screen.getByRole('button', { name: 'Aumentar demanda un 10%' }));
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', expect.stringContaining('API real'));
    expect(screen.getByTestId('results-panel').classList.contains('opacity-60')).toBe(true);
    expect((screen.getByLabelText('¿Cuántas unidades vendes o necesitas?') as HTMLInputElement).value).toBe('11000');
  });

  it('cambia de modo en apiClient y mantiene visible la procedencia de un resultado anterior si falla la API', async () => {
    const user = await openApp();
    vi.mocked(apiClient.runAnalysis).mockRejectedValueOnce(new Error('No pudimos conectar con el servidor.'));
    await user.selectOptions(screen.getByLabelText('Modo de datos'), 'real');
    expect(apiClient.useMocks).toBe(false);
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'No pudimos conectar con el servidor.');
    expect(screen.getByText('Datos simulados de referencia')).toBeDefined();
    expect(screen.getByTestId('results-panel').classList.contains('opacity-60')).toBe(true);
    await user.selectOptions(screen.getByLabelText('Modo de datos'), 'mock');
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
    expect(apiClient.useMocks).toBe(true);
  });
});
