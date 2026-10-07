import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { TagModule } from 'primeng/tag';
import { EstadoAlerta } from '../../core/models/alerta.model';
import { estadoAlertaLabel, estadoAlertaSeveridad } from '../etiquetas/alerta-etiquetas';

/** Tag del estado de gestión de una alerta (Nueva/En revisión/Derivada/Cerrada/Descartada). */
@Component({
  selector: 'app-estado-alerta-tag',
  imports: [TagModule],
  template: `<p-tag [value]="label()" [severity]="severidad()" [rounded]="true" />`,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class EstadoAlertaTag {
  readonly estado = input.required<EstadoAlerta>();

  protected readonly label = computed(() => estadoAlertaLabel(this.estado()));
  protected readonly severidad = computed(() => estadoAlertaSeveridad(this.estado()));
}
