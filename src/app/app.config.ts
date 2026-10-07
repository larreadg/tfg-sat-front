import { ApplicationConfig, LOCALE_ID, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { providePrimeNG } from 'primeng/config';
import { registerLocaleData } from '@angular/common';
import localeEs from '@angular/common/locales/es';
import { definePreset } from '@primeuix/styled';
import Aura from '@primeng/themes/aura';
import { MessageService } from 'primeng/api';

import { routes } from './app.routes';
import { authInterceptor } from './core/interceptors/auth.interceptor';

// La app es en español: sin registrar el locale, `DatePipe` formatea en inglés
// (nombres de mes y día). Los formatos numéricos ya usados no cambian.
registerLocaleData(localeEs, 'es');

const AuraCyan = definePreset(Aura, {
  semantic: {
    primary: {
      50: '{cyan.50}',
      100: '{cyan.100}',
      200: '{cyan.200}',
      300: '{cyan.300}',
      400: '{cyan.400}',
      500: '{cyan.500}',
      600: '{cyan.600}',
      700: '{cyan.700}',
      800: '{cyan.800}',
      900: '{cyan.900}',
      950: '{cyan.950}'
    }
  }
});

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    { provide: LOCALE_ID, useValue: 'es' },
    provideRouter(routes),
    provideAnimationsAsync(),
    provideHttpClient(withInterceptors([authInterceptor])),
    providePrimeNG({
      theme: {
        preset: AuraCyan,
        // Selector manual (no `'system'`): el tema lo elige la persona con el
        // interruptor del encabezado. La clase la pone `TemaService` en `<html>`.
        options: { darkModeSelector: '.app-dark' }
      }
    }),
    MessageService
  ]
};
