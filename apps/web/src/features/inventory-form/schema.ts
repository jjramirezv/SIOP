import { z } from 'zod';
import type { AnalysisRequest } from '../../services/generated/types';

const positiveNumber = (message: string) => z.number({ error: message }).positive(message);

const discountTierSchema = z.object({
  min_quantity: z.number({ error: 'Ingresa desde cuántas unidades aplica este precio' })
    .int('Usa una cantidad mínima de unidades enteras')
    .nonnegative('La cantidad mínima no puede ser negativa'),
  unit_price: positiveNumber('El precio por unidad debe ser mayor a 0'),
});

const discountTiersSchema = z.array(discountTierSchema, {
  error: 'Agrega los niveles de precio por volumen',
}).min(1, 'Agrega al menos un tramo de precio').max(20, 'Usa como máximo 20 tramos de precio').superRefine((tiers, ctx) => {
  // Zod antepone discount_tiers a estas rutas relativas del arreglo.
  if (tiers.length > 0 && tiers[0].min_quantity !== 0) {
    ctx.addIssue({
      code: 'custom', path: [0, 'min_quantity'],
      message: 'El primer tramo siempre debe iniciar desde 0 unidades',
    });
  }
  for (let index = 1; index < tiers.length; index += 1) {
    const previous = tiers[index - 1];
    if (tiers[index].min_quantity <= previous.min_quantity) {
      ctx.addIssue({
        code: 'custom', path: [index, 'min_quantity'],
        message: `La cantidad mínima debe ser mayor a la del tramo anterior (${previous.min_quantity})`,
      });
    }
    if (tiers[index].unit_price > previous.unit_price) {
      ctx.addIssue({
        code: 'custom', path: [index, 'unit_price'],
        message: `A mayor volumen, el precio unitario no puede subir respecto al tramo anterior (${previous.unit_price})`,
      });
    }
  }
});

export const analysisFormSchema = z.object({
  product_name: z.string({ error: 'Escribe el nombre del producto que estás comprando' })
    .trim().min(1, 'Escribe el nombre del producto que estás comprando').max(120, 'Usa como máximo 120 caracteres'),
  currency: z.string({ error: 'Elige soles (PEN) o dólares (USD)' })
    .refine((value) => value === 'PEN' || value === 'USD', 'Elige soles (PEN) o dólares (USD)'),
  demand: positiveNumber('Ingresa cuántas unidades vendes (debe ser mayor a 0)'),
  demand_period: z.enum(['year', 'month', 'day'], { error: 'Elige si vendes esa cantidad al año, al mes o al día' }),
  days_per_year: positiveNumber('Los días trabajados por año deben ser mayores a 0')
    .int('Ingresa una cantidad entera de días trabajados por año').max(366, 'El año puede tener como máximo 366 días'),
  ordering_cost: positiveNumber('El costo por hacer cada pedido debe ser mayor a 0'),
  holding_cost_mode: z.enum(['percentage', 'fixed'], { error: 'Elige un porcentaje del precio o un monto fijo por unidad' }),
  holding_cost_value: positiveNumber('El costo de guardar cada unidad debe ser mayor a 0'),
  holding_cost_period: z.enum(['year', 'month', 'day'], { error: 'Elige si el almacenamiento se paga al año, al mes o al día' }),
  discount_tiers: discountTiersSchema,
  current_order_quantity: positiveNumber('La cantidad que sueles pedir debe ser mayor a 0')
    .int('Ingresa una cantidad entera de unidades para tu compra actual').nullable().optional(),
}) satisfies z.ZodType<AnalysisRequest>;

// Comprobación de compatibilidad con el contrato, sin cambiar los tipos generados.
export type AnalysisFormData = z.infer<typeof analysisFormSchema>;
