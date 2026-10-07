import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { ApiResponse } from '../models/api-response.model';
import {
  AuditoriaDetalle,
  AuditoriaFiltros,
  AuditoriaListItem,
  CatalogoAuditoria
} from '../models/auditoria.model';
import { environment } from '../../../environments/environment';

const AUDITORIA_URL = `${environment.apiUrl}/api/v1/admin/auditoria`;

/**
 * Bitácora de auditoría. **Solo lectura**: el back no expone POST, PUT ni DELETE
 * sobre este recurso (la bitácora se escribe desde los servicios de dominio y es
 * inmutable), así que este servicio tampoco tiene nada para escribir.
 */
@Injectable({ providedIn: 'root' })
export class AuditoriaService {
  private readonly http = inject(HttpClient);

  /** Listado paginado. La paginación viaja en `meta`; los ítems en `data`. */
  listar(filtros: AuditoriaFiltros): Observable<ApiResponse<AuditoriaListItem[]>> {
    let params = new HttpParams();
    for (const [clave, valor] of Object.entries(filtros)) {
      if (valor !== undefined && valor !== null && valor !== '') {
        params = params.set(clave, String(valor));
      }
    }
    return this.http.get<ApiResponse<AuditoriaListItem[]>>(AUDITORIA_URL, { params });
  }

  /** Catálogo de acciones/entidades/actores para armar los filtros. */
  catalogo(): Observable<ApiResponse<CatalogoAuditoria>> {
    return this.http.get<ApiResponse<CatalogoAuditoria>>(`${AUDITORIA_URL}/acciones`);
  }

  detalle(id: number): Observable<ApiResponse<AuditoriaDetalle>> {
    return this.http.get<ApiResponse<AuditoriaDetalle>>(`${AUDITORIA_URL}/${id}`);
  }
}
