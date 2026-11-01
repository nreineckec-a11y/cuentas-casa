import type { ReactNode } from 'react';

interface Props {
  etiqueta: string;
  valor: string;
  color?: string;
  detalle?: ReactNode;
}

/** Un dato destacado. El detalle queda siempre visible: en el celular no hay tooltips. */
export function Cifra({ etiqueta, valor, color = '', detalle }: Props) {
  return (
    <div className="rounded-lg border border-borde-suave bg-superficie p-3">
      <dt className="text-texto-suave">{etiqueta}</dt>
      <dd className={`text-2xl font-bold break-words ${color}`}>{valor}</dd>
      {detalle && <dd className="mt-1 text-texto-suave">{detalle}</dd>}
    </div>
  );
}
