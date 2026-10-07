import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { forkJoin } from 'rxjs';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';
import { InputNumberModule } from 'primeng/inputnumber';
import { InputTextModule } from 'primeng/inputtext';
import { MessageModule } from 'primeng/message';
import { PasswordModule } from 'primeng/password';
import { SelectModule } from 'primeng/select';
import { SkeletonModule } from 'primeng/skeleton';
import { TagModule } from 'primeng/tag';
import { ToggleSwitchModule } from 'primeng/toggleswitch';
import { TooltipModule } from 'primeng/tooltip';
import { AuthService } from '../../../core/services/auth.service';
import { ConfiguracionService } from '../../../core/services/configuracion.service';
import { ApiResponse } from '../../../core/models/api-response.model';
import { permiso, RECURSO } from '../../../core/models/permiso.model';
import {
  ActualizarNotificacionInput,
  ConfiguracionNotificacion,
  EstadoSistema,
  SeguridadSmtp
} from '../../../core/models/sistema.model';
import { environment } from '../../../../environments/environment';

/**
 * Tab Sistema. Dos mitades con naturalezas distintas, y la diferencia es el punto
 * de la pantalla:
 *
 *  1. **Cómo está funcionando (solo lectura)**: lo que vive en el `.env` del
 *     backend —canales habilitados, modelo y cron del job de IA, versión de la
 *     encuesta y del motor activos—. No se edita desde la web a propósito.
 *
 *  2. **Transporte SMTP (editable)**: con qué servidor se manda. Vive en DB, no en
 *     el `.env`, justamente para que se pueda cambiar sin desplegar. La contraseña
 *     se guarda cifrada y el backend no la devuelve nunca: si el campo queda vacío,
 *     se conserva la que ya está.
 *
 * Lo que esta pantalla NO define, y es a propósito: **qué** se manda, **a quién** y
 * con qué remitente. Eso es la pantalla Notificaciones. Acá se configura el caño,
 * no el contenido.
 *
 * REGLA DE REDACCIÓN: el template no nombra `.env`, variables de entorno, procesos
 * ni jobs. Quien usa esta pantalla es un administrador funcional, no quien
 * despliega: lo técnico se traduce (ver `frecuenciaLegible()`, `entornoLabel()`).
 */
