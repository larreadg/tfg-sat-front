import { ChangeDetectionStrategy, Component, computed, effect, inject, input, model, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { CheckboxModule } from 'primeng/checkbox';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { MessageModule } from 'primeng/message';
import { TableModule } from 'primeng/table';
import { TextareaModule } from 'primeng/textarea';
import { TooltipModule } from 'primeng/tooltip';
import { RolesService } from '../../../../core/services/roles.service';
import { ApiResponse } from '../../../../core/models/api-response.model';
import {
  ActualizarRolInput,
  CrearRolInput,
  PermisoItem,
  ROL_ADMIN,
  RolItem
} from '../../../../core/models/rol.model';
import { Accion, ACCIONES, construirMatriz, FilaPermisos } from '../permisos-matriz';

const LARGO_MAXIMO_NOMBRE = 50;
const LARGO_MAXIMO_DESCRIPCION = 255;

/**
 * Alta y edición de roles, con los permisos en una matriz recurso × acción.
 *
 * La matriz existe porque el catálogo tiene ~72 permisos: en un multiselect
 * plano es imposible ver de un vistazo qué puede hacer el rol.
 */
@Component({
  selector: 'app-rol-form',
  imports: [
    FormsModule,
    ReactiveFormsModule,
    ButtonModule,
    CheckboxModule,
    DialogModule,
    InputTextModule,
    MessageModule,
    TableModule,
    TextareaModule,
    TooltipModule
  ],
  templateUrl: './rol-form.html',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class RolForm {
  private readonly fb = inject(FormBuilder);
  private readonly service = inject(RolesService);
  private readonly messageService = inject(MessageService);

  readonly visible = model.required<boolean>();
  /** `null` = alta. */
  readonly rol = input<RolItem | null>(null);
  readonly permisos = input<PermisoItem[]>([]);

  readonly guardado = output<void>();

  readonly guardando = signal(false);
  /** Igual que en el ABM de usuarios: el toast global queda tapado por la máscara del diálogo. */
  readonly errorServidor = signal<string | null>(null);

  readonly esEdicion = computed(() => this.rol() !== null);
  readonly titulo = computed(() => (this.esEdicion() ? 'Editar rol' : 'Nuevo rol'));
  /** El backend rechaza renombrar ADMIN; el campo se bloquea para no ofrecerlo. */
  readonly esRolAdmin = computed(() => this.rol()?.nombre === ROL_ADMIN);

  readonly filas = computed<FilaPermisos[]>(() => construirMatriz(this.permisos()));
  readonly acciones = ACCIONES;

  readonly seleccionados = signal<ReadonlySet<number>>(new Set());
  readonly cantidadSeleccionada = computed(() => this.seleccionados().size);
  readonly totalPermisos = computed(() => this.permisos().length);

  readonly form: FormGroup = this.fb.nonNullable.group({
    nombre: ['', [Validators.required, Validators.maxLength(LARGO_MAXIMO_NOMBRE)]],
    descripcion: ['', [Validators.maxLength(LARGO_MAXIMO_DESCRIPCION)]]
  });

  readonly largoMaximoNombre = LARGO_MAXIMO_NOMBRE;

  constructor() {
    effect(() => {
      if (!this.visible()) {
        return;
      }
      this.errorServidor.set(null);
      this.reiniciar(this.rol());
    });
  }

  isFieldInvalid(controlName: string): boolean {
    const control = this.form.get(controlName);
    return !!control && control.invalid && (control.dirty || control.touched);
  }

  estaSeleccionado(permisoId: number | undefined): boolean {
    return permisoId !== undefined && this.seleccionados().has(permisoId);
  }

  alternarPermiso(permisoId: number, marcado: boolean): void {
    const copia = new Set(this.seleccionados());
    if (marcado) {
      copia.add(permisoId);
    } else {
      copia.delete(permisoId);
    }
    this.seleccionados.set(copia);
  }

  filaCompleta(fila: FilaPermisos): boolean {
    return fila.idsDisponibles.length > 0 && fila.idsDisponibles.every((id) => this.seleccionados().has(id));
  }

  filaParcial(fila: FilaPermisos): boolean {
    const marcados = fila.idsDisponibles.filter((id) => this.seleccionados().has(id)).length;
    return marcados > 0 && marcados < fila.idsDisponibles.length;
  }

  /** Marca o desmarca las cuatro acciones del recurso de una sola vez. */
  alternarFila(fila: FilaPermisos, marcado: boolean): void {
    const copia = new Set(this.seleccionados());
    for (const id of fila.idsDisponibles) {
      if (marcado) {
        copia.add(id);
      } else {
        copia.delete(id);
      }
    }
    this.seleccionados.set(copia);
  }

  seleccionarTodos(): void {
    this.seleccionados.set(new Set(this.permisos().map((permiso) => permiso.id)));
  }

  limpiarSeleccion(): void {
    this.seleccionados.set(new Set());
  }

  cancelar(): void {
    this.visible.set(false);
  }

  guardar(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const rol = this.rol();
    const valor = this.form.getRawValue();
    const permisoIds = [...this.seleccionados()];

    this.guardando.set(true);
    this.errorServidor.set(null);

    const peticion = rol
      ? this.service.actualizar(rol.id, this.armarEdicion(valor, permisoIds, rol))
      : this.service.crear({
          nombre: valor.nombre.trim(),
          descripcion: valor.descripcion.trim() || undefined,
          permisoIds
        } satisfies CrearRolInput);

    peticion.subscribe({
      next: () => {
        this.guardando.set(false);
        this.visible.set(false);
        this.messageService.add({
          severity: 'success',
          summary: rol ? 'Rol actualizado' : 'Rol creado',
          detail: `${valor.nombre.trim()} quedó con ${permisoIds.length} permiso(s).`
        });
        this.guardado.emit();
      },
      error: (err: unknown) => {
        this.guardando.set(false);
        this.errorServidor.set(
          (err as { error?: ApiResponse<null> })?.error?.message ?? 'No se pudo guardar el rol.'
        );
      }
    });
  }

  private armarEdicion(
    valor: { nombre: string; descripcion: string },
    permisoIds: number[],
    rol: RolItem
  ): ActualizarRolInput {
    const cambios: ActualizarRolInput = {
      descripcion: valor.descripcion.trim() || null,
      permisoIds
    };

    // ADMIN no se renombra (lo rechaza el backend): no se manda `nombre` para
    // no provocar un 403 al guardar solo un cambio de permisos.
    if (rol.nombre !== ROL_ADMIN) {
      cambios.nombre = valor.nombre.trim();
    }

    return cambios;
  }

  private reiniciar(rol: RolItem | null): void {
    this.form.reset({
      nombre: rol?.nombre ?? '',
      descripcion: rol?.descripcion ?? ''
    });
    this.seleccionados.set(new Set(rol?.permisos.map((permiso) => permiso.id) ?? []));
  }

  /** Ayuda al template: las celdas se leen por acción. */
  celda(fila: FilaPermisos, accion: Accion): PermisoItem | null {
    return fila.celdas[accion];
  }
}
