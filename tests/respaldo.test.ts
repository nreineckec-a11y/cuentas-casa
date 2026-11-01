import 'fake-indexeddb/auto';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { baseVacia, crearCategoria, crearCuenta, crearMovimiento, guardarNotas, type Base } from '../src/lib/base';
import {
  debeRecordarDescarga,
  ErrorDeRespaldo,
  leerRespaldo,
  metadatosDeRespaldo,
  nombreDeRespaldo,
  respaldosSobrantes,
  RESPALDOS_A_CONSERVAR,
  serializarRespaldo,
} from '../src/lib/respaldo';
import {
  crearRespaldo,
  ErrorOtraPestana,
  guardarBase,
  guardarUltimaDescarga,
  leerBase,
  leerContenidoRespaldo,
  leerUltimaDescarga,
  listarRespaldos,
  respaldoDiarioSiFalta,
} from '../src/ui/almacen';

function baseConDatos(): Base {
  let base = crearCategoria(baseVacia(), { nombre: 'Comida', tipo: 'Gasto', presupuestoMensual: null, queIncluye: '' });
  base = crearCuenta(base, { nombre: 'Banco' });
  base = crearMovimiento(base, {
    fecha: '2026-03-10',
    descripcion: 'Compra',
    categoriaId: base.categorias[0]?.id,
    cuentaId: base.cuentas[0]?.id,
    monto: 100,
    nota: '',
    porRevisar: false,
  }).base;
  return guardarNotas(base, 'Notas');
}

describe('archivo de respaldo', () => {
  it('vuelve idéntico', () => {
    const base = baseConDatos();
    expect(leerRespaldo(serializarRespaldo(base))).toEqual(base);
  });

  it.each(['no es json', '{}', '{"app":"otra","creadoEn":"x","base":{}}', '[]'])('rechaza %s', (texto) => {
    expect(() => leerRespaldo(texto)).toThrow(ErrorDeRespaldo);
  });

  it('rechaza un respaldo con datos inválidos', () => {
    const base = baseConDatos();
    const malo = { ...base, movimientos: base.movimientos.map((m) => ({ ...m, monto: -1 })) };
    expect(() => leerRespaldo(serializarRespaldo(malo))).toThrow(ErrorDeRespaldo);
  });

  it('rechaza movimientos sin su categoría o cuenta', () => {
    const base = baseConDatos();
    expect(() => leerRespaldo(serializarRespaldo({ ...base, categorias: [] }))).toThrow('dañado');
    expect(() => leerRespaldo(serializarRespaldo({ ...base, cuentas: [] }))).toThrow('dañado');
    expect(() => leerRespaldo(serializarRespaldo({ ...base, alias: { x: 999 } }))).toThrow('dañado');
  });
});

describe('nombres y rotación', () => {
  it('nombra cada tipo, y el diario es uno por día', () => {
    const ahora = new Date(2026, 10, 1, 15, 30, 5, 7);
    expect(nombreDeRespaldo('diario', ahora)).toBe('diario-2026-11-01');
    expect(nombreDeRespaldo('manual', ahora)).toBe('manual-2026-11-01-153005007');
    expect(nombreDeRespaldo('previo', ahora, 'importar')).toBe('previo-2026-11-01-153005007-importar');
    expect(metadatosDeRespaldo('previo', ahora, 10, 'importar')).toMatchObject({ fecha: '2026-11-01', hora: '15:30', motivo: 'importar', bytes: 10 });
    expect(metadatosDeRespaldo('diario', ahora, 10).hora).toBeNull();
  });

  it('elimina lo más antiguo de cada tipo, sin mezclarlos', () => {
    const diarios = Array.from({ length: 16 }, (_, i) => metadatosDeRespaldo('diario', new Date(2026, 9, i + 1), 1));
    const manual = metadatosDeRespaldo('manual', new Date(2026, 5, 1), 1);
    const sobrantes = respaldosSobrantes([...diarios, manual]);
    expect(sobrantes.map((r) => r.fecha)).toEqual(['2026-10-02', '2026-10-01']);
  });
});

