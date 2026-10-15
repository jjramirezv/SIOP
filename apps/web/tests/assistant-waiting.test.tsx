// @vitest-environment jsdom
import response from '../../../contracts/examples/assistant-response.json';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { AssistantPanel } from '../src/features/assistant/AssistantPanel';
import { AssistantRequestStatus } from '../src/features/assistant/AssistantRequestStatus';
import { REFERENCE_CASES } from './fixtures/reference-cases';
import { apiClient, ApiClientError } from '../src/services/api-client';

afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.useRealTimers(); vi.unstubAllGlobals(); });
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status });
function openPanel(onApplyDraft = vi.fn()) {
  return render(<AssistantPanel isOpen onClose={vi.fn()} currentDraft={REFERENCE_CASES.ily.request} currentResult={null} isCalculating={false} onApplyDraft={onApplyDraft} />);
}

describe('Espera amable sin volver a ingresar datos', () => {
  it('avisa después de ocho segundos, permite cancelar y limpia el temporizador', () => {
    vi.useFakeTimers();
    const cancel = vi.fn();
    const { rerender } = render(<AssistantRequestStatus pending label="Interpretando datos..." onCancel={cancel} />);
    act(() => vi.advanceTimersByTime(7999));
    expect(screen.queryByText(/Esto puede demorar/)).toBeNull();
    act(() => vi.advanceTimersByTime(1));
    expect(screen.getByText(/Esto puede demorar más de lo esperado/)).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar espera' }));
    expect(cancel).toHaveBeenCalledOnce();
    rerender(<AssistantRequestStatus pending={false} label="Interpretando datos..." />);
    expect(screen.queryByRole('status')).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('mantiene una sola burbuja, espera sin alertas y recibe el borrador tras reintentar', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockResolvedValueOnce(json({ error: { message: 'Límite temporal', retryable: true } }, 503))
      .mockResolvedValueOnce(json({ error: { message: 'Límite temporal', retryable: true } }, 503)).mockResolvedValueOnce(json(response));
    vi.stubGlobal('fetch', fetchMock);
    const apply = vi.fn();
    openPanel(apply);
    fireEvent.change(screen.getByLabelText('Mensaje para el asistente'), { target: { value: 'Vendo 200 cuadernos al mes.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enviar' }));
    await act(async () => { await vi.advanceTimersByTimeAsync(8000); });
    expect(screen.getByText(/Esto puede demorar más de lo esperado/)).toBeDefined();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(within(screen.getByRole('log')).getAllByText('Vendo 200 cuadernos al mes.')).toHaveLength(1);
    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
    expect(screen.getByRole('region', { name: 'Borrador revisable del asistente' })).toBeDefined();
    expect(screen.queryByText(/Esto puede demorar/)).toBeNull();
    expect(apply).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('cancelar devuelve el mensaje al editor y no permite reintentos tardíos', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockImplementation(async () => json({ error: { message: 'Espera', retryable: true } }, 503));
    vi.stubGlobal('fetch', fetchMock);
    openPanel();
    fireEvent.change(screen.getByLabelText('Mensaje para el asistente'), { target: { value: 'Mensaje que debo conservar' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enviar' }));
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar espera' }));
    await act(async () => { await vi.advanceTimersByTimeAsync(180000); });
    expect(screen.getByLabelText('Mensaje para el asistente')).toHaveProperty('value', 'Mensaje que debo conservar');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('agotada la espera permite reusar exactamente el contexto original sin duplicar el mensaje', async () => {
    const send = vi.spyOn(apiClient, 'sendAssistantMessage').mockRejectedValueOnce(new ApiClientError('Conservamos tu solicitud.', 'retry_exhausted'))
      .mockResolvedValueOnce({ reply_message: 'Revisa el borrador', proposed_data: { demand: 200 }, missing_fields: [], fields_to_review: [], suggested_action: 'propose_data' });
    openPanel();
    fireEvent.change(screen.getByLabelText('Mensaje para el asistente'), { target: { value: 'Un mensaje guardado' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enviar' }));
    await screen.findByText('Tu solicitud está guardada');
    expect(screen.queryByRole('alert')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar mensaje' }));
    await screen.findByText('Revisa el borrador');
    expect(send.mock.calls[1][0]).toEqual(send.mock.calls[0][0]);
    expect(within(screen.getByRole('log')).getAllByText('Un mensaje guardado')).toHaveLength(1);
  });
});
