import * as L from 'leaflet';
import { MallaRiesgo } from '../../core/models/zona-riesgo.model';
import { colorCriticidadZona } from '../etiquetas/nivel-colores';

/** Pane propio: entre las tiles (200) y los polígonos de zonas (overlayPane, 400). */
export const PANE_MALLA = 'mallaRiesgo';

/**
 * Opacidad de la malla. Más baja que el relleno de una zona dibujada (0.25 sobre
 * el color pleno da algo parecido, pero acá el color cubre TODA la celda): tiene
 * que dejar leer las calles de abajo y que una zona dibujada encima se distinga.
 */
const OPACIDAD = 0.4;

/** Crea (una vez por mapa) el pane donde va la malla, debajo de las zonas. */
export function asegurarPaneMalla(mapa: L.Map): void {
  if (mapa.getPane(PANE_MALLA)) {
    return;
  }
  const pane = mapa.createPane(PANE_MALLA);
  pane.style.zIndex = '350';
  // Es fondo: los clicks y el hover tienen que pasar a las zonas y a los pines.
  pane.style.pointerEvents = 'none';
}

/**
 * Pinta la malla de riesgo base como una imagen sobre el mapa, con la misma paleta
 * que las zonas dibujadas (`colorCriticidadZona`): el mapa se lee como una sola
 * escala, venga el riesgo de la malla o de una zona.
 *
 * Las celdas vienen comprimidas (zlib) desde el back; se descomprimen con la API
 * nativa del navegador, sin librerías.
 */
export async function crearCapaMalla(malla: MallaRiesgo): Promise<L.ImageOverlay> {
  const celdas = await descomprimir(malla.celdas);

  const colores = malla.tramos.map((tramo) => hexARgb(colorCriticidadZona(tramo.criticidad)));

  const lienzo = document.createElement('canvas');
  lienzo.width = malla.ancho;
  lienzo.height = malla.alto;
  const contexto = lienzo.getContext('2d');
  if (!contexto) {
    throw new Error('El navegador no permite dibujar la malla de riesgo.');
  }

  const imagen = contexto.createImageData(malla.ancho, malla.alto);
  for (let i = 0; i < celdas.length; i++) {
    const color = colores[celdas[i] - 1];
    if (!color) {
      continue; // 0 = sin dato: queda transparente
    }
    const base = i * 4;
    imagen.data[base] = color[0];
    imagen.data[base + 1] = color[1];
    imagen.data[base + 2] = color[2];
    imagen.data[base + 3] = 255;
  }
  contexto.putImageData(imagen, 0, 0);

  const { minLat, maxLat, minLng, maxLng } = malla.limites;
  // `pmIgnore`: en la pantalla de zonas, Geoman no tiene que ofrecer editar ni
  // mover la malla. Es fija.
  const opciones: L.ImageOverlayOptions & { pmIgnore: boolean } = {
    pane: PANE_MALLA,
    opacity: OPACIDAD,
    interactive: false,
    className: 'capa-malla-riesgo',
    pmIgnore: true
  };
  return L.imageOverlay(
    lienzo.toDataURL('image/png'),
    L.latLngBounds([minLat, minLng], [maxLat, maxLng]),
    opciones
  );
}

/** Límites de la malla, para encuadrarla. */
export function limitesMalla(malla: MallaRiesgo): L.LatLngBounds {
  const { minLat, maxLat, minLng, maxLng } = malla.limites;
  return L.latLngBounds([minLat, minLng], [maxLat, maxLng]);
}

async function descomprimir(base64: string): Promise<Uint8Array> {
  const binario = atob(base64);
  const comprimido = new Uint8Array(binario.length);
  for (let i = 0; i < binario.length; i++) {
    comprimido[i] = binario.charCodeAt(i);
  }
  // 'deflate' = formato zlib (RFC 1950), el mismo que `zlib.deflateSync` del back.
  const flujo = new Blob([comprimido]).stream().pipeThrough(new DecompressionStream('deflate'));
  return new Uint8Array(await new Response(flujo).arrayBuffer());
}

function hexARgb(hex: string): [number, number, number] {
  const valor = parseInt(hex.replace('#', ''), 16);
  return [(valor >> 16) & 0xff, (valor >> 8) & 0xff, valor & 0xff];
}
