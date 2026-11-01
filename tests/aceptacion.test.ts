import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import ExcelJS from 'exceljs';
import { beforeAll, describe, expect, it } from 'vitest';
import { baseVacia, mesesExcluidos, movimientosVigentes, type Base } from '../src/lib/base';
import {
  calcularCalendario,
  calcularResumenAnual,
  calcularResumenMes,
  crearMes,
  rangoDeMeses,
  tendenciaDeGasto,
  type DatosCalculo,
  type ResumenAnual,
  type ResumenMes,
} from '../src/lib/calculos';
import { construirLibro, extraerFilas } from '../src/lib/excel';
import { importarLibro } from '../src/lib/importar';
import type { ReporteImportacion } from '../src/lib/tipos';

/**
 * Prueba de aceptación: importa el Excel real y compara lo que calcula la app con
 * los valores que el propio Excel dejó calculados. Lee el libro por su cuenta, sin
 * pasar por el código de importación, y no escribe ningún monto aquí: todo sale del
 * archivo, que no va al repositorio. Sin él, estos tests se saltan (también en GitHub).
 *
 * Única diferencia esperada: el mes excluido al importar cambia los promedios. El
 * bloque "con el mes excluido" la documenta. Lo demás se compara sin exclusiones,
 * que es lo que calcula el Excel.
 */
const RUTA = resolve('datos/Control_de_ingresos_y_gastos_conciliado.xlsx');
const NOMBRES_MES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

/** Valor guardado de la celda; lo mismo que openpyxl con data_only=True. */
function guardado(celda: ExcelJS.Cell): unknown {
  const valor = celda.value as unknown;
  if (valor && typeof valor === 'object' && !(valor instanceof Date)) {
    const objeto = valor as { result?: unknown; richText?: { text: string }[] };
    if (objeto.richText) return objeto.richText.map((p) => p.text).join('');
    return objeto.result ?? null;
  }
  return valor ?? null;
}

/** Celdas vacías o con "" cuentan como cero, igual que al sumarlas en el Excel. */
function numero(celda: ExcelJS.Cell): number {
  const valor = guardado(celda);
  return typeof valor === 'number' ? valor : 0;
}

function numeroONulo(celda: ExcelJS.Cell): number | null {
  const valor = guardado(celda);
  return typeof valor === 'number' ? valor : null;
}

