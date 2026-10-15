import { useEffect, useId, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { ApiClientError, apiClient } from '../../services/api-client';
import type { AnalysisRequest, AssistantResponse } from '../../services/generated/types';
import { inputClass } from '../inventory-form/form-ui';

interface ImageExtractorUploaderProps {
  onResponse: (response: AssistantResponse) => void;
  onRequestStart: (filename: string) => void;
  onRequestEnd: () => void;
  onError: (message: string, delayed?: boolean) => void;
  disabled?: boolean;
  currentDraft?: Partial<AnalysisRequest>;
}

export function ImageExtractorUploader({ onResponse, onRequestStart, onRequestEnd, onError, currentDraft, disabled = false }: ImageExtractorUploaderProps) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState('');
  const mounted = useRef(true);
  const controller = useRef<AbortController | null>(null);
  const prefix = useId();
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; controller.current?.abort(); }; }, []);
  useEffect(() => {
    if (!file) { setPreview(''); return; }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  function selectFile(selected: File | undefined) {
    setLocalError('');
    if (!selected) return;
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(selected.type) || selected.size === 0 || selected.size > 5 * 1024 * 1024) {
      setLocalError('Selecciona una imagen PNG, JPEG o WebP de hasta 5 MB que no esté vacía.');
      return;
    }
    setFile(selected);
  }

  async function extract() {
    if (!file || disabled || busy) return;
    setBusy(true);
    setLocalError('');
    onRequestStart(file.name);
    const requestController = new AbortController();
    controller.current = requestController;
    try {
      const response = await apiClient.extractFromImage(file, note, currentDraft, { signal: requestController.signal });
      if (mounted.current && !requestController.signal.aborted) onResponse(response);
    }
    catch (cause) { if (!requestController.signal.aborted && mounted.current) onError(cause instanceof Error ? cause.message : 'No pudimos interpretar la fotografía. Vuelve a intentarlo.', cause instanceof ApiClientError && cause.code === 'retry_exhausted'); }
    finally { if (controller.current === requestController) controller.current = null; onRequestEnd(); if (mounted.current) setBusy(false); }
  }

  return (
    <div className="space-y-3">
      <label htmlFor={`${prefix}-image`} className="block text-xs font-medium">Selecciona una fotografía o cotización</label>
      <input id={`${prefix}-image`} type="file" accept="image/png,image/jpeg,image/webp" disabled={disabled || busy} onChange={(event) => { selectFile(event.target.files?.[0]); event.target.value = ''; }}
        className="w-full min-w-0 text-xs text-slate-600 file:mr-2 file:rounded-lg file:border file:border-slate-300 file:bg-white file:px-3 file:py-2 file:text-xs file:text-slate-700" />
      {file && preview && <figure className="space-y-1.5">
        <img src={preview} alt="Vista previa de la cotización seleccionada" className="max-h-60 w-full rounded-lg border border-slate-200 bg-white object-contain" />
        <figcaption className="break-all text-xs text-slate-500">{file.name}</figcaption>
      </figure>}
      <label htmlFor={`${prefix}-context`} className="block text-xs font-medium">Contexto adicional de la foto</label>
      <textarea id={`${prefix}-context`} value={note} maxLength={4000} onChange={(event) => setNote(event.target.value)} rows={2} disabled={disabled || busy} placeholder="Opcional: indica qué datos quieres revisar." className={inputClass()} />
      {localError && <p role="alert" className="text-xs leading-5 text-rose-700">{localError}</p>}
      <button type="button" disabled={!file || disabled || busy} onClick={() => void extract()} className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 px-3 py-2.5 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-50 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600">
        {busy && <Loader2 size={16} aria-hidden="true" className="animate-spin motion-reduce:animate-none" />}Extraer datos de la fotografía
      </button>
      {busy && <button type="button" onClick={() => controller.current?.abort()} className="text-xs font-medium text-indigo-800 underline">Cancelar espera de la fotografía</button>}
    </div>
  );
}
