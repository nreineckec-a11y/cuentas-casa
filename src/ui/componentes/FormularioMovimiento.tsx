import { useDeferredValue, useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode } from 'react';
import type { Tipo } from '../../lib/calculos';
import { erroresPorCampo, esquemaMovimiento, type DatosMovimiento } from '../../lib/esquemas';
import {
  fechaDeHoy,
  formatearFecha,
  formatearMoneda,
  formatearMontoAlEscribir,
  parsearMonto,
  sumarDias,
} from '../../lib/formato';
import {
  categoriasDelTipo,
  etiquetaGuardar as etiquetaDelTipo,
  indiceDeDescripciones,
  posiblesDuplicados,
  quitarPrefijoRevisar,
  recordatorioDobleConteo,
  tienePrefijoRevisar,
  type SugerenciaDescripcion,
} from '../../lib/movimientos';
import type { Movimiento } from '../../lib/tipos';
import { useDatos } from '../datos';
import { CampoDescripcion } from './CampoDescripcion';
import { SelectorCategoria } from './SelectorCategoria';

const CLAVE_ULTIMA_CUENTA = 'casa.ultimaCuenta';

function leerUltimaCuenta(): number | null {
  try {
    return Number(localStorage.getItem(CLAVE_ULTIMA_CUENTA)) || null;
  } catch {
    return null;
  }
}

function recordarCuenta(id: number): void {
  try {
    localStorage.setItem(CLAVE_ULTIMA_CUENTA, String(id));
  } catch {
    // Sin almacenamiento, el formulario usa la primera cuenta.
  }
}

const TIPOS: { tipo: Tipo; titulo: string; activo: string; monto: string }[] = [
  { tipo: 'Gasto', titulo: 'Gasto', activo: 'bg-gasto', monto: 'text-gasto' },
  { tipo: 'Ingreso', titulo: 'Ingreso', activo: 'bg-ingreso', monto: 'text-ingreso' },
  { tipo: 'Traspaso', titulo: 'Traspaso', activo: 'bg-traspaso', monto: 'text-traspaso' },
];

interface Props {
  /** Si viene, edita ese movimiento; si no, anota uno nuevo. */
  movimiento?: Movimiento;
  alGuardar: (datos: DatosMovimiento) => Promise<void>;
  /** Sin etiqueta, el botón dice qué se va a guardar: "Guardar ingreso". */
  etiquetaGuardar?: string;
  extras?: ReactNode;
}

