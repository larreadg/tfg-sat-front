import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';
import { DatePickerModule } from 'primeng/datepicker';
import { DialogModule } from 'primeng/dialog';
import { IconFieldModule } from 'primeng/iconfield';
import { InputIconModule } from 'primeng/inputicon';
import { InputTextModule } from 'primeng/inputtext';
import { PaginatorModule, PaginatorState } from 'primeng/paginator';
import { SelectModule } from 'primeng/select';
import { SkeletonModule } from 'primeng/skeleton';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { TooltipModule } from 'primeng/tooltip';
import { AuditoriaService } from '../../core/services/auditoria.service';
import { ApiResponse } from '../../core/models/api-response.model';
import {
  ActorAuditoria,
  AccionCatalogo,
  AuditoriaDetalle,
  AuditoriaFiltros,
  AuditoriaListItem,
  OperacionAuditoria
} from '../../core/models/auditoria.model';
import { FiltrosPanel } from '../../shared/filtros-panel/filtros-panel';
import {
  etiquetaOpcion,
  etiquetaRango,
  resumenFiltros
} from '../../shared/filtros-panel/filtros-resumen';
import {
  actorIcono,
  actorLabel,
  jsonLegible,
  operacionIcono,
  operacionLabel,
  operacionSeveridad
} from '../../shared/etiquetas/auditoria-etiquetas';
import { SeveridadTag } from '../../shared/etiquetas/reporte-etiquetas';

interface Opcion<T> {
  label: string;
  value: T;
}

/** Grupo de un `p-select` agrupado: las acciones se eligen por área del sistema. */
interface GrupoOpciones {
  label: string;
  items: Opcion<string>[];
}

const TAMANO_PAGINA_INICIAL = 20;

/**
 * Bitácora de auditoría: quién hizo qué y cuándo.
 *
 * Es una pantalla de **solo lectura** y no por falta de botones: la bitácora es
 * inmutable y el backend no expone forma de editarla ni borrarla. Un registro que
 * se puede retocar no sirve como evidencia.
 *
 * Las opciones de los filtros (acciones, entidades, usuarios) vienen del
 * backend (`GET /admin/auditoria/acciones`), no están hardcodeadas acá: sumar una
 * acción auditable en el back la vuelve filtrable sin tocar el front, igual que
 * con el catálogo de eventos de Notificaciones.
 */
