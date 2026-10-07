import { EstadoAlerta } from '../../core/models/alerta.model';
import { SeveridadTag } from './reporte-etiquetas';

/**
 * Etiquetas del ESTADO de gestión de una alerta. Describen el flujo de trabajo
 * del analista (NUEVA → EN_REVISION → …), nunca el estado del agua (RNF-14).
 */
export const ESTADO_ALERTA_LABEL: Record<EstadoAlerta, string> = {
  NUEVA: 'Nueva',
  EN_REVISION: 'En revisión',
  DERIVADA: 'Derivada',
  CERRADA: 'Cerrada',
  DESCARTADA: 'Descartada'
};

const ESTADO_ALERTA_SEVERIDAD: Record<EstadoAlerta, SeveridadTag> = {
  NUEVA: 'warn',
  EN_REVISION: 'info',
  DERIVADA: 'contrast',
  CERRADA: 'success',
  DESCARTADA: 'secondary'
};

/**
 * Icono del estado, para los encabezados de columna del tablero Kanban. Da una
 * pista del paso del flujo (bandeja → lupa → derivación → cierre) sin tener
 * que leer el título.
 */
const ESTADO_ALERTA_ICONO: Record<EstadoAlerta, string> = {
  NUEVA: 'pi pi-inbox',
  EN_REVISION: 'pi pi-search',
  DERIVADA: 'pi pi-send',
  CERRADA: 'pi pi-check-circle',
  DESCARTADA: 'pi pi-ban'
};

export function estadoAlertaLabel(estado: EstadoAlerta): string {
  return ESTADO_ALERTA_LABEL[estado] ?? estado;
}

export function estadoAlertaSeveridad(estado: EstadoAlerta): SeveridadTag {
  return ESTADO_ALERTA_SEVERIDAD[estado] ?? 'secondary';
}

export function estadoAlertaIcono(estado: EstadoAlerta): string {
  return ESTADO_ALERTA_ICONO[estado] ?? 'pi pi-circle';
}
