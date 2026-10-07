import { ChangeDetectionStrategy, Component, computed, input, model, output } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { DividerModule } from 'primeng/divider';
import { MessageModule } from 'primeng/message';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import {
  ConfiguracionCriticidad,
  FACTORES_CUESTIONARIO,
  ReglaEspecial,
  TramoF1
} from '../../../../core/models/configuracion.model';
import { nivelLabel } from '../../../../shared/etiquetas/reporte-etiquetas';

/** Fila `opción → puntaje` de una regla. */
export interface FilaOpcion {
  opcion: string;
  puntaje: number;
}

/** Una regla: la pregunta que puntúa y su tabla. */
export interface ReglaVista {
  preguntaCodigo: string;
  peso: number;
  filas: FilaOpcion[];
}

/** Un factor de cuestionario con su agregación y sus reglas. */
export interface BloqueFactor {
  factor: string;
  etiqueta: string;
  modo: string;
  tope: number;
  reglas: ReglaVista[];
}

/** Un factor con su peso, para la tabla de pesos. */
interface FilaPeso {
  clave: string;
  etiqueta: string;
  valor: number;
}

const ETIQUETAS_FACTOR: Record<string, string> = {
  f1: 'F1 · Proximidad de otros reportes',
  f2: 'F2 · Características del agua',
  f3: 'F3 · Síntomas y persistencia',
  f4: 'F4 · Análisis de IA',
  f5: 'F5 · Malla de riesgo'
};

/**
 * Vista de SOLO LECTURA de una versión de la configuración del motor.
 *
 * Es deliberadamente independiente del formulario del tab Motor: acá no se edita
 * nada, así que reusar aquel formulario en modo lectura obligaría a deshabilitar
 * controles y a arrastrar sus validadores cruzados sin necesidad.
 *
 * "Usar como base" no reactiva la versión (plan §5.3): la propone como plantilla
 * para crear la siguiente.
 */
@Component({
  selector: 'app-version-detalle',
  imports: [
    DatePipe,
    DecimalPipe,
    ButtonModule,
    DialogModule,
    DividerModule,
    MessageModule,
    TableModule,
    TagModule
  ],
  templateUrl: './version-detalle.html',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class VersionDetalle {
  readonly visible = model.required<boolean>();
  readonly configuracion = input<ConfiguracionCriticidad | null>(null);
  /** Se oculta el botón si el usuario no puede crear versiones nuevas. */
  readonly puedeUsarComoBase = input(false);

  readonly usarComoBase = output<ConfiguracionCriticidad>();

  readonly pesos = computed<FilaPeso[]>(() => {
    const pesos = this.configuracion()?.pesos;
    if (!pesos) {
      return [];
    }
    return Object.entries(pesos).map(([clave, valor]) => ({
      clave,
      etiqueta: ETIQUETAS_FACTOR[clave] ?? clave.toUpperCase(),
      valor
    }));
  });

  /** Los pesos del motor tienen que sumar 1; mostrarlo delata una versión rara. */
  readonly sumaPesos = computed(() => this.pesos().reduce((total, fila) => total + fila.valor, 0));

  readonly pesosSuman = computed(() => Math.abs(this.sumaPesos() - 1) < 1e-6);

  readonly tramosF1 = computed<TramoF1[]>(() => this.configuracion()?.puntajes?.f1?.tabla ?? []);

  /**
   * Factores de cuestionario con sus reglas, armado acá para no hacerlo en el
   * template. Se muestran los CÓDIGOS y no los textos a propósito: esta es una
   * versión histórica, y los textos de la encuesta de entonces pueden ya no ser los
   * de la encuesta activa. El código sí identifica lo mismo en todas las versiones.
   */
  readonly bloquesFactor = computed<BloqueFactor[]>(() => {
    const puntajes = this.configuracion()?.puntajes;
    if (!puntajes) {
      return [];
    }

    return FACTORES_CUESTIONARIO.map((factor) => {
      const config = puntajes.factores?.[factor];
      return {
        factor,
        etiqueta: ETIQUETAS_FACTOR[factor] ?? factor.toUpperCase(),
        modo: config?.modo ?? 'suma',
        tope: config?.tope ?? 5,
        reglas: (puntajes.reglas ?? [])
          .filter((regla) => regla.factor === factor)
          .map((regla) => ({
            preguntaCodigo: regla.preguntaCodigo,
            peso: regla.peso ?? 1,
            filas: this.aFilas(regla.opciones)
          }))
      };
    }).filter((bloque) => bloque.reglas.length > 0);
  });

  readonly reglasEspeciales = computed<ReglaEspecial[]>(
    () => this.configuracion()?.puntajes?.reglasEspeciales ?? []
  );

  /** "Fuerza nivel mínimo 1" / "Suma 0,5 a la criticidad". */
  resumirEfecto(regla: ReglaEspecial): string {
    return regla.efecto === 'nivelMinimo'
      ? `Fuerza nivel mínimo ${regla.valor}`
      : `Suma ${regla.valor} a la criticidad`;
  }

  /** `max: null` es el tramo abierto: "N o más". */
  etiquetaTramo(tramo: TramoF1, indice: number): string {
    if (tramo.max === null) {
      const anterior = this.tramosF1()[indice - 1]?.max;
      return anterior != null ? `${anterior + 1} o más` : 'Cualquier cantidad';
    }
    const anterior = indice > 0 ? this.tramosF1()[indice - 1]?.max : null;
    const desde = anterior != null ? anterior + 1 : 0;
    return desde === tramo.max ? `${tramo.max}` : `${desde} a ${tramo.max}`;
  }

  /** Etiqueta RNF-14 del nivel: describe prioridad, nunca potabilidad del agua. */
  nivelLabel(nivel: number): string {
    return nivelLabel(nivel);
  }

  cerrar(): void {
    this.visible.set(false);
  }

  emitirUsarComoBase(): void {
    const configuracion = this.configuracion();
    if (!configuracion) {
      return;
    }
    this.usarComoBase.emit(configuracion);
    this.visible.set(false);
  }

  private aFilas(tabla: Record<string, number> | undefined): FilaOpcion[] {
    if (!tabla) {
      return [];
    }
    return Object.entries(tabla).map(([opcion, puntaje]) => ({ opcion, puntaje }));
  }
}
