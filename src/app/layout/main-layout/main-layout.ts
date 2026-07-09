import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { Router, RouterOutlet } from '@angular/router';
import { MenuItem } from 'primeng/api';
import { AvatarModule } from 'primeng/avatar';
import { ButtonModule } from 'primeng/button';
import { DrawerModule } from 'primeng/drawer';
import { MenuModule } from 'primeng/menu';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-main-layout',
  imports: [RouterOutlet, ButtonModule, AvatarModule, MenuModule, DrawerModule],
  templateUrl: './main-layout.html',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class MainLayout {
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);

  readonly sidebarVisible = signal(false);

  readonly navItems: MenuItem[] = [
    { label: 'Inicio', icon: 'pi pi-home', routerLink: '/inicio' },
    { label: 'Reportes', icon: 'pi pi-file', routerLink: '/reportes' },
    { label: 'Encuestas', icon: 'pi pi-list-check', routerLink: '/encuestas' },
    { label: 'Análisis', icon: 'pi pi-chart-bar', routerLink: '/analisis' },
    { label: 'Configuración', icon: 'pi pi-cog', routerLink: '/configuracion' }
  ];

  readonly userMenuItems: MenuItem[] = [
    { label: 'Perfil', icon: 'pi pi-user' },
    { separator: true },
    { label: 'Cerrar sesión', icon: 'pi pi-sign-out', command: () => this.logout() }
  ];

  toggleSidebar(): void {
    this.sidebarVisible.set(!this.sidebarVisible());
  }

  closeSidebar(): void {
    this.sidebarVisible.set(false);
  }

  logout(): void {
    this.authService.logout();
    this.router.navigate(['/login']);
  }
}
