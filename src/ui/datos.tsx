import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
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
  type MovimientoGuardado,
} from '../lib/base';
import { crearMes, type Mes } from '../lib/calculos';
import type { CambiosCategoria, CambiosCuenta, CambiosMovimiento, DatosCategoria, DatosMovimiento } from '../lib/esquemas';
import { construirLibro, extraerFilas, generarCsv, ErrorDeImportacion } from '../lib/excel';
import { fechaDeHoy } from '../lib/formato';
import { importarLibro } from '../lib/importar';
import { debeRecordarDescarga, ErrorDeRespaldo, leerRespaldo, serializarRespaldo } from '../lib/respaldo';
import type { Categoria, Cuenta, MesExcluido, ReporteImportacion, Respaldo } from '../lib/tipos';
import {
  crearRespaldo as crearRespaldoInterno,
  ErrorOtraPestana,
  guardarBase,
  guardarUltimaDescarga,
  leerBase,
  leerContenidoRespaldo,
  leerUltimaDescarga,
  listarRespaldos,
  pedirAlmacenamientoPersistente,
  respaldoDiarioSiFalta,
} from './almacen';
import { entregarArchivo, nuevoLibro } from './archivos';

const CANAL = 'cuentas-casa';
const TIPO_XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

interface ContextoDatos {
  categorias: Categoria[];
  categoriaPorId: Map<number, Categoria>;
  cuentas: Cuenta[];
  cuentaPorId: Map<number, Cuenta>;
  movimientos: MovimientoGuardado[];
  excluidos: ReadonlySet<Mes>;
  motivoDeExclusion: ReadonlyMap<Mes, string>;
  porRevisar: number;
  notasConciliacion: string;
  recordarDescarga: boolean;

  crearMovimiento: (datos: DatosMovimiento) => Promise<MovimientoGuardado>;
  editarMovimiento: (id: number, cambios: CambiosMovimiento) => Promise<MovimientoGuardado>;
  editarLote: (ids: number[], cambios: { categoriaId?: number; cuentaId?: number }) => Promise<void>;
  borrar: (ids: number[]) => Promise<void>;
  restaurar: (ids: number[]) => Promise<void>;
  excluirMes: (exclusion: MesExcluido) => Promise<void>;
  incluirMes: (anio: number, mes: number) => Promise<void>;
  guardarNotas: (texto: string) => Promise<void>;

  crearCategoria: (datos: DatosCategoria) => Promise<void>;
  editarCategoria: (id: number, cambios: CambiosCategoria) => Promise<void>;
  borrarCategoria: (id: number) => Promise<void>;
  ordenarCategorias: (ids: number[]) => Promise<void>;
  fusionarCategoria: (id: number, destinoId: number) => Promise<{ movidos: number }>;
  crearCuenta: (nombre: string) => Promise<void>;
  editarCuenta: (id: number, cambios: CambiosCuenta) => Promise<void>;
  borrarCuenta: (id: number) => Promise<void>;
  ordenarCuentas: (ids: number[]) => Promise<void>;

  vistaPreviaImportacion: (archivo: File) => Promise<ReporteImportacion>;
  importar: (archivo: File) => Promise<ReporteImportacion>;
  exportarXlsx: () => Promise<void>;
  exportarCsv: () => Promise<void>;

  respaldos: Respaldo[];
  crearRespaldo: () => Promise<void>;
  descargarRespaldoActual: () => Promise<void>;
  descargarRespaldo: (respaldo: Respaldo) => Promise<void>;
  restaurarRespaldo: (respaldo: Respaldo) => Promise<void>;
  restaurarDesdeArchivo: (archivo: File) => Promise<void>;
}

const Contexto = createContext<ContextoDatos | null>(null);

function nombreDeArchivo(extension: string): string {
  return `cuentas-casa-${fechaDeHoy()}.${extension}`;
}

async function leerLibro(archivo: File) {
  const libro = await nuevoLibro();
  try {
    await libro.xlsx.load(await archivo.arrayBuffer());
  } catch {
    throw new ErrorDeImportacion('No se pudo leer el archivo. Revisa que sea un Excel (.xlsx).');
  }
  return extraerFilas(libro);
}

