import { Canal, EstadoEvaluacionIa } from './reporte.model';
import { SeguimientoResumen } from './alerta-seguimiento.model';

/**
 * Modelos del panel admin de alertas. Reflejan los DTOs reales del backend
 * (`modules/alertas/alertas.types.ts`). Las fechas viajan como string ISO en el
 * JSON (aunque el back las tipa como `Date`).
 */

/** Estados de una alerta (enum `EstadoAlerta` del back). */
export type EstadoAlerta = 'NUEVA' | 'EN_REVISION' | 'DERIVADA' | 'CERRADA' | 'DESCARTADA';

/** Origen de la alerta cuando nace de un reporte individual. */
export interface AlertaReporte {
  id: number;
  codigoPublico: string;
  latitud: number;
  longitud: number;
}

/** Origen de la alerta cuando nace de un punto crítico (clúster). */
export interface AlertaPuntoCritico {
  id: number;
  latitudCentro: number;
  longitudCentro: number;
  cantidadReportes: number;
}

export interface AlertaListItem {
  id: number;
  nivel: number;
  estado: EstadoAlerta;
  motivo: string;
  fechaCreacion: string;
  fechaActualizacion: string;
  /** Una alerta cuelga de un reporte XOR de un punto crítico. */
  reporte: AlertaReporte | null;
  puntoCritico: AlertaPuntoCritico | null;
}

/** Origen de la alerta: un reporte individual XOR un punto crítico. */
export type OrigenAlerta = 'REPORTE' | 'PUNTO_CRITICO';

/**
 * Reporte que compone una alerta. `orden` es el número de llegada dentro del
 * grupo (1..N por fecha ascendente) y lo asigna el backend.
 */
export interface AlertaReporteDetalle {
  orden: number;
  id: number;
  codigoPublico: string;
  canal: Canal;
  fecha: string;
  latitud: number;
  longitud: number;
  nivelPreliminar: number | null;
  criticidad: number | null;
  estadoAnalisis: EstadoEvaluacionIa;
  riesgoScore: number | null;
  resumenIa: string | null;
  tieneFotos: boolean;
  distanciaMetros: number;
  esOrigen: boolean;
}

export interface AlertaPuntoCriticoDetalle {
  id: number;
  latitudCentro: number;
  longitudCentro: number;
  radioMetros: number;
  cantidadReportes: number;
  nivel: number;
  estado: string;
  ventanaInicio: string;
  ventanaFin: string;
}

/** Detalle de una alerta con el grupo de reportes que la sustenta. */
export interface AlertaDetalle {
  id: number;
  nivel: number;
  estado: EstadoAlerta;
  motivo: string;
  fechaCreacion: string;
  fechaActualizacion: string;
  /** Contadores de las pestañas de seguimiento del modal. */
  seguimiento: SeguimientoResumen;
  origen: OrigenAlerta | null;
  centro: { latitud: number; longitud: number } | null;
  radioMetros: number;
  ventanaInicio: string | null;
  ventanaFin: string | null;
  reporte: AlertaReporte | null;
  puntoCritico: AlertaPuntoCriticoDetalle | null;
  reportes: AlertaReporteDetalle[];
}

/** Filtros del listado admin. Todo opcional; se envían como query params. */
export interface AlertasFiltros {
  page?: number;
  pageSize?: number;
  /** Atajo del panel: solo las abiertas (Nueva + En revisión). */
  activas?: boolean;
  desde?: string;
  hasta?: string;
  estado?: EstadoAlerta;
  nivel?: number;
}

/** Cuerpo del PATCH de cambio de estado. `observacion` es opcional en el back. */
export interface CambiarEstadoAlerta {
  estadoNuevo: EstadoAlerta;
  observacion?: string;
}

/**
 * Máquina de estados de la alerta (espejo de `alertas.estado.ts` del back).
 * Solo se usa para UX (ofrecer transiciones válidas); la barrera real la valida
 * el backend, que rechaza transiciones inválidas con 409.
 *
 *   NUEVA → EN_REVISION
 *   EN_REVISION → DERIVADA | CERRADA | DESCARTADA
 *   DERIVADA → CERRADA
 *   CERRADA / DESCARTADA → (terminales)
 */
export const TRANSICIONES_ALERTA: Record<EstadoAlerta, EstadoAlerta[]> = {
  NUEVA: ['EN_REVISION'],
  EN_REVISION: ['DERIVADA', 'CERRADA', 'DESCARTADA'],
  DERIVADA: ['CERRADA'],
  CERRADA: [],
  DESCARTADA: []
};

/**
 * Orden del tablero Kanban: de la alerta recién nacida (izquierda) a la
 * resuelta (derecha). Es el mismo orden en que avanza la máquina de estados,
 * así que el movimiento natural de una tarjeta es hacia la derecha.
 */
export const ESTADOS_ALERTA: EstadoAlerta[] = [
  'NUEVA',
  'EN_REVISION',
  'DERIVADA',
  'CERRADA',
  'DESCARTADA'
];

/** Transiciones válidas desde el estado actual (vacío = estado terminal). */
export function transicionesDesde(estado: EstadoAlerta): EstadoAlerta[] {
  return TRANSICIONES_ALERTA[estado] ?? [];
}

/** `true` si la alerta ya no admite cambios de estado. */
export function esEstadoTerminal(estado: EstadoAlerta): boolean {
  return transicionesDesde(estado).length === 0;
}
