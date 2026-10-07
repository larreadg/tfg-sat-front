import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { ApiResponse } from '../models/api-response.model';
import { ReporteDetalle, ReporteListItem, ReportesFiltros } from '../models/reporte.model';
import { environment } from '../../../environments/environment';

const REPORTES_ADMIN_URL = `${environment.apiUrl}/api/v1/admin/reportes`;

@Injectable({ providedIn: 'root' })
export class ReportesAdminService {
  private readonly http = inject(HttpClient);

  /** Listado paginado. La paginación viaja en `meta`; los ítems en `data`. */
  listar(filtros: ReportesFiltros): Observable<ApiResponse<ReporteListItem[]>> {
    let params = new HttpParams();
    for (const [clave, valor] of Object.entries(filtros)) {
      if (valor !== undefined && valor !== null && valor !== '') {
        params = params.set(clave, String(valor));
      }
    }
    return this.http.get<ApiResponse<ReporteListItem[]>>(REPORTES_ADMIN_URL, { params });
  }

  detalle(id: number): Observable<ApiResponse<ReporteDetalle>> {
    return this.http.get<ApiResponse<ReporteDetalle>>(`${REPORTES_ADMIN_URL}/${id}`);
  }
}
