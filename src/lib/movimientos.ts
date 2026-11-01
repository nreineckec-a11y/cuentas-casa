import { mesDeFecha, type Rol, type Tipo } from './calculos';
import { diasEntreFechas, normalizarTexto } from './formato';
import type { Categoria, Movimiento } from './tipos';

// ---------------------------------------------------------------------------
// Filtros de la pantalla Movimientos
// ---------------------------------------------------------------------------

export interface FiltroMovimientos {
  mes?: string;
  desde?: string;
  hasta?: string;
  categoriaId?: number;
  tipo?: Tipo;
  cuentaId?: number;
  texto?: string;
  soloPorRevisar?: boolean;
}

const TIPOS_VALIDOS: readonly string[] = ['Ingreso', 'Gasto', 'Traspaso'];

function idDesdeTexto(valor: string | null): number | undefined {
  const numero = Number(valor);
  return valor && Number.isInteger(numero) && numero > 0 ? numero : undefined;
}

/** Los filtros viven en la URL: así Mes puede abrir Movimientos ya filtrado. */
export function filtroDesdeParams(params: URLSearchParams): FiltroMovimientos {
  const tipo = params.get('tipo');
  return {
    mes: params.get('mes') ?? undefined,
    desde: params.get('desde') ?? undefined,
    hasta: params.get('hasta') ?? undefined,
    categoriaId: idDesdeTexto(params.get('categoria')),
    tipo: tipo && TIPOS_VALIDOS.includes(tipo) ? (tipo as Tipo) : undefined,
    cuentaId: idDesdeTexto(params.get('cuenta')),
    texto: params.get('q') ?? undefined,
    soloPorRevisar: params.get('revisar') === '1' || undefined,
  };
}

export function paramsDesdeFiltro(filtro: FiltroMovimientos): URLSearchParams {
  const params = new URLSearchParams();
  if (filtro.mes) params.set('mes', filtro.mes);
  if (filtro.desde) params.set('desde', filtro.desde);
  if (filtro.hasta) params.set('hasta', filtro.hasta);
  if (filtro.categoriaId) params.set('categoria', String(filtro.categoriaId));
  if (filtro.tipo) params.set('tipo', filtro.tipo);
  if (filtro.cuentaId) params.set('cuenta', String(filtro.cuentaId));
  if (filtro.texto) params.set('q', filtro.texto);
  if (filtro.soloPorRevisar) params.set('revisar', '1');
  return params;
}

export function cantidadDeFiltros(filtro: FiltroMovimientos): number {
  return [
    filtro.mes,
    filtro.desde,
    filtro.hasta,
    filtro.categoriaId,
    filtro.tipo,
    filtro.cuentaId,
    filtro.soloPorRevisar,
  ].filter(Boolean).length;
}

/** Más nuevo primero; dentro del mismo día, el último anotado primero. */
export function compararPorFechaDesc(a: Movimiento, b: Movimiento): number {
  if (a.fecha !== b.fecha) return a.fecha < b.fecha ? 1 : -1;
  return b.id - a.id;
}

function coincideTexto(movimiento: Movimiento, consulta: string, consultaMonto: string | null): boolean {
  // Por el comienzo: buscar 30.000 no debe traer un monto de 1.300.000.
  if (consultaMonto !== null && String(movimiento.monto).startsWith(consultaMonto)) return true;
  return normalizarTexto(`${movimiento.descripcion} ${movimiento.nota}`).includes(consulta);
}

