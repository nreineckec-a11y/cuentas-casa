import { describe, expect, it } from 'vitest';
import {
  alternarSerie,
  calcularCalendario,
  estadoMesParaPromedio,
  intensidadHeatmap,
  leerPresupuesto,
  MAXIMO_SERIES,
  mesesNavegables,
  mesPredeterminado,
  sePuedeExcluir,
  serieConHuecos,
  seriesIniciales,
} from '../src/lib/calculos';
import {
  formatearMonedaCompacta,
  formatearPorcentaje,
  mesCorto,
  nombreDelMesConMayuscula,
} from '../src/lib/formato';

const calendario = calcularCalendario(['2026-01-05', '2026-10-13']);

describe('presupuesto', () => {
  it('sin presupuesto no hay lectura', () => {
    expect(leerPresupuesto(100, null)).toBeNull();
  });

  it('verde bajo el 80 %, ámbar hasta el 100 %, rojo al pasarse', () => {
    expect(leerPresupuesto(0, 1000)?.estado).toBe('bien');
    expect(leerPresupuesto(799, 1000)?.estado).toBe('bien');
    expect(leerPresupuesto(800, 1000)?.estado).toBe('cerca');
    expect(leerPresupuesto(1000, 1000)?.estado).toBe('cerca');
    expect(leerPresupuesto(1001, 1000)?.estado).toBe('excedido');
  });

  it('entrega la fracción gastada, aunque pase de 1', () => {
    expect(leerPresupuesto(1500, 1000)?.fraccion).toBe(1.5);
  });

  it('un presupuesto de cero no divide por cero', () => {
    expect(leerPresupuesto(0, 0)).toEqual({ estado: 'bien', fraccion: 0 });
    expect(leerPresupuesto(1, 0)).toEqual({ estado: 'excedido', fraccion: 1 });
  });
});

describe('estado de cada mes para el promedio', () => {
  const excluidos = new Set(['2026-02']);
  const estado = (mes: string) => estadoMesParaPromedio(calendario, excluidos, mes);

  it('distingue cada caso', () => {
    expect(estado('2025-12')).toBe('sin_datos');
    expect(estado('2026-01')).toBe('incompleto');
    expect(estado('2026-02')).toBe('excluido');
    expect(estado('2026-03')).toBe('cuenta');
    expect(estado('2026-09')).toBe('cuenta');
    expect(estado('2026-10')).toBe('en_curso');
    expect(estado('2026-11')).toBe('futuro');
  });

  it('sin movimientos no hay datos, pero una exclusión se sigue viendo', () => {
    expect(estadoMesParaPromedio(null, new Set(), '2026-03')).toBe('sin_datos');
    expect(estadoMesParaPromedio(null, excluidos, '2026-02')).toBe('excluido');
  });

  it('se excluye lo que cuenta o está en curso, y nada más', () => {
    expect(sePuedeExcluir('cuenta')).toBe(true);
    expect(sePuedeExcluir('en_curso')).toBe(true);
    expect(sePuedeExcluir('incompleto')).toBe(false);
    expect(sePuedeExcluir('futuro')).toBe(false);
    expect(sePuedeExcluir('sin_datos')).toBe(false);
    expect(sePuedeExcluir('excluido')).toBe(false);
  });
});

describe('navegación', () => {
  it('abre el último mes con datos, sin pasar de hoy', () => {
    expect(mesPredeterminado(calendario, '2026-11')).toBe('2026-10');
    expect(mesPredeterminado(calendario, '2026-05')).toBe('2026-05');
    expect(mesPredeterminado(null, '2026-11')).toBe('2026-11');
  });

  it('se navega desde el primer dato hasta hoy o el último dato', () => {
    const hastaHoy = mesesNavegables(calendario, '2026-11');
    expect(hastaHoy[0]).toBe('2026-01');
    expect(hastaHoy[hastaHoy.length - 1]).toBe('2026-11');
    const conFuturo = mesesNavegables(calendario, '2026-05');
    expect(conFuturo[conFuturo.length - 1]).toBe('2026-10');
    expect(mesesNavegables(null, '2026-11')).toEqual(['2026-11']);
  });
});

