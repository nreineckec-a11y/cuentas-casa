import { forwardRef, useDeferredValue, useId, useMemo, useState, type KeyboardEvent } from 'react';
import { buscarDescripciones, type SugerenciaDescripcion } from '../../lib/movimientos';

interface Props {
  valor: string;
  alCambiar: (texto: string) => void;
  alElegir: (sugerencia: SugerenciaDescripcion) => void;
  indice: readonly SugerenciaDescripcion[];
  textoCategoria: (id: number) => string;
  error?: string;
}

/** Descripción con autocompletado desde lo anotado antes. */
export const CampoDescripcion = forwardRef<HTMLInputElement, Props>(function CampoDescripcion(
  { valor, alCambiar, alElegir, indice, textoCategoria, error },
  ref,
) {
  const id = useId();
  const [abierto, setAbierto] = useState(false);
  const [activo, setActivo] = useState(-1);
  const consulta = useDeferredValue(valor);
  const sugerencias = useMemo(() => buscarDescripciones(indice, consulta), [indice, consulta]);
  const visible = abierto && sugerencias.length > 0;

  function elegir(sugerencia: SugerenciaDescripcion) {
    alElegir(sugerencia);
    setAbierto(false);
    setActivo(-1);
  }

  function alPresionar(e: KeyboardEvent<HTMLInputElement>) {
    if (!visible) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActivo((i) => Math.min(i + 1, sugerencias.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActivo((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && sugerencias[activo]) {
      // Solo si eligió con las flechas; si no, Enter guarda el movimiento.
      e.preventDefault();
      elegir(sugerencias[activo]);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      setAbierto(false);
    }
  }

  const idLista = `${id}-lista`;

  return (
    <div>
      <label htmlFor={id} className="etiqueta">
        Descripción
      </label>
      <input
        ref={ref}
        id={id}
        type="text"
        role="combobox"
        aria-expanded={visible}
        aria-controls={idLista}
        aria-autocomplete="list"
        aria-activedescendant={visible && sugerencias[activo] ? `${id}-${activo}` : undefined}
        aria-invalid={error ? true : undefined}
        autoComplete="off"
        autoCapitalize="sentences"
        enterKeyHint="done"
        className="control"
        placeholder="Ej.: Supermercado"
        value={valor}
        onChange={(e) => {
          alCambiar(e.target.value);
          setActivo(-1);
          setAbierto(true);
        }}
        onBlur={() => setAbierto(false)}
        onKeyDown={alPresionar}
      />
      {error && <p className="mt-1 font-semibold text-error">{error}</p>}
      {visible && (
        <div
          id={idLista}
          role="listbox"
          aria-label="Descripciones anteriores"
          className="mt-1 max-h-72 overflow-y-auto rounded-lg border-[1.5px] border-borde bg-superficie"
          onMouseDown={(e) => e.preventDefault()}
        >
          {sugerencias.map((sugerencia, i) => (
            <div
              key={sugerencia.normalizada}
              id={`${id}-${i}`}
              role="option"
              aria-selected={i === activo}
              className={`cursor-pointer border-t border-borde-suave px-3 py-2 first:border-t-0 hover:bg-superficie-2 ${
                i === activo ? 'bg-superficie-2 outline-2 -outline-offset-2 outline-primario' : ''
              }`}
              onClick={() => elegir(sugerencia)}
            >
              <p className="font-semibold">{sugerencia.descripcion}</p>
              <p className="text-texto-suave">{textoCategoria(sugerencia.categoriaId)}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
});
