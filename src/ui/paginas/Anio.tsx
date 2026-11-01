import { lazy, Suspense, useMemo, useState, type FormEvent } from 'react';
import {
  calcularCalendario,
  calcularResumenAnual,
  estadoMesParaPromedio,
  intensidadHeatmap,
  mesDeFecha,
  mesesNavegables,
  mesPredeterminado,
  sePuedeExcluir,
  type EstadoMesPromedio,
  type FilaCategoriaAnual,
  type Mes,
  type TotalesMes,
  type Tipo,
} from '../../lib/calculos';
import {
  fechaDeHoy,
  formatearMoneda,
  formatearPorcentaje,
  mesCorto,
  nombreDelMesConMayuscula,
} from '../../lib/formato';
import { paramsDesdeFiltro } from '../../lib/movimientos';
import { useAvisos } from '../avisos';
import { Cifra } from '../componentes/Cifra';
import { Dialogo } from '../componentes/Dialogo';
import { Navegador } from '../componentes/Navegador';
import { useDatos } from '../datos';
import { direccionDe, useRuta } from '../ruta';

// Recharts es lo más pesado de la app: solo se descarga al abrir esta pantalla.
const GraficosAnio = lazy(() => import('../componentes/GraficosAnio'));

const ESTADOS: Record<EstadoMesPromedio, { texto: string; marca: string }> = {
  cuenta: { texto: 'Cuenta', marca: '✓' },
  excluido: { texto: 'Excluido', marca: '✕' },
  en_curso: { texto: 'En curso', marca: '…' },
  incompleto: { texto: 'Incompleto', marca: '–' },
  futuro: { texto: 'Sin datos', marca: '' },
  sin_datos: { texto: 'Sin datos', marca: '' },
};

const GRUPOS: { tipo: Tipo; titulo: string; color: string }[] = [
  { tipo: 'Ingreso', titulo: 'Ingresos', color: '--barra-ingreso' },
  { tipo: 'Gasto', titulo: 'Gastos', color: '--barra-gasto' },
  { tipo: 'Traspaso', titulo: 'Traspasos', color: '--traspaso' },
];

const CELDA = 'whitespace-nowrap border-b border-borde-suave px-2 py-1.5 text-right';
const PRIMERA_COLUMNA =
  'sticky left-0 z-10 min-w-36 max-w-44 border-r border-b border-borde-suave bg-superficie px-2 py-1.5 text-left md:max-w-none md:min-w-72';
const OPACIDAD_MAXIMA_HEATMAP = 42;

function DialogoMes({ mes, estado, alCerrar }: { mes: Mes; estado: EstadoMesPromedio; alCerrar: () => void }) {
  const { excluirMes, incluirMes, motivoDeExclusion } = useDatos();
  const { mostrarAviso } = useAvisos();
  const [motivo, setMotivo] = useState('');
  const [error, setError] = useState<string | null>(null);
  const anio = Number(mes.slice(0, 4));
  const numero = Number(mes.slice(5, 7));
  const nombre = nombreDelMesConMayuscula(mes);
  const motivoActual = motivoDeExclusion.get(mes);

  async function excluir(e: FormEvent) {
    e.preventDefault();
    const texto = motivo.trim();
    if (!texto) {
      setError('Escribe el motivo.');
      return;
    }
    try {
      await excluirMes({ anio, mes: numero, motivo: texto });
      alCerrar();
      mostrarAviso({
        texto: `${nombre} quedó fuera del promedio.`,
        accion: { etiqueta: 'Deshacer', alHacer: () => incluirMes(anio, numero) },
      });
    } catch (fallo) {
      setError((fallo as Error).message);
    }
  }

  async function incluir() {
    try {
      await incluirMes(anio, numero);
      alCerrar();
      mostrarAviso({
        texto: `${nombre} ya no está excluido.`,
        accion: {
          etiqueta: 'Deshacer',
          alHacer: () => excluirMes({ anio, mes: numero, motivo: motivoActual ?? 'Excluido a mano.' }),
        },
      });
    } catch (fallo) {
      setError((fallo as Error).message);
    }
  }

  if (estado === 'excluido') {
    return (
      <Dialogo titulo={`Incluir ${nombre}`} alCerrar={alCerrar} forma="centro">
        <div className="space-y-4">
          <p>
            <span className="font-semibold">Motivo de la exclusión: </span>
            {motivoActual}
          </p>
          <p>Si lo incluyes, vuelve a contar para el promedio cuando esté completo.</p>
          {error && <p role="alert" className="font-semibold text-error">{error}</p>}
          <button type="button" className="boton boton-primario w-full" onClick={() => void incluir()}>
            Incluir en el promedio
          </button>
        </div>
      </Dialogo>
    );
  }

  return (
    <Dialogo titulo={`Excluir ${nombre}`} alCerrar={alCerrar} forma="centro">
      <form className="space-y-4" onSubmit={(e) => void excluir(e)} noValidate>
        <p>Sus movimientos y totales se mantienen; solo deja de contar para el promedio.</p>
        <div>
          <label htmlFor="motivo-exclusion" className="etiqueta">
            Motivo
          </label>
          <input
            id="motivo-exclusion"
            type="text"
            className="control"
            autoComplete="off"
            maxLength={300}
            placeholder="Ej.: faltan las cartolas"
            value={motivo}
            aria-invalid={error ? true : undefined}
            onChange={(e) => {
              setMotivo(e.target.value);
              setError(null);
            }}
          />
          {error && <p role="alert" className="mt-1 font-semibold text-error">{error}</p>}
        </div>
        <button type="submit" className="boton boton-primario w-full">
          Excluir del promedio
        </button>
      </form>
    </Dialogo>
  );
}

