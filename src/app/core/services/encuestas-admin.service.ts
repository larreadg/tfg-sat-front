import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { ApiResponse } from '../models/api-response.model';
import {
  ActualizarEncuestaInput,
  ActualizarPreguntaInput,
  CrearVersionInput,
  EncuestaVersionDetalle,
  EncuestaVersionItem,
  PreguntaAdmin,
  PreguntaInput,
  ReemplazarContenidoInput
} from '../models/encuesta-admin.model';
import { environment } from '../../../environments/environment';

const ENCUESTAS_URL = `${environment.apiUrl}/api/v1/admin/encuestas`;
const PREGUNTAS_URL = `${environment.apiUrl}/api/v1/admin/preguntas`;

@Injectable({ providedIn: 'root' })
export class EncuestasAdminService {
  private readonly http = inject(HttpClient);

  listar(): Observable<ApiResponse<EncuestaVersionItem[]>> {
    return this.http.get<ApiResponse<EncuestaVersionItem[]>>(ENCUESTAS_URL);
  }

  obtener(id: number): Observable<ApiResponse<EncuestaVersionDetalle>> {
    return this.http.get<ApiResponse<EncuestaVersionDetalle>>(`${ENCUESTAS_URL}/${id}`);
  }

  /**
   * La versión ACTIVA con sus preguntas, opciones y códigos. La usa el editor del
   * motor de criticidad para armar las reglas sobre preguntas reales. Devuelve 404
   * si no hay ninguna activa.
   */
  obtenerActiva(): Observable<ApiResponse<EncuestaVersionDetalle>> {
    return this.http.get<ApiResponse<EncuestaVersionDetalle>>(`${ENCUESTAS_URL}/activa`);
  }

  /**
   * Crea una versión nueva derivada de `id` con el contenido ya ajustado en el
   * panel. Sin `preguntas`, clona el contenido del origen.
   */
  crearVersion(id: number, input: CrearVersionInput = {}): Observable<ApiResponse<EncuestaVersionDetalle>> {
    return this.http.post<ApiResponse<EncuestaVersionDetalle>>(`${ENCUESTAS_URL}/${id}/versiones`, input);
  }

  /** Guarda de una sola vez todo el contenido de un borrador. */
  reemplazarContenido(
    id: number,
    input: ReemplazarContenidoInput
  ): Observable<ApiResponse<EncuestaVersionDetalle>> {
    return this.http.put<ApiResponse<EncuestaVersionDetalle>>(`${ENCUESTAS_URL}/${id}/contenido`, input);
  }

  /** Elimina una versión borrador (no activa y sin reportes). */
  eliminar(id: number): Observable<ApiResponse<null>> {
    return this.http.delete<ApiResponse<null>>(`${ENCUESTAS_URL}/${id}`);
  }

  /** Cambia nombre/descripción/fotos (solo borradores) o activa la versión. */
  actualizar(id: number, input: ActualizarEncuestaInput): Observable<ApiResponse<EncuestaVersionDetalle>> {
    return this.http.put<ApiResponse<EncuestaVersionDetalle>>(`${ENCUESTAS_URL}/${id}`, input);
  }

  agregarPregunta(encuestaId: number, input: PreguntaInput): Observable<ApiResponse<EncuestaVersionDetalle>> {
    return this.http.post<ApiResponse<EncuestaVersionDetalle>>(`${ENCUESTAS_URL}/${encuestaId}/preguntas`, input);
  }

  actualizarPregunta(preguntaId: number, input: ActualizarPreguntaInput): Observable<ApiResponse<PreguntaAdmin>> {
    return this.http.put<ApiResponse<PreguntaAdmin>>(`${PREGUNTAS_URL}/${preguntaId}`, input);
  }

  eliminarPregunta(preguntaId: number): Observable<ApiResponse<null>> {
    return this.http.delete<ApiResponse<null>>(`${PREGUNTAS_URL}/${preguntaId}`);
  }
}
