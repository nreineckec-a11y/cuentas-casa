/** Formatos de Chile: moneda $1.234.567, fechas dd-mm-aaaa. */

const NOMBRES_MES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
] as const;

function conPuntos(entero: number): string {
  return String(entero).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

export function formatearMoneda(monto: number): string {
  const redondeado = Math.round(monto);
  return `${redondeado < 0 ? '-' : ''}$${conPuntos(Math.abs(redondeado))}`;
}

/** Para ejes de gráficos: $3,5 M, $500 mil. */
export function formatearMonedaCompacta(monto: number): string {
  const absoluto = Math.abs(monto);
  const signo = monto < 0 ? '-' : '';
  if (absoluto >= 1_000_000) {
    const millones = Math.round(absoluto / 10_000) / 100;
    return `${signo}$${String(millones).replace('.', ',')} M`;
  }
  if (absoluto >= 1_000) return `${signo}$${Math.round(absoluto / 1_000)} mil`;
  return formatearMoneda(monto);
}

/** Fracción a porcentaje con coma decimal: 0,123 pasa a "12,3 %". */
export function formatearPorcentaje(fraccion: number): string {
  return `${String(Math.round(fraccion * 1000) / 10).replace('.', ',')} %`;
}

/** Convierte lo escrito en el campo de monto a un entero; null si no hay dígitos. */
export function parsearMonto(texto: string): number | null {
  const digitos = texto.replace(/\D/g, '');
  return digitos === '' ? null : Number(digitos);
}

/** Da formato mientras se escribe: "1234" pasa a "$1.234". */
export function formatearMontoAlEscribir(texto: string): string {
  const monto = parsearMonto(texto);
  if (monto === null) return '';
  return Number.isSafeInteger(monto) ? formatearMoneda(monto) : texto;
}

export function formatearFecha(fecha: string): string {
  const [anio, mes, dia] = fecha.split('-');
  return `${dia}-${mes}-${anio}`;
}

export function formatearFechaCorta(fecha: string): string {
  const [, mes, dia] = fecha.split('-');
  return `${dia}-${mes}`;
}

/** La fecha de hoy según el reloj local, no UTC: de noche en Chile, UTC ya es mañana. */
export function fechaDeHoy(ahora: Date = new Date()): string {
  const mes = String(ahora.getMonth() + 1).padStart(2, '0');
  const dia = String(ahora.getDate()).padStart(2, '0');
  return `${ahora.getFullYear()}-${mes}-${dia}`;
}

export function sumarDias(fecha: string, dias: number): string {
  return new Date(Date.parse(`${fecha}T00:00:00Z`) + dias * 86_400_000).toISOString().slice(0, 10);
}

export function diasEntreFechas(a: string, b: string): number {
  return Math.round(Math.abs(Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86_400_000);
}

/** "2026-10" pasa a "octubre 2026". */
export function nombreDelMes(mes: string): string {
  const numero = Number(mes.slice(5, 7));
  return `${NOMBRES_MES[numero - 1] ?? mes} ${mes.slice(0, 4)}`;
}

/** "2026-10" pasa a "Octubre 2026". */
export function nombreDelMesConMayuscula(mes: string): string {
  const nombre = nombreDelMes(mes);
  return nombre.charAt(0).toLocaleUpperCase('es') + nombre.slice(1);
}

/** "2026-10" pasa a "Oct". */
export function mesCorto(mes: string): string {
  const nombre = NOMBRES_MES[Number(mes.slice(5, 7)) - 1] ?? mes;
  return nombre.charAt(0).toLocaleUpperCase('es') + nombre.slice(1, 3);
}

/** Para comparar nombres de categorías y cuentas: sin mayúsculas ni espacios de más, pero con tildes. */
export function normalizarNombre(nombre: string): string {
  return nombre.normalize('NFC').trim().toLocaleLowerCase('es');
}

/** Para buscar sin distinguir mayúsculas ni tildes. */
export function normalizarTexto(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLocaleLowerCase('es')
    .replace(/\s+/g, ' ')
    .trim();
}
