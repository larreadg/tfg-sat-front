import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { MessageService } from 'primeng/api';
import { catchError, throwError } from 'rxjs';
import { AuthService } from '../services/auth.service';

const AUTH_URL_SEGMENT = '/api/auth/';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const authService = inject(AuthService);
  const router = inject(Router);
  const messageService = inject(MessageService);

  const isAuthRequest = req.url.includes(AUTH_URL_SEGMENT);
  const token = authService.sessionToken();

  const authReq = !isAuthRequest && token ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }) : req;

  return next(authReq).pipe(
    catchError((error: HttpErrorResponse) => {
      if (error.status === 401 && authService.isAuthenticated()) {
        authService.clearSession();
        messageService.add({
          severity: 'warn',
          summary: 'Sesión expirada',
          detail: 'Tu sesión ha expirado. Por favor, vuelve a iniciar sesión.'
        });
        router.navigate(['/login']);
      }
      return throwError(() => error);
    })
  );
};
