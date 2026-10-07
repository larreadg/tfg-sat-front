import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';
import { CheckboxChangeEvent, CheckboxModule } from 'primeng/checkbox';
import { DatePickerModule } from 'primeng/datepicker';
import { SelectModule } from 'primeng/select';
import { SkeletonModule } from 'primeng/skeleton';
import { TooltipModule } from 'primeng/tooltip';
import { AuthService } from '../../core/services/auth.service';
import { MapaService } from '../../core/services/mapa.service';
import { ZonasRiesgoService } from '../../core/services/zonas-riesgo.service';
import { ApiResponse } from '../../core/models/api-response.model';
import { MapaFiltros, MapaGeoJson, PropiedadesPuntoCritico, PropiedadesReporte } from '../../core/models/mapa.model';
import { Canal, EstadoEvaluacionIa } from '../../core/models/reporte.model';
import { permiso, RECURSO } from '../../core/models/permiso.model';
import { ETIQUETA_CRITICIDAD_ZONA, ZonaRiesgo } from '../../core/models/zona-riesgo.model';
import { FiltrosPanel } from '../../shared/filtros-panel/filtros-panel';
import {
  etiquetaOpcion,
  etiquetaRango,
  resumenFiltros
} from '../../shared/filtros-panel/filtros-resumen';
import { LeafletMap, PoligonoMapa, PuntoMapa } from '../../shared/leaflet-map/leaflet-map';
import { NivelTag } from '../../shared/nivel-tag/nivel-tag';
import { canalLabel, nivelLabel } from '../../shared/etiquetas/reporte-etiquetas';
import { colorCriticidadZona } from '../../shared/etiquetas/nivel-colores';
import { escaparHtml } from '../../shared/escapar-html';

interface Opcion<T> {
  label: string;
  value: T;
}

