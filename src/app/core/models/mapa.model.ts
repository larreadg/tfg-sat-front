import { Canal, EstadoEvaluacionIa } from './reporte.model';

/**
 * GeoJSON del mapa admin. Refleja `modules/mapa/mapa.types.ts` del back.
 * Coordenadas en orden [longitud, latitud] (RFC 7946); Leaflet usa [lat, lng].
 */

export interface GeoJsonPoint {
  type: 'Point';
  coordinates: [number, number];
}

export interface GeoJsonFeature<P> {
  type: 'Feature';
  geometry: GeoJsonPoint;
  properties: P;
}

export interface GeoJsonFeatureCollection<P> {
  type: 'FeatureCollection';
  features: GeoJsonFeature<P>[];
}

export interface PropiedadesReporte {
  tipo: 'reporte';
  id: number;
  codigoPublico: string;
  canal: Canal;
  fecha: string;
  nivelPreliminar: number | null;
  criticidad: number | null;
  estadoAnalisis: EstadoEvaluacionIa;
}

export interface PropiedadesPuntoCritico {
  tipo: 'punto_critico';
  id: number;
  nivel: number;
  cantidadReportes: number;
  radioMetros: number;
  estado: 'ACTIVO' | 'RESUELTO';
}

export type PropiedadesMapa = PropiedadesReporte | PropiedadesPuntoCritico;

export type MapaGeoJson = GeoJsonFeatureCollection<PropiedadesMapa>;

/** Filtros del mapa (sin paginación). */
export interface MapaFiltros {
  desde?: string;
  hasta?: string;
  canal?: Canal;
  estado?: EstadoEvaluacionIa;
  nivel?: number;
  bbox?: string;
}
