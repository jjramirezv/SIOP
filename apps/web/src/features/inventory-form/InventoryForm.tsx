import { useEffect, useRef } from 'react';
import { FormProvider, useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { clsx } from 'clsx';
import { Loader2 } from 'lucide-react';
import type { AnalysisRequest } from '../../services/generated/types';
import { analysisFormSchema } from './schema';
import { DiscountTiersTable } from './DiscountTiersTable';
import { cardClass, FieldError, inputClass, labelClass } from './form-ui';

export interface InventoryFormProps {
  defaultValues: AnalysisRequest;
  onSubmit: (data: AnalysisRequest) => void;
  onFormDirtyChange: (isDirty: boolean) => void;
  isLoading: boolean;
  onValuesChange?: (data: AnalysisRequest) => void;
}

export function InventoryForm({ defaultValues, onSubmit, onFormDirtyChange, isLoading, onValuesChange }: InventoryFormProps) {
  const form = useForm<AnalysisRequest>({
    defaultValues: structuredClone(defaultValues),
    resolver: zodResolver(analysisFormSchema),
    mode: 'onChange', reValidateMode: 'onChange',
  });
  const { register, reset, watch, getValues, setValue, control, formState: { errors } } = form;
  const notifyDirty = useRef(onFormDirtyChange);
  const notifyValues = useRef(onValuesChange);
  const currency = useWatch({ control, name: 'currency' });
  const holdingMode = useWatch({ control, name: 'holding_cost_mode' });
  const holdingUnit = holdingMode === 'percentage' ? '%' : currency;

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
      <form id="inventory-analysis-form" noValidate onSubmit={form.handleSubmit(onSubmit)} aria-label="Datos para calcular la compra óptima">
        <fieldset disabled={isLoading} className="min-w-0 space-y-5">
          <section className={cardClass} aria-labelledby="product-heading">
            <h2 id="product-heading" className="text-base font-semibold">Producto y ventas</h2>
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
          </section>

          <section className={cardClass} aria-labelledby="costs-heading">
            <h2 id="costs-heading" className="text-base font-semibold">Pedido y almacenamiento</h2>
            <div className="space-y-1.5">
              <label htmlFor="ordering-cost" className={labelClass}>¿Cuánto te cuesta realizar cada pedido? (transporte, trámites, envío)</label>
              <div className="relative">
                <span aria-hidden="true" className="pointer-events-none absolute left-3.5 top-2.5 text-xs font-mono tabular-nums tracking-tight text-slate-500">{currency}</span>
                <input id="ordering-cost" {...register('ordering_cost', { valueAsNumber: true })} type="number" min="0" step="0.01"
                  aria-invalid={Boolean(errors.ordering_cost)} aria-describedby="ordering-cost-error"
                  className={`${inputClass(Boolean(errors.ordering_cost), true)} pl-14`} />
              </div>
              <FieldError id="ordering-cost-error" message={errors.ordering_cost?.message} />
            </div>
            <fieldset className="space-y-2">
              <legend className={labelClass}>¿Cómo calculas el almacenamiento?</legend>
              <div className="grid grid-cols-1 gap-1 rounded-lg border border-slate-200 bg-slate-50 p-1 sm:grid-cols-2" role="group" aria-label="Tipo de costo de almacenamiento">
                {([
                  ['percentage', 'Porcentaje del precio (%)'],
                  ['fixed', 'Monto fijo por unidad ($ / S/)'],
                ] as const).map(([value, label]) => (
                  <button key={value} type="button" aria-pressed={holdingMode === value}
                    onClick={() => setValue('holding_cost_mode', value, { shouldDirty: true, shouldValidate: true })}
                    className={clsx(
                      'rounded-md px-2.5 py-2.5 text-xs transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-indigo-600',
                      holdingMode === value ? 'bg-white text-indigo-900 font-semibold shadow-2xs ring-1 ring-slate-200' : 'text-slate-600 hover:bg-white/70',
                    )}>{label}</button>
                ))}
              </div>
              <FieldError id="holding-mode-error" message={errors.holding_cost_mode?.message} />
            </fieldset>
            <div className="space-y-1.5">
              <label htmlFor="holding-cost-value" className={labelClass}>¿Cuánto cuesta guardar 1 unidad en inventario?</label>
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
          </section>

          <section className={cardClass} aria-labelledby="tiers-heading">
            <h2 id="tiers-heading" className="text-base font-semibold">Precios por volumen y compra actual</h2>
            <DiscountTiersTable />
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-3.5 space-y-2">
              <label htmlFor="current-order-quantity" className={labelClass}>¿Cuántas unidades sueles pedir actualmente? <span className="font-normal text-slate-500">(Opcional, para comparar cuánto ahorrarías)</span></label>
              <input id="current-order-quantity"
                {...register('current_order_quantity', { setValueAs: (value: string | null | undefined) => value == null || value === '' ? null : Number(value) })}
                type="number" min="1" step="1" placeholder="Sin comparación"
                aria-invalid={Boolean(errors.current_order_quantity)} aria-describedby="current-quantity-error"
                className={inputClass(Boolean(errors.current_order_quantity), true)} />
              <FieldError id="current-quantity-error" message={errors.current_order_quantity?.message} />
            </div>
          </section>
          <button type="submit" disabled={isLoading}
            className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-xs hover:bg-indigo-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 disabled:opacity-50 transition-colors cursor-pointer">
            {isLoading && <Loader2 size={18} aria-hidden="true" className="animate-spin motion-reduce:animate-none" />}
            {isLoading ? 'Calculando compra óptima…' : 'Calcular compra óptima'}
          </button>
        </fieldset>
      </form>
    </FormProvider>
  );
}
