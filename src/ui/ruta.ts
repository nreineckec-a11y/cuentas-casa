import { useCallback, useMemo, useSyncExternalStore } from 'react';

export type Pagina = 'agregar' | 'movimientos' | 'revisar' | 'mes' | 'anio' | 'catalogos' | 'datos' | 'mas';

const PAGINAS: readonly string[] = ['agregar', 'movimientos', 'revisar', 'mes', 'anio', 'catalogos', 'datos', 'mas'];
const EVENTO_RUTA = 'casa:ruta';

function suscribir(aviso: () => void): () => void {
  window.addEventListener('hashchange', aviso);
  window.addEventListener(EVENTO_RUTA, aviso);
  return () => {
    window.removeEventListener('hashchange', aviso);
    window.removeEventListener(EVENTO_RUTA, aviso);
  };
}

const leerHash = () => window.location.hash;

export function direccionDe(pagina: Pagina, params?: URLSearchParams): string {
  const consulta = params?.toString();
  return `#/${pagina}${consulta ? `?${consulta}` : ''}`;
}

/** Ruta en el hash de la dirección: los filtros sobreviven a recargar y al botón atrás. */
export function useRuta() {
  const hash = useSyncExternalStore(suscribir, leerHash);

  const { pagina, params } = useMemo(() => {
    const [camino = '', consulta = ''] = hash.replace(/^#\/?/, '').split('?');
    return {
      pagina: (PAGINAS.includes(camino) ? camino : 'agregar') as Pagina,
      params: new URLSearchParams(consulta),
    };
  }, [hash]);

  /** Cambia los parámetros sin llenar el historial en cada tecla. */
  const reemplazarParams = useCallback(
    (nuevos: URLSearchParams) => {
      window.history.replaceState(null, '', direccionDe(pagina, nuevos));
      window.dispatchEvent(new Event(EVENTO_RUTA));
    },
    [pagina],
  );

  return { pagina, params, reemplazarParams };
}
