import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { ConfirmationService, MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { MessageModule } from 'primeng/message';
import { SkeletonModule } from 'primeng/skeleton';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { TooltipModule } from 'primeng/tooltip';
import { AuthService } from '../../../core/services/auth.service';
import { RolesService } from '../../../core/services/roles.service';
import { ApiResponse } from '../../../core/models/api-response.model';
import { PermisoItem, ROL_ADMIN, RolItem } from '../../../core/models/rol.model';
import { permiso, RECURSO } from '../../../core/models/permiso.model';
import { RolForm } from './rol-form/rol-form';
import { escaparHtml } from '../../../shared/escapar-html';

/**
 * ABM de roles. El catálogo de roles es chico, así que se lista completo (el
 * backend tampoco pagina este endpoint).
 */
@Component({
  selector: 'app-configuracion-roles',
  imports: [
    ButtonModule,
    ConfirmDialogModule,
    MessageModule,
    SkeletonModule,
    TableModule,
    TagModule,
    TooltipModule,
    RolForm
  ],
  providers: [ConfirmationService],
  templateUrl: './roles.html',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class Roles {
  private readonly service = inject(RolesService);
  private readonly authService = inject(AuthService);
  private readonly messageService = inject(MessageService);
  private readonly confirmationService = inject(ConfirmationService);

  readonly roles = signal<RolItem[]>([]);
  readonly permisos = signal<PermisoItem[]>([]);
  readonly loading = signal(false);
  readonly error = signal(false);
  readonly trabajando = signal(false);

  readonly puedeCrear = this.authService.tienePermiso(permiso(RECURSO.ROL, 'crear'));
  readonly puedeEditar = this.authService.tienePermiso(permiso(RECURSO.ROL, 'editar'));
  readonly puedeEliminar = this.authService.tienePermiso(permiso(RECURSO.ROL, 'eliminar'));
  /** Sin `permiso.ver` el catálogo no carga y la matriz saldría vacía. */
  readonly puedeVerPermisos = this.authService.tienePermiso(permiso(RECURSO.PERMISO, 'ver'));

  readonly formVisible = signal(false);
  readonly rolEnEdicion = signal<RolItem | null>(null);

  readonly filasSkeleton = Array.from({ length: 3 });

  constructor() {
    this.cargar();
    if (this.puedeVerPermisos) {
      this.cargarPermisos();
    }
  }

  esRolAdmin(rol: RolItem): boolean {
    return rol.nombre === ROL_ADMIN;
  }

  /** El backend rechaza borrar ADMIN y roles con usuarios asignados. */
  motivoNoEliminable(rol: RolItem): string | null {
    if (this.esRolAdmin(rol)) {
      return 'El rol de administrador no se puede eliminar';
    }
    if (rol.cantidadUsuarios > 0) {
      return 'Tiene usuarios asignados';
    }
    return null;
  }

  reintentar(): void {
    this.cargar();
  }

  nuevo(): void {
    this.rolEnEdicion.set(null);
    this.formVisible.set(true);
  }

  editar(rol: RolItem): void {
    this.rolEnEdicion.set(rol);
    this.formVisible.set(true);
  }

  onGuardado(): void {
    this.cargar();
  }

  eliminar(rol: RolItem): void {
    if (this.motivoNoEliminable(rol)) {
      return;
    }

    this.confirmationService.confirm({
      header: 'Eliminar rol',
      message: `¿Eliminar el rol ${escaparHtml(rol.nombre)}? No se puede deshacer.`,
      icon: 'pi pi-exclamation-triangle',
      rejectButtonProps: { label: 'Cancelar', severity: 'secondary', text: true, rounded: true },
      acceptButtonProps: { label: 'Eliminar', severity: 'danger', rounded: true },
      accept: () => this.confirmarEliminacion(rol)
    });
  }

  private confirmarEliminacion(rol: RolItem): void {
    this.trabajando.set(true);
    this.service.eliminar(rol.id).subscribe({
      next: () => {
        this.trabajando.set(false);
        this.messageService.add({
          severity: 'success',
          summary: 'Rol eliminado',
          detail: `Se eliminó el rol ${rol.nombre}.`
        });
        this.cargar();
      },
      error: (err: unknown) => {
        this.trabajando.set(false);
        const mensaje = (err as { error?: ApiResponse<null> })?.error?.message ?? 'No se pudo eliminar el rol.';
        this.messageService.add({ severity: 'error', summary: 'Error', detail: mensaje });
      }
    });
  }

  private cargar(): void {
    this.loading.set(true);
    this.error.set(false);
    this.service.listarRoles().subscribe({
      next: (res) => {
        this.roles.set(res.data ?? []);
        this.loading.set(false);
      },
      error: (err) => {
        this.loading.set(false);
        this.error.set(true);
        this.roles.set([]);
        const mensaje = (err.error as ApiResponse<null>)?.message ?? 'No se pudieron cargar los roles.';
        this.messageService.add({ severity: 'error', summary: 'Error', detail: mensaje });
      }
    });
  }

  /** Alimenta la matriz del formulario; su error no rompe la grilla. */
  private cargarPermisos(): void {
    this.service.listarPermisos().subscribe({
      next: (res) => this.permisos.set(res.data ?? []),
      error: () => this.permisos.set([])
    });
  }
}
