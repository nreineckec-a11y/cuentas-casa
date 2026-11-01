import ExcelJS from 'exceljs';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  baseVacia,
  borrarMovimientos,
  crearMovimiento,
  editarCategoria,
  editarMovimiento,
  guardarNotas,
  incluirMes,
  mesesExcluidos,
  movimientosVigentes,
  ordenadas,
  type Base,
} from '../src/lib/base';
import { calcularResumenAnual } from '../src/lib/calculos';
import { construirLibro, ErrorDeImportacion, extraerFilas, generarCsv, type LibroLeido } from '../src/lib/excel';
import { esPorRevisar, importarLibro } from '../src/lib/importar';
import { notaParaExcel } from '../src/lib/movimientos';

// Todos los datos son inventados: el libro se genera en cada test.
type Fila = [unknown, unknown, unknown, unknown, unknown, unknown?];

const fecha = (texto: string) => new Date(`${texto}T00:00:00.000Z`);
const NOTAS = 'Texto de conciliación de prueba.';

const FILAS_BASE: Fila[] = [
  [fecha('2026-03-20'), 'SUPER UNO', 'Comida', 1000, 'Banco'],
  [fecha('2026-03-13'), 'TRASPASO A', 'Traspaso hacia otra cuenta propia', 30000, 'Banco'],
  [fecha('2026-03-13'), 'TRASPASO A', 'Traspaso hacia otra cuenta propia', 30000, 'Banco', 'agregado después'],
  [fecha('2026-02-10'), 'COMERCIO X', 'Comida', 2000, 'Banco', 'Revisar: comercio no identificado'],
  [fecha('2026-02-05'), 'SUELDO', 'Sueldo', 50000, 'Banco', 'operación 1; revisar origen'],
];

function crearLibro(filas: Fila[] = FILAS_BASE, notas: string | null = NOTAS): ExcelJS.Workbook {
  const libro = new ExcelJS.Workbook();

  const comoUsar = libro.addWorksheet('Cómo usar');
  comoUsar.getCell('B36').value = 'Datos cargados';
  if (notas !== null) comoUsar.getCell('B37').value = notas;

  const hojaMov = libro.addWorksheet('Movimientos');
  hojaMov.getRow(4).values = ['Fecha', 'Descripción', 'Categoría', 'Monto', 'Cuenta / medio de pago', 'Nota', 'Tipo'];
  filas.forEach((fila, i) => {
    hojaMov.getRow(5 + i).values = fila as ExcelJS.CellValue[];
  });

  const hojaCat = libro.addWorksheet('Categorías');
  hojaCat.getRow(5).values = ['Categoría', 'Tipo', 'Presupuesto mensual', 'Qué incluye', undefined, 'Cuentas y medios de pago'] as ExcelJS.CellValue[];
  const lista = [
    ['Sueldo', 'Ingreso', null, 'Pagos'],
    ['Comida', 'Gasto', 150000, 'Almacén'],
    ['Traspaso desde otra cuenta propia', 'Traspaso', null, ''],
    ['Traspaso hacia otra cuenta propia', 'Traspaso', null, ''],
    ['Giros de efectivo', 'Gasto', null, ''],
  ];
  lista.forEach((fila, i) => {
    hojaCat.getRow(6 + i).values = fila as ExcelJS.CellValue[];
  });
  hojaCat.getCell('F6').value = 'Banco';
  hojaCat.getCell('F7').value = 'Efectivo';
  return libro;
}

/** Pasa el libro por el archivo real, igual que al subirlo desde la pantalla. */
async function leer(libro: ExcelJS.Workbook): Promise<LibroLeido> {
  const copia = new ExcelJS.Workbook();
  await copia.xlsx.load(await libro.xlsx.writeBuffer());
  return extraerFilas(copia);
}

const resumen = (base: Base) =>
  calcularResumenAnual({ categorias: base.categorias, movimientos: movimientosVigentes(base), excluidos: mesesExcluidos(base) }, 2026);

