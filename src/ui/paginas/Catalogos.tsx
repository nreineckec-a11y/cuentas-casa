import { useMemo, useState, type FormEvent } from 'react';
import type { Tipo } from '../../lib/calculos';
import { erroresPorCampo, esquemaCategoriaNueva, esquemaCuentaNueva } from '../../lib/esquemas';
import { formatearMoneda, formatearMontoAlEscribir, parsearMonto } from '../../lib/formato';
import { moverEnGrupo } from '../../lib/movimientos';
import type { Categoria, Cuenta } from '../../lib/tipos';
import { useAvisos } from '../avisos';
import { Dialogo } from '../componentes/Dialogo';
import { SelectorCategoria } from '../componentes/SelectorCategoria';
import { useDatos } from '../datos';

const GRUPOS: { tipo: Tipo; titulo: string }[] = [
  { tipo: 'Gasto', titulo: 'Gastos' },
  { tipo: 'Ingreso', titulo: 'Ingresos' },
  { tipo: 'Traspaso', titulo: 'Traspasos' },
];

interface Conteo {
  cantidad: number;
  monto: number;
}

const SIN_MOVIMIENTOS: Conteo = { cantidad: 0, monto: 0 };

function textoMovimientos(cantidad: number): string {
  return cantidad === 1 ? '1 movimiento' : `${cantidad} movimientos`;
}

function Botones({ alSubir, alBajar, nombre }: { alSubir: (() => void) | null; alBajar: (() => void) | null; nombre: string }) {
  return (
    <div className="flex shrink-0 gap-1">
      <button type="button" className="boton px-3" disabled={!alSubir} aria-label={`Subir ${nombre}`} onClick={() => alSubir?.()}>
        ▲
      </button>
      <button type="button" className="boton px-3" disabled={!alBajar} aria-label={`Bajar ${nombre}`} onClick={() => alBajar?.()}>
        ▼
      </button>
    </div>
  );
}

/** Borrar no tiene Deshacer: pide un segundo toque. */
function BotonBorrar({ etiqueta, alBorrar }: { etiqueta: string; alBorrar: () => void }) {
  const [confirmando, setConfirmando] = useState(false);
  return (
    <button
      type="button"
      className="boton boton-peligro w-full"
      onClick={() => (confirmando ? alBorrar() : setConfirmando(true))}
    >
      {confirmando ? `Confirmar: ${etiqueta.toLowerCase()}` : etiqueta}
    </button>
  );
}

