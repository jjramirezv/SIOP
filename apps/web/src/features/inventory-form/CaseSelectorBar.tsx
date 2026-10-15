import { REFERENCE_CASES } from './reference-cases';
import type { ReferenceCaseId } from './reference-cases';

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
    <div className="desk-case-picker">
      <label htmlFor="reference-case" className="desk-label">Caso de análisis</label>
      <select id="reference-case" className="desk-input" value={activeCase ?? ''} disabled={isLoading}
        onChange={(event) => onSelectCase(event.target.value as ReferenceCaseId)}>
        <option value="" disabled>Ejercicio personalizado</option>
        {Object.values(REFERENCE_CASES).map(({ id }) => <option key={id} value={id}>{caseLabels[id]}</option>)}
      </select>
    </div>
  );
}
