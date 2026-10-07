import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { TagModule } from 'primeng/tag';
import { EstadoEvaluacionIa } from '../../core/models/reporte.model';
import { estadoIaLabel, estadoIaSeveridad } from '../etiquetas/reporte-etiquetas';

/** Tag del estado del análisis de IA (Pendiente/Procesando/Analizado/Error). */
@Component({
  selector: 'app-estado-analisis-tag',
  imports: [TagModule],
  template: `<p-tag [value]="label()" [severity]="severidad()" [rounded]="true" />`,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class EstadoAnalisisTag {
  readonly estado = input.required<EstadoEvaluacionIa>();

  protected readonly label = computed(() => estadoIaLabel(this.estado()));
  protected readonly severidad = computed(() => estadoIaSeveridad(this.estado()));
}
