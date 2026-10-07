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
