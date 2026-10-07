import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { TabsModule } from 'primeng/tabs';
import { AuthService } from '../../core/services/auth.service';
import { permiso, RECURSO } from '../../core/models/permiso.model';
import { MotorCriticidad } from './motor-criticidad/motor-criticidad';
import { HistorialVersiones } from './historial-versiones/historial-versiones';
import { Usuarios } from './usuarios/usuarios';
import { Roles } from './roles/roles';
import { ConfiguracionSistema } from './sistema/sistema';

/** Clave de cada tab. Viaja en la URL (`?tab=usuarios`), así que es parte del contrato. */
export type ClaveTab = 'motor' | 'historial' | 'usuarios' | 'roles' | 'sistema';

interface TabConfig {
  clave: ClaveTab;
  label: string;
  icono: string;
  /** Permiso `.ver` que habilita el tab. La barrera real está en el backend. */
  permiso: string;
}

/**
 * Módulo de Configuración: agrupa en tabs todo lo configurable del sistema.
 *
 * Los tabs se filtran por permiso, así que un usuario que solo tiene `usuario.ver`
 * entra y ve únicamente el tab de Usuarios. Por eso el guard de la ruta usa modo
 * `'alguno'`: exigir los tres permisos dejaría afuera a ese usuario.
 */
@Component({
  selector: 'app-configuracion',
  imports: [TabsModule, MotorCriticidad, HistorialVersiones, Usuarios, Roles, ConfiguracionSistema],
  templateUrl: './configuracion.html',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class Configuracion {
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  private readonly tabs: TabConfig[] = [
    {
      clave: 'motor',
      label: 'Motor de criticidad',
      icono: 'pi pi-sliders-h',
      permiso: permiso(RECURSO.CONFIGURACION_CRITICIDAD, 'ver')
    },
    {
      clave: 'historial',
      label: 'Historial de versiones',
      icono: 'pi pi-history',
      permiso: permiso(RECURSO.CONFIGURACION_CRITICIDAD, 'ver')
    },
    {
      clave: 'usuarios',
      label: 'Usuarios',
      icono: 'pi pi-users',
      permiso: permiso(RECURSO.USUARIO, 'ver')
    },
    {
      clave: 'roles',
      label: 'Roles y permisos',
      icono: 'pi pi-shield',
      permiso: permiso(RECURSO.ROL, 'ver')
    },
    {
      clave: 'sistema',
      label: 'Sistema',
      icono: 'pi pi-server',
      // Permiso propio, no el del motor: este tab muestra el estado operativo y
      // deja editar la credencial del servidor de correo.
      permiso: permiso(RECURSO.CONFIGURACION_SISTEMA, 'ver')
    }
  ];

  readonly tabsVisibles = computed(() => this.tabs.filter((tab) => this.authService.tienePermiso(tab.permiso)));

  /** `?tab=` de la URL. Permite deep-link y que el historial salte al tab del motor. */
  private readonly tabEnUrl = toSignal(this.route.queryParamMap, { initialValue: null });

  readonly tabActivo = signal<ClaveTab>('motor');

  constructor() {
    // La URL manda: si trae un `?tab=` válido y visible, gana. Si no (o si apunta
    // a un tab sin permiso), cae al primero disponible.
    effect(() => {
      const solicitado = this.tabEnUrl()?.get('tab') as ClaveTab | null;
      const visibles = this.tabsVisibles();
      const valido = visibles.some((tab) => tab.clave === solicitado);
      const destino = valido && solicitado ? solicitado : visibles[0]?.clave;

      if (!destino) {
        return;
      }

      if (destino !== this.tabActivo()) {
        this.tabActivo.set(destino);
      }

      // El `[value]` es de una vía, así que fijarlo acá no dispara `valueChange`:
      // sin esto la URL quedaría pidiendo un tab que no se está mostrando.
      if (solicitado !== destino) {
        this.sincronizarUrl(destino);
      }
    });
  }

  cambiarTab(clave: string | number | undefined): void {
    const destino = this.tabsVisibles().find((tab) => tab.clave === clave)?.clave;
    if (!destino) {
      return;
    }

    this.tabActivo.set(destino);
    this.sincronizarUrl(destino);
  }

  /** Refleja el tab en la URL sin ensuciar el historial del navegador. */
  private sincronizarUrl(destino: ClaveTab): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { tab: destino },
      replaceUrl: true
    });
  }
}
