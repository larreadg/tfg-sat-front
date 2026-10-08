export const environment = {
  // Sin barra final: los servicios concatenan `/api/v1/...` y `/uploads/...`.
  // El proxy de simplifika.lat le quita `/api-aguardpy` antes de pasarlo al back.
  apiUrl: 'https://simplifika.lat/api-aguardpy',
  // Sitekey de Cloudflare Turnstile (RF-29), widget de produccion. Es publica;
  // su par secreto va en TURNSTILE_SECRET del back. Vacia, el widget no
  // renderiza y los formularios quedan bloqueados a proposito (falla cerrado).
  // Nunca la clave de prueba: valida cualquier token y anula el gate anti-bot.
  turnstileSiteKey: '0x4AAAAAAEmSXxEIjd92-cJp',
  appName: 'AGUARD',
  appVersion: 'v1.0.0'
};
