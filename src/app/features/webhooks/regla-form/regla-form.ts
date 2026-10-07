import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  model,
  output,
  signal,
  untracked
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormArray, FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { ChipModule } from 'primeng/chip';
import { EditorModule } from 'primeng/editor';
import { TextareaModule } from 'primeng/textarea';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { MessageModule } from 'primeng/message';
import { MultiSelectModule } from 'primeng/multiselect';
import { PasswordModule } from 'primeng/password';
import { SelectModule } from 'primeng/select';
import { TagModule } from 'primeng/tag';
import { ToggleSwitchModule } from 'primeng/toggleswitch';
import { TooltipModule } from 'primeng/tooltip';
import { WebhooksService } from '../../../core/services/webhooks.service';
import { ApiResponse } from '../../../core/models/api-response.model';
import {
  AccionWebhook,
  CabeceraWebhookInput,
  CampoAccion,
  CatalogoWebhooks,
  CondicionWebhook,
  EstadoAlerta,
  EventoWebhook,
  GuardarReglaInput,
  ReglaWebhook
} from '../../../core/models/webhook.model';

/**
 * Formulario de una regla. **Lo que se muestra lo decide el catálogo del backend**,
 * no una condición escrita acá: `camposVisibles()` y `condicionesVisibles()` salen de
 * `catalogo.eventos[].condiciones` y `catalogo.acciones[].campos`.
 *
 * Esa indirección es el punto: cuando el backend sume un evento nuevo (por ejemplo
 * "evaluación de IA falló"), esta pantalla lo va a ofrecer con sus condiciones y sus
 * variables de plantilla sin que haya que tocar Angular.
 */
