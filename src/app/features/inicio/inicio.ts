import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';
import { ChartModule } from 'primeng/chart';
import { SkeletonModule } from 'primeng/skeleton';
import { TagModule } from 'primeng/tag';
import { TooltipModule } from 'primeng/tooltip';
import { AnalisisService } from '../../core/services/analisis.service';
import { AlertasService } from '../../core/services/alertas.service';
import { ReportesAdminService } from '../../core/services/reportes-admin.service';
import { AuthService } from '../../core/services/auth.service';
import { TemaService } from '../../core/services/tema.service';
import { AnalisisResumen } from '../../core/models/analisis.model';
import { AlertaListItem } from '../../core/models/alerta.model';
import { Canal, ReporteListItem } from '../../core/models/reporte.model';
import { permiso, RECURSO } from '../../core/models/permiso.model';
import { NivelTag } from '../../shared/nivel-tag/nivel-tag';
import { EstadoAlertaTag } from '../../shared/estado-alerta-tag/estado-alerta-tag';
import { canalIcono, canalLabel, nivelLabel } from '../../shared/etiquetas/reporte-etiquetas';
import { COLOR_NIVEL } from '../../shared/etiquetas/nivel-colores';

/** Días de la tira de pulso: dos semanas entran sin apretar en una tarjeta. */
const DIAS_PULSO = 14;

/**
 * Inicio del panel: la pantalla de triage.
 *
 * No repite el análisis (eso vive en `/analisis`): responde una sola pregunta,
 * "¿qué necesita atención ahora?", y deja la acción a un clic. Por eso abre con
 * la situación **escrita**, no con un tablero de cifras: un sistema de alerta
 * temprana tiene que decirte qué pasa, no hacerte armar el cuadro.
 */
