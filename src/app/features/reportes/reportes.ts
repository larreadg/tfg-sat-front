import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';
import { DatePickerModule } from 'primeng/datepicker';
import { IconFieldModule } from 'primeng/iconfield';
import { ImageModule } from 'primeng/image';
import { InputIconModule } from 'primeng/inputicon';
import { InputTextModule } from 'primeng/inputtext';
import { PaginatorModule, PaginatorState } from 'primeng/paginator';
import { SelectModule } from 'primeng/select';
import { SkeletonModule } from 'primeng/skeleton';
import { TableModule } from 'primeng/table';
import { TooltipModule } from 'primeng/tooltip';
import { AuthService } from '../../core/services/auth.service';
import { ReportesAdminService } from '../../core/services/reportes-admin.service';
import { ApiResponse } from '../../core/models/api-response.model';
import { permiso, RECURSO } from '../../core/models/permiso.model';
import {
  Canal,
  EstadoEvaluacionIa,
  ReporteListItem,
  ReportesFiltros,
  ReporteUbicacion
} from '../../core/models/reporte.model';
import { FiltrosPanel } from '../../shared/filtros-panel/filtros-panel';
import {
  etiquetaOpcion,
  etiquetaRango,
  resumenFiltros
} from '../../shared/filtros-panel/filtros-resumen';
import { NivelTag } from '../../shared/nivel-tag/nivel-tag';
import { EstadoAnalisisTag } from '../../shared/estado-analisis-tag/estado-analisis-tag';
import { canalIcono, canalLabel, ubicacionResumen, urlFoto } from '../../shared/etiquetas/reporte-etiquetas';

interface Opcion<T> {
  label: string;
  value: T;
}

@Component({
  selector: 'app-reportes',
  imports: [
    DatePipe,
    FormsModule,
    RouterLink,
    ButtonModule,
    CardModule,
    DatePickerModule,
    IconFieldModule,
    ImageModule,
    InputIconModule,
    InputTextModule,
    PaginatorModule,
    SelectModule,
    SkeletonModule,
    TableModule,
    TooltipModule,
    NivelTag,
    EstadoAnalisisTag,
    FiltrosPanel
  ],
  templateUrl: './reportes.html',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class Reportes {
  private readonly service = inject(ReportesAdminService);
  private readonly messageService = inject(MessageService);
  private readonly router = inject(Router);
  private readonly authService = inject(AuthService);

  /**
   * El teléfono es PII: el back solo lo envía (y solo filtra por él) a quien
   * tiene `usuario_ciudadano.ver`. Acá se usa únicamente para no mostrar una
   * columna/filtro que no va a funcionar — la barrera real está en el back.
   */
  readonly puedeVerTelefono = computed(() =>
    this.authService.tienePermiso(permiso(RECURSO.USUARIO_CIUDADANO, 'ver'))
  );

  /** Tope del datepicker: no se filtran reportes futuros. */
  readonly hoy = new Date();

  readonly reportes = signal<ReporteListItem[]>([]);
  readonly loading = signal(false);
  readonly error = signal(false);
  readonly total = signal(0);
  readonly first = signal(0);
  readonly pageSize = signal(20);

  /** Placeholder de filas mientras carga (para el skeleton del `p-table`). */
  readonly filasSkeleton = Array.from({ length: 8 });

  // Filtros (bindeados con ngModel; se aplican con el botón "Aplicar").
  rango: Date[] | null = null;
  telefono = '';
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
  }

  aplicar(): void {
    this.first.set(0);
    this.cargar();
  }

  limpiar(): void {
    this.rango = null;
    this.telefono = '';
    this.canal = null;
    this.estado = null;
    this.nivel = null;
    this.first.set(0);
    this.cargar();
  }

  onPage(evento: PaginatorState): void {
    this.first.set(evento.first ?? 0);
    this.pageSize.set(evento.rows ?? 20);
    this.cargar();
  }

  reintentar(): void {
    this.cargar();
  }

  ver(id: number): void {
    this.router.navigate(['/reportes', id]);
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

  ubicacionResumen(ubicacion: ReporteUbicacion | null): string | null {
    return ubicacionResumen(ubicacion);
  }

  private cargar(): void {
    const telefono = this.telefono.trim();
    this.filtrosAplicados.set(
      resumenFiltros(
        etiquetaRango(this.rango),
        telefono ? `Tel. ${telefono}` : null,
        etiquetaOpcion(this.canal, this.canalOpciones),
        etiquetaOpcion(this.estado, this.estadoOpciones),
        etiquetaOpcion(this.nivel, this.nivelOpciones)
      )
    );

    const filtros: ReportesFiltros = {
      page: Math.floor(this.first() / this.pageSize()) + 1,
      pageSize: this.pageSize(),
      canal: this.canal ?? undefined,
      estado: this.estado ?? undefined,
      nivel: this.nivel ?? undefined,
      telefono: this.telefono.trim() || undefined,
      desde: this.rango?.[0] ? inicioDelDia(this.rango[0]).toISOString() : undefined,
      hasta: this.rango?.[1] ? finDelDia(this.rango[1]).toISOString() : undefined
    };

    this.loading.set(true);
    this.error.set(false);
    this.service.listar(filtros).subscribe({
      next: (res) => {
        this.reportes.set(res.data ?? []);
        this.total.set(res.meta?.total ?? 0);
        this.loading.set(false);
      },
      error: (err) => {
        this.loading.set(false);
        this.error.set(true);
        this.reportes.set([]);
        this.total.set(0);
        const mensaje = (err.error as ApiResponse<null>)?.message ?? 'No se pudieron cargar los reportes.';
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
