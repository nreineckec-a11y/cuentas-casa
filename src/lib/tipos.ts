import type { Rol, Tipo } from './calculos';

export interface Categoria {
  id: number;
  nombre: string;
  tipo: Tipo;
  presupuestoMensual: number | null;
  queIncluye: string;
  orden: number;
  activa: boolean;
  rol: Rol | null;
}

export interface Cuenta {
  id: number;
  nombre: string;
  orden: number;
  activa: boolean;
}

export interface Movimiento {
  id: number;
  fecha: string;
  descripcion: string;
  categoriaId: number;
  monto: number;
  cuentaId: number;
  nota: string;
  porRevisar: boolean;
  origen: 'importado' | 'manual';
}

export interface MesExcluido {
  anio: number;
  mes: number;
  motivo: string;
}

export interface DatosApp {
  categorias: Categoria[];
  cuentas: Cuenta[];
  movimientos: Movimiento[];
  excluidos: MesExcluido[];
  notasConciliacion: string;
}

export interface FilaOmitida {
  fila: number;
  motivos: string[];
}

export interface FilaSuperposicion {
  nombre: string;
  movimientos: number;
  monto: number;
  desde: string | null;
  hasta: string | null;
}

export interface ReporteImportacion {
  simulacion: boolean;
  filasConDatos: number;
  importadas: number;
  yaExistian: number;
  /** Ya existían, pero se borraron en la app: no se reviven. */
  borradasEnLaApp: number;
  omitidas: FilaOmitida[];
  categoriasCreadas: number;
  categoriasExistentes: number;
  categoriasInvalidas: FilaOmitida[];
  cuentasCreadas: number;
  cuentasExistentes: number;
  categoriasNoReconocidas: Record<string, number>;
  cuentasNoReconocidas: Record<string, number>;
  montosInvalidos: number;
  fechasInvalidas: number;
  movimientosIdenticos: number;
  porRevisarImportados: number;
  notasQueMencionanRevisar: number;
  notasConciliacion: 'importadas' | 'sin_cambios' | 'distintas_se_conservan_las_de_la_app' | 'no_encontradas';
  mesesExcluidosAhora: MesExcluido[];
  superposiciones: FilaSuperposicion[][];
}

export interface Respaldo {
  nombre: string;
  tipo: 'diario' | 'manual' | 'previo';
  /** Por qué se creó, si fue antes de una acción riesgosa. */
  motivo: string | null;
  fecha: string;
  hora: string | null;
  creadoEn: string;
  bytes: number;
}
