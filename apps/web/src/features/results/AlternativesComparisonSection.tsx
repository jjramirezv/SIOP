import { Fragment, useId, useState, useSyncExternalStore } from 'react';
import { Bar, BarChart, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { BarChart3, ChevronDown, Table2 } from 'lucide-react';
import type { AnalysisResponse } from '../../services/generated/types';
import { formatMoney, formatNumber, numberClass } from './format';

export interface CostChartRow {
  label: string;
  annual_purchase_cost: number;
  annual_ordering_cost: number;
  annual_holding_cost: number;
  total_annual_cost: number;
  color: string;
}

const subscribeMotion = (onChange: () => void) => {
  const media = window.matchMedia?.('(prefers-reduced-motion: reduce)');
  media?.addEventListener('change', onChange);
  return () => media?.removeEventListener('change', onChange);
};
const motionSnapshot = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? true;

export function CostBreakdownTooltip({ active, payload, currency }: {
  active?: boolean;
  payload?: ReadonlyArray<{ payload?: CostChartRow }>;
  currency: string;
}) {
  const row = payload?.[0]?.payload;
  if (!active || !row) return null;
  return <div className="desk-chart-tooltip"><strong>{row.label} unidades</strong><dl>
    {([['Compra', row.annual_purchase_cost], ['Pedidos', row.annual_ordering_cost], ['Mantenimiento', row.annual_holding_cost], ['Total', row.total_annual_cost]] as const).map(([label, value]) =>
      <div key={label}><dt>{label}</dt><dd className={numberClass}>{formatMoney(value, currency)}</dd></div>)}
  </dl></div>;
}

export function AlternativesComparisonSection({ response, currency, selectedFormat, onFormatChange }: { response: AnalysisResponse; currency: string; selectedFormat?: 'chart' | 'table'; onFormatChange?: (format: 'chart' | 'table') => void }) {
  const [localFormat, setLocalFormat] = useState<'chart' | 'table'>('chart');
  const format = selectedFormat ?? localFormat;
  const setFormat = onFormatChange ?? setLocalFormat;
  const [expanded, setExpanded] = useState<number | null>(null);
  const reduceMotion = useSyncExternalStore(subscribeMotion, motionSnapshot, () => true);
  const gradient = useId().replace(/:/g, '');
  const rows: CostChartRow[] = response.alternatives.map((alternative) => ({ ...alternative,
    label: formatNumber(alternative.feasible_quantity, 0),
    color: alternative.is_recommended ? `url(#${gradient}-best)` : `url(#${gradient}-other)`,
  }));
  // No duplicar la barra cuando la compra actual ya es un candidato de la API.
  const current = response.current_comparison;
  if (current && !response.alternatives.some((a) => a.feasible_quantity === current.current_quantity && a.total_annual_cost === current.total_annual_cost)) {
    rows.push({ ...current, label: `${formatNumber(current.current_quantity, 0)} actual`, color: `url(#${gradient}-current)` });
  }
  return <section className="desk-comparison" aria-labelledby="alternatives-heading">
    <div className="desk-comparison-heading"><div><h2 id="alternatives-heading">Costo anual total por cantidad de pedido</h2><p>Compara alternativas y elige la opción de menor costo anual.</p></div>
      <div className="desk-segmented desk-format-toggle" role="group" aria-label="Formato de comparación">
        <button type="button" className="desk-segment" aria-pressed={format === 'chart'} onClick={() => setFormat('chart')}><BarChart3 size={15} aria-hidden="true" />Gráfico</button>
        <button type="button" className="desk-segment" aria-pressed={format === 'table'} onClick={() => setFormat('table')}><Table2 size={15} aria-hidden="true" />Tabla</button>
      </div>
    </div>
    {format === 'chart' ? <figure className="desk-chart" aria-label="Gráfico de barras de costo total anual por alternativa">
      <figcaption className="sr-only">Costo total anual en {currency}. La barra verde identifica la compra recomendada. Todas las barras parten de cero.</figcaption>
      <ResponsiveContainer width="100%" height={Math.max(210, rows.length * 58 + 36)} minWidth={0} initialDimension={{ width: 0, height: 210 }}>
        <BarChart data={rows} layout="vertical" margin={{ top: 12, right: 132, bottom: 8, left: 0 }} accessibilityLayer>
          <defs>
            <linearGradient id={`${gradient}-best`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#8dffd0" /><stop offset=".18" stopColor="#0ed69a" /><stop offset=".7" stopColor="#00b987" /><stop offset="1" stopColor="#009b75" /></linearGradient>
            <linearGradient id={`${gradient}-other`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#c5d5e7" /><stop offset=".18" stopColor="#9aadc5" /><stop offset="1" stopColor="#6b87a6" /></linearGradient>
            <linearGradient id={`${gradient}-current`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#a9a0f1" /><stop offset="1" stopColor="#7561c5" /></linearGradient>
          </defs>
          <XAxis type="number" domain={[0, 'auto']} tickFormatter={(v: number) => formatNumber(v, 0)} tick={{ fontSize: 11, fill: '#4e6079', fontFamily: 'var(--font-mono)' }} tickLine={false} axisLine={{ stroke: '#b3c1d5' }} minTickGap={24} />
          <YAxis type="category" dataKey="label" width={67} tick={{ fontSize: 12, fill: '#20334e', fontFamily: 'var(--font-mono)' }} tickLine={false} axisLine={false} />
          <Tooltip content={<CostBreakdownTooltip currency={currency} />} cursor={{ fill: 'rgba(255,255,255,.35)' }} isAnimationActive={false} />
          <Bar dataKey="total_annual_cost" name="Costo total anual" radius={[3, 3, 3, 3]} maxBarSize={27} isAnimationActive={!reduceMotion} animationDuration={380}>
            {rows.map((row) => <Cell key={row.label} fill={row.color} className={row.color.includes('-best') ? 'desk-best-bar' : 'desk-other-bar'} />)}
            <LabelList dataKey="total_annual_cost" position="right" offset={10} formatter={(v: unknown) => formatMoney(Number(v), currency)} fill="#132b45" fontSize={12} fontFamily="var(--font-mono)" />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      <div className="desk-chart-caption"><span>Unidades por pedido</span><span>Costo anual total ({currency})</span><span className="desk-chart-key"><i aria-hidden="true" />Recomendada: <strong className={numberClass}>{formatNumber(response.recommended.feasible_quantity, 0)}</strong></span></div>
      <details className="desk-chart-accessible"><summary>Leer valores del gráfico</summary><ul>{rows.map((row) => <li key={row.label}>{row.label} unidades: <span className={numberClass}>{formatMoney(row.total_annual_cost, currency)}</span></li>)}</ul></details>
    </figure> : <div className="desk-table-scroll" role="region" aria-label="Tabla comparativa de alternativas, desplazable" tabIndex={0}>
      <table className="desk-alternatives-table"><caption className="sr-only">Alternativas evaluadas y sus costos anuales en {currency}</caption><thead><tr><th scope="col">Tramo / unidades</th><th scope="col">Cantidad</th><th scope="col">Precio unitario</th><th scope="col">Costo anual total</th><th scope="col"><span className="sr-only">Desglose</span></th></tr></thead><tbody>
        {response.alternatives.map((a) => <Fragment key={a.tier_index}><tr className={a.is_recommended ? 'desk-recommended-row' : undefined}>
          <th scope="row"><span className={numberClass}>{formatNumber(a.min_quantity, 0)} {a.max_quantity === null ? 'o más' : `– ${formatNumber(a.max_quantity, 0)}`}</span>{a.is_recommended && <small>Mejor opción</small>}</th>
          <td className={numberClass}>{formatNumber(a.feasible_quantity, 0)}</td><td className={numberClass}>{formatMoney(a.unit_price, currency)}</td><td className={numberClass}>{formatMoney(a.total_annual_cost, currency)}</td>
          <td><button type="button" className="desk-detail-toggle" aria-label={`Ver desglose del tramo ${a.tier_index + 1}`} aria-expanded={expanded === a.tier_index} aria-controls={`alternative-detail-${a.tier_index}`} onClick={() => setExpanded(expanded === a.tier_index ? null : a.tier_index)}><ChevronDown size={16} aria-hidden="true" /></button></td>
        </tr>{expanded === a.tier_index && <tr id={`alternative-detail-${a.tier_index}`}><td colSpan={5}><div className="desk-expanded-costs"><p>{a.status_label}</p><dl>{([['Compra anual', a.annual_purchase_cost], ['Pedidos anuales', a.annual_ordering_cost], ['Mantenimiento anual', a.annual_holding_cost], ['Inversión por pedido', a.order_investment]] as const).map(([label, value]) => <div key={label}><dt>{label}</dt><dd className={numberClass}>{formatMoney(value, currency)}</dd></div>)}</dl></div></td></tr>}</Fragment>)}
        {response.excluded_candidates?.map((entry) => <tr key={`excluded-${entry.tier_index}`}>
          <th scope="row"><span className={numberClass}>{formatNumber(entry.min_quantity, 0)} {entry.max_quantity === null ? 'o más' : `– ${formatNumber(entry.max_quantity, 0)}`}</span><small>Descartado por el motor</small></th>
          <td>—</td><td className={numberClass}>{formatMoney(entry.unit_price, currency)}</td><td colSpan={2} className="text-xs">{entry.reason}</td>
        </tr>)}
      </tbody></table>
    </div>}
  </section>;
}
