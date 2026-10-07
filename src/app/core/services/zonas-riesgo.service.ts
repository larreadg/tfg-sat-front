import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { ApiResponse } from '../models/api-response.model';
import { ActualizarZonaRiesgoInput, CrearZonaRiesgoInput, ZonaRiesgo } from '../models/zona-riesgo.model';
import { environment } from '../../../environments/environment';

const ZONAS_URL = `${environment.apiUrl}/api/v1/admin/zonas-riesgo`;

@Injectable({ providedIn: 'root' })
export class ZonasRiesgoService {
  private readonly http = inject(HttpClient);

  listar(soloActivas?: boolean): Observable<ApiResponse<ZonaRiesgo[]>> {
    let params = new HttpParams();
    if (soloActivas !== undefined) {
      params = params.set('activo', String(soloActivas));
    }
    return this.http.get<ApiResponse<ZonaRiesgo[]>>(ZONAS_URL, { params });
  }

  crear(input: CrearZonaRiesgoInput): Observable<ApiResponse<ZonaRiesgo>> {
    return this.http.post<ApiResponse<ZonaRiesgo>>(ZONAS_URL, input);
  }

  actualizar(id: number, input: ActualizarZonaRiesgoInput): Observable<ApiResponse<ZonaRiesgo>> {
    return this.http.patch<ApiResponse<ZonaRiesgo>>(`${ZONAS_URL}/${id}`, input);
  }

  eliminar(id: number): Observable<ApiResponse<null>> {
    return this.http.delete<ApiResponse<null>>(`${ZONAS_URL}/${id}`);
  }
}
