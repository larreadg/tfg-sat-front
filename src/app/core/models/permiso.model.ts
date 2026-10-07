/**
 * Acciones del catálogo. Las cuatro primeras son el CRUD que el seed genera para
 * cada recurso; `'seguimiento'` es la primera acción fuera de ese molde
 * (`alerta.seguimiento`: comentar, adjuntar y gestionar tareas de una alerta).
 */
export type AccionPermiso = 'ver' | 'crear' | 'editar' | 'eliminar' | 'seguimiento';

/**
 * Recursos del catálogo de permisos ya confirmados por el backend ("recurso.accion").
 * Ampliar este objeto a medida que se definan nuevos módulos (reportes, encuestas, análisis...);
 * no requiere tocar el guard ni el directive, que trabajan con el string final.
 */
export const RECURSO = {
  PERSONA: 'persona',
  USUARIO: 'usuario',
  ROL: 'rol',
  PERMISO: 'permiso',
  ROL_PERMISO: 'rol_permiso',
  REPORTE: 'reporte',
  EVALUACION_IA: 'evaluacion_ia',
  /** PII del ciudadano (teléfono). Lo tiene ADMIN; ORGANISMO no. */
  USUARIO_CIUDADANO: 'usuario_ciudadano',
  ALERTA: 'alerta',
  PUNTO_CRITICO: 'punto_critico',
  /** Zonas del mapa de riesgo (fuente de F5). Separado del motor de criticidad. */
  ZONA_RIESGO: 'zona_riesgo',
  CONFIGURACION_CRITICIDAD: 'configuracion_criticidad',
  /** Estado operativo y canales de salida (tab Sistema). Separado del motor de criticidad. */
  CONFIGURACION_SISTEMA: 'configuracion_sistema',
  /** Reglas de notificación (pantalla Webhooks): a quién se le avisa de qué. */
  WEBHOOK: 'webhook',
  ENCUESTA: 'encuesta',
  PREGUNTA: 'pregunta',
  /**
   * Bitácora de auditoría. Su única acción es `ver`: el registro es inmutable y
   * el back no expone ningún endpoint para crearlo, editarlo ni borrarlo.
   */
  AUDITORIA: 'auditoria'
} as const;

export type Recurso = (typeof RECURSO)[keyof typeof RECURSO];

/**
 * Compone el string "recurso.accion" que envía el backend en el JWT.
 * Acepta recursos aún no catalogados en `RECURSO` (string abierto) para no bloquear
 * el desarrollo mientras el preset completo de permisos no está definido.
 */
export function permiso(recurso: Recurso | (string & {}), accion: AccionPermiso): string {
  return `${recurso}.${accion}`;
}
