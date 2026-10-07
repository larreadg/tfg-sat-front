import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';
import { ChartModule } from 'primeng/chart';
import { DatePickerModule } from 'primeng/datepicker';
import { ProgressBarModule } from 'primeng/progressbar';
import { SkeletonModule } from 'primeng/skeleton';
import { TableModule } from 'primeng/table';
import { TooltipModule } from 'primeng/tooltip';
import { AnalisisService } from '../../core/services/analisis.service';
import { TemaService } from '../../core/services/tema.service';
import { ApiResponse } from '../../core/models/api-response.model';
import {
  AnalisisFiltros,
  AnalisisResumen,
  PromedioFactor,
  PuntoCriticoTop
} from '../../core/models/analisis.model';
import { Canal, EstadoEvaluacionIa } from '../../core/models/reporte.model';
import { EstadoAlerta } from '../../core/models/alerta.model';
import { FiltrosPanel } from '../../shared/filtros-panel/filtros-panel';
import { etiquetaRango } from '../../shared/filtros-panel/filtros-resumen';
import { NivelTag } from '../../shared/nivel-tag/nivel-tag';
import { canalIcono, canalLabel, estadoIaLabel, nivelLabel } from '../../shared/etiquetas/reporte-etiquetas';
import { estadoAlertaLabel } from '../../shared/etiquetas/alerta-etiquetas';
import { COLOR_NIVEL, COLOR_SIN_NIVEL } from '../../shared/etiquetas/nivel-colores';

/** Criticidad maxima del motor (ERS §5.1): escala de las barras de factores. */
const CRITICIDAD_MAX = 5;

/**
 * Panel de análisis: responde cuatro preguntas que ninguna otra pantalla
 * responde — qué está pasando ahora, si está escalando, de dónde sale el riesgo
 * y si el pipeline de IA está funcionando. Todo sale de un solo endpoint
 * (`GET /admin/analisis/resumen`).
 */
