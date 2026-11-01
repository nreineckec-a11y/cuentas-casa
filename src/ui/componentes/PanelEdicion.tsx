import type { Movimiento } from '../../lib/tipos';
import { useAvisos } from '../avisos';
import { useDatos } from '../datos';
import { Dialogo } from './Dialogo';
import { FormularioMovimiento } from './FormularioMovimiento';

interface Props {
  movimiento: Movimiento;
  alCerrar: () => void;
}

export function PanelEdicion({ movimiento, alCerrar }: Props) {
  const { editarMovimiento, borrar, restaurar } = useDatos();
  const { mostrarAviso } = useAvisos();

  async function alBorrar() {
    try {
      await borrar([movimiento.id]);
      alCerrar();
      mostrarAviso({
        texto: 'Movimiento borrado.',
        accion: { etiqueta: 'Deshacer', alHacer: () => restaurar([movimiento.id]) },
      });
    } catch (error) {
      mostrarAviso({ texto: (error as Error).message, tipo: 'error' });
    }
  }

  return (
    <Dialogo titulo="Editar movimiento" alCerrar={alCerrar}>
      <FormularioMovimiento
        key={movimiento.id}
        movimiento={movimiento}
        etiquetaGuardar="Guardar cambios"
        alGuardar={async (datos) => {
          await editarMovimiento(movimiento.id, datos);
          alCerrar();
          mostrarAviso({ texto: 'Cambios guardados.' });
        }}
      />
      <button type="button" className="boton boton-peligro mt-3 w-full" onClick={() => void alBorrar()}>
        Borrar movimiento
      </button>
    </Dialogo>
  );
}
