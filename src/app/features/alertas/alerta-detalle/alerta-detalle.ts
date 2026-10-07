import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';
import { DialogModule } from 'primeng/dialog';
import { ListboxChangeEvent, ListboxModule } from 'primeng/listbox';
import { MessageModule } from 'primeng/message';
import { SkeletonModule } from 'primeng/skeleton';
import { TabsModule } from 'primeng/tabs';
import { TagModule } from 'primeng/tag';
import { BadgeModule } from 'primeng/badge';
import { AlertasService } from '../../../core/services/alertas.service';
import { BreadcrumbService } from '../../../core/services/breadcrumb.service';
import { ApiResponse } from '../../../core/models/api-response.model';
import { AlertaDetalle as AlertaDetalleModel, AlertaReporteDetalle } from '../../../core/models/alerta.model';
import { LeafletMap, PuntoMapa } from '../../../shared/leaflet-map/leaflet-map';
import { NivelTag } from '../../../shared/nivel-tag/nivel-tag';
import { EstadoAlertaTag } from '../../../shared/estado-alerta-tag/estado-alerta-tag';
import { EstadoAnalisisTag } from '../../../shared/estado-analisis-tag/estado-analisis-tag';
import { canalIcono, canalLabel, nivelLabel, nivelSeveridad } from '../../../shared/etiquetas/reporte-etiquetas';
import { SeguimientoComentarios } from './seguimiento-comentarios/seguimiento-comentarios';
import { SeguimientoArchivos } from './seguimiento-archivos/seguimiento-archivos';
import { SeguimientoTareas } from './seguimiento-tareas/seguimiento-tareas';
import { SeguimientoResumen } from '../../../core/models/alerta-seguimiento.model';

/**
 * Pantalla de trabajo de una alerta (`/alertas/:id`), con el mapa de los
 * reportes que la componen y el seguimiento de lo que se hace con ella.
 *
 * Era un diálogo dentro del tablero y se mudó acá: el seguimiento es trabajo
 * largo (escribir, adjuntar, cargar tareas) y un modal lo encerraba en un scroll
 * dentro de otro scroll, con un clic en el fondo capaz de borrar un comentario a
 * medio escribir. Como pantalla tiene URL propia, se abre en otra pestaña desde
 * el tablero —que así no pierde su estado— y se puede compartir. El mapa usa el mismo dibujo que la pantalla
 * Mapa (punto sólido por reporte, agrupados en una burbuja con la cantidad
 * mientras el zoom no alcance). El mapa y la lista comparten la selección: el
 * reporte elegido queda con halo en el mapa y la vista se acerca hasta poder
 * distinguirlo.
 */
