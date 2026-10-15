// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { VoiceRecorderControl } from '../src/features/assistant/VoiceRecorderControl';
import { apiClient } from '../src/services/api-client';
import { App } from '../src/App';
import { mockAssistantMessage, MOCK_TRANSCRIPTION_TEXT, resolveMockAnalysis } from './fixtures/reference-cases';
import type { TranscriptionResponse } from '../src/services/generated/types';

class RecorderDouble {
  static instances: RecorderDouble[] = [];
  static supportedMime: string | null = 'audio/webm;codecs=opus';
  static defaultMime = 'audio/mp4';
  static isTypeSupported = vi.fn((type: string) => type === RecorderDouble.supportedMime);
  state: RecordingState = 'inactive';
  mimeType: string;
  empty = false;
  ondataavailable: ((event: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(_stream: MediaStream, options?: MediaRecorderOptions) {
    this.mimeType = options?.mimeType ?? RecorderDouble.defaultMime;
    RecorderDouble.instances.push(this);
  }
  start = vi.fn(() => { this.state = 'recording'; });
  stop = vi.fn(() => {
    this.state = 'inactive';
    const onData = this.ondataavailable;
    const onStop = this.onstop;
    const data = new Blob(this.empty ? [] : ['audio de prueba'], { type: this.mimeType });
    queueMicrotask(() => { onData?.({ data }); onStop?.(); });
  });
}

const originalMediaDevices = Object.getOwnPropertyDescriptor(navigator, 'mediaDevices');
let stops = [vi.fn(), vi.fn()];
let stream: MediaStream;
let getUserMedia = vi.fn<MediaDevices['getUserMedia']>();

beforeEach(() => {
  stops = [vi.fn(), vi.fn()];
  stream = { getTracks: () => stops.map((stop) => ({ stop })) } as unknown as MediaStream;
  getUserMedia = vi.fn<MediaDevices['getUserMedia']>().mockResolvedValue(stream);
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia } });
  vi.stubGlobal('MediaRecorder', RecorderDouble);
  RecorderDouble.instances = [];
  RecorderDouble.supportedMime = 'audio/webm;codecs=opus';
  RecorderDouble.defaultMime = 'audio/mp4';

  vi.spyOn(apiClient, 'transcribeAudio').mockResolvedValue({ text: 'Transcripción inicial.' });
});

beforeEach(() => { vi.spyOn(apiClient, 'checkHealth').mockResolvedValue({ status: 'ok', ai_available: false }); });

afterEach(() => {
  cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals();
  if (originalMediaDevices) Object.defineProperty(navigator, 'mediaDevices', originalMediaDevices);
  else Reflect.deleteProperty(navigator, 'mediaDevices');
});

async function start() {
  fireEvent.click(screen.getByRole('button', { name: 'Grabar mensaje de voz' }));
  await act(async () => { await Promise.resolve(); });
}

