import type { z } from 'zod';
import { crearMes } from './calculos';
import {
  esquemaCategoriaNueva,
  esquemaCuentaNueva,
  esquemaEdicion,
  esquemaEdicionCategoria,
  esquemaEdicionCuenta,
  esquemaExclusion,
  esquemaMovimiento,
} from './esquemas';
import { normalizarNombre } from './formato';
import type { Categoria, Cuenta, MesExcluido, Movimiento } from './tipos';

/**
 * Todos los datos de la app. Vive en el navegador de cada dispositivo: las
 * operaciones de este módulo son puras y entregan una base nueva, o fallan sin
 * cambiar nada. Guardar le toca a src/ui/almacen.ts.
 */
export interface CategoriaGuardada extends Categoria {
  /** Nombre con que viene en el Excel: reimportar la reconoce aunque se haya renombrado. */
  nombreExcel: string | null;
}

export interface CuentaGuardada extends Cuenta {
  nombreExcel: string | null;
}

export interface MovimientoGuardado extends Movimiento {
  /** Identifica la fila del Excel de donde vino: reimportar no la duplica. */
  claveImport: string | null;
  creadoEn: string;
  editadoEn: string | null;
  /** Borrado suave: permite "Deshacer" y evita que reimportar reviva lo borrado. */
  borradoEn: string | null;
}

export interface Base {
  version: 1;
  siguienteId: number;
  categorias: CategoriaGuardada[];
  cuentas: CuentaGuardada[];
  movimientos: MovimientoGuardado[];
  excluidos: MesExcluido[];
  /** Nombres de categorías fusionadas: al reimportar, caen en la categoría de destino. */
  alias: Record<string, number>;
  notasConciliacion: string;
  /** Exclusiones iniciales ya aplicadas: no se repiten si después se incluye el mes. */
  exclusionesAplicadas: string[];
}

export function baseVacia(): Base {
  return {
    version: 1,
    siguienteId: 1,
    categorias: [],
    cuentas: [],
    movimientos: [],
    excluidos: [],
    alias: {},
    notasConciliacion: '',
    exclusionesAplicadas: [],
  };
}

/** Un problema que se le puede explicar a la persona. */
export class ErrorDeDatos extends Error {}

function validar<T extends z.ZodType>(esquema: T, datos: unknown): z.infer<T> {
  const resultado = esquema.safeParse(datos);
  if (!resultado.success) throw new ErrorDeDatos(resultado.error.issues[0]?.message ?? 'Los datos no son válidos.');
  return resultado.data;
}

export function movimientosVigentes(base: Base): MovimientoGuardado[] {
  return base.movimientos.filter((m) => m.borradoEn === null);
}

/** Categorías y cuentas por orden; la pantalla las necesita así. */
export function ordenadas<T extends { orden: number }>(lista: readonly T[]): T[] {
  return [...lista].sort((a, b) => a.orden - b.orden);
}

function exigirReferencias(base: Base, datos: { categoriaId?: number; cuentaId?: number }): void {
  if (datos.categoriaId !== undefined && !base.categorias.some((c) => c.id === datos.categoriaId)) {
    throw new ErrorDeDatos('Esa categoría no existe.');
  }
  if (datos.cuentaId !== undefined && !base.cuentas.some((c) => c.id === datos.cuentaId)) {
    throw new ErrorDeDatos('Esa cuenta no existe.');
  }
}

// ---- Movimientos -----------------------------------------------------------

export function crearMovimiento(
  base: Base,
  datos: unknown,
  ahora = new Date().toISOString(),
): { base: Base; movimiento: MovimientoGuardado } {
  const validos = validar(esquemaMovimiento, datos);
  exigirReferencias(base, validos);
  const movimiento: MovimientoGuardado = {
    ...validos,
    id: base.siguienteId,
    origen: 'manual',
    claveImport: null,
    creadoEn: ahora,
    editadoEn: null,
    borradoEn: null,
  };
  return { base: { ...base, siguienteId: base.siguienteId + 1, movimientos: [...base.movimientos, movimiento] }, movimiento };
}

export function editarMovimiento(
  base: Base,
  id: number,
  cambios: unknown,
  ahora = new Date().toISOString(),
): { base: Base; movimiento: MovimientoGuardado } {
  const actual = base.movimientos.find((m) => m.id === id && m.borradoEn === null);
  if (!actual) throw new ErrorDeDatos('Ese movimiento ya no existe.');
  const validos = validar(esquemaEdicion, cambios);
  exigirReferencias(base, validos);
  const movimiento = { ...actual, ...validos, editadoEn: ahora };
  return { base: { ...base, movimientos: base.movimientos.map((m) => (m.id === id ? movimiento : m)) }, movimiento };
}

