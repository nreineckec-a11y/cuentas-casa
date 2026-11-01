/**
 * Cálculos de las cuentas de la casa. Módulo puro: sin base de datos ni React.
 * Replica las hojas Calc, Mes y Resumen anual del Excel y corrige sus fallas.
 */

export type Tipo = 'Ingreso' | 'Gasto' | 'Traspaso';
export type Rol = 'traspaso_desde' | 'traspaso_hacia' | 'pago_tarjetas' | 'giros_efectivo';
/** Mes como texto 'YYYY-MM'; se ordena bien al compararlo como texto. */
export type Mes = string;

export interface CategoriaCalc {
  id: number;
  nombre: string;
  tipo: Tipo;
  presupuestoMensual: number | null;
  orden: number;
  rol?: Rol | null;
}

export interface MovimientoCalc {
  id: number;
  /** 'YYYY-MM-DD' */
  fecha: string;
  categoriaId: number;
  monto: number;
  descripcion?: string;
}

export interface DatosCalculo {
  categorias: CategoriaCalc[];
  movimientos: MovimientoCalc[];
  /** Meses excluidos a mano del promedio. */
  excluidos: ReadonlySet<Mes>;
}

// ---------------------------------------------------------------------------
// Meses
// ---------------------------------------------------------------------------

const NOMBRES_MES_CORTOS = [
  'ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic',
] as const;

export function mesDeFecha(fecha: string): Mes {
  return fecha.slice(0, 7);
}

export function crearMes(anio: number, mes: number): Mes {
  return `${String(anio).padStart(4, '0')}-${String(mes).padStart(2, '0')}`;
}

export function sumarMeses(mes: Mes, cantidad: number): Mes {
  const anio = Number(mes.slice(0, 4));
  const numero = Number(mes.slice(5, 7));
  const total = anio * 12 + (numero - 1) + cantidad;
  return crearMes(Math.floor(total / 12), (total % 12 + 12) % 12 + 1);
}

/** Meses desde `desde` hasta `hasta`, sin incluir `hasta`. */
export function rangoDeMeses(desde: Mes, hasta: Mes): Mes[] {
  const meses: Mes[] = [];
  for (let m = desde; m < hasta; m = sumarMeses(m, 1)) meses.push(m);
  return meses;
}

export function mesesDelAnio(anio: number): Mes[] {
  return rangoDeMeses(crearMes(anio, 1), crearMes(anio + 1, 1));
}

function ultimoDiaDelMes(mes: Mes): number {
  const anio = Number(mes.slice(0, 4));
  const numero = Number(mes.slice(5, 7));
  return new Date(Date.UTC(anio, numero, 0)).getUTCDate();
}

function diasEntre(desde: string, hasta: string): number {
  return Math.round((Date.parse(`${hasta}T00:00:00Z`) - Date.parse(`${desde}T00:00:00Z`)) / 86_400_000);
}

// ---------------------------------------------------------------------------
// Calendario (hoja Calc)
// ---------------------------------------------------------------------------

export interface Calendario {
  primeraFecha: string;
  ultimaFecha: string;
  /** El mes de la primera fecha si es día 1; si no, el siguiente. */
  primerMesCompleto: Mes;
  /** El mes de la última fecha; si es el último día del mes, el siguiente. */
  mesEnCurso: Mes;
}

export function calcularCalendario(fechas: Iterable<string>): Calendario | null {
  let primeraFecha: string | null = null;
  let ultimaFecha: string | null = null;
  for (const fecha of fechas) {
    if (primeraFecha === null || fecha < primeraFecha) primeraFecha = fecha;
    if (ultimaFecha === null || fecha > ultimaFecha) ultimaFecha = fecha;
  }
  if (primeraFecha === null || ultimaFecha === null) return null;

  const mesPrimera = mesDeFecha(primeraFecha);
  const mesUltima = mesDeFecha(ultimaFecha);
  const esPrimerDia = Number(primeraFecha.slice(8, 10)) === 1;
  const esUltimoDia = Number(ultimaFecha.slice(8, 10)) === ultimoDiaDelMes(mesUltima);
  return {
    primeraFecha,
    ultimaFecha,
    primerMesCompleto: esPrimerDia ? mesPrimera : sumarMeses(mesPrimera, 1),
    mesEnCurso: esUltimoDia ? sumarMeses(mesUltima, 1) : mesUltima,
  };
}

