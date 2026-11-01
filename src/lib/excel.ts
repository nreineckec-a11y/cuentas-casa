import type ExcelJS from 'exceljs';
import { movimientosVigentes, ordenadas, type Base } from './base';
import { formatearFecha } from './formato';
import { compararPorFechaDesc, notaParaExcel } from './movimientos';

/** Lectura y escritura del Excel. Recibe el libro ya creado: el navegador y los tests cargan ExcelJS distinto. */

export class ErrorDeImportacion extends Error {}

export interface FilaCategoria {
  fila: number;
  nombre: string;
  tipo: string;
  presupuesto: unknown;
  queIncluye: string;
  /** Solo en los archivos que exporta la app; el Excel original no la trae. */
  funcion?: string;
}

export interface FilaMovimiento {
  fila: number;
  fecha: unknown;
  descripcion: unknown;
  categoria: unknown;
  monto: unknown;
  cuenta: unknown;
  nota: unknown;
}

export interface LibroLeido {
  categorias: FilaCategoria[];
  cuentas: string[];
  movimientos: FilaMovimiento[];
  notasConciliacion: string | null;
}

const FILA_ENCABEZADOS_MOVIMIENTOS = 4;
const FILA_ENCABEZADOS_CATEGORIAS = 5;
const ULTIMA_FILA_CUENTAS = 20;
const CELDA_NOTAS = 'B37';
const CELDA_TITULO_NOTAS = 'B36';
/** Columna G de Categorías en lo que exporta la app. */
const COLUMNA_FUNCION = 7;
const ENCABEZADO_FUNCION = 'Función (no cambiar)';

const AMARILLO_REVISAR = 'FFFFF2CC';
const FILAS_CON_LISTAS = 5000;
/** El Excel original reserva hasta la fila 80 para categorías. */
const ULTIMA_FILA_CATEGORIAS = 80;

/** Saca el valor de una celda: ExcelJS entrega objetos para fórmulas y texto enriquecido. */
function valorDe(celda: ExcelJS.Cell): unknown {
  const valor = celda.value as unknown;
  if (valor === null || valor === undefined || valor instanceof Date || typeof valor !== 'object') {
    return valor === undefined ? null : valor;
  }
  const objeto = valor as { result?: unknown; richText?: { text: string }[]; text?: unknown; error?: unknown };
  if ('error' in objeto) return null;
  if ('result' in objeto) return objeto.result ?? null;
  if (objeto.richText) return objeto.richText.map((parte) => parte.text).join('');
  if ('text' in objeto) return objeto.text ?? null;
  return null;
}

function texto(valor: unknown): string {
  if (valor === null || valor === undefined) return '';
  return String(valor).trim();
}

function estaVacio(valor: unknown): boolean {
  return valor === null || valor === undefined || (typeof valor === 'string' && valor.trim() === '');
}

function hoja(libro: ExcelJS.Workbook, nombre: string): ExcelJS.Worksheet | undefined {
  const buscado = nombre.normalize('NFC').toLowerCase();
  return libro.worksheets.find((h) => h.name.normalize('NFC').toLowerCase() === buscado);
}

function hojaObligatoria(libro: ExcelJS.Workbook, nombre: string): ExcelJS.Worksheet {
  const encontrada = hoja(libro, nombre);
  if (!encontrada) throw new ErrorDeImportacion(`El archivo no tiene la hoja "${nombre}".`);
  return encontrada;
}

function exigirEncabezado(h: ExcelJS.Worksheet, celda: string, esperado: string): void {
  const actual = texto(valorDe(h.getCell(celda)));
  if (actual.toLowerCase() !== esperado.toLowerCase()) {
    throw new ErrorDeImportacion(
      `La hoja "${h.name}" no tiene la estructura esperada: en ${celda} debería decir "${esperado}" y dice "${actual}".`,
    );
  }
}

