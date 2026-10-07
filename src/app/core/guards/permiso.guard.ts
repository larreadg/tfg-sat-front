import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

export type ModoPermiso = 'todos' | 'alguno';

/**
 * Bloquea la ruta salvo que el usuario autenticado cumpla los permisos indicados.
 * `permisos` acepta un único string "recurso.accion" (ver `permiso()` en `permiso.model.ts`)
 * o un array; `modo` decide si se requieren todos ("todos", por defecto) o alcanza con uno
 * cualquiera ("alguno").
 */
export const permisoGuard = (permisos: string | string[], modo: ModoPermiso = 'todos'): CanActivateFn => {
  return () => {
    const authService = inject(AuthService);
    const router = inject(Router);

    if (!authService.isAuthenticated()) {
      return router.createUrlTree(['/login']);
    }

    const requeridos = Array.isArray(permisos) ? permisos : [permisos];
    const autorizado =
      modo === 'alguno' ? authService.tieneAlgunPermiso(requeridos) : authService.tieneTodosLosPermisos(requeridos);

    return autorizado || router.createUrlTree(['/inicio']);
  };
};
