import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnInit,
  computed,
  inject,
  input,
  output,
  signal,
  viewChild
} from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MessageService } from 'primeng/api';
import { AvatarModule } from 'primeng/avatar';
import { ButtonModule } from 'primeng/button';
import { ChipModule } from 'primeng/chip';
import { FileUpload, FileUploadModule } from 'primeng/fileupload';
import { MessageModule } from 'primeng/message';
import { SkeletonModule } from 'primeng/skeleton';
import { TextareaModule } from 'primeng/textarea';
import { TooltipModule } from 'primeng/tooltip';
import { AlertaSeguimientoService } from '../../../../core/services/alerta-seguimiento.service';
import { AuthService } from '../../../../core/services/auth.service';
import { ApiResponse } from '../../../../core/models/api-response.model';
import { ComentarioAlerta, tamanoLegible } from '../../../../core/models/alerta-seguimiento.model';
import { RECURSO, permiso } from '../../../../core/models/permiso.model';
import { inicialesDeNombreCompleto } from '../../../../shared/iniciales';
import { AdjuntoVista } from '../adjunto-vista/adjunto-vista';

/** Formatos y tope que acepta el backend; acá son solo ayuda al usuario. */
const ADJUNTO_ACCEPT =
  'image/jpeg,image/png,image/webp,application/pdf,.pdf,.docx,.xlsx,' +
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document,' +
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const ADJUNTO_MAX_BYTES = 10 * 1024 * 1024;
const ADJUNTO_MAX_CANTIDAD = 5;

/** Un comentario junto con lo que hace falta para pintar su burbuja. */
interface ComentarioVista {
  comentario: ComentarioAlerta;
  /** Lo escribió la persona que está mirando: la burbuja va a la derecha. */
  propio: boolean;
  /** Cuerpo partido en líneas: así se respetan los saltos sin usar innerHTML. */
  lineas: string[];
  /** Separador de día cuando cambia la fecha respecto del comentario anterior. */
  encabezadoDia: string | null;
}

/**
 * Hilo de seguimiento de una alerta, con forma de chat: una burbuja por
 * comentario, con el avatar de quien lo escribió, la fecha y hora, y sus
 * archivos adjuntos.
 *
 * El backend devuelve el hilo de lo más nuevo a lo más viejo (así "cargar más"
 * funciona en un hilo que crece); acá se invierte para leerlo como una
 * conversación.
 */
