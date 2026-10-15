import { clsx } from 'clsx';
import { REFERENCE_CASES } from '../../mocks/reference-cases';
import type { ReferenceCaseId } from '../../mocks/reference-cases';

interface CaseSelectorBarProps {
  activeCase: ReferenceCaseId | null;
  onSelectCase: (id: ReferenceCaseId) => void;
  isLoading?: boolean;
}

const caseLabels: Record<ReferenceCaseId, string> = {
  ily: 'Caso ILY', wohl: 'Caso Wohl',
  sensibilidad_a: 'Sensibilidad A (Mant. = 5)', sensibilidad_b: 'Sensibilidad B (Mant. = 10)',
};

export function CaseSelectorBar({ activeCase, onSelectCase, isLoading = false }: CaseSelectorBarProps) {
  return (
    <section className="bg-white rounded-xl border border-slate-200 p-3.5 shadow-2xs" aria-label="Casos de referencia">
      <p className="text-xs font-medium text-slate-600">Casos de referencia validados (1 clic para cargar)</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {Object.values(REFERENCE_CASES).map(({ id, subtitle }) => (
          <button
            key={id} type="button" disabled={isLoading} title={subtitle}
            aria-pressed={activeCase === id} onClick={() => onSelectCase(id)}
            className={clsx(
              'rounded-full border px-3.5 py-2 text-xs transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 disabled:opacity-50 disabled:cursor-wait',
              activeCase === id
                ? 'bg-indigo-50 border-indigo-600 text-indigo-900 font-semibold'
                : 'bg-white border-slate-200 text-slate-600 hover:border-indigo-300 hover:bg-slate-50',
            )}
          >{caseLabels[id]}</button>
        ))}
      </div>
    </section>
  );
}