export function ProveedorDatos({ children }: { children: ReactNode }) {
  const [base, setBase] = useState<Base | null>(null);
  const [respaldos, setRespaldos] = useState<Respaldo[]>([]);
  const [ultimaDescarga, setUltimaDescarga] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const actual = useRef<{ base: Base; revision: number } | null>(null);
  // Los guardados van en fila: dos toques seguidos no deben pisarse.
  const cola = useRef<Promise<unknown>>(Promise.resolve());
  const canal = useRef<BroadcastChannel | null>(null);

  const recargar = useCallback(async () => {
    const registro = await leerBase();
    actual.current = registro;
    setBase(registro.base);
  }, []);

  const recargarRespaldos = useCallback(async () => {
    setRespaldos(await listarRespaldos());
  }, []);

  useEffect(() => {
    let vigente = true;
    void (async () => {
      try {
        const registro = await leerBase();
        if (!vigente) return;
        actual.current = registro;
        setBase(registro.base);
        setUltimaDescarga(await leerUltimaDescarga());
        pedirAlmacenamientoPersistente();
        if (registro.base.movimientos.length > 0) await respaldoDiarioSiFalta(registro.base);
        if (vigente) await recargarRespaldos();
      } catch (fallo) {
        if (vigente) setError(`No se pudieron leer los datos de este navegador. ${(fallo as Error).message}`);
      }
    })();

    // Lo guardado en otra pestaña aparece aquí.
    const nuevoCanal = typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel(CANAL);
    if (nuevoCanal) {
      nuevoCanal.onmessage = () => {
        void recargar();
        void recargarRespaldos();
      };
    }
    canal.current = nuevoCanal;
    return () => {
      vigente = false;
      nuevoCanal?.close();
    };
  }, [recargar, recargarRespaldos]);

  /** Calcula la base nueva y la guarda. Si algo falla, los datos quedan como estaban. */
  const aplicar = useCallback(
    <T,>(operacion: (base: Base) => { base: Base; resultado: T }): Promise<T> => {
      const paso = cola.current.then(async () => {
        const estado = actual.current;
        if (!estado) throw new Error('Los datos todavía no terminan de cargar.');
        const { base: nueva, resultado } = operacion(estado.base);
        try {
          const revision = await guardarBase(nueva, estado.revision);
          actual.current = { base: nueva, revision };
        } catch (fallo) {
          if (fallo instanceof ErrorOtraPestana) await recargar();
          throw fallo;
        }
        setBase(nueva);
        canal.current?.postMessage('cambio');
        return resultado;
      });
      cola.current = paso.catch(() => undefined);
      return paso;
    },
    [recargar],
  );

  const cambiar = useCallback(
    (operacion: (base: Base) => Base) => aplicar((b) => ({ base: operacion(b), resultado: undefined })),
    [aplicar],
  );

  const respaldoPrevio = useCallback(
    async (motivo: string) => {
      if (actual.current) await crearRespaldoInterno(actual.current.base, 'previo', { motivo });
      await recargarRespaldos();
    },
    [recargarRespaldos],
  );

  const reemplazarCon = useCallback(
    async (nueva: Base) => {
      await respaldoPrevio('restaurar');
      await cambiar(() => nueva);
      await recargarRespaldos();
    },
    [cambiar, respaldoPrevio, recargarRespaldos],
  );

  const marcarDescarga = useCallback(async () => {
    const hoy = fechaDeHoy();
    await guardarUltimaDescarga(hoy);
    setUltimaDescarga(hoy);
  }, []);

  const valor = useMemo<ContextoDatos | null>(() => {
    if (!base) return null;
    const categorias = ordenadas(base.categorias);
    const cuentas = ordenadas(base.cuentas);
    const movimientos = movimientosVigentes(base);
    return {
      categorias,
      categoriaPorId: new Map(categorias.map((c) => [c.id, c])),
      cuentas,
      cuentaPorId: new Map(cuentas.map((c) => [c.id, c])),
      movimientos,
      excluidos: mesesExcluidos(base),
      motivoDeExclusion: new Map(base.excluidos.map((m) => [crearMes(m.anio, m.mes), m.motivo])),
      porRevisar: movimientos.reduce((n, m) => n + (m.porRevisar ? 1 : 0), 0),
      notasConciliacion: base.notasConciliacion,
      recordarDescarga: debeRecordarDescarga(ultimaDescarga, fechaDeHoy(), movimientos.length > 0),

      crearMovimiento: (datos) =>
        aplicar((b) => {
          const r = crearMovimiento(b, datos);
          return { base: r.base, resultado: r.movimiento };
        }),
      editarMovimiento: (id, cambios) =>
        aplicar((b) => {
          const r = editarMovimiento(b, id, cambios);
          return { base: r.base, resultado: r.movimiento };
        }),
      editarLote: (ids, cambios) => cambiar((b) => editarLote(b, ids, cambios)),
      borrar: (ids) => cambiar((b) => borrarMovimientos(b, ids)),
      restaurar: (ids) => cambiar((b) => restaurarMovimientos(b, ids)),
      excluirMes: (exclusion) => cambiar((b) => excluirMes(b, exclusion)),
      incluirMes: (anio, mes) => cambiar((b) => incluirMes(b, anio, mes)),
      guardarNotas: (texto) => cambiar((b) => guardarNotas(b, texto)),

      crearCategoria: (datos) => cambiar((b) => crearCategoria(b, datos)),
      editarCategoria: (id, cambios) => cambiar((b) => editarCategoria(b, id, cambios)),
      borrarCategoria: (id) => cambiar((b) => borrarCategoria(b, id)),
      ordenarCategorias: (ids) => cambiar((b) => ordenarCategorias(b, ids)),
      fusionarCategoria: async (id, destinoId) => {
        await respaldoPrevio('fusionar');
        return aplicar((b) => {
          const r = fusionarCategoria(b, id, destinoId);
          return { base: r.base, resultado: { movidos: r.movidos } };
        });
      },
      crearCuenta: (nombre) => cambiar((b) => crearCuenta(b, { nombre })),
      editarCuenta: (id, cambios) => cambiar((b) => editarCuenta(b, id, cambios)),
      borrarCuenta: (id) => cambiar((b) => borrarCuenta(b, id)),
      ordenarCuentas: (ids) => cambiar((b) => ordenarCuentas(b, ids)),

      vistaPreviaImportacion: async (archivo) => {
        const libro = await leerLibro(archivo);
        const estado = actual.current;
        if (!estado) throw new Error('Los datos todavía no terminan de cargar.');
        return importarLibro(estado.base, libro, { simular: true }).reporte;
      },
      importar: async (archivo) => {
        const libro = await leerLibro(archivo);
        await respaldoPrevio('importar');
        return aplicar((b) => {
          const r = importarLibro(b, libro);
          return { base: r.base, resultado: r.reporte };
        });
      },
      exportarXlsx: async () => {
        const libro = construirLibro(base, await nuevoLibro());
        await entregarArchivo(await libro.xlsx.writeBuffer(), nombreDeArchivo('xlsx'), TIPO_XLSX);
      },
      exportarCsv: () => entregarArchivo(generarCsv(base), nombreDeArchivo('csv'), 'text/csv;charset=utf-8'),

      respaldos,
      crearRespaldo: async () => {
        await crearRespaldoInterno(base, 'manual');
        await recargarRespaldos();
      },
      descargarRespaldoActual: async () => {
        await entregarArchivo(serializarRespaldo(base), `cuentas-casa-respaldo-${fechaDeHoy()}.json`, 'application/json');
        await marcarDescarga();
      },
      descargarRespaldo: async (respaldo) => {
        const texto = await leerContenidoRespaldo(respaldo.nombre);
        if (texto === null) throw new ErrorDeRespaldo('Ese respaldo ya no existe.');
        await entregarArchivo(texto, `cuentas-casa-respaldo-${respaldo.nombre}.json`, 'application/json');
        await marcarDescarga();
      },
      restaurarRespaldo: async (respaldo) => {
        const texto = await leerContenidoRespaldo(respaldo.nombre);
        if (texto === null) throw new ErrorDeRespaldo('Ese respaldo ya no existe.');
        await reemplazarCon(leerRespaldo(texto));
      },
      restaurarDesdeArchivo: async (archivo) => {
        await reemplazarCon(leerRespaldo(await archivo.text()));
      },
    };
  }, [base, respaldos, ultimaDescarga, aplicar, cambiar, respaldoPrevio, reemplazarCon, recargarRespaldos, marcarDescarga]);

  if (!valor) {
    return <p className="mx-auto max-w-xl p-6 text-center text-lg">{error ?? 'Cargando…'}</p>;
  }

  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

export function useDatos(): ContextoDatos {
  const contexto = useContext(Contexto);
  if (!contexto) throw new Error('useDatos fuera de ProveedorDatos');
  return contexto;
}
