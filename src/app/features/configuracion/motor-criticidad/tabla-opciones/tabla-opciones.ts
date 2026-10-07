import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { FormArray, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { InputNumberModule } from 'primeng/inputnumber';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { TooltipModule } from 'primeng/tooltip';

/**
 * Tabla de puntajes de una regla: una fila por opción real de la pregunta.
 *
 * La opción NO se escribe. Antes esta tabla tenía la clave como texto libre, así
 * que se podía guardar una opción que no existía en la encuesta y el factor dejaba
 * de puntuar en silencio. Ahora las filas las genera el padre desde la encuesta
 * activa y acá solo se edita el puntaje.
 *
 * Una fila sin `texto` es una opción que la configuración puntúa pero que la
 * encuesta activa ya no tiene: se marca y es la única que se puede quitar.
 *
 * Recibe el `FormArray` armado por el padre y bindea cada fila con `[formGroup]`
 * sobre la instancia, en vez de `formArrayName`/`formGroupName`: así no depende de
 * que el `ControlContainer` del padre llegue hasta acá.
 */
@Component({
  selector: 'app-tabla-opciones',
  imports: [ReactiveFormsModule, ButtonModule, InputNumberModule, TableModule, TagModule, TooltipModule],
  templateUrl: './tabla-opciones.html',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class TablaOpciones {
  readonly array = input.required<FormArray>();
  readonly editable = input(false);

  readonly quitar = output<number>();

  grupoDe(indice: number): FormGroup {
    return this.array().at(indice) as FormGroup;
  }

  textoDe(indice: number): string | null {
    return this.grupoDe(indice).getRawValue().texto as string | null;
  }

  codigoDe(indice: number): string {
    return this.grupoDe(indice).getRawValue().codigo as string;
  }

  /** La opción ya no está en la encuesta activa. */
  colgada(indice: number): boolean {
    return this.textoDe(indice) === null;
  }
}
