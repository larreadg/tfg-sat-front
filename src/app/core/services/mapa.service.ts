import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { ApiResponse } from '../models/api-response.model';
import { MapaFiltros, MapaGeoJson } from '../models/mapa.model';
import { environment } from '../../../environments/environment';

const MAPA_URL = `${environment.apiUrl}/api/v1/admin/mapa`;

@Injectable({ providedIn: 'root' })
export class MapaService {
  private readonly http = inject(HttpClient);

  obtenerMapa(filtros: MapaFiltros): Observable<ApiResponse<MapaGeoJson>> {
    let params = new HttpParams();
    for (const [clave, valor] of Object.entries(filtros)) {
      if (valor !== undefined && valor !== null && valor !== '') {
        params = params.set(clave, String(valor));
      }
    }
    return this.http.get<ApiResponse<MapaGeoJson>>(MAPA_URL, { params });
  }
}
