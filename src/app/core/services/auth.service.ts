import { Injectable, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { jwtDecode } from 'jwt-decode';
import { Observable, catchError, map, of, tap } from 'rxjs';
import { ApiResponse } from '../models/api-response.model';
import { JwtPayload } from '../models/jwt-payload.model';
import { environment } from '../../../environments/environment';

/**
 * Los tokens viven en `localStorage` y no en `sessionStorage` porque el panel se
 * usa en varias pestañas a la vez: una alerta se abre en su propia pestaña desde
 * el tablero, y `sessionStorage` no viaja a una pestaña nueva (Chrome no lo
 * clona), así que la segunda pestaña caía en el login.
 *
 * El costo asumido es que la sesión ya no muere al cerrar el navegador: dura
 * hasta que expira el refresh token o hasta que se cierra sesión. `clearSession`
 * sigue siendo el único punto que la borra.
 */
const ACCESS_TOKEN_KEY = 'sat_access_token';
const REFRESH_TOKEN_KEY = 'sat_refresh_token';
const AUTH_BASE_URL = `${environment.apiUrl}/api/v1/auth`;

export type AuthStage = 'credentials' | 'otp';

interface LoginResponseData {
  preAuthToken: string;
}

interface VerifyOtpResponseData {
  accessToken: string;
  refreshToken: string;
}

interface RefreshResponseData {
  accessToken: string;
  refreshToken: string;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);

  private readonly preAuthTokenSignal = signal<string | null>(null);
  private readonly accessTokenSignal = signal<string | null>(localStorage.getItem(ACCESS_TOKEN_KEY));
  private readonly refreshTokenSignal = signal<string | null>(localStorage.getItem(REFRESH_TOKEN_KEY));

  readonly currentStage = signal<AuthStage>('credentials');
  readonly loading = signal(false);

  readonly accessToken = this.accessTokenSignal.asReadonly();

  readonly usuarioActual = computed<JwtPayload | null>(() => decodeToken(this.accessTokenSignal()));

  readonly isAuthenticated = computed(() => {
    const usuario = this.usuarioActual();
    return !!usuario && usuario.exp * 1000 > Date.now();
  });

  readonly nombreCompleto = computed(() => {
    const usuario = this.usuarioActual();
    return usuario ? `${usuario.nombres} ${usuario.apellidos}` : null;
  });

  constructor() {
    if (this.accessTokenSignal() && !this.isAuthenticated()) {
      this.clearSession();
    }
  }

  tienePermiso(permiso: string): boolean {
    return this.usuarioActual()?.permisos.includes(permiso) ?? false;
  }

  tieneTodosLosPermisos(permisos: string[]): boolean {
    return permisos.every((permiso) => this.tienePermiso(permiso));
  }

  tieneAlgunPermiso(permisos: string[]): boolean {
    return permisos.some((permiso) => this.tienePermiso(permiso));
  }

  /** El token de Turnstile es de un solo uso: ante error hay que resetear el widget. */
  login(
    correoElectronico: string,
    contrasena: string,
    turnstileToken: string
  ): Observable<ApiResponse<LoginResponseData>> {
    this.loading.set(true);
    return this.http
      .post<ApiResponse<LoginResponseData>>(`${AUTH_BASE_URL}/login`, {
        correoElectronico,
        contrasena,
        turnstileToken
      })
      .pipe(
        tap({
          next: (res) => {
            this.loading.set(false);
            if (res.data) {
              this.preAuthTokenSignal.set(res.data.preAuthToken);
              this.currentStage.set('otp');
            }
          },
          error: () => this.loading.set(false)
        })
      );
  }

  verifyOtp(codigo: string): Observable<ApiResponse<VerifyOtpResponseData>> {
    this.loading.set(true);
    return this.http
      .post<ApiResponse<VerifyOtpResponseData>>(`${AUTH_BASE_URL}/2fa-codigos/verificacion`, {
        preAuthToken: this.preAuthTokenSignal(),
        codigo
      })
      .pipe(
        tap({
          next: (res) => {
            this.loading.set(false);
            if (res.data) {
              this.setSession(res.data.accessToken, res.data.refreshToken);
            }
          },
          error: () => this.loading.set(false)
        })
      );
  }

  resendOtp(): Observable<ApiResponse<null>> {
    return this.http.post<ApiResponse<null>>(`${AUTH_BASE_URL}/2fa-codigos`, {
      preAuthToken: this.preAuthTokenSignal()
    });
  }

  /** Descarta el preAuthToken y vuelve a la etapa de credenciales sin cerrar sesión (no hay sesión aún). */
  backToLogin(): void {
    this.preAuthTokenSignal.set(null);
    this.currentStage.set('credentials');
  }

  /** Usado por el interceptor HTTP para renovar el access token vencido. Nunca emite error: si la renovación falla, limpia la sesión y devuelve null. */
  refreshAccessToken(): Observable<string | null> {
    const refreshToken = this.refreshTokenSignal();
    if (!refreshToken) {
      return of(null);
    }
    return this.http.post<ApiResponse<RefreshResponseData>>(`${AUTH_BASE_URL}/refresh`, { refreshToken }).pipe(
      map((res) => {
        if (!res.data) {
          this.clearSession();
          return null;
        }
        this.setSession(res.data.accessToken, res.data.refreshToken);
        return res.data.accessToken;
      }),
      catchError(() => {
        this.clearSession();
        return of(null);
      })
    );
  }

  logout(): void {
    const refreshToken = this.refreshTokenSignal();
    this.clearSession();
    if (refreshToken) {
      this.http
        .post<ApiResponse<null>>(`${AUTH_BASE_URL}/logout`, { refreshToken })
        .pipe(catchError(() => of(null)))
        .subscribe();
    }
  }

  clearSession(): void {
    this.accessTokenSignal.set(null);
    this.refreshTokenSignal.set(null);
    localStorage.removeItem(ACCESS_TOKEN_KEY);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
    // Por si quedó una sesión guardada con el esquema anterior.
    sessionStorage.removeItem(ACCESS_TOKEN_KEY);
    sessionStorage.removeItem(REFRESH_TOKEN_KEY);
    this.preAuthTokenSignal.set(null);
    this.currentStage.set('credentials');
  }

  private setSession(accessToken: string, refreshToken: string): void {
    this.accessTokenSignal.set(accessToken);
    this.refreshTokenSignal.set(refreshToken);
    localStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
    localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
  }
}

function decodeToken(token: string | null): JwtPayload | null {
  if (!token) {
    return null;
  }
  try {
    return jwtDecode<JwtPayload>(token);
  } catch {
    return null;
  }
}
