import { ActorAuditoria, OperacionAuditoria } from '../../core/models/auditoria.model';
import { SeveridadTag } from './reporte-etiquetas';

/**
 * Etiquetas de la bitácora de auditoría. Lo que es CATÁLOGO (la lista de acciones
 * y su texto legible) lo sirve el back y no se duplica acá: estos mapas cubren
 * solo los dos enums cerrados, que no cambian sin una migración.
 */

const OPERACION_LABEL: Record<OperacionAuditoria, string> = {
  CREAR: 'Creación',
  ACTUALIZAR: 'Modificación',
  ELIMINAR: 'Eliminación',
  ACCESO: 'Acceso'
};

/**
 * Color por tipo de operación. `ELIMINAR` en rojo y `ACCESO` en gris no es
 * decoración: en una tabla de cientos de filas es lo que deja ver de un pantallazo
 * dónde se borró algo.
 */
const OPERACION_SEVERIDAD: Record<OperacionAuditoria, SeveridadTag> = {
  CREAR: 'success',
  ACTUALIZAR: 'info',
  ELIMINAR: 'danger',
  ACCESO: 'secondary'
};

const OPERACION_ICONO: Record<OperacionAuditoria, string> = {
  CREAR: 'pi pi-plus-circle',
  ACTUALIZAR: 'pi pi-pencil',
  ELIMINAR: 'pi pi-trash',
  ACCESO: 'pi pi-sign-in'
};

export function operacionLabel(operacion: OperacionAuditoria): string {
  return OPERACION_LABEL[operacion] ?? operacion;
}

export function operacionSeveridad(operacion: OperacionAuditoria): SeveridadTag {
  return OPERACION_SEVERIDAD[operacion] ?? 'secondary';
}

export function operacionIcono(operacion: OperacionAuditoria): string {
  return OPERACION_ICONO[operacion] ?? 'pi pi-circle';
}

const ACTOR_LABEL: Record<ActorAuditoria, string> = {
  USUARIO: 'Usuario del panel',
  CIUDADANO: 'Ciudadano',
  SISTEMA: 'Proceso automático',
  ANONIMO: 'Sin identificar'
};

const ACTOR_ICONO: Record<ActorAuditoria, string> = {
  USUARIO: 'pi pi-user',
  CIUDADANO: 'pi pi-mobile',
  SISTEMA: 'pi pi-cog',
  ANONIMO: 'pi pi-question-circle'
};

export function actorLabel(actorTipo: ActorAuditoria): string {
  return ACTOR_LABEL[actorTipo] ?? actorTipo;
}

export function actorIcono(actorTipo: ActorAuditoria): string {
  return ACTOR_ICONO[actorTipo] ?? 'pi pi-user';
}

/**
 * Formatea el JSON de una entrada para mostrarlo. Se indenta con 2 espacios y se
 * devuelve `null` cuando no hay nada, para que la vista pueda omitir la sección
 * en vez de mostrar un "null" pelado.
 */
export function jsonLegible(valor: unknown): string | null {
  if (valor === null || valor === undefined) {
    return null;
  }
  try {
    return JSON.stringify(valor, null, 2);
  } catch {
    return String(valor);
  }
}
