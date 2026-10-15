import { useEffect, useId, useRef, useState } from 'react';
import { FileImage, Loader2 } from 'lucide-react';
import { apiClient } from '../../services/api-client';
import type { AssistantResponse } from '../../services/generated/types';
import { inputClass } from '../inventory-form/form-ui';

interface ImageExtractorUploaderProps {
  onResponse: (response: AssistantResponse) => void;
  onRequestStart: (filename: string) => void;
  onRequestEnd: () => void;
  onError: (message: string) => void;
  disabled?: boolean;
}

export async function createDemoQuotation(): Promise<File> {
  const canvas = document.createElement('canvas');
  canvas.width = 1100;
  canvas.height = 940;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('No pudimos generar la cotización de prueba. Puedes seleccionar una fotografía de tu dispositivo.');
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = '#0f172a';
  context.font = 'bold 32px Arial';
  context.fillText('PROVEEDOR ANDINO · COTIZACIÓN', 60, 80);
  context.font = '20px Arial';
  context.fillStyle = '#475569';
  context.fillText('Documento de demostración · Moneda: PEN (soles)', 60, 125);
  const lines = [
    'Producto: Insumos de almacén · Sensibilidad A',
    'Demanda: 2400 unidades al año · Base: 360 días por año',
    'Costo por pedido (transporte y trámites): 40 soles',
    'Mantenimiento fijo: 5 soles por unidad al año',
    'Compra actual: 200 unidades por pedido',
  ];
  context.fillStyle = '#0f172a';
  lines.forEach((line, index) => context.fillText(line, 60, 195 + index * 45));
  context.fillStyle = '#eef2ff';
  context.fillRect(60, 455, 980, 60);
  context.fillStyle = '#312e81';
  context.font = 'bold 22px Arial';
  context.fillText('Desde (unidades)', 85, 492);
  context.fillText('Hasta (unidades)', 400, 492);
  context.fillText('Precio por unidad', 725, 492);
  context.font = '24px monospace';
  [['0', '199', 'PEN 20.00'], ['200', '499', 'PEN 19.60'], ['500', 'En adelante', 'PEN 19.20']].forEach((row, index) => {
    const y = 565 + index * 75;
    context.fillStyle = '#0f172a';
    row.forEach((value, column) => context.fillText(value, [85, 400, 725][column], y));
    context.strokeStyle = '#cbd5e1';
    context.beginPath(); context.moveTo(60, y + 25); context.lineTo(1040, y + 25); context.stroke();
  });
  context.font = '20px Arial';
  context.fillStyle = '#475569';
  context.fillText('Descuento aplicado a todas las unidades de cada pedido.', 60, 835);
  context.fillText('Revisa períodos, mantenimiento y niveles de precio antes de calcular.', 60, 875);
  const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((value) => {
    if (value) resolve(value);
    else reject(new Error('No pudimos preparar la imagen de prueba. Intenta seleccionar otra fotografía.'));
  }, 'image/png'));
  return new File([blob], 'cotizacion-demo.png', { type: 'image/png' });
}

export function ImageExtractorUploader({ onResponse, onRequestStart, onRequestEnd, onError, disabled = false }: ImageExtractorUploaderProps) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState('');
  const mounted = useRef(true);
  const prefix = useId();
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    if (!file) { setPreview(''); return; }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  function selectFile(selected: File | undefined) {
    setLocalError('');
    if (!selected) return;
    if (!selected.type.startsWith('image/') || selected.size === 0) {
      setLocalError('Selecciona una imagen válida que no esté vacía.');
      return;
    }
    setFile(selected);
  }

  async function loadDemo() {
    setBusy(true);
    setLocalError('');
    try {
      const image = await createDemoQuotation();
      if (mounted.current) setFile(image);
    } catch (cause) {
      if (mounted.current) setLocalError(cause instanceof Error ? cause.message : 'No pudimos generar la cotización de prueba. Selecciona una imagen.');
    } finally { if (mounted.current) setBusy(false); }
  }

  async function extract() {
    if (!file || disabled || busy) return;
    setBusy(true);
    setLocalError('');
    onRequestStart(file.name);
    try { onResponse(await apiClient.extractFromImage(file, note)); }
    catch (cause) { onError(cause instanceof Error ? cause.message : 'No pudimos interpretar la fotografía. Vuelve a intentarlo.'); }
    finally { onRequestEnd(); if (mounted.current) setBusy(false); }
  }

  return (
    <div className="space-y-3">
      <label htmlFor={`${prefix}-image`} className="block text-xs font-medium">Selecciona una fotografía o cotización</label>
      <input id={`${prefix}-image`} type="file" accept="image/*" disabled={disabled || busy} onChange={(event) => { selectFile(event.target.files?.[0]); event.target.value = ''; }}
        className="w-full min-w-0 text-xs text-slate-600 file:mr-2 file:rounded-lg file:border file:border-slate-300 file:bg-white file:px-3 file:py-2 file:text-xs file:text-slate-700" />
      <button type="button" onClick={() => void loadDemo()} disabled={disabled || busy} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 cursor-pointer"><FileImage size={15} aria-hidden="true" />Cotización de prueba (Demo)</button>
      {file && preview && <figure className="space-y-1.5">
        <img src={preview} alt="Vista previa de la cotización seleccionada" className="max-h-60 w-full rounded-lg border border-slate-200 bg-white object-contain" />
        <figcaption className="break-all text-xs text-slate-500">{file.name}</figcaption>
      </figure>}
      <label htmlFor={`${prefix}-context`} className="block text-xs font-medium">Contexto adicional de la foto</label>
      <textarea id={`${prefix}-context`} value={note} onChange={(event) => setNote(event.target.value)} rows={2} disabled={disabled || busy} placeholder="Opcional: indica qué datos quieres revisar." className={inputClass()} />
      {localError && <p role="alert" className="text-xs leading-5 text-rose-700">{localError}</p>}
      <button type="button" disabled={!file || disabled || busy} onClick={() => void extract()} className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 px-3 py-2.5 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-50 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600">
        {busy && <Loader2 size={16} aria-hidden="true" className="animate-spin motion-reduce:animate-none" />}Extraer datos de la fotografía
      </button>
    </div>
  );
}