/** Cuenta como completo por la regla automática, sin mirar las exclusiones manuales. */
export function esMesCompleto(calendario: Calendario | null, mes: Mes): boolean {
  if (!calendario) return false;
  return mes >= calendario.primerMesCompleto && mes < calendario.mesEnCurso;
}

/** Texto del aviso si el mes elegido sigue en curso; null en cualquier otro mes. */
export function avisoMesEnCurso(calendario: Calendario | null, mes: Mes): string | null {
  if (!calendario || mes !== calendario.mesEnCurso) return null;
  const [, mm, dd] = calendario.ultimaFecha.split('-');
  return `Mes en curso: datos hasta el ${dd}-${mm}`;
}

// ---------------------------------------------------------------------------
// Promedio mensual: una sola definición para Mes y Año (falla 3 del Excel)
// ---------------------------------------------------------------------------

export const MESES_VENTANA = 12;

export type AlcancePromedio =
  /** Hoja Mes: los últimos meses completos, hasta `maxMeses`. */
  | { tipo: 'ventana'; maxMeses?: number }
  /** Hoja Resumen anual: los meses completos del año elegido. */
  | { tipo: 'anio'; anio: number };

/**
 * Meses que entran al promedio. Un mes excluido se descuenta y no se reemplaza
 * por uno más antiguo: el promedio simplemente usa menos meses.
 */
export function mesesDelPromedio(
  calendario: Calendario | null,
  excluidos: ReadonlySet<Mes>,
  alcance: AlcancePromedio,
): Mes[] {
  if (!calendario) return [];
  const completos = rangoDeMeses(calendario.primerMesCompleto, calendario.mesEnCurso);
  const candidatos =
    alcance.tipo === 'anio'
      ? completos.filter((m) => m.startsWith(`${String(alcance.anio).padStart(4, '0')}-`))
      : completos.filter((m) => m >= sumarMeses(calendario.mesEnCurso, -(alcance.maxMeses ?? MESES_VENTANA)));
  return candidatos.filter((m) => !excluidos.has(m));
}

/** Promedia una serie mensual sobre los meses dados; null si no hay meses. */
export function promedioMensual(valorDelMes: (mes: Mes) => number, meses: readonly Mes[]): number | null {
  if (meses.length === 0) return null;
  return meses.reduce((suma, mes) => suma + valorDelMes(mes), 0) / meses.length;
}

function nombreMesCorto(mes: Mes): string {
  return NOMBRES_MES_CORTOS[Number(mes.slice(5, 7)) - 1] ?? mes;
}

/** Por ejemplo: "Promedio de mar–sep 2026, 7 meses". */
export function describirPromedio(meses: readonly Mes[]): string {
  if (meses.length === 0) return 'Sin meses completos para promediar';

  const tramos: Array<[Mes, Mes]> = [];
  for (const mes of [...meses].sort()) {
    const ultimo = tramos[tramos.length - 1];
    if (ultimo && sumarMeses(ultimo[1], 1) === mes) ultimo[1] = mes;
    else tramos.push([mes, mes]);
  }

  const anio = (m: Mes) => m.slice(0, 4);
  const todoElMismoAnio = new Set(meses.map(anio)).size === 1;
  const etiqueta = (m: Mes) => (todoElMismoAnio ? nombreMesCorto(m) : `${nombreMesCorto(m)} ${anio(m)}`);
  const texto = tramos
    .map(([desde, hasta]) => (desde === hasta ? etiqueta(desde) : `${etiqueta(desde)}–${etiqueta(hasta)}`))
    .join(', ');
  const sufijoAnio = todoElMismoAnio ? ` ${anio(meses[0] as Mes)}` : '';
  return `Promedio de ${texto}${sufijoAnio}, ${meses.length} ${meses.length === 1 ? 'mes' : 'meses'}`;
}

export type EstadoMesPromedio = 'cuenta' | 'excluido' | 'en_curso' | 'incompleto' | 'futuro' | 'sin_datos';

