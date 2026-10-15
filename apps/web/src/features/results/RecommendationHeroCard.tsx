import { BadgeCheck } from 'lucide-react';
import type { CandidateEvaluation } from '../../services/generated/types';
import { formatMoney, formatNumber, numberClass } from './format';

interface RecommendationHeroCardProps {
  recommended: CandidateEvaluation;
  currency: string;
  productName: string;
  mode: 'mock' | 'real';
}

export function RecommendationHeroCard({ recommended, currency, productName, mode }: RecommendationHeroCardProps) {
  return (
    <section aria-labelledby="recommendation-heading" className="bg-gradient-to-br from-emerald-950 via-slate-900 to-slate-900 text-white rounded-2xl p-6 shadow-md border border-emerald-500/30">
      <div className="flex flex-wrap items-center gap-2">
        <span className="bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 text-xs font-semibold px-2.5 py-1 rounded-full inline-flex items-center gap-1.5">
          <BadgeCheck size={14} aria-hidden="true" />RECOMENDACIÓN ÓPTIMA VERIFICADA
        </span>
        {mode === 'mock' && <span className="text-xs text-amber-200">Datos simulados de referencia</span>}
      </div>
      <h2 id="recommendation-heading" className="mt-5 text-sm text-slate-300">Compra recomendada para {productName}</h2>
      <div className="mt-2 flex flex-wrap items-end justify-between gap-5">
        <div>
          <p className={`${numberClass} text-4xl font-semibold sm:text-5xl`}>{formatNumber(recommended.feasible_quantity, 0)}</p>
          <p className="mt-1 text-sm text-slate-300">unidades por pedido</p>
        </div>
        <div>
          <p className="text-xs text-slate-300">Precio unitario logrado</p>
          <p className={`${numberClass} mt-1 text-xl font-semibold`}>{formatMoney(recommended.unit_price, currency)}</p>
        </div>
      </div>
      <div className="mt-6 grid grid-cols-1 gap-3 xl:grid-cols-2">
        <div className="min-w-0 rounded-xl border border-white/15 bg-white/5 p-4">
          <h3 className="text-xs leading-5 text-slate-300">Desembolso / Inversión por cada pedido</h3>
          <p className={`${numberClass} mt-2 break-words text-2xl font-bold text-white`}>{formatMoney(recommended.order_investment, currency)}</p>
          <p className={`${numberClass} mt-3 text-xs leading-5 text-slate-300`}>Se realizan {recommended.orders_per_year.toFixed(1)} pedidos al año (cada {recommended.cycle_time_days.toFixed(0)} días)</p>
        </div>
        <div className="min-w-0 rounded-xl border border-emerald-400/25 bg-emerald-400/5 p-4">
          <h3 className="text-xs leading-5 text-emerald-100">Costo Total Anual (Compra + Pedidos + Mantenimiento)</h3>
          <p className={`${numberClass} mt-2 break-words text-2xl font-bold text-emerald-400`}>{formatMoney(recommended.total_annual_cost, currency)}</p>
          <p className={`${numberClass} mt-3 text-xs leading-5 text-slate-300`}>Compra: {formatMoney(recommended.annual_purchase_cost, currency)} | Pedidos: {formatMoney(recommended.annual_ordering_cost, currency)} | Mantenimiento: {formatMoney(recommended.annual_holding_cost, currency)}</p>
        </div>
      </div>
    </section>
  );
}
