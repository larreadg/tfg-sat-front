/**
 * Modelos del panel admin de reportes. Reflejan los DTOs reales del backend
 * (`modules/reportes-admin/reportes-admin.types.ts`). Las fechas viajan como
 * string ISO en el JSON (aunque el back las tipa como `Date`).
 */

export type Canal = 'WEB' | 'WHATSAPP' | 'TELEGRAM';

export type EstadoEvaluacionIa = 'PENDIENTE' | 'PROCESANDO' | 'COMPLETADO' | 'ERROR';

/** Nivel de criticidad del reporte (0–3). `null` mientras no se calculó. */
export type NivelCriticidad = 0 | 1 | 2 | 3;

/**
 * Ubicación legible del reporte, resuelta por geocodificación inversa en el
 * back. Cada campo puede ser `null`: el proveedor no siempre tiene mapeado el
 * barrio o la calle. Las coordenadas siguen siendo la fuente de verdad.
 */
export interface ReporteUbicacion {
  pais: string | null;
  departamento: string | null;
  distrito: string | null;
  barrio: string | null;
  calle: string | null;
  direccion: string | null;
}

/** Foto del reporte tal como viaja en el listado (solo lo necesario para el preview). */
export interface ReporteFotoPreview {
  id: number;
  url: string;
}

export interface ReporteListItem {
  id: number;
  codigoPublico: string;
  canal: Canal;
  fecha: string;
  latitud: number;
  longitud: number;
  /** `null` mientras la geocodificación no corrió o no resolvió nada. */
  ubicacion: ReporteUbicacion | null;
  nivelPreliminar: number | null;
  criticidad: number | null;
  estadoAnalisis: EstadoEvaluacionIa;
  riesgoScore: number | null;
  tieneFotos: boolean;
  fotos: ReporteFotoPreview[];
  /** Solo presente si el solicitante tiene `usuario_ciudadano.ver` (ADMIN). */
  telefono?: string;
}

export interface ReporteRespuesta {
  preguntaId: number;
  pregunta: string;
  tipo: string;
  opciones: string[];
}

export interface ReporteFoto {
  id: number;
  url: string;
  orden: number;
  descripcionIa: string | null;
  riesgoFoto: number | null;
}

export interface ReporteEvaluacion {
  estado: EstadoEvaluacionIa;
  riesgoScore: number | null;
  resumen: string | null;
  justificacion: string | null;
  recomendacion: string | null;
  modelo: string | null;
  promptVersion: number;
  intentos: number;
  errorMensaje: string | null;
}

export interface ReporteDesglose {
  f1: number | null;
  f2: number | null;
  f3: number | null;
  f4: number | null;
  f5: number | null;
  bonusVulnerabilidad: number;
  configId: number;
}

export interface ReporteDetalle {
  id: number;
  codigoPublico: string;
  canal: Canal;
  fecha: string;
  latitud: number;
  longitud: number;
  /** `null` mientras la geocodificación no corrió o no resolvió nada. */
  ubicacion: ReporteUbicacion | null;
  descripcion: string | null;
  nivelPreliminar: number | null;
  criticidad: number | null;
  /** Solo presente si el solicitante tiene `usuario_ciudadano.ver` (ADMIN). */
  telefono?: string;
  respuestas: ReporteRespuesta[];
  fotos: ReporteFoto[];
  evaluacion: ReporteEvaluacion | null;
  desglose: ReporteDesglose | null;
}

/** Filtros del listado admin. Todo opcional; se envían como query params. */
export interface ReportesFiltros {
  page?: number;
  pageSize?: number;
  desde?: string;
  hasta?: string;
  canal?: Canal;
  estado?: EstadoEvaluacionIa;
  nivel?: number;
  /** Coincidencia parcial; el back lo ignora sin `usuario_ciudadano.ver`. */
  telefono?: string;
  bbox?: string;
}
