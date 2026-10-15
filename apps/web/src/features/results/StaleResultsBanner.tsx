import { AlertTriangle } from 'lucide-react';

interface StaleResultsBannerProps {
  isStale: boolean;
  isLoading?: boolean;
  formId?: string;
}

export function StaleResultsBanner({ isStale, isLoading = false, formId = 'inventory-analysis-form' }: StaleResultsBannerProps) {
  if (!isStale) return null;
  return (
    <div role="status" className="bg-amber-50 border border-amber-300 text-amber-950 rounded-xl p-4 flex items-center justify-between gap-4 shadow-2xs flex-wrap">
      <div className="flex flex-1 items-start gap-2.5 text-sm leading-6">
        <AlertTriangle size={20} className="mt-0.5 shrink-0" aria-hidden="true" />
        <p>Los datos del ejercicio cambiaron. Los resultados mostrados abajo corresponden al cálculo anterior.</p>
      </div>
      <button type="submit" form={formId} disabled={isLoading}
        className="rounded-lg border border-amber-400 bg-white px-3.5 py-2 text-xs font-semibold hover:bg-amber-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-700 disabled:opacity-50 cursor-pointer">
        Actualizar cálculo ahora
      </button>
    </div>
  );
}
