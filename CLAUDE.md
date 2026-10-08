# CLAUDE.md — tfg-sat-front (Angular 21 / PrimeNG)

> Reglas permanentes **solo del frontend**. Lo transversal (proyecto, back, comandos generales) está en el `CLAUDE.md` de la raíz. El estado coyuntural (gaps, qué falta) vive en `plan_accion_front.md`, no acá.

## 1. Reglas de UI (innegociables)

Aplican a todo template y estilo. No se negocian.

1. **Layout exclusivamente con PrimeFlex.** Armar el layout con clases: `grid`, `col-12`, `md:col-6`, `flex`, `flex-column`, `gap-*`, `p-*`, `m-*`, `align-items-*`, `justify-content-*`, `surface-*`, `border-*`. Prohibido escribir CSS de layout propio (`display:flex`, `grid-template-*`, `float`, márgenes/anchos a mano) cuando existe la clase PrimeFlex equivalente.
2. **Mobile-first, responsive al 100%.** Diseñar primero para el viewport más chico y escalar con breakpoints PrimeFlex `sm:` `md:` `lg:` `xl:`. Toda columna arranca en `col-12` y recién después suma variantes por breakpoint (ver `inicio.html:23`, `col-12 md:col-6 lg:col-4`). Ninguna pantalla puede requerir scroll horizontal en mobile. Nada de anchos fijos en px para contenedores.
3. **Colores solo del tema.** Prohibido hex/rgb/nombres de color. Usar variables CSS del tema con prefijo `--p-*` (ej. `--p-primary-600`, `--p-surface-100`, `--p-text-muted-color`, `--p-content-border-color`, `--p-focus-ring-width`) y las clases de texto/superficie de PrimeFlex (`text-color`, `text-color-secondary`, `text-primary`, `surface-card`, `surface-ground`, `surface-border`). Cambiar el look se hace en el `definePreset` de `app.config.ts`, no en los componentes. **La app tiene tema claro y oscuro**: preferir siempre el token semántico (`--p-content-background`, `--p-text-color`, `--p-highlight-background`), que ya cambia solo; un tono numerado de la paleta necesita `light-dark(...)` (ver §7).
4. **SCSS de componente al mínimo (realista).** Preferir props/variantes del componente PrimeNG y clases PrimeFlex. Escribir SCSS solo cuando ni PrimeFlex ni las props alcanzan (pseudo-elementos, `color-mix`, gradientes, ajustes de foco — ver `foto-selector.scss`, `login.scss`, `main-layout.scss`). Cuando sea inevitable: usar **siempre** variables `--p-*` del tema (nunca hex/rgb) y documentar el motivo con un comentario. `app.scss` debe quedar vacío.
5. **Componente PrimeNG antes que HTML propio.** Botones, inputs, tablas, dialogs, toasts, cards, menús, tags, selects, datepickers: siempre el componente PrimeNG (`p-button`, `p-table`, `p-card`, `p-dialog`, `p-toast`, `p-tag`, `p-select`, `p-datepicker`…), nunca `<button>`/`<input>`/`<table>` con clases propias.
   **Tampoco "disfrazar" un elemento con las clases internas del tema.** Un `<a class="p-button p-button-text …">` NO es un `p-button`: le faltan el ripple, los estados y el `text-decoration` del botón, así que hereda el subrayado de los enlaces y se nota. Para navegar desde un control con forma de botón: `<p-button [routerLink]="…" />`. Si de verdad hace falta un enlace (abrir en otra pestaña, menú contextual, `href` real), la forma correcta es la directiva: `<a pButton routerLink="…">`, nunca las clases a mano. Regla rápida: si estás escribiendo `class="p-…"`, estás usando la API equivocada.
6. **Botones siempre `[rounded]="true"`** (normal, `text`, `outlined`, de icono). Es la variante estándar (ver `main-layout.html`).
7. **Tooltips siempre a la izquierda.** Todo `pTooltip` lleva `tooltipPosition="left"`, sin excepciones: el valor por defecto de PrimeNG es `right` y mezclar posiciones hace que el panel se sienta inconsistente. Donde no entra a la izquierda —los iconos del menú lateral colapsado, pegados al borde— PrimeNG reacomoda el globo solo, así que no hay que "corregirlo" declarando otra posición.

## 2. Referencia PrimeNG

Antes de implementar cualquier componente PrimeNG, consultar la skill `primeng` (`.claude/skills/primeng/`). API **v21** siempre; nunca asumir módulos/inputs/outputs de memoria ni de versiones viejas (`p-dropdown`→`p-select`, `p-calendar`→`p-datepicker`). Respaldo online: `https://v21.primeng.org/`.

## 3. Comandos (dentro de `tfg-sat-front/`)

