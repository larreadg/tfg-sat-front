/**
 * Modelos del motor de criticidad (ERS §5). Espejo de `criticidad.types.ts` y del
 * schema zod de `configuracion.validation.ts` del backend: si allá cambia la forma
 * de `puntajes`, acá también.
 *
 * La configuración es VERSIONADA E INMUTABLE (ERS §4.4): el `PUT` no edita la
 * versión activa, crea la siguiente y la activa. Los cálculos ya hechos siguen
 * apuntando a la versión con la que se hicieron (`DesgloseFactores.configId`).
 */

/** Pesos de F1..F5. Deben sumar exactamente 1 (el backend rechaza lo contrario). */
export interface Pesos {
  f1: number;
  f2: number;
  f3: number;
  f4: number;
  f5: number;
}

/** Cortes de nivel 0-3. Estrictamente crecientes: n1 < n2 < n3. */
export interface UmbralesNivel {
  n1: number;
  n2: number;
  n3: number;
}

export interface LimitesAntiabuso {
  otpPorHora: number;
  reportesPor24h: number;
}

/**
 * Un tramo de la tabla escalonada de F1. `max: null` = tramo abierto ("y más").
 * El orden importa: el motor devuelve el PRIMER tramo cuyo `max` cubre la
 * cantidad, así que los tramos van por `max` creciente y el abierto va último.
 */
export interface TramoF1 {
  max: number | null;
  valor: number;
}

export interface TablaF1 {
  tabla: TramoF1[];
}

/**
 * F4 = `riesgoScore` de la IA / `divisor`. La fuente del dato está fija en el
 * motor (`calcularF4`), por eso solo se versiona el divisor.
 */
export interface TablaF4 {
  divisor: number;
}

/**
 * Factores alimentados por el CUESTIONARIO: los únicos que las reglas puntúan.
 * F1 (densidad de reportes) y F4 (IA) no salen de respuestas.
 */
export type FactorCuestionario = 'f2' | 'f3' | 'f5';

export const FACTORES_CUESTIONARIO: FactorCuestionario[] = ['f2', 'f3', 'f5'];

/**
 * Cómo se combinan los aportes de las reglas de un mismo factor.
 *  - `suma`: se suman (comportamiento histórico de F2 y F3).
 *  - `max`: gana el más alto; agregar preguntas no infla el factor.
 *  - `promedio`: media de los aportes presentes; no subestima si el ciudadano no
 *    contestó alguna pregunta del factor.
 */
export type ModoAgregacion = 'suma' | 'max' | 'promedio';

export interface FactorCuestionarioConfig {
  modo: ModoAgregacion;
  /**
   * Tope del factor. Opcional y ya NO editable desde el panel: el tope de todo
   * factor es `CRITICIDAD_MAX`, porque los cinco se promedian entre sí y solo son
   * comparables en la misma escala 0–5. Sigue en el tipo porque las versiones
   * guardadas son inmutables y lo traen.
   */
  tope?: number;
}

/**
 * Una pregunta puntuando un factor. Se clava al `codigo` de la pregunta y de cada
 * opción, NO al texto (que el analista puede corregir) ni al id (que cambia en cada
 * versión de encuesta, porque el versionado duplica las preguntas).
 */
export interface ReglaPuntaje {
  preguntaCodigo: string;
  factor: FactorCuestionario;
  /** Multiplicador del aporte. Ausente = 1. */
  peso?: number;
  /** `codigo` de la opción -> puntaje 0-5. */
  opciones: Record<string, number>;
}

/**
 * Qué le hace al resultado una regla especial que se activó.
 *  - `nivelMinimo`: el nivel del reporte no puede quedar por debajo de `valor`. Es
 *    un piso: si el cálculo ya dio más, gana el cálculo.
 *  - `sumarCriticidad`: suma `valor` puntos a la criticidad (tope 5).
 */
export type EfectoReglaEspecial = 'nivelMinimo' | 'sumarCriticidad';

/**
 * Regla que no puntúa un factor sino que actúa sobre el RESULTADO: "si la pregunta
 * X se respondió con alguna de estas opciones, entonces <efecto>".
 */
export interface ReglaEspecial {
  nombre: string;
  preguntaCodigo: string;
  opcionCodigos: string[];
  efecto: EfectoReglaEspecial;
  /** `nivelMinimo`: un nivel 0-3. `sumarCriticidad`: puntos 0-5. */
  valor: number;
}

export interface PuntajesConfig {
  f1: TablaF1;
  f4: TablaF4;
  factores: Record<FactorCuestionario, FactorCuestionarioConfig>;
  reglas: ReglaPuntaje[];
  /** Reglas que actúan sobre el resultado. Vacío = ninguna. */
  reglasEspeciales: ReglaEspecial[];
}

/** Quién creó la versión. `null` en la v1, que viene del seed. */
export interface AutorConfiguracion {
  id: number;
  nombreCompleto: string;
  correoElectronico: string;
}

export interface ConfiguracionCriticidad {
  id: number;
  version: number;
  pesos: Pesos;
  puntajes: PuntajesConfig;
  umbralesNivel: UmbralesNivel;
  radioMetros: number;
  ventanaDias: number;
  minReportes: number;
  limitesAntiabuso: LimitesAntiabuso;
  /**
   * LEGADO: era el monto del bonus cuando esa regla estaba cableada en el motor.
   * Hoy cada regla especial lleva su propio `valor` y el motor no lo lee. Sigue en
   * el DTO porque las versiones viejas del historial lo tienen guardado.
   */
  bonusVulnerable: number;
  activa: boolean;
  autor: AutorConfiguracion | null;
  fechaCreacion: string;
}

/**
 * Body del `PUT`. Va COMPLETO: no hay actualización parcial, porque cada envío
 * crea una versión nueva entera.
 */
export interface ActualizarConfiguracionInput {
  pesos: Pesos;
  puntajes: PuntajesConfig;
  umbralesNivel: UmbralesNivel;
  radioMetros: number;
  ventanaDias: number;
  minReportes: number;
  limitesAntiabuso: LimitesAntiabuso;
}

export interface ListarVersionesQuery {
  page?: number;
  limit?: number;
}
