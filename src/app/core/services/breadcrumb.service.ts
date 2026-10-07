import { Injectable, signal } from '@angular/core';

/**
 * Etiqueta del último escalón del breadcrumb cuando la pantalla recién la conoce
 * después de cargar sus datos.
 *
 * La ruta puede declarar un título fijo (`data.title`) y su padre
 * (`data.breadcrumbPadre`), pero no el código de un reporte: eso llega con la
 * respuesta del backend. La pantalla lo publica acá al cargar y lo limpia al
 * destruirse; si no lo hace, el breadcrumb cae al título de la ruta.
 */
@Injectable({ providedIn: 'root' })
export class BreadcrumbService {
  private readonly detalleSignal = signal<string | null>(null);

  readonly detalle = this.detalleSignal.asReadonly();

  publicar(etiqueta: string | null): void {
    this.detalleSignal.set(etiqueta);
  }

  limpiar(): void {
    this.detalleSignal.set(null);
  }
}
