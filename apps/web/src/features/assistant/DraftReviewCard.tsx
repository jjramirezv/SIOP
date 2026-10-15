import { useEffect, useId, useState } from 'react';
import type { ReactNode } from 'react';
import { AlertTriangle, Check, Plus, Trash2 } from 'lucide-react';
import { twMerge } from 'tailwind-merge';
import type { AnalysisRequest, TimePeriod } from '../../services/generated/types';
import { analysisFormSchema } from '../inventory-form/schema';
import { FieldError, inputClass } from '../inventory-form/form-ui';
import { draftFieldLabel } from './draft-fields';

interface DraftReviewCardProps {
  proposedData: Partial<AnalysisRequest>;
  missingFields: string[];
  fieldsToReview: string[];
  onApplyDraft: (editedDraft: Partial<AnalysisRequest>) => void;
  onDiscard: () => void;
  isApplying?: boolean;
}

const partialSchema = analysisFormSchema.partial();
const numberValue = (value: number | null | undefined) => Number.isFinite(value) ? value! : '';

export function DraftReviewCard({ proposedData, missingFields, fieldsToReview, onApplyDraft, onDiscard, isApplying = false }: DraftReviewCardProps) {
  const [localDraft, setLocalDraft] = useState<Partial<AnalysisRequest>>(() => structuredClone(proposedData));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const prefix = useId();
  useEffect(() => { setLocalDraft(structuredClone(proposedData)); setErrors({}); }, [proposedData]);

  function update<K extends keyof AnalysisRequest>(key: K, value: AnalysisRequest[K]) {
    setLocalDraft((previous) => ({ ...previous, [key]: value }));
  }
  const visible = (key: keyof AnalysisRequest) => key in localDraft || missingFields.some((path) => path === key || path.startsWith(`${key}.`) || path.startsWith(`${key}[`));
  const review = (key: string) => fieldsToReview.some((path) => {
    const normalized = path.replace(/\[(\d+)\]/g, '.$1');
    return key === normalized || key.startsWith(`${normalized}.`) || normalized.startsWith(`${key}.`);
  });
  const fieldClass = (key: string) => twMerge(inputClass(Boolean(errors[key]), true), review(key) && 'border-amber-400');

  function field(key: string, label: string, control: ReactNode) {
    return <div className="space-y-1.5" key={key}>
      <label htmlFor={`${prefix}-${key}`} className="flex flex-wrap items-center gap-2 text-xs font-medium text-slate-800">
        {label}{review(key) && <span className="rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-900">Revisar</span>}
      </label>
      {control}<FieldError id={`${prefix}-${key}-error`} message={errors[key]} />
    </div>;
  }

  function numeric(key: 'demand' | 'days_per_year' | 'ordering_cost' | 'holding_cost_value' | 'current_order_quantity', label: string) {
    return field(key, label, <input id={`${prefix}-${key}`} type="number" min="0" step={key === 'days_per_year' || key === 'current_order_quantity' ? '1' : 'any'}
      value={numberValue(localDraft[key])} onChange={(event) => update(key, event.target.value === '' ? (key === 'current_order_quantity' ? null : NaN) : Number(event.target.value))}
      aria-invalid={Boolean(errors[key])} aria-describedby={`${prefix}-${key}-error`} className={fieldClass(key)} />);
  }

  function period(key: 'demand_period' | 'holding_cost_period') {
    return field(key, draftFieldLabel(key), <select id={`${prefix}-${key}`} value={localDraft[key] ?? ''}
      onChange={(event) => update(key, event.target.value as TimePeriod)} className={fieldClass(key)}
      aria-invalid={Boolean(errors[key])} aria-describedby={`${prefix}-${key}-error`}>
      <option value="" disabled>Elige un período</option><option value="year">al año</option><option value="month">al mes</option><option value="day">al día</option>
    </select>);
  }

  function apply() {
    const parsed = partialSchema.safeParse(localDraft);
    const nextErrors: Record<string, string> = {};
    if (!parsed.success) {
      for (const issue of parsed.error.issues) nextErrors[issue.path.join('.')] = issue.message;
    }
    for (const path of missingFields) {
      const value: unknown = path.replace(/\[(\d+)\]/g, '.$1').split('.').reduce<unknown>((current, key) =>
        current !== null && typeof current === 'object' ? (current as Record<string, unknown>)[key] : undefined, localDraft);
      if (value == null || value === '' || (typeof value === 'number' && !Number.isFinite(value))) {
        nextErrors[path] = `Confirma este dato antes de aplicar: ${draftFieldLabel(path)}`;
      }
    }
    setErrors(nextErrors);
    if (parsed.success && Object.keys(nextErrors).length === 0) onApplyDraft(structuredClone(parsed.data));
  }

  return (
    <section aria-label="Borrador revisable del asistente" className="bg-indigo-50/70 border-2 border-indigo-300 rounded-xl p-4 space-y-3 shadow-xs">
      <p className="rounded-lg bg-indigo-100 px-2.5 py-2 text-xs font-semibold leading-5 text-indigo-950">BORRADOR INTERPRETADO POR IA — REVISA ANTES DE APLICAR</p>
      {missingFields.length > 0 && <div role="status" className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs leading-5 text-amber-950">
        <p className="flex items-center gap-1.5 font-semibold"><AlertTriangle size={15} aria-hidden="true" />Faltan datos por confirmar</p>
        <p className="mt-1">{missingFields.map(draftFieldLabel).join(', ')}. Complétalos en este borrador antes de aplicarlo.</p>
      </div>}
      <fieldset disabled={isApplying} className="min-w-0 space-y-3">
        {visible('product_name') && field('product_name', 'Producto', <input id={`${prefix}-product_name`} value={localDraft.product_name ?? ''} onChange={(event) => update('product_name', event.target.value)} className={fieldClass('product_name')} aria-invalid={Boolean(errors.product_name)} aria-describedby={`${prefix}-product_name-error`} />)}
        {visible('currency') && field('currency', 'Moneda', <select id={`${prefix}-currency`} value={localDraft.currency ?? ''} onChange={(event) => update('currency', event.target.value)} className={fieldClass('currency')}>
          <option value="" disabled>Elige una moneda</option><option value="PEN">PEN (S/)</option><option value="USD">USD ($)</option>
        </select>)}
        <div className="grid grid-cols-2 gap-2">
          {visible('demand') && numeric('demand', 'Demanda (unidades)')}
          {visible('demand_period') && period('demand_period')}
        </div>
        {visible('days_per_year') && numeric('days_per_year', 'Días trabajados por año')}
        {visible('ordering_cost') && numeric('ordering_cost', `Costo de pedido (${localDraft.currency ?? 'moneda del formulario'})`)}
        {visible('holding_cost_mode') && field('holding_cost_mode', 'Modo de mantenimiento', <select id={`${prefix}-holding_cost_mode`} value={localDraft.holding_cost_mode ?? ''} onChange={(event) => update('holding_cost_mode', event.target.value as AnalysisRequest['holding_cost_mode'])} className={fieldClass('holding_cost_mode')}>
          <option value="" disabled>Elige un modo</option><option value="percentage">Porcentaje del precio (%)</option><option value="fixed">Monto fijo por unidad</option>
        </select>)}
        <div className="grid grid-cols-2 gap-2">
          {visible('holding_cost_value') && numeric('holding_cost_value', `Costo de mantenimiento (${localDraft.holding_cost_mode === 'percentage' ? '%' : localDraft.currency ?? 'moneda'})`)}
          {visible('holding_cost_period') && period('holding_cost_period')}
        </div>
        {visible('discount_tiers') && <div className="space-y-2">
          <p className="flex items-center gap-2 text-xs font-medium">Precios por volumen {review('discount_tiers') && <span className="rounded bg-amber-100 px-1.5 py-0.5 text-amber-900">Revisar</span>}</p>
          {(localDraft.discount_tiers ?? []).map((tier, index) => <div key={index} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] items-start gap-2">
            {(['min_quantity', 'unit_price'] as const).map((key) => {
              const path = `discount_tiers.${index}.${key}`;
              return field(path, `${key === 'min_quantity' ? 'Desde' : 'Precio'} · tramo ${index + 1}`, <input id={`${prefix}-${path}`} type="number" min="0" step={key === 'min_quantity' ? '1' : '0.01'}
                value={numberValue(tier[key])} onChange={(event) => update('discount_tiers', localDraft.discount_tiers!.map((entry, tierIndex) => tierIndex === index ? { ...entry, [key]: event.target.value === '' ? NaN : Number(event.target.value) } : entry))}
                className={fieldClass(path)} aria-invalid={Boolean(errors[path])} aria-describedby={`${prefix}-${path}-error`} />);
            })}
            <button type="button" className="mt-6 rounded p-1 text-slate-500 hover:bg-rose-50 hover:text-rose-700 disabled:opacity-30" aria-label={`Eliminar tramo propuesto ${index + 1}`} disabled={(localDraft.discount_tiers?.length ?? 0) <= 1} onClick={() => update('discount_tiers', localDraft.discount_tiers!.filter((_entry, tierIndex) => tierIndex !== index))}><Trash2 size={16} aria-hidden="true" /></button>
          </div>)}
          <FieldError id={`${prefix}-discount-tiers-error`} message={errors.discount_tiers} />
          <button type="button" className="inline-flex items-center gap-1 text-xs font-medium text-indigo-800" disabled={(localDraft.discount_tiers?.length ?? 0) >= 20} onClick={() => update('discount_tiers', [...(localDraft.discount_tiers ?? []), { min_quantity: localDraft.discount_tiers?.length ? localDraft.discount_tiers[localDraft.discount_tiers.length - 1].min_quantity + 500 : 0, unit_price: localDraft.discount_tiers?.at(-1)?.unit_price ?? NaN }])}><Plus size={14} aria-hidden="true" />Agregar tramo al borrador</button>
        </div>}
        {visible('current_order_quantity') && numeric('current_order_quantity', 'Cantidad de compra actual (opcional)')}
        {Object.entries(errors).filter(([path]) => !Object.keys(localDraft).includes(path.split('.')[0]) && !missingFields.includes(path)).map(([path, message]) => <FieldError key={path} id={`${prefix}-${path}-extra-error`} message={message} />)}
        <div className="flex flex-col gap-2 border-t border-indigo-200 pt-3">
          <button type="button" onClick={apply} className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500 transition-colors cursor-pointer disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700"><Check size={16} aria-hidden="true" />Aplicar datos al formulario y calcular</button>
          <button type="button" onClick={onDiscard} className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer">Descartar propuesta</button>
        </div>
      </fieldset>
    </section>
  );
}
