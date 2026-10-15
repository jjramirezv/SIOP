import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { FieldErrors, FieldPath } from 'react-hook-form';
import { FormProvider, useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { clsx } from 'clsx';
import { BarChart3, Calculator, Coins, Loader2, Tag } from 'lucide-react';
import type { AnalysisRequest } from '../../services/generated/types';
import { analysisFormSchema } from './schema';
import { DiscountTiersTable } from './DiscountTiersTable';
import { cardClass, FieldError, inputClass, labelClass } from './form-ui';
import { formatMoney, formatNumber } from '../results/format';

export type FormSection = 'ventas' | 'costos' | 'precios';
const sections = [
  { id: 'ventas', label: 'Ventas', icon: BarChart3 },
  { id: 'costos', label: 'Costos', icon: Coins },
  { id: 'precios', label: 'Precios', icon: Tag },
] as const;
const sectionFields: Record<FormSection, readonly string[]> = {
  ventas: ['product_name', 'currency', 'demand', 'demand_period', 'days_per_year', 'current_order_quantity'],
  costos: ['ordering_cost', 'holding_cost_mode', 'holding_cost_value', 'holding_cost_period'],
  precios: ['discount_tiers'],
};

export interface InventoryFormProps {
  defaultValues: AnalysisRequest;
  onSubmit: (data: AnalysisRequest) => void;
  onFormDirtyChange: (isDirty: boolean) => void;
  isLoading: boolean;
  onValuesChange?: (data: AnalysisRequest) => void;
  caseSelector?: ReactNode;
  focusSection?: { section: FormSection; revision: number };
  onQuickRecalculate?: (data: AnalysisRequest) => void;
}

export function InventoryForm({ defaultValues, onSubmit, onFormDirtyChange, isLoading, onValuesChange, caseSelector, focusSection, onQuickRecalculate }: InventoryFormProps) {
  const [section, setSection] = useState<FormSection>('costos');
  const form = useForm<AnalysisRequest>({
    defaultValues: structuredClone(defaultValues),
    resolver: zodResolver(analysisFormSchema),
    mode: 'onChange', reValidateMode: 'onChange',
  });
  const { register, reset, watch, getValues, setValue, setFocus, control, formState: { errors } } = form;
  const notifyDirty = useRef(onFormDirtyChange);
  const notifyValues = useRef(onValuesChange);
  const currency = useWatch({ control, name: 'currency' });
  const holdingMode = useWatch({ control, name: 'holding_cost_mode' });
  const holdingUnit = holdingMode === 'percentage' ? '%' : currency;
  const values = useWatch({ control });
  const periods = { year: 'año', month: 'mes', day: 'día' };

  useEffect(() => {
    if (!focusSection) return;
    setSection(focusSection.section);
    const field: FieldPath<AnalysisRequest> = focusSection.section === 'costos' ? 'holding_cost_value' : focusSection.section === 'ventas' ? 'demand' : 'discount_tiers.0.unit_price';
    const timer = window.setTimeout(() => setFocus(field), 0);
    return () => window.clearTimeout(timer);
  }, [focusSection, setFocus]);

  function handleInvalid(validationErrors: FieldErrors<AnalysisRequest>) {
    const target = sections.find(({ id }) => sectionFields[id].some((name) => name in validationErrors));
    if (!target) return;
    setSection(target.id);
    // El panel debe estar visible antes de enfocar el primer campo inválido.
    const first = sectionFields[target.id].find((name) => name in validationErrors);
    const invalidTier = Array.isArray(validationErrors.discount_tiers) ? validationErrors.discount_tiers.findIndex((row) => row != null) : 0;
    const tierIndex = Math.max(0, invalidTier);
    const path = first === 'discount_tiers' ? `discount_tiers.${tierIndex}.${validationErrors.discount_tiers?.[tierIndex]?.min_quantity ? 'min_quantity' : 'unit_price'}` : first;
    window.setTimeout(() => setFocus(path as FieldPath<AnalysisRequest>), 0);
  }

  function quickChange(field: 'demand' | 'holding_cost_value', value: number) {
    setValue(field, value, { shouldDirty: true, shouldValidate: true });
    if (onQuickRecalculate) void form.handleSubmit(onQuickRecalculate, handleInvalid)();
  }

  useEffect(() => { notifyDirty.current = onFormDirtyChange; }, [onFormDirtyChange]);
  useEffect(() => { notifyValues.current = onValuesChange; }, [onValuesChange]);

  useEffect(() => { reset(structuredClone(defaultValues)); }, [defaultValues, reset]);

  useEffect(() => {
    // Incluye ediciones y cambios de la tabla. El reset de un caso no es una edición.
    const subscription = watch((_values, { name }) => {
      if (name) {
        notifyDirty.current(true);
        notifyValues.current?.(structuredClone(getValues()));
      }
    });
    return () => subscription.unsubscribe();
  }, [watch, getValues]);

  return (
    <FormProvider {...form}>
      <form id="inventory-analysis-form" noValidate onSubmit={form.handleSubmit(onSubmit, handleInvalid)} aria-label="Datos para calcular la compra óptima">
        <fieldset disabled={isLoading} className="desk-form-fields">
          <nav className="desk-form-tabs" aria-label="Grupos de configuración" role="tablist">
            {sections.map(({ id, label, icon: Icon }, index) => <button key={id} type="button" id={`form-tab-${id}`} role="tab"
              aria-selected={section === id} aria-controls={`form-panel-${id}`} tabIndex={section === id ? 0 : -1}
              className={clsx('desk-form-tab', sectionFields[id].some((key) => key in errors) && 'has-error')}
              onClick={() => setSection(id)} onKeyDown={(event) => {
                if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
                event.preventDefault();
                const next = event.key === 'Home' ? 0 : event.key === 'End' ? 2 : (index + (event.key === 'ArrowRight' ? 1 : 2)) % 3;
                setSection(sections[next].id); document.getElementById(`form-tab-${sections[next].id}`)?.focus();
              }}><Icon size={19} aria-hidden="true" /><span>{label}</span>{sectionFields[id].some((key) => key in errors) && <span className="sr-only">Contiene errores</span>}</button>)}
          </nav>
          {caseSelector}
          <section id="form-panel-ventas" role="tabpanel" aria-labelledby="form-tab-ventas" hidden={section !== 'ventas'} className={cardClass}>
            <h2 id="product-heading" className="sr-only">Producto y ventas</h2>
            <div className="space-y-1.5">
              <label htmlFor="product-name" className={labelClass}>¿Qué producto estás comprando?</label>
              <input id="product-name" {...register('product_name')} autoComplete="off"
                aria-invalid={Boolean(errors.product_name)} aria-describedby="product-name-error"
                className={inputClass(Boolean(errors.product_name))} />
              <FieldError id="product-name-error" message={errors.product_name?.message} />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="currency" className={labelClass}>¿En qué moneda están los precios?</label>
              <select id="currency" {...register('currency')}
                aria-invalid={Boolean(errors.currency)} aria-describedby="currency-error"
                className={inputClass(Boolean(errors.currency))}>
                <option value="PEN">PEN (S/)</option><option value="USD">USD ($)</option>
              </select>
              <FieldError id="currency-error" message={errors.currency?.message} />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="demand" className={labelClass}>¿Cuántas unidades vendes o necesitas?</label>
              <div className="grid grid-cols-[minmax(0,1fr)_7rem] gap-2">
                <input id="demand" {...register('demand', { valueAsNumber: true })} type="number" min="0" step="any"
                  aria-invalid={Boolean(errors.demand)} aria-describedby="demand-error"
                  className={inputClass(Boolean(errors.demand), true)} />
                <select {...register('demand_period')} aria-label="Período de ventas"
                  aria-invalid={Boolean(errors.demand_period)} aria-describedby="demand-period-error"
                  className={inputClass(Boolean(errors.demand_period))}>
                  <option value="year">al año</option><option value="month">al mes</option><option value="day">al día</option>
                </select>
              </div>
              <FieldError id="demand-error" message={errors.demand?.message} />
              <FieldError id="demand-period-error" message={errors.demand_period?.message} />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="days-per-year" className={labelClass}>Días trabajados por año</label>
              <input id="days-per-year" {...register('days_per_year', { valueAsNumber: true })} type="number" min="1" step="1"
                aria-invalid={Boolean(errors.days_per_year)} aria-describedby="days-per-year-hint days-per-year-error"
                className={inputClass(Boolean(errors.days_per_year), true)} />
              <p id="days-per-year-hint" className="text-xs text-slate-500">Usa los días de tu ejercicio; por ejemplo, <span className="font-mono tabular-nums tracking-tight">365</span> o <span className="font-mono tabular-nums tracking-tight">360</span>.</p>
              <FieldError id="days-per-year-error" message={errors.days_per_year?.message} />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="current-order-quantity" className={labelClass}>¿Cuántas unidades sueles pedir actualmente? <span className="desk-optional">(Opcional)</span></label>
              <input id="current-order-quantity" {...register('current_order_quantity', { setValueAs: (value: string | null | undefined) => value == null || value === '' ? null : Number(value) })}
                type="number" min="1" step="1" placeholder="Sin comparación" aria-invalid={Boolean(errors.current_order_quantity)} aria-describedby="current-quantity-error" className={inputClass(Boolean(errors.current_order_quantity), true)} />
              <FieldError id="current-quantity-error" message={errors.current_order_quantity?.message} />
            </div>
            {onQuickRecalculate && <div className="desk-quick-controls" role="group" aria-label="Ajustar demanda">
              <span>Probar ventas</span><button type="button" aria-label="Reducir demanda un 10%" onClick={() => quickChange('demand', +(getValues('demand') * .9).toFixed(8))}>−10%</button><button type="button" aria-label="Aumentar demanda un 10%" onClick={() => quickChange('demand', +(getValues('demand') * 1.1).toFixed(8))}>+10%</button>
            </div>}
          </section>

          <section id="form-panel-costos" role="tabpanel" aria-labelledby="form-tab-costos" hidden={section !== 'costos'} className={cardClass}>
            <h2 id="costs-heading" className="sr-only">Pedido y almacenamiento</h2>
            <div className="space-y-1.5">
              <label htmlFor="ordering-cost" className={labelClass}>Costo por pedido <span className="desk-help" data-tooltip="Transporte, trámites y envío de cada pedido."><span aria-hidden="true">ⓘ</span><span className="sr-only">: transporte, trámites y envío</span></span></label>
              <div className="relative">
                <span aria-hidden="true" className="pointer-events-none absolute left-3.5 top-2.5 text-xs font-mono tabular-nums tracking-tight text-slate-500">{currency}</span>
                <input id="ordering-cost" {...register('ordering_cost', { valueAsNumber: true })} type="number" min="0" step="0.01"
                  aria-invalid={Boolean(errors.ordering_cost)} aria-describedby="ordering-cost-error"
                  className={`${inputClass(Boolean(errors.ordering_cost), true)} pl-14`} />
              </div>
              <FieldError id="ordering-cost-error" message={errors.ordering_cost?.message} />
            </div>
            <fieldset className="space-y-2">
              <legend className={labelClass}>Tipo de mantenimiento</legend>
              <div className="desk-segmented" role="group" aria-label="Tipo de costo de almacenamiento">
                {([
                  ['percentage', 'Porcentaje del precio (%)'],
                  ['fixed', 'Monto fijo por unidad ($ / S/)'],
                ] as const).map(([value, label]) => (
                  <button key={value} type="button" aria-pressed={holdingMode === value}
                    onClick={() => setValue('holding_cost_mode', value, { shouldDirty: true, shouldValidate: true })}
                    aria-label={label} className="desk-segment">{value === 'fixed' ? 'Fijo' : 'Porcentaje'}</button>
                ))}
              </div>
              <FieldError id="holding-mode-error" message={errors.holding_cost_mode?.message} />
            </fieldset>
            <div className="space-y-1.5">
              <label htmlFor="holding-cost-value" className={labelClass}>Mantenimiento por unidad <span className="desk-optional">({holdingMode === 'percentage' ? '% del precio' : currency})</span></label>
              <div className="grid grid-cols-[minmax(0,1fr)_7rem] gap-2">
                <div className="relative">
                  <input id="holding-cost-value" {...register('holding_cost_value', { valueAsNumber: true })} type="number" min="0" step="any"
                    aria-invalid={Boolean(errors.holding_cost_value)} aria-describedby="holding-unit holding-value-error"
                    className={`${inputClass(Boolean(errors.holding_cost_value), true)} pr-14`} />
                  <span id="holding-unit" className="pointer-events-none absolute right-3.5 top-2.5 text-xs font-mono tabular-nums tracking-tight text-slate-500">{holdingUnit}</span>
                </div>
                <select {...register('holding_cost_period')} aria-label="Período del costo de almacenamiento"
                  aria-invalid={Boolean(errors.holding_cost_period)} aria-describedby="holding-period-error"
                  className={inputClass(Boolean(errors.holding_cost_period))}>
                  <option value="year">al año</option><option value="month">al mes</option><option value="day">al día</option>
                </select>
              </div>
              <FieldError id="holding-value-error" message={errors.holding_cost_value?.message} />
              <FieldError id="holding-period-error" message={errors.holding_cost_period?.message} />
            </div>
            {onQuickRecalculate && <details className="desk-quick-details"><summary>Probar otro mantenimiento</summary><div className="desk-quick-controls">
              <button type="button" aria-label="Reducir mantenimiento un 10%" onClick={() => quickChange('holding_cost_value', +(getValues('holding_cost_value') * .9).toFixed(8))}>−10%</button>
              <button type="button" aria-label="Aumentar mantenimiento un 10%" onClick={() => quickChange('holding_cost_value', +(getValues('holding_cost_value') * 1.1).toFixed(8))}>+10%</button>
              <button type="button" onClick={() => quickChange('holding_cost_value', 5)}>Probar Mantenimiento = 5</button>
              <button type="button" onClick={() => quickChange('holding_cost_value', 10)}>Probar Mantenimiento = 10</button>
            </div></details>}
          </section>

          <section id="form-panel-precios" role="tabpanel" aria-labelledby="form-tab-precios" hidden={section !== 'precios'} className={cardClass}>
            <h2 id="tiers-heading" className="sr-only">Precios por volumen</h2>
            <DiscountTiersTable />
          </section>
          <div className="desk-context"><p>Contexto del caso</p><p className="desk-context-value"><span className="font-mono tabular-nums">{Number.isFinite(values.demand) ? formatNumber(values.demand!) : '—'}</span> unidades/{periods[values.demand_period ?? 'year']} <span aria-hidden="true">·</span> {values.discount_tiers?.length ?? 0} tramos</p></div>
          {section !== 'precios' && <div className="desk-price-preview"><p>Precios del proveedor <span>(por unidad)</span></p>
            {(values.discount_tiers ?? []).map((tier, index, tiers) => <div key={index}><span className="font-mono tabular-nums">{tier.min_quantity} {index === tiers.length - 1 ? 'o más' : `– ${(tiers[index + 1]?.min_quantity ?? 1) - 1}`} unidades</span><strong className="font-mono tabular-nums">{Number.isFinite(tier.unit_price) ? formatMoney(tier.unit_price!, currency) : '—'}</strong></div>)}
          </div>}
          <button type="submit" disabled={isLoading}
            className="desk-primary desk-calculate">
            {isLoading ? <Loader2 size={17} aria-hidden="true" className="animate-spin motion-reduce:animate-none" /> : <Calculator size={17} aria-hidden="true" />}
            {isLoading ? 'Calculando mejor compra…' : 'Calcular mejor compra'}
          </button>
        </fieldset>
      </form>
    </FormProvider>
  );
}
