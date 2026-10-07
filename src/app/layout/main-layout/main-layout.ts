import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs';
import { MenuItem } from 'primeng/api';
import { AvatarModule } from 'primeng/avatar';
import { BreadcrumbModule } from 'primeng/breadcrumb';
import { ButtonModule } from 'primeng/button';
import { DrawerModule } from 'primeng/drawer';
import { MenuModule } from 'primeng/menu';
import { TagModule } from 'primeng/tag';
import { TooltipModule } from 'primeng/tooltip';
import { TienePermisoDirective } from '../../core/directives/tiene-permiso.directive';
import { ModoPermiso } from '../../core/guards/permiso.guard';
import { AuthService } from '../../core/services/auth.service';
import { TemaService } from '../../core/services/tema.service';
import { permiso, RECURSO } from '../../core/models/permiso.model';
import { environment } from '../../../environments/environment';
import { iniciales } from '../../shared/iniciales';
import { BreadcrumbService } from '../../core/services/breadcrumb.service';

interface NavItem extends MenuItem {
  permiso?: string | string[];
  /** Solo para ítems con varios permisos alternativos. Por defecto se exigen todos. */
  modoPermiso?: ModoPermiso;
}

/** Debe coincidir con el breakpoint "md" de PrimeFlex (768px). */
const DESKTOP_MEDIA_QUERY = '(min-width: 768px)';

@Component({
  selector: 'app-main-layout',
  imports: [
    NgTemplateOutlet,
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    ButtonModule,
    AvatarModule,
    MenuModule,
    DrawerModule,
    BreadcrumbModule,
    TagModule,
    TooltipModule,
    TienePermisoDirective
  ],
  templateUrl: './main-layout.html',
  styleUrl: './main-layout.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class MainLayout {
  readonly authService = inject(AuthService);
  readonly temaService = inject(TemaService);
  private readonly router = inject(Router);
  private readonly breadcrumbService = inject(BreadcrumbService);
  private readonly activatedRoute = inject(ActivatedRoute);

  readonly sidebarVisible = signal(false);
  readonly sidebarCollapsed = signal(false);
  readonly sidebarToggleLabel = computed(() =>
    this.sidebarVisible() || !this.sidebarCollapsed() ? 'Cerrar menú' : 'Abrir menú'
  );
  readonly appVersion = environment.appVersion;

  readonly iniciales = computed(() => {
    const usuario = this.authService.usuarioActual();
    return usuario ? iniciales(usuario.nombres, usuario.apellidos) : '';
  });

  private readonly navItemsBase: NavItem[] = [
    { label: 'Inicio', icon: 'pi pi-home', routerLink: '/inicio' },
    { label: 'Reportes', icon: 'pi pi-file', routerLink: '/reportes', permiso: permiso(RECURSO.REPORTE, 'ver') },
    { label: 'Alertas', icon: 'pi pi-bell', routerLink: '/alertas', permiso: permiso(RECURSO.ALERTA, 'ver') },
    { label: 'Mapa', icon: 'pi pi-map-marker', routerLink: '/mapa', permiso: permiso(RECURSO.REPORTE, 'ver') },
    { label: 'Análisis', icon: 'pi pi-chart-bar', routerLink: '/analisis', permiso: permiso(RECURSO.REPORTE, 'ver') },
    { label: 'Encuestas', icon: 'pi pi-list-check', routerLink: '/encuestas', permiso: permiso(RECURSO.ENCUESTA, 'ver') },
    {
      label: 'Zonas de riesgo',
      icon: 'pi pi-map',
      routerLink: '/zonas-riesgo',
      permiso: permiso(RECURSO.ZONA_RIESGO, 'ver')
    },
    {
      // La ruta sigue siendo /webhooks (el nombre tecnico del mecanismo); lo que ve
      // la persona es "Notificaciones", que es lo que la pantalla hace.
      label: 'Notificaciones',
      icon: 'pi pi-bell',
      routerLink: '/webhooks',
      permiso: permiso(RECURSO.WEBHOOK, 'ver')
    },
    {
      label: 'Auditoría',
      icon: 'pi pi-shield',
      routerLink: '/auditoria',
      permiso: permiso(RECURSO.AUDITORIA, 'ver')
    },
    {
      // El módulo agrupa tabs con permisos distintos: alcanza con uno para que el
      // ítem tenga sentido. Debe coincidir con el guard de la ruta en `app.routes.ts`.
      label: 'Configuración',
      icon: 'pi pi-cog',
      routerLink: '/configuracion',
      permiso: [
        permiso(RECURSO.CONFIGURACION_CRITICIDAD, 'ver'),
        permiso(RECURSO.CONFIGURACION_SISTEMA, 'ver'),
        permiso(RECURSO.USUARIO, 'ver'),
        permiso(RECURSO.ROL, 'ver')
      ],
      modoPermiso: 'alguno'
    }
  ];

  // Nueva referencia por cada toggle: el MenuItemContent interno de PrimeNG es OnPush
  // y no re-chequea el template #item si `item` no cambia de identidad.
  readonly navItems = computed<NavItem[]>(() => {
    this.sidebarCollapsed();
    return this.navItemsBase.map(item => ({ ...item }));
  });

  readonly breadcrumbHome: MenuItem = { icon: 'pi pi-home', routerLink: '/inicio' };

  private readonly navigationEnd = toSignal(
    this.router.events.pipe(filter((event): event is NavigationEnd => event instanceof NavigationEnd)),
    { initialValue: null }
  );

  /**
   * Inicio › sección › pantalla. El escalón del medio lo declara la ruta con
   * `data.breadcrumbPadre` (una pantalla de detalle sabe de qué listado cuelga);
   * el último es el título de la ruta, salvo que la pantalla publique algo más
   * preciso en `BreadcrumbService` (el código del reporte, por ejemplo).
   */
  readonly breadcrumbItems = computed<MenuItem[]>(() => {
    this.navigationEnd();
    let route = this.activatedRoute.firstChild;
    while (route?.firstChild) {
      route = route.firstChild;
    }

    const data = route?.snapshot.data;
    const padre = data?.['breadcrumbPadre'] as MenuItem | undefined;
    const hoja = this.breadcrumbService.detalle() ?? data?.['title'] ?? 'Inicio';

    return padre ? [padre, { label: hoja }] : [{ label: hoja }];
  });

  /** En desktop colapsa/expande el riel fijo; en mobile abre/cierra el drawer. */
  toggleSidebar(): void {
    if (window.matchMedia(DESKTOP_MEDIA_QUERY).matches) {
      this.sidebarCollapsed.set(!this.sidebarCollapsed());
    } else {
      this.sidebarVisible.set(!this.sidebarVisible());
    }
  }

  closeSidebar(): void {
    this.sidebarVisible.set(false);
  }

  logout(): void {
    this.authService.logout();
    this.router.navigate(['/login']);
  }
}
