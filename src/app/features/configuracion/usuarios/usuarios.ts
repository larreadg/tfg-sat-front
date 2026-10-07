import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ConfirmationService, MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { IconFieldModule } from 'primeng/iconfield';
import { InputIconModule } from 'primeng/inputicon';
import { InputTextModule } from 'primeng/inputtext';
import { MessageModule } from 'primeng/message';
import { PaginatorModule, PaginatorState } from 'primeng/paginator';
import { SelectModule } from 'primeng/select';
import { SkeletonModule } from 'primeng/skeleton';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { TooltipModule } from 'primeng/tooltip';
import { FiltrosPanel } from '../../../shared/filtros-panel/filtros-panel';
import {
  etiquetaOpcion,
  resumenFiltros
} from '../../../shared/filtros-panel/filtros-resumen';
import { AuthService } from '../../../core/services/auth.service';
import { RolesService } from '../../../core/services/roles.service';
import { UsuariosAdminService } from '../../../core/services/usuarios-admin.service';
import { ApiResponse } from '../../../core/models/api-response.model';
import { RolItem } from '../../../core/models/rol.model';
import { ListarUsuariosQuery, UsuarioAdminItem } from '../../../core/models/usuario-admin.model';
import { permiso, RECURSO } from '../../../core/models/permiso.model';
import { UsuarioForm } from './usuario-form/usuario-form';

interface OpcionEstado {
  label: string;
  value: boolean | null;
}

const TAMANO_PAGINA = 20;

/**
 * ABM de usuarios del panel. La grilla es server-side: filtros y paginación
 * viajan en la query (`GET /usuarios`), no se filtra en memoria.
 */