export function filtrarMovimientos(
  movimientos: readonly Movimiento[],
  filtro: FiltroMovimientos,
  categorias: readonly Pick<Categoria, 'id' | 'tipo'>[],
): Movimiento[] {
  const tipoPorId = new Map(categorias.map((c) => [c.id, c.tipo]));
  const consulta = filtro.texto ? normalizarTexto(filtro.texto) : '';
  // "30.000" o "$30.000" también buscan por monto.
  const consultaMonto = /^\$?[\d.]+$/.test(consulta) ? consulta.replace(/\D/g, '') : null;

  return movimientos
    .filter((m) => {
      if (filtro.mes && mesDeFecha(m.fecha) !== filtro.mes) return false;
      if (filtro.desde && m.fecha < filtro.desde) return false;
      if (filtro.hasta && m.fecha > filtro.hasta) return false;
      if (filtro.categoriaId && m.categoriaId !== filtro.categoriaId) return false;
      if (filtro.cuentaId && m.cuentaId !== filtro.cuentaId) return false;
      if (filtro.tipo && tipoPorId.get(m.categoriaId) !== filtro.tipo) return false;
      if (filtro.soloPorRevisar && !m.porRevisar) return false;
      return consulta === '' || coincideTexto(m, consulta, consultaMonto);
    })
    .sort(compararPorFechaDesc);
}

/** Meses con movimientos, del más nuevo al más antiguo. */
export function mesesConMovimientos(movimientos: readonly Movimiento[]): string[] {
  return [...new Set(movimientos.map((m) => mesDeFecha(m.fecha)))].sort().reverse();
}

// ---------------------------------------------------------------------------
// Autocompletado de la descripción
// ---------------------------------------------------------------------------

export interface SugerenciaDescripcion {
  descripcion: string;
  categoriaId: number;
  cuentaId: number;
  normalizada: string;
}

/** Una entrada por descripción, con la categoría y la cuenta de la última vez que se usó. */
export function indiceDeDescripciones(movimientos: readonly Movimiento[]): SugerenciaDescripcion[] {
  const indice = new Map<string, SugerenciaDescripcion>();
  for (const m of [...movimientos].sort(compararPorFechaDesc)) {
    const normalizada = normalizarTexto(m.descripcion);
    if (normalizada && !indice.has(normalizada)) {
      indice.set(normalizada, { descripcion: m.descripcion, categoriaId: m.categoriaId, cuentaId: m.cuentaId, normalizada });
    }
  }
  return [...indice.values()];
}

/** Primero las que empiezan con lo escrito y, dentro de eso, las usadas hace menos. */
export function buscarDescripciones(
  indice: readonly SugerenciaDescripcion[],
  texto: string,
  maximo = 6,
): SugerenciaDescripcion[] {
  const consulta = normalizarTexto(texto);
  if (consulta === '') return [];
  const coincidencias = indice.filter((s) => s.normalizada.includes(consulta) && s.normalizada !== consulta);
  const alInicio = coincidencias.filter((s) => s.normalizada.startsWith(consulta));
  const alMedio = coincidencias.filter((s) => !s.normalizada.startsWith(consulta));
  return [...alInicio, ...alMedio].slice(0, maximo);
}

// ---------------------------------------------------------------------------
// Avisos al anotar
// ---------------------------------------------------------------------------

const MARGEN_DIAS_DUPLICADO = 2;
const PARECIDO_MINIMO = 0.6;

function paresDeLetras(texto: string): Map<string, number> {
  const pares = new Map<string, number>();
  for (let i = 0; i < texto.length - 1; i++) {
    const par = texto.slice(i, i + 2);
    pares.set(par, (pares.get(par) ?? 0) + 1);
  }
  return pares;
}

/** Parecido entre 0 y 1 según los pares de letras que comparten (coeficiente de Dice). */
export function parecidoDeTextos(a: string, b: string): number {
  const x = normalizarTexto(a);
  const y = normalizarTexto(b);
  if (x === '' || y === '') return 0;
  if (x === y) return 1;
  if (x.includes(y) || y.includes(x)) return 1;
  if (x.length < 2 || y.length < 2) return 0;
  const paresX = paresDeLetras(x);
  const paresY = paresDeLetras(y);
  let comunes = 0;
  for (const [par, cantidad] of paresX) comunes += Math.min(cantidad, paresY.get(par) ?? 0);
  return (2 * comunes) / (x.length - 1 + (y.length - 1));
}

