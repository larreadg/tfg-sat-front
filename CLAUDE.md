# CLAUDE.md — Convenciones del proyecto

## Contexto del proyecto

- Aplicación de encuestas/reportes ciudadanos para tesis de grado.
- Propósito: la ciudadanía reporta agua potencialmente contaminada vía WhatsApp; los reportes
  ingresan al sistema donde se realiza un análisis cualitativo asistido por IA para clasificar
  si el agua puede estar contaminada o no.
- Usuarios de esta app web: analistas/administradores que gestionan reportes, encuestas y
  resultados del análisis (no el ciudadano final, que interactúa por WhatsApp).
- Implicancia de diseño: interfaz orientada a datos (tablas, filtros, detalle de reportes,
  estados de clasificación, dashboards), clara y sobria — es un proyecto académico serio, no comercial.

## Stack
- Angular 21 (standalone components únicamente)
- PrimeNG 21 + @primeng/themes@21
- PrimeIcons 7
- PrimeFlex 4
- Tema: **Aura Light Cyan** (configurado vía `providePrimeNG` en `app.config.ts`)

> **Nota sobre theming**: PrimeNG 21 ya no usa archivos CSS de tema. El tema Aura Cyan se configura
> programáticamente con `definePreset` en `src/app/app.config.ts`. No añadir CSS de tema en `angular.json`.

## Regla fundamental: Standalone Components

**Todos los componentes son standalone.** No usar NgModules bajo ninguna circunstancia.

Cada componente declara explícitamente sus imports. En Angular 21 no hace falta `standalone: true`
(es el valor por defecto), pero se puede incluir por claridad:

```typescript
@Component({
  selector: 'app-ejemplo',
  imports: [ButtonModule, InputTextModule],
  templateUrl: './ejemplo.component.html'
})
export class EjemploComponent {}
```

## Nombres de archivos (Angular 21)

Angular 21 genera sin el sufijo `.component`:
- `ejemplo.ts` (no `ejemplo.component.ts`)
- `ejemplo.html` (no `ejemplo.component.html`)
- `ejemplo.scss` (no `ejemplo.component.scss`)

## Layout con PrimeFlex (obligatorio)

El layout se construye **exclusivamente con clases PrimeFlex**. SCSS solo para casos excepcionales debidamente justificados.

### Grid
```html
<div class="grid">
  <div class="col-12">          <!-- full width -->
  <div class="col-6">           <!-- mitad -->
  <div class="col-12 md:col-6"> <!-- responsive -->
</div>
```

### Centrado
```html
<div class="flex align-items-center justify-content-center">...</div>
<div class="flex align-items-center justify-content-center min-h-screen">...</div>
```

### Espaciado
Usar utilidades PrimeFlex: `p-3`, `m-2`, `gap-3`, `py-4`, `px-2`, etc.

### Cuándo SÍ usar SCSS
Solo cuando PrimeFlex no pueda resolver el caso (ej: animaciones custom, pseudo-elementos,
media queries muy específicas). Documentar el motivo con un comentario.

## Componentes PrimeNG

Importar solo los módulos necesarios en cada componente. Ejemplos frecuentes:

```typescript
imports: [
  ButtonModule,
  InputTextModule,
  TableModule,
  DialogModule,
  ToastModule,
]
```

## Regla fundamental: usar siempre componentes PrimeNG

**SIEMPRE** usar los componentes nativos de PrimeNG: `p-button`, `p-table`, `p-card`, `p-dialog`,
`p-toast`, `p-tag`, `p-select`, `p-datepicker`, etc.

**PROHIBIDO** crear botones, inputs, cards, tablas o menús con HTML + estilos propios. Si existe
un componente PrimeNG para el caso de uso, se usa ese componente.

La personalización visual se hace **solo** mediante las propiedades y variantes del componente
(`severity`, `outlined`, `text`, `size`...) o los semantic tokens del tema vía `definePreset`.
**Nunca** sobrescribiendo clases CSS de PrimeNG ni hardcodeando colores en hex/rgb — todos los
colores salen de los tokens del tema Aura Light Cyan.

```html
<!-- ✅ Correcto -->
<p-button label="Guardar" icon="pi pi-check" severity="success" />

<!-- ❌ Incorrecto -->
<button class="mi-boton-verde">Guardar</button>
<!-- + SCSS custom -->
```

### Botones: siempre `rounded`

**Todo `p-button` del proyecto se define con `[rounded]="true"`**, sin excepción (botones normales,
`text`, `link`, `outlined`, de icono, etc.). Es la variante visual estándar de la app.

```html
<!-- ✅ Correcto -->
<p-button label="Ingresar" icon="pi pi-sign-in" [rounded]="true" [fluid]="true" />
<p-button icon="pi pi-refresh" [text]="true" [rounded]="true" severity="secondary" />

<!-- ❌ Incorrecto: falta rounded -->
<p-button label="Guardar" />
```

## Componentes PrimeNG — referencia de API

Antes de implementar cualquier componente PrimeNG, consultar:
`.claude/skills/primeng/llms-full.txt` — documentación oficial completa en formato LLM-friendly.

Nunca asumir nombres de módulos, inputs u outputs de memoria; verificar siempre en ese archivo.

Como respaldo, si el archivo local no cubre algún caso, usar la documentación oficial online:
`https://v21.primeng.org/` y `https://v21.primeng.org/llms/llms-full.txt`.

Nunca usar de memoria APIs de versiones anteriores de PrimeNG (los nombres cambiaron entre
versiones, ej. `p-dropdown` → `p-select`, `p-calendar` → `p-datepicker`); la referencia válida
es únicamente **v21**.

## Skills disponibles

- `.claude/skills/primeng/SKILL.md` — Referencia completa PrimeNG 21.
  Consultar siempre antes de implementar cualquier componente PrimeNG.

## Jerarquía de reglas sobre skills

Las reglas de este CLAUDE.md tienen **prioridad absoluta** sobre cualquier sugerencia de skills
(incluidos `frontend-design`, `impeccable`, `angular-developer` u otros que se agreguen). Si un
skill sugiere Tailwind, CSS custom, HTML estilizado a mano u otra biblioteca de componentes, esa
sugerencia **se ignora**.

De los skills se toma: criterio de diseño, buenas prácticas de Angular y calidad de código —
nunca su stack.

## Convenciones generales
- Archivos: `kebab-case`
- Clases/Componentes: `PascalCase`
- Variables/métodos: `camelCase`
- Signals preferidos sobre `@Input()` donde aplique (Angular 21)
- Evitar `any`; tipado estricto siempre
- Control flow nativo (`@if`, `@for`, `@switch`) en lugar de `*ngIf`/`*ngFor`
- `inject()` en lugar de constructor injection
- `ChangeDetectionStrategy.OnPush` en todos los componentes
- Signals para estado local; `input()`/`output()` basados en signals