function FilaResumen({ etiqueta, campo, meses, total, promedio }: {
  etiqueta: string;
  campo: keyof TotalesMes;
  meses: readonly (TotalesMes & { mes: Mes })[];
  total: number;
  promedio: number | null;
}) {
  const conSigno = campo === 'diferencia';
  const moneda = (valor: number) => (
    <span className={conSigno && valor < 0 ? 'text-gasto' : ''}>{valor === 0 ? '—' : formatearMoneda(valor)}</span>
  );
  return (
    <tr className="font-semibold">
      <th scope="row" className={`${PRIMERA_COLUMNA} font-semibold`}>{etiqueta}</th>
      {meses.map((m) => (
        <td key={m.mes} className={CELDA}>{moneda(m[campo])}</td>
      ))}
      <td className={`${CELDA} font-bold`}>{moneda(total)}</td>
      <td className={CELDA}>{promedio === null ? '—' : moneda(promedio)}</td>
      <td className={CELDA} />
    </tr>
  );
}

function FilaCategoria({ fila, anio, meses, maximo, color }: {
  fila: FilaCategoriaAnual;
  anio: number;
  meses: readonly Mes[];
  maximo: number;
  color: string;
}) {
  const { categoria, porMes, total, promedio, porcentajeGasto } = fila;
  const enlaceAnio = direccionDe(
    'movimientos',
    paramsDesdeFiltro({ categoriaId: categoria.id, desde: `${anio}-01-01`, hasta: `${anio}-12-31` }),
  );
  return (
    <tr>
      <th scope="row" className={`${PRIMERA_COLUMNA} font-normal`}>
        <a href={enlaceAnio} className="underline-offset-4 hover:underline">{categoria.nombre}</a>
      </th>
      {porMes.map((valor, i) => {
        const mes = meses[i] as Mes;
        const fondo = intensidadHeatmap(valor, maximo) * OPACIDAD_MAXIMA_HEATMAP;
        return (
          <td
            key={mes}
            className={CELDA}
            style={fondo > 0 ? { background: `color-mix(in srgb, var(${color}) ${fondo.toFixed(1)}%, transparent)` } : undefined}
          >
            {valor === 0 ? (
              <span className="text-texto-suave">—</span>
            ) : (
              <a
                className="underline-offset-4 hover:underline"
                href={direccionDe('movimientos', paramsDesdeFiltro({ mes, categoriaId: categoria.id }))}
              >
                {formatearMoneda(valor)}
              </a>
            )}
          </td>
        );
      })}
      <td className={`${CELDA} font-bold`}>{total === 0 ? '—' : formatearMoneda(total)}</td>
      <td className={CELDA}>{promedio === null || promedio === 0 ? '—' : formatearMoneda(promedio)}</td>
      <td className={CELDA}>{porcentajeGasto === null ? '' : formatearPorcentaje(porcentajeGasto)}</td>
    </tr>
  );
}