export function posiblesDuplicados(
  nuevo: { fecha: string; monto: number | null; descripcion: string; id?: number },
  movimientos: readonly Movimiento[],
): Movimiento[] {
  if (!nuevo.monto || !nuevo.fecha || !nuevo.descripcion.trim()) return [];
  return movimientos
    .filter(
      (m) =>
        m.id !== nuevo.id &&
        m.monto === nuevo.monto &&
        diasEntreFechas(m.fecha, nuevo.fecha) <= MARGEN_DIAS_DUPLICADO &&
        parecidoDeTextos(m.descripcion, nuevo.descripcion) >= PARECIDO_MINIMO,
    )
    .sort(compararPorFechaDesc);
}

// ---------------------------------------------------------------------------
// Tipo de movimiento al anotar
// ---------------------------------------------------------------------------

/** El tipo no se guarda en el movimiento: elegirlo solo acota la lista de categorías. */
export function categoriasDelTipo<T extends Pick<Categoria, 'tipo'>>(categorias: readonly T[], tipo: Tipo): T[] {
  return categorias.filter((c) => c.tipo === tipo);
}

const NOMBRE_TIPO: Record<Tipo, string> = { Ingreso: 'ingreso', Gasto: 'gasto', Traspaso: 'traspaso' };

export function etiquetaGuardar(tipo: Tipo): string {
  return `Guardar ${NOMBRE_TIPO[tipo]}`;
}

export function textoGuardado(tipo: Tipo | undefined, monto: string, descripcion: string): string {
  const inicio = tipo ? `${tipo} guardado` : 'Guardado';
  return `${inicio}: ${monto}${descripcion ? ` · ${descripcion}` : ''}`;
}

/** Recordatorio de la regla de doble conteo, según la función de la categoría. */
export function recordatorioDobleConteo(rol: Rol | null | undefined): string | null {
  if (rol === 'pago_tarjetas') {
    return 'Recuerda: se anotan las compras con su categoría o solo el pago de la tarjeta, nunca ambas cosas.';
  }
  if (rol === 'giros_efectivo') {
    return 'Recuerda: se anota en qué se gastó el efectivo o solo el giro, nunca ambas cosas.';
  }
  return null;
}

// ---------------------------------------------------------------------------
// Por revisar
// ---------------------------------------------------------------------------

const PREFIJO_REVISAR = /^\s*revisar\b\s*:?\s*/i;

export function tienePrefijoRevisar(nota: string): boolean {
  return PREFIJO_REVISAR.test(nota);
}

/** "Revisar: comercio no identificado" pasa a "Comercio no identificado". */
export function quitarPrefijoRevisar(nota: string): string {
  const resto = nota.replace(PREFIJO_REVISAR, '');
  return resto.charAt(0).toLocaleUpperCase('es') + resto.slice(1);
}

/**
 * El Excel marca "por revisar" con el texto de la nota; la app, con un campo aparte.
 * Al exportar, la nota debe decir lo mismo que el campo, o la fila amarilla y la
 * próxima importación se equivocarían.
 */
export function notaParaExcel(nota: string, porRevisar: boolean): string {
  const conPrefijo = tienePrefijoRevisar(nota);
  if (porRevisar && !conPrefijo) return nota ? `Revisar: ${nota}` : 'Revisar';
  if (!porRevisar && conPrefijo) return quitarPrefijoRevisar(nota);
  return nota;
}

// ---------------------------------------------------------------------------
// Orden de categorías y cuentas
// ---------------------------------------------------------------------------

/**
 * Sube o baja un elemento hasta el vecino de su mismo grupo y entrega el nuevo
 * orden completo. Si ya está en el extremo del grupo, entrega null.
 */
export function moverEnGrupo<T extends { id: number }>(
  elementos: readonly T[],
  id: number,
  direccion: -1 | 1,
  mismoGrupo: (a: T, b: T) => boolean = () => true,
): number[] | null {
  const lista = [...elementos];
  const desde = lista.findIndex((e) => e.id === id);
  const elemento = lista[desde];
  if (!elemento) return null;
  for (let i = desde + direccion; i >= 0 && i < lista.length; i += direccion) {
    const vecino = lista[i] as T;
    if (mismoGrupo(elemento, vecino)) {
      lista[desde] = vecino;
      lista[i] = elemento;
      return lista.map((e) => e.id);
    }
  }
  return null;
}
