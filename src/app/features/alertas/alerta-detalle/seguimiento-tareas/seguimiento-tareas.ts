import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  input,
  output,
  signal
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ConfirmationService, MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { CheckboxModule } from 'primeng/checkbox';
import { ChipModule } from 'primeng/chip';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { DatePickerModule } from 'primeng/datepicker';
import { InputTextModule } from 'primeng/inputtext';
import { MessageModule } from 'primeng/message';
import { ProgressBarModule } from 'primeng/progressbar';
import { SelectModule } from 'primeng/select';
import { SkeletonModule } from 'primeng/skeleton';
import { TagModule } from 'primeng/tag';
import { TooltipModule } from 'primeng/tooltip';
import { AlertaSeguimientoService } from '../../../../core/services/alerta-seguimiento.service';
import { AuthService } from '../../../../core/services/auth.service';
import { ApiResponse } from '../../../../core/models/api-response.model';
import {
  ResponsableTarea,
  ResumenTareas,
  TareaAlerta
} from '../../../../core/models/alerta-seguimiento.model';
import { RECURSO, permiso } from '../../../../core/models/permiso.model';
import { escaparHtml } from '../../../../shared/escapar-html';

/**
 * Checklist de la alerta: una lista plana de pendientes con responsable y
 * vencimiento opcionales, y la barra de progreso arriba.
 *
 * El progreso y la marca de vencida los calcula el backend con un criterio
 * único, así que el contador y los tags rojos nunca se contradicen.
 */
