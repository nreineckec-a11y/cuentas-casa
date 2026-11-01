import { describe, expect, it } from 'vitest';
import {
  avisoMesEnCurso,
  calcularCalendario,
  calcularResumenAnual,
  calcularResumenMes,
  describirPromedio,
  mesesDelPromedio,
  mesesQueEntranAlPromedio,
  promedioMensual,
  sumarMeses,
  tendenciaDeGasto,
  topCategoriasDeGasto,
  topMovimientosDeGasto,
  totalesPorTipo,
  type CategoriaCalc,
  type DatosCalculo,
  type MovimientoCalc,
} from '../src/lib/calculos';

const INGRESO = 1;
const COMIDA = 2;
const CASA = 3;
const OCIO = 4;
const DESDE = 5;
const HACIA = 6;
const AJUSTES = 7;

const categorias: CategoriaCalc[] = [
  { id: INGRESO, nombre: 'Sueldo', tipo: 'Ingreso', presupuestoMensual: null, orden: 1 },
  { id: COMIDA, nombre: 'Comida', tipo: 'Gasto', presupuestoMensual: 100, orden: 2 },
  { id: CASA, nombre: 'Casa', tipo: 'Gasto', presupuestoMensual: null, orden: 3 },
  { id: OCIO, nombre: 'Ocio', tipo: 'Gasto', presupuestoMensual: 50, orden: 4 },
  { id: DESDE, nombre: 'Desde', tipo: 'Traspaso', presupuestoMensual: null, orden: 5, rol: 'traspaso_desde' },
  { id: HACIA, nombre: 'Hacia', tipo: 'Traspaso', presupuestoMensual: null, orden: 6, rol: 'traspaso_hacia' },
  { id: AJUSTES, nombre: 'Ajustes', tipo: 'Traspaso', presupuestoMensual: null, orden: 7 },
];

let siguienteId = 1;
function mov(fecha: string, categoriaId: number, monto: number): MovimientoCalc {
  return { id: siguienteId++, fecha, categoriaId, monto };
}

function datos(movimientos: MovimientoCalc[], excluidos: string[] = []): DatosCalculo {
  return { categorias, movimientos, excluidos: new Set(excluidos) };
}

describe('calendario', () => {
  it('sin fechas no hay calendario', () => {
    expect(calcularCalendario([])).toBeNull();
  });

  it('si la primera fecha no es día 1, el primer mes completo es el siguiente', () => {
    const c = calcularCalendario(['2026-01-05', '2026-10-13']);
    expect(c?.primerMesCompleto).toBe('2026-02');
    expect(c?.mesEnCurso).toBe('2026-10');
  });

  it('si la primera fecha es día 1, ese mes ya es completo', () => {
    expect(calcularCalendario(['2026-03-01'])?.primerMesCompleto).toBe('2026-03');
  });

  it('si la última fecha es fin de mes, el mes en curso es el siguiente', () => {
    expect(calcularCalendario(['2026-01-01', '2026-10-31'])?.mesEnCurso).toBe('2026-11');
    expect(calcularCalendario(['2026-01-01', '2026-12-31'])?.mesEnCurso).toBe('2027-01');
  });

  it('reconoce febrero bisiesto y no bisiesto', () => {
    expect(calcularCalendario(['2028-02-28'])?.mesEnCurso).toBe('2028-02');
    expect(calcularCalendario(['2028-02-29'])?.mesEnCurso).toBe('2028-03');
    expect(calcularCalendario(['2026-02-28'])?.mesEnCurso).toBe('2026-03');
  });

  it('no depende del orden de las fechas', () => {
    const c = calcularCalendario(['2026-05-10', '2026-01-02', '2026-07-03']);
    expect(c?.primeraFecha).toBe('2026-01-02');
    expect(c?.ultimaFecha).toBe('2026-07-03');
  });

  it('suma y resta meses cruzando años', () => {
    expect(sumarMeses('2026-10', -12)).toBe('2025-10');
    expect(sumarMeses('2026-01', -1)).toBe('2025-12');
    expect(sumarMeses('2026-12', 1)).toBe('2027-01');
  });
});