describe('importación', () => {
  let libroBase: LibroLeido;
  beforeEach(async () => {
    libroBase = await leer(crearLibro());
  });

  it('importa categorías en orden, cuentas y movimientos', () => {
    const { base, reporte } = importarLibro(baseVacia(), libroBase);
    expect(reporte.importadas).toBe(5);
    expect(reporte.omitidas).toEqual([]);
    expect(reporte.categoriasCreadas).toBe(5);
    expect(reporte.cuentasCreadas).toBe(2);
    expect(ordenadas(base.categorias).map((c) => c.nombre)).toEqual([
      'Sueldo',
      'Comida',
      'Traspaso desde otra cuenta propia',
      'Traspaso hacia otra cuenta propia',
      'Giros de efectivo',
    ]);
    expect(base.categorias[1]).toMatchObject({ presupuestoMensual: 150000, queIncluye: 'Almacén' });
    expect(base.cuentas.map((c) => c.nombre)).toEqual(['Banco', 'Efectivo']);
  });

  it('reconoce las categorías especiales por su nombre', () => {
    const { base } = importarLibro(baseVacia(), libroBase);
    const rol = (nombre: string) => base.categorias.find((c) => c.nombre === nombre)?.rol;
    expect(rol('Traspaso desde otra cuenta propia')).toBe('traspaso_desde');
    expect(rol('Traspaso hacia otra cuenta propia')).toBe('traspaso_hacia');
    expect(rol('Giros de efectivo')).toBe('giros_efectivo');
    expect(rol('Comida')).toBeNull();
  });

  it('guarda la fecha sin desfase, el origen y las notas de conciliación', () => {
    const { base } = importarLibro(baseVacia(), libroBase);
    const fechas = base.movimientos.map((m) => m.fecha).sort();
    expect(fechas[0]).toBe('2026-02-05');
    expect(fechas[4]).toBe('2026-03-20');
    expect(base.movimientos.every((m) => m.origen === 'importado')).toBe(true);
    expect(base.notasConciliacion).toBe(NOTAS);
  });

  it('marca por revisar solo si la nota empieza con "revisar", sin distinguir mayúsculas', () => {
    const { base, reporte } = importarLibro(baseVacia(), libroBase);
    expect(reporte.porRevisarImportados).toBe(1);
    expect(reporte.notasQueMencionanRevisar).toBe(1);
    const marcados = base.movimientos.filter((m) => m.porRevisar);
    expect(marcados.map((m) => m.descripcion)).toEqual(['COMERCIO X']);
    expect(marcados[0]?.nota).toBe('Revisar: comercio no identificado');
    expect(esPorRevisar('REVISAR algo')).toBe(true);
    expect(esPorRevisar('  revisar algo')).toBe(true);
    expect(esPorRevisar('Cartola 1; revisar algo')).toBe(false);
    expect(esPorRevisar('')).toBe(false);
  });

  it('es idempotente y conserva los movimientos legítimamente idénticos', () => {
    const primera = importarLibro(baseVacia(), libroBase);
    expect(primera.reporte.movimientosIdenticos).toBe(1);
    expect(primera.base.movimientos.filter((m) => m.monto === 30000)).toHaveLength(2);

    const segunda = importarLibro(primera.base, libroBase);
    expect(segunda.reporte).toMatchObject({ importadas: 0, yaExistian: 5, categoriasCreadas: 0, cuentasCreadas: 0 });
    expect(segunda.base.movimientos).toHaveLength(5);
    expect(segunda.base.categorias).toHaveLength(5);
  });

  it('reimportar agrega solo las filas nuevas, también una idéntica más', async () => {
    const { base } = importarLibro(baseVacia(), libroBase);
    const conNuevas = await leer(
      crearLibro([
        [fecha('2026-03-13'), 'TRASPASO A', 'Traspaso hacia otra cuenta propia', 30000, 'Banco'],
        ...FILAS_BASE,
        [fecha('2026-01-10'), 'NUEVA', 'Comida', 7, 'Efectivo'],
      ]),
    );
    const r = importarLibro(base, conNuevas);
    expect(r.reporte).toMatchObject({ importadas: 2, yaExistian: 5 });
    expect(r.base.movimientos.filter((m) => m.monto === 30000)).toHaveLength(3);
  });

  it('reporta y omite las filas inválidas sin perder las buenas', async () => {
    const libro = await leer(
      crearLibro([
        [fecha('2026-03-20'), 'BUENA', 'Comida', 1000, 'Banco'],
        ['no es fecha', 'A', 'Comida', 1000, 'Banco'],
        [null, 'B', 'Comida', 1000, 'Banco'],
        [fecha('2026-03-20'), 'C', 'Comida', -5, 'Banco'],
        [fecha('2026-03-20'), 'D', 'Comida', 0, 'Banco'],
        [fecha('2026-03-20'), 'E', 'Comida', 'mil', 'Banco'],
        [fecha('2026-03-20'), 'F', 'Comida', 10.5, 'Banco'],
        [fecha('2026-03-20'), 'G', 'Inventada', 1000, 'Banco'],
        [fecha('2026-03-20'), 'H', null, 1000, 'Banco'],
        [fecha('2026-03-20'), 'I', 'Comida', 1000, 'Cuenta rara'],
        [fecha('2026-03-20'), 'J', 'Comida', 1000, null],
      ]),
    );
    const { reporte } = importarLibro(baseVacia(), libro);
    expect(reporte.importadas).toBe(1);
    expect(reporte.omitidas).toHaveLength(10);
    expect(reporte.fechasInvalidas).toBe(2);
    expect(reporte.montosInvalidos).toBe(4);
    expect(reporte.categoriasNoReconocidas).toEqual({ Inventada: 1 });
    expect(reporte.cuentasNoReconocidas).toEqual({ 'Cuenta rara': 1 });
    expect(reporte.omitidas[0]?.fila).toBe(6);
    expect(reporte.omitidas[0]?.motivos[0]).toContain('Fecha inválida');
    expect(reporte.omitidas[1]?.motivos).toEqual(['Sin fecha']);
  });

  it('la vista previa avisa que no guardó, y la base anterior queda igual', () => {
    const inicial = baseVacia();
    const { reporte } = importarLibro(inicial, libroBase, { simular: true });
    expect(reporte.simulacion).toBe(true);
    expect(reporte.importadas).toBe(5);
    expect(inicial.movimientos).toHaveLength(0);
    expect(inicial.categorias).toHaveLength(0);
  });

  it('rechaza un archivo con otra estructura', () => {
    const otro = new ExcelJS.Workbook();
    otro.addWorksheet('Movimientos').getCell('A4').value = 'Otra cosa';
    otro.addWorksheet('Categorías');
    expect(() => extraerFilas(otro)).toThrow(ErrorDeImportacion);

    const sinHoja = new ExcelJS.Workbook();
    sinHoja.addWorksheet('Hoja1');
    expect(() => extraerFilas(sinHoja)).toThrow('Movimientos');
  });

  it('febrero de 2026 queda excluido una sola vez', () => {
    const primera = importarLibro(baseVacia(), libroBase);
    expect(primera.reporte.mesesExcluidosAhora).toHaveLength(1);
    expect(primera.base.excluidos[0]).toMatchObject({ anio: 2026, mes: 2 });

    // Si se vuelve a incluir a mano, reimportar no lo excluye de nuevo.
    const segunda = importarLibro(incluirMes(primera.base, 2026, 2), libroBase);
    expect(segunda.reporte.mesesExcluidosAhora).toEqual([]);
    expect(segunda.base.excluidos).toEqual([]);
  });

  it('no excluye febrero si el archivo no trae datos de ese mes', async () => {
    const r = importarLibro(baseVacia(), await leer(crearLibro([[fecha('2026-03-20'), 'A', 'Comida', 10, 'Banco']])));
    expect(r.reporte.mesesExcluidosAhora).toEqual([]);
    expect(r.base.excluidos).toEqual([]);
  });

  it('renombrar una categoría no rompe nada y reimportar no la duplica', () => {
    let { base } = importarLibro(baseVacia(), libroBase);
    const id = (nombre: string) => base.categorias.find((c) => c.nombre === nombre)?.id as number;
    base = editarCategoria(base, id('Traspaso hacia otra cuenta propia'), { nombre: 'Traspaso enviado' });
    base = editarCategoria(base, id('Comida'), { nombre: 'Alimentos' });

    const r = resumen(base);
    expect(r.meses[2]?.traidoNeto).toBe(-60000);
    expect(r.filas.find((f) => f.categoria.nombre === 'Alimentos')?.total).toBe(3000);

    const otra = importarLibro(base, libroBase);
    expect(otra.reporte).toMatchObject({ importadas: 0, categoriasCreadas: 0, categoriasNoReconocidas: {} });
    expect(otra.base.categorias).toHaveLength(5);
  });

  it('reimportar no pisa lo editado en la app', () => {
    let { base } = importarLibro(baseVacia(), libroBase);
    const id = base.movimientos.find((m) => m.descripcion === 'SUPER UNO')?.id as number;
    const comida = base.categorias.find((c) => c.nombre === 'Comida')?.id as number;
    base = editarMovimiento(base, id, { descripcion: 'EDITADA', monto: 999 }).base;
    base = editarCategoria(base, comida, { presupuestoMensual: 1 });
    base = guardarNotas(base, 'editadas');

    const r = importarLibro(base, libroBase);
    expect(r.reporte.importadas).toBe(0);
    expect(r.base.movimientos.find((m) => m.id === id)).toMatchObject({ descripcion: 'EDITADA', monto: 999 });
    expect(r.base.categorias.find((c) => c.id === comida)?.presupuestoMensual).toBe(1);
    expect(r.base.notasConciliacion).toBe('editadas');
    expect(r.reporte.notasConciliacion).toBe('distintas_se_conservan_las_de_la_app');
  });

  it('reimportar no revive un movimiento borrado, y lo borrado no suma', () => {
    let { base } = importarLibro(baseVacia(), libroBase);
    const id = base.movimientos.find((m) => m.descripcion === 'SUPER UNO')?.id as number;
    base = borrarMovimientos(base, [id]);
    const r = importarLibro(base, libroBase);
    expect(r.reporte).toMatchObject({ importadas: 0, borradasEnLaApp: 1 });
    expect(movimientosVigentes(r.base)).toHaveLength(4);
    expect(resumen(r.base).filas.find((f) => f.categoria.nombre === 'Comida')?.total).toBe(2000);
  });

  it('sin notas en el archivo, lo informa', async () => {
    const { reporte } = importarLibro(baseVacia(), await leer(crearLibro(FILAS_BASE, null)));
    expect(reporte.notasConciliacion).toBe('no_encontradas');
  });
});

