import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked
} from '@angular/core';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { ChipModule } from 'primeng/chip';
import { ImageModule } from 'primeng/image';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import { TooltipModule } from 'primeng/tooltip';
import { AlertaSeguimientoService } from '../../../../core/services/alerta-seguimiento.service';
import {
  AdjuntoAlerta,
  iconoAdjunto,
  tamanoLegible
} from '../../../../core/models/alerta-seguimiento.model';

/**
 * Un archivo adjunto de una alerta. Si es imagen, muestra la miniatura con
 * preview; si no, un chip con el icono del tipo y el botón de descarga.
 *
 * El archivo no se puede pedir con una URL directa: vive detrás de un endpoint
 * autenticado y el token viaja en una cabecera, que ni `<img src>` ni
 * `window.open` envían. Se descarga como blob y se expone con
 * `URL.createObjectURL`, liberándolo siempre al destruirse el componente: cada
 * `blob:` retiene el archivo en memoria hasta que se revoca.
 */
@Component({
  selector: 'app-adjunto-vista',
  imports: [ButtonModule, ChipModule, ImageModule, ProgressSpinnerModule, TooltipModule],
  templateUrl: './adjunto-vista.html',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AdjuntoVista {
  private readonly service = inject(AlertaSeguimientoService);
  private readonly messageService = inject(MessageService);
  private readonly destroyRef = inject(DestroyRef);

  readonly adjunto = input.required<AdjuntoAlerta>();

  /** Muestra el botón de eliminar (solo adjuntos sueltos y con permiso). */
  readonly conEliminar = input(false);

  /**
   * Versión mínima para el hilo de comentarios: la imagen sola, o un chip de una
   * línea si es un documento. Sin la ficha con nombre, peso y botones, que en una
   * burbuja ocupaba más que el propio comentario.
   */
  readonly compacto = input(false);

  readonly eliminar = output<AdjuntoAlerta>();

  /** `blob:` de la miniatura; null mientras carga o si no es imagen. */
  protected readonly objectUrl = signal<string | null>(null);
  protected readonly cargando = signal(false);
  protected readonly fallo = signal(false);
  protected readonly descargando = signal(false);

  protected readonly icono = computed(() => iconoAdjunto(this.adjunto().tipoMime));
  protected readonly tamano = computed(() => tamanoLegible(this.adjunto().tamanoBytes));

  constructor() {
    // Solo las imágenes se traen para mostrarlas; un PDF o un xlsx se bajan
    // recién cuando la persona lo pide. El cuerpo va en `untracked` porque
    // escribe los mismos signals que se leerían al re-ejecutarse.
    effect(() => {
      const adjunto = this.adjunto();
      untracked(() => {
        this.revocar();
        if (adjunto.esImagen) {
          this.cargarMiniatura(adjunto.id);
        }
      });
    });

    this.destroyRef.onDestroy(() => this.revocar());
  }

  /**
   * Descarga el archivo y lo guarda con su nombre original. Se arma un `<a>` al
   * vuelo porque el enlace directo no lleva el token de la sesión.
   */
  descargar(): void {
    if (this.descargando()) {
      return;
    }
    const adjunto = this.adjunto();
    this.descargando.set(true);
    this.service.descargarAdjunto(adjunto.id, true).subscribe({
      next: (blob) => {
        this.descargando.set(false);
        const url = URL.createObjectURL(blob);
        const enlace = document.createElement('a');
        enlace.href = url;
        enlace.download = adjunto.nombreOriginal;
        enlace.click();
        // El navegador ya tomó el blob; liberarlo en el próximo tick evita
        // quedarse con el archivo entero en memoria.
        setTimeout(() => URL.revokeObjectURL(url));
      },
      error: () => {
        this.descargando.set(false);
        this.messageService.add({
          severity: 'error',
          summary: 'Error',
          detail: `No se pudo descargar "${adjunto.nombreOriginal}".`
        });
      }
    });
  }

  private cargarMiniatura(adjuntoId: number): void {
    this.cargando.set(true);
    this.fallo.set(false);
    this.service.descargarAdjunto(adjuntoId).subscribe({
      next: (blob) => {
        this.cargando.set(false);
        this.objectUrl.set(URL.createObjectURL(blob));
      },
      error: () => {
        this.cargando.set(false);
        this.fallo.set(true);
      }
    });
  }

  private revocar(): void {
    const url = this.objectUrl();
    if (url) {
      URL.revokeObjectURL(url);
      this.objectUrl.set(null);
    }
  }
}
