import { useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  alternarSerie,
  MAXIMO_SERIES,
  serieConHuecos,
  seriesIniciales,
  tendenciaDeGasto,
  type Calendario,
  type ResumenAnual,
  type SerieElegida,
} from '../../lib/calculos';
import { formatearMoneda, formatearMonedaCompacta, mesCorto } from '../../lib/formato';

const ALTO_GRAFICO = 320;
const TEXTO_EJE = { fill: 'var(--texto-suave)', fontSize: 16 };
const MARGEN = { top: 8, right: 8, bottom: 0, left: 0 };

const colorSerie = (indice: number) => `var(--serie-${indice})`;

interface ElementoGlobo {
  name?: string;
  value?: number | null;
  color?: string;
}

interface PropsGlobo {
  active?: boolean;
  label?: string | number;
  payload?: readonly ElementoGlobo[];
}

/** Valores en color de texto; la identidad la lleva la marca de color al lado. */
function Globo({ active, label, payload }: PropsGlobo) {
  const elementos = (payload ?? []).filter((e) => e.value !== null && e.value !== undefined);
  if (!active || elementos.length === 0) return null;
  return (
    <div className="max-w-xs rounded-lg border border-borde bg-superficie p-2 shadow-lg">
      <p className="mb-1 font-bold">{label}</p>
      <ul>
        {[...elementos]
          .sort((a, b) => (b.value ?? 0) - (a.value ?? 0))
          .map((e) => (
            <li key={e.name} className="flex items-baseline justify-between gap-3">
              <span className="flex min-w-0 items-baseline gap-2">
                <span className="inline-block size-3 shrink-0 rounded-sm" style={{ background: e.color }} />
                <span className="truncate">{e.name}</span>
              </span>
              <span className="montos shrink-0 font-semibold">{formatearMoneda(e.value ?? 0)}</span>
            </li>
          ))}
      </ul>
    </div>
  );
}

const renderGlobo = (props: unknown) => <Globo {...(props as PropsGlobo)} />;

function LeyendaIngresosGastos() {
  return (
    <ul className="mb-2 flex flex-wrap gap-x-4">
      <li className="flex items-center gap-2">
        <span className="inline-block size-3 rounded-sm bg-barra-ingreso" />
        Ingresos
      </li>
      <li className="flex items-center gap-2">
        <span className="inline-block size-3 rounded-sm bg-barra-gasto" />
        Gastos
      </li>
    </ul>
  );
}