describe('exportar', () => {
  let base: Base;
  const datos = { fecha: '2026-03-10', descripcion: 'Compra', monto: 1000, nota: '', porRevisar: false };
  const nuevo = (extra: object) => {
    base = crearMovimiento(base, { ...datos, categoriaId: id('Comida'), cuentaId: base.cuentas[0]?.id, ...extra }).base;
  };
  const id = (nombre: string) => base.categorias.find((c) => c.nombre === nombre)?.id as number;
  const escribir = async () => {
    const copia = new ExcelJS.Workbook();
    await copia.xlsx.load(await construirLibro(base, new ExcelJS.Workbook()).xlsx.writeBuffer());
    return copia;
  };

  beforeEach(async () => {
    base = importarLibro(baseVacia(), await leer(crearLibro([]))).base;
  });

  it('la nota dice lo mismo que el campo por revisar', () => {
    expect(notaParaExcel('Revisar: algo', true)).toBe('Revisar: algo');
    expect(notaParaExcel('algo', true)).toBe('Revisar: algo');
    expect(notaParaExcel('', true)).toBe('Revisar');
    expect(notaParaExcel('Revisar: algo', false)).toBe('Algo');
    expect(notaParaExcel('Cartola 1; revisar algo', false)).toBe('Cartola 1; revisar algo');
    expect(notaParaExcel('', false)).toBe('');
  });

  it('el xlsx tiene la estructura de las hojas del Excel original', async () => {
    nuevo({ nota: 'ver', porRevisar: true });
    const libro = await escribir();
    const mov = libro.getWorksheet('Movimientos') as ExcelJS.Worksheet;
    expect((mov.getRow(4).values as unknown[]).slice(1)).toEqual(['Fecha', 'Descripción', 'Categoría', 'Monto', 'Cuenta / medio de pago', 'Nota', 'Tipo']);
    expect(mov.getCell('A5').value).toEqual(fecha('2026-03-10'));
    expect(mov.getCell('C5').value).toBe('Comida');
    expect(mov.getCell('D5').value).toBe(1000);
    expect(mov.getCell('F5').value).toBe('Revisar: ver');
    expect((mov.getCell('G5').value as { result: string }).result).toBe('Gasto');

    const cat = libro.getWorksheet('Categorías') as ExcelJS.Worksheet;
    expect(cat.getCell('A5').value).toBe('Categoría');
    expect(cat.getCell('F5').value).toBe('Cuentas y medios de pago');
    expect(cat.getCell('A7').value).toBe('Comida');
    expect(cat.getCell('C7').value).toBe(150000);
    expect(cat.getCell('F6').value).toBe('Banco');
  });

  it('no exporta lo borrado', async () => {
    nuevo({ descripcion: 'Viva' });
    nuevo({ descripcion: 'Borrada' });
    base = borrarMovimientos(base, [base.movimientos.at(-1)?.id as number]);
    expect(generarCsv(base)).not.toContain('Borrada');
    const hoja = (await escribir()).getWorksheet('Movimientos') as ExcelJS.Worksheet;
    expect(hoja.getCell('B5').value).toBe('Viva');
    expect(hoja.getCell('B6').value).toBeNull();
  });

  it('el CSV sirve para Excel en español y no ejecuta fórmulas de una cartola', () => {
    nuevo({ descripcion: '=HYPERLINK("malo")', nota: 'con; punto y coma' });
    nuevo({ descripcion: '-5 de descuento', monto: 2, fecha: '2026-01-02' });
    const csv = generarCsv(base);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    const lineas = csv.slice(1).split('\r\n');
    expect(lineas[0]).toBe('Fecha;Descripción;Categoría;Tipo;Monto;Cuenta;Nota;Por revisar');
    expect(lineas[1]).toBe(`10-03-2026;"'=HYPERLINK(""malo"")";Comida;Gasto;1000;Banco;"con; punto y coma";No`);
    expect(lineas[2]).toContain("'-5 de descuento");
  });

  it('una exportación se puede importar en otro dispositivo y calza al peso', async () => {
    nuevo({ monto: 1000, nota: 'Revisar: a', porRevisar: true });
    nuevo({ monto: 1000 });
    nuevo({ monto: 50, categoriaId: id('Sueldo'), fecha: '2026-04-05' });
    nuevo({ monto: 70, categoriaId: id('Traspaso desde otra cuenta propia'), fecha: '2026-04-06' });
    // Renombrada, tiene que seguir siendo especial.
    base = editarCategoria(base, id('Traspaso desde otra cuenta propia'), { nombre: 'Traído' });
    base = guardarNotas(base, 'Notas de prueba');

    const { base: otra, reporte } = importarLibro(baseVacia(), extraerFilas(await escribir()));
    expect(reporte.omitidas).toEqual([]);
    expect(reporte.importadas).toBe(4);
    expect(reporte.porRevisarImportados).toBe(1);
    const a = resumen(base);
    const b = resumen(otra);
    expect(b.totales).toEqual(a.totales);
    expect(a.totales.traidoNeto).toBe(70);
    expect(b.filas.map((f) => [f.categoria.nombre, f.categoria.presupuestoMensual, f.porMes])).toEqual(
      a.filas.map((f) => [f.categoria.nombre, f.categoria.presupuestoMensual, f.porMes]),
    );
    expect(otra.notasConciliacion).toBe('Notas de prueba');
  });

  it('importar en el mismo dispositivo la propia exportación no duplica lo manual ni lo editado', async () => {
    nuevo({ monto: 1000 });
    nuevo({ monto: 1000 });
    nuevo({ monto: 300 });
    base = { ...base, movimientos: base.movimientos.map((m) => (m.monto === 300 ? { ...m, claveImport: 'clave-vieja' } : m)) };
    const { base: nueva, reporte } = importarLibro(base, extraerFilas(await escribir()));
    expect(reporte.importadas).toBe(0);
    expect(reporte.yaExistian).toBe(3);
    expect(nueva.movimientos).toHaveLength(3);
  });
});
