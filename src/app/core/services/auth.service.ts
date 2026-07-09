import { Injectable, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, tap } from 'rxjs';
import { ApiResponse } from '../models/api-response.model';
import { environment } from '../../../environments/environment';

const SESSION_TOKEN_KEY = 'sat_session_token';
const AUTH_BASE_URL = `${environment.apiUrl}/api/auth`;

export type AuthStage = 'credentials' | 'otp';

interface LoginResponseData {
  preAuthToken: string;
}

interface VerifyOtpResponseData {
  token: string;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);

  private readonly preAuthTokenSignal = signal<string | null>(null);
  private readonly sessionTokenSignal = signal<string | null>(sessionStorage.getItem(SESSION_TOKEN_KEY));

  readonly currentStage = signal<AuthStage>('credentials');
  readonly loading = signal(false);

  readonly sessionToken = this.sessionTokenSignal.asReadonly();
  readonly isAuthenticated = computed(() => !!this.sessionTokenSignal());

  getCaptcha(): Observable<string> {
    return this.http.get(`${AUTH_BASE_URL}/captcha`, { responseType: 'text' });
  }

  login(correoElectronico: string, contrasena: string, captcha: string): Observable<ApiResponse<LoginResponseData>> {
    this.loading.set(true);
    return this.http
      .post<ApiResponse<LoginResponseData>>(`${AUTH_BASE_URL}/login`, { correoElectronico, contrasena, captcha })
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
      .post<ApiResponse<VerifyOtpResponseData>>(`${AUTH_BASE_URL}/2fa/verificar`, {
        preAuthToken: this.preAuthTokenSignal(),
        codigo
      })
      .pipe(
        tap({
          next: (res) => {
            this.loading.set(false);
            if (res.data) {
              this.setSession(res.data.token);
            }
          },
          error: () => this.loading.set(false)
        })
      );
  }

  resendOtp(): Observable<ApiResponse<null>> {
    return this.http.post<ApiResponse<null>>(`${AUTH_BASE_URL}/2fa/reenviar`, {
      preAuthToken: this.preAuthTokenSignal()
    });
  }

  /** Descarta el preAuthToken y vuelve a la etapa de credenciales sin cerrar sesión (no hay sesión aún). */
  backToLogin(): void {
    this.preAuthTokenSignal.set(null);
    this.currentStage.set('credentials');
  }

  logout(): void {
    this.clearSession();
  }

  clearSession(): void {
    this.sessionTokenSignal.set(null);
    sessionStorage.removeItem(SESSION_TOKEN_KEY);
    this.preAuthTokenSignal.set(null);
    this.currentStage.set('credentials');
  }

  private setSession(token: string): void {
    this.sessionTokenSignal.set(token);
    sessionStorage.setItem(SESSION_TOKEN_KEY, token);
  }
}
