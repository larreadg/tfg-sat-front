import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnDestroy,
  effect,
  input,
  output,
  untracked,
  viewChild
} from '@angular/core';
import * as L from 'leaflet';
import { colorNivel } from '../etiquetas/nivel-colores';

export interface PuntoMapa {
  lat: number;
  lng: number;
  /** Nivel de criticidad 0–3: define el color del marcador. */
  nivel?: number | null;
  /** HTML del popup (opcional). Debe venir sin PII. */
  popupHtml?: string;
  /**
   * Diferencia el marcador. Por defecto 'reporte'.
   * - `punto_critico`: anillo hueco + su área (lo que la leyenda llama "○").
   * - `area`: SOLO el círculo, sin marcador. Para dibujar un radio que no es un
   *   punto crítico (p. ej. el área de búsqueda de una alerta nacida de un
   *   reporte): usar el anillo ahí mentiría sobre lo que hay en el centro.
   */
  tipo?: 'reporte' | 'punto_critico' | 'area';
  /** Radio del área en metros (para 'punto_critico' y 'area'). */
  radioMetros?: number;
  /** Identificador propio del llamador; se devuelve tal cual en `seleccionar`. */
  id?: number | string;
  /** Número corto dentro del pin (1, 2, 3…). Sin esto el pin es un punto sólido. */
  etiqueta?: string;
  /** Resalta el pin (selección actual) y lo dibuja por encima del resto. */
  destacado?: boolean;
  /** Tooltip nativo del marcador (hover). Debe venir sin PII. */
  titulo?: string;
}

/**
 * Un área dibujada como polígono: hoy, una zona del mapa de riesgo.
 *
 * El `color` lo decide el LLAMADOR y no este componente. La escala de colores de
 * las zonas (`colorCriticidadZona`) es del dominio del mapa de riesgo; meterla
 * acá ataría el wrapper a un modelo concreto, y mañana el mismo polígono puede
 * servir para dibujar un distrito o un área de cobertura.
 */
export interface PoligonoMapa {
  /** Vértices en orden. El cierre es implícito: no se repite el primero. */
  vertices: { lat: number; lng: number }[];
  color: string;
  /**
   * Texto del tooltip al pasar el mouse. Se inserta con `textContent`, nunca
   * como HTML: el nombre de una zona lo escribe un analista (es texto libre).
   */
  titulo?: string;
  /**
   * Trazo discontinuo y relleno casi transparente: para dibujar algo que está
   * pero que no está pesando (una zona desactivada, que no cuenta para F5).
   */
  atenuado?: boolean;
  /** Identificador propio del llamador. No lo usa el componente. */
  id?: number | string;
}

/**
 * Wrapper reusable de Leaflet + OpenStreetMap. Es la ÚNICA excepción a la regla
 * de "solo PrimeNG / colores del tema": Leaflet maneja su propio DOM y sus
 * colores de marcador se definen acá (mapeados a los niveles de criticidad).
 * Reusado por el mini-mapa del detalle de reporte y por el mapa general (Fase E.4).
 */
