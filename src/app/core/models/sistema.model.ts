/**
 * Estado operativo del sistema (`GET /admin/configuracion/sistema`). SOLO LECTURA:
 * son parámetros que viven en el `.env` del backend y no se editan desde la web.
 *
 * El backend enumera estos campos uno por uno justamente para no filtrar secretos
 * (claves de OpenAI, tokens de Telegram, secrets de JWT). Nunca esperar acá nada
 * parecido a una credencial.
 */

export interface CanalesSistema {
  web: boolean;
  telegram: boolean;
  /** El enum `Canal` ya lo contempla, pero todavía no hay integración. */
  whatsapp: boolean;
}

/** Canal de salida por correo. Se configura en el servidor, no desde el panel. */
export interface CorreoSistema {
  habilitado: boolean;
}

export interface IaSistema {
  modelo: string;
  /** Expresión cron del job que evalúa los reportes pendientes. */
  cronExpr: string;
  batchSize: number;
  maxIntentos: number;
}

export interface EncuestaActivaSistema {
  id: number;
  version: number;
  nombre: string;
  fotosMin: number;
  fotosMax: number;
}

export interface ConfiguracionActivaSistema {
  id: number;
  version: number;
}

export interface EstadoSistema {
  entorno: string;
  /** `'desconocida'` si el backend no se arrancó vía npm. */
  version: string;
  canales: CanalesSistema;
  correo: CorreoSistema;
  ia: IaSistema;
  encuestaActiva: EncuestaActivaSistema | null;
  configuracionActiva: ConfiguracionActivaSistema | null;
}