/** Entrega las filas sin validar; validar le toca a la importación. */
export function extraerFilas(libro: ExcelJS.Workbook): LibroLeido {
  const hojaMovimientos = hojaObligatoria(libro, 'Movimientos');
  const hojaCategorias = hojaObligatoria(libro, 'Categorías');

  const encabezadosMovimientos = ['Fecha', 'Descripción', 'Categoría', 'Monto', 'Cuenta / medio de pago', 'Nota'];
  encabezadosMovimientos.forEach((nombre, i) => {
    exigirEncabezado(hojaMovimientos, `${String.fromCharCode(65 + i)}${FILA_ENCABEZADOS_MOVIMIENTOS}`, nombre);
  });
  exigirEncabezado(hojaCategorias, `A${FILA_ENCABEZADOS_CATEGORIAS}`, 'Categoría');
  exigirEncabezado(hojaCategorias, `B${FILA_ENCABEZADOS_CATEGORIAS}`, 'Tipo');
  exigirEncabezado(hojaCategorias, `F${FILA_ENCABEZADOS_CATEGORIAS}`, 'Cuentas y medios de pago');

  const conFuncion = texto(valorDe(hojaCategorias.getCell(FILA_ENCABEZADOS_CATEGORIAS, COLUMNA_FUNCION))) === ENCABEZADO_FUNCION;
  const categorias: FilaCategoria[] = [];
  for (let fila = FILA_ENCABEZADOS_CATEGORIAS + 1; fila <= hojaCategorias.rowCount; fila++) {
    const nombre = texto(valorDe(hojaCategorias.getCell(fila, 1)));
    if (!nombre) continue;
    categorias.push({
      fila,
      nombre,
      tipo: texto(valorDe(hojaCategorias.getCell(fila, 2))),
      presupuesto: valorDe(hojaCategorias.getCell(fila, 3)),
      queIncluye: texto(valorDe(hojaCategorias.getCell(fila, 4))),
      funcion: conFuncion ? texto(valorDe(hojaCategorias.getCell(fila, COLUMNA_FUNCION))) : undefined,
    });
  }

  const cuentas: string[] = [];
  for (let fila = FILA_ENCABEZADOS_CATEGORIAS + 1; fila <= Math.max(ULTIMA_FILA_CUENTAS, hojaCategorias.rowCount); fila++) {
    const nombre = texto(valorDe(hojaCategorias.getCell(fila, 6)));
    if (nombre) cuentas.push(nombre);
  }

  // Se recorre toda la hoja y no solo hasta la última fecha: una fila con datos pero
  // sin fecha tiene que salir en el reporte, no perderse. La columna G (Tipo) se deriva.
  const movimientos: FilaMovimiento[] = [];
  for (let fila = FILA_ENCABEZADOS_MOVIMIENTOS + 1; fila <= hojaMovimientos.rowCount; fila++) {
    const [fecha, descripcion, categoria, monto, cuenta, nota] = [1, 2, 3, 4, 5, 6].map((columna) =>
      valorDe(hojaMovimientos.getCell(fila, columna)),
    );
    if ([fecha, descripcion, categoria, monto, cuenta, nota].every(estaVacio)) continue;
    movimientos.push({ fila, fecha, descripcion, categoria, monto, cuenta, nota });
  }

  let notasConciliacion: string | null = null;
  const hojaComoUsar = hoja(libro, 'Cómo usar');
  if (hojaComoUsar && texto(valorDe(hojaComoUsar.getCell(CELDA_TITULO_NOTAS))).toLowerCase() === 'datos cargados') {
    notasConciliacion = texto(valorDe(hojaComoUsar.getCell(CELDA_NOTAS))) || null;
  }

  return { categorias, cuentas, movimientos, notasConciliacion };
}

/** Excel guarda las fechas sin zona horaria; ExcelJS las escribe desde UTC. */
function fechaParaExcel(fecha: string): Date {
  return new Date(`${fecha}T00:00:00.000Z`);
}

function titulo(celda: ExcelJS.Cell, valor: string): void {
  celda.value = valor;
  celda.font = { bold: true, size: 16 };
}

function encabezados(fila: ExcelJS.Row): void {
  fila.font = { bold: true };
  fila.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE7E6E6' } };
}

/**
 * Llena un libro vacío con la misma estructura de las hojas Movimientos y Categorías
 * del Excel original, para poder volver a él. Los resúmenes (Mes, Resumen anual) no van.
 */
