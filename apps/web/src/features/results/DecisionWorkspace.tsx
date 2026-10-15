import { lazy, Suspense, useState } from 'react';
import { CalendarDays, Clock3, PencilLine } from 'lucide-react';
import type { AnalysisResponse } from '../../services/generated/types';
import { ProcedureAccordion } from './ProcedureAccordion';
import { formatMoney, formatNumber, numberClass } from './format';
import type { FormSection } from '../inventory-form/InventoryForm';

const AlternativesComparisonSection = lazy(() => import('./AlternativesComparisonSection').then((m) => ({ default: m.AlternativesComparisonSection })));
const views = [{ id: 'summary', label: 'Resumen' }, { id: 'compare', label: 'Comparar' }, { id: 'procedure', label: 'Procedimiento' }] as const;
type View = typeof views[number]['id'];

export function DecisionWorkspace({ response, currency, onEdit }: { response: AnalysisResponse; currency: string; onEdit: (section: FormSection) => void }) {
  const [view, setView] = useState<View>('compare');
  const [comparisonFormat, setComparisonFormat] = useState<'chart' | 'table'>('chart');
  const rec = response.recommended;
  const current = response.current_comparison;
  return <section className="desk-workspace desk-glass" aria-label="Explorar el resultado">
    <nav className="desk-result-tabs" role="tablist" aria-label="Vistas del análisis">{views.map(({ id, label }, index) => <button key={id} id={`result-tab-${id}`} type="button" role="tab" tabIndex={view === id ? 0 : -1} aria-selected={view === id} aria-controls={`result-view-${id}`} onClick={() => setView(id)} onKeyDown={(event) => {
      if (!['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? 2 : (index + (event.key === 'ArrowRight' ? 1 : 2)) % 3;
      setView(views[next].id); document.getElementById(`result-tab-${views[next].id}`)?.focus();
    }}>{label}</button>)}</nav>
    {views.filter(({ id }) => id !== view).map(({ id }) => <div key={id} id={`result-view-${id}`} role="tabpanel" aria-labelledby={`result-tab-${id}`} hidden />)}
    <div className="desk-view-content" id={`result-view-${view}`} role="tabpanel" aria-labelledby={`result-tab-${view}`} key={view}>
      {view === 'compare' && <Suspense fallback={<p className="desk-empty" role="status">Cargando comparación…</p>}><AlternativesComparisonSection response={response} currency={currency} selectedFormat={comparisonFormat} onFormatChange={setComparisonFormat} /></Suspense>}
      {view === 'summary' && <div className="desk-summary">
        <div className="desk-summary-heading"><div><h2>Una compra con menor costo anual</h2><p>Inversión y costos sobre la misma base del ejercicio.</p></div><button type="button" className="desk-secondary" onClick={() => onEdit('costos')}><PencilLine size={14} aria-hidden="true" />Editar mantenimiento</button></div>
        <div className="desk-summary-columns"><section><h3>Desglose anual</h3><dl className="desk-cost-list">{([['Compra', rec.annual_purchase_cost], ['Pedidos', rec.annual_ordering_cost], ['Mantenimiento', rec.annual_holding_cost], ['Costo anual total', rec.total_annual_cost]] as const).map(([label, value]) => <div key={label}><dt>{label}</dt><dd className={numberClass}>{formatMoney(value, currency)}</dd></div>)}</dl></section>
          <section><h3>Antes y después</h3>{current ? <><dl className="desk-cost-list"><div><dt>Tu compra actual <small className={numberClass}>({formatNumber(current.current_quantity, 0)} u.)</small></dt><dd className={numberClass}>{formatMoney(current.total_annual_cost, currency)}</dd></div><div><dt>Compra recomendada <small className={numberClass}>({formatNumber(rec.feasible_quantity, 0)} u.)</small></dt><dd className={numberClass}>{formatMoney(rec.total_annual_cost, currency)}</dd></div></dl><p className="desk-summary-saving">Ahorro anual: <strong className={numberClass}>{formatMoney(current.annual_savings, currency)}</strong> <span className={numberClass}>({formatNumber(current.savings_percentage)} %)</span></p></> : <p className="desk-caption">Ingresa tu cantidad actual para comparar cuánto ahorrarías.</p>}<button type="button" className="desk-text-action" onClick={() => onEdit('ventas')}>Editar compra actual</button></section></div>
        <p className="desk-caption">Precio recomendado por unidad: <strong className={numberClass}>{formatMoney(rec.unit_price, currency)}</strong>. La inversión por pedido se paga en cada compra; el costo anual reúne compra, pedidos y almacenamiento durante el año.</p>
      </div>}
      {view === 'procedure' && <ProcedureAccordion procedure={response.procedure} />}
    </div>
    <footer className="desk-cycle-footer"><span><CalendarDays size={18} aria-hidden="true" /><strong className={numberClass}>{formatNumber(rec.orders_per_year, 1)}</strong> pedidos/año</span><span><Clock3 size={19} aria-hidden="true" />Un pedido cada <strong className={numberClass}>{formatNumber(rec.cycle_time_days, 1)}</strong> días</span></footer>
  </section>;
}
