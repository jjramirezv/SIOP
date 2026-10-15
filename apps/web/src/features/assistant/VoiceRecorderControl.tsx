import { useEffect, useId, useRef, useState } from 'react';
import { AlertTriangle, Loader2, Mic, Send, Square, Upload } from 'lucide-react';
import { apiClient } from '../../services/api-client';
import { MOCK_TRANSCRIPTION_TEXT } from '../../mocks/reference-cases';
import { inputClass } from '../inventory-form/form-ui';

export type VoiceRecorderState = 'idle' | 'requesting_permission' | 'recording' | 'transcribing' | 'reviewing' | 'error';

interface VoiceRecorderControlProps {
  onSendReviewedText: (text: string) => void | Promise<void>;
  disabled?: boolean;
  isActive?: boolean;
}

const secondaryClass = 'inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600';
const primaryClass = 'inline-flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 px-3 py-2.5 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-50 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600';

function microphoneError(cause: unknown): string {
  const name = cause instanceof Error || (typeof cause === 'object' && cause !== null && 'name' in cause) ? String(cause.name) : '';
  if (name === 'NotAllowedError' || name === 'SecurityError') return 'No se concedió permiso para usar el micrófono. Revisa los permisos del navegador o sube un archivo de audio.';
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError') return 'No encontramos un micrófono disponible. Puedes subir un archivo de audio o simular una grabación de prueba.';
  if (name === 'NotReadableError' || name === 'TrackStartError') return 'No pudimos acceder al micrófono. Cierra otras aplicaciones que lo estén usando o sube un archivo de audio.';
  return 'No pudimos iniciar la grabación. Usa localhost o HTTPS, revisa los permisos o prueba con un archivo de audio.';
}

function recordingFilename(mimeType: string): string {
  if (mimeType.includes('mp4')) return 'grabacion.m4a';
  if (mimeType.includes('ogg')) return 'grabacion.ogg';
  if (mimeType.includes('mpeg')) return 'grabacion.mp3';
  if (mimeType.includes('wav')) return 'grabacion.wav';
  return 'grabacion.webm';
}

