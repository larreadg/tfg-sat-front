import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { MessageService } from 'primeng/api';
import { providePrimeNG } from 'primeng/config';
import Aura from '@primeng/themes/aura';
import { of } from 'rxjs';
import { CatalogoWebhooks, GuardarReglaInput, ReglaWebhook } from '../../../core/models/webhook.model';
import { WebhooksService } from '../../../core/services/webhooks.service';
import { ReglaForm } from './regla-form';

/** Captura el input que el formulario le pasa al servicio, que es lo que importa. */
class WebhooksServiceEspia {
  ultimoInput: GuardarReglaInput | null = null;

  crearRegla(input: GuardarReglaInput) {
    this.ultimoInput = input;
    return of({ code: 201, status: 'success', data: { id: 1 } as ReglaWebhook, message: 'ok' });
  }

  actualizarRegla(_id: number, input: GuardarReglaInput) {
    this.ultimoInput = input;
    return of({ code: 200, status: 'success', data: { id: 1 } as ReglaWebhook, message: 'ok' });
  }
}

const CATALOGO: CatalogoWebhooks = {
  eventos: [
    {
      valor: 'ALERTA_CREADA',
      label: 'Alerta creada',
      descripcion: 'd',
      condiciones: ['nivelMinimo'],
      variables: [{ clave: 'nivel', descripcion: 'd', ejemplo: '3' }]
    },
    {
      valor: 'ALERTA_ESTADO_CAMBIADO',
      label: 'Alerta cambio de estado',
      descripcion: 'd',
      condiciones: ['estadosDestino'],
      variables: []
    }
  ],
  acciones: [
    {
      valor: 'CORREO',
      label: 'Enviar un correo',
      descripcion: 'd',
      campos: ['destinatarios', 'asunto', 'cuerpoCorreo']
    },
    {
      valor: 'HTTP',
      label: 'Llamar a un servicio REST (POST)',
      descripcion: 'd',
      campos: ['url', 'cuerpoHttp', 'cabeceras', 'secretoFirma']
    }
  ],
  estadosAlerta: ['NUEVA', 'EN_REVISION', 'DERIVADA', 'CERRADA', 'DESCARTADA'],
  etiquetasNivel: { '0': 'Informativo', '1': 'Bajo', '2': 'Medio', '3': 'Alto' }
};

/** Host que reproduce cómo la pantalla real usa el formulario. */
@Component({
  imports: [ReglaForm],
  template: `<app-regla-form [(visible)]="visible" [catalogo]="catalogo" [regla]="null" />`
})
class Host {
  readonly visible = signal(false);
  readonly catalogo = CATALOGO;
}

