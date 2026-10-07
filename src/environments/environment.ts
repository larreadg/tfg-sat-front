export const environment = {
  apiUrl: 'http://localhost:3000',
  // Sitekey de Cloudflare Turnstile (RF-29). COMPLETAR con la del widget de
  // produccion: vacia, el widget no renderiza y los formularios quedan
  // bloqueados a proposito (falla cerrado). No dejar la clave de prueba aca:
  // esa valida cualquier token y anularia el gate anti-bot.
  turnstileSiteKey: '',
  appName: 'AGUARD',
  appVersion: 'v1.0.0'
};
