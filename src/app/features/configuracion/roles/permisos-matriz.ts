import { PermisoItem } from '../../../core/models/rol.model';

/**
 * Agrupa el catálogo plano de permisos (`recurso.accion`) en una matriz
 * recurso × acción. Se arma desde el catálogo que devuelve el backend, no desde
 * una lista fija: si el seed suma un recurso nuevo, aparece solo en la pantalla.
 */

export const ACCIONES = ['ver', 'crear', 'editar', 'eliminar'] as const;

export type Accion = (typeof ACCIONES)[number];

export interface FilaPermisos {
  recurso: string;
  label: string;
  /** `null` cuando esa combinación recurso/acción no existe en el catálogo. */
  celdas: Record<Accion, PermisoItem | null>;
  /** Ids de los permisos existentes de la fila (para "marcar toda la fila"). */
  idsDisponibles: number[];
}

/**
 * Nombres legibles. Los recursos que no estén acá caen al formateo automático,
 * así que no hace falta mantener el mapa sincronizado para que la pantalla ande.
 */
const ETIQUETAS: Record<string, string> = {
  persona: 'Personas',
  usuario: 'Usuarios',
  rol: 'Roles',
  permiso: 'Permisos',
  rol_permiso: 'Permisos por rol',
  usuario_rol: 'Roles por usuario',
  encuesta: 'Encuestas',
  encuesta_pregunta: 'Preguntas por encuesta',
  pregunta: 'Preguntas',
  pregunta_opcion: 'Opciones de pregunta',
  usuario_ciudadano: 'Ciudadanos',
  respuesta: 'Respuestas',
  respuesta_archivo: 'Archivos de respuesta',
  evaluacion_ia: 'Evaluaciones de IA',
  reporte: 'Reportes',
  alerta: 'Alertas',
  punto_critico: 'Puntos críticos',
  configuracion_criticidad: 'Configuración de criticidad'
};

/** `punto_critico` → `Punto critico`. Fallback para recursos no catalogados. */
function etiquetaAutomatica(recurso: string): string {
  const texto = recurso.replace(/_/g, ' ');
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

function esAccion(valor: string): valor is Accion {
  return (ACCIONES as readonly string[]).includes(valor);
}

export function construirMatriz(permisos: PermisoItem[]): FilaPermisos[] {
  const porRecurso = new Map<string, FilaPermisos>();

  for (const permiso of permisos) {
    // Se parte por el ÚLTIMO punto: los recursos llevan guion bajo, no punto,
    // pero así el parseo no se rompe si alguna vez lo llevan.
    const corte = permiso.nombre.lastIndexOf('.');
    if (corte <= 0) {
      continue;
    }

    const recurso = permiso.nombre.slice(0, corte);
    const accion = permiso.nombre.slice(corte + 1);
    if (!esAccion(accion)) {
      continue;
    }

    let fila = porRecurso.get(recurso);
    if (!fila) {
      fila = {
        recurso,
        label: ETIQUETAS[recurso] ?? etiquetaAutomatica(recurso),
        celdas: { ver: null, crear: null, editar: null, eliminar: null },
        idsDisponibles: []
      };
      porRecurso.set(recurso, fila);
    }

    fila.celdas[accion] = permiso;
    fila.idsDisponibles.push(permiso.id);
  }

  return [...porRecurso.values()].sort((a, b) => a.label.localeCompare(b.label));
}