describe('meses del promedio', () => {
  const calendario = calcularCalendario(['2026-01-05', '2026-10-13']);

  it('ventana: del primer mes completo al mes anterior al mes en curso', () => {
    const meses = mesesDelPromedio(calendario, new Set(), { tipo: 'ventana' });
    expect(meses).toHaveLength(8);
    expect(meses[0]).toBe('2026-02');
    expect(meses[7]).toBe('2026-09');
  });

  it('ventana: no pasa de 12 meses', () => {
    const largo = calcularCalendario(['2020-01-01', '2026-10-13']);
    const meses = mesesDelPromedio(largo, new Set(), { tipo: 'ventana' });
    expect(meses).toHaveLength(12);
    expect(meses[0]).toBe('2025-10');
    expect(meses[11]).toBe('2026-09');
  });

  it('año: toma todos los meses completos del año, sin el tope de 12', () => {
    const largo = calcularCalendario(['2020-01-01', '2026-10-13']);
    expect(mesesDelPromedio(largo, new Set(), { tipo: 'anio', anio: 2024 })).toHaveLength(12);
    expect(mesesDelPromedio(largo, new Set(), { tipo: 'anio', anio: 2026 })).toHaveLength(9);
  });

  it('un mes excluido sale y no se reemplaza por uno más antiguo', () => {
    const largo = calcularCalendario(['2020-01-01', '2026-10-13']);
    const meses = mesesDelPromedio(largo, new Set(['2026-02']), { tipo: 'ventana' });
    expect(meses).toHaveLength(11);
    expect(meses).not.toContain('2026-02');
    expect(meses[0]).toBe('2025-10');
  });

  it('año sin meses completos: lista vacía y promedio nulo', () => {
    const c = calcularCalendario(['2026-10-05', '2026-10-20']);
    const meses = mesesDelPromedio(c, new Set(), { tipo: 'anio', anio: 2026 });
    expect(meses).toEqual([]);
    expect(promedioMensual(() => 100, meses)).toBeNull();
  });

  it('sin calendario no hay meses', () => {
    expect(mesesDelPromedio(null, new Set(), { tipo: 'ventana' })).toEqual([]);
  });
});

describe('descripción del promedio', () => {
  it('tramo continuo en un año', () => {
    const meses = ['2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09'];
    expect(describirPromedio(meses)).toBe('Promedio de mar–sep 2026, 7 meses');
  });

  it('muestra el hueco que deja un mes excluido', () => {
    expect(describirPromedio(['2026-02', '2026-04', '2026-05'])).toBe('Promedio de feb, abr–may 2026, 3 meses');
  });

  it('cruza años y usa singular', () => {
    expect(describirPromedio(['2025-11', '2025-12', '2026-01'])).toBe('Promedio de nov 2025–ene 2026, 3 meses');
    expect(describirPromedio(['2026-03'])).toBe('Promedio de mar 2026, 1 mes');
  });

  it('sin meses', () => {
    expect(describirPromedio([])).toBe('Sin meses completos para promediar');
  });
});

describe('aviso de mes en curso', () => {
  const calendario = calcularCalendario(['2026-01-05', '2026-10-13']);

  it('aparece solo en el mes en curso', () => {
    expect(avisoMesEnCurso(calendario, '2026-10')).toBe('Mes en curso: datos hasta el 13-10');
    expect(avisoMesEnCurso(calendario, '2026-09')).toBeNull();
    expect(avisoMesEnCurso(null, '2026-10')).toBeNull();
  });
});

