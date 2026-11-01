import type ExcelJS from 'exceljs';

/** ExcelJS es lo más pesado de la app: solo se descarga al importar o exportar. */
export async function nuevoLibro(): Promise<ExcelJS.Workbook> {
  const modulo = (await import('exceljs/dist/exceljs.min.js')) as unknown as {
    default?: { Workbook: typeof ExcelJS.Workbook };
    Workbook?: typeof ExcelJS.Workbook;
  };
  const Libro = modulo.default?.Workbook ?? modulo.Workbook;
  if (!Libro) throw new Error('No se pudo cargar el lector de Excel.');
  return new Libro();
}

const esTactil = () => typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0;

/**
 * Entrega un archivo a la persona. En el celular abre el menú de compartir, que
 * permite guardarlo en Archivos o Drive; en el computador lo descarga.
 */
export async function entregarArchivo(contenido: BlobPart, nombre: string, tipo: string): Promise<void> {
  const blob = new Blob([contenido], { type: tipo });
  const archivo = new File([blob], nombre, { type: tipo });
  if (esTactil() && navigator.canShare?.({ files: [archivo] })) {
    try {
      await navigator.share({ files: [archivo] });
      return;
    } catch (error) {
      // Cerrar el menú no es un error, pero tampoco una entrega.
      if ((error as Error).name === 'AbortError') throw new EntregaCancelada();
    }
  }
  const direccion = URL.createObjectURL(blob);
  const enlace = document.createElement('a');
  enlace.href = direccion;
  enlace.download = nombre;
  document.body.append(enlace);
  enlace.click();
  enlace.remove();
  setTimeout(() => URL.revokeObjectURL(direccion), 60_000);
}

export class EntregaCancelada extends Error {}
