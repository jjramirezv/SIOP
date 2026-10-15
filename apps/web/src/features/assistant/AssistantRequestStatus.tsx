import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';

export function AssistantRequestStatus({ pending, label, onCancel, cancelLabel = 'Cancelar espera' }: {
  pending: boolean; label: string; onCancel?: () => void; cancelLabel?: string;
}) {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    if (!pending) { setSlow(false); return; }
    const timer = setTimeout(() => setSlow(true), 8000);
    return () => clearTimeout(timer);
  }, [pending]);
  if (!pending) return null;
  return <div className="flex shrink-0 items-start justify-between gap-3 px-4 py-3 text-xs text-indigo-800">
    <div role="status" aria-live="polite" className="flex items-start gap-2">
      <Loader2 size={15} aria-hidden="true" className="mt-0.5 shrink-0 animate-spin motion-reduce:animate-none" />
      <div><p>{label}</p>{slow && <p className="mt-1 leading-5 text-slate-600">Esto puede demorar más de lo esperado. Seguimos intentando; no necesitas volver a enviar tus datos.</p>}</div>
    </div>
    {onCancel && <button type="button" onClick={onCancel} className="shrink-0 rounded px-1 py-0.5 font-medium underline focus-visible:outline-2 focus-visible:outline-indigo-600">{cancelLabel}</button>}
  </div>;
}