export function VoiceRecorderControl({ onSendReviewedText, disabled = false, isActive = true }: VoiceRecorderControlProps) {
  const [state, setState] = useState<VoiceRecorderState>('idle');
  const [seconds, setSeconds] = useState(0);
  const [transcript, setTranscript] = useState('');
  const [error, setError] = useState('');
  const [transcriptSource, setTranscriptSource] = useState<'real' | 'mock' | 'demo'>('real');
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastAudioRef = useRef<{ blob: Blob; filename: string } | null>(null);
  const stateRef = useRef<VoiceRecorderState>('idle');
  const operationRef = useRef(0);
  const alive = useRef(true);
  const id = useId();

  function changeState(next: VoiceRecorderState) {
    stateRef.current = next;
    setState(next);
  }

  function releaseMicrophone() {
    const stream = streamRef.current;
    streamRef.current = null;
    stream?.getTracks().forEach((track) => track.stop());
    if (timerRef.current !== null) { clearInterval(timerRef.current); timerRef.current = null; }
  }

  function disposeRecorder() {
    const recorder = recorderRef.current;
    recorderRef.current = null;
    try {
      if (recorder) {
        recorder.ondataavailable = null;
        recorder.onstop = null;
        recorder.onerror = null;
        if (recorder.state !== 'inactive') recorder.stop();
      }
    } catch {
      // Algunos navegadores ya detuvieron el dispositivo: liberar sus pistas igualmente.
    } finally { releaseMicrophone(); }
  }

  function cancel() {
    operationRef.current += 1;
    disposeRecorder();
    lastAudioRef.current = null;
    setTranscript(''); setError(''); setSeconds(0);
    changeState('idle');
  }

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      operationRef.current += 1;
      disposeRecorder();
      lastAudioRef.current = null;
    };
  }, []);

  useEffect(() => {
    if ((!isActive || disabled) && ['requesting_permission', 'recording', 'transcribing'].includes(stateRef.current)) cancel();
  }, [isActive, disabled]);

  function fail(message: string) {
    setError(message);
    changeState('error');
  }

  async function transcribe(blob: Blob, filename: string, operation: number) {
    if (!alive.current || operation !== operationRef.current) return;
    if (blob.size === 0) { fail('No se detectó audio en la grabación. Intenta grabar de nuevo o sube un archivo que no esté vacío.'); return; }
    lastAudioRef.current = { blob, filename };
    setError(''); setTranscript('');
    setTranscriptSource(apiClient.useMocks ? 'mock' : 'real');
    changeState('transcribing');
    try {
      const response = await apiClient.transcribeAudio(blob, filename);
      if (!alive.current || operation !== operationRef.current) return;
      if (!response.text.trim()) { fail('La transcripción llegó vacía. Puedes reintentar, grabar de nuevo o subir otro archivo.'); return; }
      setTranscript(response.text);
      changeState('reviewing');
    } catch (cause) {
      if (alive.current && operation === operationRef.current) fail(cause instanceof Error ? cause.message : 'No pudimos transcribir el audio. Intenta de nuevo o sigue usando el formulario manual.');
    }
  }

  async function startRecording() {
    if (disabled || !isActive || ['requesting_permission', 'recording', 'transcribing'].includes(stateRef.current)) return;
    const operation = ++operationRef.current;
    disposeRecorder();
    lastAudioRef.current = null;
    setError(''); setTranscript(''); setSeconds(0);
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined' || window.isSecureContext === false) {
      fail('Este navegador no permite grabar aquí. Abre la aplicación en localhost o HTTPS, sube un archivo de audio o utiliza la simulación de prueba.');
      return;
    }
    changeState('requesting_permission');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!alive.current || operation !== operationRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      streamRef.current = stream;
      const mimeType = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus']
        .find((type) => typeof MediaRecorder.isTypeSupported === 'function' && MediaRecorder.isTypeSupported(type));
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      recorderRef.current = recorder;
      const chunks: Blob[] = [];
      recorder.ondataavailable = (event) => {
        if (operation === operationRef.current && event.data.size > 0) chunks.push(event.data);
      };
      recorder.onstop = () => {
        // Un evento tardío de una sesión cancelada no debe detener una nueva sesión.
        if (streamRef.current === stream) releaseMicrophone();
        else stream.getTracks().forEach((track) => track.stop());
        if (recorderRef.current === recorder) recorderRef.current = null;
        if (!alive.current || operation !== operationRef.current) return;
        const type = recorder.mimeType || chunks[0]?.type || 'audio/webm';
        void transcribe(new Blob(chunks, { type }), recordingFilename(type), operation);
      };
      recorder.onerror = () => {
        if (!alive.current || operation !== operationRef.current) return;
        operationRef.current += 1;
        disposeRecorder();
        fail('La grabación se interrumpió. El micrófono se ha liberado; puedes intentar de nuevo o subir un archivo de audio.');
      };
      recorder.start(250);
      const startedAt = Date.now();
      timerRef.current = setInterval(() => { if (alive.current) setSeconds(Math.floor((Date.now() - startedAt) / 1000)); }, 250);
      changeState('recording');
    } catch (cause) {
      if (!alive.current || operation !== operationRef.current) return;
      operationRef.current += 1;
      disposeRecorder();
      fail(microphoneError(cause));
    }
  }

  function stopAndTranscribe() {
    const recorder = recorderRef.current;
    if (!recorder || stateRef.current !== 'recording') return;
    changeState('transcribing');
    try { recorder.stop(); }
    catch {
      operationRef.current += 1;
      disposeRecorder();
      fail('No pudimos terminar la grabación. Intenta de nuevo o sube un archivo de audio.');
    } finally { releaseMicrophone(); }
  }

  function uploadAudio(file: File | undefined) {
    if (!file || disabled) return;
    if (!file.size || (!file.type.startsWith('audio/') && !/\.(webm|mp3|wav|m4a|mp4|ogg|oga)$/i.test(file.name))) {
      lastAudioRef.current = null;
      fail('Selecciona un archivo de audio válido que no esté vacío (.webm, .mp3, .wav o .m4a).');
      return;
    }
    const operation = ++operationRef.current;
    disposeRecorder();
    void transcribe(file, file.name, operation);
  }

  function simulate() {
    operationRef.current += 1;
    disposeRecorder();
    lastAudioRef.current = null;
    setError(''); setSeconds(0); setTranscriptSource('demo');
    setTranscript(MOCK_TRANSCRIPTION_TEXT);
    changeState('reviewing');
  }

  const pending = ['requesting_permission', 'recording', 'transcribing'].includes(state);
  return (
    <div className="space-y-3" data-state={state} aria-label="Grabación y revisión de voz">
      <p className="text-xs leading-5 text-slate-600">Graba tu ejercicio, revisa el texto y luego envíalo al asistente. También puedes subir un audio sin usar el micrófono.</p>
      {!pending && <button type="button" disabled={disabled} onClick={() => void startRecording()} className={primaryClass}><Mic size={16} aria-hidden="true" />Grabar mensaje de voz</button>}
      {state === 'requesting_permission' && <div className="space-y-2">
        <p role="status" className="flex items-center gap-2 text-xs text-indigo-800"><Loader2 size={15} aria-hidden="true" className="animate-spin motion-reduce:animate-none" />Esperando permiso del micrófono...</p>
        <button type="button" onClick={cancel} className={secondaryClass}>Cancelar</button>
      </div>}
      {state === 'recording' && <div className="space-y-3 rounded-lg border border-rose-200 bg-rose-50 p-3">
        <p role="status" className="flex items-center gap-2 text-sm text-rose-900"><span aria-hidden="true" className="h-2.5 w-2.5 rounded-full animate-pulse bg-rose-600 motion-reduce:animate-none" />Grabando <span className="font-mono tabular-nums tracking-tight">{seconds} s</span></p>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={stopAndTranscribe} className={secondaryClass}><Square size={13} aria-hidden="true" />Detener y transcribir</button>
          <button type="button" onClick={cancel} className={secondaryClass}>Cancelar</button>
        </div>
      </div>}
      {state === 'transcribing' && <div className="space-y-2">
        <p role="status" className="flex items-center gap-2 text-xs text-indigo-800"><Loader2 size={15} aria-hidden="true" className="animate-spin motion-reduce:animate-none" />Transcribiendo audio...</p>
        <button type="button" onClick={cancel} className={secondaryClass}>Cancelar</button>
      </div>}
      {state === 'error' && <div role="alert" className="space-y-2 rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs leading-5 text-rose-800">
        <p className="flex items-start gap-2"><AlertTriangle size={15} className="mt-0.5 shrink-0" aria-hidden="true" />{error}</p>
        <p>Puedes seguir usando el formulario manual.</p>
        {lastAudioRef.current && <button type="button" disabled={disabled} className="font-semibold underline" onClick={() => { const audio = lastAudioRef.current; if (audio) void transcribe(audio.blob, audio.filename, ++operationRef.current); }}>Reintentar transcripción</button>}
      </div>}
      <div className="flex flex-col gap-2 border-t border-slate-200 pt-3">
        <input id={`${id}-audio-file`} type="file" accept=".webm,.mp3,.wav,.m4a,audio/*" className="sr-only" disabled={disabled || pending} onChange={(event) => { uploadAudio(event.target.files?.[0]); event.target.value = ''; }} />
        <button type="button" disabled={disabled || pending} onClick={() => document.getElementById(`${id}-audio-file`)?.click()} className={secondaryClass}><Upload size={15} aria-hidden="true" />Subir archivo de audio (.webm, .mp3, .wav, .m4a)</button>
        <label htmlFor={`${id}-audio-file`} className="sr-only">Archivo de audio para transcribir</label>
        <button type="button" disabled={disabled || pending} onClick={simulate} className={secondaryClass}>Simular grabación de prueba</button>
      </div>
      {state === 'reviewing' && <div className="space-y-2 rounded-lg border border-indigo-200 bg-white p-3">
        {transcriptSource !== 'real' && <p className="rounded-lg border border-amber-200 bg-amber-50 p-2 text-xs leading-5 text-amber-950">{transcriptSource === 'demo' ? 'Grabación de prueba simulada: texto de ejemplo. No se utilizó el micrófono ni se transcribió una grabación real.' : 'Transcripción simulada: texto de ejemplo. El audio no se envió a un proveedor real.'}</p>}
        <label htmlFor={`${id}-transcript`} className="block text-xs font-medium">Revisa o corrige la transcripción antes de enviarla al asistente:</label>
        <textarea id={`${id}-transcript`} value={transcript} onChange={(event) => setTranscript(event.target.value)} disabled={disabled} rows={5} className={inputClass()} />
        <button type="button" disabled={disabled || !transcript.trim()} onClick={() => { void onSendReviewedText(transcript); }} className={primaryClass}><Send size={15} aria-hidden="true" />Enviar texto revisado al asistente</button>
        <button type="button" disabled={disabled} onClick={cancel} className={secondaryClass}>Descartar transcripción</button>
      </div>}
    </div>
  );
}