describe('ReglaForm — selección de condiciones', () => {
  let fixture: ComponentFixture<Host>;
  let form: ReglaForm;
  let espia: WebhooksServiceEspia;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Host],
      providers: [
        provideHttpClient(),
        provideAnimationsAsync(),
        providePrimeNG({ theme: { preset: Aura } }),
        MessageService,
        { provide: WebhooksService, useClass: WebhooksServiceEspia }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(Host);
    fixture.detectChanges();

    // Abrir el diálogo, como hace "Nueva regla".
    fixture.componentInstance.visible.set(true);
    await fixture.whenStable();
    fixture.detectChanges();

    form = fixture.debugElement.children[0].componentInstance as ReglaForm;
    espia = TestBed.inject(WebhooksService) as unknown as WebhooksServiceEspia;
  });

  it('el nivel mínimo elegido queda en el control y sobrevive al ciclo de render', async () => {
    expect(form.form.controls.nivelMinimo.value).toBeNull();

    // Lo que hace el usuario al elegir "Nivel 3 o más" en el p-select.
    form.form.controls.nivelMinimo.setValue(3);
    form.form.controls.nivelMinimo.markAsDirty();

    await fixture.whenStable();
    fixture.detectChanges();
    await fixture.whenStable();

    expect(form.form.controls.nivelMinimo.value).toBe(3);
  });

  it('el p-select MUESTRA el nivel elegido (el síntoma reportado)', async () => {
    const etiqueta = () =>
      (fixture.nativeElement as HTMLElement).querySelector('#nivelMinimo')?.textContent?.trim() ?? '';

    expect(etiqueta()).toContain('Cualquier nivel');

    // Simula el clic en la opción, pasando por el p-select y no por el form:
    // es lo que falla si el componente no refleja la selección.
    form.form.controls.nivelMinimo.setValue(3);
    await fixture.whenStable();
    fixture.detectChanges();
    await fixture.whenStable();

    expect(etiqueta()).toContain('Nivel 3 o más');
    expect(etiqueta()).toContain('Alto');
  });

  it('el nombre tipeado sobrevive al ciclo de render', async () => {
    form.form.controls.nombre.setValue('Alerta crítica');
    await fixture.whenStable();
    fixture.detectChanges();
    await fixture.whenStable();
    expect(form.form.controls.nombre.value).toBe('Alerta crítica');
  });

  it('cambiar la acción no borra el nombre ni el nivel ya elegidos', async () => {
    form.form.controls.nombre.setValue('Alerta crítica');
    form.form.controls.nivelMinimo.setValue(3);
    await fixture.whenStable();
    fixture.detectChanges();

    form.form.controls.accion.setValue('HTTP');
    await fixture.whenStable();
    fixture.detectChanges();
    await fixture.whenStable();

    expect(form.form.controls.accion.value).toBe('HTTP');
    expect(form.form.controls.nombre.value).toBe('Alerta crítica');
    expect(form.form.controls.nivelMinimo.value).toBe(3);
  });

  it('cambiar el evento a uno que no filtra por nivel limpia el nivel pero no el nombre', async () => {
    form.form.controls.nombre.setValue('Derivaciones');
    form.form.controls.nivelMinimo.setValue(3);
    await fixture.whenStable();
    fixture.detectChanges();

    form.form.controls.evento.setValue('ALERTA_ESTADO_CAMBIADO');
    await fixture.whenStable();
    fixture.detectChanges();
    await fixture.whenStable();

    expect(form.form.controls.evento.value).toBe('ALERTA_ESTADO_CAMBIADO');
    expect(form.form.controls.nombre.value).toBe('Derivaciones');
    expect(form.form.controls.nivelMinimo.value).toBeNull();
  });
});

