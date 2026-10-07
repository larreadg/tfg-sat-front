import { ChangeDetectionStrategy, Component, computed, effect, inject, input, model, output, signal } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { MessageModule } from 'primeng/message';
import { MultiSelectModule } from 'primeng/multiselect';
import { PasswordModule } from 'primeng/password';
import { ToggleSwitchModule } from 'primeng/toggleswitch';
import { UsuariosAdminService } from '../../../../core/services/usuarios-admin.service';
import { ApiResponse } from '../../../../core/models/api-response.model';
import { RolItem } from '../../../../core/models/rol.model';
import {
  ActualizarUsuarioInput,
  CrearUsuarioInput,
  UsuarioAdminItem
} from '../../../../core/models/usuario-admin.model';

/** Mínimo que exige `createUserSchema` en el backend. */
const LARGO_MINIMO_CONTRASENA = 8;

/**
 * Alta y edición de usuarios del panel.
 *
 * Los datos de `Persona` (nombres, apellidos, documento) solo se cargan en el
 * alta: el `PUT` del backend no los toca, así que en edición se muestran como
 * lectura para no prometer algo que no se va a guardar.
 */
@Component({
  selector: 'app-usuario-form',
  imports: [
    ReactiveFormsModule,
    ButtonModule,
    DialogModule,
    InputTextModule,
    MessageModule,
    MultiSelectModule,
    PasswordModule,
    ToggleSwitchModule
  ],
  templateUrl: './usuario-form.html',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class UsuarioForm {
  private readonly fb = inject(FormBuilder);
  private readonly service = inject(UsuariosAdminService);
  private readonly messageService = inject(MessageService);

  readonly visible = model.required<boolean>();
  /** `null` = alta. */
  readonly usuario = input<UsuarioAdminItem | null>(null);
  readonly roles = input<RolItem[]>([]);

  readonly guardado = output<void>();

  readonly guardando = signal(false);
  /**
   * Error del backend (409 de correo duplicado, 400 de validación...). Se muestra
   * DENTRO del diálogo: el `p-toast` global vive en `app.html` y la máscara del
   * dialog (z-index 1101) lo tapa, así que un toast acá se leería a medias.
   */
  readonly errorServidor = signal<string | null>(null);
  readonly esEdicion = computed(() => this.usuario() !== null);
  readonly titulo = computed(() => (this.esEdicion() ? 'Editar usuario' : 'Nuevo usuario'));

  readonly form: FormGroup = this.fb.nonNullable.group({
    nombres: ['', [Validators.required]],
    apellidos: ['', [Validators.required]],
    documento: ['', [Validators.required]],
    correoElectronico: ['', [Validators.required, Validators.email]],
    telefono: ['', [Validators.required]],
    contrasena: ['', [Validators.required, Validators.minLength(LARGO_MINIMO_CONTRASENA)]],
    activo: [true],
    rolIds: [[] as number[]]
  });

  readonly largoMinimoContrasena = LARGO_MINIMO_CONTRASENA;

  constructor() {
    // Reconfigura el formulario cada vez que se abre: el mismo componente sirve
    // para alta y edición, y los validadores de la contraseña cambian entre una y otra.
    effect(() => {
      if (!this.visible()) {
        return;
      }
      this.errorServidor.set(null);
      this.reiniciar(this.usuario());
    });
  }

  isFieldInvalid(controlName: string): boolean {
    const control = this.form.get(controlName);
    return !!control && control.invalid && (control.dirty || control.touched);
  }

  cancelar(): void {
    this.visible.set(false);
  }

  guardar(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const usuario = this.usuario();
    this.guardando.set(true);
    this.errorServidor.set(null);

    const peticion = usuario
      ? this.service.actualizar(usuario.id, this.armarEdicion())
      : this.service.crear(this.armarAlta());

    peticion.subscribe({
      next: () => {
        this.guardando.set(false);
        this.visible.set(false);
        this.messageService.add({
          severity: 'success',
          summary: usuario ? 'Usuario actualizado' : 'Usuario creado',
          detail: usuario
            ? `Se guardaron los cambios de ${usuario.persona.nombres} ${usuario.persona.apellidos}.`
            : 'El usuario ya puede ingresar al panel.'
        });
        this.guardado.emit();
      },
      error: (err: unknown) => {
        this.guardando.set(false);
        this.errorServidor.set(
          (err as { error?: ApiResponse<null> })?.error?.message ?? 'No se pudo guardar el usuario.'
        );
      }
    });
  }

  private armarAlta(): CrearUsuarioInput {
    const valor = this.form.getRawValue();
    return {
      correoElectronico: valor.correoElectronico.trim(),
      telefono: valor.telefono.trim(),
      contrasena: valor.contrasena,
      activo: valor.activo,
      persona: {
        nombres: valor.nombres.trim(),
        apellidos: valor.apellidos.trim(),
        documento: valor.documento.trim()
      },
      rolIds: valor.rolIds
    };
  }

  /** La contraseña solo viaja si se escribió una nueva: vacía significa "no cambiar". */
  private armarEdicion(): ActualizarUsuarioInput {
    const valor = this.form.getRawValue();
    const cambios: ActualizarUsuarioInput = {
      correoElectronico: valor.correoElectronico.trim(),
      telefono: valor.telefono.trim(),
      activo: valor.activo,
      rolIds: valor.rolIds
    };

    if (valor.contrasena) {
      cambios.contrasena = valor.contrasena;
    }

    return cambios;
  }

  private reiniciar(usuario: UsuarioAdminItem | null): void {
    const contrasena = this.form.controls['contrasena'];

    if (usuario) {
      this.form.reset({
        nombres: usuario.persona.nombres,
        apellidos: usuario.persona.apellidos,
        documento: usuario.persona.documento,
        correoElectronico: usuario.correoElectronico,
        telefono: usuario.telefono,
        contrasena: '',
        activo: usuario.activo,
        rolIds: usuario.roles.map((rol) => rol.id)
      });
      // En edición la contraseña es opcional, pero si se escribe algo tiene que
      // cumplir el mismo mínimo que exige el backend.
      contrasena.setValidators([Validators.minLength(LARGO_MINIMO_CONTRASENA)]);
    } else {
      this.form.reset({
        nombres: '',
        apellidos: '',
        documento: '',
        correoElectronico: '',
        telefono: '',
        contrasena: '',
        activo: true,
        rolIds: []
      });
      contrasena.setValidators([Validators.required, Validators.minLength(LARGO_MINIMO_CONTRASENA)]);
    }

    contrasena.updateValueAndValidity();
  }
}
