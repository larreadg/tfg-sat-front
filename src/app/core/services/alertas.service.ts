import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { ApiResponse } from '../models/api-response.model';
import {
  AlertaDetalle,
  AlertaListItem,
  AlertasFiltros,
  CambiarEstadoAlerta,
  EstadoAlerta
} from '../models/alerta.model';
import { environment } from '../../../environments/environment';

const ALERTAS_ADMIN_URL = `${environment.apiUrl}/api/v1/admin/alertas`;

@Injectable({ providedIn: 'root' })
export class AlertasService {
  private readonly http = inject(HttpClient);

  /** Listado paginado. La paginación viaja en `meta`; los ítems en `data`. */
  listar(filtros: AlertasFiltros): Observable<ApiResponse<AlertaListItem[]>> {
    let params = new HttpParams();
    for (const [clave, valor] of Object.entries(filtros)) {
      if (valor !== undefined && valor !== null && valor !== '') {
        params = params.set(clave, String(valor));
      }
    }
    return this.http.get<ApiResponse<AlertaListItem[]>>(ALERTAS_ADMIN_URL, { params });
  }

  /**
   * Detalle de una alerta con los reportes que la componen (los que caen en su
   * área y ventana). Es lo que alimenta el mapa de pines numerados.
   */
  obtenerDetalle(id: number): Observable<ApiResponse<AlertaDetalle>> {
    return this.http.get<ApiResponse<AlertaDetalle>>(`${ALERTAS_ADMIN_URL}/${id}`);
  }

  /**
   * Transiciona el estado de una alerta. El backend valida la máquina de estados
   * (409 ante transiciones inválidas) y registra la observación como auditoría.
   */
  cambiarEstado(
    id: number,
    estadoNuevo: EstadoAlerta,
    observacion?: string
  ): Observable<ApiResponse<AlertaListItem>> {
    const body: CambiarEstadoAlerta = { estadoNuevo };
    if (observacion) {
      body.observacion = observacion;
    }
    return this.http.patch<ApiResponse<AlertaListItem>>(`${ALERTAS_ADMIN_URL}/${id}/estado`, body);
  }
}
