/**
 * Modelos del ABM de usuarios del panel. Espejo de `modules/users/users.types.ts`
 * del backend (`UserDTO`, con `roles` ya aplanado).
 */

export interface PersonaUsuario {
  nombres: string;
  apellidos: string;
  documento: string;
}

export interface RolResumen {
  id: number;
  nombre: string;
}

export interface UsuarioAdminItem {
  id: number;
  correoElectronico: string;
  telefono: string;
  activo: boolean;
  personaId: number;
  persona: PersonaUsuario;
  roles: RolResumen[];
  fechaCreacion: string;
  fechaActualizacion: string;
}

/** Alta: la persona se crea junto con el usuario, en la misma transacción. */
export interface CrearUsuarioInput {
  correoElectronico: string;
  telefono: string;
  contrasena: string;
  activo?: boolean;
  persona: PersonaUsuario;
  rolIds?: number[];
}

/**
 * Edición. Todo opcional. Los datos de `Persona` (nombres/apellidos/documento)
 * NO se editan por acá: el `PUT` del backend no los toca.
 * `rolIds` reemplaza el set completo de roles; omitirlo los deja como están.
 */
export interface ActualizarUsuarioInput {
  correoElectronico?: string;
  telefono?: string;
  contrasena?: string;
  activo?: boolean;
  rolIds?: number[];
}

export interface ListarUsuariosQuery {
  page?: number;
  limit?: number;
  /** Campo de orden; `-campo` para descendente (ej. `-fechaCreacion`). */
  sort?: string;
  activo?: boolean;
  /** Búsqueda libre sobre correo, nombres, apellidos y documento. */
  q?: string;
}
