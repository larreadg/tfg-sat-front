import { HttpErrorResponse, HttpEvent, HttpHandlerFn, HttpInterceptorFn, HttpRequest } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { MessageService } from 'primeng/api';
import { Observable, catchError, finalize, shareReplay, switchMap, throwError } from 'rxjs';
import { AuthService } from '../services/auth.service';

const AUTH_URL_SEGMENT = '/api/v1/auth/';
const REPORTE_CIUDADANO_URL_SEGMENTS = ['/api/v1/reportes-ciudadanos', '/api/v1/encuestas'];

/** Comparte una única llamada a /auth/refresh entre todas las requests que fallan en 401 al mismo tiempo. */
let refreshInProgress$: Observable<string | null> | null = null;

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const authService = inject(AuthService);
  const router = inject(Router);
  const messageService = inject(MessageService);

  // El flujo público de reporte ciudadano usa su propio token de sesión (ver ReporteCiudadanoService),
  // no el del analista autenticado: queda fuera del refresh/Bearer del panel de administración.
  const isAuthRequest =
    req.url.includes(AUTH_URL_SEGMENT) || REPORTE_CIUDADANO_URL_SEGMENTS.some((segment) => req.url.includes(segment));
  const token = authService.accessToken();

  const authReq = !isAuthRequest && token ? addToken(req, token) : req;

  return next(authReq).pipe(
    catchError((error: HttpErrorResponse) => {
      if (error.status !== 401 || isAuthRequest) {
        return throwError(() => error);
      }
      return handleUnauthorized(req, next, authService, router, messageService, error);
    })
  );
};

function addToken(req: HttpRequest<unknown>, token: string): HttpRequest<unknown> {
  return req.clone({ setHeaders: { Authorization: `Bearer ${token}` } });
}

function handleUnauthorized(
  req: HttpRequest<unknown>,
  next: HttpHandlerFn,
  authService: AuthService,
  router: Router,
  messageService: MessageService,
  originalError: HttpErrorResponse
): Observable<HttpEvent<unknown>> {
  if (!refreshInProgress$) {
    refreshInProgress$ = authService.refreshAccessToken().pipe(
      finalize(() => (refreshInProgress$ = null)),
      shareReplay(1)
    );
  }

  return refreshInProgress$.pipe(
    switchMap((newToken) => {
      if (!newToken) {
        notifySessionExpired(authService, router, messageService);
        return throwError(() => originalError);
      }
      return next(addToken(req, newToken));
    })
  );
}

function notifySessionExpired(authService: AuthService, router: Router, messageService: MessageService): void {
  const wasAuthenticated = authService.isAuthenticated();
  authService.clearSession();
  if (wasAuthenticated) {
    messageService.add({
      severity: 'warn',
      summary: 'Sesión expirada',
      detail: 'Tu sesión ha expirado. Por favor, vuelve a iniciar sesión.'
    });
    router.navigate(['/login']);
  }
}
