import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, Image, MessageSquare, Mic, Send, Sparkles, X } from 'lucide-react';
import { clsx } from 'clsx';
import { ApiClientError, apiClient } from '../../services/api-client';
import type { AnalysisRequest, AnalysisResponse, AssistantMessageRequest, AssistantResponse } from '../../services/generated/types';
import { AssistantRequestStatus } from './AssistantRequestStatus';
import { DraftReviewCard } from './DraftReviewCard';
import { ImageExtractorUploader } from './ImageExtractorUploader';
import { VoiceRecorderControl } from './VoiceRecorderControl';
import { inputClass } from '../inventory-form/form-ui';

export const EXAMPLE_EXERCISE = 'Vendo 2400 unidades al año, cada pedido me cuesta 40 soles y guardar cada unidad cuesta 5 soles al año. El proveedor me cobra 20 soles de 0 a 199, 19.60 desde 200 y 19.20 desde 500.';

interface AssistantPanelProps {
  isOpen: boolean;
  onClose: () => void;
  currentDraft: AnalysisRequest;
  currentResult: AnalysisResponse | null;
  onApplyDraft: (draft: Partial<AnalysisRequest>) => boolean;
  isCalculating: boolean;
  aiAvailable?: boolean | null;
}

interface ChatMessage {
  id: number;
  role: 'user' | 'assistant';
  text: string;
  response?: AssistantResponse;
  draftStatus?: 'pending' | 'applied' | 'discarded';
}

const tabs = [
  { id: 'text', label: 'Texto', icon: MessageSquare },
  { id: 'image', label: 'Fotografía', icon: Image },
  { id: 'voice', label: 'Voz', icon: Mic },
] as const;
type InputTab = typeof tabs[number]['id'];
const chipClass = 'rounded-full border border-indigo-200 bg-white px-3 py-1.5 text-xs font-medium text-indigo-900 hover:bg-indigo-50 disabled:opacity-40 cursor-pointer focus-visible:outline-2 focus-visible:outline-indigo-600';

