/**
 * Reglas de notificación (pantalla Notificaciones, ruta `/webhooks`).
 *
 * Los literales de `EventoWebhook` y `AccionWebhook` espejan los enums de Prisma,
 * pero **la pantalla no tiene cableado qué campos mostrar para cada uno**: eso sale
 * del catálogo (`GET /admin/webhooks/eventos`, tipo `CatalogoWebhooks`). Si el
 * backend agrega un evento, el formulario lo ofrece solo.
 *
 * `label` y `descripcion` del catálogo se muestran tal cual: son textos para quien
 * configura avisos, no para quien programa.
 */

export type EventoWebhook =
  | 'ALERTA_CREADA'
  | 'ALERTA_ESCALADA'
  | 'ALERTA_ESTADO_CAMBIADO'
  | 'PUNTO_CRITICO_CONSOLIDADO';

export type AccionWebhook = 'CORREO' | 'HTTP';

export type EstadoAlerta = 'NUEVA' | 'EN_REVISION' | 'DERIVADA' | 'CERRADA' | 'DESCARTADA';

/** Condiciones que una regla puede imponer. El catálogo dice cuáles aplican a cada evento. */
export type CondicionWebhook = 'nivelMinimo' | 'estadosDestino';

/** Campos que una acción necesita. El catálogo dice cuáles pide cada acción. */
export type CampoAccion =
  | 'destinatarios'
  | 'asunto'
  | 'cuerpoCorreo'
  | 'url'
  | 'secretoFirma'
  | 'cuerpoHttp'
  | 'cabeceras';

export interface VariablePlantilla {
  clave: string;
  descripcion: string;
  ejemplo: string;
}

export interface DefinicionEvento {
  valor: EventoWebhook;
  label: string;
  descripcion: string;
  condiciones: CondicionWebhook[];
  variables: VariablePlantilla[];
}

export interface DefinicionAccion {
  valor: AccionWebhook;
  label: string;
  descripcion: string;
  campos: CampoAccion[];
}

/** Lo que hace dinámico al formulario: la forma de una regla la decide el backend. */
export interface CatalogoWebhooks {
  eventos: DefinicionEvento[];
  acciones: DefinicionAccion[];
  estadosAlerta: EstadoAlerta[];
  etiquetasNivel: Record<string, string>;
}

export interface EntregaWebhook {
  id: number;
  evento: EventoWebhook;
  exito: boolean;
  /**
   * Respuesta del destino o el error textual ("HTTP 200", "ENOTFOUND"…). Es dato
   * de diagnóstico, no una frase de interfaz: se muestra tal cual porque es lo
   * único que permite entender por qué falló un aviso.
   */
  detalle: string;
  duracionMs: number;
  cargaUtil: unknown;
  /** `true` si la disparó el botón "Probar" y no un evento real. */
  esPrueba: boolean;
  fechaCreacion: string;
}

export interface AutorWebhook {
  id: number;
  nombreCompleto: string;
  correoElectronico: string;
}

/**
 * Una cabecera HTTP tal como la devuelve la API: **sin el valor**. Es casi siempre
 * una credencial, así que se trata igual que el secreto de firma.
 */
export interface CabeceraWebhook {
  nombre: string;
  tieneValor: boolean;
}

/**
 * Una cabecera tal como se manda en el POST/PUT. `valor` ausente = conservar el
 * guardado para esa cabecera (el backend la identifica por `nombre`), porque la API
 * no lo devuelve y el panel no puede reenviarlo. Para quitarla, se la saca del array.
 */
export interface CabeceraWebhookInput {
  nombre: string;
  valor?: string;
}

/**
 * Una regla. No hay campo con el secreto de firma ni con el valor de las cabeceras:
 * el backend nunca los devuelve, igual que la contraseña SMTP; solo se sabe que
 * existen (`tieneSecretoFirma`, `cabeceras[].tieneValor`).
 */
export interface ReglaWebhook {
  id: number;
  nombre: string;
  evento: EventoWebhook;
  accion: AccionWebhook;
  activa: boolean;
  nivelMinimo: number | null;
  estadosDestino: EstadoAlerta[];
  destinatarios: string[];
  asunto: string;
  /** Plantilla HTML del cuerpo del correo. Vacío = cuerpo autogenerado. */
  cuerpoCorreo: string;
  url: string;
  tieneSecretoFirma: boolean;
  /** Plantilla JSON del body del POST. Vacío = el payload completo de AGUARD. */
  cuerpoHttp: string;
  cabeceras: CabeceraWebhook[];
  /** Por qué esta regla no puede ejecutarse ahora. `null` = está lista. */
  advertencia: string | null;
  ultimaEntrega: EntregaWebhook | null;
  autor: AutorWebhook | null;
  editor: AutorWebhook | null;
  fechaCreacion: string;
  fechaActualizacion: string;
}

/**
 * Body del POST/PUT. `secretoFirma` es de tres estados, igual que la contraseña
 * SMTP: ausente = conservar el guardado, `null` = borrarlo, string = reemplazarlo.
 */
export interface GuardarReglaInput {
  nombre: string;
  evento: EventoWebhook;
  accion: AccionWebhook;
  activa: boolean;
  nivelMinimo?: number | null;
  estadosDestino?: EstadoAlerta[];
  destinatarios?: string;
  asunto?: string;
  cuerpoCorreo?: string;
  url?: string;
  secretoFirma?: string | null;
  cuerpoHttp?: string;
  cabeceras?: CabeceraWebhookInput[];
}

export interface Remitente {
  remitenteNombre: string;
  remitenteCorreo: string;
  /** El `From` real que se usaría hoy (cae al usuario SMTP si no hay remitente). */
  remitenteEfectivo: string;
  smtpHabilitado: boolean;
  smtpUsuario: string;
}

export interface ActualizarRemitenteInput {
  remitenteNombre: string;
  remitenteCorreo: string;
}

export interface ListarReglasQuery {
  page?: number;
  limit?: number;
  evento?: EventoWebhook;
  activa?: boolean;
}
