import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { PanelModule } from 'primeng/panel';
import { TagModule } from 'primeng/tag';

/**
 * Envoltorio estándar de los filtros de una pantalla de listado: un panel
 * colapsado por defecto, con los campos proyectados adentro.
 *
 * El resumen en la cabecera es lo que hace seguro arrancar colapsado: con el
 * panel cerrado, los tags dicen qué está filtrando sin tener que desplegarlo.
 * Son los filtros **aplicados** (los que ya fueron a la API), no lo que haya
 * tipeado a medias en el formulario: por eso cada pantalla llena `resumen`
 * dentro de su `cargar()`, no desde los `ngModel`.
 */
@Component({
  selector: 'app-filtros-panel',
  // `block` (PrimeFlex) para que el host se comporte como caja: hay pantallas
  // que lo ponen al lado de un botón de acción con `flex-1`.
  host: { class: 'block' },
  imports: [PanelModule, TagModule],
  template: `
    <p-panel [toggleable]="true" [collapsed]="true" toggler="header" styleClass="w-full">
      <ng-template #header>
        <div class="flex align-items-center gap-2 flex-wrap">
          <i class="pi pi-filter text-color-secondary" aria-hidden="true"></i>
          <span class="font-semibold">Filtros</span>
          @for (etiqueta of resumen(); track etiqueta) {
            <p-tag [value]="etiqueta" severity="secondary" [rounded]="true" />
          }
        </div>
      </ng-template>

      <ng-content />
    </p-panel>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class FiltrosPanel {
  /** Filtros aplicados, ya en texto corto ("Alto", "01/09 – 01/10"). */
  readonly resumen = input<string[]>([]);
}
