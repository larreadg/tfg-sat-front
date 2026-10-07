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
  ia: IaSistema;
  encuestaActiva: EncuestaActivaSistema | null;
  configuracionActiva: ConfiguracionActivaSistema | null;
}

// --- Transporte SMTP (tab Sistema) ------------------------------------------

/** Espeja el enum de `smtpSeguridad` del backend. */
export type SeguridadSmtp = 'NINGUNA' | 'STARTTLS' | 'SSL_TLS';

/**
 * Transporte SMTP (`GET /admin/configuracion/notificaciones`): con qué servidor se
 * manda, y nada más.
 *
 * Deliberadamente sin remitente ni destinatarios: el remitente se configura en la
 * pantalla **Webhooks** y los destinatarios son parte de cada regla. Acá tampoco
 * hay contraseña: el backend nunca la devuelve, ni enmascarada; solo se sabe si
 * hay una guardada (`tieneContrasena`).
 */
export interface ConfiguracionNotificacion {
  smtpHabilitado: boolean;
  smtpHost: string;
  smtpPuerto: number;
  smtpSeguridad: SeguridadSmtp;
  smtpUsuario: string;
  tieneContrasena: boolean;
  /** `false` si al backend le falta `CONFIG_ENCRYPTION_KEY`: no puede guardar contraseñas. */
  cifradoDisponible: boolean;
  /** El `From` con el que saldría un correo hoy. Informativo: esta pantalla no lo edita. */
  remitenteEfectivo: string;
  actualizadoPor: { id: number; nombreCompleto: string; correoElectronico: string } | null;
  fechaActualizacion: string | null;
}

/**
 * Body del `PUT`. `smtpContrasena` es de tres estados:
 *   - ausente (`undefined`) → conservar la guardada.
 *   - `null`               → borrarla (SMTP sin autenticación).
 *   - string               → reemplazarla.
 */
export interface ActualizarNotificacionInput {
  smtpHabilitado: boolean;
  smtpHost: string;
  smtpPuerto: number;
  smtpSeguridad: SeguridadSmtp;
  smtpUsuario: string;
  smtpContrasena?: string | null;
}

export interface ResultadoPruebaCorreo {
  destinatario: string;
  duracionMs: number;
}