export function construirLibro(base: Base, libro: ExcelJS.Workbook): ExcelJS.Workbook {
  const categorias = ordenadas(base.categorias);
  const cuentas = ordenadas(base.cuentas);
  const nombreCategoria = new Map(categorias.map((c) => [c.id, c]));
  const nombreCuenta = new Map(cuentas.map((c) => [c.id, c.nombre]));
  const filas = movimientosVigentes(base).sort(compararPorFechaDesc);
  const ultimaCategoria = Math.max(ULTIMA_FILA_CATEGORIAS, 5 + categorias.length);

  // ---- Cómo usar: solo las notas, donde el Excel original las tiene.
  const comoUsar = libro.addWorksheet('Cómo usar');
  titulo(comoUsar.getCell('A1'), 'Control de ingresos y gastos');
  comoUsar.getCell('A2').value = 'Exportado desde la app Cuentas de la casa.';
  comoUsar.getCell('B36').value = 'Datos cargados';
  comoUsar.getCell('B36').font = { bold: true };
  comoUsar.getCell('B37').value = base.notasConciliacion;
  comoUsar.getCell('B37').alignment = { wrapText: true, vertical: 'top' };
  comoUsar.getColumn(2).width = 100;

  // ---- Movimientos: encabezados en la fila 4, datos desde la 5.
  const hojaMovimientos = libro.addWorksheet('Movimientos');
  titulo(hojaMovimientos.getCell('A1'), 'Movimientos');
  hojaMovimientos.getCell('A2').value =
    'Para agregar un ingreso o gasto: escribir en la primera fila vacía al final de la lista. La categoría se elige de la lista y el monto va siempre en positivo.';
  hojaMovimientos.getCell('A3').value = 'Filas amarillas: por revisar (ver Nota).';
  hojaMovimientos.getRow(4).values = ['Fecha', 'Descripción', 'Categoría', 'Monto', 'Cuenta / medio de pago', 'Nota', 'Tipo'];
  encabezados(hojaMovimientos.getRow(4));
  filas.forEach((m, i) => {
    const numero = 5 + i;
    const fila = hojaMovimientos.getRow(numero);
    const categoria = nombreCategoria.get(m.categoriaId);
    fila.getCell(1).value = fechaParaExcel(m.fecha);
    fila.getCell(2).value = m.descripcion;
    fila.getCell(3).value = categoria?.nombre ?? '';
    fila.getCell(4).value = m.monto;
    fila.getCell(5).value = nombreCuenta.get(m.cuentaId) ?? '';
    fila.getCell(6).value = notaParaExcel(m.nota, m.porRevisar);
    fila.getCell(7).value = {
      formula: `IF(C${numero}="","",IFERROR(INDEX(Categorías!$B$6:$B$${ultimaCategoria},MATCH(C${numero},Categorías!$A$6:$A$${ultimaCategoria},0)),"¿?"))`,
      result: categoria?.tipo ?? '¿?',
    };
  });
  hojaMovimientos.getColumn(1).numFmt = 'dd-mm-yyyy';
  hojaMovimientos.getColumn(4).numFmt = '"$"#,##0';
  [12, 45, 42, 14, 24, 60, 10].forEach((ancho, i) => {
    hojaMovimientos.getColumn(i + 1).width = ancho;
  });
  hojaMovimientos.views = [{ state: 'frozen', ySplit: 4 }];
  hojaMovimientos.autoFilter = { from: 'A4', to: `G${Math.max(5, 4 + filas.length)}` };
  hojaMovimientos.addConditionalFormatting({
    ref: `A5:G${FILAS_CON_LISTAS}`,
    rules: [
      {
        type: 'expression',
        priority: 1,
        formulae: ['LEFT($F5,7)="Revisar"'],
        style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: AMARILLO_REVISAR } } },
      },
    ],
  });

  // ---- Categorías: encabezados en la fila 5, datos desde la 6; cuentas en la columna F.
  const hojaCategorias = libro.addWorksheet('Categorías');
  titulo(hojaCategorias.getCell('A1'), 'Categorías');
  hojaCategorias.getCell('A3').value =
    'Tipo: Ingreso = plata que entra · Gasto = plata que sale · Traspaso = entre cuentas propias (no se suma).';
  const encabezado = hojaCategorias.getRow(5);
  encabezado.getCell(1).value = 'Categoría';
  encabezado.getCell(2).value = 'Tipo';
  encabezado.getCell(3).value = 'Presupuesto mensual';
  encabezado.getCell(4).value = 'Qué incluye';
  encabezado.getCell(6).value = 'Cuentas y medios de pago';
  // Columna extra respecto del original: sin ella, una categoría especial renombrada
  // perdería su función al importar este archivo en otro dispositivo.
  encabezado.getCell(COLUMNA_FUNCION).value = ENCABEZADO_FUNCION;
  encabezados(encabezado);
  categorias.forEach((c, i) => {
    const fila = hojaCategorias.getRow(6 + i);
    fila.getCell(1).value = c.nombre;
    fila.getCell(2).value = c.tipo;
    if (c.presupuestoMensual !== null) fila.getCell(3).value = c.presupuestoMensual;
    fila.getCell(4).value = c.queIncluye;
    if (c.rol) fila.getCell(COLUMNA_FUNCION).value = c.rol;
  });
  cuentas.forEach((c, i) => {
    hojaCategorias.getRow(6 + i).getCell(6).value = c.nombre;
  });
  hojaCategorias.getColumn(3).numFmt = '"$"#,##0';
  [42, 10, 20, 70, 3, 26, 20].forEach((ancho, i) => {
    hojaCategorias.getColumn(i + 1).width = ancho;
  });

  // ---- Listas para elegir categoría y cuenta, como en el original.
  libro.definedNames.add(`Categorías!$A$6:$A$${Math.max(6, 5 + categorias.length)}`, 'ListaCategorias');
  libro.definedNames.add(`Categorías!$F$6:$F$${Math.max(6, 5 + cuentas.length)}`, 'ListaMedios');
  // Los tipos de ExcelJS no declaran esta propiedad, aunque existe.
  const { dataValidations: validaciones } = hojaMovimientos as unknown as {
    dataValidations: { add: (rango: string, validacion: ExcelJS.DataValidation) => void };
  };
  validaciones.add(`C5:C${FILAS_CON_LISTAS}`, { type: 'list', allowBlank: true, formulae: ['ListaCategorias'] });
  validaciones.add(`E5:E${FILAS_CON_LISTAS}`, { type: 'list', allowBlank: true, formulae: ['ListaMedios'] });

  return libro;
}

