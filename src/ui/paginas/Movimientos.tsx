import { useWindowVirtualizer } from '@tanstack/react-virtual';
import { memo, useCallback, useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { totalesPorTipo, type Tipo } from '../../lib/calculos';
import { formatearFecha, formatearMoneda, nombreDelMes } from '../../lib/formato';
import {
  cantidadDeFiltros,
  filtrarMovimientos,
  filtroDesdeParams,
  mesesConMovimientos,
  paramsDesdeFiltro,
  type FiltroMovimientos,
} from '../../lib/movimientos';
import type { Categoria, Movimiento } from '../../lib/tipos';
import { useAvisos } from '../avisos';
import { Dialogo } from '../componentes/Dialogo';
import { IconoFiltro } from '../componentes/Iconos';
import { PanelEdicion } from '../componentes/PanelEdicion';
import { SelectorCategoria } from '../componentes/SelectorCategoria';
import { useDatos } from '../datos';
import { useRuta } from '../ruta';

const COLOR_MONTO: Record<Tipo, string> = {
  Ingreso: 'text-ingreso',
  Gasto: 'text-gasto',
  Traspaso: 'text-traspaso',
};

const COLUMNAS = 'md:grid md:grid-cols-[7rem_minmax(0,1fr)_minmax(0,16rem)_9rem_8.5rem] md:items-center md:gap-3';

function Dato({ etiqueta, valor, color }: { etiqueta: string; valor: number; color: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-texto-suave">{etiqueta}</dt>
      <dd className={`montos truncate font-bold ${color}`}>{formatearMoneda(valor)}</dd>
    </div>
  );
}

interface PropsFila {
  movimiento: Movimiento;
  nombreCategoria: string;
  tipo: Tipo;
  nombreCuenta: string;
  seleccionado: boolean;
  alAlternar: (id: number) => void;
  alAbrir: (id: number) => void;
}

/** Una sola fila para los dos formatos: tarjeta en el celular y tabla desde tamaño md. */
const Fila = memo(function Fila({ movimiento, nombreCategoria, tipo, nombreCuenta, seleccionado, alAlternar, alAbrir }: PropsFila) {
  const fondo = seleccionado ? 'bg-superficie-2' : movimiento.porRevisar ? 'bg-revisar-fondo' : 'bg-superficie';
  return (
    <div className={`flex border-b border-borde-suave ${fondo}`}>
      <label className="flex w-12 shrink-0 cursor-pointer items-center justify-center self-stretch">
        <input
          type="checkbox"
          className="size-6 accent-primario"
          checked={seleccionado}
          aria-label={`Seleccionar ${movimiento.descripcion || 'movimiento'} del ${formatearFecha(movimiento.fecha)}`}
          onChange={() => alAlternar(movimiento.id)}
        />
      </label>
      <button
        type="button"
        className={`min-w-0 flex-1 cursor-pointer py-3 pr-3 text-left hover:bg-superficie-2 md:py-2 ${COLUMNAS}`}
        onClick={() => alAbrir(movimiento.id)}
      >
        {/* En el celular, el monto va al lado de la descripción. */}
        <span className="hidden md:block">{formatearFecha(movimiento.fecha)}</span>
        <span className="flex min-w-0 items-baseline justify-between gap-3 md:block">
          <span className="min-w-0 truncate font-semibold md:block">{movimiento.descripcion || 'Sin descripción'}</span>
          <span className={`montos shrink-0 font-bold md:hidden ${COLOR_MONTO[tipo]}`}>{formatearMoneda(movimiento.monto)}</span>
          {movimiento.nota && <span className="hidden truncate text-texto-suave md:block">{movimiento.nota}</span>}
        </span>
        <span className="block truncate text-texto-suave md:hidden">
          {formatearFecha(movimiento.fecha)} · {nombreCategoria}
        </span>
        <span className="block truncate text-texto-suave md:hidden">
          {nombreCuenta}
          {movimiento.porRevisar && <span className="font-semibold text-aviso-texto"> · Por revisar</span>}
        </span>
        <span className="hidden truncate md:block">{nombreCategoria}</span>
        <span className="hidden truncate md:block">{nombreCuenta}</span>
        <span className={`montos hidden text-right font-bold md:block ${COLOR_MONTO[tipo]}`}>
          <span className="sr-only">{tipo}: </span>
          {formatearMoneda(movimiento.monto)}
        </span>
      </button>
    </div>
  );
});

function Filtros({
  filtro,
  cambiar,
  meses,
  categorias,
  cuentas,
}: {
  filtro: FiltroMovimientos;
  cambiar: (cambios: Partial<FiltroMovimientos>) => void;
  meses: string[];
  categorias: Categoria[];
  cuentas: { id: number; nombre: string }[];
}) {
  const grupos: { tipo: Tipo; titulo: string }[] = [
    { tipo: 'Gasto', titulo: 'Gastos' },
    { tipo: 'Ingreso', titulo: 'Ingresos' },
    { tipo: 'Traspaso', titulo: 'Traspasos' },
  ];
  return (
    <div className="grid gap-3 rounded-lg border border-borde-suave bg-superficie p-3 md:grid-cols-3">
      <div>
        <label htmlFor="f-mes" className="etiqueta">
          Mes
        </label>
        <select
          id="f-mes"
          className="control"
          value={filtro.mes ?? ''}
          onChange={(e) => cambiar({ mes: e.target.value || undefined, desde: undefined, hasta: undefined })}
        >
          <option value="">Todos</option>
          {meses.map((m) => (
            <option key={m} value={m}>
              {nombreDelMes(m)}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor="f-desde" className="etiqueta">
          Desde
        </label>
        <input
          id="f-desde"
          type="date"
          className="control"
          value={filtro.desde ?? ''}
          onChange={(e) => cambiar({ desde: e.target.value || undefined, mes: undefined })}
        />
      </div>
      <div>
        <label htmlFor="f-hasta" className="etiqueta">
          Hasta
        </label>
        <input
          id="f-hasta"
          type="date"
          className="control"
          value={filtro.hasta ?? ''}
          onChange={(e) => cambiar({ hasta: e.target.value || undefined, mes: undefined })}
        />
      </div>
      <div>
        <label htmlFor="f-tipo" className="etiqueta">
          Tipo
        </label>
        <select
          id="f-tipo"
          className="control"
          value={filtro.tipo ?? ''}
          onChange={(e) => cambiar({ tipo: (e.target.value || undefined) as Tipo | undefined })}
        >
          <option value="">Todos</option>
          <option value="Ingreso">Ingreso</option>
          <option value="Gasto">Gasto</option>
          <option value="Traspaso">Traspaso</option>
        </select>
      </div>
      <div>
        <label htmlFor="f-categoria" className="etiqueta">
          Categoría
        </label>
        <select
          id="f-categoria"
          className="control"
          value={filtro.categoriaId ?? ''}
          onChange={(e) => cambiar({ categoriaId: Number(e.target.value) || undefined })}
        >
          <option value="">Todas</option>
          {grupos.map(({ tipo, titulo }) => (
            <optgroup key={tipo} label={titulo}>
              {categorias
                .filter((c) => c.tipo === tipo)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nombre}
                    {c.activa ? '' : ' (archivada)'}
                  </option>
                ))}
            </optgroup>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor="f-cuenta" className="etiqueta">
          Cuenta
        </label>
        <select
          id="f-cuenta"
          className="control"
          value={filtro.cuentaId ?? ''}
          onChange={(e) => cambiar({ cuentaId: Number(e.target.value) || undefined })}
        >
          <option value="">Todas</option>
          {cuentas.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nombre}
            </option>
          ))}
        </select>
      </div>
      <label className="flex min-h-12 cursor-pointer items-center gap-3 md:col-span-3">
        <input
          type="checkbox"
          className="size-6 shrink-0 accent-primario"
          checked={filtro.soloPorRevisar ?? false}
          onChange={(e) => cambiar({ soloPorRevisar: e.target.checked || undefined })}
        />
        <span className="font-semibold">Solo por revisar</span>
      </label>
    </div>
  );
}

type AccionLote = 'categoria' | 'cuenta';

function DialogoLote({
  accion,
  cantidad,
  alCerrar,
  alAplicar,
}: {
  accion: AccionLote;
  cantidad: number;
  alCerrar: () => void;
  alAplicar: (id: number) => Promise<void>;
}) {
  const { categorias, cuentas } = useDatos();
  const [valor, setValor] = useState<number | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const titulo = accion === 'categoria' ? 'Cambiar categoría' : 'Cambiar cuenta';

  return (
    <Dialogo titulo={titulo} alCerrar={alCerrar} forma="centro">
      <div className="space-y-4">
        {accion === 'categoria' ? (
          <SelectorCategoria categorias={categorias} valor={valor} alCambiar={setValor} etiqueta="Nueva categoría" />
        ) : (
          <div>
            <label htmlFor="lote-cuenta" className="etiqueta">
              Nueva cuenta
            </label>
            <select id="lote-cuenta" className="control" value={valor ?? ''} onChange={(e) => setValor(Number(e.target.value) || null)}>
              <option value="">Elige una cuenta</option>
              {cuentas
                .filter((c) => c.activa)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nombre}
                  </option>
                ))}
            </select>
          </div>
        )}
        <button
          type="button"
          className="boton boton-primario w-full"
          disabled={valor === null || ocupado}
          onClick={() => {
            if (valor === null) return;
            setOcupado(true);
            void alAplicar(valor).finally(() => setOcupado(false));
          }}
        >
          Aplicar a {cantidad} {cantidad === 1 ? 'movimiento' : 'movimientos'}
        </button>
      </div>
    </Dialogo>
  );
}

