import { beforeEach, describe, expect, it } from 'vitest';
import {
  baseVacia,
  borrarCategoria,
  borrarCuenta,
  borrarMovimientos,
  crearCategoria,
  crearCuenta,
  crearMovimiento,
  editarCategoria,
  editarCuenta,
  editarLote,
  editarMovimiento,
  ErrorDeDatos,
  excluirMes,
  fusionarCategoria,
  guardarNotas,
  incluirMes,
  mesesExcluidos,
  movimientosVigentes,
  ordenadas,
  ordenarCategorias,
  ordenarCuentas,
  restaurarMovimientos,
  type Base,
} from '../src/lib/base';
import { calcularResumenAnual } from '../src/lib/calculos';
import { importarLibro } from '../src/lib/importar';
import { moverEnGrupo } from '../src/lib/movimientos';

// Todos los datos son inventados.
const COMIDA = 1;
const CASA = 2;
const SUELDO = 3;
const DESDE = 4;
const BANCO = 5;
const EFECTIVO = 6;

const DATOS = { fecha: '2026-03-10', descripcion: 'Compra', categoriaId: COMIDA, monto: 1000, cuentaId: BANCO, nota: '', porRevisar: false };

function baseDePrueba(): Base {
  const categoria = (id: number, nombre: string, tipo: 'Ingreso' | 'Gasto' | 'Traspaso', orden: number) => ({
    id,
    nombre,
    tipo,
    presupuestoMensual: null as number | null,
    queIncluye: '',
    orden,
    activa: true,
    rol: null as Base['categorias'][number]['rol'],
    nombreExcel: null as string | null,
  });
  return {
    ...baseVacia(),
    siguienteId: 7,
    categorias: [
      { ...categoria(COMIDA, 'Comida', 'Gasto', 1), presupuestoMensual: 500, nombreExcel: 'Comida' },
      categoria(CASA, 'Casa', 'Gasto', 2),
      categoria(SUELDO, 'Sueldo', 'Ingreso', 3),
      { ...categoria(DESDE, 'Desde', 'Traspaso', 4), rol: 'traspaso_desde' },
    ],
    cuentas: [
      { id: BANCO, nombre: 'Banco', orden: 1, activa: true, nombreExcel: null },
      { id: EFECTIVO, nombre: 'Efectivo', orden: 2, activa: true, nombreExcel: null },
    ],
  };
}

const totales = (base: Base) =>
  calcularResumenAnual({ categorias: base.categorias, movimientos: movimientosVigentes(base), excluidos: mesesExcluidos(base) }, 2026);