describe('meses que entran al promedio al anotar', () => {
  const antes = calcularCalendario(['2026-01-05', '2026-10-13']);

  it('avisa si octubre pasa a completo con datos solo hasta el 13', () => {
    const despues = calcularCalendario(['2026-01-05', '2026-10-13', '2026-11-01']);
    expect(mesesQueEntranAlPromedio(antes, despues)).toEqual([
      { mes: '2026-10', ultimaFechaDelMes: '2026-10-13', diasSinDatos: 18 },
    ]);
  });

  it('no avisa si el mes ya estaba casi terminado', () => {
    const casi = calcularCalendario(['2026-01-05', '2026-10-28']);
    const despues = calcularCalendario(['2026-01-05', '2026-10-28', '2026-11-01']);
    expect(mesesQueEntranAlPromedio(casi, despues)).toEqual([]);
  });

  it('no avisa si no cambia el mes en curso ni si el mes ya está excluido', () => {
    const mismoMes = calcularCalendario(['2026-01-05', '2026-10-20']);
    expect(mesesQueEntranAlPromedio(antes, mismoMes)).toEqual([]);
    const despues = calcularCalendario(['2026-01-05', '2026-11-01']);
    expect(mesesQueEntranAlPromedio(antes, despues, new Set(['2026-10']))).toEqual([]);
  });

  it('un mes salteado se avisa completo, sin datos', () => {
    const despues = calcularCalendario(['2026-01-05', '2026-12-02']);
    const resultado = mesesQueEntranAlPromedio(antes, despues);
    expect(resultado.map((r) => r.mes)).toEqual(['2026-10', '2026-11']);
    expect(resultado[1]).toEqual({ mes: '2026-11', ultimaFechaDelMes: null, diasSinDatos: 30 });
  });
});

describe('resumen del mes', () => {
  const base = [
    mov('2026-01-15', COMIDA, 10),
    mov('2026-02-10', INGRESO, 1000),
    mov('2026-02-11', COMIDA, 80),
    mov('2026-02-12', CASA, 300),
    mov('2026-03-10', COMIDA, 120),
    mov('2026-03-11', OCIO, 40),
    mov('2026-04-20', COMIDA, 50),
  ];

  it('mes vacío: todo en cero, sin porcentajes ni top', () => {
    const r = calcularResumenMes(datos(base), '2030-06');
    expect(r.totales).toEqual({ ingresos: 0, gastos: 0, diferencia: 0, traidoNeto: 0 });
    expect(r.filas.every((f) => f.esteMes === 0 && f.porcentajeGasto === null)).toBe(true);
    expect(r.topCategorias).toEqual([]);
    expect(r.topMovimientos).toEqual([]);
  });

  it('sin movimientos: sin promedio', () => {
    const r = calcularResumenMes(datos([]), '2026-01');
    expect(r.gastoPromedio).toBeNull();
    expect(r.mesesPromedio).toEqual([]);
    expect(r.aviso).toBeNull();
  });

  it('calcula los totales y la diferencia', () => {
    const r = calcularResumenMes(datos(base), '2026-02');
    expect(r.totales.ingresos).toBe(1000);
    expect(r.totales.gastos).toBe(380);
    expect(r.totales.diferencia).toBe(620);
  });

  it('el porcentaje del gasto y el disponible son solo para gastos', () => {
    const r = calcularResumenMes(datos(base), '2026-02');
    const fila = (id: number) => r.filas.find((f) => f.categoria.id === id);
    expect(fila(COMIDA)?.porcentajeGasto).toBeCloseTo(80 / 380, 10);
    expect(fila(COMIDA)?.disponible).toBe(20);
    expect(fila(OCIO)?.disponible).toBe(50);
    expect(fila(INGRESO)?.porcentajeGasto).toBeNull();
    expect(fila(INGRESO)?.disponible).toBeNull();
  });

  it('categoría sin presupuesto: disponible nulo', () => {
    const r = calcularResumenMes(datos(base), '2026-02');
    const casa = r.filas.find((f) => f.categoria.id === CASA);
    expect(casa?.presupuesto).toBeNull();
    expect(casa?.disponible).toBeNull();
  });

  it('el disponible puede quedar negativo', () => {
    const r = calcularResumenMes(datos(base), '2026-03');
    expect(r.filas.find((f) => f.categoria.id === COMIDA)?.disponible).toBe(-20);
  });

  it('el promedio usa la ventana y el mes excluido baja el divisor', () => {
    const sinExcluir = calcularResumenMes(datos(base), '2026-04');
    expect(sinExcluir.mesesPromedio).toEqual(['2026-02', '2026-03']);
    expect(sinExcluir.gastoPromedio).toBe((380 + 160) / 2);

    const conExcluido = calcularResumenMes(datos(base, ['2026-02']), '2026-04');
    expect(conExcluido.mesesPromedio).toEqual(['2026-03']);
    expect(conExcluido.gastoPromedio).toBe(160);
    expect(conExcluido.descripcionPromedio).toBe('Promedio de mar 2026, 1 mes');
  });

  it('el mes excluido sigue mostrando sus totales', () => {
    const r = calcularResumenMes(datos(base, ['2026-02']), '2026-02');
    expect(r.totales.gastos).toBe(380);
  });

  it('avisa si el mes está en curso', () => {
    expect(calcularResumenMes(datos(base), '2026-04').aviso).toBe('Mes en curso: datos hasta el 20-04');
    expect(calcularResumenMes(datos(base), '2026-03').aviso).toBeNull();
  });

  it('solo traspasos: no suman a ingresos ni gastos', () => {
    const r = calcularResumenMes(
      datos([mov('2026-05-02', DESDE, 500), mov('2026-05-03', HACIA, 200), mov('2026-05-04', AJUSTES, 70)]),
      '2026-05',
    );
    expect(r.totales.ingresos).toBe(0);
    expect(r.totales.gastos).toBe(0);
    expect(r.totales.diferencia).toBe(0);
    expect(r.filas.every((f) => f.porcentajeGasto === null)).toBe(true);
  });

  it('el traído neto es desde menos hacia, sin contar los ajustes', () => {
    const r = calcularResumenMes(
      datos([mov('2026-05-02', DESDE, 500), mov('2026-05-03', HACIA, 200), mov('2026-05-04', AJUSTES, 70)]),
      '2026-05',
    );
    expect(r.totales.traidoNeto).toBe(300);
  });
});

