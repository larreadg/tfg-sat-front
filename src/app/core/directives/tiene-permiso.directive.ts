import { Directive, TemplateRef, ViewContainerRef, effect, inject, input } from '@angular/core';
import { AuthService } from '../services/auth.service';
import { ModoPermiso } from '../guards/permiso.guard';

/**
 * Muestra el contenido solo si el usuario autenticado tiene el/los permiso(s)
 * indicado(s).
 *
 * Con un array, `modo` decide si se exigen todos (por defecto) o alcanza con uno:
 * `*appTienePermiso="['usuario.ver', 'rol.ver']; modo: 'alguno'"`.
 *
 * Es solo UX: la barrera real es `requirePermiso` en el backend.
 */
@Directive({
  selector: '[appTienePermiso]'
})
export class TienePermisoDirective {
  private readonly templateRef = inject(TemplateRef<unknown>);
  private readonly viewContainerRef = inject(ViewContainerRef);
  private readonly authService = inject(AuthService);

  readonly appTienePermiso = input<string | string[] | undefined>();
  /** Microsintaxis: `appTienePermisoModo`. `undefined` cae en 'todos'. */
  readonly appTienePermisoModo = input<ModoPermiso | undefined>();

  private mostrado = false;

  constructor() {
    effect(() => {
      const permisoRequerido = this.appTienePermiso();
      const permisos = !permisoRequerido ? [] : Array.isArray(permisoRequerido) ? permisoRequerido : [permisoRequerido];
      const tienePermiso =
        this.appTienePermisoModo() === 'alguno'
          ? this.authService.tieneAlgunPermiso(permisos)
          : this.authService.tieneTodosLosPermisos(permisos);

      if (tienePermiso && !this.mostrado) {
        this.viewContainerRef.createEmbeddedView(this.templateRef);
        this.mostrado = true;
      } else if (!tienePermiso && this.mostrado) {
        this.viewContainerRef.clear();
        this.mostrado = false;
      }
    });
  }
}
