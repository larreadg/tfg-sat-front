export const environment = {
  // Sin barra final: los servicios concatenan `/api/v1/...` y `/uploads/...`.
  // El proxy de simplifika.lat le quita `/api-aguardpy` antes de pasarlo al back.
  apiUrl: 'https://simplifika.lat/api-aguardpy',
  // Sitekey de Cloudflare Turnstile (RF-29). COMPLETAR con la del widget de
  // produccion: vacia, el widget no renderiza y los formularios quedan
  // bloqueados a proposito (falla cerrado). No dejar la clave de prueba aca:
  // esa valida cualquier token y anularia el gate anti-bot.
  turnstileSiteKey: '',
  appName: 'AGUARD',
  appVersion: 'v1.0.0'
};
