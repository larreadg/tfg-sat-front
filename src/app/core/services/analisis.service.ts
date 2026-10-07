import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { ApiResponse } from '../models/api-response.model';
import { AnalisisFiltros, AnalisisResumen } from '../models/analisis.model';
import { environment } from '../../../environments/environment';

const ANALISIS_ADMIN_URL = `${environment.apiUrl}/api/v1/admin/analisis`;

@Injectable({ providedIn: 'root' })
export class AnalisisService {
  private readonly http = inject(HttpClient);

  /**
   * Métricas agregadas del panel en una sola llamada: el backend devuelve los
   * seis bloques juntos para no coordinar seis requests por pantalla.
   */
  obtenerResumen(filtros: AnalisisFiltros = {}): Observable<ApiResponse<AnalisisResumen>> {
    let params = new HttpParams();
    for (const [clave, valor] of Object.entries(filtros)) {
      if (valor !== undefined && valor !== null && valor !== '') {
        params = params.set(clave, String(valor));
      }
    }
    return this.http.get<ApiResponse<AnalisisResumen>>(`${ANALISIS_ADMIN_URL}/resumen`, { params });
  }
}
