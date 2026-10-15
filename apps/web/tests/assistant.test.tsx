// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '../src/App';
import { DraftReviewCard } from '../src/features/assistant/DraftReviewCard';
import { createDemoQuotation } from '../src/features/assistant/ImageExtractorUploader';
import { EXAMPLE_EXERCISE } from '../src/features/assistant/AssistantPanel';
import { mockAssistantMessage, mockExtractImage, REFERENCE_CASES, resolveMockAnalysis } from '../src/mocks/reference-cases';
import { apiClient } from '../src/services/api-client';
import type { AssistantResponse } from '../src/services/generated/types';

afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); apiClient.setUseMocks(true); });

describe('Revisión humana del borrador', () => {
  it('edita números sin mutar la propuesta original y aplica solo con confirmación explícita', async () => {
    const onApply = vi.fn();
    const onDiscard = vi.fn();
    const original = REFERENCE_CASES.sensibilidad_a.request;
    render(<DraftReviewCard proposedData={original} missingFields={[]} fieldsToReview={['holding_cost_value', 'discount_tiers']} onApplyDraft={onApply} onDiscard={onDiscard} />);
    const user = userEvent.setup();
    expect(onApply).not.toHaveBeenCalled();
    const holding = screen.getByLabelText(/Costo de mantenimiento \(PEN\)/);
    expect(holding.classList.contains('border-amber-400')).toBe(true);
    await user.clear(holding);
    await user.type(holding, '10');
    expect(original.holding_cost_value).toBe(5);
    expect(onApply).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Aplicar datos al formulario y calcular' }));
    expect(onApply).toHaveBeenCalledWith({ ...original, holding_cost_value: 10 });
  });

  it('permite completar campos faltantes y bloquea su aplicación mientras sigan vacíos', async () => {
    const onApply = vi.fn();
    const { demand: _demand, demand_period: _period, ...partial } = REFERENCE_CASES.sensibilidad_a.request;
    render(<DraftReviewCard proposedData={partial} missingFields={['demand', 'demand_period']} fieldsToReview={[]} onApplyDraft={onApply} onDiscard={vi.fn()} />);
    const user = userEvent.setup();
    expect(screen.getByText('Faltan datos por confirmar')).toBeDefined();
    await user.click(screen.getByRole('button', { name: 'Aplicar datos al formulario y calcular' }));
    expect(onApply).not.toHaveBeenCalled();
    await user.type(screen.getByLabelText('Demanda (unidades)'), '2400');
    await user.selectOptions(screen.getByLabelText('Período de demanda'), 'year');
    await user.click(screen.getByRole('button', { name: 'Aplicar datos al formulario y calcular' }));
    expect(onApply).toHaveBeenCalledWith(REFERENCE_CASES.sensibilidad_a.request);
  });

  it('no aplica precios crecientes y permite descartar sin alterar el formulario', async () => {
    const onApply = vi.fn();
    const onDiscard = vi.fn();
    render(<DraftReviewCard proposedData={REFERENCE_CASES.sensibilidad_a.request} missingFields={[]} fieldsToReview={['discount_tiers']} onApplyDraft={onApply} onDiscard={onDiscard} />);
    const user = userEvent.setup();
    const secondPrice = screen.getByLabelText(/Precio · tramo 2/);
    await user.clear(secondPrice); await user.type(secondPrice, '21');
    await user.click(screen.getByRole('button', { name: 'Aplicar datos al formulario y calcular' }));
    expect(screen.getByText('A mayor volumen, el precio unitario no puede subir respecto al tramo anterior (20)')).toBeDefined();
    expect(onApply).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Descartar propuesta' }));
    expect(onDiscard).toHaveBeenCalledOnce();
  });
});

