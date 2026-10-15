import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { clsx } from 'clsx';
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

export function CostBreakdownTooltip({ active, payload, currency }: {
  active?: boolean;
  payload?: ReadonlyArray<{ payload?: CostChartRow }>;
  currency: string;
}) {
  const row = payload?.[0]?.payload;
  if (!active || !row) return null;
  return (
    <div className="max-w-[min(300px,80vw)] rounded-xl border border-slate-200 bg-white p-3.5 text-xs shadow-md">
      <p className="mb-2 font-semibold text-slate-900">{row.label}</p>
      <dl className="space-y-1.5">
        {([
          ['Compra', row.annual_purchase_cost], ['Pedidos', row.annual_ordering_cost],
          ['Mantenimiento', row.annual_holding_cost], ['Total', row.total_annual_cost],
        ] as const).map(([label, value]) => (
          <div key={label} className={clsx('flex justify-between gap-4', label === 'Total' && 'border-t border-slate-200 pt-2 font-semibold')}>
            <dt>{label}</dt><dd className={numberClass}>{formatMoney(value, currency)}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

export function AlternativesComparisonSection({ response, currency }: { response: AnalysisResponse; currency: string }) {
  const rows: CostChartRow[] = response.alternatives.map((alternative) => ({
    label: `Tramo ${alternative.tier_index + 1} (${formatNumber(alternative.feasible_quantity, 0)} u.)`,
    annual_purchase_cost: alternative.annual_purchase_cost,
    annual_ordering_cost: alternative.annual_ordering_cost,
    annual_holding_cost: alternative.annual_holding_cost,
    total_annual_cost: alternative.total_annual_cost,
    color: alternative.is_recommended ? '#059669' : '#64748b',
  }));
  if (response.current_comparison) {
    rows.push({ ...response.current_comparison, label: 'Tu compra actual', color: '#4f46e5' });
  }
  return (
    <section className="min-w-0 bg-white rounded-xl border border-slate-200 p-5 shadow-xs space-y-5" aria-labelledby="alternatives-heading">
      <div>
        <h2 id="alternatives-heading" className="text-base font-semibold">Compara todas las alternativas</h2>
        <p className="mt-2 text-xs leading-5 text-slate-500">Costos sobre la misma base anual. Desplaza la tabla para revisar el desglose de cada tramo.</p>
      </div>
      <div className="overflow-x-auto rounded-lg border border-slate-200 focus-visible:outline-2 focus-visible:outline-indigo-600" tabIndex={0} role="region" aria-label="Tabla comparativa de alternativas, desplazable">
        <table className="w-full min-w-[1400px] border-collapse text-left text-xs">
          <caption className="sr-only">Alternativas evaluadas y sus costos anuales en {currency}</caption>
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              <th scope="col" className="sticky left-0 z-10 bg-white p-3">Rango de unidades</th>
              {['Precio Unitario', 'CEP Teórica', 'Cantidad Evaluada', 'Estado', 'Costo Compra Anual', 'Costo Pedidos Anual', 'Costo Mantenimiento Anual', 'Costo Total Anual'].map((label) => <th key={label} scope="col" className="p-3 font-medium">{label}</th>)}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {response.alternatives.map((alternative) => (
              <tr key={alternative.tier_index} className={clsx(alternative.is_recommended && 'bg-emerald-50/70 font-semibold')}>
                <th scope="row" className="sticky left-0 z-10 bg-white p-3 text-left">
                  <span className={`${numberClass} block whitespace-nowrap`}>{formatNumber(alternative.min_quantity, 0)} {alternative.max_quantity === null ? 'o más (∞)' : `a ${formatNumber(alternative.max_quantity, 0)} u.`}</span>
                  {alternative.is_recommended && <span className="mt-2 inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-800">Mejor opción</span>}
                </th>
                <td className={`${numberClass} whitespace-nowrap p-3`}>{formatMoney(alternative.unit_price, currency)}</td>
                <td className={`${numberClass} p-3`}>{formatNumber(alternative.eoq_raw)}</td>
                <td className={`${numberClass} p-3`}>{formatNumber(alternative.feasible_quantity, 0)}</td>
                <td className="p-3">{alternative.status_label}</td>
                <td className={`${numberClass} whitespace-nowrap p-3`}>{formatMoney(alternative.annual_purchase_cost, currency)}</td>
                <td className={`${numberClass} whitespace-nowrap p-3`}>{formatMoney(alternative.annual_ordering_cost, currency)}</td>
                <td className={`${numberClass} whitespace-nowrap p-3`}>{formatMoney(alternative.annual_holding_cost, currency)}</td>
                <td className={`${numberClass} whitespace-nowrap p-3`}>{formatMoney(alternative.total_annual_cost, currency)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <figure aria-label="Gráfico de barras de costo total anual por alternativa">
        <figcaption className="mb-3 text-sm font-medium">Costo total anual por alternativa ({currency})</figcaption>
        <ResponsiveContainer width="100%" height={300} minWidth={0} initialDimension={{ width: 640, height: 300 }}>
          <BarChart data={rows} layout="vertical" margin={{ top: 5, right: 12, bottom: 5, left: 0 }} accessibilityLayer>
            <CartesianGrid stroke="#e2e8f0" horizontal={false} />
            <XAxis type="number" tickFormatter={(value: number) => formatNumber(value, 0)} tick={{ fontSize: 10, fontFamily: 'var(--font-mono)' }} />
            <YAxis type="category" dataKey="label" width={132} tick={{ fontSize: 11, fontFamily: 'var(--font-mono)' }} tickLine={false} axisLine={false} />
            <Tooltip content={<CostBreakdownTooltip currency={currency} />} cursor={{ fill: '#f1f5f9' }} isAnimationActive={false} />
            <Bar dataKey="total_annual_cost" name="Costo total anual" radius={[0, 4, 4, 0]} maxBarSize={36} isAnimationActive={false}>
              {rows.map((row) => <Cell key={row.label} fill={row.color} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
        <div className="mt-3 flex flex-wrap gap-4 text-xs text-slate-600" aria-label="Leyenda del gráfico">
          {[
            ['bg-emerald-600', 'Recomendación'], ['bg-slate-500', 'Otras alternativas'],
            ...(response.current_comparison ? [['bg-indigo-600', 'Compra actual']] : []),
          ].map(([color, label]) => <span key={label} className="inline-flex items-center gap-1.5"><span aria-hidden="true" className={`h-2.5 w-2.5 rounded-sm ${color}`} />{label}</span>)}
        </div>
      </figure>
    </section>
  );
}