export function editarLote(
  base: Base,
  ids: readonly number[],
  cambios: { categoriaId?: number; cuentaId?: number },
  ahora = new Date().toISOString(),
): Base {
  if (ids.length === 0) throw new ErrorDeDatos('No hay movimientos elegidos.');
  if (cambios.categoriaId === undefined && cambios.cuentaId === undefined) throw new ErrorDeDatos('No hay cambios.');
  exigirReferencias(base, cambios);
  const elegidos = new Set(ids);
  return {
    ...base,
    movimientos: base.movimientos.map((m) =>
      elegidos.has(m.id) && m.borradoEn === null ? { ...m, ...cambios, editadoEn: ahora } : m,
    ),
  };
}

export function borrarMovimientos(base: Base, ids: readonly number[], ahora = new Date().toISOString()): Base {
  const elegidos = new Set(ids);
  return {
    ...base,
    movimientos: base.movimientos.map((m) => (elegidos.has(m.id) && m.borradoEn === null ? { ...m, borradoEn: ahora } : m)),
  };
}

export function restaurarMovimientos(base: Base, ids: readonly number[]): Base {
  const elegidos = new Set(ids);
  return { ...base, movimientos: base.movimientos.map((m) => (elegidos.has(m.id) ? { ...m, borradoEn: null } : m)) };
}

// ---- Meses excluidos y notas ------------------------------------------------

export function excluirMes(base: Base, exclusion: unknown): Base {
  const validos = validar(esquemaExclusion, exclusion);
  return {
    ...base,
    excluidos: [...base.excluidos.filter((m) => !(m.anio === validos.anio && m.mes === validos.mes)), validos],
  };
}

export function incluirMes(base: Base, anio: number, mes: number): Base {
  return { ...base, excluidos: base.excluidos.filter((m) => !(m.anio === anio && m.mes === mes)) };
}

export function guardarNotas(base: Base, texto: string): Base {
  return { ...base, notasConciliacion: texto };
}

// ---- Categorías y cuentas ---------------------------------------------------

function exigirNombreLibre(nombre: string, usados: readonly { id: number; nombre: string }[], propioId?: number): void {
  const buscado = normalizarNombre(nombre);
  if (usados.some((u) => u.id !== propioId && normalizarNombre(u.nombre) === buscado)) {
    throw new ErrorDeDatos(`Ya existe «${nombre}».`);
  }
}

function siguienteOrden(usados: readonly { orden: number }[]): number {
  return usados.reduce((maximo, u) => Math.max(maximo, u.orden), 0) + 1;
}

function aplicarOrden<T extends { id: number; orden: number }>(lista: readonly T[], ids: readonly number[]): T[] {
  const unicos = new Set(ids);
  if (unicos.size !== ids.length || unicos.size !== lista.length || lista.some((e) => !unicos.has(e.id))) {
    throw new ErrorDeDatos('La lista cambió. Recarga la página e intenta de nuevo.');
  }
  const posicion = new Map(ids.map((id, i) => [id, i + 1]));
  return lista.map((e) => ({ ...e, orden: posicion.get(e.id) as number }));
}

function cuantosMovimientos(base: Base, campo: 'categoriaId' | 'cuentaId', id: number): number {
  // Cuenta también los borrados: siguen apuntando ahí y se pueden restaurar.
  return base.movimientos.filter((m) => m[campo] === id).length;
}

export function crearCategoria(base: Base, datos: unknown): Base {
  const validos = validar(esquemaCategoriaNueva, datos);
  exigirNombreLibre(validos.nombre, base.categorias);
  const categoria: CategoriaGuardada = {
    ...validos,
    id: base.siguienteId,
    orden: siguienteOrden(base.categorias),
    activa: true,
    rol: null,
    nombreExcel: null,
  };
  return { ...base, siguienteId: base.siguienteId + 1, categorias: [...base.categorias, categoria] };
}

export function editarCategoria(base: Base, id: number, cambios: unknown): Base {
  const categoria = base.categorias.find((c) => c.id === id);
  if (!categoria) throw new ErrorDeDatos('Esa categoría ya no existe.');
  const validos = validar(esquemaEdicionCategoria, cambios);
  if (validos.nombre !== undefined) exigirNombreLibre(validos.nombre, base.categorias, id);
  if (validos.tipo !== undefined && validos.tipo !== categoria.tipo && categoria.rol) {
    // Sus montos ya entran a otro cálculo (traído neto, doble conteo): cambiarle el tipo los contaría dos veces.
    throw new ErrorDeDatos(`«${categoria.nombre}» cumple una función especial y no puede cambiar de tipo.`);
  }
  return { ...base, categorias: base.categorias.map((c) => (c.id === id ? { ...c, ...validos } : c)) };
}

export function ordenarCategorias(base: Base, ids: readonly number[]): Base {
  return { ...base, categorias: aplicarOrden(base.categorias, ids) };
}

