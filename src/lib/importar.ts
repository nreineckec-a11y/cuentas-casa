import { type Base, type CategoriaGuardada, type CuentaGuardada, type MovimientoGuardado } from './base';
import type { Rol, Tipo } from './calculos';
import { type FilaMovimiento, type LibroLeido } from './excel';
import { normalizarNombre as normalizar } from './formato';
import type { FilaSuperposicion, ReporteImportacion } from './tipos';

const TIPOS: readonly string[] = ['Ingreso', 'Gasto', 'Traspaso'];
const ROLES: readonly Rol[] = ['traspaso_desde', 'traspaso_hacia', 'pago_tarjetas', 'giros_efectivo'];

const ROL_POR_NOMBRE: Record<string, Rol> = {
  'traspaso desde otra cuenta propia': 'traspaso_desde',
  'traspaso hacia otra cuenta propia': 'traspaso_hacia',
  'pago de tarjetas de crédito': 'pago_tarjetas',
  'giros de efectivo': 'giros_efectivo',
};

/** Fallas conocidas del Excel que se corrigen una sola vez, en la primera importación que las trae. */
const EXCLUSIONES_INICIALES = [{ anio: 2026, mes: 2, motivo: 'Mes incompleto: faltan cartolas de una de las cuentas.' }];

/** Categorías que se superponen, para informar sin fusionar nada. */
const SUPERPOSICIONES = [
  ['Cuentas de la casa (luz, agua, gas, internet)', 'Agua', 'Luz', 'Gas', 'Internet'],
  ['Estacionamientos y TAG', 'TAG'],
];

export function esPorRevisar(nota: string): boolean {
  return nota.trimStart().toLocaleLowerCase('es').startsWith('revisar');
}

/** Convierte la celda a 'YYYY-MM-DD'. Un texto no vale: el Excel tampoco lo suma como fecha. */
function fechaValida(valor: unknown): string | null {
  let fecha: Date | null = null;
  if (valor instanceof Date) fecha = valor;
  else if (typeof valor === 'number' && Number.isFinite(valor)) {
    fecha = new Date(Date.UTC(1899, 11, 30) + Math.floor(valor) * 86_400_000);
  }
  if (!fecha || Number.isNaN(fecha.getTime())) return null;
  const anio = fecha.getUTCFullYear();
  if (anio < 2000 || anio > 2100) return null;
  return fecha.toISOString().slice(0, 10);
}

function contar(registro: Record<string, number>, clave: string): void {
  registro[clave] = (registro[clave] ?? 0) + 1;
}

interface Validada {
  fecha: string;
  descripcion: string;
  monto: number;
  categoriaId: number;
  cuentaId: number;
  nota: string;
  claveBase: string;
}

function validarMovimiento(
  fila: FilaMovimiento,
  idsCategorias: Map<string, number>,
  idsCuentas: Map<string, number>,
  reporte: ReporteImportacion,
): Validada | null {
  const motivos: string[] = [];

  const fecha = fechaValida(fila.fecha);
  if (!fecha) {
    motivos.push(fila.fecha === null ? 'Sin fecha' : `Fecha inválida: "${String(fila.fecha)}"`);
    reporte.fechasInvalidas++;
  }

  const monto = fila.monto;
  if (typeof monto !== 'number' || !Number.isInteger(monto) || monto <= 0) {
    motivos.push(`Monto inválido (debe ser un entero mayor que cero): "${String(monto)}"`);
    reporte.montosInvalidos++;
  }

  const nombreCategoria = fila.categoria === null ? '' : String(fila.categoria).trim();
  const categoriaId = idsCategorias.get(normalizar(nombreCategoria));
  if (!nombreCategoria) motivos.push('Sin categoría');
  else if (categoriaId === undefined) {
    motivos.push(`Categoría no reconocida: "${nombreCategoria}"`);
    contar(reporte.categoriasNoReconocidas, nombreCategoria);
  }

  const nombreCuenta = fila.cuenta === null ? '' : String(fila.cuenta).trim();
  const cuentaId = idsCuentas.get(normalizar(nombreCuenta));
  if (!nombreCuenta) motivos.push('Sin cuenta');
  else if (cuentaId === undefined) {
    motivos.push(`Cuenta no reconocida: "${nombreCuenta}"`);
    contar(reporte.cuentasNoReconocidas, nombreCuenta);
  }

  if (motivos.length > 0) {
    reporte.omitidas.push({ fila: fila.fila, motivos });
    return null;
  }

  const descripcion = fila.descripcion === null ? '' : String(fila.descripcion).trim();
  return {
    fecha: fecha as string,
    descripcion,
    monto: monto as number,
    categoriaId: categoriaId as number,
    cuentaId: cuentaId as number,
    nota: fila.nota === null ? '' : String(fila.nota).trim(),
    claveBase: [fecha, descripcion, monto, normalizar(nombreCuenta)].join('|'),
  };
}

