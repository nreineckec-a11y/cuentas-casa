import { describe, expect, it } from 'vitest';
import { erroresPorCampo, esquemaFecha, esquemaMovimiento } from '../src/lib/esquemas';
import {
  fechaDeHoy,
  formatearFecha,
  formatearMoneda,
  formatearMontoAlEscribir,
  nombreDelMes,
  normalizarTexto,
  parsearMonto,
  sumarDias,
} from '../src/lib/formato';
import {
  buscarDescripciones,
  categoriasDelTipo,
  etiquetaGuardar,
  cantidadDeFiltros,
  filtrarMovimientos,
  filtroDesdeParams,
  indiceDeDescripciones,
  mesesConMovimientos,
  paramsDesdeFiltro,
  parecidoDeTextos,
  posiblesDuplicados,
  quitarPrefijoRevisar,
  recordatorioDobleConteo,
  textoGuardado,
  tienePrefijoRevisar,
} from '../src/lib/movimientos';
import type { Movimiento } from '../src/lib/tipos';

const INGRESO = 1;
const GASTO = 2;
const TRASPASO = 3;
const categorias = [
  { id: INGRESO, tipo: 'Ingreso' as const },
  { id: GASTO, tipo: 'Gasto' as const },
  { id: TRASPASO, tipo: 'Traspaso' as const },
];

let siguienteId = 1;
function mov(fecha: string, descripcion: string, monto: number, extra: Partial<Movimiento> = {}): Movimiento {
  return {
    id: siguienteId++,
    fecha,
    descripcion,
    monto,
    categoriaId: GASTO,
    cuentaId: 1,
    nota: '',
    porRevisar: false,
    origen: 'manual',
    ...extra,
  };
}

describe('formato', () => {
  it('moneda de Chile', () => {
    expect(formatearMoneda(1234567)).toBe('$1.234.567');
    expect(formatearMoneda(0)).toBe('$0');
    expect(formatearMoneda(999)).toBe('$999');
    expect(formatearMoneda(1000)).toBe('$1.000');
    expect(formatearMoneda(-1234567)).toBe('-$1.234.567');
    expect(formatearMoneda(2345678.71)).toBe('$2.345.679');
  });

  it('el monto se formatea mientras se escribe', () => {
    expect(formatearMontoAlEscribir('1')).toBe('$1');
    expect(formatearMontoAlEscribir('1234')).toBe('$1.234');
    expect(formatearMontoAlEscribir('$1.234' + '5')).toBe('$12.345');
    expect(formatearMontoAlEscribir('')).toBe('');
    expect(formatearMontoAlEscribir('$')).toBe('');
    expect(formatearMontoAlEscribir('abc')).toBe('');
  });

  it('el monto escrito se lee como entero', () => {
    expect(parsearMonto('$12.345')).toBe(12345);
    expect(parsearMonto('')).toBeNull();
    expect(parsearMonto('$')).toBeNull();
  });

  it('fechas', () => {
    expect(formatearFecha('2026-10-13')).toBe('13-10-2026');
    expect(sumarDias('2026-10-31', 1)).toBe('2026-11-01');
    expect(sumarDias('2026-03-01', -1)).toBe('2026-02-28');
    expect(nombreDelMes('2026-10')).toBe('octubre 2026');
  });

  it('hoy usa la fecha local, no UTC', () => {
    expect(fechaDeHoy(new Date(2026, 10, 1, 23, 59))).toBe('2026-11-01');
    expect(fechaDeHoy(new Date(2026, 0, 5, 0, 1))).toBe('2026-01-05');
  });

  it('normaliza tildes, mayúsculas y espacios', () => {
    expect(normalizarTexto('  Mantención   de JARDINES ')).toBe('mantencion de jardines');
  });
});

describe('validación del movimiento', () => {
  const valido = { fecha: '2026-10-13', descripcion: 'x', categoriaId: 1, monto: 100, cuentaId: 1, nota: '', porRevisar: false };

  it('acepta un movimiento correcto y recorta espacios', () => {
    const r = esquemaMovimiento.safeParse({ ...valido, descripcion: '  hola ' });
    expect(r.success && r.data.descripcion).toBe('hola');
  });

  it('acepta una descripción vacía', () => {
    expect(esquemaMovimiento.safeParse({ ...valido, descripcion: '' }).success).toBe(true);
  });

  it.each([0, -1, 10.5, '100', null])('rechaza el monto %s', (monto) => {
    expect(esquemaMovimiento.safeParse({ ...valido, monto }).success).toBe(false);
  });

  it.each(['2026-02-31', '13-10-2026', '', '2026-13-01'])('rechaza la fecha %s', (fecha) => {
    expect(esquemaFecha.safeParse(fecha).success).toBe(false);
  });

  it('rechaza campos que no existen, como el tipo', () => {
    expect(esquemaMovimiento.safeParse({ ...valido, tipo: 'Gasto' }).success).toBe(false);
  });

  it('entrega los errores en español y por campo', () => {
    const r = esquemaMovimiento.safeParse({ ...valido, monto: null, categoriaId: null, cuentaId: null });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(erroresPorCampo(r.error)).toEqual({
        monto: 'Escribe el monto',
        categoriaId: 'Elige una categoría',
        cuentaId: 'Elige una cuenta',
      });
    }
  });
});