export function PaginaAnio() {
  const { categorias, movimientos, excluidos, motivoDeExclusion } = useDatos();
  const { params, reemplazarParams } = useRuta();
  const [mesEditado, setMesEditado] = useState<Mes | null>(null);
  const [verTodas, setVerTodas] = useState(false);

  const calendario = useMemo(() => calcularCalendario(movimientos.map((m) => m.fecha)), [movimientos]);
  const mesDeHoy = mesDeFecha(fechaDeHoy());
  const parametro = Number(params.get('a'));
  const anio = Number.isInteger(parametro) && parametro >= 2000 && parametro <= 2100
    ? parametro
    : Number(mesPredeterminado(calendario, mesDeHoy).slice(0, 4));

  const opciones = useMemo(() => {
    const anios = [...new Set(mesesNavegables(calendario, mesDeHoy).map((m) => m.slice(0, 4)))];
    return anios.map((a) => ({ valor: a, texto: a }));
  }, [calendario, mesDeHoy]);

  const resumen = useMemo(
    () => calcularResumenAnual({ categorias, movimientos, excluidos }, anio),
    [categorias, movimientos, excluidos, anio],
  );
  const { meses, totales, promedios, filas } = resumen;

  const listaMeses = meses.map((m) => m.mes);
  const excluidosDelAnio = meses.filter((m) => m.excluido);
  const conPromedio = (valor: number | null) => (valor === null ? 'Sin meses completos' : `Promedio: ${formatearMoneda(valor)}`);
  const ocultas = filas.filter((f) => f.total === 0).length;

  return (
    <div className="space-y-5">
      <div className="space-y-3 md:flex md:items-center md:justify-between md:gap-6 md:space-y-0">
        <h1 className="text-2xl font-bold">Resumen del año</h1>
        <div className="md:w-72">
          <Navegador
            etiqueta="Año"
            opciones={opciones}
            valor={String(anio)}
            alCambiar={(a) => reemplazarParams(new URLSearchParams({ a }))}
          />
        </div>
      </div>

      <dl className="grid grid-cols-1 gap-3 min-[26rem]:grid-cols-2 lg:grid-cols-4">
        <Cifra etiqueta="Ingresos del año" valor={formatearMoneda(totales.ingresos)} color="text-ingreso" detalle={conPromedio(promedios.ingresos)} />
        <Cifra etiqueta="Gastos del año" valor={formatearMoneda(totales.gastos)} color="text-gasto" detalle={conPromedio(promedios.gastos)} />
        <Cifra
          etiqueta="Diferencia"
          valor={formatearMoneda(totales.diferencia)}
          color={totales.diferencia < 0 ? 'text-gasto' : 'text-ingreso'}
          detalle={conPromedio(promedios.diferencia)}
        />
        <Cifra etiqueta="Traído de otras cuentas propias (neto)" valor={formatearMoneda(totales.traidoNeto)} detalle={conPromedio(promedios.traidoNeto)} />
      </dl>

      <section className="rounded-lg border border-borde-suave bg-superficie p-4">
        <h2 className="text-xl font-bold">Meses que cuentan para el promedio</h2>
        <p className="mb-3 text-texto-suave">
          {resumen.descripcionPromedio}. Toca un mes para excluirlo o volver a incluirlo.
        </p>
        <ul className="grid grid-cols-3 gap-2 md:grid-cols-6">
          {listaMeses.map((mes) => {
            const estado = estadoMesParaPromedio(calendario, excluidos, mes);
            const { texto, marca } = ESTADOS[estado];
            const editable = estado === 'excluido' || sePuedeExcluir(estado);
            const resaltado =
              estado === 'cuenta' ? 'border-estado-bien' : estado === 'excluido' ? 'border-estado-excedido' : 'border-borde-suave';
            return (
              <li key={mes}>
                <button
                  type="button"
                  disabled={!editable}
                  className={`flex min-h-16 w-full flex-col items-center justify-center rounded-lg border-2 bg-superficie p-1 ${resaltado} ${
                    editable ? 'cursor-pointer hover:bg-superficie-2' : 'text-texto-suave'
                  }`}
                  onClick={() => setMesEditado(mes)}
                >
                  <span className="font-bold">{mesCorto(mes)}</span>
                  <span>{marca} {texto}</span>
                </button>
              </li>
            );
          })}
        </ul>
        {excluidosDelAnio.length > 0 && (
          <ul className="mt-3 space-y-1">
            {excluidosDelAnio.map((m) => (
              <li key={m.mes}>
                <span className="font-semibold">{nombreDelMesConMayuscula(m.mes)}: </span>
                {motivoDeExclusion.get(m.mes)}
              </li>
            ))}
          </ul>
        )}
      </section>

      <Suspense fallback={<p className="rounded-lg border border-borde-suave bg-superficie p-6 text-center">Cargando gráficos…</p>}>
        <GraficosAnio resumen={resumen} calendario={calendario} />
      </Suspense>

      <section>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xl font-bold">Detalle por mes y categoría</h2>
          {ocultas > 0 && (
            <button type="button" className="boton" aria-pressed={verTodas} onClick={() => setVerTodas((v) => !v)}>
              {verTodas ? 'Ocultar las que no tienen datos' : `Ver todas (${ocultas} sin datos)`}
            </button>
          )}
        </div>
        <p className="mb-2 text-texto-suave">El color más intenso marca los montos más altos de cada grupo.</p>
        <div className="max-h-[85dvh] overflow-auto rounded-lg border border-borde-suave bg-superficie" tabIndex={0} role="region" aria-label="Detalle por mes y categoría">
          <table className="montos w-full border-separate border-spacing-0">
            <thead className="sticky top-0 z-20">
              <tr>
                <th scope="col" className="sticky left-0 z-10 border-r border-b border-borde bg-superficie-2 px-2 py-2 text-left">
                  Categoría
                </th>
                {meses.map((m) => (
                  <th key={m.mes} scope="col" className="border-b border-borde bg-superficie-2 px-2 py-2 text-right whitespace-nowrap">
                    <a
                      className="underline-offset-4 hover:underline"
                      href={direccionDe('mes', new URLSearchParams({ m: m.mes }))}
                      title={nombreDelMesConMayuscula(m.mes)}
                    >
                      {mesCorto(m.mes)}{m.cuentaParaPromedio ? ' ✓' : ''}
                    </a>
                  </th>
                ))}
                <th scope="col" className="border-b border-borde bg-superficie-2 px-2 py-2 text-right whitespace-nowrap">Total año</th>
                <th scope="col" className="border-b border-borde bg-superficie-2 px-2 py-2 text-right">Promedio</th>
                <th scope="col" className="border-b border-borde bg-superficie-2 px-2 py-2 text-right whitespace-nowrap">% gasto</th>
              </tr>
            </thead>
            <tbody>
              <FilaResumen etiqueta="Ingresos" campo="ingresos" meses={meses} total={totales.ingresos} promedio={promedios.ingresos} />
              <FilaResumen etiqueta="Gastos" campo="gastos" meses={meses} total={totales.gastos} promedio={promedios.gastos} />
              <FilaResumen etiqueta="Diferencia" campo="diferencia" meses={meses} total={totales.diferencia} promedio={promedios.diferencia} />
              <FilaResumen etiqueta="Traído neto" campo="traidoNeto" meses={meses} total={totales.traidoNeto} promedio={promedios.traidoNeto} />
            </tbody>
            {GRUPOS.map(({ tipo, titulo, color }) => {
              const delGrupo = filas.filter((f) => f.categoria.tipo === tipo);
              const visibles = delGrupo.filter((f) => verTodas || f.total > 0);
              if (visibles.length === 0) return null;
              const maximo = Math.max(...delGrupo.flatMap((f) => f.porMes));
              return (
                <tbody key={tipo}>
                  <tr>
                    <th scope="colgroup" className="sticky left-0 z-10 border-r border-b border-borde bg-superficie-2 px-2 py-2 text-left">
                      {titulo}
                    </th>
                    <td colSpan={15} className="border-b border-borde bg-superficie-2" />
                  </tr>
                  {visibles.map((fila) => (
                    <FilaCategoria
                      key={fila.categoria.id}
                      fila={fila}
                      anio={anio}
                      meses={listaMeses}
                      maximo={maximo}
                      color={color}
                    />
                  ))}
                </tbody>
              );
            })}
          </table>
        </div>
      </section>

      {mesEditado && (
        <DialogoMes
          mes={mesEditado}
          estado={estadoMesParaPromedio(calendario, excluidos, mesEditado)}
          alCerrar={() => setMesEditado(null)}
        />
      )}
    </div>
  );
}
