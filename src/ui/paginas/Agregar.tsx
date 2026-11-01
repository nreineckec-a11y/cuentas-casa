import { useState } from 'react';
import { calcularCalendario, mesesQueEntranAlPromedio, type MesPorCerrar } from '../../lib/calculos';
import type { DatosMovimiento } from '../../lib/esquemas';
import { formatearFechaCorta, formatearMoneda, nombreDelMesConMayuscula } from '../../lib/formato';
import { useAvisos } from '../avisos';
import { FormularioMovimiento } from '../componentes/FormularioMovimiento';
import { useDatos } from '../datos';

/** Lo que dice el aviso cuando un mes pasa al promedio con pocos datos. */
function textoDelMes({ mes, ultimaFechaDelMes }: MesPorCerrar): string {
  const conMayuscula = nombreDelMesConMayuscula(mes);
  return ultimaFechaDelMes
    ? `${conMayuscula}: sus datos llegan solo al ${formatearFechaCorta(ultimaFechaDelMes)}`
    : `${conMayuscula}: no tiene datos`;
}

export function PaginaAgregar() {
  const { movimientos, excluidos, crearMovimiento, borrar, excluirMes } = useDatos();
  const { mostrarAviso } = useAvisos();
  const [mesesPorCerrar, setMesesPorCerrar] = useState<MesPorCerrar[]>([]);

  async function guardar(datos: DatosMovimiento) {
    const fechas = movimientos.map((m) => m.fecha);
    const creado = await crearMovimiento(datos);
    mostrarAviso({
      texto: `Guardado: ${formatearMoneda(creado.monto)}${creado.descripcion ? ` · ${creado.descripcion}` : ''}`,
      accion: { etiqueta: 'Deshacer', alHacer: () => borrar([creado.id]) },
    });
    const nuevos = mesesQueEntranAlPromedio(
      calcularCalendario(fechas),
      calcularCalendario([...fechas, creado.fecha]),
      excluidos,
    );
    if (nuevos.length > 0) setMesesPorCerrar(nuevos);
  }

  async function excluir() {
    try {
      for (const { mes, ultimaFechaDelMes } of mesesPorCerrar) {
        await excluirMes({
          anio: Number(mes.slice(0, 4)),
          mes: Number(mes.slice(5, 7)),
          motivo: ultimaFechaDelMes
            ? `Incompleto: datos solo hasta el ${formatearFechaCorta(ultimaFechaDelMes)}.`
            : 'Incompleto: sin datos.',
        });
      }
      setMesesPorCerrar([]);
      mostrarAviso({ texto: 'Listo: quedó fuera del promedio.' });
    } catch (error) {
      mostrarAviso({ texto: (error as Error).message, tipo: 'error' });
    }
  }

  return (
    <div className="mx-auto max-w-xl">
      <h1 className="mb-4 text-2xl font-bold">Agregar movimiento</h1>
      {mesesPorCerrar.length > 0 && (
        <div role="alert" className="mb-4 rounded-lg bg-aviso-fondo p-3 text-aviso-texto">
          <p className="font-semibold">
            {mesesPorCerrar.length === 1 ? 'Un mes pasa' : 'Unos meses pasan'} a contar en el promedio
          </p>
          <p className="mb-3">{mesesPorCerrar.map(textoDelMes).join(', ')}. ¿Lo dejamos fuera del promedio?</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="boton boton-primario" onClick={() => void excluir()}>
              Excluir del promedio
            </button>
            <button type="button" className="boton" onClick={() => setMesesPorCerrar([])}>
              Dejarlo en el promedio
            </button>
          </div>
        </div>
      )}
      <FormularioMovimiento alGuardar={guardar} etiquetaGuardar="Guardar" />
      <p className="mt-3 hidden text-texto-suave md:block">
        Enter guarda y deja el formulario listo para el siguiente movimiento.
      </p>
    </div>
  );
}
