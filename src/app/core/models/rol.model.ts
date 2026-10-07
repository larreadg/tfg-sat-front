/**
 * Modelos de roles y permisos. Espejo de `modules/roles/roles.service.ts` del
 * backend.
 *
 * Reglas que impone el backend y el panel refleja: el rol `ADMIN` no se renombra
 * ni se elimina, y un rol con usuarios asignados no se puede eliminar.
 */

export interface PermisoItem {
  id: number;
  nombre: string;
  descripcion: string | null;
}

export interface RolItem {
  id: number;
  nombre: string;
  descripcion: string | null;
  cantidadUsuarios: number;
  permisos: { id: number; nombre: string }[];
}

export interface CrearRolInput {
  nombre: string;
  descripcion?: string;
  permisoIds: number[];
}

/** `permisoIds` reemplaza el set completo; omitirlo deja los permisos intactos. */
export interface ActualizarRolInput {
  nombre?: string;
  descripcion?: string | null;
  permisoIds?: number[];
}

/** Nombre del rol que el backend protege contra renombrado y borrado. */
export const ROL_ADMIN = 'ADMIN';