function GraficoIngresosGastos({ resumen }: { resumen: ResumenAnual }) {
  // El asterisco marca los meses con datos que no entran al promedio, como un febrero incompleto.
  const filas = resumen.meses.map((m) => ({
    etiqueta: `${mesCorto(m.mes)}${!m.cuentaParaPromedio && (m.ingresos > 0 || m.gastos > 0) ? '*' : ''}`,
    ingresos: m.ingresos,
    gastos: m.gastos,
  }));
  const hayAsterisco = filas.some((f) => f.etiqueta.endsWith('*'));
  return (
    <section className="min-w-0 rounded-lg border border-borde-suave bg-superficie p-4">
      <h2 className="mb-2 text-xl font-bold">Ingresos y gastos por mes</h2>
      <LeyendaIngresosGastos />
      <div style={{ height: ALTO_GRAFICO }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={filas} margin={MARGEN} barGap={2} barCategoryGap="20%">
            <CartesianGrid vertical={false} stroke="var(--borde-suave)" />
            <XAxis dataKey="etiqueta" tick={TEXTO_EJE} tickLine={false} axisLine={{ stroke: 'var(--borde)' }} minTickGap={4} />
            <YAxis tick={TEXTO_EJE} tickLine={false} axisLine={false} width={72} tickFormatter={formatearMonedaCompacta} />
            <Tooltip cursor={{ fill: 'var(--superficie-2)' }} content={renderGlobo} />
            <Bar name="Ingresos" dataKey="ingresos" fill="var(--barra-ingreso)" radius={[4, 4, 0, 0]} maxBarSize={24} isAnimationActive={false} />
            <Bar name="Gastos" dataKey="gastos" fill="var(--barra-gasto)" radius={[4, 4, 0, 0]} maxBarSize={24} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      {hayAsterisco && <p className="mt-2 text-texto-suave">* No cuenta para el promedio.</p>}
    </section>
  );
}

function GraficoTendencia({ resumen, calendario }: { resumen: ResumenAnual; calendario: Calendario | null }) {
  // Siempre todas las categorías de gasto, también las agregadas después.
  const candidatas = useMemo(() => tendenciaDeGasto(resumen), [resumen]);
  const [series, setSeries] = useState<SerieElegida[]>(() =>
    seriesIniciales(candidatas.filter((f) => f.total > 0).map((f) => f.categoria.id)),
  );
  const colorDe = new Map(series.map((s) => [s.categoriaId, s.color]));
  const elegidas = candidatas.filter((f) => colorDe.has(f.categoria.id));

  const filas = useMemo(
    () =>
      resumen.meses.map((m, i) => {
        const fila: Record<string, string | number | null> = { etiqueta: mesCorto(m.mes) };
        for (const candidata of candidatas) {
          fila[`c${candidata.categoria.id}`] = serieConHuecos(candidata.porMes, resumen.anio, calendario)[i] ?? null;
        }
        return fila;
      }),
    [resumen, candidatas, calendario],
  );
  const lleno = series.length >= MAXIMO_SERIES;

  return (
    <section className="min-w-0 rounded-lg border border-borde-suave bg-superficie p-4">
      <h2 className="mb-2 text-xl font-bold">Gasto mensual por categoría</h2>
      {elegidas.length === 0 ? (
        <p className="mb-2 text-texto-suave">Elige al menos una categoría para ver su línea.</p>
      ) : (
        <>
          <ul className="mb-2 flex flex-wrap gap-x-4 gap-y-1">
            {elegidas.map((f) => (
              <li key={f.categoria.id} className="flex min-w-0 items-center gap-2">
                <span className="inline-block h-1 w-4 shrink-0 rounded-sm" style={{ background: colorSerie(colorDe.get(f.categoria.id) ?? 0) }} />
                <span className="min-w-0">{f.categoria.nombre}</span>
              </li>
            ))}
          </ul>
          <div style={{ height: ALTO_GRAFICO }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={filas} margin={MARGEN}>
                <CartesianGrid vertical={false} stroke="var(--borde-suave)" />
                <XAxis dataKey="etiqueta" tick={TEXTO_EJE} tickLine={false} axisLine={{ stroke: 'var(--borde)' }} minTickGap={4} />
                <YAxis tick={TEXTO_EJE} tickLine={false} axisLine={false} width={72} tickFormatter={formatearMonedaCompacta} />
                <Tooltip cursor={{ stroke: 'var(--borde)' }} content={renderGlobo} />
                {elegidas.map((f) => {
                  const color = colorSerie(colorDe.get(f.categoria.id) ?? 0);
                  return (
                    <Line
                      key={f.categoria.id}
                      name={f.categoria.nombre}
                      dataKey={`c${f.categoria.id}`}
                      stroke={color}
                      strokeWidth={2}
                      dot={{ r: 4, fill: color, stroke: 'var(--superficie)', strokeWidth: 2 }}
                      activeDot={{ r: 6, fill: color, stroke: 'var(--superficie)', strokeWidth: 2 }}
                      isAnimationActive={false}
                    />
                  );
                })}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </>
      )}
      <details className="mt-3">
        <summary className="boton w-full cursor-pointer list-none">
          Elegir categorías ({series.length} de {MAXIMO_SERIES} como máximo)
        </summary>
        <ul className="mt-2 max-h-96 overflow-y-auto rounded-lg border border-borde-suave">
          {candidatas.map((f) => {
            const id = f.categoria.id;
            const marcada = colorDe.has(id);
            return (
              <li key={id} className="border-b border-borde-suave last:border-b-0">
                <label className={`flex min-h-12 items-center gap-3 px-3 py-1 ${!marcada && lleno ? 'opacity-55' : 'cursor-pointer'}`}>
                  <input
                    type="checkbox"
                    className="size-6 shrink-0 accent-primario"
                    checked={marcada}
                    disabled={!marcada && lleno}
                    onChange={() => setSeries((actual) => alternarSerie(actual, id))}
                  />
                  <span className="min-w-0 flex-1">{f.categoria.nombre}</span>
                  <span className="montos shrink-0 text-texto-suave">{formatearMoneda(f.total)}</span>
                </label>
              </li>
            );
          })}
        </ul>
      </details>
    </section>
  );
}

export default function GraficosAnio({ resumen, calendario }: { resumen: ResumenAnual; calendario: Calendario | null }) {
  return (
    <div className="grid gap-5 xl:grid-cols-2">
      <GraficoIngresosGastos resumen={resumen} />
      {/* Cada año parte con sus propias seis categorías más grandes. */}
      <GraficoTendencia key={resumen.anio} resumen={resumen} calendario={calendario} />
    </div>
  );
}
