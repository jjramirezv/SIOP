import { useEffect } from 'react';
import { useFieldArray, useFormContext, useWatch } from 'react-hook-form';
import { Plus, Trash2 } from 'lucide-react';
import type { AnalysisRequest } from '../../services/generated/types';
import { FieldError, inputClass } from './form-ui';

export function DiscountTiersTable() {
  const { control, register, setValue, trigger, formState: { errors } } = useFormContext<AnalysisRequest>();
  const { fields, append, remove } = useFieldArray({ control, name: 'discount_tiers' });
  const tiers = useWatch({ control, name: 'discount_tiers' });
  const currency = useWatch({ control, name: 'currency' });
  const tableError = errors.discount_tiers?.root?.message ?? errors.discount_tiers?.message;

  useEffect(() => {
    // Cambiar un precio o mínimo también puede invalidar el tramo siguiente.
    void trigger('discount_tiers');
  }, [tiers, trigger]);

  function addTier() {
    const last = tiers?.[tiers.length - 1];
    const lastQuantity = Number.isFinite(last?.min_quantity) ? last.min_quantity : 0;
    const lastPrice = Number.isFinite(last?.unit_price) ? last.unit_price : 0;
    append({ min_quantity: lastQuantity + 500, unit_price: +(lastPrice * 0.95).toFixed(2) });
  }

  function removeTier(index: number) {
    remove(index);
    if (index === 0) {
      setValue('discount_tiers.0.min_quantity', 0, { shouldDirty: true, shouldValidate: true });
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-xs leading-5 text-slate-500">Cada precio se aplica a todas las unidades del pedido. Puedes desplazar la tabla para ver todas sus columnas.</p>
      <div className="overflow-x-auto rounded-lg border border-slate-200 focus-visible:outline-2 focus-visible:outline-indigo-600" role="region" aria-label="Precios por volumen, tabla desplazable" tabIndex={0}>
        <table className="w-full min-w-[590px] border-collapse text-left text-sm">
          <caption className="sr-only">Niveles de descuento por cantidad, con límites de rango automáticos</caption>
          <thead className="bg-slate-50 text-xs font-medium text-slate-600">
            <tr>
              <th scope="col" className="px-3 py-3">Tramo</th>
              <th scope="col" className="px-2 py-3">Desde <span className="block font-normal">(unidades mínimas)</span></th>
              <th scope="col" className="px-2 py-3">Hasta</th>
              <th scope="col" className="px-2 py-3">Precio por unidad</th>
              <th scope="col" className="px-2 py-3"><span className="sr-only">Acción</span></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {fields.map((field, index) => {
              const minimumError = errors.discount_tiers?.[index]?.min_quantity?.message;
              const priceError = errors.discount_tiers?.[index]?.unit_price?.message;
              const nextMinimum = tiers?.[index + 1]?.min_quantity;
              return (
                <tr key={field.id} className="align-top">
                  <th scope="row" className="px-3 py-4 font-normal">
                    <span className="bg-slate-100 text-slate-700 font-mono tabular-nums tracking-tight text-xs px-2 py-0.5 rounded">#{index + 1}</span>
                  </th>
                  <td className="w-36 px-2 py-3">
                    <input
                      {...register(`discount_tiers.${index}.min_quantity`, { valueAsNumber: true })}
                      type="number" min={0} step={1} readOnly={index === 0}
                      title={index === 0 ? 'El primer rango inicia en 0 por regla del modelo' : undefined}
                      aria-label={`Desde, unidades mínimas del tramo ${index + 1}`}
                      aria-invalid={Boolean(minimumError)} aria-describedby={`tier-${index}-minimum-error`}
                      className={inputClass(Boolean(minimumError), true)}
                    />
                    <FieldError id={`tier-${index}-minimum-error`} message={minimumError} />
                  </td>
                  <td className="whitespace-nowrap px-2 py-5">
                    <span className="rounded-full bg-slate-50 px-2 py-1 text-xs font-mono tabular-nums tracking-tight text-slate-500">
                      {index === fields.length - 1 ? 'o más (∞)' : Number.isFinite(nextMinimum) ? `hasta ${nextMinimum - 1} u.` : 'Revisa el siguiente tramo'}
                    </span>
                  </td>
                  <td className="w-44 px-2 py-3">
                    <div className="relative">
                      <span aria-hidden="true" className="pointer-events-none absolute left-3 top-2.5 text-xs font-mono tabular-nums tracking-tight text-slate-500">{currency}</span>
                      <input
                        {...register(`discount_tiers.${index}.unit_price`, { valueAsNumber: true })}
                        type="number" min={0.01} step="0.01"
                        aria-label={`Precio por unidad del tramo ${index + 1} (${currency})`}
                        aria-invalid={Boolean(priceError)} aria-describedby={`tier-${index}-price-error`}
                        className={`${inputClass(Boolean(priceError), true)} pl-14`}
                      />
                    </div>
                    <FieldError id={`tier-${index}-price-error`} message={priceError} />
                  </td>
                  <td className="px-2 py-3">
                    <button
                      type="button" onClick={() => removeTier(index)} disabled={fields.length <= 2}
                      aria-label={`Eliminar tramo ${index + 1}`}
                      title={fields.length <= 2 ? 'Conserva al menos 2 tramos de descuento' : `Eliminar tramo ${index + 1}`}
                      className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-slate-500 hover:bg-rose-50 hover:text-rose-600 focus-visible:outline-2 focus-visible:outline-indigo-600 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                    ><Trash2 size={16} aria-hidden="true" /></button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <FieldError id="discount-tiers-error" message={tableError} />
      <button type="button" onClick={addTier} className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600">
        <Plus size={15} aria-hidden="true" />Agregar nivel de descuento
      </button>
    </div>
  );
}