@Component({
  selector: 'app-mapa',
  imports: [
    FormsModule,
    ButtonModule,
    CardModule,
    CheckboxModule,
    DatePickerModule,
    SelectModule,
    SkeletonModule,
    TooltipModule,
    LeafletMap,
    NivelTag,
    FiltrosPanel
  ],
  templateUrl: './mapa.html',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class Mapa {
  private readonly service = inject(MapaService);
  private readonly zonasService = inject(ZonasRiesgoService);
  private readonly messageService = inject(MessageService);
  private readonly authService = inject(AuthService);

  /**
   * El check solo tiene sentido para quien puede leer las zonas. La ruta del mapa
   * pide `reporte.ver`, que no implica `zona_riesgo.ver`: sin esto, a ese usuario
   * le aparecería un control que siempre deja el mapa igual. Es UX — la barrera
   * real es `requirePermiso` en el back.
   */
  readonly puedeVerZonas = computed(() =>
    this.authService.tienePermiso(permiso(RECURSO.ZONA_RIESGO, 'ver'))
  );

  readonly puntos = signal<PuntoMapa[]>([]);
  readonly loading = signal(false);
  readonly error = signal(false);
  readonly cantidadReportes = signal(0);
  readonly cantidadPuntosCriticos = signal(0);

  // --- Capa de zonas de riesgo ---
  /**
   * Prendida por defecto: las zonas son el contexto que explica el F5 de los
   * reportes que se están mirando, así que el estado útil al entrar es verlas.
   */
  readonly mostrarZonas = signal(true);

  readonly zonas = signal<ZonaRiesgo[]>([]);

  /**
   * Las zonas ya traducidas a polígonos del mapa. Apagar el check pasa `[]`, y el
   * mapa limpia su capa de áreas sin tocar los marcadores ni el encuadre.
   *
   * Es un `computed` y NO un getter: un getter devolvería un array nuevo en cada
   * ciclo de render, el `input()` del mapa lo vería como un valor distinto cada
   * vez y redibujaría los polígonos sin parar (la versión en getter de esto es el
   * mismo problema que el gotcha de `[ngModel]` atado a un método, en CLAUDE.md).
   * El `computed` conserva la referencia mientras no cambien ni las zonas ni el
   * check.
   */
  readonly poligonosZonas = computed<PoligonoMapa[]>(() => {
    if (!this.mostrarZonas()) {
      return [];
    }
    return this.zonas().map((zona) => ({
      id: zona.id,
      vertices: zona.poligono,
      color: colorCriticidadZona(zona.criticidad),
      // Una zona inactiva no cuenta para F5: se dibuja apenas visible, igual que
      // en la pantalla Zonas de riesgo, para que se note que está pero que no
      // está pesando en el cálculo.
      atenuado: !zona.activo,
      titulo:
        `${zona.nombre} · ${ETIQUETA_CRITICIDAD_ZONA[zona.criticidad]} (F5 = ${zona.puntajeF5})` +
        (zona.activo ? '' : ' · inactiva')
    }));
  });

  /** Cuántas zonas se están dibujando ahora mismo (para la leyenda). */
  readonly cantidadZonas = computed(() => this.poligonosZonas().length);

  readonly hoy = new Date();
  readonly nivelesLeyenda = [0, 1, 2, 3];

  rango: Date[] | null = null;
  canal: Canal | null = null;
  estado: EstadoEvaluacionIa | null = null;
  nivel: number | null = null;

  readonly canalOpciones: Opcion<Canal>[] = [
    { label: 'Web', value: 'WEB' },
    { label: 'WhatsApp', value: 'WHATSAPP' },
    { label: 'Telegram', value: 'TELEGRAM' }
  ];

  readonly estadoOpciones: Opcion<EstadoEvaluacionIa>[] = [
    { label: 'Pendiente', value: 'PENDIENTE' },
    { label: 'Procesando', value: 'PROCESANDO' },
    { label: 'Analizado', value: 'COMPLETADO' },
    { label: 'Error', value: 'ERROR' }
  ];

  readonly nivelOpciones: Opcion<number>[] = [
    { label: 'Informativo', value: 0 },
    { label: 'Bajo', value: 1 },
    { label: 'Medio', value: 2 },
    { label: 'Alto', value: 3 }
  ];

  /** Filtros ya aplicados, para la cabecera del panel colapsado. */
  readonly filtrosAplicados = signal<string[]>([]);

  constructor() {
    this.cargar();
    if (this.puedeVerZonas()) {
      this.cargarZonas();
    }
  }

  aplicar(): void {
    this.cargar();
  }

  limpiar(): void {
    this.rango = null;
    this.canal = null;
    this.estado = null;
    this.nivel = null;
    this.cargar();
  }

  reintentar(): void {
    this.cargar();
  }

  /**
   * `(onChange)` del propio `p-checkbox` y no `[(ngModel)]` sobre el signal:
   * `ngModel` no escribe en un `WritableSignal`, y `(ngModelChange)` también se
   * dispara cuando el valor lo escribe el binding (ver el gotcha en CLAUDE.md).
   * `checked` viene tipado `any` desde PrimeNG, de ahí el `=== true`.
   */
  alternarZonas(evento: CheckboxChangeEvent): void {
    this.mostrarZonas.set(evento.checked === true);
  }

  private cargar(): void {
    this.filtrosAplicados.set(
      resumenFiltros(
        etiquetaRango(this.rango),
        etiquetaOpcion(this.canal, this.canalOpciones),
        etiquetaOpcion(this.estado, this.estadoOpciones),
        etiquetaOpcion(this.nivel, this.nivelOpciones)
      )
    );

    const filtros: MapaFiltros = {
      canal: this.canal ?? undefined,
      estado: this.estado ?? undefined,
      nivel: this.nivel ?? undefined,
      desde: this.rango?.[0] ? inicioDelDia(this.rango[0]).toISOString() : undefined,
      hasta: this.rango?.[1] ? finDelDia(this.rango[1]).toISOString() : undefined
    };

    this.loading.set(true);
    this.error.set(false);
    this.service.obtenerMapa(filtros).subscribe({
      next: (res) => {
        const geo = res.data;
        this.puntos.set(geo ? this.aPuntos(geo) : []);
        this.actualizarConteos(geo);
        this.loading.set(false);
      },
      error: (err) => {
        this.loading.set(false);
        this.error.set(true);
        this.puntos.set([]);
        this.cantidadReportes.set(0);
        this.cantidadPuntosCriticos.set(0);
        const mensaje = (err.error as ApiResponse<null>)?.message ?? 'No se pudo cargar el mapa.';
        this.messageService.add({ severity: 'error', summary: 'Error', detail: mensaje });
      }
    });
  }

  /**
   * Las zonas se piden UNA vez, al entrar, y no en cada `cargar()`: no dependen
   * de los filtros de reportes (son geografía cargada a mano, no resultado de una
   * consulta por fecha o canal). Si falla, el mapa de reportes sigue andando: se
   * avisa y la capa queda vacía.
   */
  private cargarZonas(): void {
    this.zonasService.listar().subscribe({
      next: (res) => this.zonas.set(res.data ?? []),
      error: () => {
        this.zonas.set([]);
        this.messageService.add({
          severity: 'warn',
          summary: 'Zonas de riesgo',
          detail: 'No se pudieron cargar las zonas. El mapa de reportes sigue disponible.'
        });
      }
    });
  }

  private aPuntos(geo: MapaGeoJson): PuntoMapa[] {
    return geo.features.map((feature) => {
      const [lng, lat] = feature.geometry.coordinates;
      const props = feature.properties;
      if (props.tipo === 'punto_critico') {
        return {
          lat,
          lng,
          nivel: props.nivel,
          tipo: 'punto_critico',
          radioMetros: props.radioMetros,
          popupHtml: this.popupPuntoCritico(props)
        };
      }
      return {
        lat,
        lng,
        nivel: props.nivelPreliminar,
        tipo: 'reporte',
        popupHtml: this.popupReporte(props)
      };
    });
  }

  private actualizarConteos(geo: MapaGeoJson | null): void {
    const features = geo?.features ?? [];
    this.cantidadReportes.set(features.filter((f) => f.properties.tipo === 'reporte').length);
    this.cantidadPuntosCriticos.set(features.filter((f) => f.properties.tipo === 'punto_critico').length);
  }

  /**
   * Leaflet hace `innerHTML` con el string del popup, asi que todo lo interpolado
   * va escapado. Hoy ningun campo de aca es texto libre (`codigoPublico` es
   * `AGD-0000007`, generado por una secuencia; el resto son enums y numeros), pero
   * el `Reporte` ya guarda `barrio` y `calle` que vienen de Nominatim: el dia que
   * alguien los sume a este popup, el escape tiene que estar puesto de antes.
   */
  private popupReporte(props: PropiedadesReporte): string {
    const fecha = formatearFecha(props.fecha);
    return `
      <div style="min-width:150px">
        <strong>${escaparHtml(props.codigoPublico)}</strong><br>
        Nivel ${escaparHtml(nivelLabel(props.nivelPreliminar))}<br>
        ${escaparHtml(canalLabel(props.canal))} · ${escaparHtml(fecha)}<br>
        <a href="/reportes/${encodeURIComponent(String(props.id))}">Ver detalle</a>
      </div>`;
  }

  private popupPuntoCritico(props: PropiedadesPuntoCritico): string {
    return `
      <div style="min-width:150px">
        <strong>Punto crítico</strong><br>
        Nivel ${escaparHtml(nivelLabel(props.nivel))}<br>
        ${escaparHtml(props.cantidadReportes)} reportes agrupados<br>
        Radio ${escaparHtml(props.radioMetros)} m
      </div>`;
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

function formatearFecha(iso: string): string {
  const fecha = new Date(iso);
  return fecha.toLocaleString('es', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
}