function reporteVacio(libro: LibroLeido, simulacion: boolean): ReporteImportacion {
  return {
    simulacion,
    filasConDatos: libro.movimientos.length,
    importadas: 0,
    yaExistian: 0,
    borradasEnLaApp: 0,
    omitidas: [],
    categoriasCreadas: 0,
    categoriasExistentes: 0,
    categoriasInvalidas: [],
    cuentasCreadas: 0,
    cuentasExistentes: 0,
    categoriasNoReconocidas: {},
    cuentasNoReconocidas: {},
    montosInvalidos: 0,
    fechasInvalidas: 0,
    movimientosIdenticos: 0,
    porRevisarImportados: 0,
    notasQueMencionanRevisar: 0,
    notasConciliacion: 'no_encontradas',
    mesesExcluidosAhora: [],
    superposiciones: [],
  };
}

/**
 * Importa un libro ya leído y entrega la base nueva con su reporte. Es idempotente:
 * reimportar no duplica ni pisa lo editado en la app, ni revive lo que se borró.
 * Para la vista previa basta con mostrar el reporte y no guardar la base.
 */
export function importarLibro(
  base: Base,
  libro: LibroLeido,
  opciones: { simular?: boolean; ahora?: string } = {},
): { base: Base; reporte: ReporteImportacion } {
  const reporte = reporteVacio(libro, opciones.simular ?? false);
  const ahora = opciones.ahora ?? new Date().toISOString();
  let siguienteId = base.siguienteId;

  // ---- Categorías: lo editado en la app no se pisa; solo se recuerda el nombre del Excel.
  const categorias: CategoriaGuardada[] = base.categorias.map((c) => ({ ...c }));
  const idsCategorias = new Map<string, number>();
  for (const c of categorias) {
    idsCategorias.set(normalizar(c.nombre), c.id);
    if (c.nombreExcel) idsCategorias.set(normalizar(c.nombreExcel), c.id);
  }
  // Una categoría fusionada no se recrea: su nombre apunta a la de destino.
  const fusionadas = new Set<string>();
  for (const [nombre, id] of Object.entries(base.alias)) {
    if (!idsCategorias.has(nombre)) {
      idsCategorias.set(nombre, id);
      fusionadas.add(nombre);
    }
  }
  let ordenCategoria = categorias.reduce((maximo, c) => Math.max(maximo, c.orden), 0);

  for (const fila of libro.categorias) {
    const clave = normalizar(fila.nombre);
    const idExistente = idsCategorias.get(clave);
    if (fusionadas.has(clave)) {
      reporte.categoriasExistentes++;
      continue;
    }
    if (idExistente !== undefined) {
      const existente = categorias.find((c) => c.id === idExistente);
      if (existente) existente.nombreExcel ??= fila.nombre;
      reporte.categoriasExistentes++;
      continue;
    }
    if (!TIPOS.includes(fila.tipo)) {
      reporte.categoriasInvalidas.push({ fila: fila.fila, motivos: [`Tipo no válido: "${fila.tipo}" (${fila.nombre})`] });
      continue;
    }
    const { presupuesto } = fila;
    const presupuestoValido = typeof presupuesto === 'number' && Number.isInteger(presupuesto) && presupuesto >= 0 ? presupuesto : null;
    if (presupuesto !== null && presupuesto !== '' && presupuestoValido === null) {
      reporte.categoriasInvalidas.push({ fila: fila.fila, motivos: [`Presupuesto no válido, se dejó vacío (${fila.nombre})`] });
    }
    const id = siguienteId++;
    categorias.push({
      id,
      nombre: fila.nombre,
      tipo: fila.tipo as Tipo,
      presupuestoMensual: presupuestoValido,
      queIncluye: fila.queIncluye,
      orden: ++ordenCategoria,
      activa: true,
      rol: ROLES.find((rol) => rol === fila.funcion) ?? ROL_POR_NOMBRE[clave] ?? null,
      nombreExcel: fila.nombre,
    });
    idsCategorias.set(clave, id);
    reporte.categoriasCreadas++;
  }

  // ---- Cuentas
  const cuentas: CuentaGuardada[] = base.cuentas.map((c) => ({ ...c }));
  const idsCuentas = new Map<string, number>();
  for (const c of cuentas) {
    idsCuentas.set(normalizar(c.nombre), c.id);
    if (c.nombreExcel) idsCuentas.set(normalizar(c.nombreExcel), c.id);
  }
  let ordenCuenta = cuentas.reduce((maximo, c) => Math.max(maximo, c.orden), 0);
  for (const nombre of libro.cuentas) {
    const clave = normalizar(nombre);
    const idExistente = idsCuentas.get(clave);
    if (idExistente !== undefined) {
      const existente = cuentas.find((c) => c.id === idExistente);
      if (existente) existente.nombreExcel ??= nombre;
      reporte.cuentasExistentes++;
      continue;
    }
    const id = siguienteId++;
    cuentas.push({ id, nombre, orden: ++ordenCuenta, activa: true, nombreExcel: nombre });
    idsCuentas.set(clave, id);
    reporte.cuentasCreadas++;
  }

  // ---- Movimientos
  const validas = libro.movimientos
    .map((fila) => validarMovimiento(fila, idsCategorias, idsCuentas, reporte))
    .filter((v): v is Validada => v !== null);

  // La ocurrencia distingue movimientos legítimamente idénticos.
  const ocurrencias = new Map<string, number>();
  const conClave = validas.map((v) => {
    const ocurrencia = (ocurrencias.get(v.claveBase) ?? 0) + 1;
    ocurrencias.set(v.claveBase, ocurrencia);
    if (ocurrencia > 1) reporte.movimientosIdenticos++;
    return { ...v, claveImport: `${v.claveBase}|${ocurrencia}` };
  });

  const existentes = new Map(base.movimientos.filter((m) => m.claveImport).map((m) => [m.claveImport as string, m.borradoEn]));

  // Lo anotado a mano no tiene clave, y lo editado cambió de contenido. Para que importar
  // una exportación de la propia app no los duplique, también se compara por contenido.
  const clavesDelArchivo = new Set(conClave.map((v) => v.claveImport));
  const claveDeContenido = (fecha: string, descripcion: string, monto: number, cuentaId: number) =>
    [fecha, normalizar(descripcion), monto, cuentaId].join('|');
  const sinCoincidir = new Map<string, number>();
  for (const m of base.movimientos) {
    if (m.borradoEn !== null || (m.claveImport && clavesDelArchivo.has(m.claveImport))) continue;
    const clave = claveDeContenido(m.fecha, m.descripcion, m.monto, m.cuentaId);
    sinCoincidir.set(clave, (sinCoincidir.get(clave) ?? 0) + 1);
  }

  const movimientos: MovimientoGuardado[] = [...base.movimientos];
  // La hoja va de más nuevo a más antiguo; al revés, los id crecen con la fecha.
  for (const v of [...conClave].reverse()) {
    const porRevisar = esPorRevisar(v.nota);
    if (!porRevisar && /revisar/i.test(v.nota)) reporte.notasQueMencionanRevisar++;
    if (existentes.has(v.claveImport)) {
      if (existentes.get(v.claveImport)) reporte.borradasEnLaApp++;
      else reporte.yaExistian++;
      continue;
    }
    const clave = claveDeContenido(v.fecha, v.descripcion, v.monto, v.cuentaId);
    const libres = sinCoincidir.get(clave) ?? 0;
    if (libres > 0) {
      sinCoincidir.set(clave, libres - 1);
      reporte.yaExistian++;
      continue;
    }
    movimientos.push({
      id: siguienteId++,
      fecha: v.fecha,
      descripcion: v.descripcion,
      categoriaId: v.categoriaId,
      monto: v.monto,
      cuentaId: v.cuentaId,
      nota: v.nota,
      porRevisar,
      origen: 'importado',
      claveImport: v.claveImport,
      creadoEn: ahora,
      editadoEn: null,
      borradoEn: null,
    });
    reporte.importadas++;
    if (porRevisar) reporte.porRevisarImportados++;
  }

  // ---- Notas de conciliación: las editadas en la app no se pisan.
  let notasConciliacion = base.notasConciliacion;
  if (libro.notasConciliacion === null) reporte.notasConciliacion = 'no_encontradas';
  else if (notasConciliacion === '') {
    notasConciliacion = libro.notasConciliacion;
    reporte.notasConciliacion = 'importadas';
  } else {
    reporte.notasConciliacion = notasConciliacion === libro.notasConciliacion ? 'sin_cambios' : 'distintas_se_conservan_las_de_la_app';
  }

  // ---- Exclusiones iniciales: una sola vez; si después se incluye el mes, no se repite.
  const excluidos = [...base.excluidos];
  const exclusionesAplicadas = [...base.exclusionesAplicadas];
  for (const exclusion of EXCLUSIONES_INICIALES) {
    const clave = `${exclusion.anio}-${String(exclusion.mes).padStart(2, '0')}`;
    if (exclusionesAplicadas.includes(clave)) continue;
    if (!movimientos.some((m) => m.fecha.startsWith(clave))) continue;
    if (!excluidos.some((m) => m.anio === exclusion.anio && m.mes === exclusion.mes)) excluidos.push(exclusion);
    exclusionesAplicadas.push(clave);
    reporte.mesesExcluidosAhora.push(exclusion);
  }

  // ---- Superposiciones: solo se informan.
  reporte.superposiciones = SUPERPOSICIONES.map((grupo) =>
    grupo.map((nombre): FilaSuperposicion => {
      const categoria = categorias.find((c) => c.nombreExcel === nombre);
      const propios = categoria ? movimientos.filter((m) => m.categoriaId === categoria.id && m.borradoEn === null) : [];
      const fechas = propios.map((m) => m.fecha).sort();
      return {
        nombre,
        movimientos: propios.length,
        monto: propios.reduce((suma, m) => suma + m.monto, 0),
        desde: fechas[0] ?? null,
        hasta: fechas[fechas.length - 1] ?? null,
      };
    }),
  );

  return {
    base: { ...base, siguienteId, categorias, cuentas, movimientos, notasConciliacion, excluidos, exclusionesAplicadas },
    reporte,
  };
}
