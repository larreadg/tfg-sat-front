import { ChangeDetectionStrategy, Component, effect, inject, input, model, signal, untracked } from '@angular/core';
import { DatePipe } from '@angular/common';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { MessageModule } from 'primeng/message';
import { PaginatorModule, PaginatorState } from 'primeng/paginator';
import { SkeletonModule } from 'primeng/skeleton';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { TooltipModule } from 'primeng/tooltip';
import { WebhooksService } from '../../../core/services/webhooks.service';
import { ApiResponse } from '../../../core/models/api-response.model';
import { EntregaWebhook, ReglaWebhook } from '../../../core/models/webhook.model';

const TAMANO_PAGINA = 10;

/**
 * Bitácora de entregas de una regla. Es lo que convierte la pantalla en algo
 * diagnosticable: sin esto, una regla que "no anda" obliga a entrar al log del
 * servidor. Se muestran tanto los éxitos como los fallos, y la carga útil exacta
 * que se envió sirve de evidencia para reproducir el caso.
 */
@Component({
  selector: 'app-webhook-entregas',
  imports: [
    DatePipe,
    ButtonModule,
    DialogModule,
    MessageModule,
    PaginatorModule,
    SkeletonModule,
    TableModule,
    TagModule,
    TooltipModule
  ],
  templateUrl: './entregas.html',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class WebhookEntregas {
  private readonly service = inject(WebhooksService);
  private readonly messageService = inject(MessageService);

  readonly visible = model.required<boolean>();
  readonly regla = input<ReglaWebhook | null>(null);

  readonly entregas = signal<EntregaWebhook[]>([]);
  readonly loading = signal(false);
  readonly total = signal(0);
  readonly first = signal(0);

  /** Id de la entrega cuya carga útil está expandida. */
  readonly expandida = signal<number | null>(null);

  readonly pageSize = TAMANO_PAGINA;
  readonly filasSkeleton = Array.from({ length: 4 });

  /** Para cargar solo en la transición cerrado -> abierto. */
  private estabaAbierto = false;

  constructor() {
    // `untracked` + guarda de transición por el mismo motivo que en `regla-form`:
    // `cargar()` escribe `entregas`/`loading`/`total` y lee `first`, que el propio
    // effect acaba de setear. Sin aislarlo, el effect queda sucio y vuelve a pedir
    // la bitácora en cada ciclo de render.
    effect(() => {
      const abierto = this.visible();
      const regla = this.regla();

      if (abierto && !this.estabaAbierto && regla) {
        untracked(() => {
          this.first.set(0);
          this.expandida.set(null);
          this.cargar(regla.id);
        });
      }
      this.estabaAbierto = abierto;
    });
  }

  onPage(evento: PaginatorState): void {
    this.first.set(evento.first ?? 0);
    const regla = this.regla();
    if (regla) {
      this.cargar(regla.id);
    }
  }

  recargar(): void {
    const regla = this.regla();
    if (regla) {
      this.cargar(regla.id);
    }
  }

  alternar(id: number): void {
    this.expandida.update((actual) => (actual === id ? null : id));
  }

  /** La carga útil formateada, para mostrarla legible en el detalle. */
  cargaUtilTexto(entrega: EntregaWebhook): string {
    try {
      return JSON.stringify(entrega.cargaUtil, null, 2);
    } catch {
      return String(entrega.cargaUtil);
    }
  }

  private cargar(reglaId: number): void {
    this.loading.set(true);
    this.service
      .listarEntregas(reglaId, { page: Math.floor(this.first() / TAMANO_PAGINA) + 1, limit: TAMANO_PAGINA })
      .subscribe({
        next: (res) => {
          this.entregas.set(res.data ?? []);
          this.total.set(res.meta?.total ?? 0);
          this.loading.set(false);
        },
        error: (err: unknown) => {
          this.loading.set(false);
          this.entregas.set([]);
          const mensaje =
            (err as { error?: ApiResponse<null> })?.error?.message ?? 'No se pudo cargar la bitácora.';
          this.messageService.add({ severity: 'error', summary: 'Error', detail: mensaje });
        }
      });
  }
}
