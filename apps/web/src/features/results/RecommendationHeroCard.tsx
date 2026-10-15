import { Check, Info } from 'lucide-react';
import type { CandidateEvaluation, CurrentQuantityComparison } from '../../services/generated/types';
import { formatMoney, formatNumber, numberClass } from './format';

interface RecommendationHeroCardProps {
  recommended: CandidateEvaluation;
  currency: string;
  productName: string;
  comparison?: CurrentQuantityComparison | null;
}

export function RecommendationHeroCard({ recommended, currency, productName, comparison }: RecommendationHeroCardProps) {
  return (
    <section aria-labelledby="recommendation-heading" className="desk-recommendation">
      <div className="desk-recommendation-top"><h2 id="recommendation-heading" className="desk-recommendation-badge"><span><Check size={14} aria-hidden="true" /></span>Compra recomendada</h2>
        <span className="desk-result-source">Calculado por el motor real</span>
      </div>
      <div className="desk-hero-grid">
        <div className="desk-hero-quantity"><p className={numberClass}>{formatNumber(recommended.feasible_quantity, 0)}</p><p>unidades por pedido</p></div>
        <div className="desk-hero-amount"><h3>Inversión por pedido <Info size={13} aria-hidden="true" /></h3><p className={numberClass}>{formatMoney(recommended.order_investment, currency)}</p></div>
        <div className="desk-hero-amount"><h3>Costo anual total <Info size={13} aria-hidden="true" /></h3><p className={numberClass}>{formatMoney(recommended.total_annual_cost, currency)}</p></div>
      </div>
      <div className="desk-hero-bottom">
        {comparison ? <p className="desk-savings">Ahorras <strong className={numberClass}>{formatMoney(comparison.annual_savings, currency)} al año</strong><span> frente a tu compra actual de <span className={numberClass}>{formatNumber(comparison.current_quantity, 0)}</span> unidades</span></p>
          : <p className="desk-savings">Precio por unidad: <strong className={numberClass}>{formatMoney(recommended.unit_price, currency)}</strong></p>}
        <span className="desk-product-name">{productName}</span>
      </div>
    </section>
  );
}
