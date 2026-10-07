import { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';
import {
  ConfiguracionCriticidad,
  FactorCuestionario,
  EfectoReglaEspecial,
  ModoAgregacion,
  PuntajesConfig,
  ReglaPuntaje,
  TramoF1
} from '../../../core/models/configuracion.model';
import { EncuestaVersionDetalle, PreguntaAdmin, PreguntaOpcionAdmin } from '../../../core/models/encuesta-admin.model';

/**
 * Conversiones entre el DTO del backend y la forma que necesita el formulario, y
 * validadores cruzados. Todo funciones puras: la lógica de negocio del motor
 * (ERS §5) no debería quedar enterrada en el componente.
 */

/**
 * Una fila del editor de puntajes: la opción real de la encuesta (`codigo`, que es
 * lo que se guarda) con su `texto` (solo para mostrar) y el puntaje.
 *
 * `texto: null` marca una opción que la configuración puntúa pero que la encuesta
 * activa ya no tiene — una regla colgada, que el editor señala en rojo.
 */
export interface FilaOpcion {
  codigo: string;
  texto: string | null;
  valor: number;
}

/** Tramo de F1 con tope finito. El tramo abierto se maneja aparte. */
export interface TramoFinito {
  max: number;
  valor: number;
}

/** Etiquetas de los factores que las reglas pueden alimentar. */
export const ETIQUETA_FACTOR: Record<FactorCuestionario, string> = {
  f2: 'F2 · Indicadores visibles del agua',
  f3: 'F3 · Síntomas y antigüedad',
  // F5 existe en el modelo pero todavía no tiene fuente de datos propia; se puede
  // alimentar con preguntas como cualquier otro factor.
  f5: 'F5 · Sin uso por ahora'
};

/** Cómo se le explica cada efecto al analista, sin jerga del ERS. */
export const ETIQUETA_EFECTO: Record<EfectoReglaEspecial, string> = {
  nivelMinimo: 'Forzar un nivel mínimo',
  sumarCriticidad: 'Sumar puntos a la criticidad'
};

export const ETIQUETA_MODO: Record<string, string> = {
  suma: 'Suma los puntajes',
  max: 'Toma el puntaje más alto',
  promedio: 'Promedia las preguntas respondidas'
};

// --- Lectura de la encuesta activa ---

/**
 * Preguntas que se pueden puntuar: las que tienen `codigo` y no son el paso de
 * fotos (una foto no tiene opciones que tabular).
 */
export function preguntasPuntuables(encuesta: EncuestaVersionDetalle | null): PreguntaAdmin[] {
  if (!encuesta) {
    return [];
  }
  return encuesta.preguntas.filter((pregunta) => pregunta.tipo !== 'FOTO' && pregunta.codigo !== null);
}

export function preguntaPorCodigo(
  encuesta: EncuestaVersionDetalle | null,
  codigo: string
): PreguntaAdmin | undefined {
  return encuesta?.preguntas.find((pregunta) => pregunta.codigo === codigo);
}

export function opcionesDe(encuesta: EncuestaVersionDetalle | null, preguntaCodigo: string): PreguntaOpcionAdmin[] {
  return preguntaPorCodigo(encuesta, preguntaCodigo)?.opciones.filter((opcion) => opcion.codigo !== null) ?? [];
}

/** Texto de una opción, o `null` si la encuesta activa ya no la tiene. */
export function textoOpcion(
  encuesta: EncuestaVersionDetalle | null,
  preguntaCodigo: string,
  opcionCodigo: string
): string | null {
  return opcionesDe(encuesta, preguntaCodigo).find((opcion) => opcion.codigo === opcionCodigo)?.texto ?? null;
}

// --- Reglas <-> filas del formulario ---

/**
 * Filas del editor para una regla: TODAS las opciones vigentes de la pregunta (así
 * el analista ve las que todavía no puntuó, en vez de tener que adivinarlas), más
 * las que la regla puntúa pero la encuesta ya no tiene.
 */
export function filasDeRegla(regla: ReglaPuntaje, encuesta: EncuestaVersionDetalle | null): FilaOpcion[] {
  const vigentes = opcionesDe(encuesta, regla.preguntaCodigo).map((opcion) => ({
    codigo: opcion.codigo as string,
    texto: opcion.texto,
    valor: regla.opciones[opcion.codigo as string] ?? 0
  }));

  const codigosVigentes = new Set(vigentes.map((fila) => fila.codigo));
  const colgadas = Object.entries(regla.opciones)
    .filter(([codigo]) => !codigosVigentes.has(codigo))
    .map(([codigo, valor]) => ({ codigo, texto: null, valor }));

  return [...vigentes, ...colgadas];
}

/** Filas para una pregunta que recién se suma: todas sus opciones en 0. */
export function filasNuevas(encuesta: EncuestaVersionDetalle | null, preguntaCodigo: string): FilaOpcion[] {
  return opcionesDe(encuesta, preguntaCodigo).map((opcion) => ({
    codigo: opcion.codigo as string,
    texto: opcion.texto,
    valor: 0
  }));
}

export function aRecord(filas: FilaOpcion[]): Record<string, number> {
  const registro: Record<string, number> = {};
  for (const fila of filas) {
    if (fila.codigo) {
      registro[fila.codigo] = Number(fila.valor);
    }
  }
  return registro;
}

// --- F1 (no depende de preguntas) ---

/**
 * Parte la tabla de F1 en tramos finitos + el valor del tramo abierto.
 *
 * El formulario los maneja separados a propósito: así el tramo `max: null` es
 * siempre único y siempre último *por construcción*, que es justo lo que exige
 * el motor (`puntajeF1` devuelve el primer tramo que cubre la cantidad, así que
 * un abierto en el medio dejaría muertos a los que siguen).
 */
export function separarTramos(tabla: TramoF1[]): { finitos: TramoFinito[]; valorAbierto: number } {
  const finitos = tabla
    .filter((tramo): tramo is TramoFinito => tramo.max !== null)
    .map((tramo) => ({ max: tramo.max, valor: tramo.valor }))
    .sort((a, b) => a.max - b.max);

  const abierto = tabla.find((tramo) => tramo.max === null);

  return { finitos, valorAbierto: abierto?.valor ?? 0 };
}

export function armarTablaF1(finitos: TramoFinito[], valorAbierto: number): TramoF1[] {
  return [
    ...finitos.map((tramo) => ({ max: Number(tramo.max), valor: Number(tramo.valor) })),
    { max: null, valor: valorAbierto }
  ];
}

// --- Desincronización config <-> encuesta activa ---

export interface Desincronizacion {
  /** Dónde está el problema, en términos del analista (nunca un código interno). */
  donde: string;
  detalle: string;
}

/**
 * Referencias de la configuración que la encuesta activa no puede satisfacer.
 *
 * Es el aviso que faltaba: una regla colgada no da error en runtime, el factor
 * simplemente se queda sin aporte y la criticidad baja en silencio. El backend
 * rechaza guardar en este estado; acá se muestra antes de intentarlo.
 */
export function detectarDesincronizacion(
  puntajes: PuntajesConfig,
  encuesta: EncuestaVersionDetalle | null
): Desincronizacion[] {
  if (!encuesta) {
    return [];
  }

  const problemas: Desincronizacion[] = [];

  // Los avisos hablan en términos del analista: el texto de la pregunta, nunca el
  // código interno con el que el motor la referencia.
  for (const regla of puntajes.reglas) {
    const pregunta = preguntaPorCodigo(encuesta, regla.preguntaCodigo);
    const factor = ETIQUETA_FACTOR[regla.factor] ?? regla.factor.toUpperCase();

    if (!pregunta) {
      problemas.push({
        donde: factor,
        detalle: 'puntúa una pregunta que ya no está en la encuesta activa.'
      });
      continue;
    }

    const vigentes = new Set(opcionesDe(encuesta, regla.preguntaCodigo).map((opcion) => opcion.codigo));
    const colgadas = Object.keys(regla.opciones).filter((codigo) => !vigentes.has(codigo));
    if (colgadas.length > 0) {
      problemas.push({
        donde: `${factor} · ${pregunta.texto}`,
        detalle:
          colgadas.length === 1
            ? 'tiene puntaje para una respuesta que la pregunta ya no ofrece.'
            : `tiene puntaje para ${colgadas.length} respuestas que la pregunta ya no ofrece.`
      });
    }
  }

  for (const regla of puntajes.reglasEspeciales ?? []) {
    const donde = `Regla especial "${regla.nombre}"`;

    if (!preguntaPorCodigo(encuesta, regla.preguntaCodigo)) {
      problemas.push({
        donde,
        detalle: 'la pregunta que la dispara ya no está en la encuesta activa.'
      });
      continue;
    }

    const vigentes = new Set(opcionesDe(encuesta, regla.preguntaCodigo).map((opcion) => opcion.codigo));
    const colgadas = regla.opcionCodigos.filter((codigo) => !vigentes.has(codigo));
    if (colgadas.length > 0) {
      problemas.push({
        donde,
        detalle:
          colgadas.length === 1
            ? 'se dispara con una respuesta que la pregunta ya no ofrece.'
            : `se dispara con ${colgadas.length} respuestas que la pregunta ya no ofrece.`
      });
    }
  }

  return problemas;
}

// --- Alcance de un factor: puede llegar al tope de la escala? ---

/**
 * Tope de la escala de criticidad, y por lo tanto de TODOS los factores. Espeja
 * `CRITICIDAD_MAX` del backend (`criticidad.engine.ts`). No es configurable: los
 * cinco factores se promedian entre sí, así que solo son comparables si comparten
 * la escala 0–5.
 */
export const TOPE_FACTOR = 5;

/** F1 no está en `ETIQUETA_FACTOR` porque no se alimenta de preguntas. */
export const ETIQUETA_F1 = 'F1 · Reportes cercanos en la ventana';

/** Cuánto puede llegar a valer un factor, y qué hay que decirle al analista. */
export interface AlcanceFactor {
  /**
   * Valor más alto que el factor puede dar si el ciudadano responde todas sus
   * preguntas con la peor opción. `null` = el factor no tiene reglas (está apagado:
   * el motor lo deja en `null` y renormaliza).
   */
  maximo: number | null;
  /** `true` si con esos puntajes ningún reporte puede llegar al tope. */
  bloquea: boolean;
  /** `true` si el peor caso se pasa del tope y el motor lo recorta. Es válido. */
  recorta: boolean;
}

/**
 * Valor más alto que una regla puede aportar: el peor caso de esa pregunta. En
 * `ELECCION_UNICA` es su opción más alta (se elige una sola); en
 * `ELECCION_MULTIPLE` es la suma de todas, porque el motor suma las elegidas y se
 * pueden marcar todas.
 */
function aporteMaximo(regla: ReglaPuntaje, esMultiple: boolean): number {
  const valores = Object.values(regla.opciones).map((valor) => Number(valor) || 0);
  if (valores.length === 0) {
    return 0;
  }
  const base = esMultiple ? valores.reduce((total, valor) => total + valor, 0) : Math.max(...valores);
  return base * (regla.peso ?? 1);
}

function redondear2(valor: number): number {
  return Math.round(valor * 100) / 100;
}

/**
 * Peor caso que un factor puede producir, según su `modo`.
 *
 * Espeja `alcanceDeFactor()` del backend (`criticidad.engine.ts`), que a su vez
 * espeja `agregar()`. Si cambia una de las tres, cambian las tres: si este número
 * no coincide con el del backend, el panel muestra verde y el PUT devuelve 400.
 *
 * `promedio` devuelve la media con TODAS las preguntas respondidas. El máximo
 * teórico es más alto (quien contesta solo la peor pregunta saca más, porque la
 * media es sobre las presentes), pero el peor caso completo es el único número que
 * el analista puede razonar mirando la pantalla.
 */
export function maximoAlcanzable(
  reglas: ReglaPuntaje[],
  modo: ModoAgregacion,
  encuesta: EncuestaVersionDetalle | null
): number | null {
  if (reglas.length === 0) {
    return null;
  }

  const maximos = reglas.map((regla) =>
    // Una pregunta que la encuesta activa ya no tiene se asume de elección única: es
    // la lectura conservadora. Una regla así tampoco se puede guardar
    // (`detectarDesincronizacion` ya la marca).
    aporteMaximo(regla, preguntaPorCodigo(encuesta, regla.preguntaCodigo)?.tipo === 'ELECCION_MULTIPLE')
  );

  switch (modo) {
    case 'max':
      return redondear2(Math.max(...maximos));
    case 'promedio': {
      const sumaPesos = reglas.reduce((total, regla) => total + (regla.peso ?? 1), 0);
      return sumaPesos === 0 ? 0 : redondear2(maximos.reduce((total, maximo) => total + maximo, 0) / sumaPesos);
    }
    default:
      return redondear2(maximos.reduce((total, maximo) => total + maximo, 0));
  }
}

/** Reglas de un factor dentro de `puntajes`. */
export function reglasDeFactor(puntajes: PuntajesConfig, factor: FactorCuestionario): ReglaPuntaje[] {
  return puntajes.reglas.filter((regla) => regla.factor === factor);
}

/** Alcance de un factor, listo para pintar en su barra. */
export function alcanceDe(
  puntajes: PuntajesConfig,
  factor: FactorCuestionario,
  encuesta: EncuestaVersionDetalle | null
): AlcanceFactor {
  const modo = puntajes.factores?.[factor]?.modo ?? 'suma';
  const maximo = maximoAlcanzable(reglasDeFactor(puntajes, factor), modo, encuesta);

  return {
    maximo,
    bloquea: maximo !== null && maximo < TOPE_FACTOR,
    recorta: maximo !== null && maximo > TOPE_FACTOR
  };
}

/** Lo que el panel de error necesita de cada factor que no llega al tope. */
export interface FactorSinAlcance {
  /** `'f1'` para la tabla de reportes cercanos; si no, un factor de cuestionario. */
  factor: FactorCuestionario | 'f1';
  etiqueta: string;
  maximo: number;
}

/**
 * Factores que con esos puntajes no pueden llegar al tope de la escala.
 *
 * Es el modo de falla que esta validación existe para evitar: un factor cuyo peor
 * caso da 3 entra a la media ponderada con su peso completo pero nunca puede llevar
 * el reporte al rojo. El peso configurado deja de significar lo que dice y el
 * reporte más grave posible queda subclasificado, sin que nada falle ni avise. El
 * backend lo rechaza al guardar; acá se muestra mientras se edita.
 *
 * Un factor SIN reglas no entra: está apagado y el motor lo renormaliza (es el
 * estado de F5 hoy).
 */
export function factoresQueNoAlcanzan(
  puntajes: PuntajesConfig,
  encuesta: EncuestaVersionDetalle | null
): FactorSinAlcance[] {
  const problemas: FactorSinAlcance[] = [];

  // F1 no sale de preguntas, pero la exigencia es la misma: si su tramo más alto no
  // llega al tope, F1 entra a la media ponderada con su peso completo sin poder
  // nunca llevar el reporte al rojo.
  const maximoF1 = alcanceF1(puntajes.f1.tabla);
  if (maximoF1 < TOPE_FACTOR) {
    problemas.push({ factor: 'f1', etiqueta: ETIQUETA_F1, maximo: maximoF1 });
  }

  for (const factor of [...new Set(puntajes.reglas.map((regla) => regla.factor))]) {
    const alcance = alcanceDe(puntajes, factor, encuesta);
    if (alcance.bloquea) {
      problemas.push({
        factor,
        etiqueta: ETIQUETA_FACTOR[factor] ?? factor.toUpperCase(),
        maximo: alcance.maximo as number
      });
    }
  }

  return problemas;
}

/** Puntaje más alto de la tabla de F1: el tope que ese factor puede alcanzar. */
export function alcanceF1(tabla: TramoF1[]): number {
  if (tabla.length === 0) {
    return 0;
  }
  return Math.max(...tabla.map((tramo) => Number(tramo.valor) || 0));
}

/**
 * F1 mide DENSIDAD de reportes cercanos: más reportes no puede significar menos
 * riesgo. Una tabla que baja (o que sube y después baja) la aplica el motor sin
 * chistar y clasifica al revés para siempre, así que se bloquea al guardar.
 *
 * Devuelve el índice de cada fila que rompe la monotonía; el índice `tabla.length-1`
 * es el tramo abierto.
 */
export function tramosF1QueBajan(tabla: TramoF1[]): number[] {
  const problemas: number[] = [];
  for (let i = 1; i < tabla.length; i++) {
    if ((Number(tabla[i].valor) || 0) < (Number(tabla[i - 1].valor) || 0)) {
      problemas.push(i);
    }
  }
  return problemas;
}

/**
 * Reescala los puntajes de un factor para que su peor caso dé exactamente el tope,
 * preservando las proporciones que el analista ya eligió. Devuelve, por cada regla
 * del factor y en el mismo orden, los valores nuevos de sus opciones.
 *
 * Sin esto el bloqueo sería un castigo: el analista queda trabado sin saber qué
 * número tocar. El redondeo a 2 decimales puede dejar el máximo en 4,99 y el bloqueo
 * seguiría puesto, así que después se cierra la diferencia en la opción más alta,
 * que es la que define el peor caso.
 */
export function escalarAlTope(
  reglas: ReglaPuntaje[],
  modo: ModoAgregacion,
  encuesta: EncuestaVersionDetalle | null
): Record<string, number>[] | null {
  const maximo = maximoAlcanzable(reglas, modo, encuesta);
  if (maximo === null || maximo <= 0) {
    return null;
  }

  const escala = TOPE_FACTOR / maximo;
  const escaladas = reglas.map((regla) => {
    const opciones: Record<string, number> = {};
    for (const [codigo, valor] of Object.entries(regla.opciones)) {
      opciones[codigo] = Math.min(redondear2((Number(valor) || 0) * escala), TOPE_FACTOR);
    }
    return opciones;
  });

  const conEscala = reglas.map((regla, i) => ({ ...regla, opciones: escaladas[i] }));
  const nuevoMaximo = maximoAlcanzable(conEscala, modo, encuesta) ?? 0;

  if (nuevoMaximo < TOPE_FACTOR) {
    const falta = TOPE_FACTOR - nuevoMaximo;
    let mejor: { indice: number; codigo: string; valor: number } | null = null;
    escaladas.forEach((opciones, indice) => {
      for (const [codigo, valor] of Object.entries(opciones)) {
        if (mejor === null || valor > mejor.valor) {
          mejor = { indice, codigo, valor };
        }
      }
    });
    if (mejor !== null) {
      const { indice, codigo, valor } = mejor as { indice: number; codigo: string; valor: number };
      escaladas[indice][codigo] = Math.min(redondear2(valor + falta), TOPE_FACTOR);
    }
  }

  return escaladas;
}

// --- Validadores cruzados ---

/** Los pesos deben sumar 1 (mismo criterio y tolerancia que el zod del backend). */
export const TOLERANCIA_SUMA_PESOS = 1e-6;

export const sumaUnoValidator: ValidatorFn = (control: AbstractControl): ValidationErrors | null => {
  const valor = control.value as Record<string, number> | null;
  if (!valor) {
    return null;
  }

  const total = Object.values(valor).reduce((acumulado: number, peso) => acumulado + (Number(peso) || 0), 0);
  return Math.abs(total - 1) < TOLERANCIA_SUMA_PESOS ? null : { sumaPesos: { total } };
};

/** Umbrales estrictamente crecientes: n1 < n2 < n3. */
export const umbralesCrecientesValidator: ValidatorFn = (control: AbstractControl): ValidationErrors | null => {
  const valor = control.value as { n1: number; n2: number; n3: number } | null;
  if (!valor) {
    return null;
  }
  return valor.n1 < valor.n2 && valor.n2 < valor.n3 ? null : { umbralesNoCrecientes: true };
};

/** Los `max` de F1 tienen que venir estrictamente crecientes. */
export const tramosCrecientesValidator: ValidatorFn = (control: AbstractControl): ValidationErrors | null => {
  const filas = (control.value as TramoFinito[] | null) ?? [];
  const maximos = filas.map((fila) => Number(fila.max));
  const ordenados = maximos.every((max, i) => i === 0 || max > maximos[i - 1]);
  return ordenados ? null : { tramosDesordenados: true };
};

/** Suma actual de los pesos, para mostrarla en vivo. */
export function sumaPesos(pesos: Record<string, number> | null | undefined): number {
  if (!pesos) {
    return 0;
  }
  return Object.values(pesos).reduce((acumulado: number, peso) => acumulado + (Number(peso) || 0), 0);
}

/**
 * Serializa ordenando las claves de forma recursiva.
 *
 * Hace falta porque PostgreSQL guarda los `Json` como JSONB y devuelve las claves
 * reordenadas: comparar con `JSON.stringify` a secas marcaría "cambió" un bloque
 * intacto.
 */
function estable(valor: unknown): string {
  if (valor === null || typeof valor !== 'object') {
    return JSON.stringify(valor) ?? 'null';
  }
  if (Array.isArray(valor)) {
    return `[${valor.map(estable).join(',')}]`;
  }
  const entradas = Object.entries(valor as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : 1));
  return `{${entradas.map(([clave, v]) => `${JSON.stringify(clave)}:${estable(v)}`).join(',')}}`;
}