export function FormularioMovimiento({ movimiento, alGuardar, etiquetaGuardar, extras }: Props) {
  const { categorias, cuentas, categoriaPorId, movimientos } = useDatos();
  const esNuevo = !movimiento;

  const cuentasVisibles = useMemo(
    () => cuentas.filter((c) => c.activa || c.id === movimiento?.cuentaId),
    [cuentas, movimiento?.cuentaId],
  );

  const [fecha, setFecha] = useState(movimiento?.fecha ?? fechaDeHoy());
  const [montoTexto, setMontoTexto] = useState(movimiento ? formatearMoneda(movimiento.monto) : '');
  const [descripcion, setDescripcion] = useState(movimiento?.descripcion ?? '');
  const [categoriaId, setCategoriaId] = useState<number | null>(movimiento?.categoriaId ?? null);
  const [tipo, setTipo] = useState<Tipo>(() => (movimiento && categoriaPorId.get(movimiento.categoriaId)?.tipo) || 'Gasto');
  const [cuentaId, setCuentaId] = useState<number | null>(() => {
    if (movimiento) return movimiento.cuentaId;
    const recordada = leerUltimaCuenta();
    return cuentasVisibles.find((c) => c.id === recordada)?.id ?? cuentasVisibles[0]?.id ?? null;
  });
  const [nota, setNota] = useState(movimiento?.nota ?? '');
  const [porRevisar, setPorRevisar] = useState(movimiento?.porRevisar ?? false);
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [guardando, setGuardando] = useState(false);

  // Lo que la persona eligió a mano no se pisa con las sugerencias.
  const eligioCategoria = useRef(esNuevo ? false : true);
  const eligioCuenta = useRef(esNuevo ? false : true);
  const eligioTipo = useRef(esNuevo ? false : true);

  const refMonto = useRef<HTMLInputElement>(null);
  const refDescripcion = useRef<HTMLInputElement>(null);
  const refCategoria = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (esNuevo) refMonto.current?.focus();
  }, [esNuevo]);

  const indice = useMemo(() => indiceDeDescripciones(movimientos), [movimientos]);
  const monto = parsearMonto(montoTexto);

  const entradaDiferida = useDeferredValue({ fecha, monto, descripcion });
  const duplicados = useMemo(
    () => posiblesDuplicados({ ...entradaDiferida, id: movimiento?.id }, movimientos),
    [entradaDiferida, movimiento?.id, movimientos],
  );

  const categoria = categoriaId === null ? undefined : categoriaPorId.get(categoriaId);
  const recordatorio = recordatorioDobleConteo(categoria?.rol);
  const hoy = fechaDeHoy();
  const esFutura = fecha > hoy;
  const categoriasVisibles = useMemo(() => categoriasDelTipo(categorias, tipo), [categorias, tipo]);
  const colorMonto = TIPOS.find((t) => t.tipo === tipo)?.monto ?? '';

  function alCambiarTipo(nuevo: Tipo) {
    eligioTipo.current = true;
    setTipo(nuevo);
    if (categoria?.tipo !== nuevo) {
      setCategoriaId(null);
      eligioCategoria.current = false;
    }
  }

  function alElegirSugerencia(sugerencia: SugerenciaDescripcion) {
    setDescripcion(sugerencia.descripcion);
    const sugerida = categoriaPorId.get(sugerencia.categoriaId);
    // La descripción también sugiere el tipo, salvo que ya se haya elegido otro a mano.
    if (!eligioCategoria.current && sugerida && (!eligioTipo.current || sugerida.tipo === tipo)) {
      setCategoriaId(sugerida.id);
      setTipo(sugerida.tipo);
    }
    if (!eligioCuenta.current && cuentasVisibles.some((c) => c.id === sugerencia.cuentaId)) {
      setCuentaId(sugerencia.cuentaId);
    }
  }

  function alCambiarCategoria(id: number) {
    eligioCategoria.current = true;
    setCategoriaId(id);
    setErrores(({ categoriaId: _quitado, ...resto }) => resto);
  }

  function enfocarPrimerError(campos: Record<string, string>) {
    if (campos.monto) refMonto.current?.focus();
    else if (campos.categoriaId) refCategoria.current?.focus();
    else if (campos.descripcion) refDescripcion.current?.focus();
  }

  async function alEnviar(e: FormEvent) {
    e.preventDefault();
    if (guardando) return;
    const validacion = esquemaMovimiento.safeParse({ fecha, descripcion, categoriaId, monto, cuentaId, nota, porRevisar });
    if (!validacion.success) {
      const campos = erroresPorCampo(validacion.error);
      setErrores(campos);
      enfocarPrimerError(campos);
      return;
    }
    setErrores({});
    setGuardando(true);
    try {
      await alGuardar(validacion.data);
      if (esNuevo) {
        recordarCuenta(validacion.data.cuentaId);
        // Listo para el siguiente: se mantienen la fecha y la cuenta. El tipo vuelve a Gasto, el
        // más frecuente, para que un gasto no quede anotado como ingreso sin querer.
        setMontoTexto('');
        setDescripcion('');
        setCategoriaId(null);
        setNota('');
        setPorRevisar(false);
        setTipo('Gasto');
        eligioTipo.current = false;
        eligioCategoria.current = false;
        refMonto.current?.focus();
      }
    } catch (error) {
      setErrores({ general: (error as Error).message });
    } finally {
      setGuardando(false);
    }
  }

  /** Enter en una lista desplegable también guarda. */
  function enterGuarda(e: KeyboardEvent<HTMLSelectElement>) {
    if (e.key === 'Enter') {
      e.preventDefault();
      e.currentTarget.form?.requestSubmit();
    }
  }

  return (
    <form onSubmit={(e) => void alEnviar(e)} className="space-y-4" noValidate>
      <div role="radiogroup" aria-label="Tipo de movimiento" className="grid grid-cols-3 gap-2">
        {TIPOS.map(({ tipo: opcion, titulo, activo }) => (
          <button
            key={opcion}
            type="button"
            role="radio"
            aria-checked={tipo === opcion}
            className={`boton px-2 ${tipo === opcion ? `${activo} border-transparent text-white dark:text-black` : ''}`}
            onClick={() => alCambiarTipo(opcion)}
          >
            {titulo}
          </button>
        ))}
      </div>
      {tipo === 'Traspaso' && (
        <p className="text-texto-suave">Plata entre tus propias cuentas: no suma a ingresos ni a gastos.</p>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="mov-monto" className="etiqueta">
            Monto
          </label>
          <input
            ref={refMonto}
            id="mov-monto"
            type="text"
            inputMode="numeric"
            autoComplete="off"
            enterKeyHint="done"
            className={`control montos text-xl font-bold ${colorMonto}`}
            placeholder="$0"
            value={montoTexto}
            aria-invalid={errores.monto ? true : undefined}
            onChange={(e) => {
              setMontoTexto(formatearMontoAlEscribir(e.target.value));
              setErrores(({ monto: _quitado, ...resto }) => resto);
            }}
          />
        </div>
        <div>
          <label htmlFor="mov-fecha" className="etiqueta">
            Fecha
          </label>
          <input
            id="mov-fecha"
            type="date"
            className="control"
            value={fecha}
            aria-invalid={errores.fecha ? true : undefined}
            onChange={(e) => setFecha(e.target.value)}
          />
        </div>
        {errores.monto && <p className="col-start-1 font-semibold text-error">{errores.monto}</p>}
        {errores.fecha && <p className="col-start-2 font-semibold text-error">{errores.fecha}</p>}
        {esNuevo && (
          <div className="col-span-2 flex gap-2">
            <button type="button" className="boton flex-1" aria-pressed={fecha === hoy} onClick={() => setFecha(hoy)}>
              Hoy
            </button>
            <button
              type="button"
              className="boton flex-1"
              aria-pressed={fecha === sumarDias(hoy, -1)}
              onClick={() => setFecha(sumarDias(hoy, -1))}
            >
              Ayer
            </button>
          </div>
        )}
      </div>

      {esFutura && (
        <p className="rounded-lg bg-aviso-fondo p-3 text-aviso-texto">
          Esta fecha es futura ({formatearFecha(fecha)}). Puede cambiar qué mes cuenta como mes en curso.
        </p>
      )}

      <CampoDescripcion
        ref={refDescripcion}
        valor={descripcion}
        alCambiar={setDescripcion}
        alElegir={alElegirSugerencia}
        indice={indice}
        textoCategoria={(id) => categoriaPorId.get(id)?.nombre ?? ''}
        error={errores.descripcion}
      />

      {duplicados[0] && (
        <div role="status" className="rounded-lg bg-aviso-fondo p-3 text-aviso-texto">
          <p className="font-semibold">Posible duplicado</p>
          <p>
            Ya hay un movimiento parecido: {formatearFecha(duplicados[0].fecha)} · {formatearMoneda(duplicados[0].monto)} ·{' '}
            {duplicados[0].descripcion}
            {duplicados.length > 1 && ` (y ${duplicados.length - 1} más)`}. Puedes guardar igual.
          </p>
        </div>
      )}

      <SelectorCategoria
        ref={refCategoria}
        categorias={categoriasVisibles}
        valor={categoriaId}
        alCambiar={alCambiarCategoria}
        error={errores.categoriaId}
        textoSinResultados={`No hay categorías de ${tipo.toLowerCase()} con ese nombre. ¿Es otro tipo de movimiento?`}
      />

      {recordatorio && (
        <p role="status" className="rounded-lg bg-aviso-fondo p-3 text-aviso-texto">
          {recordatorio}
        </p>
      )}

      <div>
        <label htmlFor="mov-cuenta" className="etiqueta">
          Cuenta o medio de pago
        </label>
        <select
          id="mov-cuenta"
          className="control"
          value={cuentaId ?? ''}
          aria-invalid={errores.cuentaId ? true : undefined}
          onChange={(e) => {
            eligioCuenta.current = true;
            setCuentaId(Number(e.target.value));
          }}
          onKeyDown={enterGuarda}
        >
          {cuentasVisibles.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nombre}
            </option>
          ))}
        </select>
        {errores.cuentaId && <p className="mt-1 font-semibold text-error">{errores.cuentaId}</p>}
      </div>

      <div>
        <label htmlFor="mov-nota" className="etiqueta">
          Nota <span className="font-normal text-texto-suave">(opcional)</span>
        </label>
        <input
          id="mov-nota"
          type="text"
          autoComplete="off"
          enterKeyHint="done"
          className="control"
          value={nota}
          onChange={(e) => setNota(e.target.value)}
        />
        {errores.nota && <p className="mt-1 font-semibold text-error">{errores.nota}</p>}
      </div>

      <div>
        <label className="flex min-h-12 cursor-pointer items-center gap-3">
          <input
            type="checkbox"
            className="size-6 shrink-0 accent-primario"
            checked={porRevisar}
            onChange={(e) => setPorRevisar(e.target.checked)}
          />
          <span className="font-semibold">Por revisar</span>
        </label>
        {!porRevisar && tienePrefijoRevisar(nota) && (
          <div className="mt-1 flex flex-wrap items-center gap-3">
            <p className="text-texto-suave">La nota todavía empieza con «Revisar».</p>
            <button type="button" className="boton" onClick={() => setNota(quitarPrefijoRevisar(nota))}>
              Quitar «Revisar»
            </button>
          </div>
        )}
      </div>

      {errores.general && (
        <p role="alert" className="rounded-lg border-2 border-error p-3 font-semibold text-error">
          {errores.general} No se guardó; tus datos siguen aquí.
        </p>
      )}

      {extras}

      <button type="submit" className="boton boton-primario w-full text-lg" disabled={guardando}>
        {guardando ? 'Guardando…' : (etiquetaGuardar ?? etiquetaDelTipo(tipo))}
      </button>
    </form>
  );
}
