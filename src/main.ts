import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { App } from './app/app';
import { aplicarTemaInicial } from './app/core/services/tema.service';

// Antes del bootstrap: la clase del tema tiene que estar en `<html>` para el
// primer frame. `TemaService` la mantiene después; esto solo evita el salto
// inicial de claro a oscuro.
aplicarTemaInicial();

bootstrapApplication(App, appConfig)
  .catch((err) => console.error(err));
