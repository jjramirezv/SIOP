export const numberClass = 'font-mono tabular-nums tracking-tight';

export const formatNumber = (value: number, decimals = 2): string =>
  new Intl.NumberFormat('es-PE', { maximumFractionDigits: decimals }).format(value);

export const formatMoney = (value: number, currency: string): string =>
  new Intl.NumberFormat('es-PE', { style: 'currency', currency }).format(value);
