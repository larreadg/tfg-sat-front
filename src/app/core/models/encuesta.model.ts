export type TipoPregunta = 'ELECCION_UNICA' | 'ELECCION_MULTIPLE' | 'FOTO';

export interface OpcionPregunta {
  id: number;
  texto: string;
  orden: number;
}

export interface Pregunta {
  id: number;
  texto: string;
  tipo: TipoPregunta;
  orden: number;
  opciones: OpcionPregunta[];
}

export interface Encuesta {
  id: number;
  /** Versión del cuestionario que se está respondiendo. */
  version: number;
  nombre: string;
  descripcion: string;
  /**
   * Fotos que exige esta versión. `fotosMin >= 1`: la foto no es opcional y el
   * backend rechaza el envío que no las traiga.
   */
  fotosMin: number;
  fotosMax: number;
  preguntas: Pregunta[];
}

export interface RespuestaEnvio {
  preguntaId: number;
  preguntaOpcionIds: number[];
}
