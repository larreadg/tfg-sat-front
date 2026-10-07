import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { TagModule } from 'primeng/tag';

/** Tono de la sección. El color se resuelve en el SCSS contra las variables del tema. */
export type TonoSeccion = 'primary' | 'amber' | 'indigo' | 'rose' | 'teal';

/** Severidad del resumen, cuando el dato tiene estado (los pesos suman 1 o no). */
export type SeveridadResumen = 'secondary' | 'success' | 'danger';

/**
 * Encabezado de una sección del motor de criticidad.
 *
 * El formulario del motor es largo y sus cinco bloques se parecían entre sí: todos
 * eran una línea de texto. Acá cada sección recibe una identidad estable (icono +
 * tono) que funciona como punto de referencia al recorrer la pantalla, y un
 * resumen de su propio estado, así el bloque cerrado igual dice algo.
 *
 * El color es wayfinding, no decoración: vive únicamente en el ícono y su fondo
 * (una porción mínima de la superficie), nunca en el texto ni en los controles.
 */
@Component({
  selector: 'app-seccion-header',
  imports: [TagModule],
  templateUrl: './seccion-header.html',
  styleUrl: './seccion-header.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class SeccionHeader {
  readonly icono = input.required<string>();
  readonly tono = input.required<TonoSeccion>();
  readonly titulo = input.required<string>();
  /** Una línea: qué decide esta sección. Se oculta en pantallas chicas. */
  readonly subtitulo = input('');
  /** Estado actual de la sección, resumido ("Total 1,0000", "5 preguntas"). */
  readonly resumen = input('');
  readonly severidadResumen = input<SeveridadResumen>('secondary');
}
