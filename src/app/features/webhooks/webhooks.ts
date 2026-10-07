import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { forkJoin } from 'rxjs';
import { ConfirmationService, MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { InputTextModule } from 'primeng/inputtext';
import { MessageModule } from 'primeng/message';
import { PaginatorModule, PaginatorState } from 'primeng/paginator';
import { SelectModule } from 'primeng/select';
import { SkeletonModule } from 'primeng/skeleton';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { TooltipModule } from 'primeng/tooltip';
import { FiltrosPanel } from '../../shared/filtros-panel/filtros-panel';
import { AuthService } from '../../core/services/auth.service';
import { WebhooksService } from '../../core/services/webhooks.service';
import { ApiResponse } from '../../core/models/api-response.model';
import { permiso, RECURSO } from '../../core/models/permiso.model';
import {
  CatalogoWebhooks,
  EventoWebhook,
  ReglaWebhook,
  Remitente
} from '../../core/models/webhook.model';
import { ReglaForm } from './regla-form/regla-form';
import { WebhookEntregas } from './entregas/entregas';

const TAMANO_PAGINA = 20;

/**
 * Pantalla de Webhooks: reglas de notificación configurables.
 *
 * El modelo mental es "cuando pase X y se cumpla Y, hacer Z", donde las tres cosas
 * son datos y no código. Las opciones de X, Y y Z las define el catálogo del backend
 * (`GET /admin/webhooks/eventos`), así que esta pantalla no sabe qué eventos existen:
 * los muestra.
 *
 * El remitente de los correos vive acá y no en Configuración > Sistema a propósito:
 * esa pantalla configura el servidor con el que se envía (infraestructura), esta
 * define qué se avisa y con qué cara sale.
 */
@Component({
  selector: 'app-webhooks',
  imports: [
    FormsModule,
    ReactiveFormsModule,
    RouterLink,
    ButtonModule,
    CardModule,
    ConfirmDialogModule,
    InputTextModule,
    MessageModule,
    PaginatorModule,
    SelectModule,
    SkeletonModule,
    TableModule,
    TagModule,
    TooltipModule,
    ReglaForm,
    WebhookEntregas,
    FiltrosPanel
  ],
  providers: [ConfirmationService],
  templateUrl: './webhooks.html',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class Webhooks {
  private readonly service = inject(WebhooksService);
  private readonly authService = inject(AuthService);
  private readonly messageService = inject(MessageService);
  private readonly confirmationService = inject(ConfirmationService);
  private readonly fb = inject(FormBuilder);

  readonly catalogo = signal<CatalogoWebhooks | null>(null);
  readonly remitente = signal<Remitente | null>(null);
  readonly reglas = signal<ReglaWebhook[]>([]);
  readonly loading = signal(false);
  readonly error = signal(false);
  readonly guardandoRemitente = signal(false);
  /** Id de la regla que está siendo probada, para el spinner de esa fila. */
  readonly probandoId = signal<number | null>(null);

  readonly total = signal(0);
  readonly first = signal(0);
  readonly pageSize = TAMANO_PAGINA;

  readonly puedeCrear = this.authService.tienePermiso(permiso(RECURSO.WEBHOOK, 'crear'));
  readonly puedeEditar = this.authService.tienePermiso(permiso(RECURSO.WEBHOOK, 'editar'));
  readonly puedeEliminar = this.authService.tienePermiso(permiso(RECURSO.WEBHOOK, 'eliminar'));

  readonly formVisible = signal(false);
  readonly entregasVisible = signal(false);
  readonly reglaSeleccionada = signal<ReglaWebhook | null>(null);

  readonly filtroEvento = signal<EventoWebhook | null>(null);

  readonly remitenteForm = this.fb.nonNullable.group({
    remitenteNombre: ['', [Validators.maxLength(120)]],
    remitenteCorreo: ['', [Validators.email]]
  });

  /** Evento aplicado, para la cabecera del panel colapsado. El filtro se
   *  aplica al cambiar el select, así que se deriva directo del signal. */
  readonly filtrosAplicados = computed<string[]>(() => {
    const valor = this.filtroEvento();
    if (!valor) {
      return [];
    }
    const opcion = this.eventoOpciones().find((o) => o.value === valor);
    return opcion ? [opcion.label] : [];
  });

  /** Opciones del filtro, derivadas del catálogo. */
  readonly eventoOpciones = computed(() => [
    { label: 'Todos los eventos', value: null },
    ...(this.catalogo()?.eventos.map((evento) => ({ label: evento.label, value: evento.valor })) ?? [])
  ]);

  /**
   * Sin SMTP habilitado, cualquier regla de correo es decorativa. Se avisa arriba de
   * todo porque se arregla en otra pantalla y el usuario no tiene por qué deducirlo.
   */
  readonly smtpApagado = computed(() => this.remitente()?.smtpHabilitado === false);

  readonly reglasConProblema = computed(() => this.reglas().filter((regla) => regla.advertencia !== null));

  readonly filasSkeleton = Array.from({ length: 4 });

  constructor() {
    this.cargar();
  }

  etiquetaEvento(valor: EventoWebhook): string {
    return this.catalogo()?.eventos.find((evento) => evento.valor === valor)?.label ?? valor;
  }

  etiquetaAccion(valor: string): string {
    return this.catalogo()?.acciones.find((accion) => accion.valor === valor)?.label ?? valor;
  }

  /** Resumen legible de las condiciones, para la columna del listado. */
  resumenCondiciones(regla: ReglaWebhook): string {
    const partes: string[] = [];
    if (regla.nivelMinimo != null) {
      const etiqueta = this.catalogo()?.etiquetasNivel[String(regla.nivelMinimo)] ?? '';
      partes.push(`nivel ≥ ${regla.nivelMinimo}${etiqueta ? ` (${etiqueta})` : ''}`);
    }
    if (regla.estadosDestino.length > 0) {
      partes.push(`pasa a ${regla.estadosDestino.join(' o ').replace(/_/g, ' ')}`);
    }
    return partes.length > 0 ? partes.join(' · ') : 'sin filtros';
  }

  /** A dónde va el aviso: destinatarios o URL, según la acción. */
  resumenDestino(regla: ReglaWebhook): string {
    return regla.accion === 'CORREO' ? regla.destinatarios.join(', ') : regla.url;
  }

  onPage(evento: PaginatorState): void {
    this.first.set(evento.first ?? 0);
    this.cargarReglas();
  }

  aplicarFiltro(): void {
    this.first.set(0);
    this.cargarReglas();
  }

  reintentar(): void {
    this.cargar();
  }

  nueva(): void {
    this.reglaSeleccionada.set(null);
    this.formVisible.set(true);
  }

  editar(regla: ReglaWebhook): void {
    this.reglaSeleccionada.set(regla);
    this.formVisible.set(true);
  }

  verEntregas(regla: ReglaWebhook): void {
    this.reglaSeleccionada.set(regla);
    this.entregasVisible.set(true);
  }

  onGuardado(): void {
    this.cargarReglas();
  }

  /** Atajo para encender/apagar sin abrir el formulario: es la acción más frecuente. */
  alternarActiva(regla: ReglaWebhook): void {
    this.service
      .actualizarRegla(regla.id, {
        nombre: regla.nombre,
        evento: regla.evento,
        accion: regla.accion,
        activa: !regla.activa,
        nivelMinimo: regla.nivelMinimo,
        estadosDestino: regla.estadosDestino,
        destinatarios: regla.destinatarios.join(', '),
        asunto: regla.asunto,
        url: regla.url
        // `secretoFirma` ausente a propósito: conserva el guardado.
      })
      .subscribe({
        next: () => {
          this.cargarReglas();
          this.messageService.add({
            severity: 'success',
            summary: regla.activa ? 'Regla desactivada' : 'Regla activada',
            detail: regla.nombre
          });
        },
        error: (err: unknown) => this.avisarError(err, 'No se pudo cambiar el estado de la regla.')
      });
  }

  /**
   * Dispara la regla con un payload de ejemplo. El backend responde 200 incluso si
   * la entrega falló, así que el resultado se lee de `exito`, no del código HTTP.
   */
  probar(regla: ReglaWebhook): void {
    this.probandoId.set(regla.id);
    this.service.probarRegla(regla.id).subscribe({
      next: (res) => {
        this.probandoId.set(null);
        this.cargarReglas();
        const entrega = res.data;
        if (entrega?.exito) {
          this.messageService.add({
            severity: 'success',
            summary: 'Prueba entregada',
            detail: `${entrega.detalle} (${entrega.duracionMs} ms)`,
            life: 8000
          });
        } else {
          this.messageService.add({
            severity: 'error',
            summary: 'La prueba falló',
            detail: entrega?.detalle ?? 'Sin detalle.',
            life: 14000
          });
        }
      },
      error: (err: unknown) => {
        this.probandoId.set(null);
        this.avisarError(err, 'No se pudo ejecutar la prueba.');
      }
    });
  }

  eliminar(regla: ReglaWebhook): void {
    this.confirmationService.confirm({
      header: 'Eliminar la regla',
      message: `Se va a eliminar "${regla.nombre}" y toda su bitácora de entregas. No se puede deshacer.`,
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'Eliminar',
      rejectLabel: 'Cancelar',
      acceptButtonStyleClass: 'p-button-danger p-button-rounded',
      rejectButtonStyleClass: 'p-button-text p-button-rounded',
      accept: () => {
        this.service.eliminarRegla(regla.id).subscribe({
          next: () => {
            this.cargarReglas();
            this.messageService.add({
              severity: 'success',
              summary: 'Regla eliminada',
              detail: regla.nombre
            });
          },
          error: (err: unknown) => this.avisarError(err, 'No se pudo eliminar la regla.')
        });
      }
    });
  }

  guardarRemitente(): void {
    if (this.remitenteForm.invalid) {
      this.remitenteForm.markAllAsTouched();
      return;
    }

    this.guardandoRemitente.set(true);
    const valores = this.remitenteForm.getRawValue();
    this.service
      .guardarRemitente({
        remitenteNombre: valores.remitenteNombre.trim(),
        remitenteCorreo: valores.remitenteCorreo.trim()
      })
      .subscribe({
        next: (res) => {
          this.guardandoRemitente.set(false);
          if (res.data) {
            this.remitente.set(res.data);
            this.rellenarRemitente(res.data);
          }
          // Las advertencias de las reglas dependen del remitente: hay que recargarlas.
          this.cargarReglas();
          this.messageService.add({
            severity: 'success',
            summary: 'Remitente guardado',
            detail: `Los correos van a salir como ${res.data?.remitenteEfectivo ?? ''}.`
          });
        },
        error: (err: unknown) => {
          this.guardandoRemitente.set(false);
          this.avisarError(err, 'No se pudo guardar el remitente.');
        }
      });
  }

  isRemitenteInvalid(controlName: string): boolean {
    const control = this.remitenteForm.get(controlName);
    return !!control && control.invalid && (control.dirty || control.touched);
  }

  private rellenarRemitente(remitente: Remitente): void {
    this.remitenteForm.reset({
      remitenteNombre: remitente.remitenteNombre,
      remitenteCorreo: remitente.remitenteCorreo
    });
    if (!this.puedeEditar) {
      this.remitenteForm.disable({ emitEvent: false });
    }
  }

  private cargar(): void {
    this.loading.set(true);
    this.error.set(false);

    forkJoin({
      catalogo: this.service.obtenerCatalogo(),
      remitente: this.service.obtenerRemitente(),
      reglas: this.service.listarReglas({ page: 1, limit: TAMANO_PAGINA })
    }).subscribe({
      next: ({ catalogo, remitente, reglas }) => {
        this.catalogo.set(catalogo.data ?? null);
        if (remitente.data) {
          this.remitente.set(remitente.data);
          this.rellenarRemitente(remitente.data);
        }
        this.reglas.set(reglas.data ?? []);
        this.total.set(reglas.meta?.total ?? 0);
        this.loading.set(false);
      },
      error: (err: unknown) => {
        this.loading.set(false);
        this.error.set(true);
        this.avisarError(err, 'No se pudieron cargar los webhooks.');
      }
    });
  }

  private cargarReglas(): void {
    this.service
      .listarReglas({
        page: Math.floor(this.first() / TAMANO_PAGINA) + 1,
        limit: TAMANO_PAGINA,
        ...(this.filtroEvento() ? { evento: this.filtroEvento()! } : {})
      })
      .subscribe({
        next: (res) => {
          this.reglas.set(res.data ?? []);
          this.total.set(res.meta?.total ?? 0);
        },
        error: (err: unknown) => this.avisarError(err, 'No se pudieron cargar las reglas.')
      });
  }

  private avisarError(err: unknown, fallback: string): void {
    const mensaje = (err as { error?: ApiResponse<null> })?.error?.message ?? fallback;
    this.messageService.add({ severity: 'error', summary: 'Error', detail: mensaje, life: 10000 });
  }
}