describe('top 5', () => {
  it('categorías: solo gastos con monto, de mayor a menor', () => {
    const r = calcularResumenMes(
      datos([
        mov('2026-05-02', INGRESO, 9000),
        mov('2026-05-02', COMIDA, 100),
        mov('2026-05-03', COMIDA, 50),
        mov('2026-05-04', CASA, 500),
      ]),
      '2026-05',
    );
    expect(r.topCategorias.map((t) => [t.categoria.nombre, t.monto])).toEqual([['Casa', 500], ['Comida', 150]]);
  });

  it('categorías: en un empate gana la que va después, como en el Excel', () => {
    const top = topCategoriasDeGasto([
      { categoria: categorias[1] as CategoriaCalc, esteMes: 100 },
      { categoria: categorias[2] as CategoriaCalc, esteMes: 100 },
    ]);
    expect(top.map((t) => t.categoria.nombre)).toEqual(['Casa', 'Comida']);
  });

  it('movimientos: individuales, solo gastos del mes y como máximo 5', () => {
    const lista = [
      mov('2026-05-01', COMIDA, 10),
      mov('2026-05-02', COMIDA, 20),
      mov('2026-05-03', COMIDA, 30),
      mov('2026-05-04', CASA, 40),
      mov('2026-05-05', CASA, 50),
      mov('2026-05-06', CASA, 60),
      mov('2026-05-07', INGRESO, 9999),
      mov('2026-05-08', DESDE, 9999),
      mov('2026-06-01', CASA, 9999),
    ];
    expect(topMovimientosDeGasto(lista, categorias, '2026-05').map((m) => m.monto)).toEqual([60, 50, 40, 30, 20]);
  });

  it('movimientos: en un empate va primero el más reciente', () => {
    const viejo = mov('2026-05-01', CASA, 40);
    const nuevo = mov('2026-05-20', CASA, 40);
    expect(topMovimientosDeGasto([viejo, nuevo], categorias, '2026-05')).toEqual([nuevo, viejo]);
  });
});