function DialogoFusion({ origen, conteo, alCerrar, alTerminar }: {
  origen: Categoria;
  conteo: Conteo;
  alCerrar: () => void;
  alTerminar: () => void;
}) {
  const { categorias, categoriaPorId, fusionarCategoria } = useDatos();
  const { mostrarAviso } = useAvisos();
  const [destinoId, setDestinoId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const opciones = useMemo(
    () => categorias.filter((c) => c.tipo === origen.tipo && c.id !== origen.id),
    [categorias, origen],
  );
  const destino = destinoId === null ? undefined : categoriaPorId.get(destinoId);

  async function fusionar() {
    if (destinoId === null) return;
    setOcupado(true);
    try {
      const { movidos } = await fusionarCategoria(origen.id, destinoId);
      alTerminar();
      mostrarAviso({ texto: `Fusionada: ${textoMovimientos(movidos)} pasaron a ${destino?.nombre}.` });
    } catch (fallo) {
      setError((fallo as Error).message);
      setOcupado(false);
    }
  }

  return (
    <Dialogo titulo={`Fusionar ${origen.nombre}`} alCerrar={alCerrar} forma="centro">
      <div className="space-y-4">
        <SelectorCategoria categorias={opciones} valor={destinoId} alCambiar={setDestinoId} etiqueta="Fusionar en" />
        {destino && (
          <p className="rounded-lg bg-aviso-fondo p-3 text-aviso-texto">
            Todo lo de «{origen.nombre}» ({textoMovimientos(conteo.cantidad)}, {formatearMoneda(conteo.monto)}) pasará a «{destino.nombre}», y «
            {origen.nombre}» desaparecerá. Los totales no cambian. No hay Deshacer, pero antes se guarda un respaldo que puedes restaurar en Datos.
          </p>
        )}
        {error && <p role="alert" className="font-semibold text-error">{error}</p>}
        <button type="button" className="boton boton-primario w-full" disabled={!destino || ocupado} onClick={() => void fusionar()}>
          {ocupado ? 'Fusionando…' : 'Fusionar'}
        </button>
      </div>
    </Dialogo>
  );
}

function DialogoCategoria({ categoria, conteo, alCerrar }: { categoria: Categoria | null; conteo: Conteo; alCerrar: () => void }) {
  const { crearCategoria, editarCategoria, borrarCategoria } = useDatos();
  const { mostrarAviso } = useAvisos();
  const [nombre, setNombre] = useState(categoria?.nombre ?? '');
  const [tipo, setTipo] = useState<Tipo>(categoria?.tipo ?? 'Gasto');
  const [presupuesto, setPresupuesto] = useState(
    categoria?.presupuestoMensual === null || categoria?.presupuestoMensual === undefined
      ? ''
      : formatearMoneda(categoria.presupuestoMensual),
  );
  const [queIncluye, setQueIncluye] = useState(categoria?.queIncluye ?? '');
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [ocupado, setOcupado] = useState(false);
  const [fusionando, setFusionando] = useState(false);

  const especial = Boolean(categoria?.rol);
  const cambiaTipo = categoria !== null && tipo !== categoria.tipo && conteo.cantidad > 0;

  async function ejecutar(accion: () => Promise<unknown>, texto: string) {
    setOcupado(true);
    try {
      await accion();
      alCerrar();
      mostrarAviso({ texto });
    } catch (fallo) {
      setErrores({ general: (fallo as Error).message });
      setOcupado(false);
    }
  }

  async function guardar(e: FormEvent) {
    e.preventDefault();
    const validacion = esquemaCategoriaNueva.safeParse({
      nombre,
      tipo,
      // El presupuesto solo se usa en los gastos.
      presupuestoMensual: tipo === 'Gasto' ? parsearMonto(presupuesto) : null,
      queIncluye,
    });
    if (!validacion.success) {
      setErrores(erroresPorCampo(validacion.error));
      return;
    }
    setErrores({});
    const datos = validacion.data;
    if (categoria) await ejecutar(() => editarCategoria(categoria.id, datos), 'Cambios guardados.');
    else await ejecutar(() => crearCategoria(datos), `Categoría «${datos.nombre}» creada.`);
  }

  if (fusionando && categoria) {
    return <DialogoFusion origen={categoria} conteo={conteo} alCerrar={() => setFusionando(false)} alTerminar={alCerrar} />;
  }

  return (
    <Dialogo titulo={categoria ? 'Editar categoría' : 'Nueva categoría'} alCerrar={alCerrar}>
      <form className="space-y-4" onSubmit={(e) => void guardar(e)} noValidate>
        <div>
          <label htmlFor="cat-nombre" className="etiqueta">Nombre</label>
          <input
            id="cat-nombre"
            type="text"
            className="control"
            autoComplete="off"
            value={nombre}
            aria-invalid={errores.nombre ? true : undefined}
            onChange={(e) => setNombre(e.target.value)}
          />
          {errores.nombre && <p className="mt-1 font-semibold text-error">{errores.nombre}</p>}
        </div>
        <div>
          <label htmlFor="cat-tipo" className="etiqueta">Tipo</label>
          <select
            id="cat-tipo"
            className="control"
            value={tipo}
            disabled={especial}
            onChange={(e) => setTipo(e.target.value as Tipo)}
          >
            <option value="Gasto">Gasto</option>
            <option value="Ingreso">Ingreso</option>
            <option value="Traspaso">Traspaso (no suma ni resta)</option>
          </select>
          {especial && <p className="mt-1 text-texto-suave">Esta categoría cumple una función especial en los cálculos: no cambia de tipo.</p>}
          {cambiaTipo && (
            <p role="status" className="mt-1 rounded-lg bg-aviso-fondo p-3 text-aviso-texto">
              Todo lo de esta categoría ({textoMovimientos(conteo.cantidad)}, {formatearMoneda(conteo.monto)}) pasará a contar como {tipo}, y cambiarán los totales de los meses que la usan.
            </p>
          )}
        </div>
        {tipo === 'Gasto' && (
          <div>
            <label htmlFor="cat-presupuesto" className="etiqueta">
              Presupuesto mensual <span className="font-normal text-texto-suave">(opcional)</span>
            </label>
            <input
              id="cat-presupuesto"
              type="text"
              inputMode="numeric"
              autoComplete="off"
              className="control montos"
              placeholder="Sin presupuesto"
              value={presupuesto}
              aria-invalid={errores.presupuestoMensual ? true : undefined}
              onChange={(e) => setPresupuesto(formatearMontoAlEscribir(e.target.value))}
            />
            {errores.presupuestoMensual && <p className="mt-1 font-semibold text-error">{errores.presupuestoMensual}</p>}
          </div>
        )}
        <div>
          <label htmlFor="cat-incluye" className="etiqueta">
            Qué incluye <span className="font-normal text-texto-suave">(opcional)</span>
          </label>
          <textarea
            id="cat-incluye"
            rows={3}
            className="control"
            value={queIncluye}
            onChange={(e) => setQueIncluye(e.target.value)}
          />
          {errores.queIncluye && <p className="mt-1 font-semibold text-error">{errores.queIncluye}</p>}
        </div>
        {errores.general && <p role="alert" className="rounded-lg border-2 border-error p-3 font-semibold text-error">{errores.general}</p>}
        <button type="submit" className="boton boton-primario w-full" disabled={ocupado}>
          {categoria ? 'Guardar cambios' : 'Crear categoría'}
        </button>
      </form>

      {categoria && (
        <div className="mt-6 space-y-2 border-t border-borde-suave pt-4">
          <p className="text-texto-suave">Tiene {textoMovimientos(conteo.cantidad)}.</p>
          <button
            type="button"
            className="boton w-full"
            disabled={ocupado}
            onClick={() =>
              void ejecutar(
                () => editarCategoria(categoria.id, { activa: !categoria.activa }),
                categoria.activa ? 'Categoría archivada: ya no aparece al anotar.' : 'Categoría reactivada.',
              )
            }
          >
            {categoria.activa ? 'Archivar' : 'Reactivar'}
          </button>
          {!especial && (
            <button type="button" className="boton w-full" onClick={() => setFusionando(true)}>
              Fusionar en otra categoría
            </button>
          )}
          {!especial && conteo.cantidad === 0 && (
            <BotonBorrar
              etiqueta="Borrar categoría"
              alBorrar={() => void ejecutar(() => borrarCategoria(categoria.id), 'Categoría borrada.')}
            />
          )}
        </div>
      )}
    </Dialogo>
  );
}

function DialogoCuenta({ cuenta, conteo, alCerrar }: { cuenta: Cuenta | null; conteo: Conteo; alCerrar: () => void }) {
  const { crearCuenta, editarCuenta, borrarCuenta } = useDatos();
  const { mostrarAviso } = useAvisos();
  const [nombre, setNombre] = useState(cuenta?.nombre ?? '');
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  async function ejecutar(accion: () => Promise<unknown>, texto: string) {
    setOcupado(true);
    try {
      await accion();
      alCerrar();
      mostrarAviso({ texto });
    } catch (fallo) {
      setError((fallo as Error).message);
      setOcupado(false);
    }
  }

  async function guardar(e: FormEvent) {
    e.preventDefault();
    const validacion = esquemaCuentaNueva.safeParse({ nombre });
    if (!validacion.success) {
      setError(erroresPorCampo(validacion.error).nombre ?? 'El nombre no es válido.');
      return;
    }
    setError(null);
    const limpio = validacion.data.nombre;
    if (cuenta) await ejecutar(() => editarCuenta(cuenta.id, { nombre: limpio }), 'Cambios guardados.');
    else await ejecutar(() => crearCuenta(limpio), `Cuenta «${limpio}» creada.`);
  }

  return (
    <Dialogo titulo={cuenta ? 'Editar cuenta' : 'Nueva cuenta'} alCerrar={alCerrar} forma="centro">
      <form className="space-y-4" onSubmit={(e) => void guardar(e)} noValidate>
        <div>
          <label htmlFor="cuenta-nombre" className="etiqueta">Nombre</label>
          <input
            id="cuenta-nombre"
            type="text"
            className="control"
            autoComplete="off"
            value={nombre}
            aria-invalid={error ? true : undefined}
            onChange={(e) => setNombre(e.target.value)}
          />
          {error && <p role="alert" className="mt-1 font-semibold text-error">{error}</p>}
        </div>
        <button type="submit" className="boton boton-primario w-full" disabled={ocupado}>
          {cuenta ? 'Guardar cambios' : 'Crear cuenta'}
        </button>
      </form>
      {cuenta && (
        <div className="mt-6 space-y-2 border-t border-borde-suave pt-4">
          <p className="text-texto-suave">Tiene {textoMovimientos(conteo.cantidad)}.</p>
          <button
            type="button"
            className="boton w-full"
            disabled={ocupado}
            onClick={() =>
              void ejecutar(
                () => editarCuenta(cuenta.id, { activa: !cuenta.activa }),
                cuenta.activa ? 'Cuenta archivada: ya no aparece al anotar.' : 'Cuenta reactivada.',
              )
            }
          >
            {cuenta.activa ? 'Archivar' : 'Reactivar'}
          </button>
          {conteo.cantidad === 0 && (
            <BotonBorrar etiqueta="Borrar cuenta" alBorrar={() => void ejecutar(() => borrarCuenta(cuenta.id), 'Cuenta borrada.')} />
          )}
        </div>
      )}
    </Dialogo>
  );
}

type Edicion =
  | { clase: 'categoria'; categoria: Categoria | null }
  | { clase: 'cuenta'; cuenta: Cuenta | null };

export function PaginaCatalogos() {
  const { categorias, cuentas, movimientos, ordenarCategorias, ordenarCuentas } = useDatos();
  const { mostrarAviso } = useAvisos();
  const [edicion, setEdicion] = useState<Edicion | null>(null);
  const [verArchivadas, setVerArchivadas] = useState(false);

  const { porCategoria, porCuenta } = useMemo(() => {
    const porCategoria = new Map<number, Conteo>();
    const porCuenta = new Map<number, Conteo>();
    const sumar = (mapa: Map<number, Conteo>, id: number, monto: number) => {
      const actual = mapa.get(id) ?? SIN_MOVIMIENTOS;
      mapa.set(id, { cantidad: actual.cantidad + 1, monto: actual.monto + monto });
    };
    for (const m of movimientos) {
      sumar(porCategoria, m.categoriaId, m.monto);
      sumar(porCuenta, m.cuentaId, m.monto);
    }
    return { porCategoria, porCuenta };
  }, [movimientos]);

  const visible = (e: { activa: boolean }) => verArchivadas || e.activa;
  const archivadas = categorias.filter((c) => !c.activa).length + cuentas.filter((c) => !c.activa).length;

  async function ordenar(accion: () => Promise<unknown>) {
    try {
      await accion();
    } catch (fallo) {
      mostrarAviso({ texto: (fallo as Error).message, tipo: 'error' });
    }
  }

  function moverCategoria(categoria: Categoria, direccion: -1 | 1): (() => void) | null {
    const ids = moverEnGrupo(categorias, categoria.id, direccion, (a, b) => a.tipo === b.tipo && visible(b));
    return ids && (() => void ordenar(() => ordenarCategorias(ids)));
  }

  function moverCuenta(cuenta: Cuenta, direccion: -1 | 1): (() => void) | null {
    const ids = moverEnGrupo(cuentas, cuenta.id, direccion, (_a, b) => visible(b));
    return ids && (() => void ordenar(() => ordenarCuentas(ids)));
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Categorías y cuentas</h1>
        {archivadas > 0 && (
          <button type="button" className="boton" aria-pressed={verArchivadas} onClick={() => setVerArchivadas((v) => !v)}>
            {verArchivadas ? 'Ocultar archivadas' : `Ver archivadas (${archivadas})`}
          </button>
        )}
      </div>

      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xl font-bold">Categorías</h2>
          <button type="button" className="boton boton-primario" onClick={() => setEdicion({ clase: 'categoria', categoria: null })}>
            Nueva categoría
          </button>
        </div>
        {GRUPOS.map(({ tipo, titulo }) => {
          const delGrupo = categorias.filter((c) => c.tipo === tipo && visible(c));
          if (delGrupo.length === 0) return null;
          return (
            <div key={tipo} className="overflow-hidden rounded-lg border border-borde-suave bg-superficie">
              <h3 className="border-b border-borde bg-superficie-2 px-3 py-2 font-bold">{titulo}</h3>
              <ul>
                {delGrupo.map((categoria) => {
                  const conteo = porCategoria.get(categoria.id) ?? SIN_MOVIMIENTOS;
                  return (
                    <li key={categoria.id} className="flex items-center gap-2 border-b border-borde-suave p-2 last:border-b-0">
                      <Botones nombre={categoria.nombre} alSubir={moverCategoria(categoria, -1)} alBajar={moverCategoria(categoria, 1)} />
                      <button
                        type="button"
                        className="min-w-0 flex-1 cursor-pointer rounded-md p-1 text-left hover:bg-superficie-2"
                        onClick={() => setEdicion({ clase: 'categoria', categoria })}
                      >
                        <span className="block font-semibold break-words">
                          {categoria.nombre}
                          {!categoria.activa && <span className="font-normal text-texto-suave"> · Archivada</span>}
                        </span>
                        <span className="block text-texto-suave">
                          {textoMovimientos(conteo.cantidad)}
                          {categoria.presupuestoMensual !== null && ` · Presupuesto ${formatearMoneda(categoria.presupuestoMensual)}`}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </section>

      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xl font-bold">Cuentas y medios de pago</h2>
          <button type="button" className="boton boton-primario" onClick={() => setEdicion({ clase: 'cuenta', cuenta: null })}>
            Nueva cuenta
          </button>
        </div>
        <ul className="overflow-hidden rounded-lg border border-borde-suave bg-superficie">
          {cuentas.filter(visible).map((cuenta) => {
            const conteo = porCuenta.get(cuenta.id) ?? SIN_MOVIMIENTOS;
            return (
              <li key={cuenta.id} className="flex items-center gap-2 border-b border-borde-suave p-2 last:border-b-0">
                <Botones nombre={cuenta.nombre} alSubir={moverCuenta(cuenta, -1)} alBajar={moverCuenta(cuenta, 1)} />
                <button
                  type="button"
                  className="min-w-0 flex-1 cursor-pointer rounded-md p-1 text-left hover:bg-superficie-2"
                  onClick={() => setEdicion({ clase: 'cuenta', cuenta })}
                >
                  <span className="block font-semibold break-words">
                    {cuenta.nombre}
                    {!cuenta.activa && <span className="font-normal text-texto-suave"> · Archivada</span>}
                  </span>
                  <span className="block text-texto-suave">{textoMovimientos(conteo.cantidad)}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </section>

      {edicion?.clase === 'categoria' && (
        <DialogoCategoria
          categoria={edicion.categoria}
          conteo={(edicion.categoria && porCategoria.get(edicion.categoria.id)) || SIN_MOVIMIENTOS}
          alCerrar={() => setEdicion(null)}
        />
      )}
      {edicion?.clase === 'cuenta' && (
        <DialogoCuenta
          cuenta={edicion.cuenta}
          conteo={(edicion.cuenta && porCuenta.get(edicion.cuenta.id)) || SIN_MOVIMIENTOS}
          alCerrar={() => setEdicion(null)}
        />
      )}
    </div>
  );
}