describe('recordatorio de descarga', () => {
  it('sin datos no recuerda nada', () => {
    expect(debeRecordarDescarga(null, '2026-11-01', false)).toBe(false);
  });

  it('recuerda si nunca se descargó, o si pasaron 14 días', () => {
    expect(debeRecordarDescarga(null, '2026-11-01', true)).toBe(true);
    expect(debeRecordarDescarga('2026-10-19', '2026-11-01', true)).toBe(false);
    expect(debeRecordarDescarga('2026-10-18', '2026-11-01', true)).toBe(true);
  });
});

describe('almacén en el navegador', () => {
  beforeEach(async () => {
    await new Promise<void>((resolve, reject) => {
      const solicitud = indexedDB.deleteDatabase('cuentas-casa');
      solicitud.onsuccess = () => resolve();
      solicitud.onerror = () => reject(solicitud.error);
    });
  });

  it('parte vacío y guarda', async () => {
    expect(await leerBase()).toEqual({ base: baseVacia(), revision: 0 });
    const base = baseConDatos();
    expect(await guardarBase(base, 0)).toBe(1);
    expect(await leerBase()).toEqual({ base, revision: 1 });
  });

  it('si otra pestaña guardó antes, falla sin pisar lo suyo', async () => {
    const suyo = baseConDatos();
    await guardarBase(suyo, 0);
    await expect(guardarBase(baseVacia(), 0)).rejects.toThrow(ErrorOtraPestana);
    expect((await leerBase()).base).toEqual(suyo);
  });

  it('crea una copia diaria por día, y la copia se puede volver a leer', async () => {
    const base = baseConDatos();
    const creado = await respaldoDiarioSiFalta(base, new Date(2026, 10, 1, 9));
    expect(creado?.nombre).toBe('diario-2026-11-01');
    expect(await respaldoDiarioSiFalta(base, new Date(2026, 10, 1, 22))).toBeNull();
    expect((await respaldoDiarioSiFalta(base, new Date(2026, 10, 2, 9)))?.nombre).toBe('diario-2026-11-02');
    expect(leerRespaldo((await leerContenidoRespaldo('diario-2026-11-01')) as string)).toEqual(base);
  });

  it('conserva las últimas 14 de cada tipo, y borra también su contenido', async () => {
    const base = baseConDatos();
    for (let dia = 1; dia <= 16; dia++) await respaldoDiarioSiFalta(base, new Date(2026, 9, dia, 9));
    await crearRespaldo(base, 'manual', { ahora: new Date(2026, 5, 1, 9) });
    const lista = await listarRespaldos();
    const diarios = lista.filter((r) => r.tipo === 'diario');
    expect(diarios).toHaveLength(RESPALDOS_A_CONSERVAR);
    expect(diarios[0]?.fecha).toBe('2026-10-16');
    expect(diarios.at(-1)?.fecha).toBe('2026-10-03');
    expect(lista.filter((r) => r.tipo === 'manual')).toHaveLength(1);
    expect(await leerContenidoRespaldo('diario-2026-10-01')).toBeNull();
  });

  it('recuerda la última descarga', async () => {
    expect(await leerUltimaDescarga()).toBeNull();
    await guardarUltimaDescarga('2026-11-01');
    expect(await leerUltimaDescarga()).toBe('2026-11-01');
  });
});

describe('privacidad', () => {
  function archivos(carpeta: string): string[] {
    return readdirSync(carpeta).flatMap((nombre) => {
      const ruta = join(carpeta, nombre);
      return statSync(ruta).isDirectory() ? archivos(ruta) : [ruta];
    });
  }

  it('el código de la app no hace llamadas de red', () => {
    for (const ruta of archivos('src')) {
      const texto = readFileSync(ruta, 'utf8');
      expect(texto, ruta).not.toMatch(/\bfetch\s*\(|XMLHttpRequest|WebSocket|sendBeacon|EventSource/);
    }
  });

  it('el sitio publicado no puede conectarse a otros servidores', () => {
    const configuracion = readFileSync('vite.config.ts', 'utf8');
    expect(configuracion).toContain(`"connect-src 'self'"`);
    expect(configuracion).toContain(`"default-src 'self'"`);
  });

  it('Git ignora los datos', () => {
    const ignorados = readFileSync('.gitignore', 'utf8');
    for (const patron of ['datos/', '*.xlsx', '*.db']) expect(ignorados).toContain(patron);
  });
});