describe('gráficos', () => {
  it('la línea se corta fuera del período con datos, pero un cero real se mantiene', () => {
    const porMes = [10, 0, 30, 0, 0, 0, 0, 0, 0, 40, 0, 0];
    const serie = serieConHuecos(porMes, 2026, calendario);
    expect(serie.slice(0, 3)).toEqual([10, 0, 30]);
    expect(serie[9]).toBe(40);
    expect(serie[10]).toBeNull();
    expect(serie[11]).toBeNull();
  });

  it('otro año fuera del período queda completamente vacío', () => {
    expect(serieConHuecos(Array<number>(12).fill(0), 2025, calendario).every((v) => v === null)).toBe(true);
    expect(serieConHuecos(Array<number>(12).fill(0), 2026, null).every((v) => v === null)).toBe(true);
  });

  it('el heatmap va de 0 a 1 y no se apaga con un monto enorme', () => {
    expect(intensidadHeatmap(0, 100)).toBe(0);
    expect(intensidadHeatmap(10, 0)).toBe(0);
    expect(intensidadHeatmap(100, 100)).toBe(1);
    expect(intensidadHeatmap(25, 100)).toBe(0.5);
    expect(intensidadHeatmap(200, 100)).toBe(1);
  });

  it('parte con hasta 6 series y colores en orden', () => {
    expect(seriesIniciales([5, 6, 7])).toEqual([
      { categoriaId: 5, color: 0 },
      { categoriaId: 6, color: 1 },
      { categoriaId: 7, color: 2 },
    ]);
    expect(seriesIniciales([1, 2, 3, 4, 5, 6, 7, 8, 9])).toHaveLength(6);
  });

  it('el color sigue a la categoría: quitar una no repinta a las demás', () => {
    const inicio = seriesIniciales([10, 20, 30]);
    const sinLaSegunda = alternarSerie(inicio, 20);
    expect(sinLaSegunda).toEqual([
      { categoriaId: 10, color: 0 },
      { categoriaId: 30, color: 2 },
    ]);
    expect(alternarSerie(sinLaSegunda, 40)).toContainEqual({ categoriaId: 40, color: 1 });
  });

  it('no pasa de 8 series, y nunca repite un color', () => {
    let series = seriesIniciales([1, 2, 3, 4, 5, 6]);
    for (const id of [7, 8, 9, 10]) series = alternarSerie(series, id);
    expect(series).toHaveLength(MAXIMO_SERIES);
    expect(series.some((s) => s.categoriaId === 9)).toBe(false);
    expect(new Set(series.map((s) => s.color)).size).toBe(MAXIMO_SERIES);
    expect(Math.max(...series.map((s) => s.color))).toBe(MAXIMO_SERIES - 1);
  });
});

describe('formatos de Mes y Año', () => {
  it('moneda compacta para los ejes', () => {
    expect(formatearMonedaCompacta(0)).toBe('$0');
    expect(formatearMonedaCompacta(500)).toBe('$500');
    expect(formatearMonedaCompacta(500_000)).toBe('$500 mil');
    expect(formatearMonedaCompacta(1_000_000)).toBe('$1 M');
    expect(formatearMonedaCompacta(3_500_000)).toBe('$3,5 M');
    expect(formatearMonedaCompacta(2_250_000)).toBe('$2,25 M');
    expect(formatearMonedaCompacta(-2_000_000)).toBe('-$2 M');
  });

  it('porcentaje con coma decimal', () => {
    expect(formatearPorcentaje(0.1864)).toBe('18,6 %');
    expect(formatearPorcentaje(1)).toBe('100 %');
    expect(formatearPorcentaje(0)).toBe('0 %');
  });

  it('nombres de mes', () => {
    expect(nombreDelMesConMayuscula('2026-10')).toBe('Octubre 2026');
    expect(mesCorto('2026-02')).toBe('Feb');
    expect(mesCorto('2026-12')).toBe('Dic');
  });
});