describe('Ciclo de vida del micrófono', () => {
  it('detiene a los 60 segundos y libera inmediatamente el micrófono', async () => {
    vi.useFakeTimers();
    render(<VoiceRecorderControl onSendReviewedText={vi.fn()} />);
    await start();
    await act(async () => { await vi.advanceTimersByTimeAsync(60000); });
    stops.forEach((stop) => expect(stop).toHaveBeenCalled());
    expect(RecorderDouble.instances[0].state).toBe('inactive');
    expect(apiClient.transcribeAudio).toHaveBeenCalledOnce();
  });
  it('graba, cuenta segundos y libera todas las pistas antes de esperar la transcripción', async () => {
    vi.useFakeTimers();
    const onSend = vi.fn();
    render(<VoiceRecorderControl onSendReviewedText={onSend} />);
    await start();
    expect(getUserMedia).toHaveBeenCalledWith({ audio: true });
    expect(RecorderDouble.instances[0].start).toHaveBeenCalledWith(250);
    act(() => { vi.advanceTimersByTime(2000); });
    expect(screen.getByText('2 s')).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Detener y transcribir' }));
    stops.forEach((stop) => expect(stop).toHaveBeenCalled());
    expect(onSend).not.toHaveBeenCalled();
    await act(async () => { await Promise.resolve(); });
    expect(apiClient.transcribeAudio).toHaveBeenCalledWith(expect.any(Blob), 'grabacion.webm');
    expect(screen.getByLabelText('Revisa o corrige la transcripción antes de enviarla al asistente:')).toHaveProperty('value', 'Transcripción inicial.');
    expect(onSend).not.toHaveBeenCalled();
  });

  it('cancelar una grabación libera el micrófono sin transcribir ni enviar mensajes', async () => {
    render(<VoiceRecorderControl onSendReviewedText={vi.fn()} />);
    await start();
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    stops.forEach((stop) => expect(stop).toHaveBeenCalled());
    await act(async () => { await Promise.resolve(); });
    expect(apiClient.transcribeAudio).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Grabar mensaje de voz' })).toBeDefined();
  });

  it.each(['cancel', 'unmount', 'hide'] as const)('libera un permiso concedido tarde después de %s', async (action) => {
    let resolvePermission!: (value: MediaStream) => void;
    getUserMedia.mockImplementationOnce(() => new Promise((resolve) => { resolvePermission = resolve; }));
    const { unmount, rerender } = render(<VoiceRecorderControl onSendReviewedText={vi.fn()} />);
    await start();
    expect(screen.getByText('Esperando permiso del micrófono...')).toBeDefined();
    if (action === 'cancel') fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    if (action === 'unmount') unmount();
    if (action === 'hide') rerender(<VoiceRecorderControl onSendReviewedText={vi.fn()} isActive={false} />);
    await act(async () => resolvePermission(stream));
    stops.forEach((stop) => expect(stop).toHaveBeenCalled());
    expect(RecorderDouble.instances).toHaveLength(0);
    expect(apiClient.transcribeAudio).not.toHaveBeenCalled();
  });

  it.each(['unmount', 'hide', 'disable'] as const)('libera una grabación activa al %s', async (action) => {
    const { unmount, rerender } = render(<VoiceRecorderControl onSendReviewedText={vi.fn()} />);
    await start();
    if (action === 'unmount') unmount();
    if (action === 'hide') rerender(<VoiceRecorderControl onSendReviewedText={vi.fn()} isActive={false} />);
    if (action === 'disable') rerender(<VoiceRecorderControl onSendReviewedText={vi.fn()} disabled />);
    stops.forEach((stop) => expect(stop).toHaveBeenCalled());
    await act(async () => { await Promise.resolve(); });
    expect(apiClient.transcribeAudio).not.toHaveBeenCalled();
  });

  it.each([
    ['NotAllowedError', 'No se concedió permiso'], ['NotFoundError', 'No encontramos un micrófono'],
    ['NotReadableError', 'No pudimos acceder al micrófono'],
  ])('ofrece alternativas si el navegador devuelve %s', async (name, message) => {
    getUserMedia.mockRejectedValueOnce(new DOMException('Browser error', name));
    render(<VoiceRecorderControl onSendReviewedText={vi.fn()} />);
    await start();
    expect((await screen.findByRole('alert')).textContent).toContain(message);
    expect(screen.getByRole('button', { name: 'Subir archivo de audio (.webm, .mp3, .wav, .m4a)' })).toBeDefined();
    expect(screen.queryByRole('button', { name: 'Simular grabación de prueba' })).toBeNull();
  });

  it('gestiona un navegador sin MediaRecorder sin bloquear la contingencia', async () => {
    vi.stubGlobal('MediaRecorder', undefined);
    render(<VoiceRecorderControl onSendReviewedText={vi.fn()} />);
    await start();
    expect(screen.getByRole('alert').textContent).toContain('localhost o HTTPS');
    expect(getUserMedia).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Subir archivo de audio (.webm, .mp3, .wav, .m4a)' })).toBeDefined();
    expect(apiClient.transcribeAudio).not.toHaveBeenCalled();
  });

  it('libera las pistas si falla el inicio o se interrumpe la grabación', async () => {
    const { rerender } = render(<VoiceRecorderControl onSendReviewedText={vi.fn()} />);
    await start();
    act(() => { RecorderDouble.instances[0].onerror?.(); });
    stops.forEach((stop) => expect(stop).toHaveBeenCalled());
    expect(screen.getByRole('alert').textContent).toContain('La grabación se interrumpió');
    expect(apiClient.transcribeAudio).not.toHaveBeenCalled();
    vi.stubGlobal('MediaRecorder', class extends RecorderDouble {
      start = vi.fn(() => { throw new Error('Recording failed'); });
    });
    rerender(<VoiceRecorderControl onSendReviewedText={vi.fn()} />);
    await start();
    expect(screen.getByRole('alert').textContent).toContain('No pudimos iniciar la grabación');
    stops.forEach((stop) => expect(stop.mock.calls.length).toBeGreaterThanOrEqual(2));
  });

  it('usa el formato nativo si no se admite ninguno de los formatos preferidos', async () => {
    RecorderDouble.supportedMime = null;
    render(<VoiceRecorderControl onSendReviewedText={vi.fn()} />);
    await start();
    fireEvent.click(screen.getByRole('button', { name: 'Detener y transcribir' }));
    await waitFor(() => expect(apiClient.transcribeAudio).toHaveBeenCalledWith(expect.objectContaining({ type: 'audio/mp4' }), 'grabacion.m4a'));
  });

  it('no envía una grabación sin audio', async () => {
    render(<VoiceRecorderControl onSendReviewedText={vi.fn()} />);
    await start();
    RecorderDouble.instances[0].empty = true;
    fireEvent.click(screen.getByRole('button', { name: 'Detener y transcribir' }));
    expect((await screen.findByRole('alert')).textContent).toContain('No se detectó audio');
    stops.forEach((stop) => expect(stop).toHaveBeenCalled());
    expect(apiClient.transcribeAudio).not.toHaveBeenCalled();
  });
});

