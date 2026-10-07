import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { MessageService } from 'primeng/api';
import { AccordionModule } from 'primeng/accordion';
import { BadgeModule } from 'primeng/badge';
import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';
import { DatePickerModule } from 'primeng/datepicker';
import { DialogModule } from 'primeng/dialog';
import { DragDropModule } from 'primeng/dragdrop';
import { SelectModule } from 'primeng/select';
import { SkeletonModule } from 'primeng/skeleton';
import { TextareaModule } from 'primeng/textarea';
import { AlertasService } from '../../core/services/alertas.service';
import { AuthService } from '../../core/services/auth.service';
import { ApiResponse } from '../../core/models/api-response.model';
import {
  AlertaListItem,
  AlertasFiltros,
  ESTADOS_ALERTA,
  EstadoAlerta,
  esEstadoTerminal,
  transicionesDesde
} from '../../core/models/alerta.model';
import { permiso, RECURSO } from '../../core/models/permiso.model';
import { AlertaTarjeta } from './alerta-tarjeta/alerta-tarjeta';
import { FiltrosPanel } from '../../shared/filtros-panel/filtros-panel';
import {
  etiquetaOpcion,
  etiquetaRango,
  resumenFiltros
} from '../../shared/filtros-panel/filtros-resumen';
import { EstadoAlertaTag } from '../../shared/estado-alerta-tag/estado-alerta-tag';
import { estadoAlertaIcono, estadoAlertaLabel } from '../../shared/etiquetas/alerta-etiquetas';

interface Opcion<T> {
  label: string;
  value: T;
}

/**
 * Una columna del tablero = un estado de la máquina de estados. Cada columna
 * pagina por su cuenta (`total` es el total del servidor, `items` lo traído
 * hasta ahora) porque la API lista alertas filtrando por un estado a la vez.
 */
interface ColumnaAlertas {
  estado: EstadoAlerta;
  label: string;
  icono: string;
  items: AlertaListItem[];
  total: number;
  cargando: boolean;
  error: boolean;
}

/** Tarjetas que trae cada columna por tanda. */
const TAMANIO_TANDA = 15;