- `npm start` — dev server (`ng serve`). **⚠️ Trampa:** `angular.json` fuerza HTTPS (`ssl:true`, `sslCert: certs/cert.pem`, `sslKey: certs/key.pem`, `host: 0.0.0.0`). Sin esos certs, no levanta. Usa `environment.development.ts`.
- `npm run build` — build prod (default). `npm run watch` — build development con watch.
- `npm test` — Vitest (`@angular/build:unit-test`). Hoy solo hay `app.spec.ts` scaffold.

## 4. Arquitectura (`src/app/`)

- `core/` — transversal: `guards/` (`auth`, `guest`, `permiso`), `interceptors/` (`auth.interceptor`), `services/` (estado + HTTP, `providedIn:'root'`), `models/` (interfaces + tipos), `directives/` (`tiene-permiso`).
- `features/` — una carpeta por pantalla (`login`, `inicio`, `reportar`); subcomponentes anidados (ej. `reportar/foto-selector/`).
- `layout/` — `main-layout` (shell del panel: sidebar + drawer + breadcrumb).
- `shared/` — reutilizable entre features (`placeholder-page`).
- Rutas lazy con `loadComponent` en `app.routes.ts`. Theming y providers (router, http+interceptor, PrimeNG, `MessageService`) en `app.config.ts`.

## 5. Convenciones de código (inferidas del código real)

- **Archivos sin sufijo `.component`** (Angular 21): `inicio.ts` / `inicio.html` / `inicio.scss`. Archivos en `kebab-case`, clases en `PascalCase` (`class Inicio`, `class MainLayout`).
- **Standalone siempre**, `imports:[...]` explícito, `changeDetection: ChangeDetectionStrategy.OnPush`, `inject()` (no constructor injection), control flow nativo (`@if`/`@for`/`@switch`).
- **Estado con signals**: `signal()` para estado local, `computed()` para derivado, `input()`/`output()` basados en signals. No `@Input()` clásico.
- **Formularios**: Reactive Forms con `fb.nonNullable.group({...})` + `Validators` nativos (ver `login.ts:62`). Método `isFieldInvalid(form, control)` para feedback; `markAllAsTouched()` al submit inválido.
- **Servicio HTTP** (patrón, ver `auth.service.ts` / `reporte-ciudadano.service.ts`): `inject(HttpClient)`, URLs base como consts desde `environment.apiUrl`, tipar respuestas con `ApiResponse<T>` (`core/models/api-response.model.ts`), `loading` como `signal(false)` seteado en `tap`/`next`+`error`.
- **Errores de API en la vista**: leer `error.error as ApiResponse<null>` y mostrar `MessageService` (`p-toast`); fallback si no hay `message` (ver `login.ts:191`).
- **Tipado estricto**: evitar `any` (hoy no hay ninguno en `src/`). Tipos/DTOs en `core/models/*`.

## 6. Auth y permisos

- **Sesión**: `AuthService` (`core/services/auth.service.ts`) guarda access/refresh token en `localStorage` (**no** `sessionStorage`: el panel se usa en varias pestañas —una alerta se abre en la suya desde el tablero— y `sessionStorage` no viaja a una pestaña nueva, con lo que la segunda caía en el login; a cambio, la sesión ya no muere al cerrar el navegador); expone `accessToken`, `isAuthenticated`, `usuarioActual` (JWT decodificado con `jwt-decode`), `tienePermiso()/tieneAlgunPermiso()/tieneTodosLosPermisos()`.
- **Interceptor** (`core/interceptors/auth.interceptor.ts`): agrega `Authorization: Bearer <token>` salvo a `/api/v1/auth/*` y al flujo ciudadano (`/reportes-ciudadanos`, `/encuestas`). En 401 dispara un `/auth/refresh` **compartido** entre requests concurrentes; si falla, limpia sesión, avisa "Sesión expirada" y va a `/login`.
- **Permisos**: viajan en el JWT (`JwtPayload.permisos`, `core/models/jwt-payload.model.ts`). Componer el string con `permiso(recurso, accion)` (`core/models/permiso.model.ts`, formato `recurso.accion`, ej. `usuario.ver`). Debe coincidir **exacto** con `shared/permissions.ts` del back.
- **Rutas**: `authGuard` (autenticado), `guestGuard` (solo no logueado, ej. `/login`), `permisoGuard(permisos, modo)` (`'todos'`|`'alguno'`). En template, `*appTienePermiso="'usuario.ver'"` oculta contenido. Todo esto es **solo UX**: la barrera real es `requirePermiso` en el back.
- El **flujo ciudadano** (`reporte-ciudadano.service.ts`) usa su propio token de sesión de un solo uso, adjuntado a mano en `enviarReporte`; queda fuera del interceptor/refresh del panel.

## 7. Gotchas