/** Por qué un mes entra o no al promedio: es lo que muestra la pantalla Año. */
export function estadoMesParaPromedio(
  calendario: Calendario | null,
  excluidos: ReadonlySet<Mes>,
  mes: Mes,
): EstadoMesPromedio {
  if (excluidos.has(mes)) return 'excluido';
  if (!calendario || mes < mesDeFecha(calendario.primeraFecha)) return 'sin_datos';
  if (mes > calendario.mesEnCurso) return 'futuro';
  if (mes === calendario.mesEnCurso) return 'en_curso';
  return mes < calendario.primerMesCompleto ? 'incompleto' : 'cuenta';
}

/** El mes en curso se puede excluir por adelantado; el que quedó antes del primer mes completo ya está fuera. */
export function sePuedeExcluir(estado: EstadoMesPromedio): boolean {
  return estado === 'cuenta' || estado === 'en_curso';
}

/** El mes que se abre por defecto: el último con datos, sin pasar del mes de hoy. */
export function mesPredeterminado(calendario: Calendario | null, mesDeHoy: Mes): Mes {
  if (!calendario) return mesDeHoy;
  const ultimo = mesDeFecha(calendario.ultimaFecha);
  return ultimo < mesDeHoy ? ultimo : mesDeHoy;
}

/** Meses a los que se puede navegar, del más antiguo al más nuevo. */
export function mesesNavegables(calendario: Calendario | null, mesDeHoy: Mes): Mes[] {
  if (!calendario) return [mesDeHoy];
  const ultimo = mesDeFecha(calendario.ultimaFecha);
  const hasta = ultimo > mesDeHoy ? ultimo : mesDeHoy;
  return rangoDeMeses(mesDeFecha(calendario.primeraFecha), sumarMeses(hasta, 1));
}

export interface MesPorCerrar {
  mes: Mes;
  /** Última fecha con datos antes del cambio, si cae dentro de ese mes. */
  ultimaFechaDelMes: string | null;
  /** Días del mes que quedan después del último dato. */
  diasSinDatos: number;
}

export const DIAS_PARA_AVISAR_MES_INCOMPLETO = 7;

/**
 * Meses que pasarían a contar como completos al anotar nuevas fechas, cuando
 * les faltan datos al final. Sirve para avisar y ofrecer excluirlos.
 */
export function mesesQueEntranAlPromedio(
  antes: Calendario | null,
  despues: Calendario | null,
  excluidos: ReadonlySet<Mes> = new Set(),
): MesPorCerrar[] {
  if (!antes || !despues) return [];
  const resultado: MesPorCerrar[] = [];
  for (const mes of rangoDeMeses(antes.mesEnCurso, despues.mesEnCurso)) {
    if (excluidos.has(mes) || !esMesCompleto(despues, mes)) continue;
    const finDeMes = `${mes}-${String(ultimoDiaDelMes(mes)).padStart(2, '0')}`;
    const ultimaFechaDelMes = mesDeFecha(antes.ultimaFecha) === mes ? antes.ultimaFecha : null;
    const diasSinDatos = ultimaFechaDelMes ? diasEntre(ultimaFechaDelMes, finDeMes) : ultimoDiaDelMes(mes);
    if (diasSinDatos >= DIAS_PARA_AVISAR_MES_INCOMPLETO) {
      resultado.push({ mes, ultimaFechaDelMes, diasSinDatos });
    }
  }
  return resultado;
}

// ---------------------------------------------------------------------------
// Agregados
// ---------------------------------------------------------------------------

/** Suma por categoría y mes: la base de todas las tablas. */
export class SumasPorMes {
  private readonly sumas = new Map<number, Map<Mes, number>>();

  constructor(movimientos: Iterable<MovimientoCalc>) {
    for (const { categoriaId, fecha, monto } of movimientos) {
      let porMes = this.sumas.get(categoriaId);
      if (!porMes) this.sumas.set(categoriaId, (porMes = new Map()));
      const mes = mesDeFecha(fecha);
      porMes.set(mes, (porMes.get(mes) ?? 0) + monto);
    }
  }

  de(categoriaId: number, mes: Mes): number {
    return this.sumas.get(categoriaId)?.get(mes) ?? 0;
  }
}

function ordenar(categorias: readonly CategoriaCalc[]): CategoriaCalc[] {
  return [...categorias].sort((a, b) => a.orden - b.orden);
}