describe('filtros', () => {
  const a = mov('2026-10-13', 'Compra Farmacia Uno', 12345, { cuentaId: 1, nota: 'Revisar: farmacia', porRevisar: true });
  const b = mov('2026-10-10', 'Sueldo', 900000, { categoriaId: INGRESO, cuentaId: 2 });
  const c = mov('2026-09-30', 'Traspaso a ahorro', 30000, { categoriaId: TRASPASO, cuentaId: 1 });
  const d = mov('2026-09-01', 'Mantención', 1300000, { categoriaId: INGRESO, cuentaId: 2 });
  const todos = [c, a, d, b];
  const ids = (filtro: Parameters<typeof filtrarMovimientos>[1]) =>
    filtrarMovimientos(todos, filtro, categorias).map((m) => m.id);

  it('sin filtros: todos, de más nuevo a más antiguo', () => {
    expect(ids({})).toEqual([a.id, b.id, c.id, d.id]);
  });

  it('en el mismo día, el último anotado primero', () => {
    const x = mov('2026-08-01', 'x', 1);
    const y = mov('2026-08-01', 'y', 1);
    expect(filtrarMovimientos([x, y], {}, categorias).map((m) => m.id)).toEqual([y.id, x.id]);
  });

  it('por mes, rango, categoría, tipo y cuenta', () => {
    expect(ids({ mes: '2026-09' })).toEqual([c.id, d.id]);
    expect(ids({ desde: '2026-09-30', hasta: '2026-10-10' })).toEqual([b.id, c.id]);
    expect(ids({ categoriaId: INGRESO })).toEqual([b.id, d.id]);
    expect(ids({ tipo: 'Traspaso' })).toEqual([c.id]);
    expect(ids({ cuentaId: 2 })).toEqual([b.id, d.id]);
    expect(ids({ soloPorRevisar: true })).toEqual([a.id]);
  });

  it('los filtros se combinan', () => {
    expect(ids({ mes: '2026-09', tipo: 'Ingreso', cuentaId: 2 })).toEqual([d.id]);
    expect(ids({ mes: '2026-09', tipo: 'Gasto' })).toEqual([]);
  });

  it('el texto busca en descripción y nota, sin tildes ni mayúsculas', () => {
    expect(ids({ texto: 'mantencion' })).toEqual([d.id]);
    expect(ids({ texto: 'FARMA' })).toEqual([a.id]);
    expect(ids({ texto: 'farmacia' })).toEqual([a.id]);
  });

  it('el texto también busca por monto', () => {
    expect(ids({ texto: '30.000' })).toEqual([c.id]);
    expect(ids({ texto: '$30.000' })).toEqual([c.id]);
    expect(ids({ texto: '900000' })).toEqual([b.id]);
  });

  it('el filtro va y vuelve de la URL', () => {
    const filtro = { mes: '2026-09', categoriaId: 4, tipo: 'Gasto' as const, cuentaId: 2, texto: 'ñandú', soloPorRevisar: true as const };
    const params = new URLSearchParams(paramsDesdeFiltro(filtro).toString());
    expect(filtroDesdeParams(params)).toMatchObject(filtro);
    expect(cantidadDeFiltros(filtro)).toBe(4 + 1);
  });

  it('ignora valores inválidos de la URL', () => {
    const f = filtroDesdeParams(new URLSearchParams('tipo=Otro&categoria=abc&cuenta=-1'));
    expect(f.tipo).toBeUndefined();
    expect(f.categoriaId).toBeUndefined();
    expect(f.cuentaId).toBeUndefined();
  });

  it('lista los meses con movimientos, del más nuevo al más antiguo', () => {
    expect(mesesConMovimientos(todos)).toEqual(['2026-10', '2026-09']);
  });
});

describe('autocompletado de la descripción', () => {
  const lista = [
    mov('2026-01-01', 'Compra Jumbo', 10, { categoriaId: 8, cuentaId: 8 }),
    mov('2026-03-01', 'COMPRA JUMBO', 20, { categoriaId: 9, cuentaId: 9 }),
    mov('2026-02-01', 'Jumbo Online', 30, { categoriaId: 7, cuentaId: 7 }),
    mov('2026-02-02', '', 30),
  ];
  const indice = indiceDeDescripciones(lista);

  it('deja una entrada por descripción, con la categoría y cuenta de la última vez', () => {
    expect(indice).toHaveLength(2);
    const compra = buscarDescripciones(indice, 'compra')[0];
    expect(compra).toMatchObject({ descripcion: 'COMPRA JUMBO', categoriaId: 9, cuentaId: 9 });
  });

  it('primero las que empiezan con lo escrito', () => {
    expect(buscarDescripciones(indice, 'jumbo').map((s) => s.descripcion)).toEqual(['Jumbo Online', 'COMPRA JUMBO']);
  });

  it('sin texto no sugiere, y no repite lo ya escrito completo', () => {
    expect(buscarDescripciones(indice, '  ')).toEqual([]);
    expect(buscarDescripciones(indice, 'jumbo online')).toEqual([]);
  });

  it('respeta el máximo', () => {
    expect(buscarDescripciones(indice, 'o', 1)).toHaveLength(1);
  });
});

