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
      <p className="desk-caption">Cada precio se aplica a todas las unidades del pedido.</p>
      <div className="desk-tier-editor" role="region" aria-label="Precios por volumen">
        <table className="w-full border-collapse text-left text-sm">
          <caption className="sr-only">Niveles de descuento por cantidad, con límites de rango automáticos</caption>
          <thead className="bg-slate-50 text-xs font-medium text-slate-600">
            <tr>
              <th scope="col">Desde / unidades</th>
              <th scope="col">Precio ({currency})</th>
              <th scope="col"><span className="sr-only">Acción</span></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {fields.map((field, index) => {
              const minimumError = errors.discount_tiers?.[index]?.min_quantity?.message;
              const priceError = errors.discount_tiers?.[index]?.unit_price?.message;
              const nextMinimum = tiers?.[index + 1]?.min_quantity;
              return (
                <tr key={field.id} className="align-top">
                  <td>
                    <input
                      {...register(`discount_tiers.${index}.min_quantity`, { valueAsNumber: true })}
                      type="number" min={0} step={1} readOnly={index === 0}
                      title={index === 0 ? 'El primer rango inicia en 0 por regla del modelo' : undefined}
                      aria-label={`Desde, unidades mínimas del tramo ${index + 1}`}
                      aria-invalid={Boolean(minimumError)} aria-describedby={`tier-${index}-minimum-error`}
                      className={inputClass(Boolean(minimumError), true)}
                    />
                    <span className="desk-tier-range font-mono tabular-nums">{index === fields.length - 1 ? 'o más' : Number.isFinite(nextMinimum) ? `hasta ${nextMinimum - 1} u.` : 'Revisa el siguiente tramo'}</span>
                    <FieldError id={`tier-${index}-minimum-error`} message={minimumError} />
                  </td>
                  <td>
                    <div>
                      <input
                        {...register(`discount_tiers.${index}.unit_price`, { valueAsNumber: true })}
                        type="number" min={0.01} step="0.01"
                        aria-label={`Precio por unidad del tramo ${index + 1} (${currency})`}
                        aria-invalid={Boolean(priceError)} aria-describedby={`tier-${index}-price-error`}
                        className={inputClass(Boolean(priceError), true)}
                      />
                    </div>
                    <FieldError id={`tier-${index}-price-error`} message={priceError} />
                  </td>
                  <td>
                    <button
                      type="button" onClick={() => removeTier(index)} disabled={fields.length <= 1}
                      aria-label={`Eliminar tramo ${index + 1}`}
                      title={fields.length <= 1 ? 'Conserva al menos un tramo de precio' : `Eliminar tramo ${index + 1}`}
                      className="desk-delete-tier"
                    ><Trash2 size={16} aria-hidden="true" /></button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <FieldError id="discount-tiers-error" message={tableError} />
      <button type="button" onClick={addTier} disabled={fields.length >= 20} className="desk-secondary">
        <Plus size={15} aria-hidden="true" />Agregar nivel de descuento
      </button>
    </div>
  );
}