@Component({
  selector: 'app-analisis',
  imports: [
    FormsModule,
    RouterLink,
    ButtonModule,
    CardModule,
    ChartModule,
    DatePickerModule,
    ProgressBarModule,
    SkeletonModule,
    TableModule,
    TooltipModule,
    NivelTag,
    FiltrosPanel
  ],
  templateUrl: './analisis.html',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class Analisis {
  private readonly service = inject(AnalisisService);
  private readonly messageService = inject(MessageService);
  private readonly tema = inject(TemaService);

  readonly hoy = new Date();

  readonly resumen = signal<AnalisisResumen | null>(null);
  readonly loading = signal(false);
  readonly error = signal(false);

  rango: Date[] | null = null;

  /** Período aplicado, para la cabecera del panel colapsado. */
  readonly filtrosAplicados = signal<string[]>([]);

  readonly nivelesLeyenda = [3, 2, 1, 0];

  /** Serie diaria apilada por nivel. Es el único bloque que necesita un gráfico. */
  readonly tendenciaData = computed(() => {
    const dias = this.resumen()?.tendencia ?? [];
    // El separador entre segmentos tiene que ser el color de la tarjeta, no un
    // blanco fijo: en tema oscuro dibujaba rayas claras sobre el gráfico.
    const fondoTarjeta = this.tema.token('--p-content-background');
    const haySinNivel = dias.some((d) => d.sinNivel > 0);

    // El nivel más severo va contra la base: es el que se lee primero.
    const series = [
      { etiqueta: 'Alto', color: COLOR_NIVEL[3], valores: dias.map((d) => d.nivel3) },
      { etiqueta: 'Medio', color: COLOR_NIVEL[2], valores: dias.map((d) => d.nivel2) },
      { etiqueta: 'Bajo', color: COLOR_NIVEL[1], valores: dias.map((d) => d.nivel1) },
      { etiqueta: 'Informativo', color: COLOR_NIVEL[0], valores: dias.map((d) => d.nivel0) }
    ];
    if (haySinNivel) {
      series.push({ etiqueta: 'Sin calcular', color: COLOR_SIN_NIVEL, valores: dias.map((d) => d.sinNivel) });
    }

    return {
      labels: dias.map((d) => etiquetaDia(d.fecha)),
      datasets: series.map((serie) => ({
        label: serie.etiqueta,
        data: serie.valores,
        backgroundColor: serie.color,
        // 2px de superficie entre segmentos apilados: separa sin depender del color.
        borderColor: fondoTarjeta,
        borderWidth: { top: 2, right: 0, bottom: 0, left: 0 },
        borderRadius: 4,
        borderSkipped: false,
        stack: 'reportes',
        maxBarThickness: 28
      }))
    };
  });

  readonly tendenciaOpciones = computed(() => {
    const textoTenue = this.tema.token('--p-text-muted-color');
    const borde = this.tema.token('--p-content-border-color');

    return {
      maintainAspectRatio: false,
      // Tooltip por día completo: comparar niveles dentro del día es la lectura útil.
      interaction: { mode: 'index' as const, intersect: false },
      plugins: {
        legend: {
          position: 'bottom' as const,
          labels: { color: textoTenue, usePointStyle: true, boxWidth: 8, boxHeight: 8 }
        },
        tooltip: { mode: 'index' as const, intersect: false }
      },
      scales: {
        x: {
          stacked: true,
          ticks: { color: textoTenue, maxRotation: 0, autoSkipPadding: 16 },
          grid: { display: false },
          border: { color: borde }
        },
        y: {
          stacked: true,
          beginAtZero: true,
          ticks: { color: textoTenue, precision: 0 },
          grid: { color: borde, drawTicks: false },
          border: { display: false }
        }
      }
    };
  });

  /** Mezcla de niveles del período: una sola barra horizontal apilada. */
  readonly mezclaData = computed(() => {
    const distribucion = this.resumen()?.factores.distribucionNivel ?? [];
    const fondoTarjeta = this.tema.token('--p-content-background');
    return {
      labels: ['Reportes'],
      datasets: [3, 2, 1, 0]
        .map((nivel) => ({
          label: nivelLabel(nivel),
          data: [distribucion.find((d) => d.nivel === nivel)?.cantidad ?? 0],
          backgroundColor: COLOR_NIVEL[nivel],
          borderColor: fondoTarjeta,
          borderWidth: { top: 0, right: 2, bottom: 0, left: 0 },
          borderRadius: 4,
          borderSkipped: false,
          stack: 'niveles'
        }))
        .filter((dataset) => dataset.data[0] > 0)
    };
  });

  readonly mezclaOpciones = computed(() => {
    const textoTenue = this.tema.token('--p-text-muted-color');

    return {
      indexAxis: 'y' as const,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'bottom' as const,
          labels: { color: textoTenue, usePointStyle: true, boxWidth: 8, boxHeight: 8 }
        }
      },
      scales: {
        x: { stacked: true, display: false, beginAtZero: true },
        y: { stacked: true, display: false }
      }
    };
  });

  readonly hayDatosPeriodo = computed(() => (this.resumen()?.situacion.reportesPeriodo ?? 0) > 0);

  constructor() {
    this.cargar();
  }

  aplicar(): void {
    this.cargar();
  }

  limpiar(): void {
    this.rango = null;
    this.cargar();
  }

  reintentar(): void {
    this.cargar();
  }

  /** Ancho de la barra de un factor: la escala del motor es 0–5. */
  porcentajeFactor(factor: PromedioFactor): number {
    return factor.promedio == null ? 0 : (factor.promedio / CRITICIDAD_MAX) * 100;
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

  estadoIaLabel(estado: EstadoEvaluacionIa): string {
    return estadoIaLabel(estado);
  }

  estadoAlertaLabel(estado: EstadoAlerta): string {
    return estadoAlertaLabel(estado);
  }

  /** Duraciones legibles: "45 s", "12 min", "2 h 24 min". */
  duracionDesdeSegundos(segundos: number | null): string {
    if (segundos == null) {
      return '—';
    }
    if (segundos < 90) {
      return `${Math.round(segundos)} s`;
    }
    return this.duracionDesdeMinutos(segundos / 60);
  }

  duracionDesdeMinutos(minutos: number | null): string {
    if (minutos == null) {
      return '—';
    }
    if (minutos < 60) {
      return `${Math.round(minutos)} min`;
    }
    const horas = Math.floor(minutos / 60);
    const resto = Math.round(minutos % 60);
    if (horas < 24) {
      return resto === 0 ? `${horas} h` : `${horas} h ${resto} min`;
    }
    const dias = Math.floor(horas / 24);
    return `${dias} d ${horas % 24} h`;
  }

  /** Un decimal para promedios; "—" cuando no hay dato. */
  decimal(valor: number | null, decimales = 2): string {
    return valor == null ? '—' : valor.toFixed(decimales);
  }

  porcentaje(parte: number, total: number): string {
    return total === 0 ? '—' : `${Math.round((parte / total) * 100)}%`;
  }

  /** Enlace al detalle: el punto crítico se mira desde su alerta. */
  rutaPunto(punto: PuntoCriticoTop): string[] {
    return punto.alertaId ? ['/alertas'] : ['/mapa'];
  }

  private cargar(): void {
    // El período se muestra siempre (incluso sin rango elegido): todos los
    // números de la pantalla dependen de él, así que con el panel cerrado
    // igual tiene que verse de qué ventana se está hablando.
    this.filtrosAplicados.set([etiquetaRango(this.rango) ?? 'Últimos 30 días']);

    const filtros: AnalisisFiltros = {
      desde: this.rango?.[0] ? inicioDelDia(this.rango[0]).toISOString() : undefined,
      hasta: this.rango?.[1] ? finDelDia(this.rango[1]).toISOString() : undefined
    };

    this.loading.set(true);
    this.error.set(false);
    this.service.obtenerResumen(filtros).subscribe({
      next: (res) => {
        this.resumen.set(res.data ?? null);
        this.loading.set(false);
      },
      error: (err) => {
        this.loading.set(false);
        this.error.set(true);
        this.resumen.set(null);
        const mensaje = (err.error as ApiResponse<null>)?.message ?? 'No se pudo cargar el análisis.';
        this.messageService.add({ severity: 'error', summary: 'Error', detail: mensaje });
      }
    });
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

/** `2026-08-20` -> `20/08`. La fecha ya viene cortada en hora local por el back. */
function etiquetaDia(fecha: string): string {
  const [, mes, dia] = fecha.split('-');
  return `${dia}/${mes}`;
}