/**
 * Proyecta `puntajes` sobre los campos que el sistema realmente usa, normalizando
 * los dos lados de la comparación.
 *
 * Las versiones ya guardadas arrastran claves muertas de formatos anteriores; sin
 * esta proyección, compararlas contra lo que arma el formulario marcaría "cambió"
 * un bloque intacto para siempre. Las reglas se ordenan porque su orden en el array
 * no tiene significado.
 */
function puntajesComparables(puntajes: PuntajesConfig): unknown {
  return {
    f1: { tabla: puntajes.f1.tabla.map((tramo) => ({ max: tramo.max, valor: tramo.valor })) },
    f4: { divisor: puntajes.f4.divisor },
    factores: puntajes.factores,
    reglas: [...(puntajes.reglas ?? [])]
      .map((regla) => ({
        preguntaCodigo: regla.preguntaCodigo,
        factor: regla.factor,
        // `peso` ausente y `peso: 1` son lo mismo para el motor.
        peso: regla.peso ?? 1,
        opciones: regla.opciones
      }))
      .sort((a, b) => `${a.factor}:${a.preguntaCodigo}`.localeCompare(`${b.factor}:${b.preguntaCodigo}`)),
    reglasEspeciales: [...(puntajes.reglasEspeciales ?? [])]
      .map((regla) => ({
        nombre: regla.nombre.trim(),
        preguntaCodigo: regla.preguntaCodigo,
        opcionCodigos: [...regla.opcionCodigos].sort(),
        efecto: regla.efecto,
        valor: regla.valor
      }))
      .sort((a, b) => a.nombre.localeCompare(b.nombre))
  };
}