@Component({
  selector: 'app-configuracion-usuarios',
  imports: [
    FormsModule,
    ButtonModule,
    ConfirmDialogModule,
    IconFieldModule,
    InputIconModule,
    InputTextModule,
    MessageModule,
    PaginatorModule,
    SelectModule,
    SkeletonModule,
    TableModule,
    TagModule,
    TooltipModule,
    UsuarioForm,
    FiltrosPanel
  ],
  providers: [ConfirmationService],
  templateUrl: './usuarios.html',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class Usuarios {
  private readonly service = inject(UsuariosAdminService);
  private readonly rolesService = inject(RolesService);
  private readonly authService = inject(AuthService);
  private readonly messageService = inject(MessageService);
  private readonly confirmationService = inject(ConfirmationService);

  readonly usuarios = signal<UsuarioAdminItem[]>([]);
  readonly roles = signal<RolItem[]>([]);
  readonly loading = signal(false);
  readonly error = signal(false);
  readonly trabajando = signal(false);
  readonly total = signal(0);
  readonly first = signal(0);
  readonly pageSize = signal(TAMANO_PAGINA);

  readonly puedeCrear = this.authService.tienePermiso(permiso(RECURSO.USUARIO, 'crear'));
  readonly puedeEditar = this.authService.tienePermiso(permiso(RECURSO.USUARIO, 'editar'));
  readonly puedeEliminar = this.authService.tienePermiso(permiso(RECURSO.USUARIO, 'eliminar'));
  /** Para poblar el multiselect de roles del formulario. */
  readonly puedeVerRoles = this.authService.tienePermiso(permiso(RECURSO.ROL, 'ver'));

  /** Id del usuario logueado: no puede eliminarse ni desactivarse a sí mismo. */
  readonly usuarioPropioId = computed(() => this.authService.usuarioActual()?.usuarioId ?? null);

  readonly formVisible = signal(false);
  readonly usuarioEnEdicion = signal<UsuarioAdminItem | null>(null);

  readonly filasSkeleton = Array.from({ length: 6 });

  // Filtros: se aplican con el botón / Enter, no en cada tecla.
  busqueda = '';
  estado: boolean | null = null;

  readonly estadoOpciones: OpcionEstado[] = [
    { label: 'Todos', value: null },
    { label: 'Activos', value: true },
    { label: 'Inactivos', value: false }
  ];

  /** Filtros ya aplicados, para la cabecera del panel colapsado. */
  readonly filtrosAplicados = signal<string[]>([]);

  constructor() {
    this.cargar();
    if (this.puedeVerRoles) {
      this.cargarRoles();
    }
  }

  esUsuarioPropio(usuario: UsuarioAdminItem): boolean {
    return usuario.id === this.usuarioPropioId();
  }

  aplicar(): void {
    this.first.set(0);
    this.cargar();
  }

  limpiar(): void {
    this.busqueda = '';
    this.estado = null;
    this.first.set(0);
    this.cargar();
  }

  onPage(evento: PaginatorState): void {
    this.first.set(evento.first ?? 0);
    this.pageSize.set(evento.rows ?? TAMANO_PAGINA);
    this.cargar();
  }

  reintentar(): void {
    this.cargar();
  }

  nuevo(): void {
    this.usuarioEnEdicion.set(null);
    this.formVisible.set(true);
  }

  editar(usuario: UsuarioAdminItem): void {
    this.usuarioEnEdicion.set(usuario);
    this.formVisible.set(true);
  }

  /** Tras guardar en el diálogo, recarga la página actual. */
  onGuardado(): void {
    this.cargar();
  }

  eliminar(usuario: UsuarioAdminItem): void {
    if (this.esUsuarioPropio(usuario)) {
      return;
    }

    const nombre = `${usuario.persona.nombres} ${usuario.persona.apellidos}`;
    this.confirmationService.confirm({
      header: 'Eliminar usuario',
      message: `¿Eliminar a ${nombre} (${usuario.correoElectronico})? No se puede deshacer.`,
      icon: 'pi pi-exclamation-triangle',
      rejectButtonProps: { label: 'Cancelar', severity: 'secondary', text: true, rounded: true },
      acceptButtonProps: { label: 'Eliminar', severity: 'danger', rounded: true },
      accept: () => this.confirmarEliminacion(usuario, nombre)
    });
  }

  private confirmarEliminacion(usuario: UsuarioAdminItem, nombre: string): void {
    this.trabajando.set(true);
    this.service.eliminar(usuario.id).subscribe({
      next: () => {
        this.trabajando.set(false);
        this.messageService.add({
          severity: 'success',
          summary: 'Usuario eliminado',
          detail: `Se eliminó a ${nombre}.`
        });
        // Si era el último de la página, retrocede una para no quedar en el vacío.
        if (this.usuarios().length === 1 && this.first() > 0) {
          this.first.set(Math.max(this.first() - this.pageSize(), 0));
        }
        this.cargar();
      },
      error: (err: unknown) => {
        this.trabajando.set(false);
        const mensaje =
          (err as { error?: ApiResponse<null> })?.error?.message ?? 'No se pudo eliminar el usuario.';
        this.messageService.add({ severity: 'error', summary: 'Error', detail: mensaje });
      }
    });
  }

  private cargar(): void {
    const busqueda = this.busqueda.trim();
    this.filtrosAplicados.set(
      resumenFiltros(
        busqueda ? `"${busqueda}"` : null,
        etiquetaOpcion(this.estado, this.estadoOpciones)
      )
    );

    const query: ListarUsuariosQuery = {
      page: Math.floor(this.first() / this.pageSize()) + 1,
      limit: this.pageSize(),
      sort: '-fechaCreacion',
      q: this.busqueda.trim() || undefined,
      activo: this.estado ?? undefined
    };

    this.loading.set(true);
    this.error.set(false);
    this.service.listar(query).subscribe({
      next: (res) => {
        this.usuarios.set(res.data ?? []);
        this.total.set(res.meta?.total ?? 0);
        this.loading.set(false);
      },
      error: (err) => {
        this.loading.set(false);
        this.error.set(true);
        this.usuarios.set([]);
        this.total.set(0);
        const mensaje = (err.error as ApiResponse<null>)?.message ?? 'No se pudieron cargar los usuarios.';
        this.messageService.add({ severity: 'error', summary: 'Error', detail: mensaje });
      }
    });
  }

  /** Los roles alimentan el multiselect del formulario; su error no rompe la grilla. */
  private cargarRoles(): void {
    this.rolesService.listarRoles().subscribe({
      next: (res) => this.roles.set(res.data ?? []),
      error: () => this.roles.set([])
    });
  }
}
