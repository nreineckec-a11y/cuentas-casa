import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

interface AvisoFlotante {
  texto: string;
  tipo?: 'normal' | 'error';
  accion?: { etiqueta: string; alHacer: () => void | Promise<void> };
}

interface ContextoAvisos {
  mostrarAviso: (aviso: AvisoFlotante) => void;
}

const Contexto = createContext<ContextoAvisos | null>(null);

const DURACION_MS = 6000;
const DURACION_CON_ACCION_MS = 10000;

export function ProveedorAvisos({ children }: { children: ReactNode }) {
  const [aviso, setAviso] = useState<AvisoFlotante | null>(null);
  const temporizador = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const mostrarAviso = useCallback((nuevo: AvisoFlotante) => {
    clearTimeout(temporizador.current);
    setAviso(nuevo);
    temporizador.current = setTimeout(() => setAviso(null), nuevo.accion ? DURACION_CON_ACCION_MS : DURACION_MS);
  }, []);

  useEffect(() => () => clearTimeout(temporizador.current), []);

  const valor = useMemo(() => ({ mostrarAviso }), [mostrarAviso]);

  return (
    <Contexto.Provider value={valor}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-[calc(5rem+env(safe-area-inset-bottom))] z-50 flex justify-center px-4 md:bottom-6"
      >
        {aviso && (
          <div
            className={`pointer-events-auto flex w-full max-w-xl items-center gap-3 rounded-lg px-4 py-2 shadow-lg ${
              aviso.tipo === 'error' ? 'bg-error text-white dark:text-black' : 'bg-texto text-fondo'
            }`}
          >
            <p className="min-w-0 flex-1 py-1">{aviso.texto}</p>
            {aviso.accion && (
              <button
                type="button"
                className="min-h-12 shrink-0 cursor-pointer rounded-md px-3 font-bold underline underline-offset-4"
                onClick={() => {
                  const accion = aviso.accion;
                  clearTimeout(temporizador.current);
                  setAviso(null);
                  void accion?.alHacer();
                }}
              >
                {aviso.accion.etiqueta}
              </button>
            )}
          </div>
        )}
      </div>
    </Contexto.Provider>
  );
}

export function useAvisos(): ContextoAvisos {
  const contexto = useContext(Contexto);
  if (!contexto) throw new Error('useAvisos fuera de ProveedorAvisos');
  return contexto;
}