/**
 * Evita que Excel ejecute como fórmula un texto de la cartola que empiece con
 * = + - @. Con comillas y comillas dobles escapadas si hace falta.
 */
function celdaCsv(valor: string): string {
  const seguro = /^[=+\-@\t\r]/.test(valor) ? `'${valor}` : valor;
  return /[";\n\r]/.test(seguro) ? `"${seguro.replace(/"/g, '""')}"` : seguro;
}

/** CSV para Excel en español: separado por punto y coma y con BOM, para que respete las tildes. */
export function generarCsv(base: Base): string {
  const categoria = new Map(base.categorias.map((c) => [c.id, c]));
  const cuenta = new Map(base.cuentas.map((c) => [c.id, c.nombre]));
  const encabezado = ['Fecha', 'Descripción', 'Categoría', 'Tipo', 'Monto', 'Cuenta', 'Nota', 'Por revisar'];
  const filas = movimientosVigentes(base)
    .sort(compararPorFechaDesc)
    .map((m) =>
      [
        formatearFecha(m.fecha),
        celdaCsv(m.descripcion),
        celdaCsv(categoria.get(m.categoriaId)?.nombre ?? ''),
        categoria.get(m.categoriaId)?.tipo ?? '',
        String(m.monto),
        celdaCsv(cuenta.get(m.cuentaId) ?? ''),
        celdaCsv(m.nota),
        m.porRevisar ? 'Sí' : 'No',
      ].join(';'),
    );
  return `﻿${[encabezado.join(';'), ...filas].join('\r\n')}\r\n`;
}