@Component({
  selector: 'app-inicio',
  imports: [
    DatePipe,
    RouterLink,
    ButtonModule,
    CardModule,
    ChartModule,
    SkeletonModule,
    TagModule,
    TooltipModule,
    NivelTag,
    EstadoAlertaTag
  ],
  templateUrl: './inicio.html',
  styleUrl: './inicio.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class Inicio {
  private readonly analisisService = inject(AnalisisService);
  private readonly alertasService = inject(AlertasService);
  private readonly reportesService = inject(ReportesAdminService);
  private readonly authService = inject(AuthService);
  private readonly tema = inject(TemaService);

  readonly saludo = obtenerSaludo();
  readonly nombre = computed(() => this.authService.usuarioActual()?.nombres ?? null);
  readonly hoy = new Date();

  readonly puedeVerReportes = this.authService.tienePermiso(permiso(RECURSO.REPORTE, 'ver'));
  readonly puedeVerAlertas = this.authService.tienePermiso(permiso(RECURSO.ALERTA, 'ver'));

  readonly resumen = signal<AnalisisResumen | null>(null);
  readonly alertas = signal<AlertaListItem[]>([]);
  readonly reportes = signal<ReporteListItem[]>([]);

  readonly cargandoResumen = signal(false);
  readonly cargandoAlertas = signal(false);
  readonly cargandoReportes = signal(false);
  readonly error = signal(false);

  readonly filasSkeleton = Array.from({ length: 3 });

  /**
   * Totales REALES de alertas abiertas y sin atender: salen del resumen, no de
   * la lista (que trae solo las primeras). Si el resumen falló, se cae al
   * tamaño de la lista para no mentir hacia arriba.
   */
  readonly alertasAbiertas = computed(
    () => this.resumen()?.situacion.alertasActivasTotal ?? this.alertas().length
  );
  readonly sinAtender = computed(
    () => this.resumen()?.gestion.sinAtender ?? this.alertas().filter((a) => a.estado === 'NUEVA').length
  );

  /** Cuántas quedaron fuera de la lista corta. */
  readonly alertasNoListadas = computed(() => Math.max(0, this.alertasAbiertas() - this.alertas().length));

  readonly hayAlgoQueMirar = computed(() => this.alertas().length > 0);

  /** Reportes cuyo análisis todavía no cerró: la cola del job de IA. */
  readonly sinAnalizar = computed(() => this.resumen()?.situacion.sinAnalizar ?? 0);

  readonly cifras = computed(() => {
    const situacion = this.resumen()?.situacion;
    return [
      { etiqueta: 'Reportes hoy', valor: situacion?.reportes24h ?? 0, ruta: '/reportes' },
      { etiqueta: 'Últimos 7 días', valor: situacion?.reportes7d ?? 0, ruta: '/reportes' },
      { etiqueta: 'Esperando análisis', valor: situacion?.sinAnalizar ?? 0, ruta: '/reportes' },
      { etiqueta: 'Puntos críticos', valor: situacion?.puntosCriticosActivos ?? 0, ruta: '/mapa' }
    ];
  });

  /** Tira de pulso: reportes por día apilados por nivel, últimas dos semanas. */
  readonly pulsoData = computed(() => {
    const dias = (this.resumen()?.tendencia ?? []).slice(-DIAS_PULSO);
    // El separador entre segmentos tiene que ser el color de la tarjeta, no un
    // blanco fijo: en tema oscuro dibujaba rayas claras sobre el gráfico.
    const fondoTarjeta = this.tema.token('--p-content-background');
    const series = [
      { etiqueta: nivelLabel(3), color: COLOR_NIVEL[3], valores: dias.map((d) => d.nivel3) },
      { etiqueta: nivelLabel(2), color: COLOR_NIVEL[2], valores: dias.map((d) => d.nivel2) },
      { etiqueta: nivelLabel(1), color: COLOR_NIVEL[1], valores: dias.map((d) => d.nivel1) },
      { etiqueta: nivelLabel(0), color: COLOR_NIVEL[0], valores: dias.map((d) => d.nivel0) }
    ];

    return {
      labels: dias.map((d) => etiquetaDia(d.fecha)),
      datasets: series.map((serie) => ({
        label: serie.etiqueta,
        data: serie.valores,
        backgroundColor: serie.color,
        borderColor: fondoTarjeta,
        borderWidth: { top: 2, right: 0, bottom: 0, left: 0 },
        borderRadius: 3,
        borderSkipped: false,
        stack: 'dia',
        maxBarThickness: 18
      }))
    };
  });

  readonly pulsoOpciones = computed(() => {
    const textoTenue = this.tema.token('--p-text-muted-color');

    return {
      maintainAspectRatio: false,
      // Tira de pulso: sin ejes ni leyenda. La lectura es la forma; el detalle,
      // el tooltip. Los números exactos viven en Análisis.
      interaction: { mode: 'index' as const, intersect: false },
      plugins: { legend: { display: false }, tooltip: { mode: 'index' as const, intersect: false } },
      scales: {
        x: {
          stacked: true,
          ticks: { color: textoTenue, maxRotation: 0, autoSkipPadding: 24, font: { size: 10 } },
          grid: { display: false },
          border: { display: false }
        },
        y: { stacked: true, display: false, beginAtZero: true }
      }
    };
  });

  readonly totalPulso = computed(() =>
    (this.resumen()?.tendencia ?? []).slice(-DIAS_PULSO).reduce((total, dia) => total + dia.total, 0)
  );

  constructor() {
    this.cargar();
  }

  reintentar(): void {
    this.cargar();
  }

  nivelLabel(nivel: number | null): string {
    return nivelLabel(nivel);
  }

  canalLabel(canal: Canal): string {
    return canalLabel(canal);
  }

  canalIcono(canal: Canal): string {
    return canalIcono(canal);
  }

  /** "hace 3 h", "hace 2 d": en triage importa la antigüedad, no la fecha exacta. */
  hace(iso: string): string {
    const minutos = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
    if (minutos < 1) {
      return 'recién';
    }
    if (minutos < 60) {
      return `hace ${minutos} min`;
    }
    const horas = Math.round(minutos / 60);
    if (horas < 24) {
      return `hace ${horas} h`;
    }
    const dias = Math.round(horas / 24);
    return dias === 1 ? 'ayer' : `hace ${dias} d`;
  }

  private cargar(): void {
    this.error.set(false);

    if (this.puedeVerReportes) {
      this.cargandoResumen.set(true);
      this.analisisService.obtenerResumen().subscribe({
        next: (res) => {
          this.resumen.set(res.data ?? null);
          this.cargandoResumen.set(false);
        },
        error: () => {
          this.cargandoResumen.set(false);
          this.error.set(true);
        }
      });

      this.cargandoReportes.set(true);
      this.reportesService.listar({ page: 1, pageSize: 6 }).subscribe({
        next: (res) => {
          this.reportes.set(res.data ?? []);
          this.cargandoReportes.set(false);
        },
        error: () => {
          this.cargandoReportes.set(false);
          this.error.set(true);
        }
      });
    }

    if (this.puedeVerAlertas) {
      this.cargandoAlertas.set(true);
      this.alertasService.listar({ page: 1, pageSize: 5, activas: true }).subscribe({
        next: (res) => {
          this.alertas.set(res.data ?? []);
          this.cargandoAlertas.set(false);
        },
        error: () => {
          this.cargandoAlertas.set(false);
          this.error.set(true);
        }
      });
    }
  }
}

function obtenerSaludo(): string {
  const hora = new Date().getHours();
  if (hora < 12) {
    return 'Buenos días';
  }
  if (hora < 20) {
    return 'Buenas tardes';
  }
  return 'Buenas noches';
}

/** `2026-08-20` -> `20/08`. La fecha ya viene cortada en hora local por el back. */
function etiquetaDia(fecha: string): string {
  const [, mes, dia] = fecha.split('-');
  return `${dia}/${mes}`;
}
