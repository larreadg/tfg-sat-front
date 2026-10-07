/**
 * Helpers para armar el `resumen` de `FiltrosPanel`. Viven acá y no en cada
 * pantalla porque el formato del rango de fechas se repite en todas y tiene que
 * leerse igual en todas.
 */

/** Opción de un `p-select` de filtro: lo mínimo para resolver la etiqueta. */
interface OpcionFiltro<T> {
  label: string;
  value: T;
}

function ddMMyy(fecha: Date): string {
  const dia = String(fecha.getDate()).padStart(2, '0');
  const mes = String(fecha.getMonth() + 1).padStart(2, '0');
  const anio = String(fecha.getFullYear()).slice(-2);
  return `${dia}/${mes}/${anio}`;
}

/**
 * Etiqueta de un rango de un `p-datepicker` en modo `range`. Devuelve `null`
 * cuando no hay rango (el llamador decide si muestra un texto por defecto).
 * El datepicker deja elegir solo la fecha de inicio, de ahí el caso "Desde".
 */
export function etiquetaRango(rango: Date[] | null): string | null {
  const desde = rango?.[0];
  const hasta = rango?.[1];
  if (!desde) {
    return null;
  }
  return hasta ? `${ddMMyy(desde)} – ${ddMMyy(hasta)}` : `Desde ${ddMMyy(desde)}`;
}

/**
 * Etiqueta de un filtro de `p-select`, buscada en sus propias opciones para no
 * repetir los textos. `null`/`undefined` = sin filtrar.
 */
export function etiquetaOpcion<T>(valor: T | null | undefined, opciones: OpcionFiltro<T>[]): string | null {
  if (valor === null || valor === undefined) {
    return null;
  }
  return opciones.find((opcion) => opcion.value === valor)?.label ?? null;
}

/** Descarta los filtros sin valor y deja solo las etiquetas a mostrar. */
export function resumenFiltros(...etiquetas: (string | null | undefined)[]): string[] {
  return etiquetas.filter((etiqueta): etiqueta is string => !!etiqueta);
}
