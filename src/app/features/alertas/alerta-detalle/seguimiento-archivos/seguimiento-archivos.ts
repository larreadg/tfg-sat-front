import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  input,
  output,
  signal,
  viewChild
} from '@angular/core';
import { ConfirmationService, MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { FileUpload, FileUploadModule } from 'primeng/fileupload';
import { MessageModule } from 'primeng/message';
import { SkeletonModule } from 'primeng/skeleton';
import { TagModule } from 'primeng/tag';
import { AlertaSeguimientoService } from '../../../../core/services/alerta-seguimiento.service';
import { AuthService } from '../../../../core/services/auth.service';
import { ApiResponse } from '../../../../core/models/api-response.model';
import { AdjuntoAlerta } from '../../../../core/models/alerta-seguimiento.model';
import { RECURSO, permiso } from '../../../../core/models/permiso.model';
import { escaparHtml } from '../../../../shared/escapar-html';
import { AdjuntoVista } from '../adjunto-vista/adjunto-vista';

const ADJUNTO_ACCEPT =
  'image/jpeg,image/png,image/webp,application/pdf,.pdf,.docx,.xlsx,' +
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document,' +
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const ADJUNTO_MAX_BYTES = 10 * 1024 * 1024;
const ADJUNTO_MAX_CANTIDAD = 5;

/**
 * Todos los archivos de la alerta en un solo lugar, vengan de un comentario o
 * se hayan subido directo acá. Que un adjunto del hilo también aparezca en esta
 * lista es el objetivo del modelo: no hay que recordar en qué comentario estaba.
 *
 * Los que vinieron en un comentario no se pueden borrar (el hilo es bitácora
 * inmutable); los sueltos sí, y el backend además exige ser el autor o tener
 * `alerta.editar`.
 */
@Component({
  selector: 'app-seguimiento-archivos',
  imports: [
    ButtonModule,
    ConfirmDialogModule,
    FileUploadModule,
    MessageModule,
    SkeletonModule,
    TagModule,
    AdjuntoVista
  ],
  providers: [ConfirmationService],
  templateUrl: './seguimiento-archivos.html',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class SeguimientoArchivos implements OnInit {
  private readonly service = inject(AlertaSeguimientoService);
  private readonly authService = inject(AuthService);
  private readonly messageService = inject(MessageService);
  private readonly confirmationService = inject(ConfirmationService);

  readonly alertaId = input.required<number>();

  /** Avisa al modal para que actualice el contador de la pestaña. */
  readonly adjuntosCambiaron = output<void>();

  protected readonly adjuntos = signal<AdjuntoAlerta[]>([]);
  protected readonly cargando = signal(false);
  protected readonly error = signal(false);
  protected readonly subiendo = signal(false);

  protected readonly accept = ADJUNTO_ACCEPT;
  protected readonly maxBytes = ADJUNTO_MAX_BYTES;
  protected readonly maxCantidad = ADJUNTO_MAX_CANTIDAD;
  protected readonly skeletons = [1, 2, 3, 4];

  private readonly uploader = viewChild<FileUpload>('uploader');

  protected readonly puedeEscribir = computed(() =>
    this.authService.tienePermiso(permiso(RECURSO.ALERTA, 'seguimiento'))
  );

  /** Los que llegaron en un comentario: se marcan y no se borran desde acá. */
  protected readonly deComentario = computed(
    () => this.adjuntos().filter((a) => a.comentarioId !== null).length
  );

  /** Ver la nota de `SeguimientoComentarios`: el input no existe en el constructor. */
  ngOnInit(): void {
    this.cargar();
  }

  protected reintentar(): void {
    this.cargar();
  }

  /**
   * Sube en cuanto se eligen los archivos: en esta pestaña no hay nada más que
   * completar, así que un segundo botón de confirmación sería un paso de más.
   */
  protected subir(event: { files: File[] }): void {
    const archivos = event.files.slice(0, ADJUNTO_MAX_CANTIDAD);
    if (archivos.length === 0) {
      return;
    }

    this.subiendo.set(true);
    this.service.subirAdjuntos(this.alertaId(), archivos).subscribe({
      next: (res) => {
        this.subiendo.set(false);
        this.uploader()?.clear();
        this.adjuntos.update((actuales) => [...(res.data ?? []), ...actuales]);
        this.adjuntosCambiaron.emit();
        this.messageService.add({
          severity: 'success',
          summary: 'Listo',
          detail: archivos.length === 1 ? 'Archivo adjuntado.' : `${archivos.length} archivos adjuntados.`
        });
      },
      error: (err) => {
        this.subiendo.set(false);
        this.uploader()?.clear();
        const mensaje = (err.error as ApiResponse<null>)?.message ?? 'No se pudieron subir los archivos.';
        this.messageService.add({ severity: 'error', summary: 'Error', detail: mensaje });
      }
    });
  }

  protected confirmarEliminar(adjunto: AdjuntoAlerta): void {
    this.confirmationService.confirm({
      header: 'Eliminar archivo',
      // `escaparHtml` porque p-confirmdialog renderiza el mensaje con innerHTML
      // y el nombre del archivo lo eligió una persona.
      message: `¿Eliminar "${escaparHtml(adjunto.nombreOriginal)}"? Esta acción no se puede deshacer.`,
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'Eliminar',
      rejectLabel: 'Cancelar',
      acceptButtonStyleClass: 'p-button-danger',
      accept: () => this.eliminar(adjunto)
    });
  }

  private eliminar(adjunto: AdjuntoAlerta): void {
    this.service.eliminarAdjunto(adjunto.id).subscribe({
      next: () => {
        this.adjuntos.update((actuales) => actuales.filter((a) => a.id !== adjunto.id));
        this.adjuntosCambiaron.emit();
        this.messageService.add({ severity: 'success', summary: 'Listo', detail: 'Archivo eliminado.' });
      },
      error: (err) => {
        const mensaje = (err.error as ApiResponse<null>)?.message ?? 'No se pudo eliminar el archivo.';
        this.messageService.add({ severity: 'error', summary: 'Error', detail: mensaje });
      }
    });
  }

  private cargar(): void {
    this.cargando.set(true);
    this.error.set(false);
    this.service.listarAdjuntos(this.alertaId()).subscribe({
      next: (res) => {
        this.cargando.set(false);
        this.adjuntos.set(res.data ?? []);
      },
      error: () => {
        this.cargando.set(false);
        this.error.set(true);
      }
    });
  }
}
