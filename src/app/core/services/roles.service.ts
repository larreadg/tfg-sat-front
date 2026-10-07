import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { ApiResponse } from '../models/api-response.model';
import { ActualizarRolInput, CrearRolInput, PermisoItem, RolItem } from '../models/rol.model';
import { environment } from '../../../environments/environment';

const ROLES_URL = `${environment.apiUrl}/api/v1/admin/roles`;
const PERMISOS_URL = `${environment.apiUrl}/api/v1/admin/permisos`;

@Injectable({ providedIn: 'root' })
export class RolesService {
  private readonly http = inject(HttpClient);

  /** Sin paginar: el catálogo de roles es chico y la pantalla los muestra todos. */
  listarRoles(): Observable<ApiResponse<RolItem[]>> {
    return this.http.get<ApiResponse<RolItem[]>>(ROLES_URL);
  }

  obtenerRol(id: number): Observable<ApiResponse<RolItem>> {
    return this.http.get<ApiResponse<RolItem>>(`${ROLES_URL}/${id}`);
  }

  crear(input: CrearRolInput): Observable<ApiResponse<RolItem>> {
    return this.http.post<ApiResponse<RolItem>>(ROLES_URL, input);
  }

  actualizar(id: number, input: ActualizarRolInput): Observable<ApiResponse<RolItem>> {
    return this.http.put<ApiResponse<RolItem>>(`${ROLES_URL}/${id}`, input);
  }

  eliminar(id: number): Observable<ApiResponse<null>> {
    return this.http.delete<ApiResponse<null>>(`${ROLES_URL}/${id}`);
  }

  /**
   * Catálogo completo de permisos, con nombre `recurso.accion`. La matriz del
   * formulario de roles los agrupa por recurso.
   */
  listarPermisos(): Observable<ApiResponse<PermisoItem[]>> {
    return this.http.get<ApiResponse<PermisoItem[]>>(PERMISOS_URL);
  }
}
