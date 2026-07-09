import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { HttpErrorResponse } from '@angular/common/http';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';
import { InputTextModule } from 'primeng/inputtext';
import { PasswordModule } from 'primeng/password';
import { InputOtpModule } from 'primeng/inputotp';
import { MessageModule } from 'primeng/message';
import { AuthService } from '../../core/services/auth.service';
import { ApiResponse } from '../../core/models/api-response.model';
import { environment } from '../../../environments/environment';

const RESEND_COOLDOWN_SECONDS = 30;

@Component({
  selector: 'app-login',
  imports: [
    ReactiveFormsModule,
    ButtonModule,
    CardModule,
    InputTextModule,
    PasswordModule,
    InputOtpModule,
    MessageModule
  ],
  templateUrl: './login.html',
  styleUrl: './login.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class Login {
  readonly appName = environment.appName;
  readonly currentYear = new Date().getFullYear();
  private readonly fb = inject(FormBuilder);
  private readonly authService = inject(AuthService);
  private readonly messageService = inject(MessageService);
  private readonly sanitizer = inject(DomSanitizer);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  readonly stage = this.authService.currentStage;
  readonly loading = this.authService.loading;

  readonly cardTitle = computed(() => (this.stage() === 'credentials' ? 'Bienvenido' : 'Verificación en dos pasos'));
  readonly cardSubtitle = computed(() =>
    this.stage() === 'credentials'
      ? 'Ingresa tus credenciales para continuar.'
      : 'Ingresa el código de 6 dígitos que enviamos por SMS a tu teléfono registrado.'
  );

  readonly captchaSvg = signal<SafeHtml | null>(null);
  readonly resendCooldown = signal(0);
  readonly resendLabel = computed(() =>
    this.resendCooldown() > 0 ? `Reenviar código (${this.resendCooldown()}s)` : 'Reenviar código'
  );

  private resendIntervalId?: ReturnType<typeof setInterval>;

  readonly credentialsForm = this.fb.nonNullable.group({
    correoElectronico: ['', [Validators.required, Validators.email]],
    contrasena: ['', Validators.required],
    captcha: ['', Validators.required]
  });

  readonly otpForm = this.fb.nonNullable.group({
    codigo: ['', [Validators.required, Validators.pattern(/^\d{6}$/)]]
  });

  constructor() {
    this.loadCaptcha();
    this.destroyRef.onDestroy(() => this.stopResendCountdown());
  }

  isFieldInvalid(form: FormGroup, controlName: string): boolean {
    const control = form.get(controlName);
    return !!control && control.invalid && (control.dirty || control.touched);
  }

  loadCaptcha(): void {
    this.authService.getCaptcha().subscribe({
      next: (svg) => this.captchaSvg.set(this.sanitizer.bypassSecurityTrustHtml(svg)),
      error: () => {
        this.messageService.add({ severity: 'error', summary: 'Error', detail: 'No se pudo cargar el captcha.' });
      }
    });
  }

  submitCredentials(): void {
    if (this.credentialsForm.invalid) {
      this.credentialsForm.markAllAsTouched();
      return;
    }

    const { correoElectronico, contrasena, captcha } = this.credentialsForm.getRawValue();

    this.authService.login(correoElectronico, contrasena, captcha).subscribe({
      next: () => {
        this.credentialsForm.reset();
        this.startResendCountdown();
      },
      error: (error: HttpErrorResponse) => {
        this.showApiError(error, 'No se pudo iniciar sesión.');
        this.credentialsForm.patchValue({ captcha: '' });
        this.loadCaptcha();
      }
    });
  }

  submitOtp(): void {
    if (this.otpForm.invalid) {
      this.otpForm.markAllAsTouched();
      return;
    }

    const { codigo } = this.otpForm.getRawValue();

    this.authService.verifyOtp(codigo).subscribe({
      next: () => this.router.navigate(['/inicio']),
      error: (error: HttpErrorResponse) => {
        if (error.status === 401) {
          this.messageService.add({
            severity: 'error',
            summary: 'Verificación expirada',
            detail: 'Vuelve a iniciar sesión.'
          });
          this.backToLogin();
          return;
        }
        this.showApiError(error, 'No se pudo verificar el código.');
        this.otpForm.reset();
      }
    });
  }

  resendCode(): void {
    if (this.resendCooldown() > 0) {
      return;
    }

    this.authService.resendOtp().subscribe({
      next: () => {
        this.messageService.add({ severity: 'success', summary: 'Código reenviado', detail: 'Revisa tu teléfono.' });
        this.startResendCountdown();
      },
      error: (error: HttpErrorResponse) => {
        if (error.status === 401) {
          this.messageService.add({
            severity: 'error',
            summary: 'Verificación expirada',
            detail: 'Vuelve a iniciar sesión.'
          });
          this.backToLogin();
          return;
        }
        this.showApiError(error, 'No se pudo reenviar el código.');
      }
    });
  }

  backToLogin(): void {
    this.stopResendCountdown();
    this.otpForm.reset();
    this.authService.backToLogin();
    this.loadCaptcha();
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
