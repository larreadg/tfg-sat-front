import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';
import { ChipModule } from 'primeng/chip';
import { ImageModule } from 'primeng/image';
import { MessageModule } from 'primeng/message';
import { ProgressBarModule } from 'primeng/progressbar';
import { SkeletonModule } from 'primeng/skeleton';
import { ReportesAdminService } from '../../../core/services/reportes-admin.service';
import { ApiResponse } from '../../../core/models/api-response.model';
import { Canal, ReporteDetalle as ReporteDetalleModel } from '../../../core/models/reporte.model';
import { NivelTag } from '../../../shared/nivel-tag/nivel-tag';
import { EstadoAnalisisTag } from '../../../shared/estado-analisis-tag/estado-analisis-tag';
import { LeafletMap, PuntoMapa } from '../../../shared/leaflet-map/leaflet-map';
import { canalIcono, canalLabel, ubicacionResumen, urlFoto } from '../../../shared/etiquetas/reporte-etiquetas';

interface FactorFila {
  clave: string;
  etiqueta: string;
  valor: number | null;
}

@Component({
  selector: 'app-reporte-detalle',
  imports: [
    DatePipe,
    DecimalPipe,
    ButtonModule,
    CardModule,
    ChipModule,
    ImageModule,
    MessageModule,
    ProgressBarModule,
    SkeletonModule,
    NivelTag,
    EstadoAnalisisTag,
    LeafletMap
  ],
  templateUrl: './reporte-detalle.html',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ReporteDetalle {
  private readonly service = inject(ReportesAdminService);
  private readonly messageService = inject(MessageService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  private readonly id = Number(this.route.snapshot.paramMap.get('id'));

  readonly reporte = signal<ReporteDetalleModel | null>(null);
  readonly loading = signal(false);
  readonly error = signal(false);

  /** Estado del análisis: en la evaluación si existe, si no PENDIENTE. */
  readonly estadoAnalisis = computed(() => this.reporte()?.evaluacion?.estado ?? 'PENDIENTE');

  readonly filasSkeleton = Array.from({ length: 5 });

  /** Ubicación legible en una línea; `null` si el geocodificador no resolvió. */
  readonly ubicacion = computed(() => ubicacionResumen(this.reporte()?.ubicacion));

  /** Punto único para el mini-mapa. */
  readonly puntos = computed<PuntoMapa[]>(() => {
    const r = this.reporte();
    if (!r) {
      return [];
    }
    return [{ lat: r.latitud, lng: r.longitud, nivel: r.nivelPreliminar }];
  });

  /** Factores del desglose F1–F5 en orden, con etiquetas legibles. */
  readonly factores = computed<FactorFila[]>(() => {
    const d = this.reporte()?.desglose;
    if (!d) {
      return [];
    }
    return [
      { clave: 'F1', etiqueta: 'Proximidad de otros reportes', valor: d.f1 },
      { clave: 'F2', etiqueta: 'Características del agua', valor: d.f2 },
      { clave: 'F3', etiqueta: 'Síntomas y persistencia', valor: d.f3 },
      { clave: 'F4', etiqueta: 'Análisis de imágenes (IA)', valor: d.f4 },
      { clave: 'F5', etiqueta: 'Malla de riesgo', valor: d.f5 }
    ];
  });

  /** Máximo entre factores presentes, para escalar las barras (mínimo 1). */
  readonly maxFactor = computed(() => {
    const valores = this.factores()
      .map((f) => f.valor)
      .filter((v): v is number => v != null);
    return Math.max(1, ...valores);
  });

  constructor() {
    this.cargar();
  }

  reintentar(): void {
    this.cargar();
  }

  volver(): void {
    this.router.navigate(['/reportes']);
  }

  canalLabel(canal: Canal): string {
    return canalLabel(canal);
  }

  canalIcono(canal: Canal): string {
    return canalIcono(canal);
  }

  urlFoto(url: string): string {
    return urlFoto(url);
  }

  barraFactor(valor: number | null): number {
    if (valor == null) {
      return 0;
    }
    return Math.min(100, Math.round((valor / this.maxFactor()) * 100));
  }

  private cargar(): void {
    if (!Number.isInteger(this.id) || this.id <= 0) {
      this.error.set(true);
      return;
    }
    this.loading.set(true);
    this.error.set(false);
    this.service.detalle(this.id).subscribe({
      next: (res) => {
        this.reporte.set(res.data);
        this.loading.set(false);
      },
      error: (err) => {
        this.loading.set(false);
        this.error.set(true);
        this.reporte.set(null);
        const mensaje = (err.error as ApiResponse<null>)?.message ?? 'No se pudo cargar el reporte.';
        this.messageService.add({ severity: 'error', summary: 'Error', detail: mensaje });
      }
    });
  }
}