@Component({
  selector: 'app-auditoria',
  imports: [
    DatePipe,
    FormsModule,
    ButtonModule,
    CardModule,
    DatePickerModule,
    DialogModule,
    IconFieldModule,
    InputIconModule,
    InputTextModule,
    PaginatorModule,
    SelectModule,
    SkeletonModule,
    TableModule,
    TagModule,
    TooltipModule,
    FiltrosPanel
  ],
  templateUrl: './auditoria.html',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class Auditoria {
  private readonly service = inject(AuditoriaService);
  private readonly messageService = inject(MessageService);

  /** Tope del datepicker: no hay actividad futura para filtrar. */
  readonly hoy = new Date();

  readonly entradas = signal<AuditoriaListItem[]>([]);
  readonly loading = signal(false);
  readonly error = signal(false);
  readonly total = signal(0);
  readonly first = signal(0);
  readonly pageSize = signal(TAMANO_PAGINA_INICIAL);

  readonly filasSkeleton = Array.from({ length: 10 });

  // --- Filtros (ngModel; se aplican con el botón "Aplicar") ---
  rango: Date[] | null = null;
  q = '';
  usuarioId: number | null = null;
  accion: string | null = null;
  operacion: OperacionAuditoria | null = null;
  entidad: string | null = null;
  actorTipo: ActorAuditoria | null = null;
  exito: boolean | null = null;
  ip = '';

  /** Filtros ya aplicados, para la cabecera del panel colapsado. */
  readonly filtrosAplicados = signal<string[]>([]);

  // --- Opciones de los filtros ---
  /** Acciones del catálogo, planas. Sirven para resolver etiquetas del resumen. */
  private readonly acciones = signal<AccionCatalogo[]>([]);
  readonly accionOpciones = computed<Opcion<string>[]>(() =>
    this.acciones().map((item) => ({ label: item.etiqueta, value: item.accion }))
  );

  /**
   * Las mismas acciones agrupadas por área. Son más de cuarenta: una lista plana
   * de cuarenta ítems no se puede recorrer con la vista.
   */
  readonly accionGrupos = computed<GrupoOpciones[]>(() => {
    const porGrupo = new Map<string, Opcion<string>[]>();
    for (const item of this.acciones()) {
      const items = porGrupo.get(item.grupo) ?? [];
      items.push({ label: item.etiqueta, value: item.accion });
      porGrupo.set(item.grupo, items);
    }
    return [...porGrupo.entries()].map(([label, items]) => ({ label, items }));
  });

  readonly usuarioOpciones = signal<Opcion<number>[]>([]);
  readonly entidadOpciones = signal<Opcion<string>[]>([]);

  readonly operacionOpciones: Opcion<OperacionAuditoria>[] = [
    { label: 'Creación', value: 'CREAR' },
    { label: 'Modificación', value: 'ACTUALIZAR' },
    { label: 'Eliminación', value: 'ELIMINAR' },
    { label: 'Acceso', value: 'ACCESO' }
  ];

  readonly actorTipoOpciones: Opcion<ActorAuditoria>[] = [
    { label: 'Usuario del panel', value: 'USUARIO' },
    { label: 'Ciudadano', value: 'CIUDADANO' },
    { label: 'Proceso automático', value: 'SISTEMA' },
    { label: 'Sin identificar', value: 'ANONIMO' }
  ];

  readonly exitoOpciones: Opcion<boolean>[] = [
    { label: 'Completadas', value: true },
    { label: 'Rechazadas', value: false }
  ];

  // --- Detalle ---
  readonly detalle = signal<AuditoriaDetalle | null>(null);
  readonly detalleVisible = signal(false);
  readonly detalleLoading = signal(false);

  /** Los tres bloques de datos del detalle, ya formateados y sin los vacíos. */
  readonly bloquesDetalle = computed(() => {
    const entrada = this.detalle();
    if (!entrada) {
      return [];
    }
    return [
      { titulo: 'Antes', json: jsonLegible(entrada.datosPrevios) },
      { titulo: 'Después', json: jsonLegible(entrada.datosNuevos) },
      { titulo: 'Contexto adicional', json: jsonLegible(entrada.metadatos) }
    ].filter((bloque): bloque is { titulo: string; json: string } => bloque.json !== null);
  });

  constructor() {
    this.cargarCatalogo();
    this.cargar();
  }

  aplicar(): void {
    this.first.set(0);
    this.cargar();
  }

  limpiar(): void {
    this.rango = null;
    this.q = '';
    this.usuarioId = null;
    this.accion = null;
    this.operacion = null;
    this.entidad = null;
    this.actorTipo = null;
    this.exito = null;
    this.ip = '';
    this.first.set(0);
    this.cargar();
  }

  onPage(evento: PaginatorState): void {
    this.first.set(evento.first ?? 0);
    this.pageSize.set(evento.rows ?? TAMANO_PAGINA_INICIAL);
    this.cargar();
  }

  reintentar(): void {
    this.cargar();
  }

  /**
   * Filtra por la entidad concreta que toca una entrada ("todo lo que pasó con la
   * alerta #12"). Es el salto que de verdad se usa cuando algo no cuadra.
   */
  verHistorialDe(entrada: AuditoriaListItem): void {
    this.limpiarSinRecargar();
    this.entidad = entrada.entidad;
    this.q = entrada.entidadId ?? '';
    this.first.set(0);
    this.detalleVisible.set(false);
    this.cargar();
  }

  /**
   * Abre el detalle. Se pide al back en el momento: el listado no manda los JSON
   * de cada fila (serían cientos de blobs por página para mirar uno).
   *
   * Se hace imperativo y no con un `effect` sobre `visible` a propósito: un effect
   * que lee y escribe sus propios signals es lo que deja el formulario "pegado"
   * (ver el gotcha de `effect()` en CLAUDE.md). Acá no hace falta.
   */
  verDetalle(entrada: AuditoriaListItem): void {
    this.detalle.set(null);
    this.detalleLoading.set(true);
    this.detalleVisible.set(true);

    this.service.detalle(entrada.id).subscribe({
      next: (res) => {
        this.detalle.set(res.data ?? null);
        this.detalleLoading.set(false);
      },
      error: (err) => {
        this.detalleLoading.set(false);
        this.detalleVisible.set(false);
        this.avisarError(err, 'No se pudo cargar el detalle de la entrada.');
      }
    });
  }

  cerrarDetalle(): void {
    this.detalleVisible.set(false);
  }

  // --- Etiquetas (delegan en los helpers compartidos) ---
  operacionLabel(operacion: OperacionAuditoria): string {
    return operacionLabel(operacion);
  }

  operacionSeveridad(operacion: OperacionAuditoria): SeveridadTag {
    return operacionSeveridad(operacion);
  }

  operacionIcono(operacion: OperacionAuditoria): string {
    return operacionIcono(operacion);
  }

  actorLabel(actorTipo: ActorAuditoria): string {
    return actorLabel(actorTipo);
  }

  actorIcono(actorTipo: ActorAuditoria): string {
    return actorIcono(actorTipo);
  }

  private limpiarSinRecargar(): void {
    this.rango = null;
    this.q = '';
    this.usuarioId = null;
    this.accion = null;
    this.operacion = null;
    this.entidad = null;
    this.actorTipo = null;
    this.exito = null;
    this.ip = '';
  }

  /**
   * Catálogo de filtros. Si falla, la pantalla sigue funcionando con los filtros
   * que no dependen de él (fechas, búsqueda, operación, IP): un catálogo caído no
   * tiene por qué dejar la auditoría inaccesible.
   */
  private cargarCatalogo(): void {
    this.service.catalogo().subscribe({
      next: (res) => {
        const catalogo = res.data;
        if (!catalogo) {
          return;
        }
        this.acciones.set(catalogo.acciones);
        this.entidadOpciones.set(
          catalogo.entidades.map((entidad) => ({ label: entidad, value: entidad }))
        );
        this.usuarioOpciones.set(
          catalogo.usuarios.map((usuario) => ({ label: usuario.nombre, value: usuario.usuarioId }))
        );
      },
      error: () => {
        this.messageService.add({
          severity: 'warn',
          summary: 'Filtros incompletos',
          detail: 'No se pudieron cargar las opciones de acción y usuario. Los demás filtros funcionan.'
        });
      }
    });
  }

  private cargar(): void {
    const q = this.q.trim();
    const ip = this.ip.trim();

    this.filtrosAplicados.set(
      resumenFiltros(
        etiquetaRango(this.rango),
        q ? `"${q}"` : null,
        etiquetaOpcion(this.usuarioId, this.usuarioOpciones()),
        etiquetaOpcion(this.accion, this.accionOpciones()),
        etiquetaOpcion(this.operacion, this.operacionOpciones),
        this.entidad,
        etiquetaOpcion(this.actorTipo, this.actorTipoOpciones),
        etiquetaOpcion(this.exito, this.exitoOpciones),
        ip ? `IP ${ip}` : null
      )
    );

    const filtros: AuditoriaFiltros = {
      page: Math.floor(this.first() / this.pageSize()) + 1,
      pageSize: this.pageSize(),
      q: q || undefined,
      usuarioId: this.usuarioId ?? undefined,
      accion: this.accion ?? undefined,
      operacion: this.operacion ?? undefined,
      entidad: this.entidad ?? undefined,
      actorTipo: this.actorTipo ?? undefined,
      exito: this.exito ?? undefined,
      ip: ip || undefined,
      desde: this.rango?.[0] ? inicioDelDia(this.rango[0]).toISOString() : undefined,
      hasta: this.rango?.[1] ? finDelDia(this.rango[1]).toISOString() : undefined
    };

    this.loading.set(true);
    this.error.set(false);
    this.service.listar(filtros).subscribe({
      next: (res) => {
        this.entradas.set(res.data ?? []);
        this.total.set(res.meta?.total ?? 0);
        this.loading.set(false);
      },
      error: (err) => {
        this.loading.set(false);
        this.error.set(true);
        this.entradas.set([]);
        this.total.set(0);
        this.avisarError(err, 'No se pudo cargar la bitácora.');
      }
    });
  }

  private avisarError(err: unknown, fallback: string): void {
    const mensaje = ((err as { error?: ApiResponse<null> }).error?.message) ?? fallback;
    this.messageService.add({ severity: 'error', summary: 'Error', detail: mensaje });
  }
}

function inicioDelDia(fecha: Date): Date {
  const copia = new Date(fecha);
  copia.setHours(0, 0, 0, 0);
  return copia;
}

function finDelDia(fecha: Date): Date {
  const copia = new Date(fecha);
  copia.setHours(23, 59, 59, 999);
  return copia;
}
