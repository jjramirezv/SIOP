// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { InventoryForm } from '../src/features/inventory-form/InventoryForm';
import { App } from '../src/app/App';
import { REFERENCE_CASES } from './fixtures/reference-cases';
import { apiClient } from '../src/services/api-client';

beforeEach(() => { vi.spyOn(apiClient, 'checkHealth').mockResolvedValue({ status: 'ok', ai_available: false }); });

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

function renderForm(isLoading = false) {
  const onSubmit = vi.fn();
  const onDirty = vi.fn();
  render(<InventoryForm defaultValues={REFERENCE_CASES.ily.request} onSubmit={onSubmit} onFormDirtyChange={onDirty} isLoading={isLoading} />);
  return { onSubmit, onDirty, user: userEvent.setup() };
}

describe('Interacción del formulario', () => {
  it('conserva valores entre pestañas, navega por teclado y abre el grupo del primer error', async () => {
    const { user, onSubmit } = renderForm();
    await user.click(screen.getByRole('tab', { name: 'Costos' }));
    await user.keyboard('{ArrowRight}');
    expect(document.activeElement).toBe(screen.getByRole('tab', { name: 'Precios' }));
    const price = screen.getByLabelText('Precio por unidad del tramo 2 (USD)');
    await user.clear(price); await user.type(price, '21');
    await user.click(screen.getByRole('tab', { name: 'Costos' }));
    await user.click(screen.getByRole('button', { name: 'Calcular mejor compra' }));
    await waitFor(() => expect(document.activeElement).toBe(price));
    expect(screen.getByRole('tab', { name: /Precios/ }).getAttribute('aria-selected')).toBe('true');
    expect((price as HTMLInputElement).value).toBe('21');
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('envía el contrato completo y permite dejar vacía la compra actual', async () => {
    const { user, onSubmit } = renderForm();
    await user.clear(screen.getByLabelText(/¿Cuántas unidades sueles pedir actualmente/));
    await user.click(screen.getByRole('button', { name: 'Calcular mejor compra' }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0][0]).toEqual({ ...REFERENCE_CASES.ily.request, current_order_quantity: null });
  });

  it('conserva una compra actual inicialmente nula como opcional al enviar', async () => {
    const onSubmit = vi.fn();
    render(<InventoryForm defaultValues={{ ...REFERENCE_CASES.ily.request, current_order_quantity: null }} onSubmit={onSubmit} onFormDirtyChange={vi.fn()} isLoading={false} />);
    await userEvent.setup().click(screen.getByRole('button', { name: 'Calcular mejor compra' }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0][0].current_order_quantity).toBeNull();
  });

  it('notifica ediciones, cambia las unidades de mantenimiento y actualiza límites en vivo', async () => {
    const { user, onDirty } = renderForm();
    const minimum = screen.getByLabelText('Desde, unidades mínimas del tramo 2');
    await user.clear(minimum);
    await user.type(minimum, '300');
    expect(screen.getByText('hasta 299 u.')).toBeDefined();
    expect(onDirty).toHaveBeenCalledWith(true);
    const first = screen.getByLabelText('Desde, unidades mínimas del tramo 1') as HTMLInputElement;
    expect(first.readOnly).toBe(true);
    expect(first.value).toBe('0');
    await user.click(screen.getByRole('button', { name: 'Monto fijo por unidad ($ / S/)' }));
    expect(document.getElementById('holding-unit')?.textContent).toBe('USD');
    await user.selectOptions(screen.getByLabelText('¿En qué moneda están los precios?'), 'PEN');
    expect(screen.getByLabelText('Precio por unidad del tramo 1 (PEN)')).toBeDefined();
    expect(document.getElementById('holding-unit')?.textContent).toBe('PEN');
  });

  it('agrega un nivel sugerido y conserva mínimo una fila y el inicio en cero al eliminar', async () => {
    const { user } = renderForm();
    await user.click(screen.getByRole('tab', { name: 'Precios' }));
    await user.click(screen.getByRole('button', { name: 'Agregar nivel de descuento' }));
    expect((screen.getByLabelText('Desde, unidades mínimas del tramo 4') as HTMLInputElement).value).toBe('1500');
    expect((screen.getByLabelText('Precio por unidad del tramo 4 (USD)') as HTMLInputElement).value).toBe('14.25');
    await user.click(screen.getByRole('button', { name: 'Eliminar tramo 1' }));
    expect((screen.getByLabelText('Desde, unidades mínimas del tramo 1') as HTMLInputElement).value).toBe('0');
    await user.click(screen.getByRole('button', { name: 'Eliminar tramo 3' }));
    await user.click(screen.getByRole('button', { name: 'Eliminar tramo 2' }));
    for (const button of screen.getAllByRole('button', { name: /Eliminar tramo/ })) {
      expect((button as HTMLButtonElement).disabled).toBe(true);
    }
    expect(screen.getAllByRole('row')).toHaveLength(2);
  });

  it('muestra el error exacto de precios crecientes e impide enviar datos inválidos', async () => {
    const { user, onSubmit } = renderForm();
    const price = screen.getByLabelText('Precio por unidad del tramo 2 (USD)');
    await user.clear(price);
    await user.type(price, '21');
    await user.click(screen.getByRole('button', { name: 'Calcular mejor compra' }));
    expect(await screen.findByText('A mayor volumen, el precio unitario no puede subir respecto al tramo anterior (20)')).toBeDefined();
    expect(onSubmit).not.toHaveBeenCalled();
    expect(price.getAttribute('aria-invalid')).toBe('true');
  });

  it('revalida el tramo siguiente en vivo al bajar el precio anterior', async () => {
    const { user } = renderForm();
    const firstPrice = screen.getByLabelText('Precio por unidad del tramo 1 (USD)');
    await user.clear(firstPrice);
    await user.type(firstPrice, '17');
    expect(await screen.findByText('A mayor volumen, el precio unitario no puede subir respecto al tramo anterior (17)')).toBeDefined();
    await user.clear(firstPrice);
    await user.type(firstPrice, '20');
    await waitFor(() => expect(screen.queryByText('A mayor volumen, el precio unitario no puede subir respecto al tramo anterior (17)')).toBeNull());
  });

  it('deshabilita todas las ediciones mientras está calculando', async () => {
    const { user, onSubmit } = renderForm(true);
    const name = screen.getByLabelText('¿Qué producto estás comprando?') as HTMLInputElement;
    await user.type(name, 'Otro producto');
    expect(name.value).toBe(REFERENCE_CASES.ily.request.product_name);
    expect((screen.getByRole('button', { name: 'Calculando mejor compra…' }) as HTMLButtonElement).disabled).toBe(true);
    expect(onSubmit).not.toHaveBeenCalled();
  });
});

describe('Integración en la página', () => {
  beforeEach(() => {

    vi.spyOn(apiClient, 'runAnalysis').mockResolvedValue(REFERENCE_CASES.ily.response);
  });

  it('carga un caso desde el selector, incluidos modo, días y compra actual', async () => {
    render(<App />);
    await screen.findByText('Compra recomendada');
    const user = userEvent.setup();
    const selector = screen.getByLabelText('Caso de análisis');
    await user.selectOptions(selector, 'sensibilidad_b');
    expect((screen.getByLabelText(/^Mantenimiento por unidad/) as HTMLInputElement).value).toBe('10');
    expect((screen.getByLabelText('Días trabajados por año') as HTMLInputElement).value).toBe('360');
    expect((screen.getByLabelText(/¿Cuántas unidades sueles pedir actualmente/) as HTMLInputElement).value).toBe('500');
    expect(screen.getByRole('button', { name: 'Monto fijo por unidad ($ / S/)' }).getAttribute('aria-pressed')).toBe('true');
    expect((selector as HTMLSelectElement).value).toBe('sensibilidad_b');
  });

  it('retiene y atenúa el resultado tras editar o cargar otro caso; lo actualiza tras calcular', async () => {
    const runAnalysis = vi.mocked(apiClient.runAnalysis);
    render(<App />);
    const user = userEvent.setup();
    await screen.findByText('Compra recomendada');
    const panel = screen.getByTestId('results-panel');
    expect(panel?.classList.contains('opacity-60')).toBe(false);
    await user.type(screen.getByLabelText('¿Qué producto estás comprando?'), ' nuevo');
    expect(await screen.findByText('Los datos del ejercicio cambiaron. Los resultados mostrados abajo corresponden al cálculo anterior.')).toBeDefined();
    expect(panel?.classList.contains('opacity-60')).toBe(true);
    expect(screen.getByText('Costo anual total')).toBeDefined();
    await user.selectOptions(screen.getByLabelText('Caso de análisis'), 'wohl');
    expect(panel?.classList.contains('opacity-60')).toBe(true);
    runAnalysis.mockResolvedValueOnce(REFERENCE_CASES.wohl.response);
    await user.click(screen.getByRole('button', { name: 'Calcular mejor compra' }));
    await waitFor(() => expect(screen.queryByText('Los datos del ejercicio cambiaron. Los resultados mostrados abajo corresponden al cálculo anterior.')).toBeNull());
    expect(runAnalysis).toHaveBeenLastCalledWith(REFERENCE_CASES.wohl.request);
    expect(panel?.classList.contains('opacity-60')).toBe(false);
  });

  it('un error de API conserva el resultado anterior como desactualizado', async () => {
    const runAnalysis = vi.mocked(apiClient.runAnalysis);
    render(<App />);
    const user = userEvent.setup();
    await screen.findByText('Compra recomendada');
    await user.selectOptions(screen.getByLabelText('Caso de análisis'), 'wohl');
    runAnalysis.mockRejectedValueOnce(new Error('No pudimos conectar con el servidor.'));
    await user.click(screen.getByRole('button', { name: 'Calcular mejor compra' }));
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'No pudimos conectar con el servidor.');
    expect(screen.getByText('Los datos del ejercicio cambiaron. Los resultados mostrados abajo corresponden al cálculo anterior.')).toBeDefined();
    expect(screen.getByText('Costo anual total')).toBeDefined();
  });
});
