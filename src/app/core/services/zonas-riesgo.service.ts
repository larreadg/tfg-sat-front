import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, catchError, map, of, shareReplay } from 'rxjs';
import { ApiResponse } from '../models/api-response.model';
import {
  ActualizarZonaRiesgoInput,
  CrearZonaRiesgoInput,
  MallaRiesgo,
  ZonaRiesgo
} from '../models/zona-riesgo.model';
import { environment } from '../../../environments/environment';

const ZONAS_URL = `${environment.apiUrl}/api/v1/admin/zonas-riesgo`;

@Injectable({ providedIn: 'root' })
export class ZonasRiesgoService {
  private readonly http = inject(HttpClient);

  /**
   * La malla es fija (solo cambia con un despliegue): se pide una vez por sesión y
   * la comparten el mapa general y la pantalla de zonas. Si no se puede cargar,
   * emite `null` y los mapas siguen andando sin esa capa.
   */
  private readonly malla$ = this.http.get<ApiResponse<MallaRiesgo>>(`${ZONAS_URL}/malla`).pipe(
    map((res) => res.data ?? null),
    catchError(() => of(null)),
    shareReplay({ bufferSize: 1, refCount: false })
  );

  obtenerMalla(): Observable<MallaRiesgo | null> {
    return this.malla$;
  }

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
