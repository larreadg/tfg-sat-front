import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { TagModule } from 'primeng/tag';
import { nivelLabel, nivelSeveridad } from '../etiquetas/reporte-etiquetas';

/**
 * Tag de nivel de criticidad (0–3) o "Sin calcular" cuando es null.
 * Reusado en la tabla de reportes, el detalle, alertas y el mapa.
 */
@Component({
  selector: 'app-nivel-tag',
  imports: [TagModule],
  template: `<p-tag [value]="label()" [severity]="severidad()" [rounded]="true" />`,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class NivelTag {
  readonly nivel = input<number | null>(null);

  protected readonly label = computed(() => nivelLabel(this.nivel()));
  protected readonly severidad = computed(() => nivelSeveridad(this.nivel()));
}