@Component({
  selector: 'app-alerta-detalle',
  imports: [
    DatePipe,
    DecimalPipe,
    FormsModule,
    RouterLink,
    ButtonModule,
    CardModule,
    DialogModule,
    ListboxModule,
    MessageModule,
    SkeletonModule,
    TabsModule,
    TagModule,
    BadgeModule,
    LeafletMap,
    NivelTag,
    EstadoAlertaTag,
    EstadoAnalisisTag,
    SeguimientoComentarios,
    SeguimientoArchivos,
    SeguimientoTareas
  ],
  templateUrl: './alerta-detalle.html',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AlertaDetalle {
  private readonly service = inject(AlertasService);
  private readonly messageService = inject(MessageService);

  private readonly route = inject(ActivatedRoute);
  private readonly breadcrumbService = inject(BreadcrumbService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly router = inject(Router);

  readonly alertaId = Number(this.route.snapshot.paramMap.get('id'));

  readonly detalle = signal<AlertaDetalleModel | null>(null);
  readonly loading = signal(false);
  readonly error = signal(false);

  /** Reporte elegido en el mapa o en la lista (comparten selección). */
  readonly seleccionadoId = signal<number | null>(null);
  /**
   * Pestaña abierta. El mapa vive en `reportes`, que es la activa por defecto:
   * si Leaflet se inicializa en una pestaña oculta arranca con tamaño cero y
   * queda gris.
   */
  readonly tabActivo = signal<ClaveTab>('reportes');

  /**
   * Contadores de las pestañas. Arrancan con lo que trae el detalle y se
   * ajustan cuando una pestaña agrega o quita algo, para no volver a pedir todo
   * el detalle por un comentario nuevo.
   */
  readonly resumenSeguimiento = signal<SeguimientoResumen | null>(null);

  /**
   * Alto del mapa y de la lista. Es el mismo valor a propósito: son las dos
   * columnas de una misma fila y desalinearlas se nota. Generoso porque la lista
   * es lo que se recorre cuando la alerta junta muchos reportes.
   */
  readonly alturaPanel = 'clamp(320px, 55vh, 620px)';

  /**
   * La ficha del reporte se abre en un diálogo. Antes vivía debajo de la lista y
   * se repartían el alto: con seis o siete reportes la lista quedaba en una
   * rendija de tres filas, que es justo cuando más hace falta recorrerla.
   */
  readonly fichaVisible = signal(false);

  /** Con pocos reportes el filtro es ruido; con muchos es la única forma de ubicar uno. */
  readonly conFiltroReportes = computed(() => (this.detalle()?.reportes.length ?? 0) > 8);

  /** El filtro ocupa su propia fila dentro del listbox: se la resto al viewport. */
  readonly alturaLista = computed(() =>
    this.conFiltroReportes() ? `calc(${this.alturaPanel} - 3.5rem)` : this.alturaPanel
  );

  /** Zoom alto: en un punto crítico los reportes pueden estar a pocos metros. */
  readonly zoomMaximo = 19;

  /** Al elegir un reporte de la lista hay que acercarse hasta romper su grupo. */
  readonly zoomEnfoque = 18;

  readonly seleccionado = computed<AlertaReporteDetalle | null>(() => {
    const id = this.seleccionadoId();
    return this.detalle()?.reportes.find((r) => r.id === id) ?? null;
  });

  /**
   * Los reportes se dibujan igual que en la pantalla Mapa: punto sólido del
   * color de su nivel, agrupados en una burbuja con la cantidad mientras el
   * zoom no alcance para separarlos. El seleccionado lleva halo.
   */
  readonly puntos = computed<PuntoMapa[]>(() => {
    const detalle = this.detalle();
    if (!detalle) {
      return [];
    }

    const seleccionadoId = this.seleccionadoId();
    const pines: PuntoMapa[] = detalle.reportes.map((reporte) => ({
      lat: reporte.latitud,
      lng: reporte.longitud,
      nivel: reporte.nivelPreliminar,
      id: reporte.id,
      destacado: reporte.id === seleccionadoId,
      titulo: `${reporte.codigoPublico} · ${nivelLabel(reporte.nivelPreliminar)} · a ${reporte.distanciaMetros} m del centro`
    }));

    // El área se dibuja siempre: es el punto crítico en sí —lo que se viene a
    // ver— y sin ella el mapa son pines sueltos sin nada que los agrupe.
    if (detalle.centro) {
      pines.push({
        lat: detalle.centro.latitud,
        lng: detalle.centro.longitud,
        nivel: detalle.nivel,
        // El anillo hueco significa "punto crítico" en la leyenda del mapa. Si la
        // alerta nació de un reporte suelto, el centro NO es un punto crítico:
        // se dibuja el área sola para no mentir sobre lo que hay ahí.
        tipo: detalle.origen === 'PUNTO_CRITICO' ? 'punto_critico' : 'area',
        radioMetros: detalle.radioMetros
      });
    }

    return pines;
  });

  /**
   * Centra el mapa SOLO cuando la selección vino de la lista: ese reporte puede
   * estar fuera de vista. Al abrir o al clickear un pin no se centra, para no
   * deshacer el encuadre que ya muestra todos los pines.
   */
  readonly enfoque = signal<[number, number] | null>(null);

  readonly cantidadReportes = computed(() => this.detalle()?.reportes.length ?? 0);

  constructor() {
    this.cargar(this.alertaId);
    // El breadcrumb muestra el código del reporte, que recién se conoce con la
    // respuesta; al salir de la pantalla vuelve al título de la ruta.
    this.destroyRef.onDestroy(() => this.breadcrumbService.limpiar());
  }

  /** El orden de llegada como texto: `p-tag` sólo acepta string en `value`. */
  numeroOrden(orden: number): string {
    return String(orden);
  }

  canalLabel(canal: AlertaReporteDetalle['canal']): string {
    return canalLabel(canal);
  }

  canalIcono(canal: AlertaReporteDetalle['canal']): string {
    return canalIcono(canal);
  }

  /** Mismo criterio de color que el pin del mapa, vía severidad del tema. */
  severidadNivel(nivel: number | null) {
    return nivelSeveridad(nivel);
  }

  cambiarTab(clave: string | number | undefined): void {
    if (clave != null) {
      this.tabActivo.set(clave as ClaveTab);
    }
  }

  /** Progreso corto para la etiqueta de Tareas ("3/7"). */
  progresoTareas(resumen: SeguimientoResumen): string {
    return `${resumen.tareas.completadas}/${resumen.tareas.total}`;
  }

  /**
   * Un comentario nuevo suma al contador. Se ajusta a mano en vez de recargar
   * el detalle: el componente de la pestaña ya tiene el dato real.
   */
  alSumarComentario(): void {
    this.resumenSeguimiento.update((resumen) =>
      resumen ? { ...resumen, comentarios: resumen.comentarios + 1 } : resumen
    );
    // Un comentario puede traer adjuntos, y las tareas no cambian: se repregunta
    // solo lo que no se puede deducir.
    this.refrescarResumen();
  }

  alCambiarAdjuntos(): void {
    this.refrescarResumen();
  }

  alCambiarTareas(): void {
    this.refrescarResumen();
  }

  seleccionarDesdeMapa(punto: PuntoMapa): void {
    // Sin `enfoque`: el pin clickeado ya está a la vista.
    // El círculo del área también es un punto: no tiene id y no se selecciona.
    if (typeof punto.id === 'number') {
      this.seleccionadoId.set(punto.id);
      this.fichaVisible.set(true);
    }
  }

  seleccionarDesdeLista(evento: ListboxChangeEvent): void {
    const reporte = evento.value as AlertaReporteDetalle | null;
    this.seleccionadoId.set(reporte?.id ?? null);
    this.enfoque.set(reporte ? [reporte.latitud, reporte.longitud] : null);
    // Tocar un reporte es pedir verlo: elegir y además tener que buscar dónde
    // apareció la ficha era un paso de más.
    this.fichaVisible.set(reporte != null);
  }

  cerrarFicha(): void {
    this.fichaVisible.set(false);
  }

  /** Vuelve al tablero. Al abrirse en otra pestaña puede no haber historial. */
  volver(): void {
    this.router.navigate(['/alertas']);
  }

  reintentar(): void {
    this.cargar(this.alertaId);
  }

  /** Relee solo los contadores, sin volver a armar el mapa ni la lista. */
  private refrescarResumen(): void {
    this.service.obtenerDetalle(this.alertaId).subscribe({
      next: (res) => this.resumenSeguimiento.set(res.data?.seguimiento ?? null),
      // Un contador desactualizado no merece un cartel de error.
      error: () => undefined
    });
  }

  private cargar(id: number): void {
    this.loading.set(true);
    this.error.set(false);
    this.seleccionadoId.set(null);
    this.enfoque.set(null);
    this.fichaVisible.set(false);
    this.service.obtenerDetalle(id).subscribe({
      next: (res) => {
        const detalle = res.data ?? null;
        this.detalle.set(detalle);
        this.resumenSeguimiento.set(detalle?.seguimiento ?? null);
        this.breadcrumbService.publicar(etiquetaBreadcrumb(detalle, this.alertaId));
        // Arranca en el reporte más crítico: es el que explica el nivel de la alerta.
        this.seleccionadoId.set(reporteMasCritico(detalle));
        this.loading.set(false);
      },
      error: (err) => {
        this.loading.set(false);
        this.error.set(true);
        this.detalle.set(null);
        const mensaje =
          (err.error as ApiResponse<null>)?.message ?? 'No se pudo cargar el detalle de la alerta.';
        this.messageService.add({ severity: 'error', summary: 'Error', detail: mensaje });
      }
    });
  }
}

/** Reporte de mayor nivel; ante empate, el más reciente (orden mayor). */
function reporteMasCritico(detalle: AlertaDetalleModel | null): number | null {
  const reportes = detalle?.reportes ?? [];
  if (reportes.length === 0) {
    return null;
  }
  return reportes.reduce((mejor, actual) =>
    (actual.nivelPreliminar ?? -1) >= (mejor.nivelPreliminar ?? -1) ? actual : mejor
  ).id;
}

/** Pestañas del modal. `reportes` es la de siempre: el mapa y su lista. */
type ClaveTab = 'reportes' | 'seguimiento' | 'archivos' | 'tareas';

/**
 * Último escalón del breadcrumb: el código del reporte que originó la alerta,
 * que es como la nombra la gente. Una alerta de punto crítico no tiene uno solo,
 * así que ahí se usa el número del punto; si no cargó nada, el de la alerta.
 */
function etiquetaBreadcrumb(detalle: AlertaDetalleModel | null, alertaId: number): string {
  if (detalle?.reporte) {
    return detalle.reporte.codigoPublico;
  }
  if (detalle?.puntoCritico) {
    return `Punto crítico #${detalle.puntoCritico.id}`;
  }
  return `Alerta #${alertaId}`;
}