@Component({
  selector: 'app-alertas',
  imports: [
    FormsModule,
    AccordionModule,
    BadgeModule,
    ButtonModule,
    CardModule,
    DatePickerModule,
    DialogModule,
    DragDropModule,
    SelectModule,
    SkeletonModule,
    TextareaModule,
    EstadoAlertaTag,
    AlertaTarjeta,
    FiltrosPanel
  ],
  templateUrl: './alertas.html',
  styleUrl: './alertas.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class Alertas {
  private readonly service = inject(AlertasService);
  private readonly authService = inject(AuthService);
  private readonly messageService = inject(MessageService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  /** Tope del datepicker: no se filtran alertas futuras. */
  readonly hoy = new Date();

  /** Una entrada por estado, en el orden del flujo (ver `ESTADOS_ALERTA`). */
  readonly columnas = signal<ColumnaAlertas[]>(
    ESTADOS_ALERTA.map((estado) => ({
      estado,
      label: estadoAlertaLabel(estado),
      icono: estadoAlertaIcono(estado),
      items: [],
      total: 0,
      cargando: false,
      error: false
    }))
  );

  /** Placeholder de tarjetas mientras carga la primera tanda (skeleton). */
  readonly tarjetasSkeleton = Array.from({ length: 3 });

  /** Paneles abiertos en la vista apilada (mobile): las que requieren acción. */
  readonly panelesAbiertos: string[] = ['NUEVA', 'EN_REVISION'];

  /** Operar la máquina de estados requiere `alerta.editar` (UX; el back es la barrera). */
  readonly puedeEditar = this.authService.tienePermiso(permiso(RECURSO.ALERTA, 'editar'));

  // Filtros (bindeados con ngModel; se aplican con el botón "Aplicar"). El
  // estado ya no es un filtro: cada columna del tablero *es* un estado.
  rango: Date[] | null = null;
  nivel: number | null = null;

  readonly nivelOpciones: Opcion<number>[] = [
    { label: 'Medio', value: 2 },
    { label: 'Alto', value: 3 }
  ];

  /** Filtros ya aplicados, para la cabecera del panel colapsado. */
  readonly filtrosAplicados = signal<string[]>([]);

  // --- Arrastre ---

  /** Tarjeta que el usuario tiene "en la mano". `null` cuando no arrastra nada. */
  readonly arrastrada = signal<AlertaListItem | null>(null);

  /** Columna sobre la que está el cursor durante el arrastre (para el realce). */
  readonly columnaSobre = signal<EstadoAlerta | null>(null);

  /**
   * Estados a los que puede ir la tarjeta arrastrada. Es lo que decide qué
   * columna se ilumina y qué columna se atenúa en cuanto se levanta una
   * tarjeta: la máquina de estados se vuelve visible sin tener que probarla.
   */
  readonly destinosValidos = computed<EstadoAlerta[]>(() => {
    const alerta = this.arrastrada();
    return alerta ? transicionesDesde(alerta.estado) : [];
  });

  /** Alertas con un PATCH en vuelo: la tarjeta se muestra atenuada con spinner. */
  readonly enCurso = signal<ReadonlySet<number>>(new Set());

  // --- Diálogo de cambio de estado (vista apilada: sin arrastre al tacto) ---
  readonly dialogVisible = signal(false);
  readonly guardando = signal(false);
  readonly alertaEnEdicion = signal<AlertaListItem | null>(null);
  transicionSeleccionada: EstadoAlerta | null = null;
  observacion = '';

  /** Estados a los que puede transicionar la alerta en edición. */
  readonly transicionOpciones = computed<Opcion<EstadoAlerta>[]>(() => {
    const alerta = this.alertaEnEdicion();
    if (!alerta) {
      return [];
    }
    return transicionesDesde(alerta.estado).map((estado) => ({
      label: estadoAlertaLabel(estado),
      value: estado
    }));
  });

  /** `true` mientras ninguna columna terminó de traer su primera tanda. */
  readonly cargandoInicial = computed(() =>
    this.columnas().every((c) => c.cargando && c.items.length === 0)
  );

  /** Total de alertas del tablero con los filtros vigentes. */
  readonly totalTablero = computed(() => this.columnas().reduce((suma, c) => suma + c.total, 0));

  /**
   * Los filtros no dejaron ninguna alerta. Se exige que nada esté cargando y
   * que ninguna columna haya fallado: si una falló, su total es 0 por el error
   * y lo que hay que mostrar es el botón de reintentar de esa columna, no un
   * "no hay alertas" que miente.
   */
  readonly tableroVacio = computed(
    () =>
      this.totalTablero() === 0 &&
      this.columnas().every((c) => !c.cargando && !c.error)
  );

  constructor() {
    this.cargar();

    // `/alertas?alerta=4` era el enlace que abría el diálogo cuando el detalle
    // vivía dentro del tablero. Ahora la alerta tiene pantalla propia, así que
    // se redirige: los enlaces viejos (o guardados) siguen llevando al lugar
    // correcto.
    const idDirecto = Number(this.route.snapshot.queryParamMap.get('alerta'));
    if (Number.isInteger(idDirecto) && idDirecto > 0) {
      void this.router.navigate(['/alertas', idDirecto]);
    }
  }

  // --- Filtros ---

  aplicar(): void {
    this.cargar();
  }

  limpiar(): void {
    this.rango = null;
    this.nivel = null;
    this.cargar();
  }

  reintentar(estado: EstadoAlerta): void {
    this.cargarColumna(estado, true);
  }

  cargarMas(estado: EstadoAlerta): void {
    this.cargarColumna(estado, false);
  }

  /** `true` si la columna tiene más alertas en el servidor que las traídas. */
  hayMas(columna: ColumnaAlertas): boolean {
    return columna.items.length < columna.total;
  }

  // --- Lectura de la tarjeta ---

  esTerminal(estado: EstadoAlerta): boolean {
    return esEstadoTerminal(estado);
  }

  estaEnCurso(alerta: AlertaListItem): boolean {
    return this.enCurso().has(alerta.id);
  }

  /** `true` si se puede levantar esta tarjeta (permiso + estado no terminal). */
  esArrastrable(alerta: AlertaListItem): boolean {
    return this.puedeEditar && !esEstadoTerminal(alerta.estado) && !this.estaEnCurso(alerta);
  }

  // --- Arrastre ---

  comenzarArrastre(alerta: AlertaListItem): void {
    this.arrastrada.set(alerta);
  }

  terminarArrastre(): void {
    this.arrastrada.set(null);
    this.columnaSobre.set(null);
  }

  /** La columna acepta la tarjeta en curso según la máquina de estados. */
  aceptaDrop(estado: EstadoAlerta): boolean {
    return this.destinosValidos().includes(estado);
  }

  /**
   * Columna que debe atenuarse: hay un arrastre en curso, no es un destino
   * posible y tampoco es la columna de origen (de donde salió la tarjeta).
   */
  estaInhabilitada(estado: EstadoAlerta): boolean {
    const alerta = this.arrastrada();
    return alerta != null && alerta.estado !== estado && !this.aceptaDrop(estado);
  }

  entrarEnColumna(estado: EstadoAlerta): void {
    if (this.aceptaDrop(estado)) {
      this.columnaSobre.set(estado);
    }
  }

  salirDeColumna(estado: EstadoAlerta): void {
    if (this.columnaSobre() === estado) {
      this.columnaSobre.set(null);
    }
  }

  /**
   * Soltar una tarjeta en una columna aplica la transición al instante: se mueve
   * la tarjeta y se dispara el PATCH. Si el back la rechaza, vuelve a su lugar
   * exacto (ver `mover`). El drop no pide observación; para dejar una se usa el
   * diálogo de la vista apilada.
   */
  soltarEn(estadoDestino: EstadoAlerta): void {
    const alerta = this.arrastrada();
    this.terminarArrastre();

    if (!alerta || !this.puedeEditar) {
      return;
    }
    // Doble control: el `pDroppableDisabled` de la columna ya filtra, pero la
    // máquina de estados es la que manda (y el back la revalida con un 409).
    if (!transicionesDesde(alerta.estado).includes(estadoDestino)) {
      return;
    }

    this.mover(alerta, estadoDestino);
  }

  // --- Diálogo de cambio de estado ---

  abrirCambioEstado(alerta: AlertaListItem): void {
    this.alertaEnEdicion.set(alerta);
    this.transicionSeleccionada = null;
    this.observacion = '';
    this.dialogVisible.set(true);
  }

  confirmarCambio(): void {
    const alerta = this.alertaEnEdicion();
    const estadoNuevo = this.transicionSeleccionada;
    if (!alerta || !estadoNuevo) {
      return;
    }

    const observacion = this.observacion.trim();
    this.guardando.set(true);
    this.service.cambiarEstado(alerta.id, estadoNuevo, observacion || undefined).subscribe({
      next: (res) => {
        this.guardando.set(false);
        this.dialogVisible.set(false);
        // El PATCH devuelve la alerta base (sin reporte/punto): se mueve la
        // tarjeta que ya se tiene, preservando el origen.
        this.quitarDe(alerta.estado, alerta.id);
        this.insertarEn(
          estadoNuevo,
          {
            ...alerta,
            estado: res.data?.estado ?? estadoNuevo,
            fechaActualizacion: res.data?.fechaActualizacion ?? alerta.fechaActualizacion
          },
          0
        );
        this.avisarMovida(estadoNuevo);
      },
      error: (err) => {
        this.guardando.set(false);
        const mensaje =
          (err.error as ApiResponse<null>)?.message ?? 'No se pudo cambiar el estado de la alerta.';
        this.messageService.add({ severity: 'error', summary: 'Error', detail: mensaje });
      }
    });
  }

  // --- Movimiento optimista ---

  /**
   * Mueve la tarjeta en el tablero antes de que el back conteste y la revierte
   * si falla. El movimiento optimista es lo que hace que el arrastre se sienta
   * inmediato; `enCurso` deja ver que todavía no está confirmado.
   */
  private mover(alerta: AlertaListItem, destino: EstadoAlerta): void {
    const origen = alerta.estado;
    const indiceOriginal = this.indiceEn(origen, alerta.id);

    this.quitarDe(origen, alerta.id);
    this.insertarEn(destino, { ...alerta, estado: destino }, 0);
    this.marcarEnCurso(alerta.id, true);

    this.service.cambiarEstado(alerta.id, destino).subscribe({
      next: (res) => {
        this.marcarEnCurso(alerta.id, false);
        const actualizada = res.data;
        if (actualizada) {
          this.actualizarEn(destino, alerta.id, (a) => ({
            ...a,
            estado: actualizada.estado,
            fechaActualizacion: actualizada.fechaActualizacion
          }));
        }
        this.avisarMovida(destino);
      },
      error: (err) => {
        this.marcarEnCurso(alerta.id, false);
        // Revertir: sacarla del destino y devolverla a su posición original.
        this.quitarDe(destino, alerta.id);
        this.insertarEn(origen, alerta, indiceOriginal);
        const mensaje =
          (err.error as ApiResponse<null>)?.message ?? 'No se pudo cambiar el estado de la alerta.';
        this.messageService.add({
          severity: 'error',
          summary: 'El cambio no se aplicó',
          detail: mensaje
        });
      }
    });
  }

  private avisarMovida(destino: EstadoAlerta): void {
    this.messageService.add({
      severity: 'success',
      summary: 'Estado actualizado',
      detail: `La alerta pasó a "${estadoAlertaLabel(destino)}".`
    });
  }

  private marcarEnCurso(id: number, activo: boolean): void {
    this.enCurso.update((actual) => {
      const copia = new Set(actual);
      if (activo) {
        copia.add(id);
      } else {
        copia.delete(id);
      }
      return copia;
    });
  }

  private indiceEn(estado: EstadoAlerta, id: number): number {
    const columna = this.columnas().find((c) => c.estado === estado);
    const indice = columna?.items.findIndex((a) => a.id === id) ?? -1;
    return indice < 0 ? 0 : indice;
  }

  /** Saca la tarjeta de la columna y descuenta su total del servidor. */
  private quitarDe(estado: EstadoAlerta, id: number): void {
    this.columnas.update((columnas) =>
      columnas.map((c) => {
        if (c.estado !== estado) {
          return c;
        }
        const items = c.items.filter((a) => a.id !== id);
        const quitada = items.length !== c.items.length;
        return { ...c, items, total: quitada ? Math.max(0, c.total - 1) : c.total };
      })
    );
  }

  /** Inserta la tarjeta en la columna y suma su total del servidor. */
  private insertarEn(estado: EstadoAlerta, alerta: AlertaListItem, indice: number): void {
    this.columnas.update((columnas) =>
      columnas.map((c) => {
        if (c.estado !== estado) {
          return c;
        }
        const items = [...c.items];
        items.splice(Math.min(indice, items.length), 0, alerta);
        return { ...c, items, total: c.total + 1 };
      })
    );
  }

  private actualizarEn(
    estado: EstadoAlerta,
    id: number,
    cambio: (alerta: AlertaListItem) => AlertaListItem
  ): void {
    this.columnas.update((columnas) =>
      columnas.map((c) =>
        c.estado === estado ? { ...c, items: c.items.map((a) => (a.id === id ? cambio(a) : a)) } : c
      )
    );
  }

  // --- Carga ---

  /**
   * Generación de filtros vigente. Sube con cada recarga completa y cada
   * request se queda con la suya: así una respuesta lenta de los filtros
   * anteriores no sobreescribe (ni le agrega una tanda vieja a) lo nuevo.
   */
  private generacion = 0;

  /** Recarga las cinco columnas desde cero con los filtros vigentes. */
  private cargar(): void {
    this.generacion++;
    this.filtrosAplicados.set(
      resumenFiltros(etiquetaRango(this.rango), etiquetaOpcion(this.nivel, this.nivelOpciones))
    );
    for (const estado of ESTADOS_ALERTA) {
      this.cargarColumna(estado, true);
    }
  }

  /**
   * Trae una tanda de una columna. `reset` descarta lo traído (al aplicar
   * filtros o reintentar); si no, agrega la tanda siguiente ("Cargar más").
   */
  private cargarColumna(estado: EstadoAlerta, reset: boolean): void {
    const columna = this.columnas().find((c) => c.estado === estado);
    if (!columna) {
      return;
    }
    // Un "cargar más" no se pisa a sí mismo; una recarga por filtros sí tiene
    // que salir aunque haya algo en vuelo (la generación descarta lo viejo).
    if (!reset && columna.cargando) {
      return;
    }

    const generacion = this.generacion;
    const traidas = reset ? 0 : columna.items.length;
    const filtros: AlertasFiltros = {
      page: Math.floor(traidas / TAMANIO_TANDA) + 1,
      pageSize: TAMANIO_TANDA,
      estado,
      nivel: this.nivel ?? undefined,
      desde: this.rango?.[0] ? inicioDelDia(this.rango[0]).toISOString() : undefined,
      hasta: this.rango?.[1] ? finDelDia(this.rango[1]).toISOString() : undefined
    };

    this.parchearColumna(estado, {
      cargando: true,
      error: false,
      items: reset ? [] : columna.items,
      total: reset ? 0 : columna.total
    });

    this.service.listar(filtros).subscribe({
      next: (res) => {
        if (generacion !== this.generacion) {
          return;
        }
        const tanda = res.data ?? [];
        this.columnas.update((columnas) =>
          columnas.map((c) =>
            c.estado === estado
              ? {
                  ...c,
                  items: reset ? tanda : [...c.items, ...tanda],
                  total: res.meta?.total ?? tanda.length,
                  cargando: false,
                  error: false
                }
              : c
          )
        );
      },
      error: (err) => {
        if (generacion !== this.generacion) {
          return;
        }
        this.parchearColumna(estado, { cargando: false, error: true });
        const mensaje =
          (err.error as ApiResponse<null>)?.message ??
          `No se pudieron cargar las alertas en "${estadoAlertaLabel(estado)}".`;
        this.messageService.add({ severity: 'error', summary: 'Error', detail: mensaje });
      }
    });
  }

  private parchearColumna(estado: EstadoAlerta, cambios: Partial<ColumnaAlertas>): void {
    this.columnas.update((columnas) =>
      columnas.map((c) => (c.estado === estado ? { ...c, ...cambios } : c))
    );
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