/**
 * Compara la configuración cargada con lo que hay en el formulario y devuelve
 * los bloques que cambiaron, para resumirlos en la confirmación antes de crear
 * la versión nueva.
 */
export function resumirCambios(
  original: ConfiguracionCriticidad,
  actual: {
    pesos: unknown;
    umbralesNivel: unknown;
    radioMetros: number;
    ventanaDias: number;
    minReportes: number;
    limitesAntiabuso: unknown;
    puntajes: PuntajesConfig;
  }
): string[] {
  const cambios: string[] = [];
  const iguales = (a: unknown, b: unknown): boolean => estable(a) === estable(b);

  if (!iguales(original.pesos, actual.pesos)) {
    cambios.push('Pesos de los factores');
  }
  if (!iguales(original.umbralesNivel, actual.umbralesNivel)) {
    cambios.push('Umbrales de nivel');
  }
  const antes = puntajesComparables(original.puntajes) as Record<string, unknown>;
  const ahora = puntajesComparables(actual.puntajes) as Record<string, unknown>;

  if (!iguales(antes['reglas'], ahora['reglas'])) {
    cambios.push('Reglas de puntaje por pregunta');
  }
  if (!iguales(antes['factores'], ahora['factores'])) {
    cambios.push('Agregación y topes de los factores');
  }
  if (!iguales(antes['f1'], ahora['f1']) || !iguales(antes['f4'], ahora['f4'])) {
    cambios.push('Tablas de F1 y F4');
  }
  if (!iguales(antes['reglasEspeciales'], ahora['reglasEspeciales'])) {
    cambios.push('Reglas especiales');
  }

  if (
    original.radioMetros !== actual.radioMetros ||
    original.ventanaDias !== actual.ventanaDias ||
    original.minReportes !== actual.minReportes
  ) {
    cambios.push('Detección geográfica');
  }
  if (!iguales(original.limitesAntiabuso, actual.limitesAntiabuso)) {
    cambios.push('Límites anti-abuso');
  }

  return cambios;
}
