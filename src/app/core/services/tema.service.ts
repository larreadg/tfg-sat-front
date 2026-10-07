import { Injectable, computed, signal } from '@angular/core';

/**
 * Clase que PrimeNG usa como `darkModeSelector` (ver `app.config.ts`). Va en
 * `<html>` y no en el `<body>` por dos motivos: las utilidades de color de
 * PrimeFlex 4 están escritas con `light-dark()`, que resuelve según el
 * `color-scheme` declarado en `:root` (ver `styles.scss`), y el navegador usa
 * ese mismo valor para el fondo del documento y los controles nativos.
 */
const CLASE_OSCURO = 'app-dark';

/** Clave de la preferencia. `localStorage` (no `sessionStorage`): el tema se elige una vez. */
const PREFERENCIA_KEY = 'sat_tema';

const CONSULTA_SISTEMA = '(prefers-color-scheme: dark)';

/** Preferencia explícita de la persona. Su ausencia significa "seguir al sistema". */
export type PreferenciaTema = 'claro' | 'oscuro';

/**
 * El acceso a `localStorage` puede tirar (modo privado, almacenamiento
 * bloqueado). El tema es una comodidad, nunca un motivo para que la app no
 * arranque: ante cualquier error se cae a la preferencia del sistema.
 */
function leerPreferencia(): PreferenciaTema | null {
  try {
    const guardada = localStorage.getItem(PREFERENCIA_KEY);
    return guardada === 'claro' || guardada === 'oscuro' ? guardada : null;
  } catch {
    return null;
  }
}

function guardarPreferencia(preferencia: PreferenciaTema): void {
  try {
    localStorage.setItem(PREFERENCIA_KEY, preferencia);
  } catch {
    // Sin persistencia el tema vale para esta pestaña y nada más.
  }
}

function sistemaEsOscuro(): boolean {
  return window.matchMedia(CONSULTA_SISTEMA).matches;
}

function aplicarClase(oscuro: boolean): void {
  document.documentElement.classList.toggle(CLASE_OSCURO, oscuro);
}

/**
 * Pinta el tema antes de que Angular arranque; se la llama desde `main.ts`.
 * Si se esperara a que `TemaService` se instancie, el primer frame se dibujaría
 * en claro y el tema oscuro entraría de golpe unos cientos de milisegundos
 * después. Es la única razón por la que esto vive fuera de la clase.
 */
export function aplicarTemaInicial(): void {
  const preferencia = leerPreferencia();
  aplicarClase(preferencia ? preferencia === 'oscuro' : sistemaEsOscuro());
}

/**
 * Tema claro/oscuro de la app.
 *
 * Mientras la persona no elija nada, manda el sistema operativo —y se lo sigue
 * en vivo, por si cambia de esquema con la app abierta—. El primer uso del
 * interruptor del encabezado fija una preferencia explícita que desde entonces
 * tiene prioridad y sobrevive al cierre del navegador.
 */
@Injectable({ providedIn: 'root' })
export class TemaService {
  private readonly preferencia = signal<PreferenciaTema | null>(leerPreferencia());
  private readonly sistemaOscuro = signal(sistemaEsOscuro());

  readonly esOscuro = computed(() => {
    const preferencia = this.preferencia();
    return preferencia ? preferencia === 'oscuro' : this.sistemaOscuro();
  });

  /** Ícono y rótulo del interruptor: anuncian a dónde lleva, no dónde se está. */
  readonly iconoAlternar = computed(() => (this.esOscuro() ? 'pi pi-sun' : 'pi pi-moon'));
  readonly etiquetaAlternar = computed(() =>
    this.esOscuro() ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro'
  );

  constructor() {
    // El esquema del sistema puede cambiar con la app abierta (horario del SO).
    // Solo se nota si todavía no hay preferencia explícita.
    window.matchMedia(CONSULTA_SISTEMA).addEventListener('change', (evento) => {
      this.sistemaOscuro.set(evento.matches);
      this.sincronizarDom();
    });
  }

  alternar(): void {
    this.establecer(this.esOscuro() ? 'claro' : 'oscuro');
  }

  establecer(preferencia: PreferenciaTema): void {
    guardarPreferencia(preferencia);
    this.preferencia.set(preferencia);
    this.sincronizarDom();
  }

  /**
   * Valor actual de un token `--p-*` del tema, leído del DOM.
   *
   * Para Chart.js, que resuelve sus colores en TypeScript y no por CSS. Lee
   * `esOscuro()` a propósito: así el `computed()` que la llame queda atado al
   * tema y el gráfico se repinta con los colores nuevos al cambiarlo.
   */
  token(nombre: string): string {
    this.esOscuro();
    return getComputedStyle(document.documentElement).getPropertyValue(nombre).trim();
  }

  /**
   * La clase se escribe acá, al lado del `set()`, y no desde un `effect()`:
   * `token()` lee el valor **calculado** de las variables CSS, así que la clase
   * tiene que estar puesta antes de que se recalcule cualquier `computed()` que
   * dependa del tema. Con un `effect()` ese orden no está garantizado y los
   * gráficos se repintarían un ciclo tarde, con los colores del tema anterior.
   */
  private sincronizarDom(): void {
    aplicarClase(this.esOscuro());
  }
}