describe('Asistente integrado y protección del ingreso manual', () => {
  beforeEach(() => {
    apiClient.setUseMocks(true);
    vi.spyOn(apiClient, 'runAnalysis').mockImplementation(async (request) => resolveMockAnalysis(request));
    vi.spyOn(apiClient, 'sendAssistantMessage').mockImplementation(async (payload) => mockAssistantMessage(payload));
    vi.spyOn(apiClient, 'extractFromImage').mockImplementation(async (file, note) => mockExtractImage(file, note));
    vi.stubGlobal('URL', class extends URL {
      static createObjectURL = vi.fn(() => 'blob:cotizacion-prueba');
      static revokeObjectURL = vi.fn();
    });
  });

  async function openAssistant() {
    render(<App />);
    await screen.findByText('RECOMENDACIÓN ÓPTIMA VERIFICADA');
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Asistente IA (Texto, Foto y Voz)' }));
    const panel = screen.getByRole('complementary', { name: 'Asistente inteligente' });
    return { user, panel, assistant: within(panel) };
  }

  it('el ejemplo solo rellena el texto; recibir o editar un borrador no reemplaza el formulario', async () => {
    const { user, assistant } = await openAssistant();
    await user.click(assistant.getByRole('button', { name: 'Ejemplo de ejercicio por texto' }));
    expect((assistant.getByLabelText('Mensaje para el asistente') as HTMLTextAreaElement).value).toBe(EXAMPLE_EXERCISE);
    expect(apiClient.sendAssistantMessage).not.toHaveBeenCalled();
    await user.click(assistant.getByRole('button', { name: 'Enviar' }));
    const draft = await assistant.findByRole('region', { name: 'Borrador revisable del asistente' });
    const mainDemand = screen.getByLabelText('¿Cuántas unidades vendes o necesitas?') as HTMLInputElement;
    expect(mainDemand.value).toBe('10000');
    expect(apiClient.runAnalysis).toHaveBeenCalledTimes(1);
    const editedHolding = within(draft).getByLabelText(/Costo de mantenimiento \(PEN\)/);
    await user.clear(editedHolding); await user.type(editedHolding, '10');
    expect(mainDemand.value).toBe('10000');
    await user.click(within(draft).getByRole('button', { name: 'Aplicar datos al formulario y calcular' }));
    await waitFor(() => expect(apiClient.runAnalysis).toHaveBeenLastCalledWith({ ...REFERENCE_CASES.sensibilidad_a.request, holding_cost_value: 10 }));
    expect(mainDemand.value).toBe('2400');
    expect(await assistant.findByText('Datos aplicados al formulario. Cálculo solicitado.')).toBeDefined();
  });

  it('descartar conserva los datos, y cerrar/reabrir conserva la conversación', async () => {
    const { user, assistant } = await openAssistant();
    await user.click(assistant.getByRole('button', { name: 'Prueba otro escenario' }));
    const draft = await assistant.findByRole('region', { name: 'Borrador revisable del asistente' });
    await user.click(within(draft).getByRole('button', { name: 'Descartar propuesta' }));
    expect(apiClient.runAnalysis).toHaveBeenCalledTimes(1);
    expect((screen.getByLabelText('¿Cuántas unidades vendes o necesitas?') as HTMLInputElement).value).toBe('10000');
    await user.click(assistant.getByRole('button', { name: 'Cerrar asistente' }));
    expect(screen.queryByRole('complementary')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Asistente IA (Texto, Foto y Voz)' }));
    expect(screen.getByText('Propuesta descartada. El formulario conserva tus datos.')).toBeDefined();
  });

  it('la interpretación pendiente no bloquea ediciones y la fusión conserva los campos no propuestos', async () => {
    let resolveMessage!: (response: AssistantResponse) => void;
    vi.mocked(apiClient.sendAssistantMessage).mockImplementationOnce(() => new Promise((resolve) => { resolveMessage = resolve; }));
    const { user, assistant } = await openAssistant();
    await user.type(assistant.getByLabelText('Mensaje para el asistente'), 'Confirma el costo de mantenimiento');
    await user.click(assistant.getByRole('button', { name: 'Enviar' }));
    expect(assistant.getByText('Interpretando datos...')).toBeDefined();
    const product = screen.getByLabelText('¿Qué producto estás comprando?') as HTMLInputElement;
    await user.clear(product); await user.type(product, 'Producto confirmado manualmente');
    await act(async () => resolveMessage({ reply_message: 'Revisa el costo de mantenimiento.', proposed_data: { holding_cost_value: 10 }, missing_fields: [], fields_to_review: ['holding_cost_value'], suggested_action: 'propose_data' }));
    await user.click(assistant.getByRole('button', { name: 'Aplicar datos al formulario y calcular' }));
    await waitFor(() => expect(apiClient.runAnalysis).toHaveBeenLastCalledWith({ ...REFERENCE_CASES.ily.request, product_name: 'Producto confirmado manualmente' }));
    expect(product.value).toBe('Producto confirmado manualmente');
  });

  it('muestra un fallo recuperable de IA y permite calcular manualmente o reintentar', async () => {
    vi.mocked(apiClient.sendAssistantMessage).mockRejectedValueOnce(new Error('El proveedor no está disponible.'));
    const { user, assistant } = await openAssistant();
    await user.type(assistant.getByLabelText('Mensaje para el asistente'), 'Ayúdame con mi ejercicio');
    await user.click(assistant.getByRole('button', { name: 'Enviar' }));
    const alert = await assistant.findByRole('alert');
    expect(alert.textContent).toContain('Error del servicio de IA — Puedes seguir usando el formulario manual');
    await user.click(screen.getByRole('button', { name: 'Calcular compra óptima' }));
    await waitFor(() => expect(apiClient.runAnalysis).toHaveBeenCalledTimes(2));
    await user.click(assistant.getByRole('button', { name: 'Reintentar mensaje' }));
    expect(await assistant.findByRole('region', { name: 'Borrador revisable del asistente' })).toBeDefined();
    expect(assistant.queryByRole('alert')).toBeNull();
  });

  it('explica únicamente el resultado vigente y ofrece entrada por voz', async () => {
    const { user, assistant } = await openAssistant();
    await user.click(assistant.getByRole('button', { name: 'Explícame el resultado' }));
    expect(await assistant.findByText(/Explicación simulada del cálculo enviado: conviene pedir 1000 unidades/)).toBeDefined();
    expect(apiClient.sendAssistantMessage).toHaveBeenLastCalledWith(expect.objectContaining({ current_result: REFERENCE_CASES.ily.response }));
    expect(assistant.queryByRole('region', { name: 'Borrador revisable del asistente' })).toBeNull();
    await user.type(screen.getByLabelText('¿Qué producto estás comprando?'), ' editado');
    expect((assistant.getByRole('button', { name: 'Explícame el resultado' }) as HTMLButtonElement).disabled).toBe(true);
    await user.click(assistant.getByRole('tab', { name: 'Voz' }));
    expect(assistant.getByRole('button', { name: 'Grabar mensaje de voz' })).toBeDefined();
  });

  it('una foto y su nota producen una propuesta revisable; reemplazarla libera la vista previa', async () => {
    const { user, assistant } = await openAssistant();
    await user.click(assistant.getByRole('tab', { name: 'Fotografía' }));
    const photo = new File(['imagen'], 'cotizacion.png', { type: 'image/png' });
    await user.upload(assistant.getByLabelText('Selecciona una fotografía o cotización'), photo);
    expect(assistant.getByAltText('Vista previa de la cotización seleccionada')).toBeDefined();
    await user.type(assistant.getByLabelText('Contexto adicional de la foto'), EXAMPLE_EXERCISE);
    await user.click(assistant.getByRole('button', { name: 'Extraer datos de la fotografía' }));
    expect(apiClient.extractFromImage).toHaveBeenCalledWith(photo, EXAMPLE_EXERCISE);
    expect(await assistant.findByRole('region', { name: 'Borrador revisable del asistente' })).toBeDefined();
    expect(apiClient.runAnalysis).toHaveBeenCalledTimes(1);
    await user.upload(assistant.getByLabelText('Selecciona una fotografía o cotización'), new File(['otra'], 'otra.png', { type: 'image/png' }));
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:cotizacion-prueba');
  });

  it('la cotización demo se genera en Canvas y puede extraerse sin archivos externos', async () => {
    const drawing = { fillRect: vi.fn(), fillText: vi.fn(), beginPath: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(), stroke: vi.fn() };
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(drawing as unknown as CanvasRenderingContext2D);
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((callback) => callback(new Blob(['png'], { type: 'image/png' })));
    const file = await createDemoQuotation();
    expect(file.name).toBe('cotizacion-demo.png');
    expect(file.type).toBe('image/png');
    expect(drawing.fillText).toHaveBeenCalledWith('PEN 19.20', expect.any(Number), expect.any(Number));
    const { user, assistant } = await openAssistant();
    await user.click(assistant.getByRole('tab', { name: 'Fotografía' }));
    await user.click(assistant.getByRole('button', { name: 'Cotización de prueba (Demo)' }));
    await assistant.findByText('cotizacion-demo.png');
    await user.click(assistant.getByRole('button', { name: 'Extraer datos de la fotografía' }));
    const draft = await assistant.findByRole('region', { name: 'Borrador revisable del asistente' });
    expect((within(draft).getByLabelText('Demanda (unidades)') as HTMLInputElement).value).toBe('2400');
    expect(apiClient.runAnalysis).toHaveBeenCalledTimes(1);
  });

  it('un fallo al extraer la foto permite reintentar sin bloquear la calculadora', async () => {
    vi.mocked(apiClient.extractFromImage).mockRejectedValueOnce(new Error('No pudimos leer la cotización.'));
    const { user, assistant } = await openAssistant();
    await user.click(assistant.getByRole('tab', { name: 'Fotografía' }));
    await user.upload(assistant.getByLabelText('Selecciona una fotografía o cotización'), new File(['imagen'], 'cotizacion-demo.png', { type: 'image/png' }));
    await user.click(assistant.getByRole('button', { name: 'Extraer datos de la fotografía' }));
    expect((await assistant.findByRole('alert')).textContent).toContain('No pudimos leer la cotización.');
    expect((screen.getByRole('button', { name: 'Calcular compra óptima' }) as HTMLButtonElement).disabled).toBe(false);
    await user.click(assistant.getByRole('button', { name: 'Extraer datos de la fotografía' }));
    expect(await assistant.findByRole('region', { name: 'Borrador revisable del asistente' })).toBeDefined();
    expect(assistant.queryByRole('alert')).toBeNull();
  });

  it('permite navegar las pestañas con teclado y cerrar con Escape devolviendo el foco', async () => {
    const { user, assistant } = await openAssistant();
    await user.click(assistant.getByRole('tab', { name: 'Fotografía' }));
    await user.keyboard('{ArrowRight}');
    expect(document.activeElement).toBe(assistant.getByRole('tab', { name: 'Voz' }));
    await user.keyboard('{Home}');
    expect(document.activeElement).toBe(assistant.getByRole('tab', { name: 'Texto' }));
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('complementary')).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Asistente IA (Texto, Foto y Voz)' }));
  });
});
