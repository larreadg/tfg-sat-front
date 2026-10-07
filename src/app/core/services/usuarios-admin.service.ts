import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { ApiResponse } from '../models/api-response.model';
import {
  ActualizarUsuarioInput,
  CrearUsuarioInput,
  ListarUsuariosQuery,
  UsuarioAdminItem
} from '../models/usuario-admin.model';
import { environment } from '../../../environments/environment';

const USUARIOS_URL = `${environment.apiUrl}/api/v1/usuarios`;

@Injectable({ providedIn: 'root' })
export class UsuariosAdminService {
  private readonly http = inject(HttpClient);

  /** Listado paginado: los ítems en `data`, la paginación en `meta`. */
  listar(query: ListarUsuariosQuery = {}): Observable<ApiResponse<UsuarioAdminItem[]>> {
    let params = new HttpParams();
    for (const [clave, valor] of Object.entries(query)) {
      if (valor !== undefined && valor !== null && valor !== '') {
        params = params.set(clave, String(valor));
      }
    }
    return this.http.get<ApiResponse<UsuarioAdminItem[]>>(USUARIOS_URL, { params });
  }

  obtener(id: number): Observable<ApiResponse<UsuarioAdminItem>> {
    return this.http.get<ApiResponse<UsuarioAdminItem>>(`${USUARIOS_URL}/${id}`);
  }

  crear(input: CrearUsuarioInput): Observable<ApiResponse<UsuarioAdminItem>> {
    return this.http.post<ApiResponse<UsuarioAdminItem>>(USUARIOS_URL, input);
  }

  actualizar(id: number, input: ActualizarUsuarioInput): Observable<ApiResponse<UsuarioAdminItem>> {
    return this.http.put<ApiResponse<UsuarioAdminItem>>(`${USUARIOS_URL}/${id}`, input);
  }

  /** Responde 204 sin cuerpo. */
  eliminar(id: number): Observable<void> {
    return this.http.delete<void>(`${USUARIOS_URL}/${id}`);
  }
}
