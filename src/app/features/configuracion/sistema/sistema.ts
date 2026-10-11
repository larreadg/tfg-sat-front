import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';
import { MessageModule } from 'primeng/message';
import { SkeletonModule } from 'primeng/skeleton';
import { TagModule } from 'primeng/tag';
import { TooltipModule } from 'primeng/tooltip';
import { ConfiguracionService } from '../../../core/services/configuracion.service';
import { ApiResponse } from '../../../core/models/api-response.model';
import { EstadoSistema } from '../../../core/models/sistema.model';
import { environment } from '../../../../environments/environment';

/**
 * Tab Sistema. **Cómo está funcionando (solo lectura)**: lo que vive en el `.env`
 * del backend —canales habilitados, envío de correos, modelo y cron del job de IA,
 * versión de la encuesta y del motor activos—. No se edita desde la web a propósito.
 *
 * El correo sale por un servicio externo cuya credencial vive en el servidor: acá
 * solo se informa si está disponible. Qué se manda, a quién y con qué remitente se
 * configura en la pantalla Notificaciones.
 *
 * REGLA DE REDACCIÓN: el template no nombra `.env`, variables de entorno, procesos
 * ni jobs. Quien usa esta pantalla es un administrador funcional, no quien
 * despliega: lo técnico se traduce (ver `frecuenciaLegible()`, `entornoLabel()`).
 */
@Component({
  selector: 'app-configuracion-sistema',
  imports: [ButtonModule, CardModule, MessageModule, SkeletonModule, TagModule, TooltipModule],
  templateUrl: './sistema.html',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ConfiguracionSistema {
  private readonly service = inject(ConfiguracionService);
  private readonly messageService = inject(MessageService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  readonly estado = signal<EstadoSistema | null>(null);
  readonly loading = signal(false);
  readonly error = signal(false);

  /** Versión del front: la del bundle, no viene del backend. */
  readonly versionFront = environment.appVersion;

  readonly filasSkeleton = Array.from({ length: 5 });

  constructor() {
    this.cargar();
  }

  reintentar(): void {
    this.cargar();
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

  private cargar(): void {
    this.loading.set(true);
    this.error.set(false);

    this.service.obtenerSistema().subscribe({
      next: (res) => {
        this.estado.set(res.data ?? null);
        this.loading.set(false);
      },
      error: (err: unknown) => {
        this.loading.set(false);
        this.error.set(true);
        this.avisarError(err, 'No se pudo cargar el estado del sistema.');
      }
    });
  }

  private avisarError(err: unknown, fallback: string): void {
    const mensaje = (err as { error?: ApiResponse<null> })?.error?.message ?? fallback;
    this.messageService.add({ severity: 'error', summary: 'Error', detail: mensaje });
  }
}