describe('ReglaForm — cuerpos y cabeceras', () => {
  let fixture: ComponentFixture<Host>;
  let form: ReglaForm;
  let espia: WebhooksServiceEspia;

  async function estabilizar() {
    await fixture.whenStable();
    fixture.detectChanges();
    await fixture.whenStable();
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Host],
      providers: [
        provideHttpClient(),
        provideAnimationsAsync(),
        providePrimeNG({ theme: { preset: Aura } }),
        MessageService,
        { provide: WebhooksService, useClass: WebhooksServiceEspia }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    fixture.componentInstance.visible.set(true);
    await estabilizar();

    form = fixture.debugElement.children[0].componentInstance as ReglaForm;
    espia = TestBed.inject(WebhooksService) as unknown as WebhooksServiceEspia;
  });

  it('el catálogo decide qué campos se muestran, no el componente', () => {
    // CORREO
    expect(form.muestraCampo('cuerpoCorreo')).toBe(true);
    expect(form.muestraCampo('cuerpoHttp')).toBe(false);
    expect(form.muestraCampo('cabeceras')).toBe(false);

    form.form.controls.accion.setValue('HTTP');

    expect(form.muestraCampo('cuerpoCorreo')).toBe(false);
    expect(form.muestraCampo('cuerpoHttp')).toBe(true);
    expect(form.muestraCampo('cabeceras')).toBe(true);
    expect(form.muestraCampo('secretoFirma')).toBe(true);
  });

  it('cambiar de CORREO a HTTP limpia el cuerpo del correo', async () => {
    form.form.controls.cuerpoCorreo.setValue('<p>Hola {{motivo}}</p>');
    await estabilizar();

    form.form.controls.accion.setValue('HTTP');
    await estabilizar();

    expect(form.form.controls.cuerpoCorreo.value).toBe('');
  });

  it('cambiar de HTTP a CORREO limpia el cuerpo JSON y las cabeceras', async () => {
    form.form.controls.accion.setValue('HTTP');
    form.form.controls.cuerpoHttp.setValue('{"a":1}');
    form.agregarCabecera();
    await estabilizar();
    expect(form.cabeceras.length).toBe(1);

    form.form.controls.accion.setValue('CORREO');
    await estabilizar();

    expect(form.form.controls.cuerpoHttp.value).toBe('');
    expect(form.cabeceras.length).toBe(0);
  });

  it('un cuerpo de correo vacío de Quill (<p><br></p>) NO se manda como cuerpo propio', async () => {
    // Si se mandara, el backend creería que hay cuerpo propio y enviaría un correo
    // en blanco en vez del automático.
    form.form.controls.nombre.setValue('R');
    form.form.controls.destinatarios.setValue('a@b.com');
    form.form.controls.cuerpoCorreo.setValue('<p><br></p>');
    await estabilizar();

    form.guardar();

    expect(espia.ultimoInput?.cuerpoCorreo).toBe('');
  });

  it('un cuerpo de correo real sí se manda tal cual', async () => {
    form.form.controls.nombre.setValue('R');
    form.form.controls.destinatarios.setValue('a@b.com');
    form.form.controls.cuerpoCorreo.setValue('<p>Alerta {{nivel}}</p>');
    await estabilizar();

    form.guardar();

    expect(espia.ultimoInput?.cuerpoCorreo).toBe('<p>Alerta {{nivel}}</p>');
  });

  it('una cabecera con valor escrito se manda con el valor', async () => {
    form.form.controls.nombre.setValue('R');
    form.form.controls.accion.setValue('HTTP');
    form.form.controls.url.setValue('https://api.test/alertas');
    form.agregarCabecera();
    form.cabeceras.at(0).patchValue({ nombre: 'Authorization', valor: 'Bearer abc' });
    await estabilizar();

    form.guardar();

    expect(espia.ultimoInput?.cabeceras).toEqual([{ nombre: 'Authorization', valor: 'Bearer abc' }]);
  });

  it('una cabecera ya guardada y sin tocar se manda SIN valor, para conservarlo', async () => {
    // Es el contrato de tres estados: la API no devuelve el valor, así que omitirlo
    // es la única forma de decirle al backend "dejá el que ya tenés".
    form.form.controls.nombre.setValue('R');
    form.form.controls.accion.setValue('HTTP');
    form.form.controls.url.setValue('https://api.test/alertas');
    form.cabeceras.push(form.nuevaCabecera('X-API-Key', true));
    await estabilizar();

    form.guardar();

    expect(espia.ultimoInput?.cabeceras).toEqual([{ nombre: 'X-API-Key' }]);
  });

  it('la plantilla JSON de ejemplo queda como JSON parseable tras sustituir', () => {
    form.form.controls.accion.setValue('HTTP');
    form.usarEjemploJson();

    const plantilla = form.form.controls.cuerpoHttp.value;
    // Mismo reemplazo que hace el backend, con valores de ejemplo.
    const sustituida = plantilla
      .replace(/\{\{nivelEtiqueta\}\}/g, 'Alto')
      .replace(/\{\{ubicacion\}\}/g, 'Barrio Test')
      .replace(/\{\{nivel\}\}/g, '3')
      .replace(/\{\{motivo\}\}/g, 'un motivo');

    expect(() => JSON.parse(sustituida) as unknown).not.toThrow();
    expect((JSON.parse(sustituida) as { nivel: unknown }).nivel).toBe(3);
  });
});