describe('totales de lo filtrado', () => {
  it('separa por tipo y el neto ignora los traspasos', () => {
    const totales = totalesPorTipo(
      [mov('2026-05-01', INGRESO, 1000), mov('2026-05-01', COMIDA, 300), mov('2026-05-01', DESDE, 500), mov('2026-05-01', AJUSTES, 5)],
      categorias,
    );
    expect(totales).toEqual({ ingresos: 1000, gastos: 300, traspasos: 505, neto: 700 });
  });
});

describe('resumen anual', () => {
  const base = [
    mov('2026-01-15', COMIDA, 10),
    mov('2026-02-10', INGRESO, 1000),
    mov('2026-02-11', COMIDA, 80),
    mov('2026-03-10', COMIDA, 120),
    mov('2026-03-11', CASA, 40),
    mov('2026-04-20', COMIDA, 50),
  ];

  it('el total incluye todos los meses; el promedio, solo los ✓', () => {
    const r = calcularResumenAnual(datos(base), 2026);
    expect(r.totales.gastos).toBe(300);
    expect(r.promedios.gastos).toBe((80 + 160) / 2);
    expect(r.meses.filter((m) => m.cuentaParaPromedio).map((m) => m.mes)).toEqual(['2026-02', '2026-03']);
  });

  it('un mes excluido sigue completo pero pierde el ✓ y mantiene su total', () => {
    const r = calcularResumenAnual(datos(base, ['2026-02']), 2026);
    const febrero = r.meses[1];
    expect(febrero?.completo).toBe(true);
    expect(febrero?.excluido).toBe(true);
    expect(febrero?.cuentaParaPromedio).toBe(false);
    expect(r.totales.gastos).toBe(300);
    expect(r.promedios.gastos).toBe(160);
  });

  it('año sin meses completos: promedios nulos y totales presentes', () => {
    const r = calcularResumenAnual(datos([mov('2026-10-05', COMIDA, 10), mov('2026-10-20', COMIDA, 5)]), 2026);
    expect(r.mesesPromedio).toEqual([]);
    expect(r.promedios.gastos).toBeNull();
    expect(r.filas.every((f) => f.promedio === null)).toBe(true);
    expect(r.totales.gastos).toBe(15);
  });

  it('entrega doce meses y el porcentaje anual solo para gastos', () => {
    const r = calcularResumenAnual(datos(base), 2026);
    expect(r.meses).toHaveLength(12);
    const comida = r.filas.find((f) => f.categoria.id === COMIDA);
    expect(comida?.porMes).toHaveLength(12);
    expect(comida?.total).toBe(260);
    expect(comida?.porcentajeGasto).toBeCloseTo(260 / 300, 10);
    expect(r.filas.find((f) => f.categoria.id === INGRESO)?.porcentajeGasto).toBeNull();
  });

  it('la tendencia incluye todas las categorías de gasto, también las agregadas después', () => {
    const conNueva: CategoriaCalc[] = [
      ...categorias,
      { id: 99, nombre: 'Nueva', tipo: 'Gasto', presupuestoMensual: null, orden: 99 },
    ];
    const r = calcularResumenAnual({ categorias: conNueva, movimientos: [mov('2026-03-01', 99, 700), ...base], excluidos: new Set() }, 2026);
    const tendencia = tendenciaDeGasto(r);
    expect(tendencia.map((f) => f.categoria.nombre)).toEqual(['Nueva', 'Comida', 'Casa', 'Ocio']);
  });
});
