import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { ApiResponse } from '../models/api-response.model';
import {
  ActualizarRemitenteInput,
  CatalogoWebhooks,
  EntregaWebhook,
  GuardarReglaInput,
  ListarReglasQuery,
  ReglaWebhook,
  Remitente
} from '../models/webhook.model';
import { environment } from '../../../environments/environment';

const WEBHOOKS_URL = `${environment.apiUrl}/api/v1/admin/webhooks`;

function aParams(query: Record<string, unknown>): HttpParams {
  let params = new HttpParams();
  for (const [clave, valor] of Object.entries(query)) {
    if (valor !== undefined && valor !== null && valor !== '') {
      params = params.set(clave, String(valor));
    }
  }
  return params;
}

@Injectable({ providedIn: 'root' })
export class WebhooksService {
  private readonly http = inject(HttpClient);

  /**
   * Catálogo de eventos, acciones y condiciones. Es lo que la pantalla usa para
   * armar el formulario: no hay listas de eventos hardcodeadas en el front.
   */
  obtenerCatalogo(): Observable<ApiResponse<CatalogoWebhooks>> {
    return this.http.get<ApiResponse<CatalogoWebhooks>>(`${WEBHOOKS_URL}/eventos`);
  }

  /** Remitente global de los correos. Vive acá, no en el tab Sistema. */
  obtenerRemitente(): Observable<ApiResponse<Remitente>> {
    return this.http.get<ApiResponse<Remitente>>(`${WEBHOOKS_URL}/remitente`);
  }

  guardarRemitente(input: ActualizarRemitenteInput): Observable<ApiResponse<Remitente>> {
    return this.http.put<ApiResponse<Remitente>>(`${WEBHOOKS_URL}/remitente`, input);
  }

  listarReglas(query: ListarReglasQuery = {}): Observable<ApiResponse<ReglaWebhook[]>> {
    return this.http.get<ApiResponse<ReglaWebhook[]>>(`${WEBHOOKS_URL}/reglas`, {
      params: aParams(query as Record<string, unknown>)
    });
  }

  crearRegla(input: GuardarReglaInput): Observable<ApiResponse<ReglaWebhook>> {
    return this.http.post<ApiResponse<ReglaWebhook>>(`${WEBHOOKS_URL}/reglas`, input);
  }

  actualizarRegla(id: number, input: GuardarReglaInput): Observable<ApiResponse<ReglaWebhook>> {
    return this.http.put<ApiResponse<ReglaWebhook>>(`${WEBHOOKS_URL}/reglas/${id}`, input);
  }

  eliminarRegla(id: number): Observable<ApiResponse<null>> {
    return this.http.delete<ApiResponse<null>>(`${WEBHOOKS_URL}/reglas/${id}`);
  }

  /**
   * Dispara la regla con un payload de ejemplo. Responde **200 igual si la entrega
   * falló**: el resultado viene en `exito`/`detalle`, porque una entrega fallida es
   * un resultado legítimo de "probar" y se registra en la bitácora como cualquier otra.
   */
  probarRegla(id: number): Observable<ApiResponse<EntregaWebhook>> {
    return this.http.post<ApiResponse<EntregaWebhook>>(`${WEBHOOKS_URL}/reglas/${id}/pruebas`, {});
  }

  listarEntregas(
    id: number,
    query: { page?: number; limit?: number } = {}
  ): Observable<ApiResponse<EntregaWebhook[]>> {
    return this.http.get<ApiResponse<EntregaWebhook[]>>(`${WEBHOOKS_URL}/reglas/${id}/entregas`, {
      params: aParams(query)
    });
  }
}
