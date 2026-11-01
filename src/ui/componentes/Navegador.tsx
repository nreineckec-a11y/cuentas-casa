interface Props<T extends string> {
  etiqueta: string;
  /** Ordenadas de la más antigua a la más nueva. */
  opciones: readonly { valor: T; texto: string }[];
  valor: T;
  alCambiar: (valor: T) => void;
}

/** ◀ selector ▶ para moverse entre meses o años. */
export function Navegador<T extends string>({ etiqueta, opciones, valor, alCambiar }: Props<T>) {
  const indice = opciones.findIndex((o) => o.valor === valor);
  const anterior = opciones[indice - 1];
  const siguiente = opciones[indice + 1];
  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        className="boton shrink-0 px-4 text-xl"
        aria-label={`${etiqueta} anterior`}
        disabled={!anterior}
        onClick={() => anterior && alCambiar(anterior.valor)}
      >
        ◀
      </button>
      <label className="min-w-0 flex-1">
        <span className="sr-only">{etiqueta}</span>
        <select className="control text-center font-bold" value={valor} onChange={(e) => alCambiar(e.target.value as T)}>
          {/* Un mes escrito a mano en la dirección puede no estar en la lista. */}
          {indice < 0 && <option value={valor}>{valor}</option>}
          {[...opciones].reverse().map((o) => (
            <option key={o.valor} value={o.valor}>
              {o.texto}
            </option>
          ))}
        </select>
      </label>
      <button
        type="button"
        className="boton shrink-0 px-4 text-xl"
        aria-label={`${etiqueta} siguiente`}
        disabled={!siguiente}
        onClick={() => siguiente && alCambiar(siguiente.valor)}
      >
        ▶
      </button>
    </div>
  );
}