export interface TotalesMes {
  ingresos: number;
  gastos: number;
  diferencia: number;
  traidoNeto: number;
}

function totalesDeUnMes(categorias: readonly CategoriaCalc[], sumas: SumasPorMes, mes: Mes): TotalesMes {
  let ingresos = 0;
  let gastos = 0;
  let traidoNeto = 0;
  for (const categoria of categorias) {
    const monto = sumas.de(categoria.id, mes);
    if (categoria.tipo === 'Ingreso') ingresos += monto;
    else if (categoria.tipo === 'Gasto') gastos += monto;
    // "Ajustes y devoluciones del banco" es Traspaso, pero no tiene rol: no entra al neto.
    if (categoria.rol === 'traspaso_desde') traidoNeto += monto;
    else if (categoria.rol === 'traspaso_hacia') traidoNeto -= monto;
  }
  return { ingresos, gastos, diferencia: ingresos - gastos, traidoNeto };
}

export interface TotalesPorTipo {
  ingresos: number;
  gastos: number;
  traspasos: number;
  /** Ingresos menos gastos; los traspasos no cuentan. */
  neto: number;
}

/** Totales de una lista filtrada, separados por tipo (falla 7 del Excel). */
export function totalesPorTipo(
  movimientos: Iterable<MovimientoCalc>,
  categorias: readonly CategoriaCalc[],
): TotalesPorTipo {
  const tipoPorId = new Map(categorias.map((c) => [c.id, c.tipo]));
  const totales = { ingresos: 0, gastos: 0, traspasos: 0 };
  for (const { categoriaId, monto } of movimientos) {
    const tipo = tipoPorId.get(categoriaId);
    if (tipo === 'Ingreso') totales.ingresos += monto;
    else if (tipo === 'Gasto') totales.gastos += monto;
    else if (tipo === 'Traspaso') totales.traspasos += monto;
  }
  return { ...totales, neto: totales.ingresos - totales.gastos };
}

// ---------------------------------------------------------------------------
// Hoja Mes
// ---------------------------------------------------------------------------

export interface FilaCategoriaMes {
  categoria: CategoriaCalc;
  esteMes: number;
  /** Fracción del gasto del mes (0–1); solo categorías de gasto. */
  porcentajeGasto: number | null;
  promedio: number | null;
  presupuesto: number | null;
  /** Presupuesto menos este mes; solo categorías de gasto con presupuesto. */
  disponible: number | null;
}

export interface TopCategoria {
  categoria: CategoriaCalc;
  monto: number;
}

export interface ResumenMes {
  mes: Mes;
  totales: TotalesMes;
  gastoPromedio: number | null;
  mesesPromedio: Mes[];
  descripcionPromedio: string;
  aviso: string | null;
  filas: FilaCategoriaMes[];
  topCategorias: TopCategoria[];
  topMovimientos: MovimientoCalc[];
}

export const TOP_N = 5;

/** Categorías de gasto con mayor suma. En un empate gana la que va después, como en el Excel. */
export function topCategoriasDeGasto(
  filas: readonly { categoria: CategoriaCalc; esteMes: number }[],
  cantidad = TOP_N,
): TopCategoria[] {
  return filas
    .filter((f) => f.categoria.tipo === 'Gasto' && f.esteMes > 0)
    .sort((a, b) => b.esteMes - a.esteMes || b.categoria.orden - a.categoria.orden)
    .slice(0, cantidad)
    .map((f) => ({ categoria: f.categoria, monto: f.esteMes }));
}

/** Movimientos de gasto individuales más grandes. En un empate va primero el más reciente. */
export function topMovimientosDeGasto(
  movimientos: Iterable<MovimientoCalc>,
  categorias: readonly CategoriaCalc[],
  mes: Mes,
  cantidad = TOP_N,
): MovimientoCalc[] {
  const idsGasto = new Set(categorias.filter((c) => c.tipo === 'Gasto').map((c) => c.id));
  return [...movimientos]
    .filter((m) => idsGasto.has(m.categoriaId) && mesDeFecha(m.fecha) === mes)
    .sort((a, b) => b.monto - a.monto || b.fecha.localeCompare(a.fecha) || b.id - a.id)
    .slice(0, cantidad);
}

