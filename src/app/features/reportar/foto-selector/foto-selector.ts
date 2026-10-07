import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, computed, effect, inject, input, model, signal, viewChildren } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { ButtonModule } from 'primeng/button';
import { MessageModule } from 'primeng/message';

export const FOTO_MAX_SIZE_BYTES = 10 * 1024 * 1024;
const FOTO_TIPOS_ACEPTADOS = ['image/jpeg', 'image/png', 'image/webp'];

interface FotoSlot {
  file: File | null;
  previewUrl: string | null;
  error: string | null;
}

function crearSlotVacio(): FotoSlot {
  return { file: null, previewUrl: null, error: null };
}

@Component({
  selector: 'app-foto-selector',
  imports: [NgTemplateOutlet, ButtonModule, MessageModule],
  templateUrl: './foto-selector.html',
  styleUrl: './foto-selector.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class FotoSelector {
  readonly disabled = input(false);
  readonly fotos = model<File[]>([]);
  /** Cuantas fotos admite la version activa de la encuesta. */
  readonly maximo = input<number>(3);
  /** Cuantas exige. Es >= 1: la foto no es opcional. */
  readonly minimo = input<number>(1);

  readonly slots = signal<FotoSlot[]>([]);

  /** Los recuadros que van despues del principal (el primero va aparte, mas grande). */
  readonly indicesSecundarios = computed(() => this.slots().slice(1).map((_, indice) => indice + 1));

  readonly faltantes = computed(() => Math.max(0, this.minimo() - this.fotos().length));

  private readonly fileInputs = viewChildren<ElementRef<HTMLInputElement>>('fileInput');
  private readonly destroyRef = inject(DestroyRef);

  constructor() {
    // La cantidad de recuadros la manda la encuesta activa: al cambiar, se
    // conservan las fotos que entren y se liberan las previews que se caen.
    effect(() => {
      const cantidad = Math.max(1, this.maximo());
      const actuales = this.slots();
      if (actuales.length === cantidad) {
        return;
      }
      actuales.slice(cantidad).forEach((slot) => {
        if (slot.previewUrl) {
          URL.revokeObjectURL(slot.previewUrl);
        }
      });
      this.slots.set(Array.from({ length: cantidad }, (_, indice) => actuales[indice] ?? crearSlotVacio()));
      if (actuales.length > cantidad) {
        this.emitFotos();
      }
    });

    // Si algo externo resetea `fotos` a un arreglo vacío (p.ej. al reiniciar el flujo del
    // reporte), hay que limpiar las previsualizaciones internas y liberar sus Object URL.
    effect(() => {
      if (this.fotos().length === 0 && this.slots().some((slot) => slot.file)) {
        this.limpiarSlots();
      }
    });

    this.destroyRef.onDestroy(() => this.limpiarSlots());
  }

  /** Etiquetas accesibles por posicion; la primera es la principal. */
  etiquetaSeleccion(indice: number): string {
    return indice === 0 ? 'Seleccionar fotografía principal' : `Seleccionar fotografía ${indice + 1}`;
  }

  etiquetaQuitar(indice: number): string {
    return indice === 0 ? 'Quitar fotografía principal' : `Quitar fotografía ${indice + 1}`;
  }

  openFileSelector(index: number): void {
    if (this.disabled()) {
      return;
    }
    this.fileInputs()[index]?.nativeElement.click();
  }

  onBoxKeydown(event: KeyboardEvent, index: number): void {
    if (event.key !== ' ' && event.key !== 'Enter') {
      return;
    }
    event.preventDefault();
    this.openFileSelector(index);
  }

  onFileSelected(event: Event, index: number): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    input.value = '';
    if (!file) {
      return;
    }

    const error = this.validateFile(file);
    this.slots.update((actuales) => {
      const nuevas = [...actuales];
      const previa = nuevas[index];
      if (error) {
        nuevas[index] = { ...previa, error };
        return nuevas;
      }
      if (previa.previewUrl) {
        URL.revokeObjectURL(previa.previewUrl);
      }
      nuevas[index] = { file, previewUrl: this.createPreview(file), error: null };
      return nuevas;
    });

    if (!error) {
      this.emitFotos();
    }
  }

  removePhoto(index: number, event: Event): void {
    event.stopPropagation();
    if (this.disabled()) {
      return;
    }
    this.slots.update((actuales) => {
      const nuevas = [...actuales];
      const previa = nuevas[index];
      if (previa.previewUrl) {
        URL.revokeObjectURL(previa.previewUrl);
      }
      nuevas[index] = crearSlotVacio();
      return nuevas;
    });
    this.emitFotos();
  }

  private validateFile(file: File): string | null {
    if (!FOTO_TIPOS_ACEPTADOS.includes(file.type)) {
      return 'Formato no permitido. Usá JPG, PNG o WEBP.';
    }
    if (file.size > FOTO_MAX_SIZE_BYTES) {
      return `El tamaño máximo por foto es ${Math.round(FOTO_MAX_SIZE_BYTES / (1024 * 1024))} MB.`;
    }
    return null;
  }

  private createPreview(file: File): string {
    return URL.createObjectURL(file);
  }

  private emitFotos(): void {
    const archivos = this.slots()
      .map((slot) => slot.file)
      .filter((file): file is File => file !== null);
    this.fotos.set(archivos);
  }

  private limpiarSlots(): void {
    this.slots.update((actuales) => {
      actuales.forEach((slot) => {
        if (slot.previewUrl) {
          URL.revokeObjectURL(slot.previewUrl);
        }
      });
      return Array.from({ length: Math.max(1, this.maximo()) }, crearSlotVacio);
    });
  }
}