export function AssistantPanel({ isOpen, onClose, currentDraft, currentResult, onApplyDraft, isCalculating, aiAvailable }: AssistantPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([{
    id: 0, role: 'assistant', text: 'Cuéntame tu ejercicio o sube una cotización. Prepararé un borrador para que lo revises antes de aplicarlo a la calculadora.',
  }]);
  const [tab, setTab] = useState<InputTab>('text');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [errorKind, setErrorKind] = useState<'service' | 'draft' | 'delay'>('service');
  const [failedText, setFailedText] = useState('');
  const [pendingInput, setPendingInput] = useState<'text' | 'image'>('text');
  const controller = useRef<AbortController | null>(null);
  const failedRequest = useRef<AssistantMessageRequest | null>(null);
  const nextId = useRef(1);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const focusExample = useRef(false);
  const history = useRef<HTMLDivElement>(null);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; controller.current?.abort(); }; }, []);
  useEffect(() => { if (isOpen) closeButton.current?.focus(); }, [isOpen]);
  useEffect(() => {
    if (focusExample.current && tab === 'text') { textarea.current?.focus(); focusExample.current = false; }
  }, [tab, text]);
  useEffect(() => { if (history.current) history.current.scrollTop = history.current.scrollHeight; }, [messages, busy, isOpen]);

  function addResponse(response: AssistantResponse) {
    if (!alive.current) return;
    const id = nextId.current++;
    setMessages((previous) => [...previous, { id, role: 'assistant', text: response.reply_message, response, draftStatus: 'pending' }]);
  }

  async function sendMessage(message: string, retryPayload?: AssistantMessageRequest) {
    if (!message.trim() || busy) return;
    const requestController = new AbortController();
    controller.current = requestController;
    const payload = retryPayload ?? {
      message, history: messages.filter((entry) => entry.id !== 0).slice(-10).map((entry) => ({ role: entry.role, content: entry.text.slice(0, 4000) })),
      current_draft: structuredClone(currentDraft), current_result: currentResult ? structuredClone(currentResult) : null,
    };
    failedRequest.current = payload;
    setPendingInput('text');
    setBusy(true); setError(''); setErrorKind('service'); setFailedText(''); setText('');
    if (!retryPayload) {
      const id = nextId.current++;
      setMessages((previous) => [...previous, { id, role: 'user', text: message }]);
    }
    try {
      const response = await apiClient.sendAssistantMessage(payload, { signal: requestController.signal });
      if (requestController.signal.aborted) return;
      addResponse(response);
    } catch (cause) {
      if (alive.current) {
        if (requestController.signal.aborted) { setText(message); return; }
        setErrorKind(cause instanceof ApiClientError && cause.code === 'retry_exhausted' ? 'delay' : 'service');
        setError(cause instanceof Error ? cause.message : 'No pudimos interpretar el mensaje. Vuelve a intentarlo.');
        setFailedText(message);
      }
    } finally {
      if (controller.current === requestController) controller.current = null;
      if (alive.current) setBusy(false);
    }
  }

  function updateDraftStatus(id: number, draftStatus: 'applied' | 'discarded') {
    setMessages((previous) => previous.map((message) => message.id === id ? { ...message, draftStatus } : message));
  }

  function applyDraft(id: number, editedDraft: Partial<AnalysisRequest>) {
    if (isCalculating) return;
    if (onApplyDraft(editedDraft)) {
      updateDraftStatus(id, 'applied');
      setError('');
    } else {
      setErrorKind('draft');
      setError('Revisa los datos del borrador y completa los campos del formulario antes de calcular. La propuesta sigue disponible para corregirla.');
      setFailedText('');
    }
  }

  if (!isOpen) return null;
  return (
    <aside id="assistant-panel" aria-labelledby="assistant-heading" onKeyDown={(event) => { if (event.key === 'Escape') { event.stopPropagation(); onClose(); } }}
      className="desk-assistant desk-glass flex flex-col overflow-hidden">
      <header className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-200 bg-indigo-50/70 p-4">
        <div>
          <h2 id="assistant-heading" className="flex items-center gap-2 text-base font-semibold text-indigo-950"><Sparkles size={18} aria-hidden="true" />Asistente inteligente</h2>
          <p className="mt-1 text-xs leading-5 text-slate-600">Interpretación mediante la API. Tú decides qué datos aplicar.</p>
        </div>
        <button ref={closeButton} type="button" onClick={onClose} aria-label="Cerrar asistente" className="rounded-lg p-2 text-slate-600 hover:bg-white focus-visible:outline-2 focus-visible:outline-indigo-600"><X size={18} aria-hidden="true" /></button>
      </header>
      {aiAvailable === false && <p role="status" className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-950">El asistente necesita configurar Gemini en el servidor. Puedes seguir calculando con el formulario manual.</p>}
      <div className="flex shrink-0 flex-wrap gap-2 border-b border-slate-100 p-3">
        <button type="button" className={chipClass} disabled={busy || !currentResult} title={!currentResult ? 'Calcula con los datos actuales para explicar el resultado vigente.' : undefined} onClick={() => void sendMessage('Explícame el resultado')}>Explícame el resultado</button>
        <button type="button" className={chipClass} disabled={busy} onClick={() => void sendMessage('Prueba otro escenario')}>Prueba otro escenario</button>
        <button type="button" className={chipClass} disabled={busy} onClick={() => { focusExample.current = true; setTab('text'); setText(EXAMPLE_EXERCISE); textarea.current?.focus(); }}>Ejemplo de ejercicio por texto</button>
      </div>
      <div ref={history} role="log" aria-label="Historial de conversación" aria-live="polite" className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
        {messages.map((message) => <article key={message.id} className="space-y-2">
          <div className={clsx('rounded-xl px-3 py-2.5 text-sm leading-6 whitespace-pre-wrap break-words', message.role === 'user' ? 'ml-6 bg-indigo-600 text-white' : 'mr-3 bg-slate-50 text-slate-800')}>
            <p className={clsx('mb-1 text-xs font-semibold', message.role === 'user' ? 'text-indigo-100' : 'text-slate-500')}>{message.role === 'user' ? 'Tú' : 'Asistente'}</p>
            <p>{message.text}</p>
          </div>
          {message.response?.proposed_data && message.draftStatus === 'pending' && <DraftReviewCard proposedData={message.response.proposed_data} missingFields={message.response.missing_fields} fieldsToReview={message.response.fields_to_review} onApplyDraft={(draft) => applyDraft(message.id, draft)} onDiscard={() => updateDraftStatus(message.id, 'discarded')} isApplying={isCalculating} />}
          {message.response?.missing_fields.length ? !message.response.proposed_data && <p className="text-xs text-amber-900">Faltan datos por confirmar. Responde al asistente para continuar.</p> : null}
          {message.draftStatus === 'applied' && <p className="text-xs text-emerald-800">Datos aplicados al formulario. Cálculo solicitado.</p>}
          {message.draftStatus === 'discarded' && <p className="text-xs text-slate-500">Propuesta descartada. El formulario conserva tus datos.</p>}
        </article>)}
      </div>
      <AssistantRequestStatus pending={busy} label={pendingInput === 'image' ? 'Analizando fotografía...' : 'Interpretando datos...'} onCancel={pendingInput === 'text' ? () => controller.current?.abort() : undefined} />
      {error && <div role={errorKind === 'delay' ? 'status' : 'alert'} className={clsx('mx-3 mb-3 shrink-0 space-y-2 rounded-lg border p-3 text-xs leading-5', errorKind === 'delay' ? 'border-indigo-200 bg-indigo-50 text-indigo-950' : 'border-rose-200 bg-rose-50 text-rose-800')}>
        <p className="flex items-start gap-1.5 font-semibold">{errorKind !== 'delay' && <AlertTriangle size={15} aria-hidden="true" className="mt-0.5 shrink-0" />}{errorKind === 'delay' ? 'Tu solicitud está guardada' : errorKind === 'service' ? 'Error del servicio de IA — Puedes seguir usando el formulario manual' : 'Revisa los datos antes de aplicar la propuesta'}</p>
        <p>{error}</p><div className="flex gap-3">
          {failedText && <button type="button" disabled={busy} onClick={() => void sendMessage(failedText, failedRequest.current ?? undefined)} className="font-semibold underline">Reintentar mensaje</button>}
          <button type="button" onClick={() => { setError(''); setFailedText(''); }} className="underline">{errorKind === 'delay' ? 'Cerrar aviso' : 'Cerrar alerta'}</button>
        </div>
      </div>}
      <div className="max-h-[48%] shrink-0 overflow-y-auto border-t border-slate-200 bg-slate-50/70 p-3">
        <div role="tablist" aria-label="Forma de enviar datos al asistente" className="mb-3 grid grid-cols-3 rounded-lg border border-slate-200 bg-white p-1">
          {tabs.map(({ id, label, icon: Icon }, index) => <button key={id} id={`assistant-tab-${id}`} type="button" role="tab" aria-selected={tab === id} aria-controls={`assistant-input-${id}`} tabIndex={tab === id ? 0 : -1}
            onClick={() => setTab(id)} onKeyDown={(event) => {
              if (['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(event.key)) {
                event.preventDefault();
                const next = event.key === 'Home' ? 0 : event.key === 'End' ? 2 : (index + (event.key === 'ArrowRight' ? 1 : 2)) % 3;
                setTab(tabs[next].id);
                document.getElementById(`assistant-tab-${tabs[next].id}`)?.focus();
              }
            }} className={clsx('inline-flex items-center justify-center gap-1.5 rounded-md px-2 py-2 text-xs font-medium focus-visible:outline-2 focus-visible:outline-indigo-600', tab === id ? 'bg-indigo-50 text-indigo-900' : 'text-slate-600 hover:bg-slate-50')}><Icon size={14} aria-hidden="true" />{label}</button>)}
        </div>
        <div role="tabpanel" id="assistant-input-text" aria-labelledby="assistant-tab-text" hidden={tab !== 'text'}>
          <form onSubmit={(event) => { event.preventDefault(); void sendMessage(text); }} className="space-y-2">
            <label htmlFor="assistant-message" className="sr-only">Mensaje para el asistente</label>
            <textarea ref={textarea} id="assistant-message" value={text} onChange={(event) => setText(event.target.value)} maxLength={4000} rows={3} placeholder="Escribe tu ejercicio o una pregunta…" disabled={busy} className={inputClass()} />
            <button type="submit" disabled={busy || !text.trim()} className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 cursor-pointer"><Send size={15} aria-hidden="true" />Enviar</button>
          </form>
        </div>
        <div role="tabpanel" id="assistant-input-image" aria-labelledby="assistant-tab-image" hidden={tab !== 'image'}>
          <ImageExtractorUploader currentDraft={currentDraft} disabled={busy} onRequestStart={(filename) => {
            setPendingInput('image');
            setBusy(true); setError(''); setErrorKind('service'); setFailedText('');
            const id = nextId.current++;
            setMessages((previous) => [...previous, { id, role: 'user', text: `Fotografía: ${filename}` }]);
          }} onResponse={addResponse} onRequestEnd={() => { if (alive.current) setBusy(false); }} onError={(message, delayed) => { if (alive.current) { setError(message); setErrorKind(delayed ? 'delay' : 'service'); } }} />
        </div>
        <div role="tabpanel" id="assistant-input-voice" aria-labelledby="assistant-tab-voice" hidden={tab !== 'voice'}>
          <VoiceRecorderControl onSendReviewedText={sendMessage} disabled={busy} isActive={tab === 'voice'} />
        </div>
      </div>
    </aside>
  );
}
