import { ChangeDetectionStrategy, Component, computed, effect, inject, input, model, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { InputNumberModule } from 'primeng/inputnumber';
import { InputTextModule } from 'primeng/inputtext';
import { MessageModule } from 'primeng/message';
import { SelectModule } from 'primeng/select';
import { SkeletonModule } from 'primeng/skeleton';
import { TagModule } from 'primeng/tag';
import { TextareaModule } from 'primeng/textarea';
import { TooltipModule } from 'primeng/tooltip';
import { EncuestasAdminService } from '../../../core/services/encuestas-admin.service';
import { ApiResponse } from '../../../core/models/api-response.model';
import { EncuestaVersionItem, PreguntaInput, TipoPregunta } from '../../../core/models/encuesta-admin.model';

interface OpcionBorrador {
  texto: string;
  /**
   * Identidad estable de la opción. Se ARRASTRA del origen y se vuelve a mandar al
   * guardar: si no, el backend la derivaría del texto y las reglas del motor que
   * apuntan al código anterior quedarían colgadas. Ausente en opciones nuevas, que
   * todavía no tienen identidad.
   */
  codigo?: string;
}

interface PreguntaBorrador {
  /** Clave local para `track`: el borrador todavía no existe en la base. */
  clave: number;
  texto: string;
  /** Ver `OpcionBorrador.codigo`: es lo que preserva la referencia del motor. */
  codigo?: string;
  tipo: Exclude<TipoPregunta, 'FOTO'>;
  opciones: OpcionBorrador[];
  /** Heredado del origen: la configuración activa del motor puntúa esta pregunta. */
  usadaEnCriticidad: boolean;
  textoOriginal: string;
}

interface BorradorVersion {
  nombre: string;
  descripcion: string;
  fotosMin: number;
  fotosMax: number;
  preguntas: PreguntaBorrador[];
}

export type ModoEditor = 'crear' | 'editar';

/**
 * Editor de una versión del cuestionario, a pantalla completa.
 *
 * Trabaja siempre sobre una COPIA LOCAL: clonar una versión no toca la base,
 * se ajusta todo acá (nombre, fotos, preguntas y opciones) y recién al
 * confirmar se manda una sola petición. Así no quedan borradores a medio hacer
 * por haber abierto el editor.
 */
@Component({
  selector: 'app-encuesta-editor',
  imports: [
    FormsModule,
    ButtonModule,
    DialogModule,
    InputNumberModule,
    InputTextModule,
    MessageModule,
    SelectModule,
    SkeletonModule,
    TagModule,
    TextareaModule,
    TooltipModule
  ],
  templateUrl: './encuesta-editor.html',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class EncuestaEditor {
  private readonly service = inject(EncuestasAdminService);
  private readonly messageService = inject(MessageService);

  readonly visible = model<boolean>(false);
  /** Versión de la que se parte: origen a clonar, o el borrador a editar. */
  readonly origen = input<EncuestaVersionItem | null>(null);
  readonly modo = input<ModoEditor>('crear');
  readonly guardado = output<void>();

  readonly borrador = signal<BorradorVersion | null>(null);
  readonly loading = signal(false);
  readonly error = signal(false);
  readonly guardando = signal(false);

  private siguienteClave = 1;

  readonly tipoOpciones: { label: string; value: Exclude<TipoPregunta, 'FOTO'> }[] = [
    { label: 'Una sola respuesta', value: 'ELECCION_UNICA' },
    { label: 'Varias respuestas', value: 'ELECCION_MULTIPLE' }
  ];

  readonly esCreacion = computed(() => this.modo() === 'crear');

  readonly titulo = computed(() => {
    const origen = this.origen();
    if (!origen) {
      return 'Versión del cuestionario';
    }
    return this.esCreacion()
      ? `Nueva versión a partir de la v${origen.version}`
      : `Editar borrador v${origen.version}`;
  });

  /**
   * Preguntas puntuadas por el motor que se QUITARON del borrador. Renombrarlas ya
   * no es un problema (el motor las ubica por código, no por texto), pero sacarlas
   * sí: su factor se queda sin ese aporte, y el backend rechaza activar la versión.
   */
  readonly criticidadEnRiesgo = computed(() => {
    const original = this.preguntasPuntuadasOriginales();
    const presentes = new Set(
      (this.borrador()?.preguntas ?? []).map((p) => p.codigo).filter((codigo): codigo is string => !!codigo)
    );
    return original.filter((p) => !presentes.has(p.codigo));
  });

  /** Preguntas puntuadas que traía la versión de origen, para comparar. */
  private readonly preguntasPuntuadasOriginales = signal<{ codigo: string; texto: string }[]>([]);

  constructor() {
    effect(() => {
      const origen = this.origen();
      if (this.visible() && origen) {
        this.cargarBorrador(origen);
      }
    });
  }

  cerrar(): void {
    this.visible.set(false);
  }

  reintentar(): void {
    const origen = this.origen();
    if (origen) {
      this.cargarBorrador(origen);
    }
  }

  // --- Edición local (nada de esto toca el backend) --------------------

  agregarPregunta(): void {
    this.borrador.update((b) =>
      b
        ? {
            ...b,
            preguntas: [
              ...b.preguntas,
              {
                clave: this.siguienteClave++,
                texto: '',
                tipo: 'ELECCION_UNICA' as const,
                opciones: [{ texto: '' }, { texto: '' }],
                usadaEnCriticidad: false,
                textoOriginal: ''
              }
            ]
          }
        : b
    );
  }

  quitarPregunta(clave: number): void {
    this.borrador.update((b) =>
      b ? { ...b, preguntas: b.preguntas.filter((p) => p.clave !== clave) } : b
    );
  }

  moverPregunta(clave: number, delta: number): void {
    this.borrador.update((b) => {
      if (!b) {
        return b;
      }
      const indice = b.preguntas.findIndex((p) => p.clave === clave);
      const destino = indice + delta;
      if (indice < 0 || destino < 0 || destino >= b.preguntas.length) {
        return b;
      }
      const preguntas = [...b.preguntas];
      [preguntas[indice], preguntas[destino]] = [preguntas[destino], preguntas[indice]];
      return { ...b, preguntas };
    });
  }

  agregarOpcion(clave: number): void {
    this.borrador.update((b) =>
      b
        ? {
            ...b,
            preguntas: b.preguntas.map((p) =>
              p.clave === clave ? { ...p, opciones: [...p.opciones, { texto: '' }] } : p
            )
          }
        : b
    );
  }

  quitarOpcion(clave: number, indice: number): void {
    this.borrador.update((b) =>
      b
        ? {
            ...b,
            preguntas: b.preguntas.map((p) =>
              p.clave === clave ? { ...p, opciones: p.opciones.filter((_, i) => i !== indice) } : p
            )
          }
        : b
    );
  }

  // --- Confirmación ---------------------------------------------------

  confirmar(): void {
    const borrador = this.borrador();
    const origen = this.origen();
    if (!borrador || !origen) {
      return;
    }

    const problema = this.validar(borrador);
    if (problema) {
      this.messageService.add({ severity: 'warn', summary: 'Revisá la versión', detail: problema });
      return;
    }

    // Los códigos viajan junto al texto: son la identidad que el motor usa, así que
    // omitirlos haría que el backend los derive de nuevo del texto y que las reglas
    // de criticidad dejen de encontrar la pregunta. Las preguntas y opciones nuevas
    // van sin código y el backend se lo asigna.
    const preguntas: PreguntaInput[] = borrador.preguntas.map((p, indice) => ({
      texto: p.texto.trim(),
      codigo: p.codigo,
      tipo: p.tipo,
      orden: indice,
      opciones: p.opciones
        .filter((o) => o.texto.trim().length > 0)
        .map((o, i) => ({ texto: o.texto.trim(), codigo: o.codigo, orden: i }))
    }));

    const cuerpo = {
      nombre: borrador.nombre.trim(),
      descripcion: borrador.descripcion.trim() || null,
      fotosMin: borrador.fotosMin,
      fotosMax: borrador.fotosMax,
      preguntas
    };

    this.guardando.set(true);
    const peticion = this.esCreacion()
      ? this.service.crearVersion(origen.id, cuerpo)
      : this.service.reemplazarContenido(origen.id, cuerpo);

    peticion.subscribe({
      next: (res) => {
        this.guardando.set(false);
        this.visible.set(false);
        this.messageService.add({
          severity: 'success',
          summary: this.esCreacion() ? 'Versión creada' : 'Borrador guardado',
          detail: this.esCreacion()
            ? `Se creó la versión ${res.data?.version} como borrador. Activala cuando quieras usarla.`
            : 'Se guardaron los cambios del borrador.'
        });
        this.guardado.emit();
      },
      error: (err) => {
        this.guardando.set(false);
        const mensaje = ((err as { error?: ApiResponse<null> })?.error)?.message ?? 'No se pudo guardar la versión.';
        this.messageService.add({ severity: 'error', summary: 'Error', detail: mensaje });
      }
    });
  }

  private validar(borrador: BorradorVersion): string | null {
    if (!borrador.nombre.trim()) {
      return 'Poné un nombre a la versión.';
    }
    if (borrador.fotosMax < borrador.fotosMin) {
      return 'El máximo de fotos no puede ser menor al mínimo.';
    }
    if (borrador.preguntas.length === 0) {
      return 'La versión necesita al menos una pregunta.';
    }
    for (const [indice, pregunta] of borrador.preguntas.entries()) {
      if (!pregunta.texto.trim()) {
        return `Falta el texto de la pregunta ${indice + 1}.`;
      }
      const opciones = pregunta.opciones.map((o) => o.texto.trim()).filter((t) => t.length > 0);
      if (opciones.length < 2) {
        return `La pregunta ${indice + 1} necesita al menos dos opciones.`;
      }
    }
    return null;
  }

  // --- Carga del origen ------------------------------------------------

  private cargarBorrador(origen: EncuestaVersionItem): void {
    this.loading.set(true);
    this.error.set(false);
    this.service.obtener(origen.id).subscribe({
      next: (res) => {
        const detalle = res.data;
        this.loading.set(false);
        if (!detalle) {
          this.error.set(true);
          return;
        }
        this.siguienteClave = 1;
        this.preguntasPuntuadasOriginales.set(
          detalle.preguntas
            .filter((p) => p.usadaEnCriticidad && p.codigo !== null)
            .map((p) => ({ codigo: p.codigo as string, texto: p.texto }))
        );
        this.borrador.set({
          nombre: detalle.nombre,
          descripcion: detalle.descripcion ?? '',
          fotosMin: detalle.fotosMin,
          fotosMax: detalle.fotosMax,
          // El paso de fotos no se edita como pregunta: lo garantiza el backend.
          preguntas: detalle.preguntas
            .filter((p) => p.tipo !== 'FOTO')
            .map((p) => ({
              clave: this.siguienteClave++,
              texto: p.texto,
              codigo: p.codigo ?? undefined,
              tipo: p.tipo as Exclude<TipoPregunta, 'FOTO'>,
              opciones: p.opciones.map((o) => ({ texto: o.texto, codigo: o.codigo ?? undefined })),
              usadaEnCriticidad: p.usadaEnCriticidad,
              textoOriginal: p.texto
            }))
        });
      },
      error: (err) => {
        this.loading.set(false);
        this.error.set(true);
        this.borrador.set(null);
        const mensaje = (err.error as ApiResponse<null>)?.message ?? 'No se pudo cargar la versión de origen.';
        this.messageService.add({ severity: 'error', summary: 'Error', detail: mensaje });
      }
    });
  }
}
