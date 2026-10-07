import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';
import { TooltipModule } from 'primeng/tooltip';
import { AlertaListItem } from '../../../core/models/alerta.model';
import { NivelTag } from '../../../shared/nivel-tag/nivel-tag';

/**
 * Tarjeta de una alerta en el tablero Kanban, deliberadamente mínima: nivel de
 * criticidad, cuántos reportes la sustentan, cuándo se generó, y el enlace que
 * abre la alerta en su propia pestaña. Nada más: el estado ya lo dice la columna (o el
 * panel, en la vista apilada), y el motivo, el origen y el reporte concreto
 * están en el detalle. Mantenerla chata es lo que permite ver un tablero
 * entero sin scrollear columna por columna.
 *
 * El arrastre no vive acá: las directivas `pDraggable` las pone el tablero en
 * el envoltorio, así que la tarjeta sirve igual en la vista apilada, donde el
 * cambio de estado se hace con el botón (`cambiarEstado`).
 */
@Component({
  selector: 'app-alerta-tarjeta',
  imports: [DatePipe, RouterLink, ButtonModule, CardModule, TooltipModule, NivelTag],
  templateUrl: './alerta-tarjeta.html',
  styleUrl: './alerta-tarjeta.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AlertaTarjeta {
  readonly alerta = input.required<AlertaListItem>();

  /** Muestra el botón de cambio de estado (vista apilada, sin arrastre). */
  readonly conCambioEstado = input(false);

  /** Hay un PATCH en vuelo para esta alerta: se atenúa y muestra el spinner. */
  readonly enCurso = input(false);

  /** La tarjeta se puede levantar: cambia el cursor y muestra el asidero. */
  readonly arrastrable = input(false);

  readonly cambiarEstado = output<AlertaListItem>();

  /**
   * Todas las clases van juntas en `styleClass` (no en `[class.x]`) para que
   * caigan en el mismo elemento raíz de `p-card`: el SCSS afina el padding con
   * el token `--p-card-body-padding`, que tiene que cascadear al cuerpo.
   */
  protected readonly clases = computed(() => {
    const clases = ['alerta-tarjeta'];
    if (this.arrastrable()) {
      // `hover:shadow-3` es la utilidad PrimeFlex: el despegue lo hace el SCSS.
      clases.push('alerta-tarjeta--arrastrable', 'hover:shadow-3');
    }
    if (this.enCurso()) {
      clases.push('alerta-tarjeta--en-curso');
    }
    return clases.join(' ');
  });

  /**
   * Reportes que sustentan la alerta: los del clúster, o 1 si nació de un
   * reporte suelto. Es el dato que separa "un vecino reportó" de "siete
   * vecinos reportaron lo mismo en la misma cuadra".
   */
  protected readonly textoReportes = computed(() => {
    const cantidad = this.alerta().puntoCritico?.cantidadReportes ?? 1;
    return cantidad === 1 ? '1 reporte' : `${cantidad} reportes`;
  });
}
