import { useEffect, useState } from 'react';
import { TrendingDown } from 'lucide-react';
import type { AnalysisRequest, AnalysisResponse } from '../../services/generated/types';
import { inputClass } from '../inventory-form/form-ui';
import { formatMoney, formatNumber, numberClass } from './format';

interface SensitivityAndComparisonBarProps {
  response: AnalysisResponse;
  request: AnalysisRequest;
  currency: string;
  onQuickRecalculate: (updatedRequest: AnalysisRequest) => void;
  isLoading: boolean;
  useMocks: boolean;
}

const buttonClass = 'rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 disabled:opacity-50 cursor-pointer';
const periods = { year: 'al año', month: 'al mes', day: 'al día' };

export function SensitivityAndComparisonBar({ response, request, currency, onQuickRecalculate, isLoading, useMocks }: SensitivityAndComparisonBarProps) {
  const [demand, setDemand] = useState(String(request.demand));
  const [holding, setHolding] = useState(String(request.holding_cost_value));
  useEffect(() => { setDemand(String(request.demand)); }, [request.demand]);
  useEffect(() => { setHolding(String(request.holding_cost_value)); }, [request.holding_cost_value]);
  const comparison = response.current_comparison;
  const holdingUnit = request.holding_cost_mode === 'percentage' ? '%' : request.currency;

  return (
    <section className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs space-y-6" aria-label="Comparación y sensibilidad">
      <div>
        <h2 className="text-base font-semibold">Comparación con tu compra actual</h2>
        {comparison ? (
          <>
            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3.5">
                <p className={`${numberClass} text-xs text-slate-600`}>Tu pedido actual ({formatNumber(comparison.current_quantity, 0)} u.)</p>
                <p className={`${numberClass} mt-2 text-lg font-semibold`}>{formatMoney(comparison.total_annual_cost, currency)}</p>
                <p className="mt-1 text-xs text-slate-500">Costo anual antes</p>
              </div>
              <div className="rounded-lg border border-emerald-200 bg-emerald-50/70 p-3.5">
                <p className={`${numberClass} text-xs text-emerald-900`}>Pedido óptimo recomendado ({formatNumber(response.recommended.feasible_quantity, 0)} u.)</p>
                <p className={`${numberClass} mt-2 text-lg font-semibold text-emerald-900`}>{formatMoney(response.recommended.total_annual_cost, currency)}</p>
                <p className="mt-1 text-xs text-emerald-800">Costo anual después</p>
              </div>
            </div>
            <p className="mt-3 inline-flex flex-wrap items-center gap-2 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 px-3 py-1.5 text-xs">
              <TrendingDown size={15} aria-hidden="true" />Ahorro anual:
              <strong className={numberClass}>{formatMoney(comparison.annual_savings, currency)} ({formatNumber(comparison.savings_percentage)}%)</strong>
            </p>
          </>
        ) : <p className="mt-3 text-sm leading-6 text-slate-500">Ingresa cuántas unidades sueles pedir en el formulario y calcula para comparar cuánto ahorrarías.</p>}
      </div>
      <div className="border-t border-slate-200 pt-5">
        <h2 className="text-base font-semibold">¿Qué pasa si cambia la demanda o el mantenimiento?</h2>
        <p className="mt-2 text-xs leading-5 text-slate-500">Los controles usan los datos actuales del formulario. Cada cambio aplicado solicita un nuevo análisis.</p>
        {useMocks && <p className="mt-2 text-xs leading-5 text-amber-900">En modo simulado, carga Sensibilidad A o B para probar mantenimiento de 5 a 10. Otros cambios requieren la API real.</p>}
        <fieldset disabled={isLoading} className="mt-4 grid min-w-0 grid-cols-1 gap-4 xl:grid-cols-2">
          <div className="space-y-2">
            <label htmlFor="quick-demand" className="block text-xs font-medium">Demanda (unidades {periods[request.demand_period]})</label>
            <div className="flex gap-2">
              <input id="quick-demand" type="number" min="0" step="any" value={demand} onChange={(event) => setDemand(event.target.value)} className={inputClass(false, true)} />
              <button type="button" className={buttonClass} onClick={() => onQuickRecalculate({ ...request, demand: Number(demand) })}>Aplicar demanda</button>
            </div>
            <div className="flex gap-2">
              <button type="button" aria-label="Reducir demanda un 10%" className={`${buttonClass} ${numberClass}`} onClick={() => onQuickRecalculate({ ...request, demand: +(request.demand * 0.9).toFixed(8) })}>−10%</button>
              <button type="button" aria-label="Aumentar demanda un 10%" className={`${buttonClass} ${numberClass}`} onClick={() => onQuickRecalculate({ ...request, demand: +(request.demand * 1.1).toFixed(8) })}>+10%</button>
            </div>
          </div>
          <div className="space-y-2">
            <label htmlFor="quick-holding" className="block text-xs font-medium">Mantenimiento ({holdingUnit} {periods[request.holding_cost_period]})</label>
            <div className="flex gap-2">
              <input id="quick-holding" type="number" min="0" step="any" value={holding} onChange={(event) => setHolding(event.target.value)} className={inputClass(false, true)} />
              <button type="button" className={buttonClass} onClick={() => onQuickRecalculate({ ...request, holding_cost_value: Number(holding) })}>Aplicar mantenimiento</button>
            </div>
            <div className="flex gap-2">
              <button type="button" aria-label="Reducir mantenimiento un 10%" className={`${buttonClass} ${numberClass}`} onClick={() => onQuickRecalculate({ ...request, holding_cost_value: +(request.holding_cost_value * 0.9).toFixed(8) })}>−10%</button>
              <button type="button" aria-label="Aumentar mantenimiento un 10%" className={`${buttonClass} ${numberClass}`} onClick={() => onQuickRecalculate({ ...request, holding_cost_value: +(request.holding_cost_value * 1.1).toFixed(8) })}>+10%</button>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 xl:col-span-2">
            <button type="button" className={`${buttonClass} ${numberClass}`} onClick={() => onQuickRecalculate({ ...request, holding_cost_value: 5 })}>Probar Mantenimiento = 5</button>
            <button type="button" className={`${buttonClass} ${numberClass}`} onClick={() => onQuickRecalculate({ ...request, holding_cost_value: 10 })}>Probar Mantenimiento = 10</button>
          </div>
        </fieldset>
      </div>
    </section>
  );
}
