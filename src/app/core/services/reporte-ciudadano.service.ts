import { Injectable, inject, signal } from '@angular/core';
import { HttpClient, HttpEventType, HttpHeaders } from '@angular/common/http';
import { Observable, filter, finalize, map, tap } from 'rxjs';
import { ApiResponse } from '../models/api-response.model';
import { Encuesta, RespuestaEnvio } from '../models/encuesta.model';
import { environment } from '../../../environments/environment';

const AUTH_BASE_URL = `${environment.apiUrl}/api/v1/auth/ciudadano`;
const ENCUESTA_ACTIVA_URL = `${environment.apiUrl}/api/v1/encuestas/activa`;
const REPORTES_CIUDADANOS_URL = `${environment.apiUrl}/api/v1/reportes-ciudadanos`;

export type VerificacionStage = 'telefono' | 'codigo';

interface LoginResponseData {
  preAuthToken: string;
}

interface VerificarCodigoResponseData {
  token: string;
}

export interface EnviarReporteResponseData {
  reporteId: number;
  /** Código que el ciudadano puede guardar para consultar su reporte (ej. AGD-0000012). */
  codigoPublico: string;
  encuestaId: number;
  validacionSmsId: number;
  respuestaIds: number[];
}

@Injectable({ providedIn: 'root' })
export class ReporteCiudadanoService {
  private readonly http = inject(HttpClient);

  private readonly preAuthTokenSignal = signal<string | null>(null);
  private readonly sessionTokenSignal = signal<string | null>(null);

  readonly stage = signal<VerificacionStage>('telefono');
  readonly loading = signal(false);
  readonly identidadVerificada = signal(false);
  /**
   * Porcentaje (0-100) de las fotos ya subidas durante `enviarReporte`; `null`
   * fuera del envío. Llegar a 100 no es terminar: después el servidor todavía
   * comprime las fotos y registra el reporte, y eso puede tardar unos segundos.
   */
  readonly progresoSubida = signal<number | null>(null);

  /** El token de Turnstile es de un solo uso: ante error hay que resetear el widget. */
  login(telefono: string, turnstileToken: string): Observable<ApiResponse<LoginResponseData>> {
    this.loading.set(true);
    return this.http.post<ApiResponse<LoginResponseData>>(`${AUTH_BASE_URL}/login`, { telefono, turnstileToken }).pipe(
      tap({
        next: (res) => {
          this.loading.set(false);
          if (res.data) {
            this.preAuthTokenSignal.set(res.data.preAuthToken);
            this.stage.set('codigo');
          }
        },
        error: () => this.loading.set(false)
      })
    );
  }

  reenviarCodigo(): Observable<ApiResponse<null>> {
    return this.http.post<ApiResponse<null>>(`${AUTH_BASE_URL}/2fa-codigos`, {
      preAuthToken: this.preAuthTokenSignal()
    });
  }

  verificarCodigo(codigo: string): Observable<ApiResponse<VerificarCodigoResponseData>> {
    this.loading.set(true);
    return this.http
      .post<ApiResponse<VerificarCodigoResponseData>>(`${AUTH_BASE_URL}/2fa-codigos/verificacion`, {
        preAuthToken: this.preAuthTokenSignal(),
        codigo
      })
      .pipe(
        tap({
          next: (res) => {
            this.loading.set(false);
            if (res.data) {
              this.sessionTokenSignal.set(res.data.token);
              this.identidadVerificada.set(true);
            }
          },
          error: () => this.loading.set(false)
        })
      );
  }

  /** Pública: se puede pedir en paralelo con el login, sin esperar a que el ciudadano termine el 2FA. */
  getEncuesta(): Observable<ApiResponse<Encuesta>> {
    return this.http.get<ApiResponse<Encuesta>>(ENCUESTA_ACTIVA_URL);
  }

  /**
   * El token de sesión es de un solo uso: solo sirve para un envío exitoso.
   *
   * Prende `loading` durante TODA la request (subida + procesamiento del lado del
   * servidor) y publica el avance de la subida en `progresoSubida`.
   */
  enviarReporte(
    respuestas: RespuestaEnvio[],
    fotos: File[],
    ubicacion: { latitud: number; longitud: number },
    turnstileToken: string
  ): Observable<ApiResponse<EnviarReporteResponseData>> {
    const formData = new FormData();
    formData.append('respuestas', JSON.stringify(respuestas));
    formData.append('turnstileToken', turnstileToken);
    formData.append('latitud', String(ubicacion.latitud));
    formData.append('longitud', String(ubicacion.longitud));
    fotos.forEach((foto) => formData.append('fotos', foto));

    this.loading.set(true);
    this.progresoSubida.set(0);

    return this.http
      .post<ApiResponse<EnviarReporteResponseData>>(REPORTES_CIUDADANOS_URL, formData, {
        headers: new HttpHeaders({ Authorization: `Bearer ${this.sessionTokenSignal()}` }),
        reportProgress: true,
        observe: 'events'
      })
      .pipe(
        tap((evento) => {
          if (evento.type === HttpEventType.UploadProgress && evento.total) {
            this.progresoSubida.set(Math.round((evento.loaded / evento.total) * 100));
          }
        }),
        filter((evento) => evento.type === HttpEventType.Response),
        map((evento) => evento.body as ApiResponse<EnviarReporteResponseData>),
        finalize(() => {
          this.loading.set(false);
          this.progresoSubida.set(null);
        })
      );
  }

  /** Descarta el preAuthToken y vuelve a pedir el teléfono (p.ej. tras un 401 por token vencido en el 2FA). */
  volverATelefono(): void {
    this.preAuthTokenSignal.set(null);
    this.stage.set('telefono');
  }

  /** Reinicia todo el flujo desde cero (p.ej. tras enviar un reporte o recibir un 409 por token ya usado). */
  reiniciar(): void {
    this.preAuthTokenSignal.set(null);
    this.sessionTokenSignal.set(null);
    this.stage.set('telefono');
    this.identidadVerificada.set(false);
  }
}