export function calcularResumenMes(datos: DatosCalculo, mes: Mes): ResumenMes {
  const { movimientos, excluidos } = datos;
  const categorias = ordenar(datos.categorias);
  const calendario = calcularCalendario(movimientos.map((m) => m.fecha));
  const sumas = new SumasPorMes(movimientos);
  const totales = totalesDeUnMes(categorias, sumas, mes);
  const mesesPromedio = mesesDelPromedio(calendario, excluidos, { tipo: 'ventana' });

  const filas: FilaCategoriaMes[] = categorias.map((categoria) => {
    const esGasto = categoria.tipo === 'Gasto';
    const esteMes = sumas.de(categoria.id, mes);
    return {
      categoria,
      esteMes,
      porcentajeGasto: esGasto && totales.gastos !== 0 ? esteMes / totales.gastos : null,
      promedio: promedioMensual((m) => sumas.de(categoria.id, m), mesesPromedio),
      presupuesto: categoria.presupuestoMensual,
      disponible:
        esGasto && categoria.presupuestoMensual !== null ? categoria.presupuestoMensual - esteMes : null,
    };
  });

  const gastoPromedio = promedioMensual(
    (m) => totalesDeUnMes(categorias, sumas, m).gastos,
    mesesPromedio,
  );

  return {
    mes,
    totales,
    gastoPromedio,
    mesesPromedio,
    descripcionPromedio: describirPromedio(mesesPromedio),
    aviso: avisoMesEnCurso(calendario, mes),
    filas,
    topCategorias: topCategoriasDeGasto(filas),
    topMovimientos: topMovimientosDeGasto(movimientos, categorias, mes),
  };
}

export type EstadoPresupuesto = 'bien' | 'cerca' | 'excedido';

/** Desde esta fracción del presupuesto, la barra pasa de verde a ámbar. */
export const UMBRAL_CERCA_DEL_PRESUPUESTO = 0.8;

export interface LecturaPresupuesto {
  estado: EstadoPresupuesto;
  /** Fracción gastada; puede pasar de 1. */
  fraccion: number;
}

/** Verde bajo el 80 %, ámbar hasta el 100 % y rojo solo al pasarse. Sin presupuesto, null. */
export function leerPresupuesto(gastado: number, presupuesto: number | null): LecturaPresupuesto | null {
  if (presupuesto === null) return null;
  if (presupuesto === 0) return gastado > 0 ? { estado: 'excedido', fraccion: 1 } : { estado: 'bien', fraccion: 0 };
  const fraccion = gastado / presupuesto;
  if (fraccion > 1) return { estado: 'excedido', fraccion };
  return { estado: fraccion >= UMBRAL_CERCA_DEL_PRESUPUESTO ? 'cerca' : 'bien', fraccion };
}

// ---------------------------------------------------------------------------
// Hoja Resumen anual
// ---------------------------------------------------------------------------

export interface EstadoMesAnual extends TotalesMes {
  mes: Mes;
  /** Completo según la regla automática. */
  completo: boolean;
  /** Excluido a mano. */
  excluido: boolean;
  /** Completo y no excluido: entra al promedio y lleva ✓. */
  cuentaParaPromedio: boolean;
}

export interface FilaCategoriaAnual {
  categoria: CategoriaCalc;
  /** Doce montos, de enero a diciembre. */
  porMes: number[];
  total: number;
  promedio: number | null;
  /** Fracción del gasto del año (0–1); solo categorías de gasto. */
  porcentajeGasto: number | null;
}

export interface ResumenAnual {
  anio: number;
  meses: EstadoMesAnual[];
  totales: TotalesMes;
  promedios: { ingresos: number | null; gastos: number | null; diferencia: number | null; traidoNeto: number | null };
  mesesPromedio: Mes[];
  descripcionPromedio: string;
  filas: FilaCategoriaAnual[];
}

