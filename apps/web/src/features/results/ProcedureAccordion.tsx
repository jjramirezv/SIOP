import { ChevronDown } from 'lucide-react';
import type { ProcedureDetails } from '../../services/generated/types';
import { formatNumber, numberClass } from './format';

export function ProcedureAccordion({ procedure }: { procedure: ProcedureDetails }) {
  return (
    <details className="group bg-white rounded-xl border border-slate-200 p-5 shadow-xs">
      <summary className="flex cursor-pointer list-none items-start justify-between gap-3 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-indigo-600">
        Ver procedimiento matemático, fórmulas y supuestos del modelo
        <ChevronDown size={18} aria-hidden="true" className="shrink-0 transition-transform group-open:rotate-180 motion-reduce:transition-none" />
      </summary>
      <div className="mt-5 space-y-6 text-sm leading-6 text-slate-600">
        <section aria-label="Significado de los símbolos">
          <h3 className="font-semibold text-slate-900">Símbolos del modelo</h3>
          <dl className="mt-3 grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2">
            {[
              ['D', 'Demanda anualizada'], ['S o C2', 'Costo por pedido'],
              ['H o C3', 'Costo anual de mantenimiento por unidad'], ['P o C1', 'Precio unitario'],
              ['Q*', 'Cantidad económica de pedido'],
            ].map(([symbol, label]) => <div key={symbol} className="contents"><dt className={`${numberClass} text-slate-900`}>{symbol}</dt><dd>{label}</dd></div>)}
          </dl>
          <p className={`${numberClass} mt-3`}>Demanda anualizada: {formatNumber(procedure.annualized_demand)} unidades/año. Costo por pedido: {formatNumber(procedure.annual_ordering_cost_param)}.</p>
          <p className="mt-2">{procedure.holding_cost_summary}</p>
        </section>
        <section aria-label="Fórmulas utilizadas" className="space-y-2">
          <h3 className="font-semibold text-slate-900">Fórmulas utilizadas</h3>
          {procedure.formulas_used.map((formula, index) => <pre key={index} className="bg-slate-900 text-slate-100 font-mono tabular-nums tracking-tight text-xs p-3.5 rounded-lg overflow-x-auto whitespace-pre-wrap break-words">{formula}</pre>)}
        </section>
        <section aria-label="Desarrollo del cálculo">
          <h3 className="font-semibold text-slate-900">Paso a paso del caso analizado</h3>
          <ol className={`${numberClass} mt-3 list-decimal space-y-3 pl-5`}>{procedure.step_by_step.map((step, index) => <li key={index}>{step}</li>)}</ol>
        </section>
        <section aria-label="Supuestos del modelo">
          <h3 className="font-semibold text-slate-900">Supuestos del modelo</h3>
          <ul className="mt-3 list-disc space-y-2 pl-5">{procedure.assumptions.map((assumption, index) => <li key={index}>{assumption}</li>)}</ul>
        </section>
      </div>
    </details>
  );
}
