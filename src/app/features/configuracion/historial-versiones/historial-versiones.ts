import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { MessageModule } from 'primeng/message';
import { PaginatorModule, PaginatorState } from 'primeng/paginator';
import { SkeletonModule } from 'primeng/skeleton';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { TooltipModule } from 'primeng/tooltip';
import { AuthService } from '../../../core/services/auth.service';
import { ConfiguracionService } from '../../../core/services/configuracion.service';
import { ConfiguracionBorradorService } from '../../../core/services/configuracion-borrador.service';
import { ApiResponse } from '../../../core/models/api-response.model';
import { ConfiguracionCriticidad } from '../../../core/models/configuracion.model';
import { permiso, RECURSO } from '../../../core/models/permiso.model';
import { VersionDetalle } from './version-detalle/version-detalle';

const TAMANO_PAGINA = 20;

/**
 * Historial de versiones del motor de criticidad (ERS §4.4). Solo lectura.
 *
 * No existe "reactivar una versión vieja", y es a propósito: cada
 * `DesgloseFactores` guarda el `configId` con el que se calculó, así que el
 * historial tiene que avanzar siempre hacia adelante. Lo que sí se puede es
 * tomar una versión como plantilla ("usar como base") y guardar la siguiente.
 */
@Component({
  selector: 'app-configuracion-historial',
  imports: [
    DatePipe,
    DecimalPipe,
    ButtonModule,
    MessageModule,
    PaginatorModule,
    SkeletonModule,
    TableModule,
    TagModule,
    TooltipModule,
    VersionDetalle
  ],
  templateUrl: './historial-versiones.html',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class HistorialVersiones {
  private readonly service = inject(ConfiguracionService);
  private readonly borrador = inject(ConfiguracionBorradorService);
  private readonly authService = inject(AuthService);
  private readonly messageService = inject(MessageService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  readonly versiones = signal<ConfiguracionCriticidad[]>([]);
  readonly loading = signal(false);
  readonly error = signal(false);
  readonly total = signal(0);
  readonly first = signal(0);
  readonly pageSize = signal(TAMANO_PAGINA);

  /** Sin `configuracion_criticidad.editar` el historial queda de solo lectura. */
  readonly puedeEditar = this.authService.tienePermiso(permiso(RECURSO.CONFIGURACION_CRITICIDAD, 'editar'));

  readonly detalleVisible = signal(false);
  readonly versionSeleccionada = signal<ConfiguracionCriticidad | null>(null);

  readonly filasSkeleton = Array.from({ length: 5 });

  constructor() {
    this.cargar();
  }

  onPage(evento: PaginatorState): void {
    this.first.set(evento.first ?? 0);
    this.pageSize.set(evento.rows ?? TAMANO_PAGINA);
    this.cargar();
  }

  reintentar(): void {
    this.cargar();
  }

  verDetalle(version: ConfiguracionCriticidad): void {
    this.versionSeleccionada.set(version);
    this.detalleVisible.set(true);
  }

  /**
   * Deja la versión en el buzón compartido y salta al tab del Motor, que la
   * levanta al iniciarse. No modifica nada en el servidor: recién guardando
   * desde el formulario se crea la versión siguiente.
   */
  usarComoBase(version: ConfiguracionCriticidad): void {
    this.borrador.proponerBase(version);

    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { tab: 'motor' },
      queryParamsHandling: 'merge'
    });

    this.messageService.add({
      severity: 'info',
      summary: `Versión ${version.version} cargada`,
      detail: 'Cargamos estos valores en el motor de criticidad. Al guardar se crea una versión nueva.'
    });
  }

  /** Resumen de pesos para la grilla: "0.25 / 0.25 / 0.20 / 0.20 / 0.10". */
  resumenPesos(version: ConfiguracionCriticidad): string {
    const { f1, f2, f3, f4, f5 } = version.pesos;
    return [f1, f2, f3, f4, f5].map((peso) => peso.toFixed(2)).join(' / ');
  }

  private cargar(): void {
    this.loading.set(true);
    this.error.set(false);

    this.service
      .listarVersiones({
        page: Math.floor(this.first() / this.pageSize()) + 1,
        limit: this.pageSize()
      })
      .subscribe({
        next: (res) => {
          this.versiones.set(res.data ?? []);
          this.total.set(res.meta?.total ?? 0);
          this.loading.set(false);
        },
        error: (err: unknown) => {
          this.loading.set(false);
          this.error.set(true);
          this.versiones.set([]);
          const mensaje =
            (err as { error?: ApiResponse<null> })?.error?.message ??
            'No se pudo cargar el historial de versiones.';
          this.messageService.add({ severity: 'error', summary: 'Error', detail: mensaje });
        }
      });
  }
}