- **TS strict + `noPropertyAccessFromIndexSignature`** (`tsconfig.json`): acceder a index-signatures con corchetes, no con punto — ej. `route.snapshot.data['title']`, no `.title` (ver `main-layout.ts:90`). Vale para `data`, `params`, objetos con `[key:string]`.
- **HTTPS obligatorio en dev** (ver §3): sin `certs/` no arranca `ng serve`.
- **Environments divergentes**: `environment.ts` (prod, front en `https://aguardpy.netlify.app`) → `https://simplifika.lat/api-aguardpy` (el proxy recorta ese prefijo antes de llegar al back); `environment.development.ts` (dev, la que usa `ng serve`) → `https://192.168.0.41:3000`. Revisar antes de buildear/probar.
- **Sin proxy**: no hay `proxy.conf.json`; el front pega directo a `environment.apiUrl` (CORS lo maneja el back).
- **`effect()` + `form.reset()` se pelean con el usuario.** Patrón de los diálogos: rellenar el formulario al abrir. Envolver el cuerpo en `untracked()` y guardarlo con una transición cerrado→abierto (ver `features/webhooks/regla-form/regla-form.ts`). Si el effect llega a leer un signal que cambia cuando la persona edita —los valores del propio form, o uno que el effect mismo escribe— queda sucio y el siguiente ciclo de render resetea el form encima de lo recién elegido. El síntoma no apunta a la causa: parece un `p-select` que "no toma" la opción.
- **`[ngModel]` atado a un método que devuelve un objeto = pestaña congelada.** `[ngModel]="fechaDeTarea(t)"`, con un método que hace `new Date(...)`, devuelve una referencia distinta en cada ciclo de render: Angular la ve como un valor nuevo, vuelve a renderizar, y el bucle traba el navegador (y con `(ngModelChange)` encima, dispara un PATCH por vuelta). Derivar la vista con un `computed()` que construya el objeto una sola vez (ver `features/alertas/alerta-detalle/seguimiento-tareas`), y para reaccionar a la interacción usar los eventos propios del componente (`(onSelect)`, `(onClear)`, `(onChange)`), nunca `(ngModelChange)`, que también se dispara cuando el valor lo escribe el binding.
- **Los `input.required` no existen en el constructor.** Un componente que carga datos al nacer (el contenido de un `p-tabpanel` con `[lazy]`, por ejemplo) tiene que hacerlo en `ngOnInit`; leerlo en el constructor tira `NG0950` y la pestaña queda en blanco.
- **`p-select` y `p-datepicker` dentro de un `p-dialog` necesitan `appendTo="body"`**: con el valor por defecto el overlay queda recortado dentro del diálogo.
- **Valores de un control como signal**: `toSignal(control.valueChanges, { initialValue: control.value })`. Nunca espejarlos con `.set()` desde una suscripción: ese espejo imperativo es lo que dispara el problema anterior.
- **Tema claro/oscuro: los tonos numerados de la paleta NO se invierten.** `TemaService` (`core/services/tema.service.ts`) pone la clase `app-dark` en `<html>`; eso es a la vez el `darkModeSelector` de PrimeNG y el disparador del `color-scheme` que declara `styles.scss`, del que dependen las utilidades de color de PrimeFlex 4 (están escritas con `light-dark()`). Los tokens **semánticos** (`--p-content-background`, `--p-text-color`, `--p-highlight-background`, `--p-primary-color`) cambian con el esquema; los **numerados** (`--p-surface-100`, `--p-primary-50`, `--p-amber-700`) no: `--p-surface-100` es claro también en el tema oscuro. El síntoma es una mancha blanca en medio del panel. Si no hay token semántico que sirva, escribir el par a mano con `light-dark(claro, oscuro)` (ver `seccion-header.scss`, `foto-selector.scss`).
- **Colores fuera del DOM del tema**: Chart.js resuelve sus colores en TypeScript, así que no se entera del cambio de tema. Leerlos con `temaService.token('--p-…')`, que además ata el `computed()` al tema para que el gráfico se repinte (ver `inicio.ts`, `analisis.ts`). Leaflet trae su propio CSS con colores fijos: sus ajustes de tema oscuro son globales y viven en `styles.scss`.
- **Imports relativos sin alias**: no hay `paths` en `tsconfig`; usar rutas relativas (`../../core/...`).

## 8. Qué NO hacer

- No Tailwind, ni CSS de layout propio, ni HTML estilizado a mano cuando hay componente/clase PrimeNG.
- No escribir clases internas de PrimeNG (`p-button`, `p-button-text`, `p-tag`…) en un elemento HTML para imitar un componente: usar el componente o su directiva (ver §1.5).
- No hex/rgb/nombres de color; no sobrescribir clases internas de PrimeNG (`.p-button`, `.p-table`…). Ajustar vía props, `pt` o el `definePreset`.
- No `NgModules` (todo standalone). No `*ngIf`/`*ngFor` (usar `@if`/`@for`).
- No confiar en guards/`permisoGuard`/`*appTienePermiso` como seguridad: son UX; la barrera real es el back.
- No romper los paths `/api/v1/*` (hardcodeados en `core/services/`): romperlos rompe el contrato con el back sin aviso.
