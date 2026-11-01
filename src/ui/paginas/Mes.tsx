import { useMemo, useState } from 'react';
import {
  calcularCalendario,
  calcularResumenMes,
  leerPresupuesto,
  mesDeFecha,
  mesesNavegables,
  mesPredeterminado,
  type EstadoPresupuesto,
  type FilaCategoriaMes,
  type Tipo,
} from '../../lib/calculos';
import {
  fechaDeHoy,
  formatearFecha,
  formatearMoneda,
  formatearPorcentaje,
  nombreDelMesConMayuscula,
} from '../../lib/formato';
import { paramsDesdeFiltro } from '../../lib/movimientos';
import type { Movimiento } from '../../lib/tipos';
import { Cifra } from '../componentes/Cifra';
import { Navegador } from '../componentes/Navegador';
import { PanelEdicion } from '../componentes/PanelEdicion';
import { useDatos } from '../datos';
import { direccionDe, useRuta } from '../ruta';

const GRUPOS: { tipo: Tipo; titulo: string }[] = [
  { tipo: 'Gasto', titulo: 'Gastos' },
  { tipo: 'Ingreso', titulo: 'Ingresos' },
  { tipo: 'Traspaso', titulo: 'Traspasos (no suman ni restan)' },
];

const COLOR_TIPO: Record<Tipo, string> = {
  Ingreso: 'text-ingreso',
  Gasto: 'text-gasto',
  Traspaso: 'text-traspaso',
};

const COLUMNAS = 'md:grid md:grid-cols-[minmax(0,1fr)_8rem_5.5rem_8rem_8rem_8rem] md:items-center md:gap-3';

const PRESENTACION_PRESUPUESTO: Record<EstadoPresupuesto, { texto: string; barra: string }> = {
  bien: { texto: '✓ Dentro del presupuesto', barra: 'bg-estado-bien' },
  cerca: { texto: '! Cerca del límite', barra: 'bg-estado-cerca' },
  excedido: { texto: '✕ Presupuesto excedido', barra: 'bg-estado-excedido' },
};

function BarraPresupuesto({ gastado, presupuesto }: { gastado: number; presupuesto: number | null }) {
  const lectura = leerPresupuesto(gastado, presupuesto);
  if (!lectura) return null;
  const { texto, barra } = PRESENTACION_PRESUPUESTO[lectura.estado];
  return (
    <div className="mt-1">
      <div className="h-2.5 overflow-hidden rounded-full bg-superficie-2" aria-hidden="true">
        <div className={`h-full rounded-full ${barra}`} style={{ width: `${Math.min(100, lectura.fraccion * 100)}%` }} />
      </div>
      <p className="text-texto-suave">
        {texto} · {formatearPorcentaje(lectura.fraccion)}
      </p>
    </div>
  );
}

function Dato({ etiqueta, valor, fuerte = false, color = '' }: { etiqueta: string; valor: string | null; fuerte?: boolean; color?: string }) {
  return (
    // Sin valor se oculta solo en el celular: en la tabla la celda vacía mantiene las columnas alineadas.
    <div className={valor === null ? 'hidden md:block' : 'flex justify-between gap-3 md:block md:text-right'}>
      <span className="text-texto-suave md:sr-only">{etiqueta}</span>
      <span className={`montos ${fuerte ? 'font-bold' : ''} ${color}`}>{valor}</span>
    </div>
  );
}

function FilaCategoria({ fila, mes }: { fila: FilaCategoriaMes; mes: string }) {
  const { categoria, esteMes, porcentajeGasto, promedio, presupuesto, disponible } = fila;
  const enlace = direccionDe('movimientos', paramsDesdeFiltro({ mes, categoriaId: categoria.id }));
  const moneda = (valor: number | null) => (valor === null ? null : formatearMoneda(valor));
  return (
    <li className={`border-b border-borde-suave p-3 ${COLUMNAS}`}>
      <div className="mb-1 min-w-0 md:mb-0">
        <a href={enlace} className="font-semibold underline-offset-4 hover:underline">
          {categoria.nombre}
        </a>
        <BarraPresupuesto gastado={esteMes} presupuesto={presupuesto} />
      </div>
      <Dato etiqueta="Este mes" valor={formatearMoneda(esteMes)} fuerte color={esteMes > 0 ? COLOR_TIPO[categoria.tipo] : ''} />
      <Dato etiqueta="% del gasto" valor={porcentajeGasto === null ? null : formatearPorcentaje(porcentajeGasto)} />
      <Dato etiqueta="Promedio mensual" valor={moneda(promedio)} />
      <Dato etiqueta="Presupuesto" valor={moneda(presupuesto)} />
      <Dato etiqueta="Disponible" valor={moneda(disponible)} color={disponible !== null && disponible < 0 ? 'text-gasto font-bold' : ''} />
    </li>
  );
}

