import type { ReactNode } from 'react';

function Icono({ children }: { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="24"
      height="24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

export const IconoAgregar = () => (
  <Icono>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 8v8M8 12h8" />
  </Icono>
);

export const IconoLista = () => (
  <Icono>
    <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />
  </Icono>
);

export const IconoRevisar = () => (
  <Icono>
    <circle cx="12" cy="12" r="9" />
    <path d="m8.5 12 2.5 2.5 4.5-5" />
  </Icono>
);

export const IconoMes = () => (
  <Icono>
    <rect x="3" y="5" width="18" height="16" rx="2" />
    <path d="M3 10h18M8 3v4M16 3v4" />
  </Icono>
);

export const IconoAnio = () => (
  <Icono>
    <path d="M4 20V10M10 20V4M16 20v-7M21 20H3" />
  </Icono>
);

export const IconoCategorias = () => (
  <Icono>
    <path d="M3 12V4h8l10 10-8 8z" />
    <path d="M7.5 8.5h.01" />
  </Icono>
);

export const IconoDatos = () => (
  <Icono>
    <ellipse cx="12" cy="5" rx="8" ry="3" />
    <path d="M4 5v14c0 1.7 3.6 3 8 3s8-1.300 8-3V5M4 12c0 1.700 3.600 3 8 3s8-1.300 8-3" />
  </Icono>
);

export const IconoMas = () => (
  <Icono>
    <circle cx="5" cy="12" r="1.500" />
    <circle cx="12" cy="12" r="1.500" />
    <circle cx="19" cy="12" r="1.500" />
  </Icono>
);

export const IconoSol = () => (
  <Icono>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
  </Icono>
);

export const IconoLuna = () => (
  <Icono>
    <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
  </Icono>
);

export const IconoCerrar = () => (
  <Icono>
    <path d="M6 6l12 12M18 6 6 18" />
  </Icono>
);

export const IconoFiltro = () => (
  <Icono>
    <path d="M3 5h18l-7 8v6l-4-2v-4z" />
  </Icono>
);
