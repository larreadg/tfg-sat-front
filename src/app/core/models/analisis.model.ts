import { EstadoAlerta } from './alerta.model';
import { Canal, EstadoEvaluacionIa } from './reporte.model';

/**
 * Modelos del panel de análisis. Reflejan los DTOs reales del backend
 * (`modules/analisis/analisis.types.ts`). Las fechas viajan como string ISO.
 */

export interface ConteoPorNivel {
  nivel: number;
  cantidad: number;
}

/** Estado ACTUAL del sistema: no se filtra por el período elegido. */
export interface Situacion {
  reportes24h: number;
  reportes7d: number;
  reportesPeriodo: number;
  sinAnalizar: number;
  alertasActivasPorNivel: ConteoPorNivel[];
  alertasActivasTotal: number;
  puntosCriticosActivos: number;
}

export interface DiaTendencia {
  fecha: string;
  nivel0: number;
  nivel1: number;
  nivel2: number;
  nivel3: number;
  sinNivel: number;
  total: number;
}

export interface PromedioFactor {
  factor: 'f1' | 'f2' | 'f3' | 'f4' | 'f5';
  etiqueta: string;
  promedio: number | null;
  disponibleEn: number;
}

export interface Factores {
  reportesConDesglose: number;
  promedios: PromedioFactor[];
  criticidadPromedio: number | null;
  /** RN-12: bonus por lugar vulnerable (escuela / puesto de salud). */
  conBonusVulnerabilidad: number;
  /** RN-11: malestar reportado en P-07, fuerza Nivel ≥ 1. */
  conPisoNivel1: number;
  sinAporteIa: number;
  distribucionNivel: ConteoPorNivel[];
  umbrales: { n1: number; n2: number; n3: number } | null;
}

export interface SaludIa {
  porEstado: { estado: EstadoEvaluacionIa; cantidad: number }[];
  total: number;
  conError: number;
  intentosPromedio: number | null;
  latenciaSegundos: number | null;
  riesgoScorePromedio: number | null;
}

export interface GestionAlertas {
  porEstado: { estado: EstadoAlerta; cantidad: number }[];
  sinAtender: number;
  minutosHastaRevision: number | null;
  minutosHastaCierre: number | null;
}

export interface PuntoCriticoTop {
  id: number;
  latitudCentro: number;
  longitudCentro: number;
  cantidadReportes: number;
  nivel: number;
  alertaId: number | null;
}

export interface AnalisisResumen {
  periodo: { desde: string; hasta: string };
  situacion: Situacion;
  tendencia: DiaTendencia[];
  factores: Factores;
  ia: SaludIa;
  gestion: GestionAlertas;
  canales: { canal: Canal; cantidad: number }[];
  topPuntosCriticos: PuntoCriticoTop[];
}

/** Período del resumen. Sin rango, el back toma los últimos 30 días. */
export interface AnalisisFiltros {
  desde?: string;
  hasta?: string;
}
