import { baseVacia, type Base } from '../lib/base';
import { metadatosDeRespaldo, ordenarRespaldos, respaldosSobrantes, serializarRespaldo } from '../lib/respaldo';
import type { Respaldo } from '../lib/tipos';

/** Persistencia en IndexedDB. Nada sale del dispositivo. */

const NOMBRE_DB = 'cuentas-casa';
const STORE_BASE = 'base';
const STORE_RESPALDOS = 'respaldos';
const STORE_CONTENIDOS = 'contenidos';
const CLAVE_ACTUAL = 'actual';
const CLAVE_ULTIMA_DESCARGA = 'ultima-descarga';

interface RegistroBase {
  base: Base;
  /** Crece con cada guardado: delata si otra pestaña escribió entre medio. */
  revision: number;
}

export class ErrorOtraPestana extends Error {
  constructor() {
    super('Los datos cambiaron en otra pestaña. Se actualizó esta; intenta de nuevo.');
  }
}

function abrir(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const solicitud = indexedDB.open(NOMBRE_DB, 1);
    solicitud.onupgradeneeded = () => {
      for (const store of [STORE_BASE, STORE_RESPALDOS, STORE_CONTENIDOS]) solicitud.result.createObjectStore(store);
    };
    solicitud.onsuccess = () => resolve(solicitud.result);
    solicitud.onerror = () => reject(solicitud.error);
  });
}

function pedir<T>(solicitud: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    solicitud.onsuccess = () => resolve(solicitud.result);
    solicitud.onerror = () => reject(solicitud.error);
  });
}

function terminar(transaccion: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaccion.oncomplete = () => resolve();
    transaccion.onerror = () => reject(transaccion.error);
    transaccion.onabort = () => reject(transaccion.error);
  });
}

async function conDb<T>(accion: (db: IDBDatabase) => Promise<T>): Promise<T> {
  const db = await abrir();
  try {
    return await accion(db);
  } finally {
    db.close();
  }
}

export function leerBase(): Promise<RegistroBase> {
  return conDb(async (db) => {
    const registro = (await pedir(db.transaction(STORE_BASE).objectStore(STORE_BASE).get(CLAVE_ACTUAL))) as RegistroBase | undefined;
    return registro ?? { base: baseVacia(), revision: 0 };
  });
}

/** Guarda solo si nadie escribió desde la revisión leída. Si otra pestaña lo hizo, falla sin perder lo suyo. */
export function guardarBase(base: Base, revisionLeida: number): Promise<number> {
  return conDb(async (db) => {
    const transaccion = db.transaction(STORE_BASE, 'readwrite');
    const store = transaccion.objectStore(STORE_BASE);
    const actual = (await pedir(store.get(CLAVE_ACTUAL))) as RegistroBase | undefined;
    if ((actual?.revision ?? 0) !== revisionLeida) {
      transaccion.abort();
      throw new ErrorOtraPestana();
    }
    const revision = revisionLeida + 1;
    store.put({ base, revision } satisfies RegistroBase, CLAVE_ACTUAL);
    await terminar(transaccion);
    return revision;
  });
}

export function leerUltimaDescarga(): Promise<string | null> {
  return conDb(async (db) => {
    const valor = (await pedir(db.transaction(STORE_BASE).objectStore(STORE_BASE).get(CLAVE_ULTIMA_DESCARGA))) as string | undefined;
    return valor ?? null;
  });
}

export function guardarUltimaDescarga(fecha: string): Promise<void> {
  return conDb(async (db) => {
    const transaccion = db.transaction(STORE_BASE, 'readwrite');
    transaccion.objectStore(STORE_BASE).put(fecha, CLAVE_ULTIMA_DESCARGA);
    await terminar(transaccion);
  });
}

export function listarRespaldos(): Promise<Respaldo[]> {
  return conDb(async (db) => {
    const lista = (await pedir(db.transaction(STORE_RESPALDOS).objectStore(STORE_RESPALDOS).getAll())) as Respaldo[];
    return ordenarRespaldos(lista);
  });
}

export function leerContenidoRespaldo(nombre: string): Promise<string | null> {
  return conDb(async (db) => {
    const texto = (await pedir(db.transaction(STORE_CONTENIDOS).objectStore(STORE_CONTENIDOS).get(nombre))) as string | undefined;
    return texto ?? null;
  });
}

/** Guarda una copia dentro del navegador y elimina las que sobran. */
export function crearRespaldo(
  base: Base,
  tipo: Respaldo['tipo'],
  opciones: { motivo?: string; ahora?: Date } = {},
): Promise<Respaldo> {
  const ahora = opciones.ahora ?? new Date();
  const texto = serializarRespaldo(base, ahora.toISOString());
  const respaldo = metadatosDeRespaldo(tipo, ahora, texto.length, opciones.motivo);
  return conDb(async (db) => {
    const lista = (await pedir(db.transaction(STORE_RESPALDOS).objectStore(STORE_RESPALDOS).getAll())) as Respaldo[];
    const sobrantes = respaldosSobrantes([...lista.filter((r) => r.nombre !== respaldo.nombre), respaldo]);
    const transaccion = db.transaction([STORE_RESPALDOS, STORE_CONTENIDOS], 'readwrite');
    const metadatos = transaccion.objectStore(STORE_RESPALDOS);
    const contenidos = transaccion.objectStore(STORE_CONTENIDOS);
    metadatos.put(respaldo, respaldo.nombre);
    contenidos.put(texto, respaldo.nombre);
    for (const { nombre } of sobrantes) {
      metadatos.delete(nombre);
      contenidos.delete(nombre);
    }
    await terminar(transaccion);
    return respaldo;
  });
}

/** Entrega el respaldo si lo creó, o null si hoy ya había uno. */
export async function respaldoDiarioSiFalta(base: Base, ahora = new Date()): Promise<Respaldo | null> {
  const nombre = metadatosDeRespaldo('diario', ahora, 0).nombre;
  const existe = await conDb((db) => pedir(db.transaction(STORE_RESPALDOS).objectStore(STORE_RESPALDOS).getKey(nombre)));
  if (existe !== undefined) return null;
  return crearRespaldo(base, 'diario', { ahora });
}

/** Pide al navegador que no borre los datos solo, si le falta espacio. */
export function pedirAlmacenamientoPersistente(): void {
  void navigator.storage?.persist?.().catch(() => undefined);
}