export function PaginaMes() {
  const { categorias, movimientos, excluidos, motivoDeExclusion, categoriaPorId, cuentaPorId } = useDatos();
  const { params, reemplazarParams } = useRuta();
  const [abierto, setAbierto] = useState<Movimiento | null>(null);
  const [verTodas, setVerTodas] = useState(false);

  const calendario = useMemo(() => calcularCalendario(movimientos.map((m) => m.fecha)), [movimientos]);
  const mesDeHoy = mesDeFecha(fechaDeHoy());
  const parametro = params.get('m');
  const mes = parametro && /^\d{4}-(0[1-9]|1[0-2])$/.test(parametro) ? parametro : mesPredeterminado(calendario, mesDeHoy);

  const opciones = useMemo(
    () => mesesNavegables(calendario, mesDeHoy).map((m) => ({ valor: m, texto: nombreDelMesConMayuscula(m) })),
    [calendario, mesDeHoy],
  );

  const resumen = useMemo(
    () => calcularResumenMes({ categorias, movimientos, excluidos }, mes),
    [categorias, movimientos, excluidos, mes],
  );
  const { totales, filas, topCategorias, topMovimientos } = resumen;

  const tieneDatos = (f: FilaCategoriaMes) => f.esteMes > 0 || (f.promedio ?? 0) > 0 || f.presupuesto !== null;
  const ocultas = filas.filter((f) => !tieneDatos(f)).length;
  const maximoTop = topCategorias[0]?.monto ?? 0;
  const motivo = motivoDeExclusion.get(mes);
  const hayPresupuestos = filas.some((f) => f.presupuesto !== null);
  const sinMovimientos = !movimientos.some((m) => mesDeFecha(m.fecha) === mes);

  return (
    <div className="space-y-5">
      <div className="space-y-3 md:flex md:items-center md:justify-between md:gap-6 md:space-y-0">
        <h1 className="text-2xl font-bold">Resumen del mes</h1>
        <div className="md:w-96">
          <Navegador
            etiqueta="Mes"
            opciones={opciones}
            valor={mes}
            alCambiar={(m) => reemplazarParams(new URLSearchParams({ m }))}
          />
        </div>
      </div>

      {resumen.aviso && (
        <p role="status" className="rounded-lg bg-aviso-fondo p-3 font-semibold text-aviso-texto">
          {resumen.aviso}
        </p>
      )}
      {motivo && (
        <p className="rounded-lg bg-aviso-fondo p-3 text-aviso-texto">
          <span className="font-semibold">Este mes no cuenta para el promedio. </span>
          {motivo}{' '}
          <a className="underline underline-offset-4" href={direccionDe('anio', new URLSearchParams({ a: mes.slice(0, 4) }))}>
            Cambiarlo en Año
          </a>
        </p>
      )}

      <dl className="grid grid-cols-1 gap-3 min-[26rem]:grid-cols-2 lg:grid-cols-5">
        <Cifra etiqueta="Ingresos del mes" valor={formatearMoneda(totales.ingresos)} color="text-ingreso" />
        <Cifra etiqueta="Gastos del mes" valor={formatearMoneda(totales.gastos)} color="text-gasto" />
        <Cifra
          etiqueta="Diferencia"
          valor={formatearMoneda(totales.diferencia)}
          color={totales.diferencia < 0 ? 'text-gasto' : 'text-ingreso'}
          detalle="Ingresos − gastos"
        />
        <Cifra etiqueta="Traído de otras cuentas propias (neto)" valor={formatearMoneda(totales.traidoNeto)} />
        <Cifra
          etiqueta="Gasto promedio por mes"
          valor={resumen.gastoPromedio === null ? '—' : formatearMoneda(resumen.gastoPromedio)}
          detalle={resumen.descripcionPromedio}
        />
      </dl>

      {sinMovimientos && (
        <p className="rounded-lg border border-borde-suave bg-superficie p-6 text-center text-lg">
          No hay movimientos en {nombreDelMesConMayuscula(mes)}.
        </p>
      )}

      {!sinMovimientos && (
        <div className="grid gap-5 lg:grid-cols-2">
          <section className="min-w-0 rounded-lg border border-borde-suave bg-superficie p-4">
            <h2 className="mb-3 text-xl font-bold">Las 5 categorías con más gasto</h2>
            {topCategorias.length === 0 && <p className="text-texto-suave">Sin gastos este mes.</p>}
            <ol className="space-y-3">
              {topCategorias.map(({ categoria, monto }) => (
                <li key={categoria.id}>
                  <a
                    className="block rounded-md hover:bg-superficie-2"
                    href={direccionDe('movimientos', paramsDesdeFiltro({ mes, categoriaId: categoria.id }))}
                  >
                    <span className="flex items-baseline justify-between gap-3">
                      <span className="min-w-0 font-semibold">{categoria.nombre}</span>
                      <span className="montos shrink-0 font-bold">{formatearMoneda(monto)}</span>
                    </span>
                    <span className="mt-1 block h-2.5 rounded-r-md bg-barra-gasto" style={{ width: `${(monto / maximoTop) * 100}%` }} />
                  </a>
                </li>
              ))}
            </ol>
          </section>

          {/* min-w-0: sin esto, el texto truncado ensancha la columna y desborda en el celular. */}
          <section className="min-w-0 rounded-lg border border-borde-suave bg-superficie p-4">
            <h2 className="mb-3 text-xl font-bold">Los 5 movimientos más grandes</h2>
            {topMovimientos.length === 0 && <p className="text-texto-suave">Sin gastos este mes.</p>}
            <ol className="divide-y divide-borde-suave">
              {topMovimientos.map((calculado) => {
                const movimiento = movimientos.find((m) => m.id === calculado.id);
                if (!movimiento) return null;
                return (
                  <li key={movimiento.id}>
                    <button
                      type="button"
                      className="w-full cursor-pointer py-2 text-left hover:bg-superficie-2"
                      onClick={() => setAbierto(movimiento)}
                    >
                      <span className="flex items-baseline justify-between gap-3">
                        <span className="min-w-0 truncate font-semibold">{movimiento.descripcion || 'Sin descripción'}</span>
                        <span className="montos shrink-0 font-bold">{formatearMoneda(movimiento.monto)}</span>
                      </span>
                      <span className="block truncate text-texto-suave">
                        {formatearFecha(movimiento.fecha)} · {categoriaPorId.get(movimiento.categoriaId)?.nombre} ·{' '}
                        {cuentaPorId.get(movimiento.cuentaId)?.nombre}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ol>
          </section>
        </div>
      )}

      <section>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xl font-bold">Por categoría</h2>
          {ocultas > 0 && (
            <button type="button" className="boton" aria-pressed={verTodas} onClick={() => setVerTodas((v) => !v)}>
              {verTodas ? 'Ocultar las que no tienen datos' : `Ver todas (${ocultas} sin datos)`}
            </button>
          )}
        </div>
        {!hayPresupuestos && (
          <p className="mb-2 text-texto-suave">
            Todavía no hay presupuestos definidos. Se fijan en{' '}
            <a className="underline underline-offset-4" href={direccionDe('catalogos')}>
              Categorías
            </a>
            , y aquí aparecerá su barra.
          </p>
        )}
        <div className="space-y-4">
          {GRUPOS.map(({ tipo, titulo }) => {
            const delGrupo = filas.filter((f) => f.categoria.tipo === tipo && (verTodas || tieneDatos(f)));
            if (delGrupo.length === 0) return null;
            return (
              <div key={tipo} className="overflow-hidden rounded-lg border border-borde-suave bg-superficie">
                <div className={`border-b border-borde bg-superficie-2 px-3 py-2 font-bold ${COLUMNAS}`}>
                  <h3>{titulo}</h3>
                  <span className="hidden text-right md:block">Este mes</span>
                  <span className="hidden text-right md:block">{tipo === 'Gasto' ? '% gasto' : ''}</span>
                  <span className="hidden text-right md:block">Promedio</span>
                  <span className="hidden text-right md:block">Presupuesto</span>
                  <span className="hidden text-right md:block">{tipo === 'Gasto' ? 'Disponible' : ''}</span>
                </div>
                <ul>
                  {delGrupo.map((fila) => (
                    <FilaCategoria key={fila.categoria.id} fila={fila} mes={mes} />
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      </section>

      {abierto && <PanelEdicion movimiento={abierto} alCerrar={() => setAbierto(null)} />}
    </div>
  );
}
