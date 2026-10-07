import { ChangeDetectionStrategy, Component, DestroyRef, HostListener, computed, inject, signal, viewChild } from '@angular/core';
import { FormBuilder, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { HttpErrorResponse } from '@angular/common/http';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';
import { CheckboxModule } from 'primeng/checkbox';
import { InputTextModule } from 'primeng/inputtext';
import { InputOtpModule } from 'primeng/inputotp';
import { MessageModule } from 'primeng/message';
import { RadioButtonModule } from 'primeng/radiobutton';
import { StepperModule } from 'primeng/stepper';
import { FotoSelector } from './foto-selector/foto-selector';
import { ReporteCiudadanoService } from '../../core/services/reporte-ciudadano.service';
import { ApiResponse } from '../../core/models/api-response.model';
import { Encuesta, Pregunta, RespuestaEnvio } from '../../core/models/encuesta.model';
import { environment } from '../../../environments/environment';
import { Turnstile } from '../../shared/turnstile/turnstile';

const RESEND_COOLDOWN_SECONDS = 30;
const TELEFONO_PATTERN = /^09\d{8}$/;
const CODIGO_PAIS = '595';

type UbicacionEstado = 'solicitando' | 'concedida' | 'error';

interface Ubicacion {
  latitud: number;
  longitud: number;
}

@Component({
  selector: 'app-reportar',
  imports: [
    ReactiveFormsModule,
    FormsModule,
    ButtonModule,
    CardModule,
    CheckboxModule,
    FotoSelector,
    InputTextModule,
    InputOtpModule,
    MessageModule,
    RadioButtonModule,
    StepperModule,
    Turnstile
  ],
  templateUrl: './reportar.html',
  styleUrl: './reportar.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class Reportar {
  readonly appName = environment.appName;

  private readonly fb = inject(FormBuilder);
  private readonly reporteCiudadanoService = inject(ReporteCiudadanoService);
  private readonly messageService = inject(MessageService);
  private readonly sanitizer = inject(DomSanitizer);
  private readonly destroyRef = inject(DestroyRef);

  readonly ubicacionEstado = signal<UbicacionEstado>('solicitando');
  readonly ubicacionErrorMsg = signal<string | null>(null);
  private readonly ubicacion = signal<Ubicacion | null>(null);

  readonly activeStep = signal(1);
  readonly identidadStage = this.reporteCiudadanoService.stage;
  readonly identidadVerificada = this.reporteCiudadanoService.identidadVerificada;
  readonly loading = this.reporteCiudadanoService.loading;

  /** Tokens anti-bot: uno para validar el teléfono y otro para enviar el reporte. */
  readonly turnstileTelefono = signal<string | null>(null);
  readonly turnstileEnvio = signal<string | null>(null);
  /** `true` mientras corre el desafío de Cloudflare (antes de llamar a la API). */
  readonly verificando = signal(false);
  private readonly turnstileTelefonoRef = viewChild<Turnstile>('refTurnstileTelefono');
  private readonly turnstileEnvioRef = viewChild<Turnstile>('refTurnstileEnvio');
  readonly resendCooldown = signal(0);
  readonly resendLabel = computed(() =>
    this.resendCooldown() > 0 ? `Reenviar código (${this.resendCooldown()}s)` : 'Reenviar código'
  );

  readonly encuesta = signal<Encuesta | null>(null);
  readonly encuestaLoading = signal(false);
  readonly encuestaError = signal<string | null>(null);
  readonly intentoAvanzarEncuesta = signal(false);
  readonly fotos = signal<File[]>([]);

  /** Fotos exigidas por la versión activa (defaults hasta que carga la encuesta). */
  readonly fotosMin = computed(() => this.encuesta()?.fotosMin ?? 1);
  readonly fotosMax = computed(() => this.encuesta()?.fotosMax ?? 3);
  /** `true` cuando todavía faltan fotos para poder enviar. */
  readonly faltanFotos = computed(() => this.fotos().length < this.fotosMin());
  readonly reporteEnviado = signal(false);

  private readonly respuestaUnicaSignal = signal<Record<number, number | null>>({});
  private readonly respuestasMultipleSignal = signal<Record<number, number[]>>({});

  private resendIntervalId?: ReturnType<typeof setInterval>;

  readonly telefonoForm = this.fb.nonNullable.group({
    telefono: ['', [Validators.required, Validators.pattern(TELEFONO_PATTERN)]],
  });

  readonly codigoForm = this.fb.nonNullable.group({
    codigo: ['', [Validators.required, Validators.pattern(/^\d{4}$/)]]
  });

  constructor() {
    this.solicitarUbicacion();
    this.loadEncuesta();
    this.destroyRef.onDestroy(() => this.stopResendCountdown());
  }

  // Sin esto, soltar un archivo arrastrado en cualquier parte de la página (fuera de los
  // selectores de foto) hace que el navegador abra la imagen y reemplace la página.
  @HostListener('document:dragover', ['$event'])
  @HostListener('document:drop', ['$event'])
  prevenirDropFueraDeZona(event: DragEvent): void {
    event.preventDefault();
  }

  isFieldInvalid(form: FormGroup, controlName: string): boolean {
    const control = form.get(controlName);
    return !!control && control.invalid && (control.dirty || control.touched);
  }

  /** El acceso a la ubicación es obligatorio: sin ella no se puede avanzar al paso 1. */
  solicitarUbicacion(): void {
    if (!('geolocation' in navigator)) {
      this.ubicacionEstado.set('error');
      this.ubicacionErrorMsg.set('Tu navegador no admite geolocalización, por lo que no podés continuar.');
      return;
    }

    this.ubicacionEstado.set('solicitando');
    navigator.geolocation.getCurrentPosition(
      (posicion) => {
        this.ubicacion.set({ latitud: posicion.coords.latitude, longitud: posicion.coords.longitude });
        this.ubicacionEstado.set('concedida');
      },
      (error) => {
        this.ubicacionEstado.set('error');
        this.ubicacionErrorMsg.set(this.mensajeErrorUbicacion(error));
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }

  private mensajeErrorUbicacion(error: GeolocationPositionError): string {
    switch (error.code) {
      case error.PERMISSION_DENIED:
        return 'Necesitamos acceso a tu ubicación para continuar. Habilitalo en la configuración de tu navegador y volvé a intentar.';
      case error.POSITION_UNAVAILABLE:
        return 'No pudimos determinar tu ubicación. Intentá nuevamente.';
      case error.TIMEOUT:
        return 'La solicitud de ubicación demoró demasiado. Intentá nuevamente.';
      default:
        return 'No se pudo obtener tu ubicación.';
    }
  }

  loadEncuesta(): void {
    this.encuestaLoading.set(true);
    this.reporteCiudadanoService.getEncuesta().subscribe({
      next: (res) => {
        this.encuestaLoading.set(false);
        this.encuesta.set(res.data);
      },
      error: (error: HttpErrorResponse) => {
        this.encuestaLoading.set(false);
        const apiError = error.error as ApiResponse<null> | undefined;
        this.encuestaError.set(apiError?.message ?? 'No se pudo cargar la encuesta.');
      }
    });
  }

  async solicitarCodigo(): Promise<void> {
    if (this.telefonoForm.invalid) {
      this.telefonoForm.markAllAsTouched();
      return;
    }

    // El desafío anti-bot corre recién acá, al enviar.
    const token = await this.resolverAntiBot(this.turnstileTelefonoRef());
    if (!token) {
      return;
    }

    const { telefono } = this.telefonoForm.getRawValue();
    const telefonoInternacional = this.aTelefonoInternacional(telefono);

    this.reporteCiudadanoService.login(telefonoInternacional, token).subscribe({
      next: () => {
        this.telefonoForm.reset();
        this.startResendCountdown();
      },
      error: (error: HttpErrorResponse) => {
        this.showApiError(error, 'No se pudo enviar el código de verificación.');
        // El token ya se canjeo contra Cloudflare: hay que pedir uno nuevo.
        this.turnstileTelefonoRef()?.reset();
      }
    });
  }

  verificarCodigo(activateCallback: (value: number) => void): void {
    if (this.codigoForm.invalid) {
      this.codigoForm.markAllAsTouched();
      return;
    }

    const { codigo } = this.codigoForm.getRawValue();

    this.reporteCiudadanoService.verificarCodigo(codigo).subscribe({
      next: () => {
        this.stopResendCountdown();
        activateCallback(2);
      },
      error: (error: HttpErrorResponse) => {
        if (error.status === 401) {
          this.messageService.add({
            severity: 'error',
            summary: 'Verificación expirada',
            detail: 'Volvé a ingresar tu número de teléfono.'
          });
          this.volverATelefono();
          return;
        }
        this.showApiError(error, 'No se pudo verificar el código.');
        this.codigoForm.reset();
      }
    });
  }

  reenviarCodigo(): void {
    if (this.resendCooldown() > 0) {
      return;
    }

    this.reporteCiudadanoService.reenviarCodigo().subscribe({
      next: () => {
        this.messageService.add({ severity: 'success', summary: 'Código reenviado', detail: 'Revisá tu teléfono.' });
        this.startResendCountdown();
      },
      error: (error: HttpErrorResponse) => {
        if (error.status === 401) {
          this.messageService.add({
            severity: 'error',
            summary: 'Verificación expirada',
            detail: 'Volvé a ingresar tu número de teléfono.'
          });
          this.volverATelefono();
          return;
        }
        this.showApiError(error, 'No se pudo reenviar el código.');
      }
    });
  }

  volverATelefono(): void {
    this.stopResendCountdown();
    this.codigoForm.reset();
    this.reporteCiudadanoService.volverATelefono();
  }

  respuestaUnica(preguntaId: number): number | null {
    return this.respuestaUnicaSignal()[preguntaId] ?? null;
  }

  setRespuestaUnica(preguntaId: number, opcionId: number): void {
    this.respuestaUnicaSignal.update((actuales) => ({ ...actuales, [preguntaId]: opcionId }));
  }

  esOpcionMultipleSeleccionada(preguntaId: number, opcionId: number): boolean {
    return (this.respuestasMultipleSignal()[preguntaId] ?? []).includes(opcionId);
  }

  alternarOpcionMultiple(preguntaId: number, opcionId: number): void {
    this.respuestasMultipleSignal.update((actuales) => {
      const seleccionadas = actuales[preguntaId] ?? [];
      const nuevas = seleccionadas.includes(opcionId)
        ? seleccionadas.filter((id) => id !== opcionId)
        : [...seleccionadas, opcionId];
      return { ...actuales, [preguntaId]: nuevas };
    });
  }

  preguntaRespondida(pregunta: Pregunta): boolean {
    if (pregunta.tipo === 'ELECCION_UNICA') {
      return this.respuestaUnica(pregunta.id) != null;
    }
    if (pregunta.tipo === 'ELECCION_MULTIPLE') {
      return (this.respuestasMultipleSignal()[pregunta.id] ?? []).length > 0;
    }
    return true;
  }

  avanzarEncuesta(activateCallback: (value: number) => void): void {
    this.intentoAvanzarEncuesta.set(true);

    const datosEncuesta = this.encuesta();
    if (!datosEncuesta) {
      return;
    }

    const incompleta = datosEncuesta.preguntas.some(
      (pregunta) => pregunta.tipo !== 'FOTO' && !this.preguntaRespondida(pregunta)
    );
    if (incompleta) {
      return;
    }

    // Las fotos no son opcionales: la versión activa define cuántas hacen falta.
    if (this.faltanFotos()) {
      return;
    }

    activateCallback(3);
  }

  async enviarReporte(activateCallback: (value: number) => void): Promise<void> {
    const datosEncuesta = this.encuesta();
    const ubicacion = this.ubicacion();
    if (!datosEncuesta || !ubicacion) {
      return;
    }


    const respuestas: RespuestaEnvio[] = datosEncuesta.preguntas
      .filter((pregunta) => pregunta.tipo !== 'FOTO')
      .map((pregunta) => ({
        preguntaId: pregunta.id,
        preguntaOpcionIds:
          pregunta.tipo === 'ELECCION_UNICA'
            ? this.opcionUnicaComoArray(pregunta.id)
            : (this.respuestasMultipleSignal()[pregunta.id] ?? [])
      }));

    // Segundo gate anti-bot: el envío también se verifica, no solo el teléfono.
    const tokenAntiBot = await this.resolverAntiBot(this.turnstileEnvioRef());
    if (!tokenAntiBot) {
      return;
    }

    this.reporteCiudadanoService.enviarReporte(respuestas, this.fotos(), ubicacion, tokenAntiBot).subscribe({
      next: () => this.reporteEnviado.set(true),
      error: (error: HttpErrorResponse) => {
        if (error.status === 409) {
          this.messageService.add({
            severity: 'error',
            summary: 'Enlace ya utilizado',
            detail: 'Volvé a verificar tu número para enviar un nuevo reporte.'
          });
          this.reiniciarFlujo(activateCallback);
          return;
        }
        this.showApiError(error, 'No se pudo enviar el reporte.');
        // El token ya se canjeo contra Cloudflare: hay que pedir uno nuevo.
        this.turnstileEnvioRef()?.reset();
      }
    });
  }

  /**
   * Lanza el desafío de Cloudflare y devuelve el token, o `null` si falló (en
   * cuyo caso ya se avisó al usuario). El widget aparece recién en este momento.
   */
  private async resolverAntiBot(widget: Turnstile | undefined): Promise<string | null> {
    if (!widget) {
      return null;
    }
    this.verificando.set(true);
    try {
      return await widget.obtenerToken();
    } catch (error) {
      this.messageService.add({
        severity: 'error',
        summary: 'Verificación de seguridad',
        detail: (error as Error).message
      });
      return null;
    } finally {
      this.verificando.set(false);
    }
  }

  reiniciarFlujo(activateCallback: (value: number) => void): void {
    this.reporteCiudadanoService.reiniciar();
    this.respuestaUnicaSignal.set({});
    this.respuestasMultipleSignal.set({});
    this.fotos.set([]);
    this.intentoAvanzarEncuesta.set(false);
    this.turnstileTelefono.set(null);
    this.turnstileEnvio.set(null);
    this.reporteEnviado.set(false);
    this.telefonoForm.reset();
    this.codigoForm.reset();
    activateCallback(1);
  }

  private opcionUnicaComoArray(preguntaId: number): number[] {
    const seleccion = this.respuestaUnica(preguntaId);
    return seleccion == null ? [] : [seleccion];
  }

  /** El ciudadano ingresa el formato local (09XXXXXXXX); el backend espera el formato internacional sin el 0 inicial. */
  private aTelefonoInternacional(telefonoLocal: string): string {
    return `${CODIGO_PAIS}${telefonoLocal.slice(1)}`;
  }

  private startResendCountdown(): void {
    this.stopResendCountdown();
    this.resendCooldown.set(RESEND_COOLDOWN_SECONDS);
    this.resendIntervalId = setInterval(() => {
      const remaining = this.resendCooldown() - 1;
      if (remaining <= 0) {
        this.stopResendCountdown();
        return;
      }
      this.resendCooldown.set(remaining);
    }, 1000);
  }

  private stopResendCountdown(): void {
    if (this.resendIntervalId) {
      clearInterval(this.resendIntervalId);
      this.resendIntervalId = undefined;
    }
    this.resendCooldown.set(0);
  }

  private showApiError(error: HttpErrorResponse, fallback: string): void {
    const apiError = error.error as ApiResponse<null> | undefined;
    this.messageService.add({
      severity: 'error',
      summary: 'Error',
      detail: apiError?.message ?? fallback
    });
  }
}
