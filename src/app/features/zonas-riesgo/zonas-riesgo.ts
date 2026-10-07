import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnDestroy,
  computed,
  inject,
  signal,
  viewChild
} from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import * as L from 'leaflet';
import '@geoman-io/leaflet-geoman-free';
import { ConfirmationService, MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { MessageModule } from 'primeng/message';
import { SelectModule } from 'primeng/select';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { TextareaModule } from 'primeng/textarea';
import { ToggleSwitchModule } from 'primeng/toggleswitch';
import { TooltipModule } from 'primeng/tooltip';
import { AuthService } from '../../core/services/auth.service';
import { ZonasRiesgoService } from '../../core/services/zonas-riesgo.service';
import { ApiResponse } from '../../core/models/api-response.model';
import { permiso, RECURSO } from '../../core/models/permiso.model';
import {
  CRITICIDADES_ZONA,
  CriticidadZona,
  ETIQUETA_CRITICIDAD_ZONA,
  PUNTAJE_F5_ZONA,
  VerticeZona,
  ZonaRiesgo
} from '../../core/models/zona-riesgo.model';
import { colorCriticidadZona } from '../../shared/etiquetas/nivel-colores';
import { escaparHtml } from '../../shared/escapar-html';

/**
 * Editor del MAPA DE RIESGO: el analista dibuja polígonos sobre OpenStreetMap y les
 * pone una criticidad. Es la fuente de F5 del motor (`criticidad.service.ts`).
 *
 * No reusa `app-leaflet-map` a propósito: ese componente dibuja marcadores de
 * reportes a partir de un `input()` y resuelve solapes; acá el mapa es un lienzo
 * de edición con su propio ciclo de vida (Geoman, capas por zona, eventos de
 * dibujo). Mezclar los dos modos en un solo componente volvería frágil al que ya
 * usan el detalle de reporte y el mapa general.
 *
 * Es, junto a `app-leaflet-map`, la otra excepción a "solo PrimeNG": Leaflet y
 * Geoman manejan su propio DOM y sus propios colores.
 */
@Component({
  selector: 'app-zonas-riesgo',
  imports: [
    ReactiveFormsModule,
    ButtonModule,
    CardModule,
    ConfirmDialogModule,
    DialogModule,
    InputTextModule,
    MessageModule,
    SelectModule,
    TableModule,
    TagModule,
    TextareaModule,
    ToggleSwitchModule,
    TooltipModule
  ],
  providers: [ConfirmationService],
  templateUrl: './zonas-riesgo.html',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ZonasRiesgo implements AfterViewInit, OnDestroy {
  private readonly fb = inject(FormBuilder);
  private readonly service = inject(ZonasRiesgoService);
  private readonly authService = inject(AuthService);
  private readonly messageService = inject(MessageService);
  private readonly confirmationService = inject(ConfirmationService);

  private readonly contenedor = viewChild.required<ElementRef<HTMLDivElement>>('contenedor');

  readonly puedeCrear = this.authService.tienePermiso(permiso(RECURSO.ZONA_RIESGO, 'crear'));
  readonly puedeEditar = this.authService.tienePermiso(permiso(RECURSO.ZONA_RIESGO, 'editar'));
  readonly puedeEliminar = this.authService.tienePermiso(permiso(RECURSO.ZONA_RIESGO, 'eliminar'));

  readonly zonas = signal<ZonaRiesgo[]>([]);
  readonly cargando = signal(false);
  readonly guardando = signal(false);

  /** Zona que el diálogo está editando. `null` con el diálogo abierto = alta nueva. */
  readonly zonaEnEdicion = signal<ZonaRiesgo | null>(null);
  readonly dialogoAbierto = signal(false);

  /** Vértices del polígono que se está dando de alta, antes de tener nombre. */
  private poligonoNuevo: VerticeZona[] = [];

  /** `true` mientras se está dibujando: lo refleja el botón de la cabecera. */
  readonly dibujando = signal(false);

  readonly criticidades = CRITICIDADES_ZONA.map((valor) => ({
    value: valor,
    label: `${ETIQUETA_CRITICIDAD_ZONA[valor]} · F5 = ${PUNTAJE_F5_ZONA[valor]}`
  }));

  /**
   * Las filas de `p-table` llegan al template como `any`, asi que indexar los
   * `Record` desde el HTML no typechequea. Se accede por metodo.
   */
  etiquetaCriticidad(criticidad: string): string {
    return ETIQUETA_CRITICIDAD_ZONA[criticidad as CriticidadZona] ?? criticidad;
  }

  readonly form: FormGroup = this.fb.nonNullable.group({
    nombre: ['', [Validators.required, Validators.maxLength(120)]],
    descripcion: ['', [Validators.maxLength(500)]],
    criticidad: ['MEDIA' as CriticidadZona, [Validators.required]],
    activo: [true]
  });

  readonly tituloDialogo = computed(() =>
    this.zonaEnEdicion() ? 'Editar zona de riesgo' : 'Nueva zona de riesgo'
  );

  /** Cuántas zonas activas hay: sin ninguna, F5 no participa del cálculo. */
  readonly activas = computed(() => this.zonas().filter((zona) => zona.activo).length);

  private mapa?: L.Map;
  /** Capa dibujada de cada zona, por id, para poder repintarla o enfocarla. */
  private readonly capas = new Map<number, L.Polygon>();
  private observadorTamano?: ResizeObserver;

  // --- Ciclo de vida del mapa ---

  ngAfterViewInit(): void {
    // Asunción (Paraguay): el mismo centro por defecto que usa `app-leaflet-map`.
    this.mapa = L.map(this.contenedor().nativeElement, {
      center: [-25.2867, -57.647],
      zoom: 12,
      attributionControl: true
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap',
      maxNativeZoom: 19,
      maxZoom: 21
    }).addTo(this.mapa);

    if (this.puedeCrear || this.puedeEditar) {
      this.configurarGeoman();
    }

    // El contenedor puede medirse antes de tener tamaño final, y puede cambiar
    // después (la sección se despliega): sin esto las tiles salen cortadas.
    setTimeout(() => this.mapa?.invalidateSize(), 0);
    this.observadorTamano = new ResizeObserver(() => this.mapa?.invalidateSize());
    this.observadorTamano.observe(this.contenedor().nativeElement);

    this.cargar();
  }

  ngOnDestroy(): void {
    this.observadorTamano?.disconnect();
    this.mapa?.remove();
    this.mapa = undefined;
  }

  /**
   * Barra de Geoman acotada a lo que tiene sentido acá: polígono y rectángulo (que
   * también produce un polígono), más editar y mover.
   *
   * `removalMode` queda APAGADO a propósito: borrar una zona es irreversible y pide
   * confirmación, así que se hace desde la tabla y no con un clic en el mapa.
   */
  private configurarGeoman(): void {
    const mapa = this.mapa;
    if (!mapa) {
      return;
    }

    mapa.pm.addControls({
      position: 'topright',
      drawPolygon: this.puedeCrear,
      drawRectangle: this.puedeCrear,
      editMode: this.puedeEditar,
      dragMode: this.puedeEditar,
      drawMarker: false,
      drawCircle: false,
      drawCircleMarker: false,
      drawPolyline: false,
      drawText: false,
      cutPolygon: false,
      removalMode: false,
      rotateMode: false
    });

    mapa.pm.setLang('es');

    // El estado de dibujo se sincroniza con el botón de la cabecera, que es la vía
    // visible para empezar: la barra de Geoman son íconos chicos en una esquina del
    // mapa, y además depende de que su hoja de estilos haya cargado.
    mapa.on('pm:drawstart', () => this.dibujando.set(true));
    mapa.on('pm:drawend', () => this.dibujando.set(false));

    mapa.on('pm:create', (evento: { layer: L.Layer }) => {
      const capa = evento.layer as L.Polygon;
      this.poligonoNuevo = this.verticesDe(capa);

      // La capa recién dibujada se descarta: si el alta se confirma, el polígono
      // vuelve del backend y se repinta con todo lo demás; si se cancela, no quedó
      // nada suelto en el mapa.
      capa.remove();

      if (this.poligonoNuevo.length < 3) {
        this.messageService.add({
          severity: 'warn',
          summary: 'Polígono incompleto',
          detail: 'Una zona necesita al menos tres vértices.'
        });
        return;
      }

      this.abrirDialogo(null);
    });
  }

  /**
   * Arranca el dibujo de una zona nueva desde el botón de la cabecera. Equivale a
   * apretar el polígono en la barra de Geoman, pero visible.
   */
  iniciarDibujo(): void {
    this.mapa?.pm.enableDraw('Polygon', { snappable: true, snapDistance: 20 });
  }

  cancelarDibujo(): void {
    this.mapa?.pm.disableDraw();
    this.dibujando.set(false);
  }

  /** Vértices del anillo exterior, en el formato que espera el backend. */
  private verticesDe(capa: L.Polygon): VerticeZona[] {
    const anillos = capa.getLatLngs() as L.LatLng[] | L.LatLng[][];
    const exterior = (Array.isArray(anillos[0]) ? anillos[0] : anillos) as L.LatLng[];
    return exterior.map((punto) => ({ lat: punto.lat, lng: punto.lng }));
  }

  // --- Datos ---

  private cargar(): void {
    this.cargando.set(true);
    this.service.listar().subscribe({
      next: (res) => {
        this.cargando.set(false);
        this.zonas.set(res.data ?? []);
        this.repintar();
      },
      error: (err: unknown) => {
        this.cargando.set(false);
        this.avisarError(err, 'No se pudieron cargar las zonas de riesgo.');
      }
    });
  }

  /** Redibuja todas las zonas desde cero. El volumen es de decenas, no de miles. */
  private repintar(): void {
    const mapa = this.mapa;
    if (!mapa) {
      return;
    }

    for (const capa of this.capas.values()) {
      capa.remove();
    }
    this.capas.clear();

    for (const zona of this.zonas()) {
      const color = colorCriticidadZona(zona.criticidad);
      const capa = L.polygon(
        zona.poligono.map((vertice) => [vertice.lat, vertice.lng] as [number, number]),
        {
          color,
          weight: 2,
          // Una zona inactiva no cuenta para F5: se dibuja apenas visible para que
          // se note que está ahí pero que no está pesando en el cálculo.
          fillOpacity: zona.activo ? 0.25 : 0.05,
          dashArray: zona.activo ? undefined : '6 6'
        }
      ).addTo(mapa);

      // El tooltip va como ELEMENTO, no como string: `bindTooltip` con un string
      // hace `innerHTML = content` (leaflet-src.js), y `zona.nombre` lo escribe un
      // analista. Con `.textContent` no hay markup que interpretar.
      const tooltip = document.createElement('span');
      tooltip.textContent =
        `${zona.nombre} · ${ETIQUETA_CRITICIDAD_ZONA[zona.criticidad]} (F5 = ${zona.puntajeF5})` +
        (zona.activo ? '' : ' · inactiva');
      capa.bindTooltip(tooltip, { sticky: true });

      // Mover un vértice o arrastrar la zona guarda la geometría nueva en el acto:
      // un polígono editado y no guardado es un mapa que miente.
      capa.on('pm:update', () => this.guardarGeometria(zona.id, this.verticesDe(capa)));
      capa.on('click', () => {
        if (!mapa.pm.globalEditModeEnabled() && !mapa.pm.globalDragModeEnabled()) {
          this.abrirDialogo(zona);
        }
      });

      this.capas.set(zona.id, capa);
    }
  }

  private guardarGeometria(id: number, poligono: VerticeZona[]): void {
    this.service.actualizar(id, { poligono }).subscribe({
      next: (res) => {
        this.reemplazar(res.data);
        this.messageService.add({
          severity: 'success',
          summary: 'Zona actualizada',
          detail: 'Se guardó la forma nueva.'
        });
      },
      error: (err: unknown) => {
        this.avisarError(err, 'No se pudo guardar la forma nueva.');
        // El mapa quedó mostrando algo que el backend no aceptó: se recarga para
        // que lo dibujado y lo guardado vuelvan a coincidir.
        this.cargar();
      }
    });
  }

  private reemplazar(zona: ZonaRiesgo | null): void {
    if (!zona) {
      return;
    }
    const existe = this.zonas().some((item) => item.id === zona.id);
    this.zonas.update((lista) =>
      existe ? lista.map((item) => (item.id === zona.id ? zona : item)) : [...lista, zona]
    );
    this.repintar();
  }

  // --- Diálogo ---

  abrirDialogo(zona: ZonaRiesgo | null): void {
    this.zonaEnEdicion.set(zona);
    this.form.reset({
      nombre: zona?.nombre ?? '',
      descripcion: zona?.descripcion ?? '',
      criticidad: zona?.criticidad ?? 'MEDIA',
      activo: zona?.activo ?? true
    });
    this.dialogoAbierto.set(true);
  }

  cerrarDialogo(): void {
    this.dialogoAbierto.set(false);
    this.zonaEnEdicion.set(null);
    this.poligonoNuevo = [];
  }

  guardar(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const valor = this.form.getRawValue();
    const datos = {
      nombre: valor.nombre.trim(),
      descripcion: valor.descripcion.trim() || null,
      // `form` esta anotado como `FormGroup` a secas (igual que en el resto del
      // panel), asi que `getRawValue()` devuelve `any`.
      criticidad: valor.criticidad as CriticidadZona,
      activo: valor.activo as boolean
    };

    const zona = this.zonaEnEdicion();
    const peticion = zona
      ? this.service.actualizar(zona.id, datos)
      : this.service.crear({ ...datos, poligono: this.poligonoNuevo });

    this.guardando.set(true);
    peticion.subscribe({
      next: (res) => {
        this.guardando.set(false);
        this.reemplazar(res.data);
        this.messageService.add({
          severity: 'success',
          summary: zona ? 'Zona actualizada' : 'Zona creada',
          detail: `"${datos.nombre}" aporta F5 = ${PUNTAJE_F5_ZONA[datos.criticidad]} a los reportes que caigan adentro.`
        });
        this.cerrarDialogo();
      },
      error: (err: unknown) => {
        this.guardando.set(false);
        this.avisarError(err, 'No se pudo guardar la zona.');
      }
    });
  }

  confirmarEliminar(zona: ZonaRiesgo): void {
    this.confirmationService.confirm({
      header: 'Eliminar la zona',
      // `p-confirmdialog` renderiza su `message` con `[innerHTML]`, asi que el
      // nombre va escapado. El `header` NO lo necesita (va por interpolacion), pero
      // igual es texto fijo.
      message: `"${escaparHtml(zona.nombre)}" se borra del mapa de riesgo. Los reportes que ya se calcularon conservan su resultado; los que se recalculen a partir de ahora dejan de contarla.`,
      icon: 'pi pi-exclamation-triangle',
      rejectButtonProps: { label: 'Cancelar', severity: 'secondary', text: true, rounded: true },
      acceptButtonProps: { label: 'Eliminar', severity: 'danger', rounded: true },
      accept: () => this.eliminar(zona)
    });
  }

  private eliminar(zona: ZonaRiesgo): void {
    this.service.eliminar(zona.id).subscribe({
      next: () => {
        this.zonas.update((lista) => lista.filter((item) => item.id !== zona.id));
        this.repintar();
        this.messageService.add({
          severity: 'success',
          summary: 'Zona eliminada',
          detail: `"${zona.nombre}" ya no forma parte del mapa de riesgo.`
        });
      },
      error: (err: unknown) => this.avisarError(err, 'No se pudo eliminar la zona.')
    });
  }

  /** Centra el mapa en una zona desde la tabla. */
  enfocar(zona: ZonaRiesgo): void {
    const capa = this.capas.get(zona.id);
    if (capa && this.mapa) {
      this.mapa.fitBounds(capa.getBounds(), { maxZoom: 16 });
    }
  }

  private avisarError(err: unknown, porDefecto: string): void {
    const mensaje = (err as { error?: ApiResponse<null> })?.error?.message ?? porDefecto;
    this.messageService.add({ severity: 'error', summary: 'Error', detail: mensaje });
  }
}
