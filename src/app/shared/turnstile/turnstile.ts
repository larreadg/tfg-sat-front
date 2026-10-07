import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  NgZone,
  OnDestroy,
  inject,
  input,
  model,
  signal,
  viewChild
} from '@angular/core';
import { MessageModule } from 'primeng/message';
import { environment } from '../../../environments/environment';

/** Superficie mínima del API global que expone el script de Turnstile. */
interface TurnstileApi {
  render(elemento: HTMLElement, opciones: Record<string, unknown>): string;
  execute(widgetId: string, opciones?: Record<string, unknown>): void;
  reset(widgetId?: string): void;
  remove(widgetId: string): void;
}

const SCRIPT_URL = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

/** El script se carga una sola vez por sesión, aunque haya varios widgets. */
let cargaScript: Promise<void> | null = null;

function apiTurnstile(): TurnstileApi | undefined {
  return (window as unknown as { turnstile?: TurnstileApi }).turnstile;
}

function cargarScript(): Promise<void> {
  if (cargaScript) {
    return cargaScript;
  }
  cargaScript = new Promise<void>((resolver, rechazar) => {
    if (apiTurnstile()) {
      resolver();
      return;
    }
    const script = document.createElement('script');
    script.src = SCRIPT_URL;
    script.async = true;
    script.defer = true;
    script.onload = () => resolver();
    script.onerror = () => {
      cargaScript = null;
      rechazar(new Error('No se pudo cargar Turnstile.'));
    };
    document.head.appendChild(script);
  });
  return cargaScript;
}

/**
 * Widget de Cloudflare Turnstile (RF-29). Es el gate anti-bot de los flujos
 * públicos: login del panel, validación de teléfono y envío de reporte.
 *
 * Corre **al enviar el formulario, no al cargar la página**: el widget se monta
 * en modo `execute` y no ejecuta nada hasta que el formulario llama a
 * `obtenerToken()`. Con `interaction-only` además no ocupa lugar salvo que
 * Cloudflare decida pedir interacción, que es cuando aparece el desafío.
 *
 * El token es de **un solo uso**: el backend lo canjea contra Cloudflare y
 * queda invalidado, así que cada envío pide uno nuevo.
 */
@Component({
  selector: 'app-turnstile',
  imports: [MessageModule],
  template: `
    <div class="flex flex-column gap-2">
      <div #contenedor></div>
      @if (fallo()) {
        <p-message severity="error" size="small" variant="simple">
          No se pudo cargar la verificación de seguridad. Revisá tu conexión y recargá la página.
        </p-message>
      }
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class Turnstile implements AfterViewInit, OnDestroy {
  /** Token vigente, o `null` si todavía no se resolvió / venció / falló. */
  readonly token = model<string | null>(null);
  /** Etiqueta del flujo, para separar métricas en el panel de Cloudflare. */
  readonly accion = input<string>('');

  readonly fallo = signal(false);

  private readonly contenedor = viewChild.required<ElementRef<HTMLDivElement>>('contenedor');
  private readonly zone = inject(NgZone);

  private widgetId?: string;
  private listo?: Promise<void>;
  /** Resolutor del `obtenerToken()` en curso: lo completa el callback del widget. */
  private pendiente?: { resolver: (token: string) => void; rechazar: (error: Error) => void };

  ngAfterViewInit(): void {
    this.listo = cargarScript()
      .then(() => this.renderizar())
      .catch(() => {
        this.zone.run(() => this.fallo.set(true));
        throw new Error('No se pudo cargar la verificación anti-bot.');
      });
  }

  /**
   * Lanza el desafío y resuelve con el token. Es lo que llama el formulario al
   * enviar: si Cloudflare necesita interacción, el widget aparece en ese momento.
   */
  async obtenerToken(): Promise<string> {
    await this.listo;

    const api = apiTurnstile();
    if (!api || !this.widgetId) {
      throw new Error('La verificación anti-bot no está disponible.');
    }

    // Un token sin usar sigue sirviendo (p. ej. si el envío falló por validación
    // del formulario antes de llegar al backend).
    const actual = this.token();
    if (actual) {
      return actual;
    }

    return new Promise<string>((resolver, rechazar) => {
      this.pendiente = { resolver, rechazar };
      api.execute(this.widgetId!);
    });
  }

  ngOnDestroy(): void {
    if (this.widgetId) {
      apiTurnstile()?.remove(this.widgetId);
      this.widgetId = undefined;
    }
  }

  /** Descarta el token actual. Obligatorio después de un intento fallido. */
  reset(): void {
    this.token.set(null);
    this.pendiente?.rechazar(new Error('Verificación cancelada.'));
    this.pendiente = undefined;
    if (this.widgetId) {
      apiTurnstile()?.reset(this.widgetId);
    }
  }

  private renderizar(): void {
    const api = apiTurnstile();
    if (!api) {
      this.zone.run(() => this.fallo.set(true));
      return;
    }

    // Los callbacks los dispara el script de Cloudflare, fuera de Angular.
    this.widgetId = api.render(this.contenedor().nativeElement, {
      sitekey: environment.turnstileSiteKey,
      action: this.accion() || undefined,
      // El desafio corre cuando el formulario llama a `obtenerToken()`.
      execution: 'execute',
      // Sin interaccion necesaria, el widget no ocupa lugar en el formulario.
      appearance: 'interaction-only',
      callback: (token: string) =>
        this.zone.run(() => {
          this.token.set(token);
          this.pendiente?.resolver(token);
          this.pendiente = undefined;
        }),
      'expired-callback': () => this.zone.run(() => this.token.set(null)),
      'timeout-callback': () =>
        this.zone.run(() => {
          this.token.set(null);
          this.pendiente?.rechazar(new Error('La verificación tardó demasiado. Intentá de nuevo.'));
          this.pendiente = undefined;
        }),
      'error-callback': () =>
        this.zone.run(() => {
          this.token.set(null);
          this.fallo.set(true);
          this.pendiente?.rechazar(new Error('La verificación anti-bot falló.'));
          this.pendiente = undefined;
        })
    });
  }
}