describe('movimientos', () => {
  let base: Base;
  beforeEach(() => {
    base = baseDePrueba();
  });
  const crear = (extra: object = {}) => {
    const r = crearMovimiento(base, { ...DATOS, ...extra }, 'ahora');
    base = r.base;
    return r.movimiento;
  };

  it('crea uno manual, sin clave de importación', () => {
    const m = crear();
    expect(m).toMatchObject({ ...DATOS, origen: 'manual', claveImport: null, creadoEn: 'ahora', borradoEn: null });
    expect(m.id).toBe(7);
    expect(base.siguienteId).toBe(8);
  });

  it('una operación no modifica la base anterior', () => {
    const antes = base;
    crear();
    expect(antes.movimientos).toHaveLength(0);
    expect(base.movimientos).toHaveLength(1);
  });

  it('rechaza datos inválidos con un mensaje en español', () => {
    expect(() => crear({ monto: 0 })).toThrow('El monto debe ser mayor que cero');
    expect(() => crear({ fecha: '2026-02-31' })).toThrow(ErrorDeDatos);
    expect(() => crear({ categoriaId: 99 })).toThrow('Esa categoría no existe.');
    expect(() => crear({ cuentaId: 99 })).toThrow('Esa cuenta no existe.');
  });

  it('edita solo lo enviado y marca la fecha de edición', () => {
    const { id } = crear();
    const r = editarMovimiento(base, id, { monto: 2500, porRevisar: true }, 'despues');
    expect(r.movimiento).toMatchObject({ ...DATOS, monto: 2500, porRevisar: true, editadoEn: 'despues' });
  });

  it('al editar valida, y un id inexistente falla', () => {
    const { id } = crear();
    expect(() => editarMovimiento(base, id, { monto: -1 })).toThrow(ErrorDeDatos);
    expect(() => editarMovimiento(base, id, {})).toThrow('No hay cambios');
    expect(() => editarMovimiento(base, id, { categoriaId: 99 })).toThrow(ErrorDeDatos);
    expect(() => editarMovimiento(base, 9999, { monto: 1 })).toThrow('ya no existe');
  });

  it('cambia la categoría y la cuenta en lote', () => {
    const a = crear();
    const b = crear();
    const c = crear();
    base = editarLote(base, [a.id, b.id], { categoriaId: CASA });
    base = editarLote(base, [a.id], { cuentaId: EFECTIVO });
    const buscar = (id: number) => base.movimientos.find((m) => m.id === id);
    expect(buscar(a.id)).toMatchObject({ categoriaId: CASA, cuentaId: EFECTIVO });
    expect(buscar(b.id)).toMatchObject({ categoriaId: CASA, cuentaId: BANCO });
    expect(buscar(c.id)).toMatchObject({ categoriaId: COMIDA, cuentaId: BANCO });
  });

  it('el lote exige cambios y referencias válidas', () => {
    const { id } = crear();
    expect(() => editarLote(base, [id], {})).toThrow(ErrorDeDatos);
    expect(() => editarLote(base, [], { cuentaId: BANCO })).toThrow(ErrorDeDatos);
    expect(() => editarLote(base, [id], { categoriaId: 99 })).toThrow(ErrorDeDatos);
  });

  it('borrar es suave y se puede deshacer', () => {
    const a = crear();
    const b = crear();
    base = borrarMovimientos(base, [a.id], 'x');
    expect(movimientosVigentes(base).map((m) => m.id)).toEqual([b.id]);
    expect(base.movimientos).toHaveLength(2);
    base = restaurarMovimientos(base, [a.id]);
    expect(movimientosVigentes(base)).toHaveLength(2);
  });

  it('no se edita lo borrado, ni un lote lo cambia', () => {
    const { id } = crear();
    base = borrarMovimientos(base, [id], 'x');
    expect(() => editarMovimiento(base, id, { monto: 1 })).toThrow('ya no existe');
    base = editarLote(base, [id], { cuentaId: EFECTIVO });
    expect(base.movimientos[0]?.cuentaId).toBe(BANCO);
  });
});

describe('meses excluidos y notas', () => {
  it('excluye un mes y actualiza el motivo', () => {
    let base = excluirMes(baseDePrueba(), { anio: 2026, mes: 10, motivo: 'Incompleto' });
    base = excluirMes(base, { anio: 2026, mes: 10, motivo: 'Otro' });
    expect(base.excluidos).toEqual([{ anio: 2026, mes: 10, motivo: 'Otro' }]);
    expect(mesesExcluidos(base).has('2026-10')).toBe(true);
  });

  it('vuelve a incluir un mes, sin fallar si ya no estaba', () => {
    let base = excluirMes(baseDePrueba(), { anio: 2026, mes: 10, motivo: 'x' });
    base = excluirMes(base, { anio: 2026, mes: 2, motivo: 'y' });
    base = incluirMes(base, 2026, 10);
    expect(base.excluidos).toEqual([{ anio: 2026, mes: 2, motivo: 'y' }]);
    expect(incluirMes(base, 2026, 10).excluidos).toHaveLength(1);
  });

  it('exige un motivo y un mes válido', () => {
    expect(() => excluirMes(baseDePrueba(), { anio: 2026, mes: 10, motivo: ' ' })).toThrow(ErrorDeDatos);
    expect(() => excluirMes(baseDePrueba(), { anio: 2026, mes: 13, motivo: 'x' })).toThrow(ErrorDeDatos);
  });

  it('guarda las notas de conciliación y se pueden vaciar', () => {
    const base = guardarNotas(baseDePrueba(), 'Hola');
    expect(base.notasConciliacion).toBe('Hola');
    expect(guardarNotas(base, '').notasConciliacion).toBe('');
  });
});

