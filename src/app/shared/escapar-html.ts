/**
 * Escape de HTML para los pocos lugares donde el panel arma markup a mano y
 * Angular no puede sanearlo por nosotros:
 *
 *  - Leaflet: `bindPopup`/`bindTooltip` con un string hacen `innerHTML = content`.
 *  - PrimeNG `p-confirmdialog`: renderiza su `message` con `[innerHTML]`.
 *
 * En el resto del panel NO hace falta: la interpolación de Angular (`{{ }}`) ya
 * escapa, y `p-toast` muestra `summary`/`detail` como texto.
 *
 * Preferir, cuando se pueda, construir un `HTMLElement` y asignarle `.textContent`:
 * Leaflet acepta un elemento y en ese caso no reparsea nada. Este helper es para
 * cuando la API solo acepta string.
 */
export function escaparHtml(valor: unknown): string {
  return String(valor ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