describe.skipIf(!existsSync(RUTA))('aceptación contra el Excel real', () => {
  let base: Base;
  let reporte: ReporteImportacion;
  let libro: ExcelJS.Workbook;
  let hojaAnual: ExcelJS.Worksheet;
  let hojaMes: ExcelJS.Worksheet;
  let datosComoExcel: DatosCalculo;
  let datosApp: DatosCalculo;
  let anio: number;
  let anual: ResumenAnual;
  let mesElegido: string;
  let mensual: ResumenMes;

  beforeAll(async () => {
    libro = new ExcelJS.Workbook();
    await libro.xlsx.readFile(RUTA);
    hojaAnual = libro.getWorksheet('Resumen anual') as ExcelJS.Worksheet;
    hojaMes = libro.getWorksheet('Mes') as ExcelJS.Worksheet;

    ({ base, reporte } = importarLibro(baseVacia(), extraerFilas(libro)));
    datosApp = { categorias: base.categorias, movimientos: movimientosVigentes(base), excluidos: mesesExcluidos(base) };
    datosComoExcel = { ...datosApp, excluidos: new Set() };

    anio = guardado(hojaAnual.getCell('B4')) as number;
    anual = calcularResumenAnual(datosComoExcel, anio);
    const numeroMes = NOMBRES_MES.indexOf(guardado(hojaMes.getCell('B4')) as string) + 1;
    mesElegido = crearMes(guardado(hojaMes.getCell('B5')) as number, numeroMes);
    mensual = calcularResumenMes(datosComoExcel, mesElegido);
  });

  describe('importación', () => {
    it('importa todas las filas, sin omitir ninguna', () => {
      const hoja = libro.getWorksheet('Movimientos') as ExcelJS.Worksheet;
      let conFecha = 0;
      for (let fila = 5; fila <= hoja.rowCount; fila++) if (guardado(hoja.getCell(fila, 1)) instanceof Date) conFecha++;
      expect(reporte.omitidas).toEqual([]);
      expect(reporte.importadas).toBe(conFecha);
      expect(reporte.categoriasNoReconocidas).toEqual({});
      expect(reporte.cuentasNoReconocidas).toEqual({});
    });

    it('importa todas las categorías en orden, y las cuentas', () => {
      const hoja = libro.getWorksheet('Categorías') as ExcelJS.Worksheet;
      const delExcel: string[] = [];
      for (let fila = 6; fila <= 80; fila++) {
        const nombre = guardado(hoja.getCell(fila, 1));
        if (nombre) delExcel.push(nombre as string);
      }
      expect(reporte.categoriasInvalidas).toEqual([]);
      expect([...datosApp.categorias].sort((a, b) => a.orden - b.orden).map((c) => c.nombre)).toEqual(delExcel);
      const cuentas: string[] = [];
      for (let fila = 6; fila <= 20; fila++) {
        const nombre = guardado(hoja.getCell(fila, 6));
        if (nombre) cuentas.push(nombre as string);
      }
      expect(base.cuentas.map((c) => c.nombre)).toEqual(cuentas);
    });

    it('reimportar el mismo archivo no duplica nada', () => {
      const segunda = importarLibro(base, extraerFilas(libro));
      expect(segunda.reporte.importadas).toBe(0);
      expect(segunda.reporte.yaExistian).toBe(reporte.importadas);
      expect(segunda.reporte.categoriasCreadas).toBe(0);
      expect(segunda.base.movimientos).toHaveLength(reporte.importadas);
    });

    it('la suma de todos los movimientos coincide con la suma del Excel', () => {
      const hoja = libro.getWorksheet('Movimientos') as ExcelJS.Worksheet;
      expect(datosApp.movimientos.reduce((a, m) => a + m.monto, 0)).toBe(numero(hoja.getCell('D3')));
    });
  });

  describe('Resumen anual, al peso', () => {
    it.each(Array.from({ length: 12 }, (_, i) => i))('mes %i: ingresos, gastos, diferencia y traído neto', (i) => {
      const columna = 3 + i;
      const mes = anual.meses[i];
      expect(mes?.ingresos).toBe(numero(hojaAnual.getCell(9, columna)));
      expect(mes?.gastos).toBe(numero(hojaAnual.getCell(10, columna)));
      expect(mes?.diferencia).toBe(numero(hojaAnual.getCell(11, columna)));
      expect(mes?.traidoNeto).toBe(numero(hojaAnual.getCell(12, columna)));
    });

    it('marca ✓ los mismos meses', () => {
      for (let i = 0; i < 12; i++) {
        expect(anual.meses[i]?.cuentaParaPromedio).toBe(guardado(hojaAnual.getCell(8, 3 + i)) === '✓');
      }
    });

    it('cada combinación categoría × mes', () => {
      let comparadas = 0;
      for (let fila = 34; fila <= 108; fila++) {
        const nombre = guardado(hojaAnual.getCell(fila, 1));
        if (!nombre) continue;
        const propia = anual.filas.find((f) => f.categoria.nombre === nombre);
        expect(propia, `categoría ${String(nombre)}`).toBeDefined();
        expect(propia?.categoria.tipo).toBe(guardado(hojaAnual.getCell(fila, 2)));
        for (let i = 0; i < 12; i++) {
          expect(propia?.porMes[i], `${String(nombre)}, mes ${i + 1}`).toBe(numero(hojaAnual.getCell(fila, 3 + i)));
          comparadas++;
        }
      }
      expect(comparadas).toBe(datosApp.categorias.length * 12);
    });

    it('total, promedio y % del gasto de cada categoría', () => {
      for (let fila = 34; fila <= 108; fila++) {
        const nombre = guardado(hojaAnual.getCell(fila, 1));
        if (!nombre) continue;
        const propia = anual.filas.find((f) => f.categoria.nombre === nombre);
        expect(propia?.total).toBe(numero(hojaAnual.getCell(fila, 15)));
        expect(propia?.promedio ?? 0).toBeCloseTo(numero(hojaAnual.getCell(fila, 16)), 6);
        const porcentaje = numeroONulo(hojaAnual.getCell(fila, 17));
        if (propia?.categoria.tipo === 'Gasto') expect(propia.porcentajeGasto ?? 0).toBeCloseTo(porcentaje ?? 0, 10);
        else expect(propia?.porcentajeGasto).toBeNull();
      }
    });

    it('total año y promedio de los KPI', () => {
      expect(anual.totales.ingresos).toBe(numero(hojaAnual.getCell('O9')));
      expect(anual.totales.gastos).toBe(numero(hojaAnual.getCell('O10')));
      expect(anual.totales.diferencia).toBe(numero(hojaAnual.getCell('O11')));
      expect(anual.totales.traidoNeto).toBe(numero(hojaAnual.getCell('O12')));
      expect(anual.promedios.ingresos).toBeCloseTo(numero(hojaAnual.getCell('P9')), 6);
      expect(anual.promedios.gastos).toBeCloseTo(numero(hojaAnual.getCell('P10')), 6);
      expect(anual.promedios.diferencia).toBeCloseTo(numero(hojaAnual.getCell('P11')), 6);
      expect(anual.promedios.traidoNeto).toBeCloseTo(numero(hojaAnual.getCell('P12')), 6);
    });
  });

  describe('Mes elegido en el Excel, al peso', () => {
    it('KPI', () => {
      expect(mensual.totales.ingresos).toBe(numero(hojaMes.getCell('B7')));
      expect(mensual.totales.gastos).toBe(numero(hojaMes.getCell('B8')));
      expect(mensual.totales.diferencia).toBe(numero(hojaMes.getCell('B9')));
      expect(mensual.totales.traidoNeto).toBe(numero(hojaMes.getCell('B10')));
      expect(mensual.gastoPromedio).toBeCloseTo(numero(hojaMes.getCell('B11')), 6);
    });

    it('tabla por categoría', () => {
      for (let fila = 15; fila <= 89; fila++) {
        const nombre = guardado(hojaMes.getCell(fila, 1));
        if (!nombre) continue;
        const propia = mensual.filas.find((f) => f.categoria.nombre === nombre);
        expect(propia?.esteMes).toBe(numero(hojaMes.getCell(fila, 3)));
        expect(propia?.promedio ?? 0).toBeCloseTo(numero(hojaMes.getCell(fila, 5)), 6);
        expect(propia?.presupuesto ?? null).toBe(numeroONulo(hojaMes.getCell(fila, 6)));
        expect(propia?.disponible ?? null).toBe(numeroONulo(hojaMes.getCell(fila, 7)));
        if (propia?.categoria.tipo === 'Gasto') {
          expect(propia.porcentajeGasto ?? 0).toBeCloseTo(numero(hojaMes.getCell(fila, 4)), 10);
        }
      }
    });

    it('los 5 gastos más grandes por categoría', () => {
      mensual.topCategorias.forEach((top, i) => {
        expect(guardado(hojaMes.getCell(7 + i, 4))).toBe(`${i + 1}.  ${top.categoria.nombre}`);
        expect(top.monto).toBe(numero(hojaMes.getCell(7 + i, 7)));
      });
    });

    it('la misma cantidad de meses en el promedio que la hoja Calc', () => {
      const calc = libro.getWorksheet('Calc') as ExcelJS.Worksheet;
      expect(mensual.mesesPromedio).toHaveLength(numero(calc.getCell('B8')));
    });
  });

  describe('fallas del Excel corregidas', () => {
    it('la tendencia incluye todas las categorías de gasto, también las agregadas después', () => {
      const nombres = tendenciaDeGasto(anual).map((f) => f.categoria.nombre);
      expect(nombres).toHaveLength(datosApp.categorias.filter((c) => c.tipo === 'Gasto').length);
      expect(nombres).toEqual(expect.arrayContaining(['Agua', 'Luz', 'Gas', 'Internet', 'TAG']));
    });

    it('el mes en curso lo avisa con la fecha del último dato', () => {
      const calendario = calcularCalendario(datosApp.movimientos.map((m) => m.fecha));
      const [, mm, dd] = (calendario?.ultimaFecha as string).split('-');
      expect(calcularResumenMes(datosApp, calendario?.mesEnCurso as string).aviso).toBe(`Mes en curso: datos hasta el ${dd}-${mm}`);
      expect(calcularResumenMes(datosApp, calendario?.primerMesCompleto as string).aviso).toBeNull();
    });

    it('muestra el top 5 de categorías y también el de movimientos individuales', () => {
      expect(mensual.topCategorias).toHaveLength(5);
      expect(mensual.topMovimientos).toHaveLength(5);
      const montos = mensual.topMovimientos.map((m) => m.monto);
      expect(montos).toEqual([...montos].sort((a, b) => b - a));
      // Un movimiento individual nunca supera a la categoría más grande de la que forma parte.
      expect(montos[0]).toBeLessThanOrEqual(mensual.topCategorias[0]?.monto ?? 0);
    });
  });

  describe('hoja Calc', () => {
    it('las mismas fechas y meses', () => {
      const calc = libro.getWorksheet('Calc') as ExcelJS.Worksheet;
      const iso = (celda: string) => (guardado(calc.getCell(celda)) as Date).toISOString().slice(0, 10);
      const c = calcularCalendario(datosApp.movimientos.map((m) => m.fecha));
      expect(c?.primeraFecha).toBe(iso('B3'));
      expect(c?.ultimaFecha).toBe(iso('B4'));
      expect(c?.primerMesCompleto).toBe(iso('B5').slice(0, 7));
      expect(c?.mesEnCurso).toBe(iso('B6').slice(0, 7));
      expect(mensual.mesesPromedio[0]).toBe(iso('B7').slice(0, 7));
    });
  });

  describe('con el mes excluido (única diferencia esperada)', () => {
    const COLUMNA_DEL_MES_EXCLUIDO = 4;

    it('la importación deja excluido el mes incompleto', () => {
      expect(reporte.mesesExcluidosAhora).toHaveLength(1);
      expect(datosApp.excluidos.size).toBe(1);
    });

    it('el gasto promedio deja de contar ese mes, sin ningún otro cambio', () => {
      const calendario = calcularCalendario(datosApp.movimientos.map((m) => m.fecha));
      const conExclusion = calcularResumenAnual(datosApp, anio);
      const meses = rangoDeMeses(calendario?.primerMesCompleto as string, calendario?.mesEnCurso as string).filter((m) => !datosApp.excluidos.has(m));
      const esperado = meses.reduce((suma, m) => suma + (anual.meses.find((x) => x.mes === m)?.gastos ?? 0), 0) / meses.length;

      expect(anual.promedios.gastos).toBeCloseTo(numero(hojaAnual.getCell('P10')), 6);
      expect(conExclusion.promedios.gastos).toBeCloseTo(esperado, 6);
      expect(conExclusion.promedios.gastos).not.toBeCloseTo(anual.promedios.gastos as number, 0);
      expect(conExclusion.mesesPromedio).toEqual(meses);
    });

    it('ese mes sigue mostrando sus totales: cambian solo los promedios', () => {
      const conExclusion = calcularResumenAnual(datosApp, anio);
      const excluido = conExclusion.meses[1];
      expect(excluido?.gastos).toBe(numero(hojaAnual.getCell(10, COLUMNA_DEL_MES_EXCLUIDO)));
      expect(excluido?.excluido).toBe(true);
      expect(excluido?.cuentaParaPromedio).toBe(false);
      expect(conExclusion.totales).toEqual(anual.totales);
      conExclusion.filas.forEach((fila, i) => {
        expect(fila.porMes).toEqual(anual.filas[i]?.porMes);
        expect(fila.total).toBe(anual.filas[i]?.total);
      });
    });
  });

  describe('volver al Excel', () => {
    it('lo exportado trae los mismos movimientos que el original', async () => {
      const copia = new ExcelJS.Workbook();
      await copia.xlsx.load(await construirLibro(base, new ExcelJS.Workbook()).xlsx.writeBuffer());
      const filas = (l: ExcelJS.Workbook) => {
        const hoja = l.getWorksheet('Movimientos') as ExcelJS.Worksheet;
        const lista: string[] = [];
        for (let fila = 5; fila <= hoja.rowCount; fila++) {
          const fecha = guardado(hoja.getCell(fila, 1));
          if (!(fecha instanceof Date)) continue;
          lista.push([fecha.toISOString().slice(0, 10), ...[2, 3, 4, 5, 7].map((c) => String(guardado(hoja.getCell(fila, c))))].join('|'));
        }
        return lista.sort();
      };
      expect(filas(copia)).toEqual(filas(libro));
    });
  });
});
