/**
 * Modelos del seguimiento de una alerta: el hilo de comentarios, los archivos
 * y la checklist de tareas. Espejo de los DTOs del backend
 * (`modules/alertas/alertas.seguimiento.types.ts`). Las fechas viajan como
 * string ISO en el JSON.
 */

/** Autor de un comentario, responsable de una tarea, etc. */
export interface AutorSeguimiento {
  id: number;
  nombreCompleto: string;
}

/** Usuario al que se le puede asignar una tarea (id + nombre, nada más). */
export type ResponsableTarea = AutorSeguimiento;

export interface AdjuntoAlerta {
  id: number;
  /** `null` si se subió directo a la alerta; con valor si vino en un comentario. */
  comentarioId: number | null;
  nombreOriginal: string;
  tipoMime: string;
  tamanoBytes: number;
  /** Decide si se muestra una miniatura con preview o un chip de descarga. */
  esImagen: boolean;
  fechaCreacion: string;
  autor: AutorSeguimiento;
}

export interface ComentarioAlerta {
  id: number;
  /** Texto plano escrito por una persona: se interpola, nunca `innerHTML`. */
  cuerpo: string;
  fechaCreacion: string;
  autor: AutorSeguimiento;
  adjuntos: AdjuntoAlerta[];
}

export interface TareaAlerta {
  id: number;
  titulo: string;
  completada: boolean;
  orden: number;
  /** Fecha de calendario `YYYY-MM-DD`, sin hora ni huso. */
  fechaVencimiento: string | null;
  /** Lo deriva el backend: `!completada && fechaVencimiento < hoy`. */
  vencida: boolean;
  responsable: AutorSeguimiento | null;
  completadaPor: AutorSeguimiento | null;
  fechaCompletada: string | null;
  creadaPor: AutorSeguimiento;
  fechaCreacion: string;
}

/** Progreso de la checklist. `porcentaje` ya viene entero 0..100. */
export interface ResumenTareas {
  total: number;
  completadas: number;
  vencidas: number;
  porcentaje: number;
}

export interface TareasAlerta {
  items: TareaAlerta[];
  resumen: ResumenTareas;
}

/** Contadores de las pestañas del modal, dentro del detalle de la alerta. */
export interface SeguimientoResumen {
  comentarios: number;
  adjuntos: number;
  tareas: { total: number; completadas: number; vencidas: number };
}

/** Cuerpo del POST de una tarea. */
export interface CrearTarea {
  titulo: string;
  responsableId?: number | null;
  /** `YYYY-MM-DD`. */
  fechaVencimiento?: string | null;
}

/**
 * Cuerpo del PATCH de una tarea. Contrato de tres estados por campo: lo que no
 * se manda no se toca, `null` quita el valor y un valor lo reemplaza. Por eso
 * los opcionales son además nullables.
 */
export interface ActualizarTarea {
  titulo?: string;
  completada?: boolean;
  responsableId?: number | null;
  fechaVencimiento?: string | null;
  orden?: number;
}

/** Tamaño legible de un archivo, para el chip de descarga. */
export function tamanoLegible(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${Math.round(bytes / 1024)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Icono de PrimeIcons según el tipo de archivo, para los que no son imagen. */
export function iconoAdjunto(tipoMime: string): string {
  if (tipoMime === 'application/pdf') {
    return 'pi pi-file-pdf';
  }
  if (tipoMime.includes('wordprocessingml')) {
    return 'pi pi-file-word';
  }
  if (tipoMime.includes('spreadsheetml')) {
    return 'pi pi-file-excel';
  }
  return 'pi pi-file';
}
