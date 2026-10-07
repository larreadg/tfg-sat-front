import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';
import { SkeletonModule } from 'primeng/skeleton';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { TooltipModule } from 'primeng/tooltip';
import { EncuestasAdminService } from '../../core/services/encuestas-admin.service';
import { AuthService } from '../../core/services/auth.service';
import { ApiResponse } from '../../core/models/api-response.model';
import { EncuestaVersionItem } from '../../core/models/encuesta-admin.model';
import { permiso, RECURSO } from '../../core/models/permiso.model';
import { EncuestaDetalle } from './encuesta-detalle/encuesta-detalle';
import { EncuestaEditor, ModoEditor } from './encuesta-editor/encuesta-editor';

/**
 * Versiones del cuestionario. Cada versión es un snapshot: la que está activa es
 * la que responden los ciudadanos, y las que ya recibieron reportes quedan
 * congeladas. Para cambiar algo se crea una versión nueva a partir de otra.
 */
@Component({
  selector: 'app-encuestas',
  imports: [
    ButtonModule,
    CardModule,
    SkeletonModule,
    TableModule,
    TagModule,
    TooltipModule,
    EncuestaDetalle,
    EncuestaEditor
  ],
  templateUrl: './encuestas.html',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class Encuestas {
  private readonly service = inject(EncuestasAdminService);
  private readonly authService = inject(AuthService);
  private readonly messageService = inject(MessageService);

  readonly versiones = signal<EncuestaVersionItem[]>([]);
  readonly loading = signal(false);
  readonly error = signal(false);
  readonly trabajando = signal(false);

  readonly puedeCrear = this.authService.tienePermiso(permiso(RECURSO.ENCUESTA, 'crear'));
  readonly puedeEditar = this.authService.tienePermiso(permiso(RECURSO.ENCUESTA, 'editar'));
  readonly puedeEliminar = this.authService.tienePermiso(permiso(RECURSO.ENCUESTA, 'eliminar'));

  readonly detalleVisible = signal(false);
  readonly detalleId = signal<number | null>(null);

  // Editor a pantalla completa: trabaja sobre una copia local y solo persiste
  // al confirmar, asi abrirlo no deja borradores a medio hacer.
  readonly editorVisible = signal(false);
  readonly editorOrigen = signal<EncuestaVersionItem | null>(null);
  readonly editorModo = signal<ModoEditor>('crear');

  readonly filasSkeleton = Array.from({ length: 3 });

  constructor() {
    this.cargar();
  }

  reintentar(): void {
    this.cargar();
  }

  abrirDetalle(version: EncuestaVersionItem): void {
    this.detalleId.set(version.id);
    this.detalleVisible.set(true);
  }

  /**
   * Abre el editor con una copia local de la versión. No crea nada: la versión
   * se persiste recién cuando el usuario confirma dentro del editor.
   */
  nuevaVersion(version: EncuestaVersionItem): void {
    this.editorOrigen.set(version);
    this.editorModo.set('crear');
    this.editorVisible.set(true);
  }

  /** Abre el editor sobre un borrador existente para seguir ajustándolo. */
  editarBorrador(version: EncuestaVersionItem): void {
    this.editorOrigen.set(version);
    this.editorModo.set('editar');
    this.editorVisible.set(true);
  }

  eliminar(version: EncuestaVersionItem): void {
    this.trabajando.set(true);
    this.service.eliminar(version.id).subscribe({
      next: () => {
        this.trabajando.set(false);
        this.messageService.add({
          severity: 'success',
          summary: 'Versión eliminada',
          detail: `Se eliminó el borrador de la versión ${version.version}.`
        });
        this.cargar();
      },
      error: (err) => this.fallo(err, 'No se pudo eliminar la versión.')
    });
  }

  activar(version: EncuestaVersionItem): void {
    this.trabajando.set(true);
    this.service.actualizar(version.id, { activo: true }).subscribe({
      next: () => {
        this.trabajando.set(false);
        this.messageService.add({
          severity: 'success',
          summary: 'Versión activada',
          detail: `Los reportes nuevos van a usar la versión ${version.version}.`
        });
        this.cargar();
      },
      error: (err) => this.fallo(err, 'No se pudo activar la versión.')
    });
  }

  private cargar(): void {
    this.loading.set(true);
    this.error.set(false);
    this.service.listar().subscribe({
      next: (res) => {
        this.versiones.set(res.data ?? []);
        this.loading.set(false);
      },
      error: (err) => {
        this.loading.set(false);
        this.error.set(true);
        this.versiones.set([]);
        const mensaje = (err.error as ApiResponse<null>)?.message ?? 'No se pudieron cargar las encuestas.';
        this.messageService.add({ severity: 'error', summary: 'Error', detail: mensaje });
      }
    });
  }

  private fallo(err: unknown, porDefecto: string): void {
    this.trabajando.set(false);
    const mensaje = ((err as { error?: ApiResponse<null> })?.error)?.message ?? porDefecto;
    this.messageService.add({ severity: 'error', summary: 'Error', detail: mensaje });
  }
}
