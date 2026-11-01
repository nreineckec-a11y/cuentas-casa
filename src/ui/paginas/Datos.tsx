import { useEffect, useRef, useState, type ChangeEvent, type ReactNode } from 'react';
import { formatearFecha, formatearMoneda } from '../../lib/formato';
import type { ReporteImportacion, Respaldo } from '../../lib/tipos';
import { EntregaCancelada } from '../archivos';
import { useAvisos } from '../avisos';
import { Dialogo } from '../componentes/Dialogo';
import { useDatos } from '../datos';

const MOTIVOS: Record<string, string> = {
  importar: 'antes de importar',
  restaurar: 'antes de restaurar',
  fusionar: 'antes de fusionar',
};

const RESPALDOS_VISIBLES = 5;

function Seccion({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <section className="space-y-3 rounded-lg border border-borde-suave bg-superficie p-4">
      <h2 className="text-xl font-bold">{titulo}</h2>
      {children}
    </section>
  );
}

function Linea({ etiqueta, valor }: { etiqueta: string; valor: number }) {
  return (
    <div className="flex justify-between gap-3 border-b border-borde-suave py-1 last:border-b-0">
      <dt>{etiqueta}</dt>
      <dd className="montos font-semibold">{valor.toLocaleString('es-CL')}</dd>
    </div>
  );
}

const TEXTO_NOTAS: Record<ReporteImportacion['notasConciliacion'], string> = {
  importadas: 'Se importarán desde el archivo.',
  sin_cambios: 'Sin cambios.',
  distintas_se_conservan_las_de_la_app: 'El archivo trae otro texto; se conservan las de la app.',
  no_encontradas: 'El archivo no las trae.',
};

