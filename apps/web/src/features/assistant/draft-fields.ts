export const draftFieldLabels: Record<string, string> = {
  product_name: 'Producto', currency: 'Moneda', demand: 'Demanda', demand_period: 'Período de demanda',
  days_per_year: 'Días trabajados por año', ordering_cost: 'Costo de pedido',
  holding_cost_mode: 'Modo de mantenimiento', holding_cost_value: 'Costo de mantenimiento',
  holding_cost_period: 'Período de mantenimiento', discount_tiers: 'Precios por volumen',
  current_order_quantity: 'Cantidad de compra actual', min_quantity: 'Cantidad mínima', unit_price: 'Precio por unidad',
};

export function draftFieldLabel(path: string): string {
  return path.replace(/\[(\d+)\]/g, '.$1').split('.').map((part) =>
    draftFieldLabels[part] ?? (/^\d+$/.test(part) ? `tramo ${Number(part) + 1}` : 'Dato por confirmar'),
  ).join(' · ');
}
