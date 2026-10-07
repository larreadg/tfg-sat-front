import { ChangeDetectionStrategy, Component, computed, effect, inject, input, model, signal } from '@angular/core';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { MessageModule } from 'primeng/message';
import { SkeletonModule } from 'primeng/skeleton';
import { TagModule } from 'primeng/tag';
import { TooltipModule } from 'primeng/tooltip';
import { EncuestasAdminService } from '../../../core/services/encuestas-admin.service';
import { ApiResponse } from '../../../core/models/api-response.model';
import { EncuestaVersionDetalle, TipoPregunta } from '../../../core/models/encuesta-admin.model';

/**
 * Vista de una versión del cuestionario, en SOLO LECTURA: qué se le pregunta al
 * ciudadano y cuántas fotos exige. Editar y crear versiones se hace en el
 * editor a pantalla completa, sobre una copia local.
 */
@Component({
  selector: 'app-encuesta-detalle',
  imports: [ButtonModule, DialogModule, MessageModule, SkeletonModule, TagModule, TooltipModule],
  templateUrl: './encuesta-detalle.html',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class EncuestaDetalle {
  private readonly service = inject(EncuestasAdminService);
  private readonly messageService = inject(MessageService);

  readonly encuestaId = input<number | null>(null);
  readonly visible = model<boolean>(false);

  readonly detalle = signal<EncuestaVersionDetalle | null>(null);
  readonly loading = signal(false);
  readonly error = signal(false);

  /** El cuestionario sin el paso de fotos, que se muestra aparte. */
  readonly preguntasCuestionario = computed(() =>
    (this.detalle()?.preguntas ?? []).filter((p) => p.tipo !== 'FOTO')
  );

  readonly preguntaFoto = computed(() => (this.detalle()?.preguntas ?? []).find((p) => p.tipo === 'FOTO') ?? null);

  constructor() {
    effect(() => {
      const id = this.encuestaId();
      if (this.visible() && id != null) {
        this.cargar(id);
      }
    });
  }

  cerrar(): void {
    this.visible.set(false);
  }

  reintentar(): void {
    const id = this.encuestaId();
    if (id != null) {
      this.cargar(id);
    }
  }

  etiquetaTipo(tipo: TipoPregunta): string {
    if (tipo === 'FOTO') {
      return 'Fotos';
    }
    return tipo === 'ELECCION_MULTIPLE' ? 'Varias respuestas' : 'Una sola respuesta';
  }

  private cargar(id: number): void {
    this.loading.set(true);
    this.error.set(false);
    this.service.obtener(id).subscribe({
      next: (res) => {
        this.detalle.set(res.data ?? null);
        this.loading.set(false);
      },
      error: (err) => {
        this.loading.set(false);
        this.error.set(true);
        this.detalle.set(null);
        const mensaje = (err.error as ApiResponse<null>)?.message ?? 'No se pudo cargar la versión.';
        this.messageService.add({ severity: 'error', summary: 'Error', detail: mensaje });
      }
    });
  }
}
