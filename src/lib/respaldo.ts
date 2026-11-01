import { z } from 'zod';
import type { Base } from './base';
import { diasEntreFechas, fechaDeHoy } from './formato';
import type { Respaldo } from './tipos';

/** Formato del archivo de respaldo y reglas de cuántos conservar. Sin navegador ni almacenamiento. */

export const RESPALDOS_A_CONSERVAR = 14;
export const DIAS_PARA_RECORDAR_DESCARGA = 14;

export class ErrorDeRespaldo extends Error {}

const esquemaFechaTexto = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const esquemaId = z.number().int().positive();

const esquemaBase = z.object({
  version: z.literal(1),
  siguienteId: esquemaId,
  categorias: z.array(
    z.object({
      id: esquemaId,
      nombre: z.string(),
      tipo: z.enum(['Ingreso', 'Gasto', 'Traspaso']),
      presupuestoMensual: z.number().int().min(0).nullable(),
      queIncluye: z.string(),
      orden: z.number().int(),
      activa: z.boolean(),
      rol: z.enum(['traspaso_desde', 'traspaso_hacia', 'pago_tarjetas', 'giros_efectivo']).nullable(),
      nombreExcel: z.string().nullable(),
    }),
  ),
  cuentas: z.array(
    z.object({
      id: esquemaId,
      nombre: z.string(),
      orden: z.number().int(),
      activa: z.boolean(),
      nombreExcel: z.string().nullable(),
    }),
  ),
  movimientos: z.array(
    z.object({
      id: esquemaId,
      fecha: esquemaFechaTexto,
      descripcion: z.string(),
      categoriaId: esquemaId,
      monto: z.number().int().positive(),
      cuentaId: esquemaId,
      nota: z.string(),
      porRevisar: z.boolean(),
      origen: z.enum(['importado', 'manual']),
      claveImport: z.string().nullable(),
      creadoEn: z.string(),
      editadoEn: z.string().nullable(),
      borradoEn: z.string().nullable(),
    }),
  ),
  excluidos: z.array(z.object({ anio: z.number().int(), mes: z.number().int().min(1).max(12), motivo: z.string() })),
  alias: z.record(z.string(), esquemaId),
  notasConciliacion: z.string(),
  exclusionesAplicadas: z.array(z.string()),
});

const esquemaArchivo = z.object({
  app: z.literal('cuentas-casa'),
  creadoEn: z.string(),
  base: esquemaBase,
});

export function serializarRespaldo(base: Base, ahora = new Date().toISOString()): string {
  return JSON.stringify({ app: 'cuentas-casa', creadoEn: ahora, base });
}

/** Revisa todo antes de aceptar un archivo: restaurar reemplaza los datos que hay. */
export function leerRespaldo(texto: string): Base {
  let contenido: unknown;
  try {
    contenido = JSON.parse(texto);
  } catch {
    throw new ErrorDeRespaldo('Ese archivo no es un respaldo de la app.');
  }
  const validacion = esquemaArchivo.safeParse(contenido);
  if (!validacion.success) throw new ErrorDeRespaldo('Ese archivo no es un respaldo de la app, o está dañado.');
  const { base } = validacion.data;

  const categorias = new Set(base.categorias.map((c) => c.id));
  const cuentas = new Set(base.cuentas.map((c) => c.id));
  const huerfano = base.movimientos.some((m) => !categorias.has(m.categoriaId) || !cuentas.has(m.cuentaId));
  const aliasRoto = Object.values(base.alias).some((id) => !categorias.has(id));
  if (huerfano || aliasRoto) throw new ErrorDeRespaldo('El respaldo está dañado: tiene movimientos sin su categoría o cuenta.');
  return base;
}

function horaDeArchivo(ahora: Date): string {
  const dos = (n: number) => String(n).padStart(2, '0');
  return `${dos(ahora.getHours())}${dos(ahora.getMinutes())}${dos(ahora.getSeconds())}${String(ahora.getMilliseconds()).padStart(3, '0')}`;
}

/** El diario es uno por día. Los demás llevan hora, y se ordenan bien al comparar los nombres. */
export function nombreDeRespaldo(tipo: Respaldo['tipo'], ahora: Date, motivo?: string): string {
  const fecha = fechaDeHoy(ahora);
  if (tipo === 'diario') return `diario-${fecha}`;
  return `${tipo}-${fecha}-${horaDeArchivo(ahora)}${motivo ? `-${motivo}` : ''}`;
}

export function metadatosDeRespaldo(tipo: Respaldo['tipo'], ahora: Date, bytes: number, motivo?: string): Respaldo {
  const dos = (n: number) => String(n).padStart(2, '0');
  return {
    nombre: nombreDeRespaldo(tipo, ahora, motivo),
    tipo,
    motivo: motivo ?? null,
    fecha: fechaDeHoy(ahora),
    hora: tipo === 'diario' ? null : `${dos(ahora.getHours())}:${dos(ahora.getMinutes())}`,
    creadoEn: ahora.toISOString(),
    bytes,
  };
}

/** Del más nuevo al más antiguo. */
export function ordenarRespaldos(respaldos: readonly Respaldo[]): Respaldo[] {
  return [...respaldos].sort((a, b) => b.creadoEn.localeCompare(a.creadoEn));
}

/** Conserva los últimos 14 de cada tipo: un día de muchos cambios no se lleva los diarios. */
export function respaldosSobrantes(respaldos: readonly Respaldo[], conservar = RESPALDOS_A_CONSERVAR): Respaldo[] {
  const vistos = new Map<Respaldo['tipo'], number>();
  return ordenarRespaldos(respaldos).filter((respaldo) => {
    const cantidad = (vistos.get(respaldo.tipo) ?? 0) + 1;
    vistos.set(respaldo.tipo, cantidad);
    return cantidad > conservar;
  });
}

/**
 * Los datos viven solo en este navegador: si se borran sus datos o se pierde el
 * teléfono, lo único que queda es un archivo descargado. Por eso se recuerda.
 */
export function debeRecordarDescarga(ultimaDescarga: string | null, hoy: string, hayDatos: boolean): boolean {
  if (!hayDatos) return false;
  return ultimaDescarga === null || diasEntreFechas(ultimaDescarga, hoy) >= DIAS_PARA_RECORDAR_DESCARGA;
}