export function borrarCategoria(base: Base, id: number): Base {
  const categoria = base.categorias.find((c) => c.id === id);
  if (!categoria) throw new ErrorDeDatos('Esa categoría ya no existe.');
  if (categoria.rol) throw new ErrorDeDatos(`«${categoria.nombre}» cumple una función especial y no se puede borrar. Puedes archivarla.`);
  const cantidad = cuantosMovimientos(base, 'categoriaId', id);
  if (cantidad > 0) {
    throw new ErrorDeDatos(
      `«${categoria.nombre}» tiene ${cantidad} ${cantidad === 1 ? 'movimiento' : 'movimientos'}, contando los borrados. Puedes archivarla o fusionarla.`,
    );
  }
  return { ...base, categorias: base.categorias.filter((c) => c.id !== id) };
}

/**
 * Pasa todo lo de una categoría a otra y la elimina. Su nombre queda como alias:
 * reimportar un Excel que lo traiga cae en la categoría de destino, sin recrearla.
 */
export function fusionarCategoria(base: Base, origenId: number, destinoId: number): { base: Base; movidos: number } {
  if (origenId === destinoId) throw new ErrorDeDatos('Elige otra categoría de destino.');
  const origen = base.categorias.find((c) => c.id === origenId);
  const destino = base.categorias.find((c) => c.id === destinoId);
  if (!origen || !destino) throw new ErrorDeDatos('Esa categoría ya no existe.');
  if (origen.rol) throw new ErrorDeDatos(`«${origen.nombre}» cumple una función especial y no se puede fusionar en otra.`);
  if (origen.tipo !== destino.tipo) {
    // Cambiaría los totales de ingresos y gastos sin que se note.
    throw new ErrorDeDatos(
      `Solo se pueden fusionar categorías del mismo tipo: «${origen.nombre}» es ${origen.tipo} y «${destino.nombre}» es ${destino.tipo}.`,
    );
  }

  let movidos = 0;
  const movimientos = base.movimientos.map((m) => {
    if (m.categoriaId !== origenId) return m;
    movidos++;
    return { ...m, categoriaId: destinoId };
  });

  const alias = Object.fromEntries(
    Object.entries(base.alias).map(([nombre, id]) => [nombre, id === origenId ? destinoId : id]),
  );
  for (const nombre of [origen.nombre, origen.nombreExcel]) {
    if (nombre) alias[normalizarNombre(nombre)] = destinoId;
  }

  const categorias = base.categorias
    .filter((c) => c.id !== origenId)
    .map((c) => (c.id === destinoId && c.presupuestoMensual === null ? { ...c, presupuestoMensual: origen.presupuestoMensual } : c));

  return { base: { ...base, movimientos, alias, categorias }, movidos };
}

export function crearCuenta(base: Base, datos: unknown): Base {
  const { nombre } = validar(esquemaCuentaNueva, datos);
  exigirNombreLibre(nombre, base.cuentas);
  const cuenta: CuentaGuardada = { id: base.siguienteId, nombre, orden: siguienteOrden(base.cuentas), activa: true, nombreExcel: null };
  return { ...base, siguienteId: base.siguienteId + 1, cuentas: [...base.cuentas, cuenta] };
}

export function editarCuenta(base: Base, id: number, cambios: unknown): Base {
  if (!base.cuentas.some((c) => c.id === id)) throw new ErrorDeDatos('Esa cuenta ya no existe.');
  const validos = validar(esquemaEdicionCuenta, cambios);
  if (validos.nombre !== undefined) exigirNombreLibre(validos.nombre, base.cuentas, id);
  return { ...base, cuentas: base.cuentas.map((c) => (c.id === id ? { ...c, ...validos } : c)) };
}

export function ordenarCuentas(base: Base, ids: readonly number[]): Base {
  return { ...base, cuentas: aplicarOrden(base.cuentas, ids) };
}

export function borrarCuenta(base: Base, id: number): Base {
  const cuenta = base.cuentas.find((c) => c.id === id);
  if (!cuenta) throw new ErrorDeDatos('Esa cuenta ya no existe.');
  const cantidad = cuantosMovimientos(base, 'cuentaId', id);
  if (cantidad > 0) {
    throw new ErrorDeDatos(
      `«${cuenta.nombre}» tiene ${cantidad} ${cantidad === 1 ? 'movimiento' : 'movimientos'}, contando los borrados. Puedes archivarla.`,
    );
  }
  return { ...base, cuentas: base.cuentas.filter((c) => c.id !== id) };
}

/** Los meses excluidos como conjunto, listos para los cálculos. */
export function mesesExcluidos(base: Base): Set<string> {
  return new Set(base.excluidos.map((m) => crearMes(m.anio, m.mes)));
}
