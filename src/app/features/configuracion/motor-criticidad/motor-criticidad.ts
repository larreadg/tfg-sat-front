import { DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormArray, FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { ConfirmationService, MessageService } from 'primeng/api';
import { AccordionModule } from 'primeng/accordion';
import { ButtonModule } from 'primeng/button';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { InputNumberModule } from 'primeng/inputnumber';
import { InputTextModule } from 'primeng/inputtext';
import { MessageModule } from 'primeng/message';
import { MultiSelectModule } from 'primeng/multiselect';
import { DialogModule } from 'primeng/dialog';
import { ListboxModule } from 'primeng/listbox';
import { PanelModule } from 'primeng/panel';
import { SelectModule } from 'primeng/select';
import { SkeletonModule } from 'primeng/skeleton';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { ToggleSwitchModule } from 'primeng/toggleswitch';
import { ToolbarModule } from 'primeng/toolbar';
import { TooltipModule } from 'primeng/tooltip';
import { AuthService } from '../../../core/services/auth.service';
import { ConfiguracionService } from '../../../core/services/configuracion.service';
import { ConfiguracionBorradorService } from '../../../core/services/configuracion-borrador.service';
import { EncuestasAdminService } from '../../../core/services/encuestas-admin.service';
import { ApiResponse } from '../../../core/models/api-response.model';
import {
  ActualizarConfiguracionInput,
  ConfiguracionCriticidad,
  FACTORES_CUESTIONARIO,
  FactorCuestionario,
  EfectoReglaEspecial,
  ModoAgregacion,
  PuntajesConfig,
  ReglaEspecial,
  ReglaPuntaje
} from '../../../core/models/configuracion.model';
import { EncuestaVersionDetalle } from '../../../core/models/encuesta-admin.model';
import { permiso, RECURSO } from '../../../core/models/permiso.model';
import { NivelTag } from '../../../shared/nivel-tag/nivel-tag';
import { SeccionHeader } from './seccion-header/seccion-header';
import { TablaOpciones } from './tabla-opciones/tabla-opciones';
import {
  alcanceDe,
  AlcanceFactor,
  aRecord,
  armarTablaF1,
  detectarDesincronizacion,
  escalarAlTope,
  factoresQueNoAlcanzan,
  ETIQUETA_EFECTO,
  ETIQUETA_FACTOR,
  ETIQUETA_MODO,
  FilaOpcion,
  filasDeRegla,
  filasNuevas,
  opcionesDe,
  preguntaPorCodigo,
  preguntasPuntuables,
  reglasDeFactor,
  resumirCambios,
  separarTramos,
  sumaPesos,
  sumaUnoValidator,
  TOLERANCIA_SUMA_PESOS,
  TOPE_FACTOR,
  tramosF1QueBajan,
  tramosCrecientesValidator,
  umbralesCrecientesValidator
} from './motor-criticidad.form';

/** Opción de un `p-select` / `p-multiselect`. */
interface OpcionSelect {
  label: string;
  value: string;
}

/**
 * Parámetros del motor de criticidad (ERS §5).
 *
 * ⚠️ La configuración es INMUTABLE Y VERSIONADA: el `PUT` no edita la versión
 * activa, crea la siguiente y la activa. Por eso todo el formulario tiene UN
 * solo guardar — partirlo por bloque generaría una versión nueva por cada
 * cambio suelto y ensuciaría el historial que consume `DesgloseFactores`.
 *
 * El editor de puntajes se construye desde la ENCUESTA ACTIVA: las reglas se
 * arman eligiendo preguntas y opciones reales, no tipeando claves. Antes las
 * preguntas estaban cableadas acá (`p03`/`p04`/`p06`/`p07`) y la clave de cada
 * fila era texto libre, así que se podía guardar una opción inexistente y el
 * factor dejaba de puntuar sin aviso.
 */
@Component({
  selector: 'app-motor-criticidad',
  imports: [
    DecimalPipe,
    ReactiveFormsModule,
    AccordionModule,
    ButtonModule,
    ConfirmDialogModule,
    DialogModule,
    InputNumberModule,
    InputTextModule,
    ListboxModule,
    MessageModule,
    MultiSelectModule,
    PanelModule,
    SelectModule,
    SkeletonModule,
    TableModule,
    TagModule,
    ToggleSwitchModule,
    ToolbarModule,
    TooltipModule,
    NivelTag,
    SeccionHeader,
    TablaOpciones
  ],
  providers: [ConfirmationService],
  templateUrl: './motor-criticidad.html',
  styleUrl: './motor-criticidad.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class MotorCriticidad {
  private readonly fb = inject(FormBuilder);
  private readonly service = inject(ConfiguracionService);
  private readonly encuestasService = inject(EncuestasAdminService);
  private readonly borrador = inject(ConfiguracionBorradorService);
  private readonly authService = inject(AuthService);
  private readonly messageService = inject(MessageService);
  private readonly confirmationService = inject(ConfirmationService);

  readonly puedeEditar = this.authService.tienePermiso(permiso(RECURSO.CONFIGURACION_CRITICIDAD, 'editar'));

  readonly configActiva = signal<ConfiguracionCriticidad | null>(null);
  /** Encuesta vigente: la fuente de las preguntas y opciones que se pueden puntuar. */
  readonly encuestaActiva = signal<EncuestaVersionDetalle | null>(null);
  readonly loading = signal(false);
  readonly error = signal(false);
  readonly guardando = signal(false);
  /** Bloques que cambiaron, para listarlos en la confirmación. */
  readonly cambiosPendientes = signal<string[]>([]);
  readonly versionSiguiente = computed(() => (this.configActiva()?.version ?? 0) + 1);

  readonly form: FormGroup = this.construirFormulario();

  /** Se re-emite en cada cambio del formulario: alimenta los indicadores en vivo. */
  private readonly valorFormulario = toSignal(this.form.valueChanges, { initialValue: this.form.getRawValue() });

  readonly totalPesos = computed(() => sumaPesos(this.valorFormulario()?.pesos));
  readonly pesosSuman = computed(() => Math.abs(this.totalPesos() - 1) < TOLERANCIA_SUMA_PESOS);

  /** Tramos de la escala 0–5 según los umbrales actuales, para el preview. */
  readonly tramosNivel = computed(() => {
    const umbrales = this.valorFormulario()?.umbralesNivel;
    if (!umbrales) {
      return [];
    }
    const { n1, n2, n3 } = umbrales;
    return [
      { nivel: 0, desde: 0, hasta: n1 },
      { nivel: 1, desde: n1, hasta: n2 },
      { nivel: 2, desde: n2, hasta: n3 },
      { nivel: 3, desde: n3, hasta: 5 }
    ];
  });

  /**
   * Secciones desplegadas. Arranca con todas abiertas para ver la configuración de
   * un vistazo, y el accordion la mantiene al día por `[(value)]`.
   */
  readonly seccionesAbiertas = signal<string[]>([
    'pesos',
    'umbrales',
    'puntajes',
    'especiales',
    'deteccion'
  ]);

  /** Números del panel, en el formato de la app (coma decimal). */
  private readonly formatear = (valor: number, decimales = 2): string =>
    new Intl.NumberFormat('es', { minimumFractionDigits: decimales, maximumFractionDigits: decimales }).format(
      valor || 0
    );

  // --- Resúmenes que cada encabezado muestra, para que una sección cerrada igual
  //     diga en qué estado está.

  readonly resumenPesos = computed(() => `Total ${this.formatear(this.totalPesos(), 4)}`);

  readonly resumenUmbrales = computed(() => {
    const umbrales = this.valorFormulario()?.umbralesNivel;
    if (!umbrales) {
      return '';
    }
    return [umbrales.n1, umbrales.n2, umbrales.n3].map((corte) => this.formatear(corte)).join(' · ');
  });

  readonly resumenPuntajes = computed(() => {
    this.valorFormulario();
    const cantidad = this.reglas.length;
    return cantidad === 1 ? '1 pregunta' : `${cantidad} preguntas`;
  });

  readonly resumenEspeciales = computed(() => {
    this.valorFormulario();
    const cantidad = this.reglasEspeciales.length;
    return cantidad === 1 ? '1 regla' : `${cantidad} reglas`;
  });

  readonly resumenDeteccion = computed(() => {
    const valor = this.valorFormulario();
    if (!valor) {
      return '';
    }
    return `${valor.radioMetros} m · ${valor.ventanaDias} d`;
  });

  readonly filasSkeleton = Array.from({ length: 4 });

  /**
   * Los factores que el panel configura con preguntas. NO es `FACTORES_CUESTIONARIO`:
   * el motor sigue pudiendo puntuar F5 con reglas, pero F5 ya no se alimenta del
   * cuestionario — sale del mapa de riesgo — así que no se ofrece acá. Si una
   * configuración vieja tuviera reglas de F5, se conservan al guardar (viven en el
   * mismo FormArray), simplemente no se editan desde esta pantalla.
   */
  readonly factores = FACTORES_CUESTIONARIO.filter((factor) => factor !== 'f5');
  readonly etiquetaFactor = ETIQUETA_FACTOR;

  readonly modos: OpcionSelect[] = (['suma', 'max', 'promedio'] as ModoAgregacion[]).map((modo) => ({
    value: modo,
    label: ETIQUETA_MODO[modo] ?? modo
  }));

  readonly efectos: OpcionSelect[] = (['nivelMinimo', 'sumarCriticidad'] as EfectoReglaEspecial[]).map(
    (efecto) => ({ value: efecto, label: ETIQUETA_EFECTO[efecto] })
  );

  /** Preguntas de la encuesta activa que se pueden elegir en los selects. */
  readonly preguntasDisponibles = computed<OpcionSelect[]>(() =>
    preguntasPuntuables(this.encuestaActiva()).map((pregunta) => ({
      value: pregunta.codigo as string,
      label: pregunta.texto
    }))
  );

  /**
   * Referencias que la encuesta activa no puede satisfacer. Se recalcula con cada
   * cambio del formulario, así aparece y desaparece mientras se edita.
   */
  readonly desincronizaciones = computed(() => {
    this.valorFormulario();
    return detectarDesincronizacion(this.armarPuntajes(), this.encuestaActiva());
  });

  /**
   * Hasta dónde llega cada factor con los puntajes actuales. Se recalcula con cada
   * tecla, así el tag de la barra del factor se mueve mientras se editan las
   * opciones.
   */
  readonly alcances = computed<Record<FactorCuestionario, AlcanceFactor>>(() => {
    this.valorFormulario();
    const puntajes = this.armarPuntajes();
    const encuesta = this.encuestaActiva();
    return Object.fromEntries(
      FACTORES_CUESTIONARIO.map((factor) => [factor, alcanceDe(puntajes, factor, encuesta)])
    ) as Record<FactorCuestionario, AlcanceFactor>;
  });

  /**
   * Factores que no pueden llegar al tope de la escala: bloquean el guardado igual
   * que las desincronizaciones. Es el mismo modo de falla silencioso — el motor no
   * se queja, simplemente subclasifica para siempre los reportes de ese factor.
   */
  readonly factoresSinAlcance = computed(() => {
    this.valorFormulario();
    return factoresQueNoAlcanzan(this.armarPuntajes(), this.encuestaActiva());
  });

  readonly topeFactor = TOPE_FACTOR;

  /**
   * Factor cuyo diálogo de "agregar pregunta" está abierto, o `null` si no hay
   * ninguno. Antes esto era un select permanente al pie de cada factor: tres
   * selectores siempre visibles para una acción ocasional, que además competían
   * visualmente con las preguntas ya cargadas.
   */
  readonly factorEnDialogo = signal<FactorCuestionario | null>(null);

  /**
   * Pregunta marcada en el listado del diálogo, todavía sin agregar. Va por
   * `FormControl` y no por signal porque `p-listbox` solo expone su valor como
   * ControlValueAccessor; no tiene un `[value]` suelto.
   */
  readonly preguntaDialogo = this.fb.control<string | null>(null);
  readonly preguntaElegida = toSignal(this.preguntaDialogo.valueChanges, { initialValue: null });

  readonly dialogoAbierto = computed(() => this.factorEnDialogo() !== null);

  /** Preguntas que el diálogo ofrece: las vigentes que ese factor todavía no puntúa. */
  readonly preguntasDelDialogo = computed<OpcionSelect[]>(() => {
    const factor = this.factorEnDialogo();
    return factor ? this.preguntasParaAgregar(factor) : [];
  });

  readonly tituloDialogo = computed(() => {
    const factor = this.factorEnDialogo();
    return factor ? `Agregar pregunta a ${ETIQUETA_FACTOR[factor]}` : '';
  });

  abrirDialogoPregunta(factor: FactorCuestionario): void {
    this.preguntaDialogo.reset(null);
    this.factorEnDialogo.set(factor);
  }

  cerrarDialogoPregunta(): void {
    this.factorEnDialogo.set(null);
    this.preguntaDialogo.reset(null);
  }

  constructor() {
    this.cargar();
  }

  // --- Accesos que necesita el template ---

  get pesos(): FormGroup {
    return this.form.get('pesos') as FormGroup;
  }

  get umbrales(): FormGroup {
    return this.form.get('umbralesNivel') as FormGroup;
  }

  get limites(): FormGroup {
    return this.form.get('limitesAntiabuso') as FormGroup;
  }

  get tramosF1(): FormArray {
    return this.form.get('f1Tramos') as FormArray;
  }

  get reglas(): FormArray {
    return this.form.get('reglas') as FormArray;
  }

  get configFactores(): FormGroup {
    return this.form.get('factores') as FormGroup;
  }

  get reglasEspeciales(): FormArray {
    return this.form.get('reglasEspeciales') as FormArray;
  }

  reglaEspecialDe(indice: number): FormGroup {
    return this.reglasEspeciales.at(indice) as FormGroup;
  }

  /** Texto de la pregunta que dispara la regla; vacío si ya no está en la encuesta. */
  textoPreguntaEspecial(indice: number): string {
    const codigo = this.reglaEspecialDe(indice).getRawValue().preguntaCodigo as string;
    return preguntaPorCodigo(this.encuestaActiva(), codigo)?.texto ?? '';
  }

  reglaEspecialColgada(indice: number): boolean {
    const codigo = this.reglaEspecialDe(indice).getRawValue().preguntaCodigo as string;
    return !!codigo && preguntaPorCodigo(this.encuestaActiva(), codigo) === undefined;
  }

  /** Rango y ayuda del campo `valor`, que cambia según el efecto elegido. */
  limitesValor(indice: number): { min: number; max: number; paso: number; ayuda: string } {
    const efecto = this.reglaEspecialDe(indice).getRawValue().efecto as EfectoReglaEspecial;
    return efecto === 'nivelMinimo'
      ? { min: 0, max: 3, paso: 1, ayuda: 'El reporte no puede quedar por debajo de este nivel.' }
      : { min: 0, max: 5, paso: 0.25, ayuda: 'Se suman a la criticidad calculada, sin pasar de 5.' };
  }

  agregarReglaEspecial(): void {
    this.reglasEspeciales.push(
      this.grupoReglaEspecial({
        nombre: '',
        preguntaCodigo: '',
        opcionCodigos: [],
        efecto: 'sumarCriticidad',
        valor: 0.5
      })
    );
    this.form.markAsDirty();
  }

  quitarReglaEspecial(indice: number): void {
    this.reglasEspeciales.removeAt(indice);
    this.form.markAsDirty();
  }

  /**
   * Al cambiar el efecto, el valor anterior puede quedar fuera de rango (un 4.5 de
   * suma no es un nivel válido), así que se lleva al borde.
   */
  ajustarValorAlEfecto(indice: number): void {
    const grupo = this.reglaEspecialDe(indice);
    const { min, max } = this.limitesValor(indice);
    const actual = Number(grupo.getRawValue().valor);
    const efecto = grupo.getRawValue().efecto as EfectoReglaEspecial;
    const ajustado = efecto === 'nivelMinimo' ? Math.round(actual) : actual;
    grupo.patchValue({ valor: Math.min(Math.max(ajustado, min), max) });
    this.form.markAsDirty();
  }

  factorGrupo(factor: FactorCuestionario): FormGroup {
    return this.configFactores.get(factor) as FormGroup;
  }

  alcanceDeFactor(factor: FactorCuestionario): AlcanceFactor {
    return this.alcances()[factor];
  }

  /**
   * El factor no puede llegar al tope de la escala. Solo en ese caso aparece el
   * atajo de escalado: mientras está bien, la barra del factor no dice nada.
   */
  factorBloquea(factor: FactorCuestionario): boolean {
    const { bloquea, maximo } = this.alcanceDeFactor(factor);
    return bloquea && !!maximo;
  }

  /**
   * Reescala los puntajes del factor para que su peor caso dé exactamente el tope.
   * Sin este atajo el bloqueo sería un castigo: el analista queda trabado sin saber
   * qué número mover.
   */
  escalarFactor(factor: FactorCuestionario): void {
    const puntajes = this.armarPuntajes();
    const reglas = reglasDeFactor(puntajes, factor);
    const escaladas = escalarAlTope(reglas, puntajes.factores?.[factor]?.modo ?? 'suma', this.encuestaActiva());
    if (!escaladas) {
      return;
    }

    // `reglasDeFactor` filtra en el mismo orden en que `indicesDe` devuelve los
    // índices del FormArray, así que posición i de `escaladas` = índice i del factor.
    const indices = this.indicesDe(factor);
    indices.forEach((indice, i) => {
      const opciones = this.opcionesDeRegla(indice);
      for (const control of opciones.controls) {
        const grupo = control as FormGroup;
        const codigo = grupo.getRawValue().codigo as string;
        const valor = escaladas[i]?.[codigo];
        if (valor !== undefined) {
          grupo.patchValue({ valor });
        }
      }
    });

    this.form.markAsDirty();
    this.messageService.add({
      severity: 'success',
      summary: `${ETIQUETA_FACTOR[factor]} escalado`,
      detail: `Los puntajes se reescalaron para que el peor caso llegue a ${TOPE_FACTOR}, manteniendo las proporciones.`
    });
  }

  tramoDe(indice: number): FormGroup {
    return this.tramosF1.at(indice) as FormGroup;
  }

  /**
   * Desde dónde arranca un tramo. No es un dato guardado: la tabla define cortes
   * "hasta", así que el piso de una fila es el techo de la anterior más uno. Se
   * muestra al lado del campo para que el rango se lea completo sin tener que
   * mirar la fila de arriba.
   */
  desdeTramo(indice: number): number {
    return indice === 0 ? 0 : Number(this.tramoDe(indice - 1).getRawValue().max) + 1;
  }

  /**
   * El corte quedó por debajo del anterior, así que el tramo no cubre nada: el de
   * arriba ya se lleva esas cantidades. El formulario además marca el error global,
   * pero acá se ve en la fila que lo causa.
   */
  tramoIncoherente(indice: number): boolean {
    return Number(this.tramoDe(indice).getRawValue().max) < this.desdeTramo(indice);
  }

  /**
   * Índices de las filas de F1 cuyo puntaje es MENOR que el de la fila anterior.
   * F1 mide densidad: más reportes cercanos no puede valer menos. El índice
   * `tramosF1.length` es el tramo abierto del final.
   */
  readonly filasF1QueBajan = computed(() => {
    const valor = this.valorFormulario();
    if (!valor) {
      return [];
    }
    return tramosF1QueBajan(armarTablaF1(valor.f1Tramos ?? [], valor.f1ValorAbierto ?? 0));
  });

  f1Baja(indice: number): boolean {
    return this.filasF1QueBajan().includes(indice);
  }

  /**
   * Piso del puntaje de una fila de F1: el de la fila anterior. Es la defensa barata
   * — el campo directamente no deja bajar — y la validación de arriba cubre el resto
   * (pegar un valor, una versión vieja cargada como base).
   */
  minimoPuntajeF1(indice: number): number {
    if (indice === 0) {
      return 0;
    }
    return Number(this.tramoDe(indice - 1).getRawValue().valor) || 0;
  }

  /** Piso del tramo abierto: el puntaje de la última fila finita. */
  get minimoPuntajeAbierto(): number {
    return this.tramosF1.length === 0 ? 0 : this.minimoPuntajeF1(this.tramosF1.length);
  }

  /** El tramo abierto del final ("6 o más"). */
  get descripcionTramoAbierto(): string {
    if (this.tramosF1.length === 0) {
      return 'Cualquier cantidad de reportes cerca';
    }
    const ultimo = Number(this.tramoDe(this.tramosF1.length - 1).getRawValue().max);
    return `${ultimo + 1} o más reportes cerca`;
  }

  /** Índices de `reglas` que pertenecen a un factor, en orden. */
  indicesDe(factor: FactorCuestionario): number[] {
    return this.reglas.controls
      .map((control, indice) => ({ factor: (control as FormGroup).getRawValue().factor, indice }))
      .filter((fila) => fila.factor === factor)
      .map((fila) => fila.indice);
  }

  reglaDe(indice: number): FormGroup {
    return this.reglas.at(indice) as FormGroup;
  }

  opcionesDeRegla(indice: number): FormArray {
    return this.reglaDe(indice).get('opciones') as FormArray;
  }

  /** Texto real de la pregunta de una regla; el código si la encuesta ya no la tiene. */
  textoPreguntaDe(indice: number): string {
    const codigo = this.reglaDe(indice).getRawValue().preguntaCodigo as string;
    return preguntaPorCodigo(this.encuestaActiva(), codigo)?.texto ?? codigo;
  }

  codigoPreguntaDe(indice: number): string {
    return this.reglaDe(indice).getRawValue().preguntaCodigo as string;
  }

  /** `true` si la pregunta de esta regla no está en la encuesta activa. */
  reglaColgada(indice: number): boolean {
    return preguntaPorCodigo(this.encuestaActiva(), this.codigoPreguntaDe(indice)) === undefined;
  }

  /**
   * Preguntas que todavía se pueden sumar a un factor: las vigentes que ese factor
   * no puntúa. Una misma pregunta puede alimentar dos factores distintos, pero no
   * dos veces el mismo (el backend lo rechaza).
   */
  preguntasParaAgregar(factor: FactorCuestionario): OpcionSelect[] {
    const yaUsadas = new Set(
      this.indicesDe(factor).map((indice) => this.reglaDe(indice).getRawValue().preguntaCodigo as string)
    );
    return this.preguntasDisponibles().filter((opcion) => !yaUsadas.has(opcion.value));
  }

  /** Respuestas de la pregunta elegida en una regla especial. */
  opcionesDeReglaEspecial(indice: number): OpcionSelect[] {
    const codigo = this.reglaEspecialDe(indice).getRawValue().preguntaCodigo as string;
    if (!codigo) {
      return [];
    }
    return opcionesDe(this.encuestaActiva(), codigo).map((opcion) => ({
      value: opcion.codigo as string,
      label: opcion.texto
    }));
  }

  /**
   * Al cambiar la pregunta, las respuestas elegidas dejan de tener sentido: eran de
   * la pregunta anterior.
   */
  reiniciarOpcionesEspecial(indice: number): void {
    this.reglaEspecialDe(indice).patchValue({ opcionCodigos: [] });
    this.form.markAsDirty();
  }

  // --- Edición de F1 ---

  agregarTramo(): void {
    const ultimo = this.tramosF1.length > 0 ? Number(this.tramosF1.at(this.tramosF1.length - 1).value.max) : -1;
    this.tramosF1.push(this.grupoTramo({ max: ultimo + 1, valor: 0 }));
    this.form.markAsDirty();
  }

  quitarTramo(indice: number): void {
    this.tramosF1.removeAt(indice);
    this.form.markAsDirty();
  }

  // --- Edición de reglas ---

  /**
   * Suma al factor la pregunta elegida en el diálogo. Las filas nacen con TODAS las
   * opciones vigentes en 0: así el analista ve qué tiene para puntuar en vez de
   * tener que escribirlo, y no puede inventar una opción que no existe.
   */
  agregarRegla(): void {
    const factor = this.factorEnDialogo();
    const preguntaCodigo = this.preguntaElegida();
    if (!factor || !preguntaCodigo) {
      return;
    }

    this.reglas.push(this.grupoRegla({ preguntaCodigo, factor, opciones: {} }));
    this.form.markAsDirty();
    this.cerrarDialogoPregunta();
  }

  quitarRegla(indice: number): void {
    this.reglas.removeAt(indice);
    this.form.markAsDirty();
  }

  /** Quita una fila de opción: solo se usa para las colgadas (las vigentes no se borran). */
  quitarOpcionDeRegla(indiceRegla: number, indiceOpcion: number): void {
    this.opcionesDeRegla(indiceRegla).removeAt(indiceOpcion);
    this.form.markAsDirty();
  }

  // --- Acciones ---

  reintentar(): void {
    this.cargar();
  }

  descartar(): void {
    const config = this.configActiva();
    if (config) {
      this.volcarEnFormulario(config);
    }
  }

  guardar(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.messageService.add({
        severity: 'warn',
        summary: 'Revisá el formulario',
        detail: 'Hay valores fuera de rango o campos sin completar. Están marcados en rojo.'
      });
      return;
    }

    // El backend rechaza una configuración que referencia preguntas u opciones que
    // la encuesta activa no tiene; se avisa acá para no gastar el viaje.
    if (this.desincronizaciones().length > 0) {
      this.messageService.add({
        severity: 'error',
        summary: 'La configuración no coincide con la encuesta activa',
        detail: 'Corregí las referencias marcadas en rojo antes de crear la versión.'
      });
      return;
    }

    // F1 invertida (más reportes cercanos valiendo menos) el motor la aplica sin
    // chistar y clasifica al revés para siempre. El backend también la rechaza.
    if (this.filasF1QueBajan().length > 0) {
      this.messageService.add({
        severity: 'error',
        summary: 'Los puntajes de F1 bajan',
        detail: 'Más reportes cercanos no puede valer menos riesgo. Corregí las filas marcadas en rojo.'
      });
      return;
    }

    // Un factor que no llega al tope entra a la media ponderada con su peso completo
    // pero nunca puede llevar el reporte al rojo: el backend también lo rechaza.
    if (this.factoresSinAlcance().length > 0) {
      this.messageService.add({
        severity: 'error',
        summary: 'Hay factores que no llegan al máximo de la escala',
        detail: 'Subí los puntajes o usá "Escalar a 5" en los factores marcados en rojo.'
      });
      return;
    }

    const config = this.configActiva();
    if (!config) {
      return;
    }

    const input = this.armarInput();
    const cambios = resumirCambios(config, input);

    if (cambios.length === 0) {
      this.messageService.add({
        severity: 'info',
        summary: 'Sin cambios',
        detail: 'No hay nada distinto respecto de la versión activa.'
      });
      return;
    }

    // La lista va por signal, no dentro de `message`: ese string se renderiza en
    // una sola línea y los saltos quedarían colapsados.
    this.cambiosPendientes.set(cambios);
    this.confirmationService.confirm({
      header: `Crear la versión ${config.version + 1}`,
      message: `La versión ${config.version} queda en el historial y los reportes ya calculados conservan su resultado.`,
      icon: 'pi pi-info-circle',
      rejectButtonProps: { label: 'Cancelar', severity: 'secondary', text: true, rounded: true },
      acceptButtonProps: { label: 'Crear versión', rounded: true },
      accept: () => this.confirmarGuardado(input)
    });
  }

  private confirmarGuardado(input: ActualizarConfiguracionInput): void {
    this.guardando.set(true);
    this.service.guardarNuevaVersion(input).subscribe({
      next: (res) => {
        this.guardando.set(false);
        const nueva = res.data;
        if (nueva) {
          this.configActiva.set(nueva);
          this.volcarEnFormulario(nueva);
        }
        this.messageService.add({
          severity: 'success',
          summary: `Versión ${nueva?.version} activa`,
          detail: 'Los reportes que se calculen a partir de ahora usan esta configuración.'
        });
      },
      error: (err: unknown) => {
        this.guardando.set(false);
        const mensaje =
          (err as { error?: ApiResponse<null> })?.error?.message ?? 'No se pudo guardar la configuración.';
        this.messageService.add({ severity: 'error', summary: 'Error', detail: mensaje });
      }
    });
  }

  // --- Carga y armado ---

  /**
   * Config y encuesta se piden juntas: el editor de reglas no se puede construir
   * sin la encuesta, y mostrar los puntajes sin sus textos no sirve de nada.
   *
   * Que no haya encuesta activa (404) no es un error acá: el tab igual carga, con
   * las reglas en modo lectura y un aviso.
   */
  private cargar(): void {
    this.loading.set(true);
    this.error.set(false);

    forkJoin({
      config: this.service.obtenerActiva(),
      encuesta: this.encuestasService.obtenerActiva().pipe(catchError(() => of(null)))
    }).subscribe({
      next: ({ config, encuesta }) => {
        this.loading.set(false);
        this.encuestaActiva.set(encuesta?.data ?? null);

        if (config.data) {
          this.configActiva.set(config.data);

          // "Usar como base" del tab Historial: si el buzón trae una versión, el
          // formulario arranca con ESA, pero `configActiva` sigue siendo la vigente
          // porque guardar crea la siguiente sobre ella. Queda `dirty` a propósito:
          // si no, el botón de guardar nace apagado.
          const base = this.borrador.tomarBase();
          this.volcarEnFormulario(base ?? config.data);
          if (base) {
            this.form.markAsDirty();
          }
        }
      },
      error: (err) => {
        this.loading.set(false);
        this.error.set(true);
        const mensaje = (err.error as ApiResponse<null>)?.message ?? 'No se pudo cargar la configuración.';
        this.messageService.add({ severity: 'error', summary: 'Error', detail: mensaje });
      }
    });
  }

  private construirFormulario(): FormGroup {
    return this.fb.nonNullable.group({
      pesos: this.fb.nonNullable.group(
        {
          f1: [0, [Validators.required, Validators.min(0), Validators.max(1)]],
          f2: [0, [Validators.required, Validators.min(0), Validators.max(1)]],
          f3: [0, [Validators.required, Validators.min(0), Validators.max(1)]],
          f4: [0, [Validators.required, Validators.min(0), Validators.max(1)]],
          f5: [0, [Validators.required, Validators.min(0), Validators.max(1)]]
        },
        { validators: sumaUnoValidator }
      ),
      umbralesNivel: this.fb.nonNullable.group(
        {
          n1: [0, [Validators.required, Validators.min(0.01)]],
          n2: [0, [Validators.required, Validators.min(0.01)]],
          n3: [0, [Validators.required, Validators.min(0.01)]]
        },
        { validators: umbralesCrecientesValidator }
      ),
      radioMetros: [0, [Validators.required, Validators.min(1)]],
      ventanaDias: [0, [Validators.required, Validators.min(1)]],
      minReportes: [0, [Validators.required, Validators.min(1)]],
      limitesAntiabuso: this.fb.nonNullable.group({
        otpPorHora: [0, [Validators.required, Validators.min(1)]],
        reportesPor24h: [0, [Validators.required, Validators.min(1)]]
      }),
      // F1: el tramo abierto vive aparte de los finitos (ver `separarTramos`), así
      // queda único y último por construcción.
      f1Tramos: this.fb.array([], [tramosCrecientesValidator]),
      f1ValorAbierto: [0, [Validators.required, Validators.min(0), Validators.max(5)]],
      // Agregación y tope de cada factor de cuestionario.
      factores: this.fb.nonNullable.group({
        f2: this.grupoFactor(),
        f3: this.grupoFactor(),
        f5: this.grupoFactor()
      }),
      // Las reglas viven en un solo FormArray (con su `factor` adentro) y el
      // template las agrupa con `indicesDe`: así mover una regla de factor es
      // cambiar un campo, no migrarla entre arrays.
      reglas: this.fb.array([]),
      // Reglas que actúan sobre el resultado. Antes eran dos ranuras fijas
      // (piso de nivel y bonus); ahora son una lista: se pueden crear las que
      // hagan falta y cada una dice qué efecto tiene y con cuánto.
      reglasEspeciales: this.fb.array([])
    });
  }

  /**
   * El `tope` sigue en el formulario pero NO se edita: el tope de todo factor es
   * `TOPE_FACTOR`, porque los cinco se promedian entre sí y solo son comparables en
   * la misma escala. Antes era un campo editable, y bajarlo era la forma más fácil
   * de romper el motor sin que nada avisara (con tope 0 el factor valía 0 siempre,
   * un cero duro que entraba a la media con todo su peso).
   */
  private grupoFactor(): FormGroup {
    return this.fb.nonNullable.group({
      modo: ['suma' as ModoAgregacion, [Validators.required]],
      tope: [TOPE_FACTOR]
    });
  }

  private grupoReglaEspecial(regla: ReglaEspecial): FormGroup {
    return this.fb.nonNullable.group({
      nombre: [regla.nombre, [Validators.required, Validators.maxLength(120)]],
      preguntaCodigo: [regla.preguntaCodigo, [Validators.required]],
      opcionCodigos: [regla.opcionCodigos, [Validators.required]],
      efecto: [regla.efecto, [Validators.required]],
      valor: [regla.valor, [Validators.required, Validators.min(0), Validators.max(5)]]
    });
  }

  private grupoTramo(tramo: { max: number; valor: number }): FormGroup {
    return this.fb.nonNullable.group({
      max: [tramo.max, [Validators.required, Validators.min(0)]],
      valor: [tramo.valor, [Validators.required, Validators.min(0), Validators.max(5)]]
    });
  }

  private grupoRegla(regla: ReglaPuntaje): FormGroup {
    const filas = Object.keys(regla.opciones).length > 0
      ? filasDeRegla(regla, this.encuestaActiva())
      : filasNuevas(this.encuestaActiva(), regla.preguntaCodigo);

    return this.fb.nonNullable.group({
      preguntaCodigo: [regla.preguntaCodigo, [Validators.required]],
      factor: [regla.factor, [Validators.required]],
      peso: [regla.peso ?? 1, [Validators.required, Validators.min(0.01), Validators.max(10)]],
      opciones: this.fb.array(filas.map((fila) => this.grupoOpcion(fila)))
    });
  }

  private grupoOpcion(fila: FilaOpcion): FormGroup {
    return this.fb.nonNullable.group({
      codigo: [fila.codigo, [Validators.required]],
      // Solo para mostrar; no viaja al backend. `null` = la opción ya no existe.
      texto: [fila.texto],
      valor: [fila.valor, [Validators.required, Validators.min(0), Validators.max(5)]]
    });
  }

  private volcarEnFormulario(config: ConfiguracionCriticidad): void {
    const { f1, factores, reglas, reglasEspeciales } = config.puntajes;
    const { finitos, valorAbierto } = separarTramos(f1.tabla);

    this.form.patchValue({
      pesos: config.pesos,
      umbralesNivel: config.umbralesNivel,
      radioMetros: config.radioMetros,
      ventanaDias: config.ventanaDias,
      minReportes: config.minReportes,
      limitesAntiabuso: config.limitesAntiabuso,
      f1ValorAbierto: valorAbierto,
      // El tope guardado puede ser cualquiera de una versión vieja; se normaliza, que
      // es además lo que el motor ya hace al calcular (`CRITICIDAD_MAX` por default).
      factores: Object.fromEntries(
        FACTORES_CUESTIONARIO.map((factor) => [
          factor,
          { modo: factores?.[factor]?.modo ?? 'suma', tope: TOPE_FACTOR }
        ])
      )
    });

    this.tramosF1.clear();
    for (const tramo of finitos) {
      this.tramosF1.push(this.grupoTramo(tramo));
    }

    this.reglas.clear();
    for (const regla of reglas ?? []) {
      this.reglas.push(this.grupoRegla(regla));
    }

    this.reglasEspeciales.clear();
    for (const regla of reglasEspeciales ?? []) {
      this.reglasEspeciales.push(this.grupoReglaEspecial(regla));
    }

    this.form.markAsPristine();
  }

  /** Reconstruye `puntajes` desde el formulario. Lo usan el guardado y los avisos. */
  private armarPuntajes(): PuntajesConfig {
    const valor = this.form.getRawValue();

    const reglas: ReglaPuntaje[] = (valor.reglas as {
      preguntaCodigo: string;
      factor: FactorCuestionario;
      peso: number;
      opciones: FilaOpcion[];
    }[]).map((regla) => ({
      preguntaCodigo: regla.preguntaCodigo,
      factor: regla.factor,
      peso: Number(regla.peso),
      opciones: aRecord(regla.opciones)
    }));

    // Una regla a medio completar (sin pregunta o sin respuestas elegidas) no se
    // manda: el backend la rechazaría y no aporta nada al cálculo.
    const reglasEspeciales: ReglaEspecial[] = (valor.reglasEspeciales as ReglaEspecial[])
      .filter((regla) => regla.preguntaCodigo && regla.opcionCodigos.length > 0)
      .map((regla) => ({
        nombre: regla.nombre.trim(),
        preguntaCodigo: regla.preguntaCodigo,
        opcionCodigos: regla.opcionCodigos,
        efecto: regla.efecto,
        valor: Number(regla.valor)
      }));

    return {
      f1: { tabla: armarTablaF1(valor.f1Tramos, valor.f1ValorAbierto) },
      // F4 no tiene nada que configurar: la IA ya devuelve `riesgoScore` en escala
      // 0-5, así que el divisor es 1. Si algún día migrara a 0-100, es un cambio de
      // código (`calcularF4`), no una perilla del panel.
      f4: { divisor: 1 },
      factores: valor.factores,
      reglas,
      reglasEspeciales
    };
  }

  private armarInput(): ActualizarConfiguracionInput {
    const valor = this.form.getRawValue();

    return {
      pesos: valor.pesos,
      umbralesNivel: valor.umbralesNivel,
      radioMetros: valor.radioMetros,
      ventanaDias: valor.ventanaDias,
      minReportes: valor.minReportes,
      limitesAntiabuso: valor.limitesAntiabuso,
      puntajes: this.armarPuntajes()
    };
  }
}