@Component({
  selector: 'app-leaflet-map',
  template: `<div
    #contenedor
    class="w-full border-round-lg overflow-hidden surface-border border-1"
    [style.height]="altura()"
    role="application"
    [attr.aria-label]="etiquetaAccesible()"
  ></div>`,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class LeafletMap implements AfterViewInit, OnDestroy {
  readonly puntos = input<PuntoMapa[]>([]);
  /**
   * Áreas de contexto (zonas de riesgo). Van en su propia capa, DEBAJO de todo
   * lo demás y sin capturar clicks: son el fondo sobre el que se leen los
   * reportes, no elementos que se seleccionen. Pasar `[]` las apaga.
   */
  readonly poligonos = input<PoligonoMapa[]>([]);
  readonly centro = input<[number, number] | null>(null);
  readonly zoom = input<number>(14);
  readonly altura = input<string>('320px');
  readonly interactivo = input<boolean>(true);
  readonly ajustarAPuntos = input<boolean>(true);
  readonly etiquetaAccesible = input<string>('Mapa de ubicación');
  /** Zoom máximo al encuadrar los puntos. Subirlo separa pines muy cercanos. */
  readonly zoomMaximoAjuste = input<number>(16);
  /** Centra el mapa en estas coordenadas cuando cambian (sin tocar el encuadre inicial). */
  readonly enfocar = input<[number, number] | null>(null);
  /**
   * Zoom mínimo al que se acerca `enfocar`. Sin esto, enfocar un reporte que
   * está dentro de un grupo no muestra nada: el grupo sigue colapsado. `null`
   * mantiene el zoom actual (solo desplaza).
   */
  readonly zoomMinimoEnfoque = input<number | null>(null);
  /**
   * Agrupa los reportes que caen juntos al zoom actual en una sola burbuja con
   * la cantidad, y los abre al acercar. Apagarlo dibuja siempre un pin por
   * reporte (para mapas ya encuadrados sobre un grupo chico, como el detalle
   * de una alerta, donde cada pin tiene que ser identificable).
   */
  readonly agrupar = input<boolean>(true);
  /**
   * Zoom a partir del cual los grupos dejan de dibujarse como burbuja y se
   * abren en sus reportes (repartidos si se taparían entre sí).
   *
   * Existe porque la agrupación por píxeles no puede separar reportes con
   * coordenadas casi idénticas: por más que se acerque, siguen cayendo en el
   * mismo punto, y sin este tope el grupo recién se abría en el zoom MÁXIMO
   * (21). Acá el usuario ve los reportes individuales bastante antes; bajarlo
   * los abre todavía más lejos. Se acota al `maxZoom` real para que siempre
   * sea alcanzable.
   */
  readonly zoomAperturaGrupos = input<number>(17);

  /** Emite el punto clickeado (el mismo objeto que entró por `puntos`). */
  readonly seleccionar = output<PuntoMapa>();

  private readonly contenedor = viewChild.required<ElementRef<HTMLDivElement>>('contenedor');

  private mapa?: L.Map;
  private capaMarcadores?: L.LayerGroup;
  /** Capa propia: prenderla o apagarla no toca ni redibuja los marcadores. */
  private capaPoligonos?: L.LayerGroup;
  private observadorTamano?: ResizeObserver;

  /** Centro por defecto cuando no hay puntos ni centro explícito (Asunción, PY). */
  private static readonly CENTRO_POR_DEFECTO: [number, number] = [-25.2867, -57.3333];

  /** px: dos marcadores más cerca que esto se tapan entre sí y hay que repartirlos. */
  private static readonly UMBRAL_SOLAPE_PX = 26;

  /** px: reportes más cerca que esto se muestran como un solo grupo. */
  private static readonly UMBRAL_AGRUPACION_PX = 34;

  /** Tope de pasadas de la relajación de solapes (converge mucho antes). */
  private static readonly MAX_PASADAS_REPARTO = 30;

  /** A partir de acá no se reparte: el costo por pasada es O(n²). */
  private static readonly MAX_PUNTOS_REPARTO = 400;

  /** Color de la línea que ata un marcador repartido a su ubicación real. */
  private static readonly COLOR_GUIA = '#94a3b8';

  constructor() {
    effect(() => {
      const puntos = this.puntos();
      if (this.mapa && this.capaMarcadores) {
        this.dibujarMarcadores(puntos);
      }
    });

    effect(() => {
      const poligonos = this.poligonos();
      if (this.mapa && this.capaPoligonos) {
        this.dibujarPoligonos(poligonos);
      }
    });

    effect(() => {
      const destino = this.enfocar();
      if (!destino || !this.mapa) {
        return;
      }
      const minimo = this.zoomMinimoEnfoque();
      if (minimo != null && this.mapa.getZoom() < minimo) {
        this.mapa.setView(destino, minimo);
      } else {
        this.mapa.panTo(destino);
      }
    });
  }

  ngAfterViewInit(): void {
    const centroInicial = this.centro() ?? this.centroDePuntos() ?? LeafletMap.CENTRO_POR_DEFECTO;
    const interactivo = this.interactivo();

    this.mapa = L.map(this.contenedor().nativeElement, {
      center: centroInicial,
      zoom: this.zoom(),
      scrollWheelZoom: interactivo,
      dragging: interactivo,
      touchZoom: interactivo,
      doubleClickZoom: interactivo,
      boxZoom: interactivo,
      keyboard: interactivo,
      zoomControl: interactivo,
      attributionControl: true
    });

    // `maxNativeZoom` es hasta donde hay tiles; `maxZoom` deja seguir acercando
    // (tiles escaladas) para poder abrir grupos de reportes casi superpuestos.
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap',
      maxNativeZoom: 19,
      maxZoom: 21
    }).addTo(this.mapa);

    // Los polígonos se agregan ANTES que los marcadores: en Leaflet, el orden de
    // alta define el orden de pintado dentro del mismo pane, así que al revés un
    // relleno de zona taparía los pines.
    this.capaPoligonos = L.layerGroup().addTo(this.mapa);
    this.dibujarPoligonos(this.poligonos());

    this.capaMarcadores = L.layerGroup().addTo(this.mapa);
    this.dibujarMarcadores(this.puntos());

    // El reparto de solapados depende del zoom: al cambiarlo hay que rehacerlo
    // (sin volver a encuadrar, o se pelearía con el zoom que eligió el usuario).
    this.mapa.on('zoomend', () => this.dibujarMarcadores(this.puntos(), false));

    // El contenedor puede haberse medido antes de tener tamaño final.
    setTimeout(() => this.mapa?.invalidateSize(), 0);

    // Y puede cambiar después: dentro de un diálogo que se abre o se maximiza,
    // Leaflet queda con el tamaño viejo y las tiles aparecen cortadas.
    this.observadorTamano = new ResizeObserver(() => this.mapa?.invalidateSize());
    this.observadorTamano.observe(this.contenedor().nativeElement);
  }

  ngOnDestroy(): void {
    this.observadorTamano?.disconnect();
    this.observadorTamano = undefined;
    this.mapa?.remove();
    this.mapa = undefined;
    this.capaMarcadores = undefined;
    this.capaPoligonos = undefined;
  }

  /**
   * @param ajustarVista encuadra el mapa sobre los puntos. Se apaga al redibujar
   *   por zoom: ahí solo se recalculan los grupos, sin mover la vista.
   */
  private dibujarMarcadores(puntos: PuntoMapa[], ajustarVista = true): void {
    if (!this.mapa || !this.capaMarcadores) {
      return;
    }
    this.capaMarcadores.clearLayers();

    // Las áreas van primero: son contexto y tienen que quedar debajo de todo.
    for (const punto of puntos.filter((p) => p.tipo === 'area')) {
      this.dibujarArea(punto);
    }

    // Los puntos críticos no se agrupan ni se mueven: su marcador esta atado al
    // círculo del área que dibujan.
    for (const punto of puntos.filter((p) => p.tipo === 'punto_critico')) {
      this.dibujarPuntoCritico(punto);
    }

    const reportes = puntos.filter((p) => p.tipo !== 'punto_critico' && p.tipo !== 'area');
    if (this.agrupar()) {
      this.dibujarReportesAgrupados(reportes);
    } else {
      const posiciones = this.repartirSolapados(reportes);
      reportes.forEach((punto, indice) => this.dibujarReporte(punto, posiciones[indice]));
    }

    if (!ajustarVista || this.centro()) {
      return;
    }
    // Sin puntos que encuadrar, se encuadra sobre las áreas: con los filtros
    // puestos puede no haber ningún reporte, y en ese caso mostrar las zonas de
    // riesgo es más útil que caer al centro por defecto del país.
    //
    // `untracked`: este effect es el de `puntos`. Si leyera `poligonos()` de
    // forma reactiva, prender o apagar el check de zonas volvería a encuadrar el
    // mapa y le movería la vista al usuario sin que la haya pedido.
    const limites = this.limitesDe(puntos) ?? this.limitesDePoligonos(untracked(() => this.poligonos()));
    if (!limites) {
      return;
    }
    // Un solo punto sin área: no hay nada que encuadrar, se centra y listo.
    if (limites.getNorthEast().equals(limites.getSouthWest())) {
      this.mapa.setView(limites.getCenter(), this.zoom());
    } else if (this.ajustarAPuntos()) {
      this.mapa.fitBounds(limites, { padding: [32, 32], maxZoom: this.zoomMaximoAjuste() });
    }
  }

  /**
   * Encuadre que contempla el RADIO, no solo los centros: un área encuadrada por
   * su centro se sale de la vista y el usuario ve un círculo cortado (o no lo ve).
   */
  private limitesDe(puntos: PuntoMapa[]): L.LatLngBounds | null {
    let limites: L.LatLngBounds | null = null;

    for (const punto of puntos) {
      const centro = L.latLng(punto.lat, punto.lng);
      const propios = punto.radioMetros
        ? centro.toBounds(punto.radioMetros * 2)
        : L.latLngBounds(centro, centro);
      limites = limites ? limites.extend(propios) : propios;
    }

    return limites;
  }

  /**
   * Redibuja las áreas desde cero. El volumen es de decenas (las zonas de riesgo
   * se cargan a mano), así que no hay nada que diffear.
   *
   * Las áreas quedan interactivas (no se les pone `interactive: false`) para que
   * el tooltip con el nombre funcione: sin hover no hay tooltip. Eso NO les roba
   * los clicks a los reportes, porque Leaflet dibuja los polígonos en el
   * `overlayPane` (z-index 400) y los marcadores en el `markerPane` (600): un
   * click sobre un pin que cae adentro de una zona llega al pin. Un click sobre
   * el área vacía no hace nada, que es lo correcto — acá la zona no se edita (eso
   * es la pantalla Zonas de riesgo), solo se mira.
   */
  private dibujarPoligonos(poligonos: PoligonoMapa[]): void {
    if (!this.capaPoligonos) {
      return;
    }
    this.capaPoligonos.clearLayers();

    for (const poligono of poligonos) {
      // Menos de tres vértices no encierra nada: Leaflet dibujaría una línea
      // suelta que se lee como un error del mapa.
      if (poligono.vertices.length < 3) {
        continue;
      }

      const capa = L.polygon(
        poligono.vertices.map((vertice) => [vertice.lat, vertice.lng] as [number, number]),
        {
          color: poligono.color,
          weight: 2,
          fillColor: poligono.color,
          fillOpacity: poligono.atenuado ? 0.05 : 0.18,
          dashArray: poligono.atenuado ? '6 6' : undefined
        }
      );

      if (poligono.titulo) {
        // El tooltip va como ELEMENTO y no como string: `bindTooltip` con string
        // hace `innerHTML = content`, y el nombre de una zona es texto libre que
        // escribió un analista. Con `textContent` no hay markup que interpretar.
        const tooltip = document.createElement('span');
        tooltip.textContent = poligono.titulo;
        capa.bindTooltip(tooltip, { sticky: true });
      }

      capa.addTo(this.capaPoligonos);
    }
  }

  /** Rectángulo que envuelve a todas las áreas. `null` si no hay ninguna. */
  private limitesDePoligonos(poligonos: PoligonoMapa[]): L.LatLngBounds | null {
    let limites: L.LatLngBounds | null = null;

    for (const poligono of poligonos) {
      for (const vertice of poligono.vertices) {
        const punto = L.latLng(vertice.lat, vertice.lng);
        limites = limites ? limites.extend(punto) : L.latLngBounds(punto, punto);
      }
    }

    return limites;
  }

  /** Círculo del área, sin marcador. `interactive: false`: no se come los clicks. */
  private dibujarArea(punto: PuntoMapa): void {
    if (!punto.radioMetros) {
      return;
    }
    const color = this.colorNivel(punto.nivel);
    L.circle([punto.lat, punto.lng], {
      radius: punto.radioMetros,
      color,
      weight: 1,
      fillColor: color,
      fillOpacity: 0.12,
      interactive: false
    }).addTo(this.capaMarcadores!);
  }

  /** Área afectada (círculo) + anillo hueco en el centro del clúster. */
  private dibujarPuntoCritico(punto: PuntoMapa): void {
    const color = this.colorNivel(punto.nivel);
    this.dibujarArea(punto);

    const marcador = L.marker([punto.lat, punto.lng], {
      icon: this.iconoPuntoCritico(color),
      zIndexOffset: this.zIndexDe(punto)
    });
    if (punto.popupHtml) {
      marcador.bindPopup(punto.popupHtml);
    }
    marcador.on('click', () => this.seleccionar.emit(punto));
    marcador.addTo(this.capaMarcadores!);
  }

  /**
   * Dibuja los reportes agrupando los que caen juntos al zoom actual: un grupo
   * es UNA burbuja en el promedio de sus posiciones, con la cantidad adentro y
   * el color del nivel más alto del grupo. Al acercar el zoom los grupos se
   * parten solos (se recalcula en cada `zoomend`) hasta mostrar cada reporte.
   *
   * Es el reemplazo de repartir los pines alrededor: correrlos tenía sentido
   * cerca, pero de lejos pintaba reportes del mismo lugar como si estuvieran a
   * kilómetros. El corrimiento queda para cuando ya se está mirando el lugar
   * (`zoomAperturaGrupos`), que es donde separar deja de mentir sobre la
   * ubicación y empieza a ser la única forma de ver cada reporte.
   */
  private dibujarReportesAgrupados(reportes: PuntoMapa[]): void {
    const mapa = this.mapa!;
    const apertura = Math.min(this.zoomAperturaGrupos(), mapa.getMaxZoom());
    const abrirGrupos = mapa.getZoom() >= apertura;

    for (const grupo of this.agruparPorPixeles(reportes)) {
      if (grupo.length === 1) {
        this.dibujarReporte(grupo[0], L.latLng(grupo[0].lat, grupo[0].lng));
        continue;
      }

      if (abrirGrupos) {
        const posiciones = this.repartirSolapados(grupo);
        grupo.forEach((punto, indice) => this.dibujarReporte(punto, posiciones[indice]));
        continue;
      }

      const centro = this.centroideDe(grupo);
      const nivelMaximo = grupo.reduce((max, p) => Math.max(max, p.nivel ?? 0), 0);
      const marcador = L.marker(centro, {
        icon: this.iconoGrupo(this.colorNivel(nivelMaximo), grupo.length),
        title: `${grupo.length} reportes acá — tocá para acercar`
      });
      // Un grupo no es un reporte: no emite selección, acerca hasta abrirlo.
      marcador.on('click', () => {
        const limites = L.latLngBounds(grupo.map((p) => [p.lat, p.lng] as L.LatLngTuple));
        mapa.flyToBounds(limites, { padding: [48, 48], maxZoom: mapa.getMaxZoom() });
      });
      marcador.addTo(this.capaMarcadores!);
    }
  }

  private dibujarReporte(punto: PuntoMapa, posicion: L.LatLng): void {
    const color = this.colorNivel(punto.nivel);

    // Si el marcador se corrió para no taparse, una línea lo ata a su ubicación
    // real: el mapa separa los pines pero no miente sobre dónde están.
    if (!posicion.equals([punto.lat, punto.lng])) {
      L.polyline([[punto.lat, punto.lng], posicion], {
        color: LeafletMap.COLOR_GUIA,
        weight: 1,
        opacity: 0.8,
        dashArray: '2,3',
        interactive: false
      }).addTo(this.capaMarcadores!);
    }

    const destacado = punto.destacado === true;
    const marcador = L.marker(posicion, {
      icon: punto.etiqueta
        ? this.iconoNumerado(color, punto.etiqueta, destacado)
        : this.iconoReporte(color, destacado),
      zIndexOffset: this.zIndexDe(punto),
      title: punto.titulo ?? (punto.etiqueta ? `Reporte ${punto.etiqueta}` : undefined)
    });
    if (punto.popupHtml) {
      marcador.bindPopup(punto.popupHtml);
    }
    marcador.on('click', () => this.seleccionar.emit(punto));
    marcador.addTo(this.capaMarcadores!);
  }

  /**
   * Agrupación greedy por cercanía en píxeles al zoom actual: cada punto entra
   * al primer grupo cuyo centro esté a menos de `UMBRAL_AGRUPACION_PX`, o abre
   * uno nuevo. Depende del zoom, así que al acercar los grupos se parten.
   */
  private agruparPorPixeles(puntos: PuntoMapa[]): PuntoMapa[][] {
    const mapa = this.mapa;
    if (!mapa || puntos.length < 2) {
      return puntos.map((punto) => [punto]);
    }

    const zoom = mapa.getZoom();
    const umbral = LeafletMap.UMBRAL_AGRUPACION_PX;
    const grupos: { centro: L.Point; miembros: PuntoMapa[] }[] = [];

    for (const punto of puntos) {
      const px = mapa.project([punto.lat, punto.lng], zoom);
      const grupo = grupos.find((g) => g.centro.distanceTo(px) < umbral);
      if (!grupo) {
        grupos.push({ centro: px, miembros: [punto] });
        continue;
      }
      grupo.miembros.push(punto);
      // Centro incremental: el grupo se corre al promedio de lo que ya tiene.
      const cantidad = grupo.miembros.length;
      grupo.centro = L.point(
        grupo.centro.x + (px.x - grupo.centro.x) / cantidad,
        grupo.centro.y + (px.y - grupo.centro.y) / cantidad
      );
    }

    return grupos.map((g) => g.miembros);
  }

  /** Promedio de las coordenadas del grupo: dónde se dibuja su burbuja. */
  private centroideDe(puntos: PuntoMapa[]): L.LatLng {
    const suma = puntos.reduce((acc, p) => ({ lat: acc.lat + p.lat, lng: acc.lng + p.lng }), { lat: 0, lng: 0 });
    return L.latLng(suma.lat / puntos.length, suma.lng / puntos.length);
  }

  /**
   * Orden de apilado. Leaflet apila por latitud, así que sin esto un marcador
   * de punto crítico puede tapar por completo a un reporte que esté a metros
   * (el centroide del clúster cae, por definición, entre sus reportes) y el
   * mapa muestra un nivel de menos. El punto crítico es contexto: siempre debajo.
   */
  private zIndexDe(punto: PuntoMapa): number {
    if (punto.destacado) {
      return 1000;
    }
    return punto.tipo === 'punto_critico' ? -1000 : 0;
  }

  /**
   * Devuelve la posición de DIBUJO de cada reporte, separando a los que se
   * taparían entre sí al zoom actual: varios reportes del mismo lugar caen a
   * pocos píxeles y los de abajo se vuelven invisibles, así que el mapa muestra
   * menos reportes (y menos niveles) de los que hay.
   *
   * Es una relajación de colisiones en píxeles: mientras haya un par a menos de
   * `UMBRAL_SOLAPE_PX`, se empujan mutuamente la mitad de lo que se solapan.
   * Converge en pocas pasadas, deja a cada marcador lo más cerca posible de su
   * lugar real y no mueve nada cuando no hay solape.
   *
   * Con `agrupar` activo esto corre a partir de `zoomAperturaGrupos`; con
   * `agrupar` apagado es el mecanismo principal, pensado para mapas ya
   * encuadrados sobre un grupo chico.
   */
  private repartirSolapados(puntos: PuntoMapa[]): L.LatLng[] {
    const posiciones = puntos.map((p) => L.latLng(p.lat, p.lng));
    const mapa = this.mapa;
    // Con muchísimos puntos el reparto deja de tener sentido (y cuesta O(n²) por
    // pasada): se dibujan en su lugar real.
    if (!mapa || puntos.length < 2 || puntos.length > LeafletMap.MAX_PUNTOS_REPARTO) {
      return posiciones;
    }

    const zoom = mapa.getZoom();
    const original = posiciones.map((p) => mapa.project(p, zoom));
    const px = original.map((p) => p.clone());
    const minimo = LeafletMap.UMBRAL_SOLAPE_PX;

    for (let pasada = 0; pasada < LeafletMap.MAX_PASADAS_REPARTO; pasada++) {
      let huboSolape = false;

      for (let a = 0; a < px.length; a++) {
        for (let b = a + 1; b < px.length; b++) {
          let dx = px[b].x - px[a].x;
          let dy = px[b].y - px[a].y;
          let distancia = Math.sqrt(dx * dx + dy * dy);
          if (distancia >= minimo - 0.5) {
            continue;
          }
          huboSolape = true;

          if (distancia < 0.001) {
            // Coordenadas idénticas: se abren en un ángulo distinto cada una
            // (ángulo áureo) para que el reparto quede parejo y determinista.
            const angulo = (a + 1) * 2.39996;
            dx = Math.cos(angulo);
            dy = Math.sin(angulo);
            distancia = 1;
          }

          const empuje = (minimo - distancia) / 2 / distancia;
          px[a] = L.point(px[a].x - dx * empuje, px[a].y - dy * empuje);
          px[b] = L.point(px[b].x + dx * empuje, px[b].y + dy * empuje);
        }
      }

      if (!huboSolape) {
        break;
      }
    }

    posiciones.forEach((_, indice) => {
      // Solo se reemplaza lo que realmente se movió: así el marcador sin solape
      // conserva su posición exacta (y no le dibujamos línea guía).
      if (px[indice].distanceTo(original[indice]) > 0.5) {
        posiciones[indice] = mapa.unproject(px[indice], zoom);
      }
    });

    return posiciones;
  }

  /** Compartido con los gráficos del panel: ver `shared/etiquetas/nivel-colores.ts`. */
  private colorNivel(nivel: number | null | undefined): string {
    return colorNivel(nivel);
  }

  /**
   * Marcador de reporte: punto sólido. `destacado` le suma un halo del mismo
   * color: es la única señal de "este es el que estás mirando" cuando el pin no
   * lleva número (la lista del detalle de alerta se ata al mapa por acá).
   */
  private iconoReporte(color: string, destacado = false): L.DivIcon {
    const lado = destacado ? 22 : 18;
    const halo = destacado ? `,0 0 0 6px ${color}55` : '';
    return L.divIcon({
      className: 'marcador-nivel',
      html: `<span style="display:block;width:${lado}px;height:${lado}px;border-radius:50%;background:${color};border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.4)${halo}"></span>`,
      iconSize: [lado, lado],
      iconAnchor: [lado / 2, lado / 2],
      popupAnchor: [0, -(lado / 2 + 2)]
    });
  }

  /**
   * Burbuja de un grupo de reportes: la cantidad adentro y el color del nivel
   * más alto del grupo (lo que importa para priorizar es el peor caso).
   */
  private iconoGrupo(color: string, cantidad: number): L.DivIcon {
    const lado = cantidad > 9 ? 36 : 32;
    return L.divIcon({
      className: 'marcador-nivel',
      html: `<span style="display:flex;align-items:center;justify-content:center;width:${lado}px;height:${lado}px;border-radius:50%;background:${color};border:2px solid #fff;box-shadow:0 0 0 5px ${color}40,0 1px 5px rgba(0,0,0,.4);color:#fff;font:700 13px/1 system-ui,sans-serif">${cantidad}</span>`,
      iconSize: [lado, lado],
      iconAnchor: [lado / 2, lado / 2],
      popupAnchor: [0, -(lado / 2 + 2)]
    });
  }

  /**
   * Marcador con número adentro (pin de un reporte dentro de un grupo). El
   * número lo asigna el backend (`orden`) y es lo que ata el pin a su código en
   * la lista lateral: el código completo no entra en un marcador.
   */
  private iconoNumerado(color: string, etiqueta: string, destacado: boolean): L.DivIcon {
    const lado = destacado ? 32 : 26;
    const anillo = destacado ? `,0 0 0 5px ${color}55` : '';
    return L.divIcon({
      className: 'marcador-nivel',
      html: `<span style="display:flex;align-items:center;justify-content:center;width:${lado}px;height:${lado}px;border-radius:50%;background:${color};border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.45)${anillo};color:#fff;font:700 ${destacado ? 14 : 12}px/1 system-ui,sans-serif">${etiqueta}</span>`,
      iconSize: [lado, lado],
      iconAnchor: [lado / 2, lado / 2],
      popupAnchor: [0, -(lado / 2 + 2)]
    });
  }

  /**
   * Marcador de punto crítico: anillo HUECO. Relleno se confundía con un reporte
   * más (y se contaba como tal en el mapa); hueco coincide con lo que dice la
   * leyenda — "● reporte · ○ punto crítico".
   */
  private iconoPuntoCritico(color: string): L.DivIcon {
    // Más grande que la burbuja de grupo (32-36 px) a propósito: el centro del
    // punto crítico y el centro del grupo de sus reportes caen casi en el mismo
    // lugar, así el anillo enmarca la burbuja en vez de pelearse con ella.
    return L.divIcon({
      className: 'marcador-nivel',
      html: `<span style="display:block;width:44px;height:44px;border-radius:50%;background:transparent;border:3px solid ${color};box-shadow:0 0 0 2px #ffffffaa inset,0 0 0 2px #ffffffaa"></span>`,
      iconSize: [44, 44],
      iconAnchor: [22, 22],
      popupAnchor: [0, -24]
    });
  }

  private centroDePuntos(): [number, number] | null {
    const puntos = this.puntos();
    if (puntos.length === 0) {
      return null;
    }
    const suma = puntos.reduce((acc, p) => ({ lat: acc.lat + p.lat, lng: acc.lng + p.lng }), { lat: 0, lng: 0 });
    return [suma.lat / puntos.length, suma.lng / puntos.length];
  }
}