describe('categorías', () => {
  let base: Base;
  beforeEach(() => {
    base = baseDePrueba();
  });
  const NUEVA = { nombre: 'Nueva', tipo: 'Gasto', presupuestoMensual: 100, queIncluye: 'x' };

  it('crea al final del orden', () => {
    const nueva = crearCategoria(base, NUEVA).categorias.at(-1);
    expect(nueva).toMatchObject({ nombre: 'Nueva', orden: 5, presupuestoMensual: 100, activa: true, rol: null });
  });

  it('valida y no acepta nombres repetidos, aunque cambien las mayúsculas', () => {
    expect(() => crearCategoria(base, { ...NUEVA, nombre: ' ' })).toThrow('Escribe el nombre');
    expect(() => crearCategoria(base, { ...NUEVA, tipo: 'Otro' })).toThrow(ErrorDeDatos);
    expect(() => crearCategoria(base, { ...NUEVA, presupuestoMensual: -1 })).toThrow(ErrorDeDatos);
    expect(() => crearCategoria(base, { ...NUEVA, nombre: 'COMIDA' })).toThrow('Ya existe');
  });

  it('renombrar se propaga a sus movimientos', () => {
    base = crearMovimiento(base, DATOS).base;
    base = editarCategoria(base, COMIDA, { nombre: 'Alimentos' });
    expect(totales(base).filas.find((f) => f.categoria.nombre === 'Alimentos')?.total).toBe(1000);
  });

  it('fija y quita el presupuesto', () => {
    base = editarCategoria(base, CASA, { presupuestoMensual: 900 });
    expect(base.categorias.find((c) => c.id === CASA)?.presupuestoMensual).toBe(900);
    base = editarCategoria(base, CASA, { presupuestoMensual: null });
    expect(base.categorias.find((c) => c.id === CASA)?.presupuestoMensual).toBeNull();
  });

  it('al renombrar no choca consigo misma, pero sí con otra', () => {
    expect(editarCategoria(base, CASA, { nombre: 'casa' }).categorias[1]?.nombre).toBe('casa');
    expect(() => editarCategoria(base, CASA, { nombre: 'Comida' })).toThrow('Ya existe');
    expect(() => editarCategoria(base, 999, { nombre: 'x' })).toThrow('ya no existe');
  });

  it('una categoría especial no cambia de tipo, pero sí de nombre', () => {
    expect(() => editarCategoria(base, DESDE, { tipo: 'Gasto' })).toThrow('función especial');
    expect(editarCategoria(base, DESDE, { tipo: 'Traspaso', nombre: 'Traído' }).categorias[3]?.nombre).toBe('Traído');
  });

  it('archivar la conserva con sus movimientos', () => {
    base = crearMovimiento(base, DATOS).base;
    base = editarCategoria(base, COMIDA, { activa: false });
    expect(base.categorias[0]?.activa).toBe(false);
    expect(movimientosVigentes(base)).toHaveLength(1);
  });

  it('no se borra si tiene movimientos, aunque estén borrados', () => {
    const r = crearMovimiento(base, DATOS);
    const conBorrado = borrarMovimientos(r.base, [r.movimiento.id]);
    expect(() => borrarCategoria(conBorrado, COMIDA)).toThrow('1 movimiento');
  });

  it('sin movimientos se borra; una especial no', () => {
    expect(borrarCategoria(base, CASA).categorias.some((c) => c.id === CASA)).toBe(false);
    expect(() => borrarCategoria(base, DESDE)).toThrow('función especial');
  });

  it('reordena con la lista completa, y rechaza una incompleta', () => {
    const nueva = ordenarCategorias(base, [CASA, COMIDA, SUELDO, DESDE]);
    expect(ordenadas(nueva.categorias).map((c) => c.id)).toEqual([CASA, COMIDA, SUELDO, DESDE]);
    expect(() => ordenarCategorias(base, [CASA, COMIDA])).toThrow('La lista cambió');
    expect(() => ordenarCategorias(base, [CASA, CASA, SUELDO, DESDE])).toThrow('La lista cambió');
  });
});