@Component({
  selector: 'app-configuracion-sistema',
  imports: [
    DatePipe,
    FormsModule,
    ReactiveFormsModule,
    ButtonModule,
    CardModule,
    InputNumberModule,
    InputTextModule,
    MessageModule,
    PasswordModule,
    SelectModule,
    SkeletonModule,
    TagModule,
    ToggleSwitchModule,
    TooltipModule
  ],
  templateUrl: './sistema.html',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ConfiguracionSistema {
  private readonly service = inject(ConfiguracionService);
  private readonly authService = inject(AuthService);
  private readonly messageService = inject(MessageService);
  private readonly fb = inject(FormBuilder);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  readonly estado = signal<EstadoSistema | null>(null);
  readonly notificaciones = signal<ConfiguracionNotificacion | null>(null);
  readonly loading = signal(false);
  readonly error = signal(false);
  readonly guardando = signal(false);
  readonly probando = signal(false);

  /** Versión del front: la del bundle, no viene del backend. */
  readonly versionFront = environment.appVersion;

  readonly puedeEditar = this.authService.tienePermiso(permiso(RECURSO.CONFIGURACION_SISTEMA, 'editar'));

  readonly seguridadOpciones: { label: string; value: SeguridadSmtp; detalle: string }[] = [
    { label: 'Conexión segura (recomendada)', value: 'STARTTLS', detalle: 'La opción habitual con Gmail u Office 365, en el puerto 587.' },
    { label: 'Conexión segura directa', value: 'SSL_TLS', detalle: 'Protegida desde el primer momento, en el puerto 465.' },
    { label: 'Sin protección', value: 'NINGUNA', detalle: 'Solo para un servidor propio de la red interna o para hacer pruebas.' }
  ];

  /**
   * Destinatario del correo de prueba. Arranca con el correo del usuario logueado:
   * es el que con más seguridad puede abrir la casilla y confirmar que llegó.
   */
  readonly destinatarioPrueba = signal(this.authService.usuarioActual()?.correoElectronico ?? '');

  /**
   * El usuario pidió explícitamente borrar la contraseña guardada (SMTP sin
   * autenticación). Se distingue de "no la toqué" porque el `PUT` tiene que mandar
   * `null` en un caso y omitir el campo en el otro.
   */
  readonly borrarContrasena = signal(false);

  readonly form = this.fb.nonNullable.group({
    smtpHabilitado: [false],
    smtpHost: [''],
    smtpPuerto: [587, [Validators.required, Validators.min(1), Validators.max(65535)]],
    smtpSeguridad: ['STARTTLS' as SeguridadSmtp],
    smtpUsuario: [''],
    /** Vacío = conservar la guardada. Nunca se precarga con nada. */
    smtpContrasena: ['']
  });

  readonly correoHabilitado = signal(false);

  /** Sin clave de cifrado en el servidor no se puede guardar ninguna contraseña nueva. */
  readonly sinCifrado = computed(() => this.notificaciones()?.cifradoDisponible === false);

  readonly filasSkeleton = Array.from({ length: 4 });

  /**
   * Metodo y no `computed()` a proposito: depende de `form.dirty`, que no es un
   * signal, asi que un computed cachearia el primer valor y el boton nunca se
   * habilitaria/deshabilitaria.
   */
  puedeProbar(): boolean {
    return this.puedeEditar && (this.notificaciones()?.smtpHabilitado ?? false) && !this.form.dirty;
  }

  constructor() {
    // Los campos obligatorios dependen de si el canal está encendido: con el correo
    // apagado se tiene que poder guardar la configuración a medio cargar. Espeja los
    // `.refine()` del schema zod del backend.
    this.form.controls.smtpHabilitado.valueChanges.subscribe((habilitado) => {
      this.correoHabilitado.set(habilitado);
      this.aplicarObligatorios(habilitado);
    });

    this.cargar();
  }

  reintentar(): void {
    this.cargar();
  }

  isFieldInvalid(controlName: string): boolean {
    const control = this.form.get(controlName);
    return !!control && control.invalid && (control.dirty || control.touched);
  }

  /** Pie de ayuda del selector de seguridad: cambia con lo elegido. */
  detalleSeguridad(): string {
    const elegida = this.form.controls.smtpSeguridad.value;
    return this.seguridadOpciones.find((opcion) => opcion.value === elegida)?.detalle ?? '';
  }

  descartar(): void {
    const actual = this.notificaciones();
    if (actual) {
      this.rellenarForm(actual);
    }
  }

  marcarParaBorrarContrasena(): void {
    this.borrarContrasena.set(true);
    this.form.controls.smtpContrasena.setValue('');
    this.form.markAsDirty();
  }

  cancelarBorrarContrasena(): void {
    this.borrarContrasena.set(false);
  }

  guardar(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.messageService.add({
        severity: 'warn',
        summary: 'Revisá los campos',
        detail: 'Hay datos incompletos o mal escritos en la configuración de correo.'
      });
      return;
    }

    const valores = this.form.getRawValue();
    const input: ActualizarNotificacionInput = {
      smtpHabilitado: valores.smtpHabilitado,
      smtpHost: valores.smtpHost.trim(),
      smtpPuerto: valores.smtpPuerto,
      smtpSeguridad: valores.smtpSeguridad,
      smtpUsuario: valores.smtpUsuario.trim()
    };

    // Los tres estados del contrato: string = reemplazar, null = borrar,
    // ausente = conservar la guardada (el caso normal, porque la API no la devuelve).
    if (valores.smtpContrasena) {
      input.smtpContrasena = valores.smtpContrasena;
    } else if (this.borrarContrasena()) {
      input.smtpContrasena = null;
    }

    this.guardando.set(true);
    this.service.guardarNotificaciones(input).subscribe({
      next: (res) => {
        this.guardando.set(false);
        if (res.data) {
          this.notificaciones.set(res.data);
          this.rellenarForm(res.data);
        }
        this.messageService.add({
          severity: 'success',
          summary: 'Configuración guardada',
          detail: input.smtpHabilitado
            ? 'Hacé una prueba de envío para confirmar que los correos llegan.'
            : 'El envío de correos quedó deshabilitado.'
        });
      },
      error: (err: unknown) => {
        this.guardando.set(false);
        this.avisarError(err, 'No se pudo guardar la configuración de correo.');
      }
    });
  }

  /**
   * Manda un correo real con la configuración YA GUARDADA, no con la del formulario:
   * por eso el botón se bloquea mientras haya cambios sin guardar.
   */
  probar(): void {
    const destinatario = this.destinatarioPrueba().trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(destinatario)) {
      this.messageService.add({
        severity: 'warn',
        summary: 'Destinatario inválido',
        detail: 'Escribí un correo válido para mandar la prueba.'
      });
      return;
    }

    this.probando.set(true);
    this.service.probarCorreo(destinatario).subscribe({
      next: (res) => {
        this.probando.set(false);
        this.messageService.add({
          severity: 'success',
          summary: 'Correo enviado',
          detail: `Se envió a ${destinatario}. Revisá la bandeja de entrada y también el correo no deseado.`,
          life: 8000
        });
      },
      error: (err: unknown) => {
        this.probando.set(false);
        // El 502 trae la respuesta textual del servidor SMTP, que es justo el dato
        // que sirve para corregir ("535 auth failed", "ENOTFOUND"...).
        this.avisarError(err, 'No se pudo enviar el correo de prueba.', 12000);
      }
    });
  }

  /**
   * El backend informa la frecuencia del análisis como expresión cron
   * ("*\/5 * * * *"). Eso no se muestra: se traduce a los casos que realmente se
   * usan y, si aparece uno raro, se cae a una frase genérica en lugar de exponer
   * la expresión.
   */
  frecuenciaLegible(): string {
    const cron = this.estado()?.ia.cronExpr?.trim() ?? '';
    const cadaNMinutos = /^\*\/(\d+) \* \* \* \*$/.exec(cron);
    if (cadaNMinutos) {
      const minutos = Number(cadaNMinutos[1]);
      return minutos === 1 ? 'Cada minuto' : `Cada ${minutos} minutos`;
    }

    const cadaNHoras = /^0 \*\/(\d+) \* \* \*$/.exec(cron);
    if (cadaNHoras) {
      const horas = Number(cadaNHoras[1]);
      return horas === 1 ? 'Cada hora' : `Cada ${horas} horas`;
    }

    if (/^\* \* \* \* \*$/.test(cron)) {
      return 'Cada minuto';
    }

    const aLaHora = /^(\d+) (\d+) \* \* \*$/.exec(cron);
    if (aLaHora) {
      const hh = aLaHora[2].padStart(2, '0');
      const mm = aLaHora[1].padStart(2, '0');
      return `Todos los días a las ${hh}:${mm}`;
    }

    return cron ? 'Según una programación propia' : 'Sin programar';
  }

  /** `production` / `development` no se muestran crudos. */
  entornoLabel(): string {
    return this.estado()?.entorno === 'production' ? 'En producción' : 'Entorno de pruebas';
  }

  /** Salta al tab del motor de criticidad (la versión activa se muestra acá). */
  irAlMotor(): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { tab: 'motor' },
      queryParamsHandling: 'merge'
    });
  }

  private aplicarObligatorios(habilitado: boolean): void {
    const host = this.form.controls.smtpHost;
    host.setValidators(habilitado ? [Validators.required] : []);
    host.updateValueAndValidity({ emitEvent: false });
  }

  private rellenarForm(config: ConfiguracionNotificacion): void {
    this.borrarContrasena.set(false);
    this.form.reset({
      smtpHabilitado: config.smtpHabilitado,
      smtpHost: config.smtpHost,
      smtpPuerto: config.smtpPuerto,
      smtpSeguridad: config.smtpSeguridad,
      smtpUsuario: config.smtpUsuario,
      smtpContrasena: ''
    });
    this.correoHabilitado.set(config.smtpHabilitado);
    this.aplicarObligatorios(config.smtpHabilitado);

    if (!this.puedeEditar) {
      this.form.disable({ emitEvent: false });
      return;
    }

    // Sin clave maestra en el backend, guardar una contrasena nueva fallaria con
    // 400. Se deshabilita el campo (via el control, no con [disabled] en el
    // template: eso rompe con reactive forms) y el resto queda editable.
    if (config.cifradoDisponible) {
      this.form.controls.smtpContrasena.enable({ emitEvent: false });
    } else {
      this.form.controls.smtpContrasena.disable({ emitEvent: false });
    }
  }

  private cargar(): void {
    this.loading.set(true);
    this.error.set(false);

    forkJoin({
      sistema: this.service.obtenerSistema(),
      notificaciones: this.service.obtenerNotificaciones()
    }).subscribe({
      next: ({ sistema, notificaciones }) => {
        this.estado.set(sistema.data ?? null);
        if (notificaciones.data) {
          this.notificaciones.set(notificaciones.data);
          this.rellenarForm(notificaciones.data);
        }
        this.loading.set(false);
      },
      error: (err: unknown) => {
        this.loading.set(false);
        this.error.set(true);
        this.avisarError(err, 'No se pudo cargar el estado del sistema.');
      }
    });
  }

  private avisarError(err: unknown, fallback: string, life?: number): void {
    const mensaje = (err as { error?: ApiResponse<null> })?.error?.message ?? fallback;
    this.messageService.add({
      severity: 'error',
      summary: 'Error',
      detail: mensaje,
      ...(life ? { life } : {})
    });
  }
}