export function PaginaMovimientos() {
  const { movimientos, categorias, categoriaPorId, cuentas, cuentaPorId, editarLote, borrar, restaurar } = useDatos();
  const { mostrarAviso } = useAvisos();
  const { params, reemplazarParams } = useRuta();

  const filtro = useMemo(() => filtroDesdeParams(params), [params]);
  const filtroDiferido = useDeferredValue(filtro);
  const lista = useMemo(
    () => filtrarMovimientos(movimientos, filtroDiferido, categorias),
    [movimientos, filtroDiferido, categorias],
  );
  const totales = useMemo(() => totalesPorTipo(lista, categorias), [lista, categorias]);
  const meses = useMemo(() => mesesConMovimientos(movimientos), [movimientos]);

  const filtrosActivos = cantidadDeFiltros(filtro);
  const [verFiltros, setVerFiltros] = useState(filtrosActivos > 0);
  const [seleccion, setSeleccion] = useState<ReadonlySet<number>>(new Set());
  const [abiertoId, setAbiertoId] = useState<number | null>(null);
  const [accionLote, setAccionLote] = useState<AccionLote | null>(null);

  const cambiarFiltro = useCallback(
    (cambios: Partial<FiltroMovimientos>) => reemplazarParams(paramsDesdeFiltro({ ...filtro, ...cambios })),
    [filtro, reemplazarParams],
  );

  // Al cambiar el filtro se limpia la selección: no debe quedar nada elegido fuera de la vista.
  const claveFiltro = params.toString();
  useEffect(() => setSeleccion(new Set()), [claveFiltro]);

  const alAlternar = useCallback((id: number) => {
    setSeleccion((actual) => {
      const nueva = new Set(actual);
      if (!nueva.delete(id)) nueva.add(id);
      return nueva;
    });
  }, []);
  const alAbrir = useCallback((id: number) => setAbiertoId(id), []);

  const refLista = useRef<HTMLDivElement>(null);
  const [margen, setMargen] = useState(0);
  useLayoutEffect(() => {
    const posicion = (refLista.current?.getBoundingClientRect().top ?? 0) + window.scrollY;
    if (posicion !== margen) setMargen(posicion);
  });

  const virtual = useWindowVirtualizer({
    count: lista.length,
    estimateSize: () => (window.innerWidth >= 768 ? 64 : 104),
    overscan: 8,
    scrollMargin: margen,
    getItemKey: (i) => lista[i]?.id ?? i,
  });

  const abierto = abiertoId === null ? undefined : movimientos.find((m) => m.id === abiertoId);
  const elegidos = lista.filter((m) => seleccion.has(m.id));
  const todoElegido = lista.length > 0 && elegidos.length === lista.length;

  async function borrarElegidos() {
    const ids = elegidos.map((m) => m.id);
    try {
      await borrar(ids);
      setSeleccion(new Set());
      mostrarAviso({
        texto: ids.length === 1 ? 'Movimiento borrado.' : `${ids.length} movimientos borrados.`,
        accion: { etiqueta: 'Deshacer', alHacer: () => restaurar(ids) },
      });
    } catch (error) {
      mostrarAviso({ texto: (error as Error).message, tipo: 'error' });
    }
  }

  async function aplicarLote(accion: AccionLote, valor: number) {
    const campo = accion === 'categoria' ? 'categoriaId' : 'cuentaId';
    const ids = elegidos.map((m) => m.id);
    // Cada movimiento vuelve a su valor anterior, que no tiene por qué ser el mismo.
    const anteriores = new Map<number, number[]>();
    for (const m of elegidos) anteriores.set(m[campo], [...(anteriores.get(m[campo]) ?? []), m.id]);
    try {
      await editarLote(ids, { [campo]: valor });
      setAccionLote(null);
      setSeleccion(new Set());
      mostrarAviso({
        texto: `${ids.length === 1 ? '1 movimiento cambiado' : `${ids.length} movimientos cambiados`}.`,
        accion: {
          etiqueta: 'Deshacer',
          alHacer: async () => {
            for (const [anterior, grupo] of anteriores) await editarLote(grupo, { [campo]: anterior });
          },
        },
      });
    } catch (error) {
      mostrarAviso({ texto: (error as Error).message, tipo: 'error' });
    }
  }

  return (
    <div className={seleccion.size > 0 ? 'pb-40 md:pb-24' : ''}>
      <h1 className="mb-3 text-2xl font-bold">Movimientos</h1>

      <div className="mb-3 flex gap-2">
        <div className="min-w-0 flex-1">
          <label htmlFor="f-texto" className="sr-only">
            Buscar
          </label>
          <input
            id="f-texto"
            type="search"
            className="control"
            placeholder="Buscar…"
            title="Busca por descripción, nota o monto"
            value={filtro.texto ?? ''}
            onChange={(e) => cambiarFiltro({ texto: e.target.value || undefined })}
          />
        </div>
        <button type="button" className="boton shrink-0" aria-expanded={verFiltros} onClick={() => setVerFiltros((v) => !v)}>
          <IconoFiltro />
          Filtros{filtrosActivos > 0 && ` (${filtrosActivos})`}
        </button>
      </div>

      {verFiltros && (
        <div className="mb-3">
          <Filtros filtro={filtro} cambiar={cambiarFiltro} meses={meses} categorias={categorias} cuentas={cuentas} />
        </div>
      )}

      {(filtrosActivos > 0 || filtro.texto) && (
        <button type="button" className="boton mb-3" onClick={() => reemplazarParams(new URLSearchParams())}>
          Quitar filtros
        </button>
      )}

      {/* Totales separados por tipo: la suma del Excel los mezclaba. */}
      <dl className="mb-3 grid grid-cols-2 gap-x-4 gap-y-1 rounded-lg border border-borde-suave bg-superficie p-3 md:sticky md:top-[4.25rem] md:z-20 md:grid-cols-4">
        <Dato etiqueta="Ingresos" valor={totales.ingresos} color="text-ingreso" />
        <Dato etiqueta="Gastos" valor={totales.gastos} color="text-gasto" />
        <Dato etiqueta="Traspasos" valor={totales.traspasos} color="text-traspaso" />
        <Dato etiqueta="Neto" valor={totales.neto} color={totales.neto < 0 ? 'text-gasto' : 'text-ingreso'} />
      </dl>

      <div className="mb-2 flex min-h-12 items-center justify-between gap-3">
        <label className="flex min-h-12 cursor-pointer items-center gap-3 pl-3">
          <input
            type="checkbox"
            className="size-6 accent-primario"
            checked={todoElegido}
            disabled={lista.length === 0}
            onChange={() => setSeleccion(todoElegido ? new Set() : new Set(lista.map((m) => m.id)))}
          />
          <span>Seleccionar todo</span>
        </label>
        <p className="font-semibold text-texto-suave" aria-live="polite">
          {lista.length.toLocaleString('es-CL')} {lista.length === 1 ? 'movimiento' : 'movimientos'}
        </p>
      </div>

      {lista.length === 0 ? (
        <p className="rounded-lg border border-borde-suave bg-superficie p-6 text-center text-lg">
          No hay movimientos con estos filtros.
        </p>
      ) : (
        <div className="overflow-hidden rounded-lg border border-borde-suave">
          <div className="hidden border-b border-borde bg-superficie-2 py-2 pr-3 pl-12 font-bold md:block" aria-hidden="true">
            <div className={COLUMNAS}>
              <span>Fecha</span>
              <span>Descripción</span>
              <span>Categoría</span>
              <span>Cuenta</span>
              <span className="text-right">Monto</span>
            </div>
          </div>
          <div ref={refLista} role="list" className="relative" style={{ height: virtual.getTotalSize() }}>
            {virtual.getVirtualItems().map((item) => {
              const movimiento = lista[item.index];
              if (!movimiento) return null;
              const categoria = categoriaPorId.get(movimiento.categoriaId);
              return (
                <div
                  key={item.key}
                  role="listitem"
                  data-index={item.index}
                  ref={virtual.measureElement}
                  className="absolute inset-x-0 top-0"
                  style={{ transform: `translateY(${item.start - virtual.options.scrollMargin}px)` }}
                >
                  <Fila
                    movimiento={movimiento}
                    nombreCategoria={categoria?.nombre ?? ''}
                    tipo={categoria?.tipo ?? 'Traspaso'}
                    nombreCuenta={cuentaPorId.get(movimiento.cuentaId)?.nombre ?? ''}
                    seleccionado={seleccion.has(movimiento.id)}
                    alAlternar={alAlternar}
                    alAbrir={alAbrir}
                  />
                </div>
              );
            })}
          </div>
        </div>
      )}

      {seleccion.size > 0 && (
        <div className="fixed inset-x-0 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-30 border-t border-borde bg-superficie p-3 shadow-lg md:bottom-0">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-2">
            <p className="w-full font-semibold md:mr-auto md:w-auto">
              {elegidos.length} {elegidos.length === 1 ? 'elegido' : 'elegidos'}
            </p>
            <button type="button" className="boton flex-1 px-2 md:flex-none md:px-4" onClick={() => setAccionLote('categoria')}>
              Categoría
            </button>
            <button type="button" className="boton flex-1 px-2 md:flex-none md:px-4" onClick={() => setAccionLote('cuenta')}>
              Cuenta
            </button>
            <button type="button" className="boton boton-peligro flex-1 px-2 md:flex-none md:px-4" onClick={() => void borrarElegidos()}>
              Borrar
            </button>
            <button type="button" className="boton flex-1 px-2 md:flex-none md:px-4" onClick={() => setSeleccion(new Set())}>
              Cancelar
            </button>
          </div>
        </div>
      )}

      {abierto && <PanelEdicion movimiento={abierto} alCerrar={() => setAbiertoId(null)} />}
      {accionLote && (
        <DialogoLote
          accion={accionLote}
          cantidad={elegidos.length}
          alCerrar={() => setAccionLote(null)}
          alAplicar={(valor) => aplicarLote(accionLote, valor)}
        />
      )}
    </div>
  );
}