describe('fusión', () => {
  let base: Base;
  beforeEach(() => {
    base = baseDePrueba();
  });

  it('mueve los movimientos, incluidos los borrados, y elimina la categoría', () => {
    base = crearMovimiento(base, { ...DATOS, categoriaId: CASA, monto: 10 }).base;
    const r = crearMovimiento(base, { ...DATOS, categoriaId: CASA, monto: 20 });
    base = borrarMovimientos(r.base, [r.movimiento.id]);
    base = crearMovimiento(base, { ...DATOS, monto: 5 }).base;
    const antes = totales(base).totales;

    const fusion = fusionarCategoria(base, CASA, COMIDA);
    expect(fusion.movidos).toBe(2);
    expect(fusion.base.categorias.some((c) => c.id === CASA)).toBe(false);
    expect(fusion.base.movimientos.filter((m) => m.categoriaId === COMIDA)).toHaveLength(3);
    // Los totales no cambian: es la misma plata en otra categoría.
    expect(totales(fusion.base).totales).toEqual(antes);
  });

  it('hereda el presupuesto solo si el destino no tiene', () => {
    expect(fusionarCategoria(base, COMIDA, CASA).base.categorias.find((c) => c.id === CASA)?.presupuestoMensual).toBe(500);
    const conPresupuesto = editarCategoria(base, CASA, { presupuestoMensual: 7 });
    expect(fusionarCategoria(conPresupuesto, COMIDA, CASA).base.categorias.find((c) => c.id === CASA)?.presupuestoMensual).toBe(7);
  });

  it('rechaza distinto tipo, categorías especiales, ella misma e inexistentes', () => {
    expect(() => fusionarCategoria(base, COMIDA, SUELDO)).toThrow('mismo tipo');
    expect(() => fusionarCategoria(base, DESDE, COMIDA)).toThrow('función especial');
    expect(() => fusionarCategoria(base, COMIDA, COMIDA)).toThrow(ErrorDeDatos);
    expect(() => fusionarCategoria(base, COMIDA, 999)).toThrow('ya no existe');
  });

  it('reimportar un Excel con el nombre fusionado no la recrea y cae en el destino', () => {
    base = fusionarCategoria(base, COMIDA, CASA).base;
    expect(base.alias).toEqual({ comida: CASA });
    const { base: nueva, reporte } = importarLibro(base, {
      categorias: [{ fila: 6, nombre: 'Comida', tipo: 'Gasto', presupuesto: null, queIncluye: '' }],
      cuentas: ['Banco'],
      movimientos: [{ fila: 5, fecha: new Date('2026-04-01T00:00:00Z'), descripcion: 'X', categoria: 'Comida', monto: 7, cuenta: 'Banco', nota: null }],
      notasConciliacion: null,
    });
    expect(reporte.categoriasCreadas).toBe(0);
    expect(reporte.categoriasNoReconocidas).toEqual({});
    expect(reporte.importadas).toBe(1);
    expect(nueva.movimientos[0]?.categoriaId).toBe(CASA);
  });

  it('una fusión en cadena mantiene los alias apuntando al destino final', () => {
    base = crearCategoria(base, { nombre: 'Tercera', tipo: 'Gasto', presupuestoMensual: null, queIncluye: '' });
    const tercera = base.categorias.at(-1)?.id as number;
    base = fusionarCategoria(base, COMIDA, CASA).base;
    base = fusionarCategoria(base, CASA, tercera).base;
    expect(Object.values(base.alias).every((id) => id === tercera)).toBe(true);
  });
});

describe('cuentas', () => {
  it('crea, renombra, archiva y reordena', () => {
    let base = crearCuenta(baseDePrueba(), { nombre: 'Nueva' });
    const id = base.cuentas.at(-1)?.id as number;
    base = editarCuenta(base, id, { nombre: 'Otra', activa: false });
    expect(base.cuentas.at(-1)).toMatchObject({ nombre: 'Otra', activa: false });
    base = ordenarCuentas(base, [id, BANCO, EFECTIVO]);
    expect(ordenadas(base.cuentas)[0]?.id).toBe(id);
    expect(() => crearCuenta(base, { nombre: 'banco' })).toThrow('Ya existe');
  });

  it('no se borra si tiene movimientos', () => {
    const base = crearMovimiento(baseDePrueba(), DATOS).base;
    expect(() => borrarCuenta(base, BANCO)).toThrow('1 movimiento');
    expect(borrarCuenta(base, EFECTIVO).cuentas).toHaveLength(1);
  });
});

describe('orden en la pantalla', () => {
  const lista = [
    { id: 1, g: 'a' },
    { id: 2, g: 'b' },
    { id: 3, g: 'a' },
    { id: 4, g: 'a' },
  ];
  const mismo = (x: { g: string }, y: { g: string }) => x.g === y.g;

  it('salta hasta el vecino de su mismo grupo', () => {
    expect(moverEnGrupo(lista, 3, -1, mismo)).toEqual([3, 2, 1, 4]);
    expect(moverEnGrupo(lista, 1, 1, mismo)).toEqual([3, 2, 1, 4]);
    expect(moverEnGrupo(lista, 3, 1, mismo)).toEqual([1, 2, 4, 3]);
  });

  it('en el extremo de su grupo no se mueve', () => {
    expect(moverEnGrupo(lista, 1, -1, mismo)).toBeNull();
    expect(moverEnGrupo(lista, 2, 1, mismo)).toBeNull();
    expect(moverEnGrupo(lista, 99, 1, mismo)).toBeNull();
  });

  it('sin grupos, intercambia con el vecino', () => {
    expect(moverEnGrupo(lista, 2, -1)).toEqual([2, 1, 3, 4]);
  });
});
