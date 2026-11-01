import { forwardRef, useId, useMemo, useState, type KeyboardEvent } from 'react';
import type { Tipo } from '../../lib/calculos';
import { normalizarTexto } from '../../lib/formato';
import type { Categoria } from '../../lib/tipos';

const GRUPOS: { tipo: Tipo; titulo: string; color: string }[] = [
  { tipo: 'Gasto', titulo: 'Gastos', color: 'text-gasto' },
  { tipo: 'Ingreso', titulo: 'Ingresos', color: 'text-ingreso' },
  { tipo: 'Traspaso', titulo: 'Traspasos', color: 'text-traspaso' },
];

interface Props {
  categorias: readonly Categoria[];
  valor: number | null;
  alCambiar: (id: number) => void;
  etiqueta?: string;
  error?: string;
  /** Qué decir si la búsqueda no encuentra nada. */
  textoSinResultados?: string;
}

/**
 * Buscador de categorías agrupado por tipo. La lista se abre dentro del flujo de
 * la página, no flotando: así no queda tapada por el teclado del celular ni
 * cortada dentro del panel lateral.
 */
export const SelectorCategoria = forwardRef<HTMLInputElement, Props>(function SelectorCategoria(
  { categorias, valor, alCambiar, etiqueta = 'Categoría', error, textoSinResultados = 'No hay categorías con ese nombre.' },
  ref,
) {
  const id = useId();
  const [abierto, setAbierto] = useState(false);
  const [consulta, setConsulta] = useState('');
  const [activo, setActivo] = useState(-1);

  const elegida = categorias.find((c) => c.id === valor) ?? null;

  const grupos = useMemo(() => {
    const texto = normalizarTexto(consulta);
    const visibles = categorias.filter((c) => c.activa || c.id === valor);
    const coincideNombre = (c: Categoria) => normalizarTexto(c.nombre).includes(texto);
    const coincide = (c: Categoria) => texto === '' || coincideNombre(c) || normalizarTexto(c.queIncluye).includes(texto);
    return GRUPOS.map((grupo) => ({
      ...grupo,
      // Primero las que coinciden por nombre; "Jumbo" igual encuentra Supermercado por lo que incluye.
      opciones: visibles
        .filter((c) => c.tipo === grupo.tipo && coincide(c))
        .sort((a, b) => Number(coincideNombre(b)) - Number(coincideNombre(a)) || a.orden - b.orden),
    })).filter((grupo) => grupo.opciones.length > 0);
  }, [categorias, consulta, valor]);

  const planas = useMemo(() => grupos.flatMap((g) => g.opciones), [grupos]);

  function abrir() {
    setConsulta('');
    setActivo(-1);
    setAbierto(true);
  }

  function elegir(categoria: Categoria) {
    alCambiar(categoria.id);
    setAbierto(false);
    setConsulta('');
    setActivo(-1);
  }

  function alPresionar(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!abierto) abrir();
      else setActivo((i) => Math.min(i + 1, planas.length - 1));
    } else if (e.key === 'ArrowUp' && abierto) {
      e.preventDefault();
      setActivo((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && abierto) {
      const opcion = planas[activo] ?? (consulta.trim() ? planas[0] : undefined);
      if (opcion) {
        e.preventDefault();
        elegir(opcion);
      } else {
        setAbierto(false);
      }
    } else if (e.key === 'Escape' && abierto) {
      e.preventDefault();
      e.stopPropagation();
      setAbierto(false);
    }
  }

  const idLista = `${id}-lista`;
  const idError = `${id}-error`;
  const opcionActiva = planas[activo];

  return (
    <div>
      <label htmlFor={id} className="etiqueta">
        {etiqueta}
      </label>
      <input
        ref={ref}
        id={id}
        type="text"
        role="combobox"
        aria-expanded={abierto}
        aria-controls={idLista}
        aria-autocomplete="list"
        aria-activedescendant={abierto && opcionActiva ? `${id}-${opcionActiva.id}` : undefined}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? idError : undefined}
        autoComplete="off"
        enterKeyHint="done"
        className="control"
        placeholder="Busca o elige una categoría"
        value={abierto ? consulta : (elegida?.nombre ?? '')}
        onClick={() => {
          if (!abierto) abrir();
        }}
        onFocus={(e) => e.target.select()}
        onBlur={() => setAbierto(false)}
        onChange={(e) => {
          setConsulta(e.target.value);
          setActivo(-1);
          setAbierto(true);
        }}
        onKeyDown={alPresionar}
      />
      {error && (
        <p id={idError} className="mt-1 font-semibold text-error">
          {error}
        </p>
      )}
      {!abierto && elegida?.queIncluye && <p className="mt-1 text-texto-suave">{elegida.queIncluye}</p>}
      {abierto && (
        // Evita que tocar la lista saque el foco del buscador antes de elegir.
        <div
          id={idLista}
          role="listbox"
          aria-label={etiqueta}
          className="mt-1 max-h-80 overflow-y-auto rounded-lg border-[1.5px] border-borde bg-superficie"
          onMouseDown={(e) => e.preventDefault()}
        >
          {grupos.length === 0 && <p className="p-3 text-texto-suave">{textoSinResultados}</p>}
          {grupos.map((grupo) => (
            <div key={grupo.tipo} role="group" aria-label={grupo.titulo}>
              <p className={`sticky top-0 bg-superficie-2 px-3 py-1 font-bold ${grupo.color}`}>{grupo.titulo}</p>
              {grupo.opciones.map((categoria) => {
                const esActiva = opcionActiva?.id === categoria.id;
                return (
                  <div
                    key={categoria.id}
                    id={`${id}-${categoria.id}`}
                    role="option"
                    aria-selected={categoria.id === valor}
                    ref={esActiva ? (el) => el?.scrollIntoView({ block: 'nearest' }) : undefined}
                    className={`cursor-pointer border-t border-borde-suave px-3 py-2 hover:bg-superficie-2 ${
                      esActiva ? 'bg-superficie-2 outline-2 -outline-offset-2 outline-primario' : ''
                    }`}
                    onClick={() => elegir(categoria)}
                  >
                    <p className="font-semibold">
                      {categoria.nombre}
                      {categoria.id === valor && <span className="text-texto-suave"> · elegida</span>}
                    </p>
                    {categoria.queIncluye && <p className="text-texto-suave">{categoria.queIncluye}</p>}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
});
