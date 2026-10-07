import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { ApiResponse } from '../models/api-response.model';
import {
  ActualizarConfiguracionInput,
  ConfiguracionCriticidad,
  ListarVersionesQuery
} from '../models/configuracion.model';
import {
  ActualizarNotificacionInput,
  ConfiguracionNotificacion,
  EstadoSistema,
  ResultadoPruebaCorreo
} from '../models/sistema.model';
import { environment } from '../../../environments/environment';

const CONFIGURACION_URL = `${environment.apiUrl}/api/v1/admin/configuracion`;

@Injectable({ providedIn: 'root' })
export class ConfiguracionService {
  private readonly http = inject(HttpClient);

  /** Versión vigente del motor de criticidad. 404 si no hay ninguna activa. */
  obtenerActiva(): Observable<ApiResponse<ConfiguracionCriticidad>> {
    return this.http.get<ApiResponse<ConfiguracionCriticidad>>(CONFIGURACION_URL);
  }

  /**
   * NO edita la versión activa: crea la siguiente y la activa (ERS §4.4). El body
   * va completo. Responde 201 con la versión nueva.
   */
  guardarNuevaVersion(
    input: ActualizarConfiguracionInput
  ): Observable<ApiResponse<ConfiguracionCriticidad>> {
    return this.http.put<ApiResponse<ConfiguracionCriticidad>>(CONFIGURACION_URL, input);
  }

  /** Historial paginado, de la versión más nueva a la más vieja. */
  listarVersiones(
    query: ListarVersionesQuery = {}
  ): Observable<ApiResponse<ConfiguracionCriticidad[]>> {
    let params = new HttpParams();
    for (const [clave, valor] of Object.entries(query)) {
      if (valor !== undefined && valor !== null) {
        params = params.set(clave, String(valor));
      }
    }
    return this.http.get<ApiResponse<ConfiguracionCriticidad[]>>(`${CONFIGURACION_URL}/versiones`, {
      params
    });
  }

  obtenerVersion(id: number): Observable<ApiResponse<ConfiguracionCriticidad>> {
    return this.http.get<ApiResponse<ConfiguracionCriticidad>>(
      `${CONFIGURACION_URL}/versiones/${id}`
    );
  }

  /** Estado operativo (canales, IA, encuesta activa). Solo lectura, sin secretos. */
  obtenerSistema(): Observable<ApiResponse<EstadoSistema>> {
    return this.http.get<ApiResponse<EstadoSistema>>(`${CONFIGURACION_URL}/sistema`);
  }

  /** Configuración del canal de correo. Nunca trae la contraseña SMTP. */
  obtenerNotificaciones(): Observable<ApiResponse<ConfiguracionNotificacion>> {
    return this.http.get<ApiResponse<ConfiguracionNotificacion>>(`${CONFIGURACION_URL}/notificaciones`);
  }

  /**
   * Sobrescribe la configuración (no versiona, a diferencia del motor). Omitir
   * `smtpContrasena` conserva la guardada; `null` la borra.
   */
  guardarNotificaciones(
    input: ActualizarNotificacionInput
  ): Observable<ApiResponse<ConfiguracionNotificacion>> {
    return this.http.put<ApiResponse<ConfiguracionNotificacion>>(
      `${CONFIGURACION_URL}/notificaciones`,
      input
    );
  }

  /**
   * Envía un correo real al destinatario indicado con la config ya guardada.
   * 502 si el servidor SMTP rechaza: el `message` del error trae su respuesta textual.
   */
  probarCorreo(destinatario: string): Observable<ApiResponse<ResultadoPruebaCorreo>> {
    return this.http.post<ApiResponse<ResultadoPruebaCorreo>>(
      `${CONFIGURACION_URL}/notificaciones/pruebas`,
      { destinatario }
    );
  }
}
