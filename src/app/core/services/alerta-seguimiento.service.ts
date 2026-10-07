import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { ApiResponse } from '../models/api-response.model';
import {
  ActualizarTarea,
  AdjuntoAlerta,
  ComentarioAlerta,
  CrearTarea,
  ResponsableTarea,
  TareaAlerta,
  TareasAlerta
} from '../models/alerta-seguimiento.model';
import { environment } from '../../../environments/environment';

const ALERTAS_URL = `${environment.apiUrl}/api/v1/admin/alertas`;
const ADJUNTOS_URL = `${environment.apiUrl}/api/v1/admin/adjuntos-alerta`;
const TAREAS_URL = `${environment.apiUrl}/api/v1/admin/tareas-alerta`;

/**
 * Seguimiento de una alerta: comentarios, archivos y tareas.
 *
 * Sin estado a propósito. Los Object URL de los adjuntos los administra el
 * componente que los muestra (`adjunto-vista`), que es el único que sabe cuándo
 * se destruye y puede liberarlos: un caché acá, en un servicio `root`,
 * sobreviviría al diálogo y perdería memoria para siempre.
 */
@Injectable({ providedIn: 'root' })
export class AlertaSeguimientoService {
  private readonly http = inject(HttpClient);

  /**
   * Hilo paginado. El backend devuelve de lo más nuevo a lo más viejo (así
   * "cargar más" funciona en un hilo que sigue creciendo); el componente
   * invierte para pintar el chat en orden cronológico.
   */
  listarComentarios(
    alertaId: number,
    page = 1,
    pageSize = 20
  ): Observable<ApiResponse<ComentarioAlerta[]>> {
    const params = new HttpParams().set('page', page).set('pageSize', pageSize);
    return this.http.get<ApiResponse<ComentarioAlerta[]>>(
      `${ALERTAS_URL}/${alertaId}/comentarios`,
      { params }
    );
  }

  /**
   * Crea un comentario con sus adjuntos. `FormData` sin `Content-Type`: lo pone
   * el navegador con el boundary. El `Authorization` lo agrega el interceptor.
   */
  crearComentario(
    alertaId: number,
    cuerpo: string,
    archivos: File[]
  ): Observable<ApiResponse<ComentarioAlerta>> {
    const formData = new FormData();
    formData.append('cuerpo', cuerpo);
    archivos.forEach((archivo) => formData.append('archivos', archivo));
    return this.http.post<ApiResponse<ComentarioAlerta>>(
      `${ALERTAS_URL}/${alertaId}/comentarios`,
      formData
    );
  }

  /** Todos los archivos de la alerta, vengan de un comentario o no. */
  listarAdjuntos(alertaId: number): Observable<ApiResponse<AdjuntoAlerta[]>> {
    return this.http.get<ApiResponse<AdjuntoAlerta[]>>(`${ALERTAS_URL}/${alertaId}/adjuntos`);
  }

  /** Adjuntos sueltos: quedan sin comentario, visibles en la pestaña Archivos. */
  subirAdjuntos(alertaId: number, archivos: File[]): Observable<ApiResponse<AdjuntoAlerta[]>> {
    const formData = new FormData();
    archivos.forEach((archivo) => formData.append('archivos', archivo));
    return this.http.post<ApiResponse<AdjuntoAlerta[]>>(
      `${ALERTAS_URL}/${alertaId}/adjuntos`,
      formData
    );
  }

  eliminarAdjunto(adjuntoId: number): Observable<ApiResponse<null>> {
    return this.http.delete<ApiResponse<null>>(`${ADJUNTOS_URL}/${adjuntoId}`);
  }

  /**
   * Trae el archivo como `Blob`.
   *
   * No se puede usar la URL directa en un `<img src>` ni en `window.open`: el
   * token va en una cabecera y esos dos no mandan cabeceras. Se descarga acá
   * (el interceptor pone el Bearer y resuelve el refresh en un 401) y el
   * componente arma un `blob:` con `URL.createObjectURL`.
   */
  descargarAdjunto(adjuntoId: number, forzarDescarga = false): Observable<Blob> {
    const params = forzarDescarga ? new HttpParams().set('descargar', 'true') : undefined;
    return this.http.get(`${ADJUNTOS_URL}/${adjuntoId}/contenido`, {
      responseType: 'blob',
      params
    });
  }

  listarTareas(alertaId: number): Observable<ApiResponse<TareasAlerta>> {
    return this.http.get<ApiResponse<TareasAlerta>>(`${ALERTAS_URL}/${alertaId}/tareas`);
  }

  crearTarea(alertaId: number, body: CrearTarea): Observable<ApiResponse<TareaAlerta>> {
    return this.http.post<ApiResponse<TareaAlerta>>(`${ALERTAS_URL}/${alertaId}/tareas`, body);
  }

  actualizarTarea(tareaId: number, body: ActualizarTarea): Observable<ApiResponse<TareaAlerta>> {
    return this.http.patch<ApiResponse<TareaAlerta>>(`${TAREAS_URL}/${tareaId}`, body);
  }

  eliminarTarea(tareaId: number): Observable<ApiResponse<null>> {
    return this.http.delete<ApiResponse<null>>(`${TAREAS_URL}/${tareaId}`);
  }

  /**
   * A quién se le puede asignar una tarea. Pide `alerta.seguimiento` y no
   * `usuario.ver`, así un ORGANISMO también puede repartir pendientes.
   */
  listarResponsables(alertaId: number): Observable<ApiResponse<ResponsableTarea[]>> {
    return this.http.get<ApiResponse<ResponsableTarea[]>>(
      `${ALERTAS_URL}/${alertaId}/responsables`
    );
  }
}