@Component({
  selector: 'app-seguimiento-tareas',
  imports: [
    FormsModule,
    ButtonModule,
    CheckboxModule,
    ChipModule,
    ConfirmDialogModule,
    DatePickerModule,
    InputTextModule,
    MessageModule,
    ProgressBarModule,
    SelectModule,
    SkeletonModule,
    TagModule,
    TooltipModule
  ],
  providers: [ConfirmationService],
  templateUrl: './seguimiento-tareas.html',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class SeguimientoTareas implements OnInit {
  private readonly service = inject(AlertaSeguimientoService);
  private readonly authService = inject(AuthService);
  private readonly messageService = inject(MessageService);
  private readonly confirmationService = inject(ConfirmationService);

  readonly alertaId = input.required<number>();

  /** Avisa al modal para que actualice el contador de la pestaña. */
  readonly tareasCambiaron = output<void>();

  protected readonly tareas = signal<TareaAlerta[]>([]);
  protected readonly resumen = signal<ResumenTareas>({
    total: 0,
    completadas: 0,
    vencidas: 0,
    porcentaje: 0
  });
  protected readonly responsables = signal<ResponsableTarea[]>([]);
  protected readonly cargando = signal(false);
  protected readonly error = signal(false);
  protected readonly guardando = signal(false);
  /** Ids con un PATCH en vuelo: se deshabilita solo esa fila. */
  protected readonly enCurso = signal<number[]>([]);

  protected readonly hoy = new Date();
  protected readonly skeletons = [1, 2, 3];

  /**
   * Campos del alta y de la edición. Propiedades planas y no signals, que es
   * como el resto del panel liga `[(ngModel)]` (ver `alertas.ts`).
   */
  protected tituloNuevo = '';
  protected responsableNuevo: number | null = null;
  protected vencimientoNuevo: Date | null = null;

  protected tituloEditado = '';
  protected responsableEditado: number | null = null;
  protected vencimientoEditado: Date | null = null;

  /** Responsable y vencimiento del alta: ocultos hasta que hagan falta. */
  protected readonly mostrarOpciones = signal(false);

  /** Tarea abierta en modo edición, o null. */
  protected readonly editandoId = signal<number | null>(null);

  protected readonly puedeEscribir = computed(() =>
    this.authService.tienePermiso(permiso(RECURSO.ALERTA, 'seguimiento'))
  );

  /** Ver la nota de `SeguimientoComentarios`: el input no existe en el constructor. */
  ngOnInit(): void {
    this.cargar();
  }

  /**
   * Las tareas con todo lo que el template necesita YA CALCULADO.
   *
   * No es una optimización: es una corrección. Si el `[ngModel]` del
   * `p-datepicker` se liga a un método que construye un `Date`, cada ciclo de
   * render devuelve un objeto nuevo, Angular lo ve como un valor distinto y
   * vuelve a renderizar — un bucle que congela la pestaña. Acá el `Date` se
   * crea una sola vez por tarea y solo cambia cuando cambia la tarea.
   */
  protected readonly vista = computed(() =>
    this.tareas().map((tarea) => ({
      tarea,
      fecha: fechaLocalDesdeTexto(tarea.fechaVencimiento),
      vencimientoTexto: textoCorto(tarea.fechaVencimiento),
      severidad: severidadVencimiento(tarea)
    }))
  );

  protected estaEnCurso(tarea: TareaAlerta): boolean {
    return this.enCurso().includes(tarea.id);
  }

  protected reintentar(): void {
    this.cargar();
  }

  protected agregar(): void {
    const titulo = this.tituloNuevo.trim();
    if (!titulo || this.guardando()) {
      return;
    }

    this.guardando.set(true);
    this.service
      .crearTarea(this.alertaId(), {
        titulo,
        responsableId: this.responsableNuevo,
        fechaVencimiento: textoDesdeFechaLocal(this.vencimientoNuevo)
      })
      .subscribe({
        next: (res) => {
          this.guardando.set(false);
          if (res.data) {
            this.tareas.update((actuales) => [...actuales, res.data!]);
            this.recalcular();
          }
          // Se limpia acá, después de la respuesta OK, y nunca desde un
          // `effect`: ese resetearía el campo mientras la persona escribe.
          this.tituloNuevo = '';
          this.responsableNuevo = null;
          this.vencimientoNuevo = null;
          this.mostrarOpciones.set(false);
          this.tareasCambiaron.emit();
        },
        error: (err) => {
          this.guardando.set(false);
          this.mostrarError(err, 'No se pudo crear la tarea.');
        }
      });
  }

  /** Abre la edición inline con los valores actuales de la tarea. */
  protected empezarEdicion(tarea: TareaAlerta): void {
    this.tituloEditado = tarea.titulo;
    this.responsableEditado = tarea.responsable?.id ?? null;
    this.vencimientoEditado = fechaLocalDesdeTexto(tarea.fechaVencimiento);
    this.editandoId.set(tarea.id);
  }

  protected cancelarEdicion(): void {
    this.editandoId.set(null);
  }

  /**
   * Guarda los tres campos de una vez. Se mandan siempre los tres (el contrato
   * del backend distingue `null` de ausente), así que esto también sirve para
   * desasignar un responsable o quitar un vencimiento.
   */
  protected guardarEdicion(tarea: TareaAlerta): void {
    const titulo = this.tituloEditado.trim();
    if (!titulo) {
      return;
    }

    this.editandoId.set(null);
    this.actualizar(tarea, {
      titulo,
      responsableId: this.responsableEditado,
      fechaVencimiento: textoDesdeFechaLocal(this.vencimientoEditado)
    });
  }

  protected alternarCompletada(tarea: TareaAlerta, completada: boolean): void {
    this.actualizar(tarea, { completada });
  }

  protected confirmarEliminar(tarea: TareaAlerta): void {
    this.confirmationService.confirm({
      header: 'Eliminar tarea',
      // `escaparHtml`: p-confirmdialog pinta el mensaje con innerHTML y el
      // título lo escribió una persona.
      message: `¿Eliminar "${escaparHtml(tarea.titulo)}"?`,
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'Eliminar',
      rejectLabel: 'Cancelar',
      acceptButtonStyleClass: 'p-button-danger',
      accept: () => this.eliminar(tarea)
    });
  }

  private eliminar(tarea: TareaAlerta): void {
    this.marcarEnCurso(tarea.id, true);
    this.service.eliminarTarea(tarea.id).subscribe({
      next: () => {
        this.marcarEnCurso(tarea.id, false);
        this.tareas.update((actuales) => actuales.filter((t) => t.id !== tarea.id));
        this.recalcular();
        this.tareasCambiaron.emit();
      },
      error: (err) => {
        this.marcarEnCurso(tarea.id, false);
        this.mostrarError(err, 'No se pudo eliminar la tarea.');
      }
    });
  }

  /**
   * PATCH parcial: se manda solo el campo que cambió. El backend distingue
   * "no vino" de `null`, así que mandar `null` desasigna en vez de ignorarse.
   */
  private actualizar(
    tarea: TareaAlerta,
    cambios: {
      titulo?: string;
      completada?: boolean;
      responsableId?: number | null;
      fechaVencimiento?: string | null;
    }
  ): void {
    this.marcarEnCurso(tarea.id, true);
    this.service.actualizarTarea(tarea.id, cambios).subscribe({
      next: (res) => {
        this.marcarEnCurso(tarea.id, false);
        if (res.data) {
          this.tareas.update((actuales) => actuales.map((t) => (t.id === tarea.id ? res.data! : t)));
          this.recalcular();
          this.tareasCambiaron.emit();
        }
      },
      error: (err) => {
        this.marcarEnCurso(tarea.id, false);
        // Se recarga para no quedar mostrando un estado que el backend rechazó.
        this.cargar();
        this.mostrarError(err, 'No se pudo actualizar la tarea.');
      }
    });
  }

  /**
   * Recalcula el progreso con las tareas que ya están en memoria, con el mismo
   * criterio que el backend. Evita un GET extra por cada check.
   */
  private recalcular(): void {
    const items = this.tareas();
    const completadas = items.filter((t) => t.completada).length;
    this.resumen.set({
      total: items.length,
      completadas,
      vencidas: items.filter((t) => t.vencida).length,
      porcentaje: items.length === 0 ? 0 : Math.round((completadas / items.length) * 100)
    });
  }

  private marcarEnCurso(tareaId: number, enCurso: boolean): void {
    this.enCurso.update((actuales) =>
      enCurso ? [...actuales, tareaId] : actuales.filter((id) => id !== tareaId)
    );
  }

  private mostrarError(err: unknown, fallback: string): void {
    const mensaje =
      ((err as { error?: ApiResponse<null> }).error as ApiResponse<null>)?.message ?? fallback;
    this.messageService.add({ severity: 'error', summary: 'Error', detail: mensaje });
  }

  private cargar(): void {
    this.cargando.set(true);
    this.error.set(false);

    this.service.listarTareas(this.alertaId()).subscribe({
      next: (res) => {
        this.cargando.set(false);
        this.tareas.set(res.data?.items ?? []);
        this.resumen.set(
          res.data?.resumen ?? { total: 0, completadas: 0, vencidas: 0, porcentaje: 0 }
        );
      },
      error: () => {
        this.cargando.set(false);
        this.error.set(true);
      }
    });

    // La lista de asignables solo hace falta para escribir.
    if (this.puedeEscribir()) {
      this.service.listarResponsables(this.alertaId()).subscribe({
        next: (res) => this.responsables.set(res.data ?? []),
        error: () => this.responsables.set([])
      });
    }
  }
}

/**
 * 'YYYY-MM-DD' a `Date` en hora LOCAL. Con `new Date('2026-10-05')` el
 * navegador interpreta UTC y en Paraguay (UTC-3) muestra el 4: por eso se
 * construye con los componentes separados.
 */
function fechaLocalDesdeTexto(texto: string | null): Date | null {
  if (!texto) {
    return null;
  }
  const [anio, mes, dia] = texto.split('-').map(Number);
  return new Date(anio!, mes! - 1, dia!);
}

/** `Date` local a 'YYYY-MM-DD', sin pasar por UTC (mismo motivo de arriba). */
function textoDesdeFechaLocal(fecha: Date | null): string | null {
  if (!fecha) {
    return null;
  }
  const mes = `${fecha.getMonth() + 1}`.padStart(2, '0');
  const dia = `${fecha.getDate()}`.padStart(2, '0');
  return `${fecha.getFullYear()}-${mes}-${dia}`;
}

/** 'YYYY-MM-DD' como "03/10/26", para el tag de vencimiento. */
function textoCorto(texto: string | null): string {
  const fecha = fechaLocalDesdeTexto(texto);
  return fecha
    ? fecha.toLocaleDateString('es-PY', { day: '2-digit', month: '2-digit', year: '2-digit' })
    : '';
}

/** Rojo si ya venció; ámbar si vence hoy; neutro si todavía falta. */
function severidadVencimiento(tarea: TareaAlerta): 'danger' | 'warn' | 'secondary' {
  if (tarea.vencida) {
    return 'danger';
  }
  const fecha = fechaLocalDesdeTexto(tarea.fechaVencimiento);
  if (fecha && !tarea.completada && esMismoDia(fecha, new Date())) {
    return 'warn';
  }
  return 'secondary';
}

function esMismoDia(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
  );
}
