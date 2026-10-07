import { Injectable, signal } from '@angular/core';
import { ConfiguracionCriticidad } from '../models/configuracion.model';

/**
 * Punto de encuentro entre el tab de Historial y el del Motor de criticidad para
 * la acción "usar como base" (plan_configuracion.md §5.2).
 *
 * Existe porque los dos tabs son componentes hermanos y, además, `p-tabs` está en
 * modo `lazy`: el Motor recién se instancia cuando el usuario cae en su tab, así
 * que no se le puede pasar la versión por `input()`. El Historial deja acá la
 * versión propuesta, navega a `?tab=motor` y el Motor la levanta al iniciarse.
 *
 * **Es un buzón de un solo uso**: `tomarBase()` devuelve la propuesta y la
 * limpia. Si no se consumiera, volver al tab del Motor más tarde recargaría una
 * versión vieja encima de lo que el usuario esté editando.
 *
 * Esto NO reactiva la versión vieja (§5.3): solo precarga el formulario. Guardar
 * desde ahí crea la versión siguiente, que es como el historial avanza siempre
 * hacia adelante (`DesgloseFactores.configId` lo asume).
 */
@Injectable({ providedIn: 'root' })
export class ConfiguracionBorradorService {
  private readonly propuesta = signal<ConfiguracionCriticidad | null>(null);

  /** Solo para la UI: permite avisar que hay una versión esperando. */
  readonly hayPropuesta = signal(false);

  /** Deja una versión como plantilla para el formulario del Motor. */
  proponerBase(configuracion: ConfiguracionCriticidad): void {
    this.propuesta.set(configuracion);
    this.hayPropuesta.set(true);
  }

  /**
   * Devuelve la versión propuesta y vacía el buzón. La llama el tab del Motor al
   * iniciarse; si devuelve `null` el Motor carga la versión activa, como siempre.
   */
  tomarBase(): ConfiguracionCriticidad | null {
    const base = this.propuesta();
    this.propuesta.set(null);
    this.hayPropuesta.set(false);
    return base;
  }
}
