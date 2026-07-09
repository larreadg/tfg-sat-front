# Skill: PrimeNG 21

## Propósito
Referencia completa de componentes, APIs, y uso correcto de PrimeNG 21 para Angular
con standalone components.

## Fuente
El archivo `llms-full.txt` en esta misma carpeta contiene la documentación oficial
completa de PrimeNG exportada en formato LLM-friendly desde https://primeng.org/llms/llms-full.txt

**Antes de implementar cualquier componente PrimeNG, consultar `llms-full.txt`**
para verificar el nombre exacto del módulo, sus inputs, outputs y uso correcto.

## Reglas de uso

- Siempre importar el módulo correcto en el componente standalone
- Nunca asumir nombres de módulos de memoria; verificar en llms-full.txt
- Usar la API documentada; no inventar propiedades ni eventos
- Para componentes con overlay (Dialog, Toast, etc.) verificar si requieren
  servicio inyectado o standalone provider

## Estructura de imports (standalone)

```typescript
// Verificar en llms-full.txt el módulo exacto para cada componente
import { ButtonModule } from 'primeng/button';
import { TableModule } from 'primeng/table';
// etc.
```
