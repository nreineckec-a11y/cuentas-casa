import { z } from 'zod';

/** Validación compartida por la API y los formularios. */

function esFechaReal(fecha: string): boolean {
  const fechaLeida = new Date(`${fecha}T00:00:00Z`);
  return !Number.isNaN(fechaLeida.getTime()) && fechaLeida.toISOString().slice(0, 10) === fecha;
}

const MONTO_MAXIMO = 1_000_000_000_000;

export const esquemaFecha = z
  .string({ error: 'Elige una fecha' })
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Elige una fecha válida')
  .refine(esFechaReal, 'Elige una fecha válida');

const esquemaMonto = z
  .number({ error: 'Escribe el monto' })
  .int('El monto va en pesos enteros')
  .positive('El monto debe ser mayor que cero')
  .max(MONTO_MAXIMO, 'El monto es demasiado grande');

const camposMovimiento = {
  fecha: esquemaFecha,
  descripcion: z.string().trim().max(300, 'La descripción es demasiado larga'),
  categoriaId: z.number({ error: 'Elige una categoría' }).int().positive('Elige una categoría'),
  monto: esquemaMonto,
  cuentaId: z.number({ error: 'Elige una cuenta' }).int().positive('Elige una cuenta'),
  nota: z.string().trim().max(1000, 'La nota es demasiado larga'),
  porRevisar: z.boolean(),
};

export const esquemaMovimiento = z.object(camposMovimiento).strict();
export type DatosMovimiento = z.infer<typeof esquemaMovimiento>;

export const esquemaEdicion = z
  .object(camposMovimiento)
  .partial()
  .strict()
  .refine((datos) => Object.keys(datos).length > 0, 'No hay cambios');
export type CambiosMovimiento = z.infer<typeof esquemaEdicion>;

export const esquemaExclusion = z
  .object({
    anio: z.number().int().min(2000).max(2100),
    mes: z.number().int().min(1).max(12),
    motivo: z.string().trim().min(1, 'Escribe el motivo').max(300),
  })
  .strict();

const esquemaNombre = z.string().trim().min(1, 'Escribe el nombre').max(120, 'El nombre es demasiado largo');
const esquemaTipo = z.enum(['Ingreso', 'Gasto', 'Traspaso'], { error: 'Elige el tipo' });
const esquemaPresupuesto = z
  .number()
  .int('El presupuesto va en pesos enteros')
  .min(0, 'El presupuesto no puede ser negativo')
  .max(MONTO_MAXIMO, 'El presupuesto es demasiado grande')
  .nullable();

const camposCategoria = {
  nombre: esquemaNombre,
  tipo: esquemaTipo,
  presupuestoMensual: esquemaPresupuesto,
  queIncluye: z.string().trim().max(500, 'El texto es demasiado largo'),
};

export const esquemaCategoriaNueva = z.object(camposCategoria).strict();
export type DatosCategoria = z.infer<typeof esquemaCategoriaNueva>;

const hayCambios = (datos: object) => Object.keys(datos).length > 0;

export const esquemaEdicionCategoria = z
  .object({ ...camposCategoria, activa: z.boolean() })
  .partial()
  .strict()
  .refine(hayCambios, 'No hay cambios');
export type CambiosCategoria = z.infer<typeof esquemaEdicionCategoria>;

export const esquemaCuentaNueva = z.object({ nombre: esquemaNombre }).strict();

export const esquemaEdicionCuenta = z
  .object({ nombre: esquemaNombre, activa: z.boolean() })
  .partial()
  .strict()
  .refine(hayCambios, 'No hay cambios');
export type CambiosCuenta = z.infer<typeof esquemaEdicionCuenta>;


/** El primer mensaje de error por campo, para mostrarlo junto a cada uno. */
export function erroresPorCampo(error: z.ZodError): Record<string, string> {
  const errores: Record<string, string> = {};
  for (const problema of error.issues) {
    const campo = String(problema.path[0] ?? 'general');
    errores[campo] ??= problema.message;
  }
  return errores;
}
