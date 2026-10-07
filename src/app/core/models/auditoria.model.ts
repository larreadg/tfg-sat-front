/**
 * Modelos de la bitácora de auditoría. Reflejan los DTOs del backend
 * (`modules/auditoria/auditoria.types.ts`). Las fechas viajan como string ISO.
 *
 * Ni las acciones ni las entidades se listan acá: el catálogo lo sirve
 * `GET /admin/auditoria/acciones` y la pantalla arma los filtros con eso, igual
 * que la pantalla de Notificaciones con el catálogo de eventos. Agregar una
 * acción auditable en el back la vuelve filtrable sin tocar el front.
 */

export type OperacionAuditoria = 'CREAR' | 'ACTUALIZAR' | 'ELIMINAR' | 'ACCESO';

/**
 * Quién hizo la acción. `SISTEMA` son los procesos automáticos (análisis de IA,
 * cálculo de criticidad); `ANONIMO` es un intento rechazado antes de poder
 * identificar a nadie (un login contra un correo que no existe).
 */
export type ActorAuditoria = 'USUARIO' | 'CIUDADANO' | 'SISTEMA' | 'ANONIMO';

export interface AuditoriaListItem {
  id: number;
  fecha: string;
  /** `<recurso>.<accion>`, p. ej. `alerta.estado_cambiar`. */
  accion: string;
  /** Texto legible de la acción, ya resuelto por el back. */
  accionEtiqueta: string;
  operacion: OperacionAuditoria;
  entidad: string;
  entidadId: string | null;
  descripcion: string;
  /** `false` cuando la acción se intentó y falló (login rechazado, OTP inválido). */
  exito: boolean;
  actorTipo: ActorAuditoria;
  /** Nombre a mostrar del actor, ya resuelto por el back. */
  actor: string;
  usuarioId: number | null;
  usuarioCorreo: string | null;
  ip: string | null;
  /** `true` si la entrada trae datos previos/nuevos/metadatos que ver. */
  tieneDetalle: boolean;
}

export interface AuditoriaDetalle extends AuditoriaListItem {
  userAgent: string | null;
  metodoHttp: string | null;
  ruta: string | null;
  /** Correlaciona todas las entradas de una misma operación. */
  requestId: string | null;
  datosPrevios: unknown;
  datosNuevos: unknown;
  metadatos: unknown;
}

/** Una acción del catálogo, como la consume el filtro. */
export interface AccionCatalogo {
  accion: string;
  etiqueta: string;
  operacion: OperacionAuditoria;
  entidad: string;
  grupo: string;
}

/** Usuario del panel con al menos una acción registrada. */
export interface ActorCatalogo {
  usuarioId: number;
  nombre: string;
  correo: string | null;
}

export interface CatalogoAuditoria {
  acciones: AccionCatalogo[];
  grupos: string[];
  entidades: string[];
  operaciones: OperacionAuditoria[];
  actoresTipo: ActorAuditoria[];
  usuarios: ActorCatalogo[];
}

/** Filtros del listado. Todo opcional; se envían como query params. */
export interface AuditoriaFiltros {
  page?: number;
  pageSize?: number;
  desde?: string;
  hasta?: string;
  accion?: string;
  operacion?: OperacionAuditoria;
  entidad?: string;
  entidadId?: string;
  usuarioId?: number;
  actorTipo?: ActorAuditoria;
  ip?: string;
  exito?: boolean;
  /** Búsqueda libre sobre la descripción y el nombre/correo del actor. */
  q?: string;
}
