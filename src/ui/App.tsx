import { useState, type ReactNode } from 'react';
import { ProveedorAvisos } from './avisos';
import {
  IconoAgregar,
  IconoAnio,
  IconoCategorias,
  IconoDatos,
  IconoLista,
  IconoLuna,
  IconoMas,
  IconoMes,
  IconoRevisar,
  IconoSol,
} from './componentes/Iconos';
import { ProveedorDatos, useDatos } from './datos';
import { PaginaAgregar } from './paginas/Agregar';
import { PaginaAnio } from './paginas/Anio';
import { PaginaCatalogos } from './paginas/Catalogos';
import { PaginaDatos, SeccionImportar, SeccionRespaldos } from './paginas/Datos';
import { PaginaMes } from './paginas/Mes';
import { PaginaMovimientos } from './paginas/Movimientos';
import { PaginaPorRevisar } from './paginas/PorRevisar';
import { direccionDe, useRuta, type Pagina } from './ruta';

const CLAVE_TEMA = 'casa.tema';

function BotonTema() {
  const [oscuro, setOscuro] = useState(() => document.documentElement.classList.contains('dark'));
  return (
    <button
      type="button"
      className="boton shrink-0 px-3"
      aria-label={oscuro ? 'Usar modo claro' : 'Usar modo oscuro'}
      onClick={() => {
        const nuevo = !oscuro;
        document.documentElement.classList.toggle('dark', nuevo);
        setOscuro(nuevo);
        try {
          localStorage.setItem(CLAVE_TEMA, nuevo ? 'oscuro' : 'claro');
        } catch {
          // Sin almacenamiento, el tema dura hasta recargar.
        }
      }}
    >
      {oscuro ? <IconoSol /> : <IconoLuna />}
    </button>
  );
}

interface Enlace {
  pagina: Pagina;
  etiqueta: string;
  icono: ReactNode;
}

const ENLACES: Enlace[] = [
  { pagina: 'agregar', etiqueta: 'Agregar', icono: <IconoAgregar /> },
  { pagina: 'movimientos', etiqueta: 'Movimientos', icono: <IconoLista /> },
  { pagina: 'revisar', etiqueta: 'Por revisar', icono: <IconoRevisar /> },
  { pagina: 'mes', etiqueta: 'Mes', icono: <IconoMes /> },
  { pagina: 'anio', etiqueta: 'Año', icono: <IconoAnio /> },
  { pagina: 'catalogos', etiqueta: 'Categorías', icono: <IconoCategorias /> },
  { pagina: 'datos', etiqueta: 'Datos', icono: <IconoDatos /> },
];

// En el celular entran cinco destinos solo con etiquetas cortas: el texto no baja de 16 px.
// Las más usadas van directo; las demás, dentro de Más.
const ENLACES_CELULAR: (Enlace & { corta: string })[] = [
  { pagina: 'agregar', etiqueta: 'Agregar', corta: 'Agregar', icono: <IconoAgregar /> },
  { pagina: 'movimientos', etiqueta: 'Movimientos', corta: 'Lista', icono: <IconoLista /> },
  { pagina: 'revisar', etiqueta: 'Por revisar', corta: 'Revisar', icono: <IconoRevisar /> },
  { pagina: 'mes', etiqueta: 'Mes', corta: 'Mes', icono: <IconoMes /> },
  { pagina: 'mas', etiqueta: 'Más opciones', corta: 'Más', icono: <IconoMas /> },
];

const PAGINAS_EN_MAS: readonly Pagina[] = ['mas', 'anio', 'catalogos', 'datos'];