describe('Audio subido, transcripción y revisión humana', () => {
  it('rechaza archivos de más de 10 MB antes de enviar al servidor', async () => {
    render(<VoiceRecorderControl onSendReviewedText={vi.fn()} />);
    const file = new File([new Uint8Array(10 * 1024 * 1024 + 1)], 'largo.wav', { type: 'audio/wav' });
    await userEvent.setup().upload(screen.getByLabelText('Archivo de audio para transcribir'), file);
    expect(screen.getByRole('alert').textContent).toContain('supera 10 MB');
    expect(apiClient.transcribeAudio).not.toHaveBeenCalled();
  });
  it('sube un archivo y transmite exactamente el texto corregido después de confirmar', async () => {
    const onSend = vi.fn();
    render(<VoiceRecorderControl onSendReviewedText={onSend} />);
    const user = userEvent.setup();
    const file = new File(['audio'], 'ejercicio.wav', { type: 'audio/wav' });
    await user.upload(screen.getByLabelText('Archivo de audio para transcribir'), file);
    expect(apiClient.transcribeAudio).toHaveBeenCalledWith(file, 'ejercicio.wav');
    const textarea = await screen.findByLabelText('Revisa o corrige la transcripción antes de enviarla al asistente:');
    expect(getUserMedia).not.toHaveBeenCalled();
    expect(onSend).not.toHaveBeenCalled();
    const exact = '  Vendo 200 unidades al mes.\nCada pedido cuesta 40 soles.  ';
    fireEvent.change(textarea, { target: { value: exact } });
    await user.click(screen.getByRole('button', { name: 'Enviar texto revisado al asistente' }));
    expect(onSend).toHaveBeenCalledExactlyOnceWith(exact);
    fireEvent.change(textarea, { target: { value: '  \n' } });
    expect((screen.getByRole('button', { name: 'Enviar texto revisado al asistente' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('rechaza archivos vacíos o con formato incorrecto sin enviar datos', async () => {
    render(<VoiceRecorderControl onSendReviewedText={vi.fn()} />);
    const user = userEvent.setup({ applyAccept: false });
    const input = screen.getByLabelText('Archivo de audio para transcribir');
    await user.upload(input, new File([], 'vacio.mp3', { type: 'audio/mpeg' }));
    expect(screen.getByRole('alert').textContent).toContain('no esté vacío');
    await user.upload(input, new File(['texto'], 'datos.txt', { type: 'text/plain' }));
    expect(apiClient.transcribeAudio).not.toHaveBeenCalled();
  });

  it('permite reintentar una transcripción fallida sin volver a pedir el micrófono', async () => {
    vi.mocked(apiClient.transcribeAudio).mockRejectedValueOnce(new Error('El servicio de transcripción no está disponible.'));
    render(<VoiceRecorderControl onSendReviewedText={vi.fn()} />);
    const user = userEvent.setup();
    const file = new File(['audio'], 'voz.mp3', { type: 'audio/mpeg' });
    await user.upload(screen.getByLabelText('Archivo de audio para transcribir'), file);
    expect((await screen.findByRole('alert')).textContent).toContain('no está disponible');
    await user.click(screen.getByRole('button', { name: 'Reintentar transcripción' }));
    expect(await screen.findByLabelText('Revisa o corrige la transcripción antes de enviarla al asistente:')).toBeDefined();
    expect(apiClient.transcribeAudio).toHaveBeenLastCalledWith(file, 'voz.mp3');
    expect(getUserMedia).not.toHaveBeenCalled();
  });

  it('una transcripción vacía no pasa a revisión y permite reintentar', async () => {
    vi.mocked(apiClient.transcribeAudio).mockResolvedValueOnce({ text: '   ' });
    render(<VoiceRecorderControl onSendReviewedText={vi.fn()} />);
    await userEvent.setup().upload(screen.getByLabelText('Archivo de audio para transcribir'), new File(['audio'], 'voz.m4a'));
    expect((await screen.findByRole('alert')).textContent).toContain('transcripción llegó vacía');
    expect(screen.queryByRole('button', { name: 'Enviar texto revisado al asistente' })).toBeNull();
  });

  it('ignora una respuesta tardía tras cancelar, sin sobrescribir una transcripción nueva', async () => {
    let resolveTranscription!: (response: TranscriptionResponse) => void;
    vi.mocked(apiClient.transcribeAudio).mockImplementationOnce(() => new Promise((resolve) => { resolveTranscription = resolve; }));
    render(<VoiceRecorderControl onSendReviewedText={vi.fn()} />);
    const user = userEvent.setup();
    await user.upload(screen.getByLabelText('Archivo de audio para transcribir'), new File(['audio'], 'voz.webm', { type: 'audio/webm' }));
    expect(screen.getByText('Transcribiendo audio...')).toBeDefined();
    await user.click(screen.getByRole('button', { name: 'Cancelar' }));
    vi.mocked(apiClient.transcribeAudio).mockResolvedValueOnce({ text: MOCK_TRANSCRIPTION_TEXT });
    await user.upload(screen.getByLabelText('Archivo de audio para transcribir'), new File(['nuevo'], 'nuevo.webm', { type: 'audio/webm' }));
    await screen.findByLabelText('Revisa o corrige la transcripción antes de enviarla al asistente:');
    await act(async () => resolveTranscription({ text: 'Respuesta antigua' }));
    expect(screen.getByLabelText('Revisa o corrige la transcripción antes de enviarla al asistente:')).toHaveProperty('value', MOCK_TRANSCRIPTION_TEXT);
    expect(screen.queryByText('Respuesta antigua')).toBeNull();
  });
});

describe('Voz integrada con el flujo de Texto', () => {
  beforeEach(() => {

    vi.spyOn(apiClient, 'runAnalysis').mockImplementation(async (request) => resolveMockAnalysis(request));
    vi.spyOn(apiClient, 'sendAssistantMessage').mockImplementation(async (payload) => mockAssistantMessage(payload));
  });

  async function openVoice() {
    render(<App />);
    await screen.findByText('Compra recomendada');
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Asistente IA (Texto, Foto y Voz)' }));
    const assistant = within(screen.getByRole('complementary', { name: 'Asistente inteligente' }));
    await user.click(assistant.getByRole('tab', { name: 'Voz' }));
    return { user, assistant };
  }

  it('subir audio no usa hardware; solo el texto revisado crea un borrador, y solo aplicar recalcula', async () => {
    const { user, assistant } = await openVoice();
    vi.mocked(apiClient.transcribeAudio).mockResolvedValueOnce({ text: MOCK_TRANSCRIPTION_TEXT });
    await user.upload(assistant.getByLabelText('Archivo de audio para transcribir'), new File(['voz'], 'voz.webm', { type: 'audio/webm' }));
    await assistant.findByLabelText('Revisa o corrige la transcripción antes de enviarla al asistente:');
    expect(getUserMedia).not.toHaveBeenCalled();
    expect(apiClient.transcribeAudio).toHaveBeenCalledOnce();
    expect(apiClient.sendAssistantMessage).not.toHaveBeenCalled();
    expect(apiClient.runAnalysis).toHaveBeenCalledTimes(1);
    const exact = `  ${MOCK_TRANSCRIPTION_TEXT}\n  `;
    fireEvent.change(assistant.getByLabelText('Revisa o corrige la transcripción antes de enviarla al asistente:'), { target: { value: exact } });
    await user.click(assistant.getByRole('button', { name: 'Enviar texto revisado al asistente' }));
    expect(apiClient.sendAssistantMessage).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ message: exact }));
    const draft = await assistant.findByRole('region', { name: 'Borrador revisable del asistente' });
    expect(apiClient.runAnalysis).toHaveBeenCalledTimes(1);
    expect((screen.getByLabelText('¿Cuántas unidades vendes o necesitas?') as HTMLInputElement).value).toBe('10000');
    await user.click(within(draft).getByRole('button', { name: 'Aplicar datos al formulario y calcular' }));
    await waitFor(() => expect(apiClient.runAnalysis).toHaveBeenCalledTimes(2));
    expect((screen.getByLabelText('¿Cuántas unidades vendes o necesitas?') as HTMLInputElement).value).toBe('200');
    expect((screen.getByLabelText('Período de ventas') as HTMLSelectElement).value).toBe('month');
  });

  it.each(['Texto', 'Cerrar asistente'])('libera el micrófono al usar %s y mantiene disponible la calculadora', async (action) => {
    const { user, assistant } = await openVoice();
    await user.click(assistant.getByRole('button', { name: 'Grabar mensaje de voz' }));
    await assistant.findByText('Grabando');
    await user.click(action === 'Texto' ? assistant.getByRole('tab', { name: 'Texto' }) : assistant.getByRole('button', { name: 'Cerrar asistente' }));
    stops.forEach((stop) => expect(stop).toHaveBeenCalled());
    expect(apiClient.transcribeAudio).not.toHaveBeenCalled();
    expect((screen.getByRole('button', { name: 'Calcular mejor compra' }) as HTMLButtonElement).disabled).toBe(false);
  });
});