function VistaReporte({ reporte }: { reporte: ReporteImportacion }) {
  const noReconocidas = [
    ...Object.entries(reporte.categoriasNoReconocidas).map(([nombre, n]) => `Categoría «${nombre}»: ${n} filas`),
    ...Object.entries(reporte.cuentasNoReconocidas).map(([nombre, n]) => `Cuenta «${nombre}»: ${n} filas`),
  ];
  const superposiciones = reporte.superposiciones.flat().filter((f) => f.movimientos > 0);
  return (
    <div className="space-y-3">
      <dl>
        <Linea etiqueta="Filas con datos" valor={reporte.filasConDatos} />
        <Linea etiqueta={reporte.simulacion ? 'Movimientos nuevos que se agregarán' : 'Movimientos agregados'} valor={reporte.importadas} />
        <Linea etiqueta="Ya existían" valor={reporte.yaExistian} />
        <Linea etiqueta="Borrados en la app (no vuelven)" valor={reporte.borradasEnLaApp} />
        <Linea etiqueta="Filas omitidas" valor={reporte.omitidas.length} />
        <Linea etiqueta="Categorías nuevas" valor={reporte.categoriasCreadas} />
        <Linea etiqueta="Cuentas nuevas" valor={reporte.cuentasCreadas} />
        <Linea etiqueta="Nuevos por revisar" valor={reporte.porRevisarImportados} />
      </dl>
      <p>
        <span className="font-semibold">Notas de conciliación: </span>
        {TEXTO_NOTAS[reporte.notasConciliacion]}
      </p>
      {noReconocidas.length > 0 && (
        <div className="rounded-lg bg-aviso-fondo p-3 text-aviso-texto">
          <p className="font-semibold">No reconocidas</p>
          <ul>
            {noReconocidas.map((texto) => <li key={texto}>{texto}</li>)}
          </ul>
        </div>
      )}
      {reporte.omitidas.length > 0 && (
        <details className="rounded-lg bg-aviso-fondo p-3 text-aviso-texto" open={reporte.omitidas.length <= 10}>
          <summary className="cursor-pointer font-semibold">Filas omitidas ({reporte.omitidas.length})</summary>
          <ul className="mt-1 max-h-64 overflow-y-auto">
            {reporte.omitidas.map(({ fila, motivos }) => (
              <li key={fila}>Fila {fila}: {motivos.join('; ')}</li>
            ))}
          </ul>
        </details>
      )}
      {reporte.mesesExcluidosAhora.map((m) => (
        <p key={`${m.anio}-${m.mes}`} className="rounded-lg bg-aviso-fondo p-3 text-aviso-texto">
          {String(m.mes).padStart(2, '0')}-{m.anio} {reporte.simulacion ? 'quedará' : 'quedó'} excluido del promedio. {m.motivo}
        </p>
      ))}
      {superposiciones.length > 0 && (
        <details>
          <summary className="cursor-pointer font-semibold">Categorías que se superponen</summary>
          <ul className="mt-1">
            {superposiciones.map((f) => (
              <li key={f.nombre}>{f.nombre}: {f.movimientos} movimientos, {formatearMoneda(f.monto)}</li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

export function SeccionImportar() {
  const { vistaPreviaImportacion, importar: importarArchivo } = useDatos();
  const { mostrarAviso } = useAvisos();
  const entrada = useRef<HTMLInputElement>(null);
  const [archivo, setArchivo] = useState<File | null>(null);
  const [reporte, setReporte] = useState<ReporteImportacion | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  function limpiar() {
    setArchivo(null);
    if (entrada.current) entrada.current.value = '';
  }

  async function alElegir(e: ChangeEvent<HTMLInputElement>) {
    const elegido = e.target.files?.[0];
    setReporte(null);
    setError(null);
    if (!elegido) return;
    setArchivo(elegido);
    setOcupado(true);
    try {
      setReporte(await vistaPreviaImportacion(elegido));
    } catch (fallo) {
      setError((fallo as Error).message);
      limpiar();
    } finally {
      setOcupado(false);
    }
  }

  async function importar() {
    if (!archivo) return;
    setOcupado(true);
    setError(null);
    try {
      const final = await importarArchivo(archivo);
      setReporte(final);
      limpiar();
      mostrarAviso({ texto: `Importación lista: ${final.importadas.toLocaleString('es-CL')} movimientos nuevos.` });
    } catch (fallo) {
      setError((fallo as Error).message);
    } finally {
      setOcupado(false);
    }
  }

  return (
    <Seccion titulo="Importar Excel">
      <p>
        Primero verás qué cambiaría, sin guardar nada. No duplica lo que ya existe ni pisa lo editado en la app. El archivo se lee aquí mismo:
        no se envía a ningún lado.
      </p>
      <div>
        <label htmlFor="importar-archivo" className="etiqueta">Archivo de Excel (.xlsx)</label>
        <input
          ref={entrada}
          id="importar-archivo"
          type="file"
          accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          className="control"
          onChange={(e) => void alElegir(e)}
        />
      </div>
      {ocupado && <p role="status">Leyendo…</p>}
      {error && <p role="alert" className="rounded-lg border-2 border-error p-3 font-semibold text-error">{error}</p>}
      {reporte && (
        <>
          <h3 className="font-bold">{reporte.simulacion ? 'Vista previa: todavía no se guardó nada' : 'Importación terminada'}</h3>
          <VistaReporte reporte={reporte} />
        </>
      )}
      {reporte?.simulacion && archivo && (
        <div className="flex flex-wrap gap-2">
          <button type="button" className="boton boton-primario" disabled={ocupado} onClick={() => void importar()}>
            Importar
          </button>
          <button
            type="button"
            className="boton"
            disabled={ocupado}
            onClick={() => {
              setReporte(null);
              limpiar();
            }}
          >
            Cancelar
          </button>
        </div>
      )}
    </Seccion>
  );
}

function descripcionDe(respaldo: Respaldo): string {
  const fecha = formatearFecha(respaldo.fecha);
  const hora = respaldo.hora ? `, ${respaldo.hora}` : '';
  if (respaldo.tipo === 'diario') return `${fecha} · Diario`;
  if (respaldo.tipo === 'manual') return `${fecha}${hora} · Manual`;
  return `${fecha}${hora} · Automático ${MOTIVOS[respaldo.motivo ?? ''] ?? ''}`.trimEnd();
}

function tamano(bytes: number): string {
  return `${Math.max(1, Math.round(bytes / 1024)).toLocaleString('es-CL')} KB`;
}

type PorRestaurar = { clase: 'guardado'; respaldo: Respaldo } | { clase: 'archivo'; archivo: File };

export function SeccionRespaldos() {
  const { respaldos, crearRespaldo, descargarRespaldoActual, descargarRespaldo, restaurarRespaldo, restaurarDesdeArchivo, movimientos } = useDatos();
  const { mostrarAviso } = useAvisos();
  const [verTodos, setVerTodos] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [porRestaurar, setPorRestaurar] = useState<PorRestaurar | null>(null);
  const entrada = useRef<HTMLInputElement>(null);

  async function ejecutar(accion: () => Promise<void>, aviso?: string) {
    setOcupado(true);
    setError(null);
    try {
      await accion();
      if (aviso) mostrarAviso({ texto: aviso });
    } catch (fallo) {
      if (!(fallo instanceof EntregaCancelada)) setError((fallo as Error).message);
    } finally {
      setOcupado(false);
    }
  }

  async function restaurar(objetivo: PorRestaurar) {
    await ejecutar(
      () => (objetivo.clase === 'guardado' ? restaurarRespaldo(objetivo.respaldo) : restaurarDesdeArchivo(objetivo.archivo)),
      'Respaldo restaurado. Lo anterior quedó guardado en la lista.',
    );
    setPorRestaurar(null);
    if (entrada.current) entrada.current.value = '';
  }

  const visibles = verTodos ? respaldos : respaldos.slice(0, RESPALDOS_VISIBLES);
  const hayDatos = movimientos.length > 0;

  return (
    <Seccion titulo="Respaldos">
      <p>
        <span className="font-semibold">Tus datos están solo en este navegador. </span>
        Si se borran sus datos o pierdes el teléfono, se pierden. Lo único que te protege es un archivo descargado: guárdalo en Drive, en tu correo o en un pendrive.
      </p>
      <div className="flex flex-wrap gap-2">
        <button type="button" className="boton boton-primario" disabled={ocupado || !hayDatos} onClick={() => void ejecutar(descargarRespaldoActual)}>
          Descargar respaldo
        </button>
        <button type="button" className="boton" disabled={ocupado || !hayDatos} onClick={() => void ejecutar(crearRespaldo, 'Copia creada en este navegador.')}>
          Crear copia aquí
        </button>
      </div>
      {error && <p role="alert" className="rounded-lg border-2 border-error p-3 font-semibold text-error">{error}</p>}

      <div>
        <h3 className="font-bold">Copias en este navegador</h3>
        <p className="text-texto-suave">
          Sirven para volver atrás, no reemplazan al archivo descargado. Hay una diaria y otra antes de importar, fusionar o restaurar, y se conservan las últimas 14 de cada tipo.
        </p>
      </div>
      {respaldos.length === 0 && <p className="text-texto-suave">Todavía no hay copias.</p>}
      {visibles.length > 0 && (
        <ul className="rounded-lg border border-borde-suave">
          {visibles.map((respaldo) => (
            <li key={respaldo.nombre} className="flex flex-wrap items-center gap-2 border-b border-borde-suave p-2 last:border-b-0">
              <div className="min-w-0 flex-1 basis-56">
                <p className="font-semibold">{descripcionDe(respaldo)}</p>
                <p className="text-texto-suave">{tamano(respaldo.bytes)}</p>
              </div>
              <button type="button" className="boton" disabled={ocupado} onClick={() => void ejecutar(() => descargarRespaldo(respaldo))}>
                Descargar
              </button>
              <button type="button" className="boton" disabled={ocupado} onClick={() => setPorRestaurar({ clase: 'guardado', respaldo })}>
                Restaurar
              </button>
            </li>
          ))}
        </ul>
      )}
      {respaldos.length > RESPALDOS_VISIBLES && (
        <button type="button" className="boton" onClick={() => setVerTodos((v) => !v)}>
          {verTodos ? 'Ver menos' : `Ver todas (${respaldos.length})`}
        </button>
      )}
      <div>
        <label htmlFor="restaurar-archivo" className="etiqueta">Restaurar desde un archivo descargado (.json)</label>
        <p className="mb-1 text-texto-suave">También sirve para pasar los datos a otro dispositivo.</p>
        <input
          ref={entrada}
          id="restaurar-archivo"
          type="file"
          accept=".json,application/json"
          className="control"
          onChange={(e) => {
            const archivo = e.target.files?.[0];
            if (archivo) setPorRestaurar({ clase: 'archivo', archivo });
          }}
        />
      </div>
      {porRestaurar && (
        <Dialogo
          titulo="Restaurar respaldo"
          forma="centro"
          alCerrar={() => {
            setPorRestaurar(null);
            if (entrada.current) entrada.current.value = '';
          }}
        >
          <div className="space-y-4">
            <p className="rounded-lg bg-aviso-fondo p-3 text-aviso-texto">
              Todos los datos de este dispositivo se reemplazarán por los de «
              {porRestaurar.clase === 'guardado' ? descripcionDe(porRestaurar.respaldo) : porRestaurar.archivo.name}». Lo anotado después de ese respaldo
              desaparece, pero antes se guarda una copia de lo actual, por si te arrepientes.
            </p>
            <button type="button" className="boton boton-primario w-full" disabled={ocupado} onClick={() => void restaurar(porRestaurar)}>
              {ocupado ? 'Restaurando…' : 'Restaurar'}
            </button>
          </div>
        </Dialogo>
      )}
    </Seccion>
  );
}

function SeccionNotas() {
  const { notasConciliacion, guardarNotas } = useDatos();
  const { mostrarAviso } = useAvisos();
  const [texto, setTexto] = useState(notasConciliacion);
  const [editado, setEditado] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Lo que cambió en otra pestaña aparece, salvo que se esté escribiendo aquí.
  useEffect(() => {
    if (!editado) setTexto(notasConciliacion);
  }, [notasConciliacion, editado]);

  async function guardar() {
    try {
      await guardarNotas(texto);
      setEditado(false);
      setError(null);
      mostrarAviso({ texto: 'Notas guardadas.' });
    } catch (fallo) {
      setError((fallo as Error).message);
    }
  }

  return (
    <Seccion titulo="Notas de conciliación">
      <label htmlFor="notas" className="sr-only">Notas de conciliación</label>
      <textarea
        id="notas"
        rows={8}
        className="control"
        placeholder="Qué períodos y cuentas están conciliados"
        value={texto}
        onChange={(e) => {
          setTexto(e.target.value);
          setEditado(true);
        }}
      />
      {error && <p role="alert" className="font-semibold text-error">{error}</p>}
      <button type="button" className="boton boton-primario" disabled={!editado} onClick={() => void guardar()}>
        Guardar notas
      </button>
    </Seccion>
  );
}

function SeccionExportar() {
  const { exportarXlsx, exportarCsv } = useDatos();
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  async function ejecutar(accion: () => Promise<void>) {
    setOcupado(true);
    setError(null);
    try {
      await accion();
    } catch (fallo) {
      if (!(fallo instanceof EntregaCancelada)) setError((fallo as Error).message);
    } finally {
      setOcupado(false);
    }
  }

  return (
    <Seccion titulo="Exportar">
      <p>
        El Excel tiene las hojas Movimientos y Categorías con la misma estructura del original, para poder volver a él. No incluye las hojas de resumen.
      </p>
      <div className="flex flex-wrap gap-2">
        <button type="button" className="boton boton-primario" disabled={ocupado} onClick={() => void ejecutar(exportarXlsx)}>
          Descargar Excel
        </button>
        <button type="button" className="boton" disabled={ocupado} onClick={() => void ejecutar(exportarCsv)}>
          Descargar CSV
        </button>
      </div>
      {error && <p role="alert" className="font-semibold text-error">{error}</p>}
    </Seccion>
  );
}

export function PaginaDatos() {
  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <h1 className="text-2xl font-bold">Datos</h1>
      <SeccionRespaldos />
      <SeccionExportar />
      <SeccionImportar />
      <SeccionNotas />
    </div>
  );
}