function PaginaMas() {
  const destinos = [
    { pagina: 'anio' as const, titulo: 'Año', detalle: 'Resumen del año, gráficos y meses del promedio', icono: <IconoAnio /> },
    { pagina: 'catalogos' as const, titulo: 'Categorías y cuentas', detalle: 'Crear, ordenar, fijar presupuesto, archivar y fusionar', icono: <IconoCategorias /> },
    { pagina: 'datos' as const, titulo: 'Datos', detalle: 'Respaldos, exportar, importar y notas', icono: <IconoDatos /> },
  ];
  return (
    <div className="mx-auto max-w-xl space-y-3">
      <h1 className="text-2xl font-bold">Más opciones</h1>
      <ul className="space-y-2">
        {destinos.map(({ pagina, titulo, detalle, icono }) => (
          <li key={pagina}>
            <a href={direccionDe(pagina)} className="flex items-center gap-3 rounded-lg border border-borde-suave bg-superficie p-4 hover:bg-superficie-2">
              <span className="shrink-0">{icono}</span>
              <span className="min-w-0">
                <span className="block font-bold">{titulo}</span>
                <span className="block text-texto-suave">{detalle}</span>
              </span>
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Contador({ cantidad, className = '' }: { cantidad: number; className?: string }) {
  if (cantidad === 0) return null;
  return (
    <span className={`montos rounded-full bg-gasto px-2 font-bold text-white dark:text-black ${className}`} aria-label={`${cantidad} por revisar`}>
      {cantidad}
    </span>
  );
}

function AvisoDeRespaldo() {
  const { recordarDescarga } = useDatos();
  const { pagina } = useRuta();
  if (!recordarDescarga || pagina === 'datos') return null;
  return (
    <p role="status" className="bg-aviso-fondo px-4 py-2 text-center text-aviso-texto">
      Tus datos están solo en este dispositivo.{' '}
      <a className="font-semibold underline underline-offset-4" href={direccionDe('datos')}>
        Descarga un respaldo
      </a>
    </p>
  );
}

function Estructura() {
  const { pagina } = useRuta();
  const { porRevisar, categorias } = useDatos();

  if (categorias.length === 0) {
    return (
      <main className="mx-auto max-w-3xl space-y-5 p-4">
        <h1 className="text-2xl font-bold">Cuentas de la casa</h1>
        <p>Todavía no hay datos en este dispositivo. Para empezar, importa tu Excel o restaura un respaldo. Quedan guardados solo aquí.</p>
        <SeccionImportar />
        <SeccionRespaldos />
      </main>
    );
  }

  return (
    <>
      <header className="sticky top-0 z-30 hidden border-b border-borde-suave bg-superficie md:block">
        <div className="mx-auto flex max-w-6xl items-center gap-2 px-4 py-2">
          <p className="mr-2 hidden text-lg font-bold xl:block">Cuentas de la casa</p>
          <nav aria-label="Principal" className="flex min-w-0 flex-1 gap-1">
            {ENLACES.map(({ pagina: destino, etiqueta, icono }) => (
              <a
                key={destino}
                href={direccionDe(destino)}
                aria-current={pagina === destino ? 'page' : undefined}
                className={`flex min-h-12 items-center gap-2 rounded-lg px-2 font-semibold whitespace-nowrap lg:px-3 ${
                  pagina === destino ? 'bg-primario text-sobre-primario' : 'hover:bg-superficie-2'
                }`}
              >
                <span className="hidden xl:inline">{icono}</span>
                {etiqueta}
                {destino === 'revisar' && <Contador cantidad={porRevisar} />}
              </a>
            ))}
          </nav>
          <BotonTema />
        </div>
      </header>

      <div className="flex items-center justify-between gap-2 px-4 pt-3 md:hidden">
        <p className="font-bold">Cuentas de la casa</p>
        <BotonTema />
      </div>

      <AvisoDeRespaldo />

      <main className="mx-auto max-w-6xl px-4 pt-3 pb-[calc(6rem+env(safe-area-inset-bottom))] md:pt-6 md:pb-10">
        {pagina === 'agregar' && <PaginaAgregar />}
        {pagina === 'movimientos' && <PaginaMovimientos />}
        {pagina === 'revisar' && <PaginaPorRevisar />}
        {pagina === 'mes' && <PaginaMes />}
        {pagina === 'anio' && <PaginaAnio />}
        {pagina === 'catalogos' && <PaginaCatalogos />}
        {pagina === 'datos' && <PaginaDatos />}
        {pagina === 'mas' && <PaginaMas />}
      </main>

      <nav
        aria-label="Principal"
        className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-borde bg-superficie pb-[env(safe-area-inset-bottom)] md:hidden"
      >
        {ENLACES_CELULAR.map(({ pagina: destino, etiqueta, corta, icono }) => {
          const activo = destino === 'mas' ? PAGINAS_EN_MAS.includes(pagina) : pagina === destino;
          return (
            <a
              key={destino}
              href={direccionDe(destino)}
              aria-label={etiqueta === corta ? undefined : etiqueta}
              aria-current={activo ? 'page' : undefined}
              className={`relative flex min-h-[4.5rem] flex-col items-center justify-center font-semibold ${
                activo ? 'bg-primario text-sobre-primario' : ''
              }`}
            >
              {icono}
              {corta}
              {destino === 'revisar' && <Contador cantidad={porRevisar} className="absolute top-0.5 right-0.5" />}
            </a>
          );
        })}
      </nav>
    </>
  );
}

export function App() {
  return (
    <ProveedorAvisos>
      <ProveedorDatos>
        <Estructura />
      </ProveedorDatos>
    </ProveedorAvisos>
  );
}
