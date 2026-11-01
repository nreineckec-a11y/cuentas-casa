import { useEffect, useRef, type ReactNode } from 'react';
import { IconoCerrar } from './Iconos';

interface Props {
  titulo: string;
  alCerrar: () => void;
  children: ReactNode;
  /** Panel: a la derecha en pantallas grandes y completo en el celular. Centro: cuadro pequeño. */
  forma?: 'panel' | 'centro';
}

/** Usa el `<dialog>` nativo: atrapa el foco y se cierra con Esc sin código extra. */
export function Dialogo({ titulo, alCerrar, children, forma = 'panel' }: Props) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialogo = ref.current;
    if (dialogo && !dialogo.open) dialogo.showModal();
    return () => dialogo?.close();
  }, []);

  const posicion =
    forma === 'panel'
      ? 'fixed inset-0 ml-auto h-dvh w-full md:w-[30rem]'
      : 'fixed inset-x-4 top-[10vh] mx-auto max-h-[80dvh] w-auto max-w-lg rounded-xl';

  return (
    <dialog
      ref={ref}
      aria-label={titulo}
      className={`${posicion} overflow-y-auto bg-fondo p-0`}
      onCancel={(e) => {
        e.preventDefault();
        alCerrar();
      }}
      onClick={(e) => {
        if (e.target === ref.current) alCerrar();
      }}
    >
      <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-borde-suave bg-fondo px-4 py-2">
        <h2 className="text-xl font-bold">{titulo}</h2>
        <button type="button" className="boton shrink-0 px-3" aria-label="Cerrar" onClick={alCerrar}>
          <IconoCerrar />
        </button>
      </div>
      <div className="p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">{children}</div>
    </dialog>
  );
}