export function calcularResumenAnual(datos: DatosCalculo, anio: number): ResumenAnual {
  const { movimientos, excluidos } = datos;
  const categorias = ordenar(datos.categorias);
  const calendario = calcularCalendario(movimientos.map((m) => m.fecha));
  const sumas = new SumasPorMes(movimientos);
  const lista = mesesDelAnio(anio);
  const mesesPromedio = mesesDelPromedio(calendario, excluidos, { tipo: 'anio', anio });
  const cuentan = new Set(mesesPromedio);

  const totalesPorMes = new Map(lista.map((m) => [m, totalesDeUnMes(categorias, sumas, m)]));
  const delMes = (m: Mes) => totalesPorMes.get(m) as TotalesMes;

  const meses: EstadoMesAnual[] = lista.map((mes) => ({
    mes,
    ...delMes(mes),
    completo: esMesCompleto(calendario, mes),
    excluido: excluidos.has(mes),
    cuentaParaPromedio: cuentan.has(mes),
  }));

  const sumar = (campo: keyof TotalesMes) => meses.reduce((suma, m) => suma + m[campo], 0);
  const totales: TotalesMes = {
    ingresos: sumar('ingresos'),
    gastos: sumar('gastos'),
    diferencia: sumar('diferencia'),
    traidoNeto: sumar('traidoNeto'),
  };
  const promediar = (campo: keyof TotalesMes) => promedioMensual((m) => delMes(m)[campo], mesesPromedio);

  const filas: FilaCategoriaAnual[] = categorias.map((categoria) => {
    const porMes = lista.map((m) => sumas.de(categoria.id, m));
    const total = porMes.reduce((a, b) => a + b, 0);
    return {
      categoria,
      porMes,
      total,
      promedio: promedioMensual((m) => sumas.de(categoria.id, m), mesesPromedio),
      porcentajeGasto: categoria.tipo === 'Gasto' && totales.gastos !== 0 ? total / totales.gastos : null,
    };
  });

  return {
    anio,
    meses,
    totales,
    promedios: {
      ingresos: promediar('ingresos'),
      gastos: promediar('gastos'),
      diferencia: promediar('diferencia'),
      traidoNeto: promediar('traidoNeto'),
    },
    mesesPromedio,
    descripcionPromedio: describirPromedio(mesesPromedio),
    filas,
  };
}

/**
 * Series para el gráfico de tendencia: siempre todas las categorías de gasto,
 * de forma dinámica (falla 2 del Excel), ordenadas de mayor a menor gasto anual.
 * El gráfico parte mostrando las primeras seis.
 */
export function tendenciaDeGasto(resumen: ResumenAnual): FilaCategoriaAnual[] {
  return resumen.filas
    .filter((f) => f.categoria.tipo === 'Gasto')
    .sort((a, b) => b.total - a.total || a.categoria.orden - b.categoria.orden);
}

/**
 * Los doce valores de una línea de tendencia. Fuera del período con datos van
 * como null, para que la línea se corte en vez de caer a cero.
 */
export function serieConHuecos(porMes: readonly number[], anio: number, calendario: Calendario | null): (number | null)[] {
  return mesesDelAnio(anio).map((mes, i) => {
    if (!calendario || mes < mesDeFecha(calendario.primeraFecha) || mes > mesDeFecha(calendario.ultimaFecha)) return null;
    return porMes[i] ?? 0;
  });
}

/** Intensidad de 0 a 1 para el heatmap. La raíz evita que un monto enorme apague a todos los demás. */
export function intensidadHeatmap(valor: number, maximo: number): number {
  if (maximo <= 0 || valor <= 0) return 0;
  return Math.min(1, Math.sqrt(valor / maximo));
}

export const MAXIMO_SERIES = 8;

/** Categoría y color elegidos para el gráfico. El color sigue a la categoría, no a su posición. */
export interface SerieElegida {
  categoriaId: number;
  /** De 0 a MAXIMO_SERIES - 1. */
  color: number;
}

export function seriesIniciales(ids: readonly number[], cantidad = 6): SerieElegida[] {
  return ids.slice(0, Math.min(cantidad, MAXIMO_SERIES)).map((categoriaId, color) => ({ categoriaId, color }));
}

/** Agrega o quita una serie. Las demás conservan su color; no se pasa del máximo. */
export function alternarSerie(series: readonly SerieElegida[], categoriaId: number): SerieElegida[] {
  if (series.some((s) => s.categoriaId === categoriaId)) return series.filter((s) => s.categoriaId !== categoriaId);
  if (series.length >= MAXIMO_SERIES) return [...series];
  const usados = new Set(series.map((s) => s.color));
  let color = 0;
  while (usados.has(color)) color++;
  return [...series, { categoriaId, color }];
}
