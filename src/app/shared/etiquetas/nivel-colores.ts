/**
 * Colores del nivel de criticidad 0–3 para superficies que NO son DOM del tema:
 * los marcadores de Leaflet y los gráficos de Chart.js pintan sobre canvas/SVG
 * propio y no pueden usar clases PrimeFlex ni variables `--p-*`. Es la única
 * excepción a "colores solo del tema", y vive acá —en un solo lugar— para que
 * el mapa y los gráficos no se desincronicen entre sí ni con los `p-tag`
 * (secondary / info / warn / danger, mismo orden de severidad).
 *
 * Validado como paleta: separación CVD (deuteranopía/tritanopía) y contraste
 * entre pares adyacentes por encima del piso. El gris del nivel 0 es intencional
 * —"Informativo" es ausencia de prioridad, no una categoría más—, por eso todo
 * gráfico que use esta escala muestra además el valor numérico y no depende del
 * color solo.
 */
export const COLOR_NIVEL: Record<number, string> = {
  0: '#64748b',
  1: '#0ea5e9',
  2: '#f59e0b',
  3: '#ef4444'
};

/** Color del nivel; el gris de "sin calcular" para `null`. */
export function colorNivel(nivel: number | null | undefined): string {
  return nivel == null ? COLOR_NIVEL[0] : (COLOR_NIVEL[nivel] ?? COLOR_NIVEL[0]);
}

/** Gris claro para "sin nivel todavía" (reporte con la IA aún pendiente). */
export const COLOR_SIN_NIVEL = '#cbd5e1';

/**
 * Colores de la criticidad de una ZONA del mapa de riesgo (5 grados, contra los 4
 * niveles de un reporte). Misma excepción y mismo motivo que `COLOR_NIVEL`: son
 * polígonos de Leaflet, pintados fuera del DOM del tema.
 *
 * Reusa la rampa de `COLOR_NIVEL` para que el mapa se lea como una sola escala, y
 * agrega el verde de "sin riesgo" —el único grado que afirma ausencia de riesgo, y
 * que en la escala de reportes no existe—. El gris queda para "baja", que es el
 * equivalente del informativo.
 */
export const COLOR_CRITICIDAD_ZONA: Record<string, string> = {
  SIN_RIESGO: '#16a34a',
  BAJA: '#64748b',
  MEDIA: '#0ea5e9',
  ALTA: '#f59e0b',
  CRITICA: '#ef4444'
};

export function colorCriticidadZona(criticidad: string | null | undefined): string {
  return (criticidad && COLOR_CRITICIDAD_ZONA[criticidad]) || COLOR_CRITICIDAD_ZONA['BAJA'];
}
