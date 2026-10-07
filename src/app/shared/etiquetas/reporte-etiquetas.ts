import { Canal, EstadoEvaluacionIa, ReporteUbicacion } from '../../core/models/reporte.model';
import { environment } from '../../../environments/environment';

/** Severidades válidas de `p-tag` en PrimeNG 21. */
export type SeveridadTag = 'success' | 'info' | 'warn' | 'danger' | 'secondary' | 'contrast';

/**
 * Etiquetas de NIVEL de criticidad (0–3). Describen la PRIORIDAD del reporte,
 * nunca el estado del agua (RNF-14: ningún texto afirma potabilidad/seguridad).
 */
export const NIVEL_LABEL: Record<number, string> = {
  0: 'Informativo',
  1: 'Bajo',
  2: 'Medio',
  3: 'Alto'
};

const NIVEL_SEVERIDAD: Record<number, SeveridadTag> = {
  0: 'secondary',
  1: 'info',
  2: 'warn',
  3: 'danger'
};

export function nivelLabel(nivel: number | null | undefined): string {
  return nivel == null ? 'Sin calcular' : (NIVEL_LABEL[nivel] ?? `Nivel ${nivel}`);
}

export function nivelSeveridad(nivel: number | null | undefined): SeveridadTag {
  return nivel == null ? 'secondary' : (NIVEL_SEVERIDAD[nivel] ?? 'secondary');
}

/** Estado del análisis de IA (no del agua). */
export const ESTADO_IA_LABEL: Record<EstadoEvaluacionIa, string> = {
  PENDIENTE: 'Pendiente',
  PROCESANDO: 'Procesando',
  COMPLETADO: 'Analizado',
  ERROR: 'Error'
};

const ESTADO_IA_SEVERIDAD: Record<EstadoEvaluacionIa, SeveridadTag> = {
  PENDIENTE: 'secondary',
  PROCESANDO: 'info',
  COMPLETADO: 'success',
  ERROR: 'danger'
};

export function estadoIaLabel(estado: EstadoEvaluacionIa): string {
  return ESTADO_IA_LABEL[estado] ?? estado;
}

export function estadoIaSeveridad(estado: EstadoEvaluacionIa): SeveridadTag {
  return ESTADO_IA_SEVERIDAD[estado] ?? 'secondary';
}

/** Canal de ingreso del reporte. */
export const CANAL_LABEL: Record<Canal, string> = {
  WEB: 'Web',
  WHATSAPP: 'WhatsApp',
  TELEGRAM: 'Telegram'
};

export const CANAL_ICONO: Record<Canal, string> = {
  WEB: 'pi pi-globe',
  WHATSAPP: 'pi pi-whatsapp',
  TELEGRAM: 'pi pi-telegram'
};

export function canalLabel(canal: Canal): string {
  return CANAL_LABEL[canal] ?? canal;
}

export function canalIcono(canal: Canal): string {
  return CANAL_ICONO[canal] ?? 'pi pi-question-circle';
}

/**
 * Resuelve la URL pública de una foto del reporte. El back devuelve rutas
 * relativas al montaje estático de `/uploads`; si ya viene absoluta se respeta.
 */
export function urlFoto(url: string): string {
  if (/^https?:\/\//.test(url)) {
    return url;
  }
  return `${environment.apiUrl}${url.startsWith('/') ? '' : '/'}${url}`;
}

/**
 * Resumen de una línea de la ubicación legible, de lo más específico a lo más
 * general (calle, barrio, ciudad, departamento). Se arma con lo que haya: el
 * geocodificador no siempre resuelve todos los niveles. Devuelve `null` si no
 * quedó ningún componente, para que la vista muestre solo las coordenadas.
 */
export function ubicacionResumen(ubicacion: ReporteUbicacion | null | undefined): string | null {
  if (!ubicacion) {
    return null;
  }
  const partes = [ubicacion.calle, ubicacion.barrio, ubicacion.distrito, ubicacion.departamento].filter(
    (parte): parte is string => !!parte
  );
  return partes.length > 0 ? partes.join(', ') : null;
}