@Component({
  selector: 'app-regla-form',
  imports: [
    ReactiveFormsModule,
    ButtonModule,
    ChipModule,
    DialogModule,
    EditorModule,
    TextareaModule,
    InputTextModule,
    MessageModule,
    MultiSelectModule,
    PasswordModule,
    SelectModule,
    TagModule,
    ToggleSwitchModule,
    TooltipModule
  ],
  templateUrl: './regla-form.html',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ReglaForm {
  private readonly service = inject(WebhooksService);
  private readonly messageService = inject(MessageService);
  private readonly fb = inject(FormBuilder);

  readonly visible = model.required<boolean>();
  readonly catalogo = input.required<CatalogoWebhooks>();
  /** `null` = crear. Con regla = editar. */
  readonly regla = input<ReglaWebhook | null>(null);
  readonly guardado = output<ReglaWebhook>();

  readonly guardando = signal(false);
  /** El usuario pidió borrar el secreto de firma guardado. */
  readonly borrarSecreto = signal(false);

  readonly form = this.fb.nonNullable.group({
    nombre: ['', [Validators.required, Validators.maxLength(120)]],
    evento: ['ALERTA_CREADA' as EventoWebhook, [Validators.required]],
    accion: ['CORREO' as AccionWebhook, [Validators.required]],
    activa: [true],
    nivelMinimo: [null as number | null],
    estadosDestino: [[] as EstadoAlerta[]],
    destinatarios: [''],
    asunto: [''],
    url: [''],
    /** Vacío = conservar el guardado. Nunca se precarga. */
    secretoFirma: [''],
    /** HTML del editor. Vacío = el backend arma un cuerpo automático. */
    cuerpoCorreo: [''],
    /** Plantilla JSON. Vacío = el backend manda el payload completo de AGUARD. */
    cuerpoHttp: [''],
    cabeceras: this.fb.array<ReturnType<ReglaForm['nuevaCabecera']>>([])
  });

  get cabeceras(): FormArray<ReturnType<ReglaForm['nuevaCabecera']>> {
    return this.form.controls.cabeceras;
  }

  /**
   * Una fila de cabecera. `valor` vacío significa "conservar el guardado", que es el
   * único estado posible al editar: la API no devuelve el valor, así que el panel no
   * puede precargarlo. `tieneValor` recuerda si hay uno guardado, para poder
   * distinguir "vacío porque no lo toqué" de "vacío porque es nueva".
   */
  nuevaCabecera(nombre = '', tieneValor = false) {
    return this.fb.nonNullable.group({
      nombre: [nombre, [Validators.required, Validators.maxLength(100)]],
      valor: [''],
      tieneValor: [tieneValor]
    });
  }

  /**
   * Valores de `evento` y `accion` como signals, para que los `computed` de abajo
   * reaccionen al cambio.
   *
   * Derivados con `toSignal`, NO espejados a mano con `.set()` desde una
   * suscripción: un signal que se escribe imperativamente y además se lee dentro
   * del `effect` que rellena el formulario deja al effect permanentemente sucio, y
   * el siguiente ciclo de render vuelve a resetear el form encima de lo que el
   * usuario acababa de elegir. Así no hay nada que escribirlos.
   */
  private readonly eventoSel = toSignal(this.form.controls.evento.valueChanges, {
    initialValue: this.form.controls.evento.value
  });
  private readonly accionSel = toSignal(this.form.controls.accion.valueChanges, {
    initialValue: this.form.controls.accion.value
  });

  readonly esEdicion = computed(() => this.regla() !== null);

  readonly definicionEvento = computed(() =>
    this.catalogo().eventos.find((evento) => evento.valor === this.eventoSel()) ?? null
  );

  readonly definicionAccion = computed(() =>
    this.catalogo().acciones.find((accion) => accion.valor === this.accionSel()) ?? null
  );

  readonly condicionesVisibles = computed<CondicionWebhook[]>(
    () => this.definicionEvento()?.condiciones ?? []
  );

  readonly camposVisibles = computed<CampoAccion[]>(() => this.definicionAccion()?.campos ?? []);

  readonly variables = computed(() => this.definicionEvento()?.variables ?? []);

  /** Opciones de nivel mínimo, con las etiquetas que manda el backend (RNF-14). */
  readonly nivelOpciones = computed(() => {
    const etiquetas = this.catalogo().etiquetasNivel;
    return [
      { label: 'Cualquier nivel', value: null },
      ...[0, 1, 2, 3].map((nivel) => ({
        label: `Nivel ${nivel} o más (${etiquetas[String(nivel)] ?? nivel})`,
        value: nivel
      }))
    ];
  });

  readonly estadoOpciones = computed(() =>
    this.catalogo().estadosAlerta.map((estado) => ({ label: estado.replace('_', ' '), value: estado }))
  );

  /** Para rellenar solo en la transición cerrado -> abierto, no en cada render. */
  private estabaAbierto = false;

  constructor() {
    // `toSignal` ya actualizó `eventoSel`/`accionSel` cuando esto corre (se suscribe
    // antes, en la inicialización del campo), así que los `computed` de visibilidad
    // leen el valor nuevo.
    this.form.controls.evento.valueChanges.subscribe(() => {
      this.limpiarCondicionesNoAplicables();
      this.aplicarValidadores();
    });

    this.form.controls.accion.valueChanges.subscribe(() => {
      this.limpiarCamposNoAplicables();
      this.aplicarValidadores();
    });

    // Rellena al abrir el diálogo (desde la regla, o vacío para crear).
    //
    // `untracked` es imprescindible, no decorativo: `rellenar()` lee el catálogo y
    // los computed de visibilidad, y resetea el formulario. Sin `untracked`, el
    // effect queda suscrito a los valores del propio form y se vuelve a ejecutar
    // en cuanto el usuario elige algo, reseteándolo encima. La guarda de
    // transición evita además resetear de nuevo mientras el diálogo sigue abierto.
    effect(() => {
      const abierto = this.visible();
      const regla = this.regla();

      if (abierto && !this.estabaAbierto) {
        untracked(() => this.rellenar(regla));
      }
      this.estabaAbierto = abierto;
    });
  }

  isFieldInvalid(controlName: string): boolean {
    const control = this.form.get(controlName);
    return !!control && control.invalid && (control.dirty || control.touched);
  }

  muestraCondicion(condicion: CondicionWebhook): boolean {
    return this.condicionesVisibles().includes(condicion);
  }

  muestraCampo(campo: CampoAccion): boolean {
    return this.camposVisibles().includes(campo);
  }

  /** Agrega `{{clave}}` al final del asunto: más rápido que tipearlo bien. */
  insertarVariable(clave: string): void {
    const control = this.form.controls.asunto;
    control.setValue(`${control.value}{{${clave}}}`);
    control.markAsDirty();
  }

  /**
   * Inserta la variable EN LA POSICIÓN DEL CURSOR del editor, no al final: en un
   * cuerpo de varias líneas, agregar siempre al final no sirve de nada.
   *
   * Si todavía no hay instancia de Quill (nunca se tocó el editor), cae a agregar al
   * final sobre el valor del control.
   */
  insertarVariableEnCuerpo(clave: string): void {
    const marcador = `{{${clave}}}`;
    const quill = this.quill;

    if (quill) {
      const seleccion = quill.getSelection(true) as { index: number; length: number } | null;
      const indice = seleccion ? seleccion.index : quill.getLength();
      quill.insertText(indice, marcador, 'user');
      quill.setSelection(indice + marcador.length, 0);
      return;
    }

    const control = this.form.controls.cuerpoCorreo;
    control.setValue(`${control.value}${marcador}`);
    control.markAsDirty();
  }

  /** Igual que el anterior pero para la plantilla JSON (textarea común). */
  insertarVariableEnJson(clave: string, textarea: HTMLTextAreaElement): void {
    const marcador = `{{${clave}}}`;
    const control = this.form.controls.cuerpoHttp;
    const texto = control.value;
    const inicio = textarea.selectionStart ?? texto.length;
    const fin = textarea.selectionEnd ?? texto.length;

    control.setValue(`${texto.slice(0, inicio)}${marcador}${texto.slice(fin)}`);
    control.markAsDirty();

    // Dejar el cursor después de lo insertado, para poder seguir escribiendo.
    const posicion = inicio + marcador.length;
    setTimeout(() => textarea.setSelectionRange(posicion, posicion));
  }

  /** Instancia de Quill, para insertar en el cursor. La da el `(onInit)` del editor. */
  private quill: {
    getSelection: (focus?: boolean) => { index: number; length: number } | null;
    getLength: () => number;
    insertText: (indice: number, texto: string, fuente?: string) => void;
    setSelection: (indice: number, largo: number) => void;
  } | null = null;

  onEditorInit(evento: { editor: unknown }): void {
    this.quill = evento.editor as typeof this.quill;
  }

  agregarCabecera(): void {
    this.cabeceras.push(this.nuevaCabecera());
    this.form.markAsDirty();
  }

  quitarCabecera(indice: number): void {
    this.cabeceras.removeAt(indice);
    this.form.markAsDirty();
  }

  /** Plantilla de ejemplo, para no arrancar de una caja vacía. */
  usarEjemploJson(): void {
    this.form.controls.cuerpoHttp.setValue(
      [
        '{',
        '  "text": "Alerta {{nivelEtiqueta}} en {{ubicacion}}",',
        '  "nivel": {{nivel}},',
        '  "motivo": "{{motivo}}"',
        '}'
      ].join('\n')
    );
    this.form.controls.cuerpoHttp.markAsDirty();
  }

  marcarParaBorrarSecreto(): void {
    this.borrarSecreto.set(true);
    this.form.controls.secretoFirma.setValue('');
    this.form.markAsDirty();
  }

  cancelarBorrarSecreto(): void {
    this.borrarSecreto.set(false);
  }

  cancelar(): void {
    this.visible.set(false);
  }

  guardar(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.messageService.add({
        severity: 'warn',
        summary: 'Revisá los campos',
        detail: 'Faltan datos obligatorios para esta combinación de evento y acción.'
      });
      return;
    }

    const valores = this.form.getRawValue();
    const condiciones = this.condicionesVisibles();
    const campos = this.camposVisibles();

    // Se manda SOLO lo que corresponde a la combinación elegida. El backend también
    // lo valida (rechaza un dato que la acción no usa), así que mandarlo de más
    // sería un 400 garantizado.
    const input: GuardarReglaInput = {
      nombre: valores.nombre.trim(),
      evento: valores.evento,
      accion: valores.accion,
      activa: valores.activa,
      ...(condiciones.includes('nivelMinimo') ? { nivelMinimo: valores.nivelMinimo } : {}),
      ...(condiciones.includes('estadosDestino') ? { estadosDestino: valores.estadosDestino } : {}),
      ...(campos.includes('destinatarios') ? { destinatarios: valores.destinatarios.trim() } : {}),
      ...(campos.includes('asunto') ? { asunto: valores.asunto.trim() } : {}),
      ...(campos.includes('cuerpoCorreo') ? { cuerpoCorreo: this.cuerpoCorreoLimpio(valores.cuerpoCorreo) } : {}),
      ...(campos.includes('url') ? { url: valores.url.trim() } : {}),
      ...(campos.includes('cuerpoHttp') ? { cuerpoHttp: valores.cuerpoHttp.trim() } : {}),
      ...(campos.includes('cabeceras') ? { cabeceras: this.cabecerasParaGuardar() } : {})
    };

    if (campos.includes('secretoFirma')) {
      // Tres estados: string = reemplazar, null = borrar, ausente = conservar.
      if (valores.secretoFirma) {
        input.secretoFirma = valores.secretoFirma;
      } else if (this.borrarSecreto()) {
        input.secretoFirma = null;
      }
    }

    const actual = this.regla();
    const peticion = actual
      ? this.service.actualizarRegla(actual.id, input)
      : this.service.crearRegla(input);

    this.guardando.set(true);
    peticion.subscribe({
      next: (res) => {
        this.guardando.set(false);
        if (res.data) {
          this.guardado.emit(res.data);
        }
        this.visible.set(false);
        this.messageService.add({
          severity: 'success',
          summary: actual ? 'Regla actualizada' : 'Regla creada',
          detail: actual
            ? 'Los cambios ya están activos.'
            : 'Probala con el botón de prueba antes de confiarle una alerta real.'
        });
      },
      error: (err: unknown) => {
        this.guardando.set(false);
        const mensaje =
          (err as { error?: ApiResponse<null> })?.error?.message ?? 'No se pudo guardar la regla.';
        this.messageService.add({ severity: 'error', summary: 'Error', detail: mensaje, life: 10000 });
      }
    });
  }

  /**
   * Quill deja `<p><br></p>` cuando el editor quedó vacío. Mandarlo tal cual haría
   * que el backend crea que hay un cuerpo propio y mande un correo en blanco en vez
   * del cuerpo automático.
   */
  private cuerpoCorreoLimpio(html: string): string {
    const sinContenido = html.replace(/<p>(\s|<br\s*\/?>|&nbsp;)*<\/p>/gi, '').trim();
    return sinContenido ? html : '';
  }

  /**
   * Arma las cabeceras para el PUT con el contrato de tres estados **por cabecera**:
   * si el usuario escribió un valor va el valor; si lo dejó vacío y había uno
   * guardado, se omite `valor` (el backend conserva el suyo). Una cabecera nueva sin
   * valor se manda igual, para que el backend la rechace con un mensaje claro en vez
   * de que el panel la descarte en silencio.
   */
  private cabecerasParaGuardar(): CabeceraWebhookInput[] {
    return this.cabeceras.controls.map((grupo) => {
      const { nombre, valor, tieneValor } = grupo.getRawValue();
      const limpio = valor.trim();

      if (limpio) {
        return { nombre: nombre.trim(), valor: limpio };
      }
      if (tieneValor) {
        return { nombre: nombre.trim() };
      }
      return { nombre: nombre.trim(), valor: '' };
    });
  }

  /**
   * Los obligatorios dependen de la combinación evento+acción, así que se recalculan
   * cada vez que cambia una de las dos. Espeja lo que valida zod en el backend.
   */
  private aplicarValidadores(): void {
    const campos = this.camposVisibles();
    const destinatarios = this.form.controls.destinatarios;
    const url = this.form.controls.url;

    destinatarios.setValidators(campos.includes('destinatarios') ? [Validators.required] : []);
    url.setValidators(campos.includes('url') ? [Validators.required] : []);

    destinatarios.updateValueAndValidity({ emitEvent: false });
    url.updateValueAndValidity({ emitEvent: false });
  }

  /** Un filtro que el evento nuevo no soporta tiene que irse, no quedar invisible. */
  private limpiarCondicionesNoAplicables(): void {
    const condiciones = this.condicionesVisibles();
    if (!condiciones.includes('nivelMinimo')) {
      this.form.controls.nivelMinimo.setValue(null, { emitEvent: false });
    }
    if (!condiciones.includes('estadosDestino')) {
      this.form.controls.estadosDestino.setValue([], { emitEvent: false });
    }
  }

  private limpiarCamposNoAplicables(): void {
    const campos = this.camposVisibles();
    if (!campos.includes('destinatarios')) {
      this.form.controls.destinatarios.setValue('', { emitEvent: false });
    }
    if (!campos.includes('asunto')) {
      this.form.controls.asunto.setValue('', { emitEvent: false });
    }
    if (!campos.includes('url')) {
      this.form.controls.url.setValue('', { emitEvent: false });
    }
    if (!campos.includes('secretoFirma')) {
      this.form.controls.secretoFirma.setValue('', { emitEvent: false });
    }
    if (!campos.includes('cuerpoCorreo')) {
      this.form.controls.cuerpoCorreo.setValue('', { emitEvent: false });
    }
    if (!campos.includes('cuerpoHttp')) {
      this.form.controls.cuerpoHttp.setValue('', { emitEvent: false });
    }
    if (!campos.includes('cabeceras')) {
      this.cabeceras.clear({ emitEvent: false });
    }
  }

  private rellenar(regla: ReglaWebhook | null): void {
    this.borrarSecreto.set(false);

    const evento = regla?.evento ?? this.catalogo().eventos[0]?.valor ?? 'ALERTA_CREADA';
    const accion = regla?.accion ?? this.catalogo().acciones[0]?.valor ?? 'CORREO';

    // `eventoSel`/`accionSel` se actualizan solos desde `valueChanges`: el reset de
    // abajo los emite. No hay nada que setear a mano.
    this.form.reset({
      nombre: regla?.nombre ?? '',
      evento,
      accion,
      activa: regla?.activa ?? true,
      nivelMinimo: regla?.nivelMinimo ?? null,
      estadosDestino: regla?.estadosDestino ?? [],
      destinatarios: regla?.destinatarios.join(', ') ?? '',
      asunto: regla?.asunto ?? '',
      cuerpoCorreo: regla?.cuerpoCorreo ?? '',
      url: regla?.url ?? '',
      secretoFirma: '',
      cuerpoHttp: regla?.cuerpoHttp ?? '',
      cabeceras: []
    });

    // El FormArray se repuebla a mano: `reset` no crea los grupos que faltan.
    this.cabeceras.clear({ emitEvent: false });
    for (const cabecera of regla?.cabeceras ?? []) {
      this.cabeceras.push(this.nuevaCabecera(cabecera.nombre, cabecera.tieneValor), { emitEvent: false });
    }

    this.aplicarValidadores();
  }
}
