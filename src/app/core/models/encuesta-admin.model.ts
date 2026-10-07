/**
 * Modelos del panel admin de encuestas. Reflejan los DTOs reales del backend
 * (`modules/encuestas-admin`). Cada `Encuesta` es una VERSIÓN del cuestionario:
 * una vez que recibió reportes queda congelada y solo se puede clonar.
 */

export type TipoPregunta = 'ELECCION_UNICA' | 'ELECCION_MULTIPLE' | 'FOTO';

export interface PreguntaOpcionAdmin {
  id: number;
  texto: string;
  /**
   * Identidad ESTABLE de la opción, a la que se clavan las reglas del motor. Se
   * hereda al clonar la versión, así que sobrevive al versionado; el `id` no.
   */
  codigo: string | null;
  orden: number;
  activo: boolean;
}

export interface PreguntaAdmin {
  id: number;
  texto: string;
  /** Identidad estable de la pregunta (`AGUA_COLOR`). Ver `PreguntaOpcionAdmin.codigo`. */
  codigo: string | null;
  tipo: TipoPregunta;
  activo: boolean;
  orden: number;
  /**
   * `true` si la configuración activa del motor tiene una regla para el `codigo` de
   * esta pregunta. Renombrar el texto ya NO la saca del motor: la referencia es el
   * código, no el texto.
   */
  usadaEnCriticidad: boolean;
  opciones: PreguntaOpcionAdmin[];
}

export interface EncuestaVersionItem {
  id: number;
  version: number;
  origenId: number | null;
  nombre: string;
  descripcion: string | null;
  activo: boolean;
  fotosMin: number;
  fotosMax: number;
  cantidadPreguntas: number;
  cantidadReportes: number;
  /** `false` cuando la versión ya tiene reportes: es historia, no se edita. */
  editable: boolean;
  fechaCreacion: string;
}

export interface EncuestaVersionDetalle extends Omit<EncuestaVersionItem, 'cantidadPreguntas'> {
  preguntas: PreguntaAdmin[];
}

/** Alta de una pregunta dentro de una versión borrador. */
export interface PreguntaInput {
  texto: string;
  /** Si no se manda, el backend lo deriva del texto. Al clonar se hereda. */
  codigo?: string;
  tipo: TipoPregunta;
  orden?: number;
  opciones: { texto: string; codigo?: string; orden?: number }[];
}

export interface ActualizarPreguntaInput {
  texto?: string;
  /** Solo cambia si se manda explícitamente: editar el texto no toca el código. */
  codigo?: string;
  tipo?: TipoPregunta;
  activo?: boolean;
  opciones?: { texto: string; codigo?: string; orden?: number }[];
}

export interface ActualizarEncuestaInput {
  nombre?: string;
  descripcion?: string | null;
  activo?: boolean;
  fotosMin?: number;
  fotosMax?: number;
}

/**
 * Definición completa de una versión. El editor del panel trabaja sobre una
 * copia local y manda todo junto al confirmar: nada se persiste mientras se
 * edita. En `crearVersion` todo es opcional (sin `preguntas` se clona el origen);
 * en `reemplazarContenido` va completo.
 */
export interface CrearVersionInput {
  nombre?: string;
  descripcion?: string | null;
  fotosMin?: number;
  fotosMax?: number;
  preguntas?: PreguntaInput[];
}

export interface ReemplazarContenidoInput {
  nombre: string;
  descripcion?: string | null;
  fotosMin: number;
  fotosMax: number;
  preguntas: PreguntaInput[];
}
