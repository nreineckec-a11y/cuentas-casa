import { useMemo, useState } from 'react';
import { formatearFecha, formatearMoneda } from '../../lib/formato';
import { compararPorFechaDesc, quitarPrefijoRevisar, tienePrefijoRevisar } from '../../lib/movimientos';
import { useAvisos } from '../avisos';
import { PanelEdicion } from '../componentes/PanelEdicion';
import { SelectorCategoria } from '../componentes/SelectorCategoria';
import { useDatos } from '../datos';
import { direccionDe } from '../ruta';

export function PaginaPorRevisar() {
  const { movimientos, categorias, categoriaPorId, cuentaPorId, editarMovimiento } = useDatos();
  const { mostrarAviso } = useAvisos();

  const cola = useMemo(() => movimientos.filter((m) => m.porRevisar).sort(compararPorFechaDesc), [movimientos]);

  // Se sigue por id, no por posición: la cola cambia al marcar y al sincronizar.
  const [actualId, setActualId] = useState<number | null>(null);
  const [quitarPrefijo, setQuitarPrefijo] = useState(false);
  const [editando, setEditando] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [ultimaPosicion, setUltimaPosicion] = useState(0);

  const encontrada = cola.findIndex((m) => m.id === actualId);
  const posicion = encontrada >= 0 ? encontrada : Math.min(ultimaPosicion, cola.length - 1);
  const movimiento = cola[posicion];

  function irA(indice: number) {
    const destino = cola[(indice + cola.length) % cola.length];
    setActualId(destino?.id ?? null);
    setUltimaPosicion((indice + cola.length) % cola.length);
    setQuitarPrefijo(false);
  }

  if (!movimiento) {
    return (
      <div className="mx-auto max-w-xl py-10 text-center">
        <h1 className="mb-2 text-2xl font-bold">Por revisar</h1>
        <p className="mb-4 text-lg">No queda nada por revisar.</p>
        <a className="boton" href={direccionDe('movimientos')}>
          Ver movimientos
        </a>
      </div>
    );
  }

  const categoria = categoriaPorId.get(movimiento.categoriaId);
  const color =
    categoria?.tipo === 'Ingreso' ? 'text-ingreso' : categoria?.tipo === 'Gasto' ? 'text-gasto' : 'text-traspaso';
  const tienePrefijo = tienePrefijoRevisar(movimiento.nota);

  async function marcarRevisado() {
    if (!movimiento || ocupado) return;
    const anterior = { porRevisar: true, nota: movimiento.nota };
    const nota = quitarPrefijo && tienePrefijo ? quitarPrefijoRevisar(movimiento.nota) : movimiento.nota;
    setOcupado(true);
    try {
      await editarMovimiento(movimiento.id, { porRevisar: false, nota });
      // Queda en la misma posición, que ahora ocupa el siguiente de la cola.
      setActualId(null);
      setUltimaPosicion(posicion);
      setQuitarPrefijo(false);
      const id = movimiento.id;
      mostrarAviso({
        texto: 'Marcado como revisado.',
        accion: {
          etiqueta: 'Deshacer',
          alHacer: async () => {
            await editarMovimiento(id, anterior);
            setActualId(id);
          },
        },
      });
    } catch (error) {
      mostrarAviso({ texto: (error as Error).message, tipo: 'error' });
    } finally {
      setOcupado(false);
    }
  }

  async function cambiarCategoria(categoriaId: number) {
    if (!movimiento || categoriaId === movimiento.categoriaId) return;
    const { id, categoriaId: anterior } = movimiento;
    try {
      await editarMovimiento(id, { categoriaId });
      setActualId(id);
      mostrarAviso({
        texto: `Categoría cambiada a ${categoriaPorId.get(categoriaId)?.nombre ?? ''}.`,
        accion: { etiqueta: 'Deshacer', alHacer: () => editarMovimiento(id, { categoriaId: anterior }).then(() => undefined) },
      });
    } catch (error) {
      mostrarAviso({ texto: (error as Error).message, tipo: 'error' });
    }
  }

  return (
    <div className="mx-auto max-w-xl">
      <div className="mb-4 flex items-baseline justify-between gap-3">
        <h1 className="text-2xl font-bold">Por revisar</h1>
        <p className="font-semibold text-texto-suave">
          {posicion + 1} de {cola.length}
        </p>
      </div>

      <article className="space-y-4 rounded-xl border border-borde-suave bg-superficie p-4">
        <div>
          <p className={`montos text-3xl font-bold ${color}`}>{formatearMoneda(movimiento.monto)}</p>
          <p className="mt-1 text-lg font-semibold break-words">{movimiento.descripcion || 'Sin descripción'}</p>
          <p className="text-texto-suave">
            {formatearFecha(movimiento.fecha)} · {cuentaPorId.get(movimiento.cuentaId)?.nombre}
          </p>
        </div>

        {movimiento.nota && (
          <p className="rounded-lg bg-revisar-fondo p-3 break-words">
            <span className="font-semibold">Nota: </span>
            {movimiento.nota}
          </p>
        )}

        <SelectorCategoria
          key={movimiento.id}
          categorias={categorias}
          valor={movimiento.categoriaId}
          alCambiar={(id) => void cambiarCategoria(id)}
        />

        {tienePrefijo && (
          <label className="flex min-h-12 cursor-pointer items-center gap-3">
            <input
              type="checkbox"
              className="size-6 shrink-0 accent-primario"
              checked={quitarPrefijo}
              onChange={(e) => setQuitarPrefijo(e.target.checked)}
            />
            <span>Quitar «Revisar» de la nota al marcar</span>
          </label>
        )}

        <button
          type="button"
          className="boton boton-primario w-full text-lg"
          disabled={ocupado}
          onClick={() => void marcarRevisado()}
        >
          Marcar como revisado
        </button>

        <div className="grid grid-cols-3 gap-2">
          <button type="button" className="boton px-2" disabled={cola.length < 2} onClick={() => irA(posicion - 1)}>
            Anterior
          </button>
          <button type="button" className="boton px-2" onClick={() => setEditando(true)}>
            Editar
          </button>
          <button type="button" className="boton px-2" disabled={cola.length < 2} onClick={() => irA(posicion + 1)}>
            Siguiente
          </button>
        </div>
      </article>

      {editando && <PanelEdicion movimiento={movimiento} alCerrar={() => setEditando(false)} />}
    </div>
  );
}
