/**
 * Zona del mapa de riesgo: un polígono dibujado sobre el mapa con su criticidad.
 * Es la fuente de F5 en el motor de criticidad.
 */

/** Un vértice del polígono. El cierre es implícito: no se repite el primero. */
export interface VerticeZona {
  lat: number;
  lng: number;
}

/** Severidad de la zona. El orden del array es el orden de severidad. */
export type CriticidadZona = 'SIN_RIESGO' | 'BAJA' | 'MEDIA' | 'ALTA' | 'CRITICA';

export const CRITICIDADES_ZONA: CriticidadZona[] = ['SIN_RIESGO', 'BAJA', 'MEDIA', 'ALTA', 'CRITICA'];

export const ETIQUETA_CRITICIDAD_ZONA: Record<CriticidadZona, string> = {
  SIN_RIESGO: 'Sin riesgo',
  BAJA: 'Baja',
  MEDIA: 'Media',
  ALTA: 'Alta',
  CRITICA: 'Crítica'
};

/**
 * Puntaje que cada criticidad le aporta a F5. Espeja `PUNTAJE_F5_POR_CRITICIDAD`
 * del backend (`zonas-riesgo.service.ts`), que es la fuente de verdad: acá solo se
 * usa para mostrarle el número al analista mientras elige.
 */
export const PUNTAJE_F5_ZONA: Record<CriticidadZona, number> = {
  SIN_RIESGO: 1,
  BAJA: 2,
  MEDIA: 3,
  ALTA: 4,
  CRITICA: 5
};

export interface ZonaRiesgo {
  id: number;
  nombre: string;
  descripcion: string | null;
  criticidad: CriticidadZona;
  poligono: VerticeZona[];
  activo: boolean;
  puntajeF5: number;
  fechaCreacion: string;
  fechaActualizacion: string;
}

export interface CrearZonaRiesgoInput {
  nombre: string;
  descripcion?: string | null;
  criticidad: CriticidadZona;
  poligono: VerticeZona[];
  activo?: boolean;
}

export type ActualizarZonaRiesgoInput = Partial<CrearZonaRiesgoInput>;

/**
 * Malla de riesgo base: la zona "por defecto". No se dibuja a mano: viene de un
 * relevamiento cargado con el sistema, cubre Gran Asunción y alrededores, y no se
 * puede editar, desactivar ni eliminar. En F5 convive con las zonas dibujadas con
 * la misma regla que ellas entre sí: gana la criticidad más alta.
 */
export interface MallaRiesgo {
  nombre: string;
  fuente: string;
  generada: string;
  resolucionMetros: number;
  limites: { minLat: number; maxLat: number; minLng: number; maxLng: number };
  ancho: number;
  alto: number;
  /**
   * Celdas fila por fila desde el norte (filas espaciadas en Web Mercator, para que
   * Leaflet las estire sin corrimiento), comprimidas con zlib y en base64. Cada
   * byte: 0 = sin dato, 1..5 = `tramos[valor - 1]`.
   */
  celdas: string;
  tramos: TramoMalla[];
}

/** Rango del índice de la malla (0–100) que corresponde a una criticidad. */
export interface TramoMalla {
  desde: number;
  hasta: number;
  criticidad: CriticidadZona;
  puntajeF5: number;
}