describe('posible duplicado', () => {
  const existente = mov('2026-10-13', 'COMPRA FARMACIA UNO   CL', 12345);

  it('avisa con mismo monto, fecha cercana y descripción parecida', () => {
    expect(posiblesDuplicados({ fecha: '2026-10-13', monto: 12345, descripcion: 'Compra Farmacia Uno' }, [existente])).toEqual([existente]);
    expect(posiblesDuplicados({ fecha: '2026-10-15', monto: 12345, descripcion: 'farmacia uno' }, [existente])).toEqual([existente]);
    expect(posiblesDuplicados({ fecha: '2026-10-11', monto: 12345, descripcion: 'Compra Farmacia Un' }, [existente])).toEqual([existente]);
  });

  it('no avisa si cambia el monto, la fecha pasa de 2 días o la descripción es otra', () => {
    expect(posiblesDuplicados({ fecha: '2026-10-13', monto: 12346, descripcion: 'Compra Farmacia Uno' }, [existente])).toEqual([]);
    expect(posiblesDuplicados({ fecha: '2026-10-16', monto: 12345, descripcion: 'Compra Farmacia Uno' }, [existente])).toEqual([]);
    expect(posiblesDuplicados({ fecha: '2026-10-13', monto: 12345, descripcion: 'Bencina Copec' }, [existente])).toEqual([]);
  });

  it('sin monto o descripción no avisa; al editar no se compara consigo mismo', () => {
    expect(posiblesDuplicados({ fecha: '2026-10-13', monto: null, descripcion: 'farmacia uno' }, [existente])).toEqual([]);
    expect(posiblesDuplicados({ fecha: '2026-10-13', monto: 12345, descripcion: '' }, [existente])).toEqual([]);
    expect(posiblesDuplicados({ id: existente.id, fecha: '2026-10-13', monto: 12345, descripcion: 'farmacia uno' }, [existente])).toEqual([]);
  });

  it('mide el parecido de textos', () => {
    expect(parecidoDeTextos('abc', 'ABC')).toBe(1);
    expect(parecidoDeTextos('', 'abc')).toBe(0);
    expect(parecidoDeTextos('supermercado lider', 'supermercado jumbo')).toBeGreaterThan(0.5);
    expect(parecidoDeTextos('bencina', 'farmacia')).toBeLessThan(0.3);
  });
});

describe('recordatorio de doble conteo', () => {
  it('aparece solo en pago de tarjetas y giros', () => {
    expect(recordatorioDobleConteo('pago_tarjetas')).toContain('tarjeta');
    expect(recordatorioDobleConteo('giros_efectivo')).toContain('efectivo');
    expect(recordatorioDobleConteo('traspaso_desde')).toBeNull();
    expect(recordatorioDobleConteo(null)).toBeNull();
  });
});

describe('tipo de movimiento al anotar', () => {
  it('la lista muestra solo las categorías del tipo elegido', () => {
    expect(categoriasDelTipo(categorias, 'Ingreso').map((c) => c.id)).toEqual([INGRESO]);
    expect(categoriasDelTipo(categorias, 'Gasto').map((c) => c.id)).toEqual([GASTO]);
    expect(categoriasDelTipo(categorias, 'Traspaso').map((c) => c.id)).toEqual([TRASPASO]);
  });

  it('el botón dice qué se va a guardar', () => {
    expect(etiquetaGuardar('Ingreso')).toBe('Guardar ingreso');
    expect(etiquetaGuardar('Gasto')).toBe('Guardar gasto');
    expect(etiquetaGuardar('Traspaso')).toBe('Guardar traspaso');
  });

  it('el aviso confirma el tipo guardado', () => {
    expect(textoGuardado('Ingreso', '.000', 'Venta')).toBe('Ingreso guardado: .000 · Venta');
    expect(textoGuardado('Gasto', '.000', '')).toBe('Gasto guardado: .000');
    expect(textoGuardado(undefined, '.000', '')).toBe('Guardado: .000');
  });
});

describe('prefijo de por revisar', () => {
  it('lo detecta sin distinguir mayúsculas', () => {
    expect(tienePrefijoRevisar('Revisar: algo')).toBe(true);
    expect(tienePrefijoRevisar('REVISAR algo')).toBe(true);
    expect(tienePrefijoRevisar('Cartola 1; revisar algo')).toBe(false);
    expect(tienePrefijoRevisar('Revisaron algo')).toBe(false);
    expect(tienePrefijoRevisar('')).toBe(false);
  });

  it('lo quita y deja el resto con mayúscula', () => {
    expect(quitarPrefijoRevisar('Revisar: comercio no identificado')).toBe('Comercio no identificado');
    expect(quitarPrefijoRevisar('revisar ¿qué se pagó?')).toBe('¿qué se pagó?');
    expect(quitarPrefijoRevisar('Revisar:')).toBe('');
  });
});