@Component({
  selector: 'app-seguimiento-comentarios',
  imports: [
    DatePipe,
    ReactiveFormsModule,
    AvatarModule,
    ButtonModule,
    ChipModule,
    FileUploadModule,
    MessageModule,
    SkeletonModule,
    TextareaModule,
    TooltipModule,
    AdjuntoVista
  ],
  templateUrl: './seguimiento-comentarios.html',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class SeguimientoComentarios implements OnInit {
  private readonly service = inject(AlertaSeguimientoService);
  private readonly authService = inject(AuthService);
  private readonly messageService = inject(MessageService);
  private readonly fb = inject(FormBuilder);

  readonly alertaId = input.required<number>();

  /** Avisa al modal para que actualice el contador de la pestaña. */
  readonly comentarioAgregado = output<void>();

  protected readonly comentarios = signal<ComentarioAlerta[]>([]);
  protected readonly total = signal(0);
  protected readonly cargando = signal(false);
  protected readonly cargandoMas = signal(false);
  protected readonly error = signal(false);
  protected readonly enviando = signal(false);
  protected readonly archivos = signal<File[]>([]);

  protected readonly accept = ADJUNTO_ACCEPT;
  protected readonly maxBytes = ADJUNTO_MAX_BYTES;
  protected readonly maxCantidad = ADJUNTO_MAX_CANTIDAD;
  protected readonly skeletons = [1, 2, 3];

  private readonly pageSize = 20;
  private page = 1;

  private readonly feed = viewChild<ElementRef<HTMLElement>>('feed');
  private readonly uploader = viewChild<FileUpload>('uploader');

  protected readonly form = this.fb.nonNullable.group({
    cuerpo: ['', [Validators.required, Validators.maxLength(2000)]]
  });

  protected readonly puedeEscribir = computed(() =>
    this.authService.tienePermiso(permiso(RECURSO.ALERTA, 'seguimiento'))
  );

  /** Quedan comentarios más viejos por traer. */
  protected readonly hayMas = computed(() => this.comentarios().length < this.total());

  /**
   * El hilo en orden cronológico, con el separador de día y la marca de autoría
   * ya resueltos: el template solo pinta.
   */
  protected readonly vista = computed<ComentarioVista[]>(() => {
    const usuarioId = this.authService.usuarioActual()?.usuarioId ?? null;
    const cronologico = [...this.comentarios()].reverse();

    let diaAnterior = '';
    return cronologico.map((comentario) => {
      const dia = comentario.fechaCreacion.slice(0, 10);
      const encabezadoDia = dia === diaAnterior ? null : etiquetaDia(comentario.fechaCreacion);
      diaAnterior = dia;

      return {
        comentario,
        propio: comentario.autor.id === usuarioId,
        lineas: comentario.cuerpo.split('\n'),
        encabezadoDia
      };
    });
  });

  /**
   * En `ngOnInit` y no en el constructor: un `input.required` todavía no tiene
   * valor cuando se construye el componente. Tampoco hace falta un `effect`,
   * porque con el `[lazy]` del `p-tabs` el componente nace al abrir la pestaña
   * y muere al cerrar el diálogo: esto ya es el "cuando se abre".
   */
  ngOnInit(): void {
    this.cargar();
  }

  protected iniciales(nombreCompleto: string): string {
    return inicialesDeNombreCompleto(nombreCompleto);
  }

  protected tamano(bytes: number): string {
    return tamanoLegible(bytes);
  }

  protected reintentar(): void {
    this.page = 1;
    this.cargar();
  }

  /** Archivos elegidos en el selector, antes de enviarse con el comentario. */
  protected alSeleccionar(event: { currentFiles: File[] }): void {
    this.archivos.set([...event.currentFiles].slice(0, ADJUNTO_MAX_CANTIDAD));
  }

  protected quitarArchivo(indice: number): void {
    const restantes = this.archivos().filter((_, i) => i !== indice);
    this.archivos.set(restantes);
    // El selector mantiene su propia cola: hay que limpiarla para que no vuelva
    // a mandar lo que se acaba de quitar.
    this.uploader()?.clear();
    restantes.forEach((archivo) => this.uploader()?.files.push(archivo));
  }

  protected enviar(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.enviando.set(true);
    const cuerpo = this.form.getRawValue().cuerpo.trim();

    this.service.crearComentario(this.alertaId(), cuerpo, this.archivos()).subscribe({
      next: (res) => {
        this.enviando.set(false);
        if (res.data) {
          // Se agrega al principio porque la lista está en orden descendente.
          this.comentarios.update((actuales) => [res.data!, ...actuales]);
          this.total.update((valor) => valor + 1);
        }
        this.limpiarRedaccion();
        this.comentarioAgregado.emit();
        this.irAlFinal();
      },
      error: (err) => {
        this.enviando.set(false);
        const mensaje =
          (err.error as ApiResponse<null>)?.message ?? 'No se pudo agregar el comentario.';
        this.messageService.add({ severity: 'error', summary: 'Error', detail: mensaje });
      }
    });
  }

  protected cargarMas(): void {
    this.page += 1;
    this.cargandoMas.set(true);
    this.service.listarComentarios(this.alertaId(), this.page, this.pageSize).subscribe({
      next: (res) => {
        this.cargandoMas.set(false);
        this.comentarios.update((actuales) => [...actuales, ...(res.data ?? [])]);
      },
      error: () => {
        this.cargandoMas.set(false);
        this.page -= 1;
        this.messageService.add({
          severity: 'error',
          summary: 'Error',
          detail: 'No se pudieron cargar más comentarios.'
        });
      }
    });
  }

  private limpiarRedaccion(): void {
    // Imperativo y después de una respuesta OK: nunca desde un `effect`, que
    // terminaría reseteando el formulario encima de lo que se está escribiendo.
    this.form.reset({ cuerpo: '' });
    this.archivos.set([]);
    this.uploader()?.clear();
  }

  private irAlFinal(): void {
    // En el próximo tick: el comentario nuevo todavía no está en el DOM.
    setTimeout(() => {
      const elemento = this.feed()?.nativeElement;
      if (elemento) {
        elemento.scrollTop = elemento.scrollHeight;
      }
    });
  }

  private cargar(): void {
    this.cargando.set(true);
    this.error.set(false);
    this.service.listarComentarios(this.alertaId(), this.page, this.pageSize).subscribe({
      next: (res) => {
        this.cargando.set(false);
        this.comentarios.set(res.data ?? []);
        this.total.set(res.meta?.total ?? res.data?.length ?? 0);
        this.irAlFinal();
      },
      error: () => {
        this.cargando.set(false);
        this.error.set(true);
      }
    });
  }
}

/** "Hoy" / "Ayer" / "12/09/26", como separador de día del hilo. */
function etiquetaDia(fechaIso: string): string {
  const fecha = new Date(fechaIso);
  const hoy = new Date();
  const mismoDia = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

  if (mismoDia(fecha, hoy)) {
    return 'Hoy';
  }

  const ayer = new Date(hoy);
  ayer.setDate(hoy.getDate() - 1);
  if (mismoDia(fecha, ayer)) {
    return 'Ayer';
  }

  return fecha.toLocaleDateString('es-PY', { day: '2-digit', month: '2-digit', year: '2-digit' });
}
