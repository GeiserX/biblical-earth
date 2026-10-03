/* biblical-atlas · mapa: MapLibre, relieve antiguo y actual en cuatro extensiones (mundo, Mediterráneo, Israel,
   Jerusalén), cortina, rutas de todos los viajes, arcos de cartas con un color por escritor, lugares inciertos como zonas
   y candidatos, hallazgos, marcas de lugar con nombre por época, filtradas por fecha y agrupadas, marcador de Pablo,
   etiquetas sin solapes, capas y filtros guardados en la dirección, nombres del encuadre, mapa de situación, leyenda y
   tarjeta «Mientras tanto».
   Dueño durante el reparto: app-mapa. Interfaz fija para los demás: BE.mapa.resaltar(ids) y BE.mapa.encuadrar(ids). */
'use strict';
(() => {
const BE = window.BE;
const { E, sucio, programar, esc, $, clamp, tramo, fechaCorta, mercY, latDeY, ES_FILE, seleccionar, setT, asegurarVisible, guardarHash, avisar } = BE;

// ---------------------------------------------------------------------------
// Mapas base: cuatro extensiones del kit reproyectadas a Web Mercator (ver site/README.md). De menos a más detalle:
// el mundo bíblico siempre; el Mediterráneo, la tierra de Israel y Jerusalén aparecen al acercarse, encima del anterior.
// El mundo cubre todos los lugares y zonas candidatas con margen, y el mapa no deja salir de él (maxBounds). Llega hasta
// 40° S para que en el móvil, con la hoja abierta, las zonas de Ofir quepan por encima de ella sin ver el borde.
// ---------------------------------------------------------------------------
const BASES = [
  { id: 'mundo', ext: { oeste: -20, este: 100, sur: -40, norte: 58 }, zoom: null },
  { id: 'mediterraneo', ext: { oeste: 10, este: 44, sur: 28, norte: 44 }, zoom: [4.3, 5] },
  { id: 'israel', ext: { oeste: 33.9, este: 36.9, sur: 29.4, norte: 33.7 }, zoom: [6.7, 7.4] },
  { id: 'jerusalen', ext: { oeste: 35.10, este: 35.36, sur: 31.68, norte: 31.86 }, zoom: [10, 10.8] },
];
const esquinas = (e) => [[e.oeste, e.norte], [e.este, e.norte], [e.este, e.sur], [e.oeste, e.sur]];
const urlBase = (b, estilo) => `maps/${b.id}-${estilo}.webp`;
const opacidadGL = (b) => (b.zoom ? ['interpolate', ['linear'], ['zoom'], b.zoom[0], 0, b.zoom[1], 1] : 1);
const opacidadEn = (b, z) => (b.zoom ? clamp((z - b.zoom[0]) / (b.zoom[1] - b.zoom[0]), 0, 1) : 1);
const MUNDO = BASES[0].ext;
// El mapa de situación (maps/mundo-mini.webp) se queda en el norte: al sur de 8° S solo habría mar y el sur de África.
const MINI = { oeste: -20, este: 100, sur: -8, norte: 58 };
const ZOOM_MAX = 14;                  // alrededor de Jerusalén el relieve propio aguanta hasta aquí
const ESTILO_ACTUAL = 'https://tiles.openfreemap.org/styles/positron';
// Lo que las licencias piden ver en el mapa. La lista completa, con cada licencia, está en acerca.html#gracias.
// OpenFreeMap, OpenMapTiles y OpenStreetMap los añade MapLibre por su cuenta cuando se ve el mapa actual.
const ATRIBUCION = 'Coordenadas: <a href="https://www.openbible.info/geo/" target="_blank" rel="noopener">OpenBible.info</a> (<a href="https://creativecommons.org/licenses/by/4.0/deed.es" target="_blank" rel="noopener">CC BY 4.0</a>) · Relieve: Natural Earth, USGS, NOAA, Copernicus, Mapzen · <a href="acerca.html#gracias">Créditos</a>';
const MAYORES = new Set(['roma', 'jerusalen', 'antioquia-de-siria', 'efeso', 'corinto', 'atenas', 'filipos', 'tesalonica', 'babilonia']);
const REGION = new Set(['region', 'provincia', 'pais', 'reino', 'desierto', 'llanura', 'valle']);
const AGUA = new Set(['mar', 'lago', 'rio']);
const estrecha = () => matchMedia('(max-width: 760px)').matches;
let map = null, mapaListo = false, capasBase = [], estiloReserva = false;

const ENCUADRE_INICIAL = [[19.2, 34.0], [37.2, 42.2]];
let resaltadoMapa = null;           // Set de ids que pide BE.mapa.resaltar; null: manda la selección

const OCULTAR_EN_ACTUAL = /^(highway|road_|airport|label_other|label_village|label_town|label_city|label_state|poi|housenumber|aeroway|building)/;
const marcasLugar = new Map();       // id → { marker, el, l, clase, hoy }
const marcasCarta = new Map();       // clave de arco → { marker, el }
const marcasCand = new Map();        // 'lugar|i' o 'lugar|' (rótulo de la zona) → { marker, el }
const marcasHallazgo = new Map();    // lugar → { marker, el }
const marcasViajero = new Map();     // persona → { marker, el }
const marcasGrupo = [];              // burbujas de agrupación
let marcaPablo = null, marcaProxima = null;
let imgsDom = [];                    // desde file://: [{ img, base }]
let cortina = null;                  // [{ base, canvas, ctx, img, fuente }]

// ---------------------------------------------------------------------------
// Capas y filtros (M-20, M-03, C-03, C-09): se guardan en la dirección
// ---------------------------------------------------------------------------
const CAPAS = [
  ['viajes', 'Viajes'], ['cartas', 'Cartas'], ['inciertos', 'Lugares inciertos'], ['hallazgos', 'Hallazgos'],
  ['pendientes', 'Datos sin verificar'], ['relieve', 'Relieve'],
];
const NOMBRES = [['ambos', 'Los dos donde ayuda'], ['antiguos', 'Solo antiguos'], ['actuales', 'Solo actuales']];
const FILTRO_CARTAS = [['cerca', 'Cerca de esta fecha'], ['hasta', 'Escritas hasta esta fecha'], ['todas', 'Todas'], ['personas', 'Solo a personas']];
const F = BE.filtros = { capas: Object.fromEntries(CAPAS.map(([k]) => [k, true])), nombres: 'ambos', nivel1: false, cartas: 'cerca' };
BE.parametros.push(
  { nombre: 'ocultas', escribir: () => CAPAS.filter(([k]) => !F.capas[k]).map(([k]) => k).join(','), leer: (v) => { const off = new Set(String(v || '').split(',')); for (const [k] of CAPAS) F.capas[k] = !off.has(k); filtrosCambiados(false); } },
  { nombre: 'nombres', escribir: () => (F.nombres === 'ambos' ? null : F.nombres), leer: (v) => { F.nombres = NOMBRES.some(([k]) => k === v) ? v : 'ambos'; filtrosCambiados(false); } },
  { nombre: 'nivel', escribir: () => (F.nivel1 ? '1' : null), leer: (v) => { F.nivel1 = v === '1'; filtrosCambiados(false); } },
  { nombre: 'cartas', escribir: () => (F.cartas === 'cerca' ? null : F.cartas), leer: (v) => { F.cartas = FILTRO_CARTAS.some(([k]) => k === v) ? v : 'cerca'; filtrosCambiados(false); } },
);
/** Tras cambiar un filtro: repinta el mapa, la ficha y el menú, y lo guarda en la dirección. */
function filtrosCambiados(guardar = true) {
  pintarMapa.claveCartas = null; claveInciertos = ''; pintarLeyenda.clave = null; pintarHallazgos.clave = null;
  sucio.mapa = sucio.etiquetas = true;
  if (mapaListo) aplicarRelieve();
  pintarMenuCapas();
  if (guardar) { BE.pintarPanel(true); guardarHash(); }
  programar();
}

// ---------------------------------------------------------------------------
// Colores calculados (D-09): viajes por persona y orden, cartas por escritor. Tonos con claridad distinta y
// nunca solos: lo incierto va rayado o discontinuo, lo pendiente con borde de trazos. Las listas viven en
// site/kit/tokens.css (--viajes, --cartas) y se leen una vez al cargar; la de aquí es la misma, por si falta el CSS.
// ---------------------------------------------------------------------------
const cssVar = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
const leerLista = (v, def) => { const s = cssVar(v); return s ? s.split(/\s*,\s*/) : def; };
const PALETA = leerLista('--viajes', ['#b34962', '#357589', '#805da8', '#6b445c', '#a75733', '#2f5085', '#756f19', '#654b2f', '#803b37', '#91615b']);
const PALETA_ESCRITOR = leerLista('--cartas', ['#1f3b30', '#b34962', '#a75733', '#805da8', '#6b445c', '#756f19', '#2f5085']);
const hash = (s) => [...String(s)].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
const claveFecha = (f) => [f?.desde ?? 1e6, f?.hasta ?? 1e6];
let coloresViaje = null, coloresEscritor = null;
/** Pablo lleva un color por viaje, en orden. Cualquier otra persona, un solo color para todos sus viajes, distinto del
    de las personas (y de los viajes de Pablo) cuyos viajes se dibujan a la vez que alguno de los suyos: así, con Saúl,
    David y Samuel en el mapa, cada color es una persona. Se reparte por orden de su primer viaje; si las diez tintas
    están cogidas, repite la suya de siempre. */
function calcularColores() {
  coloresViaje = new Map();
  const porPersona = new Map();
  for (const v of BE.D.viajes) { const p = BE.duenoViaje(v); if (!porPersona.has(p)) porPersona.set(p, []); porPersona.get(p).push(v); }
  const orden = (a, b) => claveFecha(a.fecha)[0] - claveFecha(b.fecha)[0] || claveFecha(a.fecha)[1] - claveFecha(b.fecha)[1] || a.id.localeCompare(b.id);
  // Toda la fecha de cada viaje, con un año de margen: contiene la ventana en que la capa «Viajes» lo dibuja (viajeEnEpoca).
  const tramoDibujo = (v) => { const tr = tramo(v.fecha); return tr ? [tr[0], tr[1] + 1] : null; };
  const ocupados = [];   // [tramo, índice de la tinta]
  (porPersona.get('pablo') || []).sort(orden).forEach((v, i) => {
    coloresViaje.set(v.id, PALETA[i % PALETA.length]);
    const tr = tramoDibujo(v);
    if (tr) ocupados.push([tr, i % PALETA.length]);
  });
  const otras = [...porPersona.entries()].filter(([p]) => p !== 'pablo').map(([p, vs]) => [p, vs.sort(orden)])
    .sort((a, b) => orden(a[1][0], b[1][0]) || a[0].localeCompare(b[0]));
  for (const [p, vs] of otras) {
    const trs = vs.map(tramoDibujo).filter(Boolean);
    const cogidas = new Set(ocupados.filter(([t]) => trs.some((x) => x[0] < t[1] && t[0] < x[1])).map(([, k]) => k));
    const propia = 3 + (hash(p) % (PALETA.length - 3));
    let k = propia;
    for (let d = 0; d < PALETA.length; d++) { const c = (propia + d) % PALETA.length; if (!cogidas.has(c)) { k = c; break; } }
    vs.forEach((v) => coloresViaje.set(v.id, PALETA[k]));
    trs.forEach((tr) => ocupados.push([tr, k]));
  }
  // Escritores por la fecha de su primera carta; Pablo, el primero, lleva el color del tiempo (--gold), como el cursor.
  coloresEscritor = new Map();
  const primera = new Map();
  for (const c of BE.D.cartas) { const e = c.escritor || 'pablo'; const d = claveFecha(c.fecha)[0]; if (!primera.has(e) || d < primera.get(e)) primera.set(e, d); }
  [...primera.entries()].sort((a, b) => (a[0] === 'pablo' ? -1 : b[0] === 'pablo' ? 1 : a[1] - b[1] || a[0].localeCompare(b[0])))
    .forEach(([e], i) => coloresEscritor.set(e, PALETA_ESCRITOR[i % PALETA_ESCRITOR.length]));
}
const colorViaje = (id) => { if (!coloresViaje) calcularColores(); return coloresViaje.get(id) || PALETA[0]; };
// Pablo (el primer escritor) lleva el color del tiempo: se lee de --gold cada vez que cambian las clases de la raíz,
// así en el modo reunión sus cartas vuelven al oro como el cursor.
let oroClase = null, oroValor = null;
const oro = () => { const k = document.documentElement.className; if (k !== oroClase) { oroClase = k; oroValor = cssVar('--gold') || PALETA_ESCRITOR[0]; } return oroValor; };
const colorEscritor = (id) => { if (!coloresEscritor) calcularColores(); const c = coloresEscritor.get(id || 'pablo'); return !c || c === PALETA_ESCRITOR[0] ? oro() : c; };
const colorPersona = (id) => { const v = BE.D.viajes.find((x) => BE.duenoViaje(x) === id); return v ? colorViaje(v.id) : PALETA[hash(id) % PALETA.length]; };
/** Mezcla un color con el gris del papel: el rastro de un viaje ya hecho (M-09). */
function apagar(hex, f = 0.5) {
  const n = parseInt(hex.slice(1), 16), g = [0x9a, 0x90, 0x83];
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((x, i) => Math.round(x * (1 - f) + g[i] * f));
  return `#${c.map((x) => x.toString(16).padStart(2, '0')).join('')}`;
}

// ---------------------------------------------------------------------------
// Estados de los candidatos de ubicación (M-10, M-11, C-07): color y patrón
// ---------------------------------------------------------------------------
const CAND = {
  seguro: { color: cssVar('--tier1') || '#2f5d50', rotulo: 'Seguro', corto: 'seguro', trazo: 'solido' },
  favorecido_nivel_1: { color: '#7a5c8e', rotulo: 'Favorecido por la fuente principal', corto: 'favorecido', trazo: 'raya' },
  tradicion: { color: '#86601c', rotulo: 'Tradición que cita la fuente principal', corto: 'tradición', trazo: 'raya' },
  alternativa: { color: '#8a8295', rotulo: 'Otra propuesta que cita la fuente principal', corto: 'otra propuesta', trazo: 'raya' },
  solo_nivel_2: { color: '#86601c', rotulo: 'Solo lo propone otra fuente', corto: 'solo otra fuente', trazo: 'punto' },
  descartado_nivel_1: { color: '#7b6f60', rotulo: 'Descartado por la fuente principal', corto: 'descartado', trazo: 'punto' },
};
const candidatosDe = (l) => (Array.isArray(l?.candidatos) ? l.candidatos : null);
/** Candidatos que se ven con los filtros actuales, con su índice original. */
const candidatosVisibles = (l) => (candidatosDe(l) || []).map((c, i) => ({ c, i })).filter(({ c }) => !(F.nivel1 && c.estado === 'solo_nivel_2'));
let candFoco = null;                 // { lugar, i }

// ---------------------------------------------------------------------------
// Creación del mapa
// ---------------------------------------------------------------------------
function crearMapa() {
  map = new maplibregl.Map({
    container: 'mapa-gl',
    style: ESTILO_ACTUAL,
    bounds: ENCUADRE_INICIAL,
    maxBounds: [[MUNDO.oeste, MUNDO.sur], [MUNDO.este, MUNDO.norte]],
    minZoom: 2.5, maxZoom: ZOOM_MAX,
    dragRotate: false, pitchWithRotate: false, touchPitch: false,
    renderWorldCopies: false, fadeDuration: 0,
    attributionControl: false,   // se añade abajo, con su sitio según el ancho
  });
  map.touchZoomRotate.disableRotation();
  map.once('load', () => {
    map.getContainer().querySelector('.maplibregl-compact-show')?.classList.remove('maplibregl-compact-show');
    const attrib = map.getContainer().querySelector('.maplibregl-ctrl-attrib');
    if (attrib) new ResizeObserver(() => { $('#leyenda').style.bottom = `${Math.max(28, attrib.offsetHeight + 10)}px`; }).observe(attrib);
  });
  map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
  map.addControl(new ControlCapas(), 'top-right');
  // En pantallas estrechas la atribución se pliega en un botón (i) y va arriba, bajo los botones del mapa: abajo la
  // taparía la hoja de la ficha, y las licencias piden que se vea.
  map.addControl(new maplibregl.AttributionControl({ compact: estrecha(), customAttribution: ATRIBUCION }), estrecha() ? 'top-right' : 'bottom-right');
  map.addControl(new maplibregl.ScaleControl({ maxWidth: 110, unit: 'metric' }), 'bottom-right');
  let cargado = false, reintentado = false;
  map.on('error', (e) => {
    const url = String(e?.error?.url || '');
    if (!cargado && !estiloReserva && url.includes('/styles/')) {
      if (!reintentado) { reintentado = true; setTimeout(() => map.setStyle(ESTILO_ACTUAL, { diff: false }), 1000); return; }
      console.warn('El estilo de OpenFreeMap no respondió; el mapa actual usa nuestro relieve.', e?.error?.message);
      estiloReserva = true; map.setStyle(estiloSinTeselas(), { diff: false }); return;
    }
    if (e?.error?.message) console.warn('Mapa:', e.error.message, url);
  });
  map.on('style.load', () => { cargado = true; montarCapas(); });
  map.on('moveend', () => {
    sucio.etiquetas = true; programar(); if (E.mapa === 'cortina') pintarCortina(); pintarNombresEncuadre(); if (pintarLeyenda.args) pintarLeyenda(...pintarLeyenda.args);
    // La entrada del historial guarda dónde se paró el mapa: Atrás, Adelante y una recarga lo devuelven así.
    const c = map.getCenter();
    BE.historia?.encuadre({ lon: c.lng, lat: c.lat, zoom: map.getZoom() });
  });
  map.on('move', () => { if (imgsDom.length) colocarImgsDom(); if (E.mapa === 'cortina') pintarCortina(); pintarSituacion(); if (zonasArea.size) pintarChipsZona(); });
  map.on('resize', () => { if (imgsDom.length) colocarImgsDom(); });
  // Un clic en una marca HTML también llega a MapLibre: esa marca ya lo gestiona su propio manejador.
  const enMarca = (e) => !!e.originalEvent?.target?.closest?.('.maplibregl-marker');
  const puntero = (capa) => { map.on('mouseenter', capa, () => { map.getCanvas().style.cursor = 'pointer'; }); map.on('mouseleave', capa, () => { map.getCanvas().style.cursor = ''; }); };
  map.on('click', 'be-cartas-toque', (e) => { if (enMarca(e)) return; const id = e.features?.[0]?.properties?.id; if (id) alternar({ tipo: 'carta', id }); });
  puntero('be-cartas-toque');
  // La línea de un viaje: el primer clic lo selecciona y el segundo lo deselecciona, igual que en la línea de tiempo.
  for (const capa of ['be-hecho', 'be-falta', 'be-rastro-toque']) {
    map.on('click', capa, (e) => { if (enMarca(e) || e.defaultPrevented) return; e.preventDefault(); const id = e.features?.[0]?.properties?.viaje; if (id) alternar({ tipo: 'viaje', id }, { mover: false }); });
    puntero(capa);
  }
  map.on('click', 'be-zonas-relleno', (e) => {
    if (enMarca(e) || e.defaultPrevented) return;
    e.preventDefault();
    const p = e.features?.[0]?.properties;
    if (p?.lugar) elegirCandidato(p.lugar, p.i);
  });
  puntero('be-zonas-relleno');
  // La zona conjeturada de un área desconocida abre la ficha de su parada, nunca la de un lugar.
  map.on('click', 'be-areas-relleno', (e) => {
    if (enMarca(e) || e.defaultPrevented) return;
    e.preventDefault();
    const sel = e.features?.[0]?.properties?.sel;
    if (sel) alternar(BE.parseSel(sel));
  });
  puntero('be-areas-relleno');
}
/** Selecciona, o deselecciona si ya estaba seleccionado. */
function alternar(sel, opciones = {}) {
  if (E.sel && E.sel.tipo === sel.tipo && E.sel.id === sel.id) { seleccionar(null, { mover: false, encuadrar: false }); return; }
  seleccionar(sel, opciones);
}
function estiloSinTeselas() {
  return { version: 8, sources: {}, layers: [{ id: 'fondo', type: 'background', paint: { 'background-color': '#dfe8ec' } }] };
}
function montarCapas() {
  capasBase = map.getStyle().layers.map((l) => l.id);
  for (const l of map.getStyle().layers) {
    if (l.type === 'symbol' && /^(label_country|water_name)/.test(l.id)) {
      map.setLayoutProperty(l.id, 'text-field', ['coalesce', ['get', 'name:es'], ['get', 'name:latin'], ['get', 'name']]);
    }
    // Los países de hoy chocan con nuestras regiones antiguas: solo aparecen a partir del zoom 8.
    if (/^label_country/.test(l.id)) map.setLayerZoomRange(l.id, Math.max(8, l.minzoom ?? 0), l.maxzoom ?? 24);
  }
  if (estiloReserva && !ES_FILE) {
    for (const b of BASES) {
      map.addSource(`be-actual-${b.id}`, { type: 'image', url: urlBase(b, 'actual'), coordinates: esquinas(b.ext) });
      map.addLayer({ id: `be-actual-${b.id}`, type: 'raster', source: `be-actual-${b.id}`, paint: { 'raster-fade-duration': 0, 'raster-opacity': opacidadGL(b) } });
      capasBase.push(`be-actual-${b.id}`);
    }
  }
  if (!ES_FILE) {
    for (const b of BASES) {
      map.addSource(`be-antiguo-${b.id}`, { type: 'image', url: urlBase(b, 'antiguo'), coordinates: esquinas(b.ext) });
      map.addLayer({ id: `be-antiguo-${b.id}`, type: 'raster', source: `be-antiguo-${b.id}`, paint: { 'raster-fade-duration': 0, 'raster-opacity': opacidadGL(b) } });
    }
  } else if (!imgsDom.length) {
    // Desde file:// MapLibre no puede leer las imágenes (CORS). Van como <img> bajo el lienzo, alineadas a mano.
    for (const b of [...BASES].reverse()) {
      const img = document.createElement('img');
      img.className = 'antiguo-dom'; img.alt = ''; img.src = urlBase(b, 'antiguo');
      map.getContainer().prepend(img);
      imgsDom.push({ img, base: b });
    }
    colocarImgsDom();
  }
  const vacio = { type: 'FeatureCollection', features: [] };
  for (const id of ['be-rastro', 'be-hecho', 'be-falta', 'be-cartas', 'be-cartas-o', 'be-halo', 'be-zonas', 'be-cand-lineas', 'be-zonas-carta', 'be-formas', 'be-areas']) map.addSource(id, { type: 'geojson', data: vacio });
  const lineas = { 'line-cap': 'round', 'line-join': 'round' };
  for (const v of BE.D.viajes) map.addImage(`be-flecha-${v.id}`, imagenFlecha(colorViaje(v.id)));
  for (const [k, s] of Object.entries(CAND)) map.addImage(`be-rayado-${k}`, imagenRayado(s.color, k));
  map.addImage('be-rayado-carta', imagenRayado(cssVar('--gold') || '#1f3b30', 'alternativa'));
  const color = ['get', 'color'];
  const flecha = (placement, opacity, spacing) => ({ type: 'symbol', layout: { 'symbol-placement': placement, 'symbol-spacing': spacing, 'icon-image': ['concat', 'be-flecha-', ['get', 'viaje']], 'icon-size': 0.5, 'icon-rotation-alignment': 'map', 'icon-allow-overlap': true, 'icon-ignore-placement': true }, paint: { 'icon-opacity': opacity } });
  // La forma de una zona con punto (Canaán, Galilea, el Arabá): solo la del lugar elegido o resaltado, debajo de todo y
  // sin clic, para que una región grande no tape los lugares que tiene dentro. Su nombre sigue siendo lo que se pulsa.
  map.addLayer({ id: 'be-formas-relleno', type: 'fill', source: 'be-formas', paint: { 'fill-color': color, 'fill-opacity': 0.1 } });
  map.addLayer({ id: 'be-formas-borde', type: 'line', source: 'be-formas', layout: lineas, paint: { 'line-color': color, 'line-width': 2, 'line-dasharray': [2, 1.5], 'line-opacity': 0.9 } });
  // Lugares inciertos: zonas rayadas con borde difuminado, franjas y el abanico que une a los candidatos.
  // Una zona pequeña (Getsemaní, 1 km) cubre toda la ciudad a zoom 13: de cerca su rayado se aclara.
  const deCerca = ['interpolate', ['linear'], ['zoom'], 10, ['get', 'opacidad'], 13, ['*', 0.3, ['get', 'opacidad']]];
  map.addLayer({ id: 'be-zonas-relleno', type: 'fill', source: 'be-zonas', paint: { 'fill-pattern': ['concat', 'be-rayado-', ['get', 'estado']], 'fill-opacity': deCerca } });
  map.addLayer({ id: 'be-zonas-halo', type: 'line', source: 'be-zonas', paint: { 'line-color': color, 'line-width': 10, 'line-blur': 8, 'line-opacity': ['*', 0.35, ['get', 'opacidad']] } });
  map.addLayer({ id: 'be-zonas-solido', type: 'line', source: 'be-zonas', filter: ['==', ['get', 'trazo'], 'solido'], paint: { 'line-color': color, 'line-width': 1.8, 'line-opacity': ['get', 'opacidad'] } });
  map.addLayer({ id: 'be-zonas-raya', type: 'line', source: 'be-zonas', filter: ['==', ['get', 'trazo'], 'raya'], paint: { 'line-color': color, 'line-width': 1.8, 'line-dasharray': [4, 3], 'line-opacity': ['get', 'opacidad'] } });
  map.addLayer({ id: 'be-zonas-punto', type: 'line', source: 'be-zonas', filter: ['==', ['get', 'trazo'], 'punto'], layout: lineas, paint: { 'line-color': color, 'line-width': 1.8, 'line-dasharray': [0.2, 2.4], 'line-opacity': ['get', 'opacidad'] } });
  map.addLayer({ id: 'be-cand-abanico', type: 'line', source: 'be-cand-lineas', filter: ['==', ['get', 'clase'], 'abanico'], layout: lineas, paint: { 'line-color': '#7a5c8e', 'line-width': 1.2, 'line-dasharray': [1, 3], 'line-opacity': ['get', 'opacidad'] } });
  map.addLayer({ id: 'be-cand-franja', type: 'line', source: 'be-cand-lineas', filter: ['==', ['get', 'clase'], 'franja'], layout: lineas, paint: { 'line-color': color, 'line-width': 5, 'line-opacity': ['*', 0.85, ['get', 'opacidad']] } });
  map.addLayer({ id: 'be-zonas-carta', type: 'fill', source: 'be-zonas-carta', paint: { 'fill-pattern': 'be-rayado-carta', 'fill-opacity': 0.8 } });
  map.addLayer({ id: 'be-zonas-carta-borde', type: 'line', source: 'be-zonas-carta', paint: { 'line-color': color, 'line-width': 1.4, 'line-dasharray': [3, 3], 'line-opacity': 0.8 } });
  // Zonas que conjeturamos para un área desconocida (pintarAreas): el aspecto de lo incierto, en el color del viaje, y un
  // hilo de trazos hasta la parada vecina. Se encogen hasta ella al llegar y se abren desde ella al salir.
  const opArea = ['get', 'opacidad'];
  map.addLayer({ id: 'be-areas-relleno', type: 'fill', source: 'be-areas', filter: ['==', ['geometry-type'], 'Polygon'], paint: { 'fill-color': color, 'fill-opacity': ['*', 0.13, opArea] } });
  map.addLayer({ id: 'be-areas-halo', type: 'line', source: 'be-areas', filter: ['==', ['geometry-type'], 'Polygon'], paint: { 'line-color': color, 'line-width': 10, 'line-blur': 8, 'line-opacity': ['*', 0.3, opArea] } });
  map.addLayer({ id: 'be-areas-borde', type: 'line', source: 'be-areas', filter: ['==', ['geometry-type'], 'Polygon'], paint: { 'line-color': color, 'line-width': 2, 'line-dasharray': [3, 2], 'line-opacity': opArea } });
  map.addLayer({ id: 'be-areas-hilo', type: 'line', source: 'be-areas', filter: ['==', ['geometry-type'], 'LineString'], layout: lineas, paint: { 'line-color': color, 'line-width': 2, 'line-dasharray': [1, 2], 'line-opacity': ['*', 0.8, opArea] } });
  // Viajes
  const pinturaRastro = { 'line-color': color, 'line-width': ['case', ['==', ['get', 'estado'], 'actual'], 3, 2.2], 'line-opacity': ['match', ['get', 'estado'], 'actual', 0.9, 0.6] };
  const sinDeducir = ['!=', ['get', 'deducido'], true], deducidos = ['==', ['get', 'deducido'], true];
  map.addLayer({ id: 'be-rastro', type: 'line', source: 'be-rastro', filter: ['all', ['!=', ['get', 'incierto'], true], sinDeducir], layout: lineas, paint: pinturaRastro });
  // El tramo que llega a un lugar incierto va a trazos hasta su candidato preferido o el centro de su zona (verticeRuta).
  map.addLayer({ id: 'be-rastro-incierto', type: 'line', source: 'be-rastro', filter: ['all', ['==', ['get', 'incierto'], true], sinDeducir], layout: { 'line-join': 'round' }, paint: { ...pinturaRastro, 'line-dasharray': [3, 2] } });
  // El que llega a una parada deducida o sale de ella, de puntos (deducida).
  map.addLayer({ id: 'be-rastro-deducido', type: 'line', source: 'be-rastro', filter: deducidos, layout: lineas, paint: { ...pinturaRastro, 'line-dasharray': [0.1, 1.8] } });
  map.addLayer({ id: 'be-rastro-flechas', source: 'be-rastro', ...flecha('line', ['match', ['get', 'estado'], 'actual', 0.9, 0.5], 90) });
  // Cartas: un color por escritor; pendientes punteadas, escritas discontinuas, la seleccionada gruesa.
  map.addLayer({ id: 'be-cartas-o', type: 'line', source: 'be-cartas-o', layout: lineas, paint: { 'line-color': color, 'line-width': 1.4, 'line-dasharray': [0.4, 2.2], 'line-opacity': 0.9 } });
  map.addLayer({ id: 'be-cartas-pendiente', type: 'line', source: 'be-cartas', filter: ['==', ['get', 'estado'], 'pendiente'], layout: lineas, paint: { 'line-color': color, 'line-width': 1.6, 'line-dasharray': [0.5, 2.5], 'line-opacity': 0.8 } });
  map.addLayer({ id: 'be-cartas-escrita', type: 'line', source: 'be-cartas', filter: ['==', ['get', 'estado'], 'escrita'], layout: { 'line-join': 'round' }, paint: { 'line-color': color, 'line-width': 1.8, 'line-dasharray': [3, 2.5], 'line-opacity': 0.85 } });
  map.addLayer({ id: 'be-cartas-sel-casing', type: 'line', source: 'be-cartas', filter: ['==', ['get', 'estado'], 'sel'], layout: lineas, paint: { 'line-color': '#fffdf8', 'line-width': 7, 'line-opacity': 0.85 } });
  map.addLayer({ id: 'be-cartas-sel', type: 'line', source: 'be-cartas', filter: ['==', ['get', 'estado'], 'sel'], layout: { 'line-join': 'round' }, paint: { 'line-color': color, 'line-width': 4, 'line-dasharray': [2.2, 1] } });
  map.addLayer({ id: 'be-halo', type: 'circle', source: 'be-halo', paint: { 'circle-radius': 16, 'circle-color': color, 'circle-opacity': 0.12, 'circle-stroke-color': color, 'circle-stroke-width': 1.5 } });
  map.addLayer({ id: 'be-falta', type: 'line', source: 'be-falta', layout: lineas, paint: { 'line-color': color, 'line-width': 2.5, 'line-dasharray': [0.3, 2.6], 'line-opacity': 0.75 } });
  map.addLayer({ id: 'be-hecho-casing', type: 'line', source: 'be-hecho', layout: lineas, paint: { 'line-color': '#fffcf4', 'line-width': 7, 'line-opacity': 0.8 } });
  map.addLayer({ id: 'be-hecho', type: 'line', source: 'be-hecho', filter: ['all', ['!', ['get', 'incierto']], sinDeducir], layout: lineas, paint: { 'line-color': color, 'line-width': 3.5 } });
  map.addLayer({ id: 'be-hecho-incierto', type: 'line', source: 'be-hecho', filter: ['all', ['get', 'incierto'], sinDeducir], layout: { 'line-join': 'round' }, paint: { 'line-color': color, 'line-width': 3, 'line-dasharray': [3, 2], 'line-opacity': 0.9 } });
  map.addLayer({ id: 'be-hecho-deducido', type: 'line', source: 'be-hecho', filter: deducidos, layout: lineas, paint: { 'line-color': color, 'line-width': 3.5, 'line-dasharray': [0.1, 1.6] } });
  map.addLayer({ id: 'be-falta-flechas', source: 'be-falta', ...flecha('line-center', 0.6, 80) });
  map.addLayer({ id: 'be-hecho-flechas', source: 'be-hecho', ...flecha('line-center', 1, 80) });
  map.addLayer({ id: 'be-rastro-toque', type: 'line', source: 'be-rastro', layout: lineas, paint: { 'line-color': '#000', 'line-width': 12, 'line-opacity': 0 } });
  map.addLayer({ id: 'be-cartas-toque', type: 'line', source: 'be-cartas', layout: lineas, paint: { 'line-color': '#000', 'line-width': 16, 'line-opacity': 0 } });
  mapaListo = true;
  cortina = null;
  aplicarModoMapa();
  aplicarRelieve();
  claveInciertos = ''; claveFormas = ''; pintarMapa.claveCartas = null;
  sucio.mapa = sucio.etiquetas = true;
  programar();
}
function colocarImgsDom() {
  const z = map.getZoom();
  for (const { img, base } of imgsDom) {
    const a = map.project([base.ext.oeste, base.ext.norte]), b = map.project([base.ext.este, base.ext.sur]);
    Object.assign(img.style, { left: `${a.x}px`, top: `${a.y}px`, width: `${b.x - a.x}px`, height: `${b.y - a.y}px`, opacity: String(opacidadEn(base, z)) });
  }
}
function ponerMapa(modo, guardar = true) {
  if (modo === 'cortina' && ES_FILE) { avisar('La cortina necesita abrir el sitio con un servidor local (ver README).'); modo = 'antiguo'; }
  E.mapa = modo;
  document.querySelectorAll('[data-mapa]').forEach((b) => {
    const on = b.dataset.mapa === modo;
    b.classList.toggle('be-seg__opt--on', on); b.setAttribute('aria-checked', String(on));
  });
  $('#app').dataset.mapa = modo;
  $('#cortina').hidden = modo !== 'cortina';
  if (mapaListo) aplicarModoMapa();
  sucio.etiquetas = true; programar();
  pintarNombresEncuadre();
  if (guardar) guardarHash();
}
function aplicarModoMapa() {
  const antiguo = E.mapa === 'antiguo';
  for (const id of capasBase) {
    if (!map.getLayer(id)) continue;
    const ver = !antiguo && !(OCULTAR_EN_ACTUAL.test(id));
    map.setLayoutProperty(id, 'visibility', ver ? 'visible' : 'none');
  }
  aplicarRelieve();
  if (E.mapa === 'cortina') montarCortina();
  else if (cortina) for (const c of cortina) if (map.getLayer(`be-cortina-${c.base.id}`)) map.setLayoutProperty(`be-cortina-${c.base.id}`, 'visibility', 'none');
}
/** Capa «Relieve»: sin ella, el mapa antiguo queda en papel liso. */
function aplicarRelieve() {
  if (!mapaListo) return;
  const ver = E.mapa === 'antiguo' && F.capas.relieve;
  for (const b of BASES) if (map.getLayer(`be-antiguo-${b.id}`)) map.setLayoutProperty(`be-antiguo-${b.id}`, 'visibility', ver ? 'visible' : 'none');
  for (const { img } of imgsDom) img.hidden = !ver;
  $('#app').classList.toggle('sin-relieve', !F.capas.relieve);
}

// ---------------------------------------------------------------------------
// Cortina: el relieve antiguo se pinta en un lienzo por extensión, solo a un lado del asa. En Mercator la longitud es
// lineal en x y la latitud de Mercator en y, así que el recorte es exacto. En pantallas estrechas la cortina es
// horizontal: arriba el mapa antiguo, abajo el actual.
// ---------------------------------------------------------------------------
async function montarCortina() {
  if (!cortina) {
    const piezas = [];
    for (const b of BASES) {
      const img = new Image();
      img.src = urlBase(b, 'antiguo');
      try { await img.decode(); } catch { return; }
      piezas.push({ base: b, img });
    }
    if (cortina || !mapaListo) return;
    cortina = piezas.map(({ base, img }) => {
      const canvas = document.createElement('canvas');
      canvas.width = Math.min(2048, img.naturalWidth); canvas.height = Math.round(canvas.width * img.naturalHeight / img.naturalWidth);
      const id = `be-cortina-${base.id}`;
      map.addSource(id, { type: 'canvas', canvas, coordinates: esquinas(base.ext), animate: false });
      map.addLayer({ id, type: 'raster', source: id, paint: { 'raster-fade-duration': 0, 'raster-opacity': opacidadGL(base) } }, 'be-formas-relleno');
      return { base, img, canvas, ctx: canvas.getContext('2d') };
    });
  }
  if (E.mapa !== 'cortina') return;
  for (const c of cortina) map.setLayoutProperty(`be-cortina-${c.base.id}`, 'visibility', 'visible');
  pintarCortina();
}
let cortinaPausa = 0;
function pintarCortina() {
  const el = $('#cortina');
  const cont = map.getContainer();
  const h = estrecha();
  el.classList.toggle('cortina--h', h);
  // En horizontal la cortina reparte la parte del mapa que no tapa la hoja inferior.
  const pos = E.cortinaX * (h ? Math.max(120, cont.clientHeight - altoHoja()) : cont.clientWidth);
  el.style.setProperty(h ? '--y' : '--x', `${pos}px`);
  if (!cortina) return;
  for (const c of cortina) {
    const { canvas, ctx, img, base } = c;
    const e = base.ext;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (h) {
      const lat = map.unproject([cont.clientWidth / 2, pos]).lat;
      const f = clamp((mercY(e.norte) - mercY(lat)) / (mercY(e.norte) - mercY(e.sur)), 0, 1);
      if (f > 0) ctx.drawImage(img, 0, 0, img.naturalWidth, f * img.naturalHeight, 0, 0, canvas.width, f * canvas.height);
    } else {
      const lon = map.unproject([pos, cont.clientHeight / 2]).lng;
      const f = clamp((lon - e.oeste) / (e.este - e.oeste), 0, 1);
      if (f > 0) ctx.drawImage(img, 0, 0, f * img.naturalWidth, img.naturalHeight, 0, 0, f * canvas.width, canvas.height);
    }
    const fuente = map.getSource(`be-cortina-${base.id}`);
    fuente?.play();                     // sube el lienzo a la GPU en los próximos fotogramas
  }
  clearTimeout(cortinaPausa);
  cortinaPausa = setTimeout(() => { for (const c of cortina || []) map.getSource(`be-cortina-${c.base.id}`)?.pause(); }, 120);
}
function iniciarCortina() {
  const el = $('#cortina'), asa = $('#cortina-asa');
  let arrastre = false;
  const mover = (e) => {
    const r = map.getContainer().getBoundingClientRect();
    E.cortinaX = estrecha() ? clamp((e.clientY - r.top) / Math.max(120, r.height - altoHoja()), 0.05, 0.95) : clamp((e.clientX - r.left) / r.width, 0.03, 0.97);
    pintarCortina();
  };
  asa.addEventListener('pointerdown', (e) => { arrastre = true; asa.setPointerCapture(e.pointerId); e.preventDefault(); });
  asa.addEventListener('pointermove', (e) => { if (arrastre) mover(e); });
  asa.addEventListener('pointerup', () => { arrastre = false; });
  asa.addEventListener('dblclick', () => { E.cortinaX = 0.5; pintarCortina(); });
  asa.addEventListener('keydown', (e) => {
    if (e.altKey || e.metaKey || e.ctrlKey) return;   // Alt + ← y ⌘ + ←: atrás del navegador
    const menos = e.key === 'ArrowLeft' || e.key === 'ArrowUp', mas = e.key === 'ArrowRight' || e.key === 'ArrowDown';
    if (menos || mas) {
      e.preventDefault(); e.stopPropagation();
      E.cortinaX = clamp(E.cortinaX + (menos ? -0.04 : 0.04), 0.03, 0.97);
      pintarCortina();
    }
  });
  // Los rótulos de cada lado ponen todo el mapa en ese estilo.
  el.querySelector('.cortina-tag--izq')?.addEventListener('click', () => ponerMapa('antiguo'));
  el.querySelector('.cortina-tag--der')?.addEventListener('click', () => ponerMapa('actual'));
  for (const t of el.querySelectorAll('.cortina-tag')) { t.setAttribute('role', 'button'); t.tabIndex = 0; t.title = 'Poner todo el mapa en este estilo'; t.addEventListener('keydown', (e) => { if (e.key === 'Enter') t.click(); }); }
  el.hidden = E.mapa !== 'cortina';
}

// ---------------------------------------------------------------------------
// Geometría
// ---------------------------------------------------------------------------
/** Cambia las clases propias de una marca sin quitar las de MapLibre (maplibregl-marker…), que la posicionan. */
const conMarcador = (el, clases) => [clases, ...[...el.classList].filter((c) => c.startsWith('maplibregl-'))].join(' ');
const coord = (l) => [l.lon, l.lat];
const linea = (coordinates, properties) => ({ type: 'Feature', properties, geometry: { type: 'LineString', coordinates } });
const conPunto = (l) => !!l && l.lat != null && l.lon != null && !candidatosDe(l);
/** Polígono de un círculo de radio km alrededor de un punto. */
function circulo(lat, lon, km, n = 72) {
  const R = 6371, d = km / R, f1 = (lat * Math.PI) / 180, l1 = (lon * Math.PI) / 180, pts = [];
  for (let k = 0; k <= n; k++) {
    const b = (2 * Math.PI * k) / n;
    const f2 = Math.asin(Math.sin(f1) * Math.cos(d) + Math.cos(f1) * Math.sin(d) * Math.cos(b));
    const l2 = l1 + Math.atan2(Math.sin(b) * Math.sin(d) * Math.cos(f1), Math.cos(d) - Math.sin(f1) * Math.sin(f2));
    pts.push([(l2 * 180) / Math.PI, (f2 * 180) / Math.PI]);
  }
  return pts;
}
/** Arco curvo entre dos puntos [lon, lat] (curva cuadrática en el plano de Mercator). */
function arcoPts(a, b, curva = 0.18) {
  const ax = a[0], ay = mercY(a[1]) * 57.2958, bx = b[0], by = mercY(b[1]) * 57.2958;
  const mx = (ax + bx) / 2, my = (ay + by) / 2, dx = bx - ax, dy = by - ay;
  const cx = mx - dy * curva, cy = my + dx * curva;
  const pts = [];
  for (let i = 0; i <= 32; i++) {
    const t = i / 32, u = 1 - t;
    pts.push([u * u * ax + 2 * u * t * cx + t * t * bx, latDeY((u * u * ay + 2 * u * t * cy + t * t * by) / 57.2958)]);
  }
  return pts;
}
const arco = (a, b) => arcoPts(coord(a), coord(b));
/** Punta de flecha (apunta a la derecha; MapLibre la gira según la línea) con borde claro. */
function imagenFlecha(color) {
  const s = 28, c = document.createElement('canvas');
  c.width = s; c.height = s;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.beginPath(); g.moveTo(6, 5); g.lineTo(23, 14); g.lineTo(6, 23); g.lineTo(11, 14); g.closePath();
  g.lineJoin = 'round'; g.strokeStyle = 'rgba(255,252,244,0.95)'; g.lineWidth = 3; g.stroke();
  g.fillStyle = color; g.fill();
  return g.getImageData(0, 0, s, s);
}
/** Patrón de relleno por estado (D-09): rayado denso, rayado claro, puntos o cuadrícula, además del color. */
function imagenRayado(color, estado) {
  const s = 12, c = document.createElement('canvas');
  c.width = s; c.height = s;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.strokeStyle = color; g.fillStyle = color;
  const diagonal = (ancho, alfa) => { g.globalAlpha = alfa; g.lineWidth = ancho; g.beginPath(); g.moveTo(-2, s + 2); g.lineTo(s + 2, -2); g.moveTo(-2, 2); g.lineTo(2, -2); g.moveTo(s - 2, s + 2); g.lineTo(s + 2, s - 2); g.stroke(); };
  if (estado === 'seguro') { g.globalAlpha = 0.16; g.fillRect(0, 0, s, s); }
  else if (estado === 'favorecido_nivel_1') { diagonal(1.6, 0.55); }
  else if (estado === 'alternativa') { diagonal(1, 0.3); }
  else if (estado === 'tradicion') { g.globalAlpha = 0.5; g.beginPath(); g.arc(3, 3, 1.3, 0, 7); g.arc(9, 9, 1.3, 0, 7); g.fill(); }
  else if (estado === 'solo_nivel_2') { g.globalAlpha = 0.35; g.beginPath(); g.arc(6, 6, 1, 0, 7); g.fill(); }
  else { diagonal(0.8, 0.25); g.beginPath(); g.moveTo(-2, -2); g.lineTo(s + 2, s + 2); g.stroke(); }
  return g.getImageData(0, 0, s, s);
}

// ---------------------------------------------------------------------------
// Viajes (M-09): cada viaje es su propia ruta. De Pablo se dibuja solo el que recorre en esta fecha, partido en hecho
// y falta; sus otros viajes no se dibujan. Los de otra persona se ven como rastro en la fecha del propio viaje: en
// color mientras ocurre y gris claro el año siguiente. Un viaje seleccionado se ve entero y en su color. Elegir a una
// persona no añade rutas: el mapa dice dónde está ahora, con la misma regla que sin nada elegido, y la línea de tiempo
// enseña todos sus viajes. Un viaje que se repetía cada año lleva la marca «↻ cada año» sobre su ruta.
// ---------------------------------------------------------------------------
/** Ventana [a, b] en que un viaje de otra persona o de un grupo está en curso: de su primera parada a su última, en el
    momento en que las coloca la línea de tiempo (BE.paradasDe, que sale de BE.estancias), no toda la fecha del viaje.
    Con la fecha entera, los dieciséis viajes de 2 Samuel 10 en adelante, que comparten de 1070 a c. 1040, se dibujaban
    a la vez durante treinta años. La ventana nunca sale de la fecha del viaje: la línea alarga la última parada hasta
    la siguiente estancia de la persona (Moisés sigue en Madián cuarenta años), y eso no es el viaje. Un viaje sin
    paradas en la línea, o cuyas paradas caen fuera de su fecha, usa su fecha. Las áreas desconocidas sí la alargan. */
let ventanasViaje = null;
function ventanaViaje(v) {
  if (!ventanasViaje || ventanasViaje.D !== BE.D) ventanasViaje = { D: BE.D, m: new Map() };
  if (!ventanasViaje.m.has(v)) {
    const todas = BE.paradasDe?.(v) || [], f = tramo(v.fecha), ps = todas.filter((s) => !s.lugar.area);
    let w = ps.length ? [Math.min(...ps.map((s) => s.a)), Math.max(...ps.map((s) => s.b))] : f;
    if (ps.length && f) { const a = Math.max(w[0], f[0]), b = Math.min(w[1], f[1]); w = b > a ? [a, b] : f; }
    // Un área desconocida va pegada a su vecina aunque quede fuera de la fecha (los astrólogos ya están en Jerusalén al
    // empezar la suya): sin ella, el área de origen nunca se vería abierta.
    for (const s of todas) if (s.lugar.area && w) w = [Math.min(w[0], s.a), Math.max(w[1], s.b)];
    ventanasViaje.m.set(v, w);
  }
  return ventanasViaje.m.get(v);
}
/** ¿Dibuja la capa «Viajes» este viaje de otra persona en t? Solo mientras duran sus paradas (ventanaViaje) y un año
    más, en gris, porque con Moisés o Pedro todos sus viajes a la vez llenarían el mapa. Los de Pablo no pasan por aquí:
    sus viajes van uno detrás de otro, de 34 a 65, y en cada fecha se ve solo el que recorre (BE.viajeActual). */
const viajeEnEpoca = (v, t) => { const w = ventanaViaje(v); return !!w && t >= w[0] && t < w[1] + 1; };
/** Vértice de una parada en la ruta de un viaje: el punto de su lugar o, si el lugar es incierto, su candidato
    preferido o el centro de su zona. Lo dice BE.puntoLugar (trayectorias.js), que es también donde BE.donde pone a la
    persona. { c: [lon, lat], incierto } o null si no hay ninguno. Sin esto, Perea, Efraín o Sodoma dejaban su viaje
    sin línea. */
function verticeRuta(l) {
  return BE.puntoLugar(l);
}
/** Una parada pendiente de verificar (`estado: pendiente`) es casi siempre una deducción (README de la investigación,
    «Viajes»), y alguna vez un lugar del texto con la fecha por confirmar: el tramo que llega a ella o sale de ella se
    dibuja de puntos, para no dibujarla con la misma línea que el texto. La leyenda dice «pendiente», no «deducida». */
const deducida = (p) => p?.estado === 'pendiente';
function geoRutas(w) {
  const V = BE.viajeActual(w);
  const hecho = [], falta = [], rastro = [];
  if (V) {
    const ps = BE.P.filter((s) => s.viaje === V);
    const corte = w.parada ? w.en.i : (w.en.viaje === V ? w.en.i : -1);
    const color = colorViaje(V.id);
    // Los vértices son los de verticeRuta, como en los demás viajes; una parada sin dónde dibujarse se salta.
    const vs = ps.map((s) => ({ s, v: verticeRuta(s.lugar) })).filter((x) => x.v);
    for (let k = 0; k < vs.length - 1; k++) {
      const A = vs[k], B = vs[k + 1];
      const props = { viaje: V.id, incierto: A.v.incierto || B.v.incierto, deducido: deducida(A.s.p) || deducida(B.s.p), color };
      if (B.s.i <= corte) hecho.push(linea([A.v.c, B.v.c], props));
      else if (A.s.i <= corte && !w.parada && w.pos) {
        hecho.push(linea([A.v.c, w.pos], props));
        falta.push(linea([w.pos, B.v.c], props));
      } else falta.push(linea([A.v.c, B.v.c], props));
    }
    const de = verticeRuta(w.en.lugar), a = w.sig && verticeRuta(w.sig.lugar);
    if (!w.parada && w.en.viaje !== V && w.pos && de && a) {             // tramo de enlace entre dos viajes
      hecho.push(linea([de.c, w.pos], { viaje: V.id, incierto: false, deducido: false, color }));
      falta.push(linea([w.pos, a.c], { viaje: V.id, incierto: false, deducido: false, color }));
    }
  }
  for (const v of BE.D.viajes) {
    if (v === V) continue;
    const quien = BE.duenoViaje(v);
    const elegido = E.sel?.tipo === 'viaje' && E.sel.id === v.id;
    const ver = elegido || (F.capas.viajes && quien !== 'pablo' && viajeEnEpoca(v, E.t));
    if (!ver) continue;
    // Los destinos en paralelo (`branches_from`) no van en la línea: cada uno lleva su trazo desde su parada de salida.
    const ordenadas = [...(v.paradas || [])].sort((a, b) => a.orden - b.orden);
    const ramas = ordenadas.filter((p) => p.branches_from != null);
    const pts = ordenadas.filter((p) => p.branches_from == null).map((p) => { const x = verticeRuta(BE.L[p.lugar]); return x && { ...x, deducida: deducida(p), orden: p.orden }; }).filter(Boolean);
    if (pts.length < 2 && !ramas.length) continue;
    // Sin elegirlo, un viaje solo se ve mientras duran sus paradas y un año más (viajeEnEpoca, ventanaViaje): en curso o
    // ya pasado, nunca por venir. El viaje elegido va entero y en su color aunque esté fuera de su fecha.
    const estado = elegido || E.t < ventanaViaje(v)[1] ? 'actual' : 'pasado';
    const c = colorViaje(v.id);
    const props = { viaje: v.id, estado, color: estado === 'pasado' ? apagar(c, 0.45) : c };
    // Un trazo por cada tramo seguido del mismo tipo: firme entre lugares con punto, a trazos si toca un lugar incierto
    // y de puntos si llega a una parada deducida o sale de ella.
    if (pts.length >= 2) {
      let tramoRuta = [pts[0].c], incierto = null, deducido = null;
      for (let k = 1; k < pts.length; k++) {
        const inc = pts[k - 1].incierto || pts[k].incierto, ded = pts[k - 1].deducida || pts[k].deducida;
        if (incierto !== null && (inc !== incierto || ded !== deducido)) { rastro.push(linea(tramoRuta, { ...props, incierto, deducido })); tramoRuta = [pts[k - 1].c]; }
        incierto = inc; deducido = ded;
        tramoRuta.push(pts[k].c);
      }
      rastro.push(linea(tramoRuta, { ...props, incierto, deducido }));
    }
    // Un trazo por destino en paralelo, desde su parada de salida o, si esa no tiene dónde dibujarse, desde la última
    // de la línea antes de ella. Con las mismas reglas: a trazos hacia un lugar incierto, de puntos si toca una parada
    // pendiente. Un destino sin dónde dibujarse no lleva trazo.
    for (const p of ramas) {
      const b = verticeRuta(BE.L[p.lugar]);
      const a = [...pts].reverse().find((x) => x.orden <= p.branches_from);
      if (!a || !b) continue;
      rastro.push(linea([a.c, b.c], { ...props, incierto: a.incierto || b.incierto, deducido: a.deducida || deducida(p), rama: a.orden }));
    }
  }
  return { hecho, falta, rastro, V };
}

/** Viajes dibujados que se repetían cada año (`repeats: yearly`), en el orden de los datos. */
const viajesRepetidos = (g) => {
  const ids = new Set([...g.hecho, ...g.falta, ...g.rastro].map((f) => f.properties.viaje));
  return BE.D.viajes.filter((v) => v.repeats === 'yearly' && ids.has(v.id));
};
/** La marca «↻ cada año» de cada viaje dibujado que se repite: en medio de su tramo más largo, lejos de los nombres de
    sus lugares, y del color de su ruta. */
const marcasRepite = new Map();       // id de viaje → marker
function pintarRepite(g) {
  const vs = viajesRepetidos(g), vivos = new Set(vs.map((v) => v.id));
  for (const [id, m] of marcasRepite) if (!vivos.has(id)) { m.remove(); marcasRepite.delete(id); }
  for (const v of vs) {
    const fs = [...g.hecho, ...g.falta, ...g.rastro].filter((x) => x.properties.viaje === v.id);
    let a = null, b = null, f = fs[0];
    for (const x of fs) {
      const cs = x.geometry.coordinates;
      for (let i = 1; i < cs.length; i++) {
        if (!a || Math.hypot(cs[i][0] - cs[i - 1][0], cs[i][1] - cs[i - 1][1]) > Math.hypot(b[0] - a[0], b[1] - a[1])) { [a, b] = [cs[i - 1], cs[i]]; f = x; }
      }
    }
    let m = marcasRepite.get(v.id);
    if (!m) {
      const el = document.createElement('span');
      el.className = 'marca-repite';
      el.dataset.viaje = v.id;
      el.textContent = '↻ cada año';
      el.title = `${v.nombre}: se repetía cada año`;
      m = new maplibregl.Marker({ element: el, anchor: 'bottom', offset: [0, -6] }).setLngLat([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]).addTo(map);
      marcasRepite.set(v.id, m);
    }
    m.setLngLat([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]);
    m.getElement().style.setProperty('--viajero', f.properties.color);
  }
}

// ---------------------------------------------------------------------------
// Áreas desconocidas: de dónde viene o adónde va un viaje cuando la fuente no lo sitúa
// ---------------------------------------------------------------------------
/** Una parada en un extremo del viaje que no tiene dónde dibujarse: un área que la fuente no sitúa (`unknown_area`:
    Oriente, «su país») o un lugar sin punto ni candidato. Se dibuja como un área que no reclama sitio: un contorno de
    trazos en el color del viaje, como la posición estimada, junto a la parada vecina con lugar y en píxeles de la
    pantalla, así que no cambia con el zoom, no dice una distancia y el encuadre no la cuenta. Va hacia el rumbo que da la
    fuente; sin rumbo, es un anillo alrededor de la parada vecina, que no señala ningún sitio. Pulsarla abre la ficha de
    su parada, no la de un lugar.
    Cuando el cursor pasa por la llegada a la parada vecina, el área se encoge y entra en ella (el viaje viene de allí);
    al salir de la última parada, el área se abre desde ella y se queda suave (el viaje va allí). La transición dura
    0,45 s de reloj, sea cual sea la velocidad, y depende solo de la fecha: arrastrar el cursor la hace igual, hacia
    delante y hacia atrás. Con movimiento reducido no hay transición: solo los dos estados. */
const marcasArea = new Map();         // clave de la parada → { marker, el, estado }
const RUMBO_GRADOS = { north: 0, northeast: 45, east: 90, southeast: 135, south: 180, southwest: 225, west: 270, northwest: 315 };
const AREA = { lejos: 124, lejosMovil: 104, rx: 68, ry: 30 };
let areasCache = null;
/** Viajes con alguna parada en un extremo sin dónde dibujarse, una vez por carga de datos y filtro de nivel. */
function viajesConArea() {
  const k = `${F.nivel1}`;
  if (areasCache && areasCache.D === BE.D && areasCache.k === k) return areasCache.vs;
  const vs = BE.D.viajes.filter((v) => (v.paradas || []).some((p) => p.unknown_area || !verticeRuta(BE.L[p.lugar])));
  areasCache = { D: BE.D, k, vs };
  return vs;
}
/** Las áreas de un viaje: { s, k, llega }, con s la parada sin sitio, k su vecina con sitio y llega si el viaje viene
    del área (está antes de la primera parada con sitio). Una parada sin sitio en medio del viaje no se dibuja: no tiene
    un solo vecino del que salir o al que llegar. */
function areasDe(v) {
  const ps = BE.paradasDe(v), conSitio = ps.filter((s) => verticeRuta(s.lugar));
  if (!conSitio.length) return [];
  const primera = conSitio[0], ultima = conSitio[conSitio.length - 1];
  return ps.filter((s) => !verticeRuta(s.lugar) && (s.i < primera.i || s.i > ultima.i))
    .map((s) => ({ s, k: s.i < primera.i ? primera : ultima, llega: s.i < primera.i }));
}
/** Abierta: el área se ve. La de origen se ve hasta que el viaje llega a su vecina, en ese momento aún abierta. La de
    destino, desde que sale de su vecina (una parada de un solo momento, como Peor, aún no la ha dejado en ese momento)
    hasta que acaba su propia estancia, salvo con el viaje elegido: así se cierra con el viaje y no se queda el año en
    gris. */
const areaAbierta = (x, t, elegido) => (x.llega ? t <= x.k.a : t > x.k.b && (elegido || t <= x.s.b));
const movimientoReducido = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
/** ¿Está elegido el viaje, o la parada de una de sus áreas? Entonces se ve entero, como el viaje elegido. */
const viajeElegido = (v) => (E.sel?.tipo === 'viaje' && E.sel.id === v.id) || (E.sel?.tipo === 'parada' && E.sel.id.startsWith(`${v.id}/`));
function pintarAreas(soloViaje, verViajes, V) {
  const vivas = new Set();
  for (const v of viajesConArea()) {
    const quien = BE.duenoViaje(v), elegido = viajeElegido(v);
    const ver = soloViaje ? v.id === soloViaje : verViajes && (quien === 'pablo' ? v === V : elegido || viajeEnEpoca(v, E.t));
    if (!ver) continue;
    const pasado = !elegido && quien !== 'pablo' && E.t >= ventanaViaje(v)[1];
    const color = pasado ? apagar(colorViaje(v.id), 0.45) : colorViaje(v.id);
    for (const x of areasDe(v)) {
      const ancla = verticeRuta(x.k.lugar);
      if (!ancla) continue;
      vivas.add(x.s.key);
      const estado = areaAbierta(x, E.t, elegido) ? 'abierta' : 'cerrada';
      if (x.s.lugar.area?.zonas?.length) zonaArea(x, ancla.c, color, estado);
      else marcaArea(x, ancla.c, color, estado);
    }
  }
  for (const [k, m] of marcasArea) if (!vivas.has(k)) { m.marker.remove(); marcasArea.delete(k); }
  for (const [k, z] of zonasArea) if (!vivas.has(k)) { z.etiquetas.forEach((m) => m.marker.remove()); z.chip?.remove(); zonasArea.delete(k); componerZonas.sucio = true; }
  if (componerZonas.sucio) componerZonas();
}

// Zonas conjeturadas: cuando la fuente no sitúa el área pero una publicación deja adivinar dónde estaba (Perspicacia
// «Estrella» pone a los astrólogos en la vecindad de Babilonia), el área se dibuja en esa zona, con el aspecto de lo
// incierto y un hilo hasta la parada vecina. Es una conjetura: la ficha y la leyenda dicen «zona probable» o «zona
// posible» y según quién (`according_to`, nunca el orden de las fuentes), y nadie se sitúa en ella. Al cruzar la
// llegada, cada vértice de la zona va hacia la parada vecina mientras se apaga, así que el contorno se cierra a la vez
// que entra en ella; al salir de la última parada, lo mismo al revés. 0,45 s de reloj, con requestAnimationFrame y la
// fuente de datos del mapa, que solo se escribe cuando algo cambia; con movimiento reducido o en el modo reunión, solo
// los dos estados. Si la zona queda fuera del mapa, una ficha pequeña en el borde, del lado de la zona, dice sus
// palabras y su conjetura, y la animación entra desde ese borde o sale hacia él.
const zonasArea = new Map();          // clave de la parada → { x, ancla, color, estado, p, anim, etiquetas, chip }
const DURACION_AREA = 450;
const sinMovimiento = () => movimientoReducido() || document.documentElement.classList.contains('be-reunion');
/** Cómo nombra el sitio la fuente de una conjetura: «Perspicacia «Estrella»», un capítulo («Jueces 21») o la obra. */
const fuenteCorta = (id) => {
  const f = BE.D.fuentes?.[id];
  if (!f) return '';
  if (/^Perspicacia/.test(f.obra || '')) return `Perspicacia «${f.titulo}»`;
  if (/Traducción del Nuevo Mundo/.test(f.obra || '')) return f.titulo;
  return `«${f.obra || f.titulo}»`;
};
/** «zona probable: región de Babilonia, según Perspicacia «Estrella»»: lo que dicen la ficha y la leyenda de una zona.
    Según quién lo dice `according_to` de la zona, la fuente que la propone. */
const textoZona = BE.textoZona = (z) => `zona ${z.fuerza === 'possible' ? 'posible' : 'probable'}: ${z.nombre}${z.segun ? `, según ${fuenteCorta(z.segun)}` : ''}`;
function zonaArea(x, ancla, color, estado) {
  let z = zonasArea.get(x.s.key);
  if (!z) {
    z = { x, p: estado === 'abierta' ? 0 : 1, anim: null, estado, etiquetas: [] };
    const zonas = x.s.lugar.area.zonas;
    z.etiquetas = zonas.map((zo, i) => {
      const el = document.createElement('div');
      el.className = `area-desc area-desc--zona area-desc--${x.llega ? 'llega' : 'sale'}${i ? ' area-desc--otra' : ''}`;
      el.dataset.lado = x.llega ? 'llega' : 'sale';
      el.innerHTML = `<button type="button" class="area-desc__zona" data-sel="parada:${esc(x.s.key)}" aria-label="${esc(`${x.s.lugar.nombre}, ${textoZona(zo)}: ${x.llega ? 'origen' : 'destino'} de ${BE.nombreDueno(x.s.viaje)}`)}">
        <span class="area-desc__rotulo">${i ? '' : `<b>${esc(x.s.lugar.nombre)}</b>`}<small>${esc(i ? `o ${zo.nombre}` : `zona ${zo.fuerza === 'possible' ? 'posible' : 'probable'}: ${zo.nombre}`)}</small></span></button>`;
      return { el, zona: zo, marker: new maplibregl.Marker({ element: el, anchor: 'center' }).setLngLat(zo.centro).addTo(map) };
    });
    zonasArea.set(x.s.key, z);
    componerZonas.sucio = true;
  }
  if (z.color !== color || z.ancla?.[0] !== ancla[0] || z.ancla?.[1] !== ancla[1]) componerZonas.sucio = true;
  z.x = x; z.ancla = ancla; z.color = color;
  const zo = x.s.lugar.area.zonas[0];
  z.fila = `${x.llega ? 'Origen' : 'Destino'} de ${BE.nombreDueno(x.s.viaje)}: ${x.s.lugar.nombre}; ${textoZona(zo)}`;
  if (z.estado === estado) return;
  z.estado = estado;
  componerZonas.sucio = true;
  const meta = estado === 'abierta' ? 0 : 1;
  if (sinMovimiento()) { z.p = meta; z.anim = null; return; }
  // Si la zona no se ve, la animación va desde el borde del mapa, donde está su ficha, y no desde la zona de verdad.
  z.anim = { de: z.p, a: meta, t0: performance.now(), borde: !zonaEnVista(zo) };
  if (!componerZonas.raf) componerZonas.raf = requestAnimationFrame(pasoZonas);
}
function pasoZonas(ahora) {
  componerZonas.raf = 0;
  let siguen = false;
  for (const z of zonasArea.values()) {
    if (!z.anim) continue;
    const f = Math.min(1, (ahora - z.anim.t0) / (DURACION_AREA * Math.max(0.2, Math.abs(z.anim.a - z.anim.de))));
    z.p = z.anim.de + (z.anim.a - z.anim.de) * f;
    if (f >= 1) z.anim = null; else siguen = true;
  }
  componerZonas.sucio = true;
  componerZonas();
  if (siguen) componerZonas.raf = requestAnimationFrame(pasoZonas);
}
/** ¿Se ve alguna parte de la zona en el mapa? */
function zonaEnVista(zo) {
  const b = map.getBounds(), [[o, s], [e, n]] = zo.bbox;
  return !(e < b.getWest() || o > b.getEast() || n < b.getSouth() || s > b.getNorth());
}
/** Punto del borde del mapa, del lado de la zona, en píxeles: la recta del centro de lo visible al centro de la zona
    corta el rectángulo libre (sin la hoja, los márgenes ni lo que tapa el mapa, rellenoEncuadre). */
function puntoBorde(zo) {
  const c = map.getContainer(), pad = rellenoEncuadre();   // sin la hoja ni lo que tapa el mapa
  const caja = { x0: pad.left, y0: pad.top, x1: c.clientWidth - pad.right, y1: c.clientHeight - pad.bottom };
  const cx = (caja.x0 + caja.x1) / 2, cy = (caja.y0 + caja.y1) / 2;
  const q = map.project(zo.centro), dx = q.x - cx, dy = q.y - cy;
  const k = Math.min(dx ? Math.abs((dx > 0 ? caja.x1 - cx : cx - caja.x0) / dx) : Infinity, dy ? Math.abs((dy > 0 ? caja.y1 - cy : cy - caja.y0) / dy) : Infinity);
  return { x: cx + dx * k, y: cy + dy * k, angulo: (Math.atan2(dy, dx) * 180) / Math.PI };
}
/** Dibuja cada zona en su momento: p = 0, abierta en su sitio; p = 1, cerrada en la parada vecina. Al llegar acelera hacia
    la parada; al salir frena al abrirse. Con la zona fuera de la vista, la que se mueve es una copia de unos 120 px
    puesta en el borde del mapa. Solo escribe la fuente del mapa si algo cambió. */
function componerZonas() {
  componerZonas.sucio = false;
  const fs = [];
  for (const [k, z] of zonasArea) {
    const e = z.x.llega ? z.p * z.p : 1 - (1 - z.p) * (1 - z.p);
    const op = Math.max(0, 1 - z.p);
    z.x.s.lugar.area.zonas.forEach((zo, i) => {
      let ring = zo.ring, centro = zo.centro;
      if (z.anim?.borde) {
        const b = puntoBorde(zo), cc = map.unproject([b.x, b.y]), q = map.project(zo.centro);
        const ancho = Math.max(1, Math.abs(map.project([zo.bbox[1][0], zo.bbox[0][1]]).x - map.project(zo.bbox[0]).x));
        const f = 120 / ancho;
        centro = [cc.lng, cc.lat];
        ring = zo.ring.map((v) => { const w = map.project(v); const u = map.unproject([b.x + (w.x - q.x) * f, b.y + (w.y - q.y) * f]); return [u.lng, u.lat]; });
      }
      const hacia = ([lon, lat]) => [lon + (z.ancla[0] - lon) * e, lat + (z.ancla[1] - lat) * e];
      const props = { sel: `parada:${k}`, viaje: z.x.s.viaje.id, color: z.color, opacidad: op * (i ? 0.55 : 1) };
      if (!i) z.centro = hacia(centro);
      if (op > 0 && (!i || !z.anim?.borde)) {
        fs.push({ type: 'Feature', properties: props, geometry: { type: 'Polygon', coordinates: [ring.map(hacia)] } });
        if (!i) fs.push(linea([hacia(centro), z.ancla], props));
      }
      const m = z.etiquetas[i];
      m.marker.setLngLat(hacia(centro));
      m.el.style.setProperty('--viajero', z.color);
      m.el.style.opacity = String(op * (i ? 0.8 : 1));
      m.el.style.visibility = op > 0 && !(i && z.anim?.borde) ? '' : 'hidden';
      m.el.dataset.estado = z.estado;
    });
  }
  componerZonas.escrituras = (componerZonas.escrituras || 0) + 1;
  map.getSource('be-areas')?.setData({ type: 'FeatureCollection', features: fs });
  pintarChipsZona();
}
componerZonas.sucio = false;
/** La ficha del borde de cada zona abierta que no se ve: sus palabras, su conjetura y una flecha hacia ella. Pulsarla
    encuadra la zona con su parada vecina. */
function pintarChipsZona() {
  for (const [k, z] of zonasArea) {
    const zo = z.x.s.lugar.area.zonas[0];
    const ver = z.estado === 'abierta' && !z.anim && z.p === 0 && !zonaEnVista(zo);
    if (!ver) { if (z.chip) z.chip.hidden = true; continue; }
    if (!z.chip) {
      z.chip = document.createElement('button');
      z.chip.type = 'button';
      z.chip.className = 'area-chip';
      z.chip.dataset.area = k;
      z.chip.innerHTML = `<span class="area-chip__flecha" aria-hidden="true">➜</span><span><b>${esc(z.x.s.lugar.nombre)}</b> · ${esc(`zona ${zo.fuerza === 'possible' ? 'posible' : 'probable'}: ${zo.nombre}`)}</span>`;
      z.chip.setAttribute('aria-label', `${z.x.s.lugar.nombre}, ${textoZona(zo)}: ver la zona`);
      z.chip.addEventListener('click', (ev) => {
        ev.stopPropagation();
        const caja = cajaDe([...zo.bbox, z.ancla]);
        map.fitBounds(caja, { padding: rellenoEncuadre(caja), duration: 700 });
      });
      map.getContainer().appendChild(z.chip);
    }
    const b = puntoBorde(zo);
    z.chip.hidden = false;
    z.chip.style.setProperty('--viajero', z.color);
    z.chip.style.left = `${b.x}px`;
    z.chip.style.top = `${b.y}px`;
    z.chip.style.setProperty('--angulo', `${b.angulo}deg`);
    z.chip.dataset.lado = Math.abs(b.angulo) <= 45 ? 'este' : Math.abs(b.angulo) >= 135 ? 'oeste' : b.angulo > 0 ? 'sur' : 'norte';
  }
}
/** Esquinas de la zona conjeturada preferida de lo elegido (un viaje con áreas o la parada de un área), solo si caben con
    las paradas: el encuadre nunca aleja tanto el mapa que las paradas de verdad se junten (menos de 40 px entre las
    dos más alejadas). Si no caben, el encuadre se queda en las paradas y la zona se señala desde el borde. */
const SEPARACION_PARADAS = 40;
function puntosZonasSel(base) {
  const s = E.sel;
  if (!s || (s.tipo !== 'viaje' && s.tipo !== 'parada')) return [];
  const v = BE.D.viajes.find((x) => x.id === (s.tipo === 'viaje' ? s.id : s.id.split('/')[0]));
  if (!v || !viajesConArea().includes(v)) return [];
  const zona = areasDe(v).filter((x) => s.tipo === 'viaje' || x.s.key === s.id).flatMap((x) => (x.s.lugar.area?.zonas || []).slice(0, 1).flatMap((zo) => zo.bbox));
  if (!zona.length || base.length < 2) return zona;
  const caja = cajaDe([...base, ...zona]);
  const cam = map.cameraForBounds(caja, { padding: rellenoEncuadre(caja) });
  if (!cam) return [];
  const mundo = base.map((q) => mundo0(q));
  let lejos = 0;
  for (const a of mundo) for (const b of mundo) lejos = Math.max(lejos, Math.hypot(a.x - b.x, a.y - b.y));
  return lejos * 2 ** cam.zoom >= SEPARACION_PARADAS ? zona : [];
}
function marcaArea(x, pos, color, estado) {
  const { s, llega } = x;
  let m = marcasArea.get(s.key);
  if (!m) {
    const el = document.createElement('div');
    const rumbo = s.lugar.area?.rumbo, lejos = estrecha() ? AREA.lejosMovil : AREA.lejos;
    const g = rumbo != null ? RUMBO_GRADOS[rumbo] : null;
    const rad = g == null ? 0 : (g * Math.PI) / 180, dx = g == null ? 0 : lejos * Math.sin(rad), dy = g == null ? 0 : -lejos * Math.cos(rad);
    // El hilo va de la parada al borde del área: el radio de la elipse en esa dirección.
    const borde = (AREA.rx * AREA.ry) / Math.hypot(AREA.ry * Math.sin(rad), AREA.rx * Math.cos(rad));
    el.className = `area-desc area-desc--${llega ? 'llega' : 'sale'}${g == null ? ' area-desc--anillo' : ''}`;
    el.dataset.lado = llega ? 'llega' : 'sale';
    el.style.setProperty('--dx', `${dx.toFixed(1)}px`);
    el.style.setProperty('--dy', `${dy.toFixed(1)}px`);
    el.style.setProperty('--ang', `${g == null ? 0 : g - 90}deg`);
    el.style.setProperty('--hilo', `${g == null ? 0 : Math.max(0, lejos - borde - 4).toFixed(1)}px`);
    const nombre = s.lugar.nombre, nota = s.lugar.area ? 'la fuente no dice dónde' : 'sin ubicación conocida';
    el.innerHTML = `<span class="area-desc__hilo" aria-hidden="true"></span><button type="button" class="area-desc__zona" data-sel="parada:${esc(s.key)}"
      aria-label="${esc(`${nombre}, ${nota}: ${llega ? 'origen' : 'destino'} de ${BE.nombreDueno(s.viaje)}`)}"><span class="area-desc__forma" aria-hidden="true"></span>
      <span class="area-desc__rotulo"><b>${esc(nombre)}</b><small>${nota}</small></span></button>`;
    m = { el, marker: new maplibregl.Marker({ element: el, anchor: 'center' }).setLngLat(pos).addTo(map), estado: null,
      fila: `${llega ? 'Origen' : 'Destino'} de ${BE.nombreDueno(s.viaje)}: ${nombre}, ${nota}` };
    marcasArea.set(s.key, m);
  }
  m.marker.setLngLat(pos);
  m.el.style.setProperty('--viajero', color);
  if (m.estado === estado) return;
  // La primera vez se pone el estado sin transición; después, cada cambio la anima (salvo con movimiento reducido).
  const animar = m.estado !== null && !movimientoReducido();
  m.el.classList.toggle('area-desc--anima', animar);
  m.el.classList.toggle('area-desc--abierta', estado === 'abierta');
  m.el.classList.toggle('area-desc--cerrada', estado === 'cerrada');
  m.el.dataset.estado = estado;
  m.estado = estado;
}

// ---------------------------------------------------------------------------
// Cartas
// ---------------------------------------------------------------------------
/** ¿Se dibuja esta carta con el filtro de cartas actual? La selección siempre se ve. */
function cartaEnMapa(c, t) {
  if (E.sel?.tipo === 'carta' && E.sel.id === c.id) return true;
  if (!F.capas.cartas) return false;
  if (F.cartas === 'todas') return true;
  if (F.cartas === 'hasta') { const tr = tramo(c.fecha); return !!tr && tr[0] <= t; }
  if (F.cartas === 'personas') return !!(c.destinatarios?.personas?.length);
  return cartaVisible(c, t);
}
/** Semántica de v0 («cerca de esta fecha»), que usan también otras vistas. */
function cartaVisible(c, t) {
  if (E.sel?.tipo === 'carta' && E.sel.id === c.id) return true;
  const tr = tramo(c.fecha);
  return !!tr && t >= tr[0] - 1 && t < tr[1] + 1;
}
const ventanaDeCarta = (c) => ((c.escritor || 'pablo') === 'pablo' ? BE.ventanaCarta(c) : (BE.ventana(c.escritor, c.fecha, c.escrita_en) || tramo(c.fecha)));
function estadoCarta(c, t) {
  if (E.sel?.tipo === 'carta' && E.sel.id === c.id) return 'sel';
  const v = ventanaDeCarta(c);
  return v && t >= v[0] ? 'escrita' : 'pendiente';
}
const nombrePersona = (id) => BE.PERS[id]?.nombre || id;
function geoCartas(t) {
  const arcos = [], halos = [], oes = [], zonas = [], grupos = new Map(), zonasVistas = new Set();
  const zona = (id, color) => {
    const l = BE.L[id];
    if (zonasVistas.has(id) || !conPunto(l) || !(REGION.has(l.tipo) || l.precision === 'zona')) return;
    zonasVistas.add(id);
    zonas.push({ type: 'Feature', properties: { color }, geometry: { type: 'Polygon', coordinates: [l.shape?.ring || circulo(l.lat, l.lon, l.tipo === 'provincia' || l.tipo === 'region' ? 70 : 45)] } });
  };
  for (const c of BE.cartasOrdenadas()) {
    if (!cartaEnMapa(c, t)) continue;
    const estado = estadoCarta(c, t);
    const color = colorEscritor(c.escritor);
    const os = BE.origenesCarta(c).filter((id) => conPunto(BE.L[id])), ds = BE.destinosCarta(c).filter((id) => conPunto(BE.L[id]));
    os.forEach((id) => zona(id, color)); ds.forEach((id) => zona(id, color));
    // Varios lugares de escritura posibles (M-11): un arco fino y punteado los une.
    for (let i = 1; i < os.length; i++) oes.push(linea(arcoPts(coord(BE.L[os[0]]), coord(BE.L[os[i]]), 0.25), { color, id: c.id }));
    for (const o of os) {
      if (!ds.length) {
        halos.push({ type: 'Feature', properties: { id: c.id, color }, geometry: { type: 'Point', coordinates: coord(BE.L[o]) } });
        const k = `${o}|`;
        if (!grupos.has(k)) grupos.set(k, { cartas: [], pos: coord(BE.L[o]), sinDestino: true });
        grupos.get(k).cartas.push({ c, estado });
        continue;
      }
      for (const d of ds) {
        const pts = arco(BE.L[o], BE.L[d]);
        arcos.push(linea(pts, { id: c.id, estado, color }));
        const k = `${o}|${d}`;
        if (!grupos.has(k)) grupos.set(k, { cartas: [], pos: pts[16] });
        grupos.get(k).cartas.push({ c, estado });
      }
    }
  }
  // Cuando una carta tiene varios destinos, solo el primero lleva etiqueta.
  const vistos = new Set();
  for (const [k, g] of grupos) {
    g.cartas = g.cartas.filter(({ c }) => { const kk = `${c.id}@${k.split('|')[0]}`; if (vistos.has(kk)) return false; vistos.add(kk); return true; });
    if (!g.cartas.length) grupos.delete(k);
  }
  return { arcos, halos, oes, zonas, grupos };
}
function pintarEtiquetasCartas(grupos) {
  for (const [k, m] of marcasCarta) if (!grupos.has(k)) { m.marker.remove(); marcasCarta.delete(k); }
  for (const [k, g] of grupos) {
    let m = marcasCarta.get(k);
    if (!m) {
      const el = document.createElement('button');
      el.type = 'button';
      el.className = 'pildora-carta';
      const marker = new maplibregl.Marker({ element: el, anchor: g.sinDestino ? 'top' : 'center', offset: g.sinDestino ? [0, 14] : [0, 0] }).setLngLat(g.pos).addTo(map);
      m = { marker, el };
      marcasCarta.set(k, m);
    }
    const sel = g.cartas.find((x) => x.estado === 'sel');
    const principal = sel?.c || g.cartas[0].c;
    const texto = g.cartas.map(({ c }) => BE.abrCarta(c)).join(' · ');
    const fecha = fechaCorta(principal.fecha).replace(' e.c.', '');
    // Portadores (G-10): la flecha lleva su nombre cuando el texto dice quién llevó la carta.
    const lleva = (sel || g.cartas.length === 1) && principal.portadores?.length ? ` · la lleva${principal.portadores.length > 1 ? 'n' : ''} ${principal.portadores.map(nombrePersona).join(' y ')}` : '';
    m.el.dataset.sel = `carta:${principal.id}`;
    m.el.className = conMarcador(m.el, `pildora-carta${sel ? ' pildora-carta--sel' : ''}${g.cartas.every((x) => x.estado === 'pendiente') ? ' pildora-carta--pendiente' : ''}`);
    m.el.style.setProperty('--carta', colorEscritor(principal.escritor));
    m.el.innerHTML = `${esc(sel ? principal.libro : texto)} · ${esc(fecha)}${esc(lleva)}${g.sinDestino ? ' · destino no indicado' : ''}`;
    m.el.setAttribute('aria-label', `Carta: ${g.cartas.map(({ c }) => c.libro).join(', ')}${lleva}`);
  }
}

// ---------------------------------------------------------------------------
// Lugares inciertos (M-10, M-11, C-07, C-09): zonas, franjas, puntos candidatos con su estado y el abanico que los une.
// Como los demás lugares, solo se dibujan los que tienen algo en el tramo de fecha a la vista, además de los que implica
// la selección; cada uno se ilumina cuando uno de sus sucesos cae en el cursor.
// ---------------------------------------------------------------------------
let claveInciertos = '';
const lugaresInciertos = () => Object.values(BE.L).filter((l) => candidatosDe(l));
function activoEnFecha(id, t) {
  return (BE.D.eventos || []).some((e) => (e.lugares || []).includes(id) && (() => { const v = BE.ventanaEvento(e); return v && t >= v[0] - 0.5 && t < v[1] + 0.5; })());
}
function centroCandidato(c) { const g = c.geometria; return g.tipo === 'franja' ? [(g.lon + g.hasta.lon) / 2, (g.lat + g.hasta.lat) / 2] : [g.lon, g.lat]; }
function pintarInciertos() {
  const selL = E.sel?.tipo === 'lugar' ? E.sel.id : null;
  const res = resaltadoMapa ?? E.resaltado?.lugares;
  const ventana = ventanaRelevante();
  const lista = lugaresInciertos().filter((l) => l.id === selL || res?.has(l.id) || candFoco?.lugar === l.id || (F.capas.inciertos && enTiempo(l.id, ventana)));
  const activos = new Set(lista.filter((l) => activoEnFecha(l.id, E.t)).map((l) => l.id));
  const clave = `${lista.map((l) => l.id)}|${selL}|${[...activos]}|${F.nivel1}|${F.capas.pendientes}|${candFoco?.lugar}:${candFoco?.i}|${res ? [...res].join(',') : ''}`;
  if (clave === claveInciertos) return;
  claveInciertos = clave;
  const zonas = [], lineasC = [], vivas = new Set();
  for (const l of lista) {
    const foco = l.id === selL || res?.has(l.id);
    const op = foco || activos.has(l.id) ? 1 : (selL || res ? 0.3 : 0.6);
    const cs = candidatosVisibles(l);
    for (const { c, i } of cs) {
      const g = c.geometria, s = CAND[c.estado] || CAND.alternativa;
      const enfocado = candFoco && candFoco.lugar === l.id && candFoco.i === i;
      const props = { lugar: l.id, i, estado: c.estado, color: s.color, trazo: s.trazo, opacidad: enfocado ? 1 : op };
      // Una zona con forma (`shape`: elipse, caja o polígono) dibuja su contorno, que trae data.json; sin ella, su círculo.
      if (g.tipo === 'zona') zonas.push({ type: 'Feature', properties: props, geometry: { type: 'Polygon', coordinates: [c.shape?.ring || circulo(g.lat, g.lon, g.radio_km)] } });
      else if (g.tipo === 'franja') lineasC.push(linea([[g.lon, g.lat], [g.hasta.lon, g.hasta.lat]], { ...props, clase: 'franja' }));
      if (g.tipo !== 'zona') {
        const k = `${l.id}|${i}`; vivas.add(k);
        marcaCandidato(k, l, c, i, g.tipo === 'franja' ? centroCandidato(c) : [g.lon, g.lat], op, enfocado, foco);
      }
    }
    const vivos = cs.filter(({ c }) => c.estado !== 'descartado_nivel_1');
    for (let k = 1; k < vivos.length; k++) lineasC.push(linea(arcoPts(centroCandidato(vivos[0].c), centroCandidato(vivos[k].c), 0.2), { clase: 'abanico', opacidad: op * 0.9, color: '#7a5c8e' }));
    // Rótulo de la zona: nombre y cuántos candidatos, en el candidato preferido.
    if (cs.length) {
      const k = `${l.id}|`; vivas.add(k);
      rotuloZona(k, l, cs, op, foco);
    }
  }
  for (const [k, m] of marcasCand) if (!vivas.has(k)) { m.marker.remove(); marcasCand.delete(k); }
  map.getSource('be-zonas').setData({ type: 'FeatureCollection', features: zonas });
  map.getSource('be-cand-lineas').setData({ type: 'FeatureCollection', features: lineasC });
  sucio.etiquetas = true;
}
let claveFormas = '';
/** Formas de los lugares con punto que la tienen: la del lugar elegido y las de los lugares que resalta la selección.
    El color sale de --tier1, que cambia con el modo reunión. */
function pintarFormas() {
  const selL = E.sel?.tipo === 'lugar' ? E.sel.id : null;
  const res = resaltadoMapa ?? E.resaltado?.lugares;
  const ids = [...new Set([selL, ...(res || [])])].filter((id) => conPunto(BE.L[id]) && BE.L[id].shape?.ring);
  const color = cssVar('--tier1') || '#2a5d78';
  const clave = `${ids}|${color}`;
  if (clave === claveFormas) return;
  claveFormas = clave;
  map.getSource('be-formas').setData({ type: 'FeatureCollection', features: ids.map((id) => ({ type: 'Feature', properties: { lugar: id, color }, geometry: { type: 'Polygon', coordinates: [BE.L[id].shape.ring] } })) });
  sucio.etiquetas = true;
}
function marcaCandidato(k, l, c, i, pos, op, enfocado, foco = false) {
  let m = marcasCand.get(k);
  if (!m) {
    const el = document.createElement('button');
    el.type = 'button';
    el.addEventListener('click', (e) => { e.stopPropagation(); elegirCandidato(l.id, i); });
    m = { el, marker: new maplibregl.Marker({ element: el, anchor: 'center' }).setLngLat(pos).addTo(map) };
    marcasCand.set(k, m);
  }
  m.marker.setLngLat(pos);
  const s = CAND[c.estado] || CAND.alternativa;
  m.el.className = conMarcador(m.el, `cand cand--${c.estado}${enfocado ? ' cand--foco' : ''}${foco ? ' cand--del-foco' : ''}`);
  m.el.style.setProperty('--cand', s.color);
  m.el.style.opacity = String(Math.max(op, 0.45));
  m.el.setAttribute('aria-label', `${l.nombre}, candidato: ${c.nombre} (${s.rotulo})`);
  const html = `<span class="cand-punto" aria-hidden="true"></span><span class="cand-rotulo"><b>${esc(c.nombre)}</b><small>${esc(s.corto)}</small></span>`;
  if (m.el.dataset.html !== html) { m.el.innerHTML = html; m.el.dataset.html = html; }
}
function rotuloZona(k, l, cs, op, foco) {
  let m = marcasCand.get(k);
  const favorito = cs.find(({ c }) => c.estado === 'seguro' || c.estado === 'favorecido_nivel_1') || cs[0];
  const pos = centroCandidato(favorito.c);
  if (!m) {
    const el = document.createElement('button');
    el.type = 'button';
    el.addEventListener('click', (e) => { e.stopPropagation(); if (!(E.sel?.tipo === 'lugar' && E.sel.id === l.id)) seleccionar({ tipo: 'lugar', id: l.id }); });
    m = { el, marker: new maplibregl.Marker({ element: el, anchor: 'top', offset: [0, 10] }).setLngLat(pos).addTo(map) };
    marcasCand.set(k, m);
  }
  m.marker.setLngLat(pos);
  m.el.className = conMarcador(m.el, `be-zone-label rotulo-zona${foco ? ' rotulo-zona--foco' : ''}`);
  m.el.style.opacity = String(Math.max(op, 0.5));
  m.el.innerHTML = `${esc(nombreEn(l, E.t))} · ${cs.length > 1 ? `${cs.length} candidatos` : 'ubicación incierta'}`;
  m.el.setAttribute('aria-label', `${l.nombre}: ubicación incierta, ver por qué`);
}
/** Pulsar una zona o un candidato: abre la ficha del lugar y marca ese candidato en ella y en el mapa. */
function elegirCandidato(lugar, i) {
  // Como un lugar pulsado en el mapa (base.js): el cursor solo se mueve si nada del lugar cae en la vista de la línea.
  if (!(E.sel?.tipo === 'lugar' && E.sel.id === lugar)) seleccionar({ tipo: 'lugar', id: lugar }, { mover: !!BE.lugarFueraDeVista?.(lugar), encuadrar: false });
  enfocarCandidato(lugar, i, false);
}
/** Marca un candidato (desde su fila en la ficha o desde el mapa). Con volar, el mapa va hasta él. */
function enfocarCandidato(lugar, i, volar = true) {
  candFoco = { lugar, i: +i };
  claveInciertos = '';
  const c = candidatosDe(BE.L[lugar])?.[+i];
  if (c && volar && map) {
    const g = c.geometria;
    if (g.tipo === 'zona') { const caja = c.shape?.bbox || cajaDe([[g.lon, g.lat]], g.radio_km); repintarParaEncuadrar(); map.fitBounds(caja, { padding: rellenoEncuadre(caja), maxZoom: g.radio_km < 3 ? 12 : 8, duration: 700 }); }
    else map.easeTo({ center: centroCandidato(c), zoom: Math.max(map.getZoom(), 7), duration: 700 });
  }
  document.querySelectorAll('#panel-cuerpo [data-cand]').forEach((el) => {
    const on = el.dataset.cand === `${lugar}|${i}`;
    el.classList.toggle('candidato--foco', on);
    if (on && !volar) el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  });
  sucio.mapa = true; programar();
}

// ---------------------------------------------------------------------------
// Hallazgos (F-07): una marca por lugar de hallazgo, con cuántos hay
// ---------------------------------------------------------------------------
function pintarHallazgos() {
  const selH = E.sel?.tipo === 'hallazgo' ? E.sel.id : null;
  const selL = E.sel?.tipo === 'lugar' ? E.sel.id : null;
  const ventana = ventanaRelevante();
  // Como los lugares: el hallazgo se ve si su fecha cae en el tramo a la vista, o si es de lo seleccionado.
  const hs = (BE.D.hallazgos || []).filter((h) => conPunto(BE.L[h.lugar_hallazgo]) && (F.capas.pendientes || h.estado !== 'pendiente')
    && (h.id === selH || h.lugar_hallazgo === selL || E.resaltado?.claves?.has(`hallazgo:${h.id}`) || cruza(tramo(h.fecha_objeto), ventana)));
  const ver = F.capas.hallazgos || selH;
  const clave = `${hs.map((h) => h.id)}|${selH}|${F.capas.hallazgos}|${F.capas.pendientes}`;
  if (clave === pintarHallazgos.clave) return;
  pintarHallazgos.clave = clave;
  const porLugar = new Map();
  if (ver) for (const h of hs) { if (!F.capas.hallazgos && h.id !== selH) continue; if (!porLugar.has(h.lugar_hallazgo)) porLugar.set(h.lugar_hallazgo, []); porLugar.get(h.lugar_hallazgo).push(h); }
  for (const [k, m] of marcasHallazgo) if (!porLugar.has(k)) { m.marker.remove(); marcasHallazgo.delete(k); }
  for (const [lid, lista] of porLugar) {
    let m = marcasHallazgo.get(lid);
    if (!m) {
      const el = document.createElement('button');
      el.type = 'button';
      m = { el, marker: new maplibregl.Marker({ element: el, anchor: 'bottom-left', offset: [5, -5] }).setLngLat(coord(BE.L[lid])).addTo(map) };
      marcasHallazgo.set(lid, m);
    }
    m.el.className = conMarcador(m.el, `marca-hallazgo${lista.some((h) => h.id === selH) ? ' marca-hallazgo--sel' : ''}`);
    m.el.dataset.sel = lista.length === 1 ? `hallazgo:${lista[0].id}` : `lugar:${lid}`;
    m.el.innerHTML = `<span aria-hidden="true"></span>${lista.length > 1 ? `<b>${lista.length}</b>` : ''}`;
    m.el.setAttribute('aria-label', lista.length === 1 ? `Hallazgo: ${lista[0].nombre}` : `${lista.length} hallazgos en ${BE.L[lid].nombre}`);
    m.el.title = lista.map((h) => h.nombre).join(' · ');
  }
}

// ---------------------------------------------------------------------------
// Marcas de lugar
// ---------------------------------------------------------------------------
function claseLugar(l) {
  if (REGION.has(l.tipo)) return 'region';
  if (AGUA.has(l.tipo)) return 'agua';
  if (l.precision === 'incierto') return 'difuso';
  if (l.tipo === 'monte') return 'monte';
  return 'punto';
}
function crearMarcas() {
  for (const l of Object.values(BE.L)) {
    if (!conPunto(l)) continue;
    const id = l.id, clase = claseLugar(l);
    const el = document.createElement('button');
    el.type = 'button';
    el.dataset.sel = `lugar:${id}`;
    el.className = clase === 'region' ? 'marca-region' : clase === 'agua' ? 'marca-agua' : `marca-lugar${clase === 'punto' ? '' : ` marca-lugar--${clase}`}`;
    el.setAttribute('aria-label', `${l.nombre}: abrir ficha`);
    el.innerHTML = clase === 'region' ? `<span class="region-texto">${esc(l.nombre)}</span>` : clase === 'agua' ? `<span class="etiqueta agua-texto"><span class="nombre-a">${esc(l.nombre)}</span></span>` : `<span class="punto"></span><span class="etiqueta"><span class="nombre-a">${esc(l.nombre)}</span></span>`;
    const marker = new maplibregl.Marker({ element: el, anchor: 'center' }).setLngLat([l.lon, l.lat]).addTo(map);
    marcasLugar.set(id, { marker, el, l, clase, region: clase === 'region', hoy: nombreHoy(l) });
  }
  const p = document.createElement('div');
  p.className = 'pablo';
  p.innerHTML = '<span class="pablo-halo"></span><span class="pablo-punto"></span><span class="pablo-rotulo">Pablo<small>posición estimada</small></span>';
  marcaPablo = new maplibregl.Marker({ element: p, anchor: 'center' }).setLngLat([0, 0]);
  const q = document.createElement('button');
  q.type = 'button'; q.className = 'proxima';
  marcaProxima = new maplibregl.Marker({ element: q, anchor: 'bottom', offset: [0, -14] }).setLngLat([0, 0]);
  q.addEventListener('click', (e) => { e.stopPropagation(); const s = BE.P.find((x) => x.key === q.dataset.key); if (s) { setT((s.a + s.b) / 2); asegurarVisible(E.t, false); } });
}
function nombreHoy(l) {
  // Los datos marcan el nombre moderno solo en la nota («Nombre actual…», «Ciudad moderna…», «…identifica hoy»).
  const n = (l?.nombres || []).find((x) => x.desde == null && x.hasta == null && /\bhoy\b|actual|modern/i.test(x.nota || ''));
  return n ? n.nombre : null;
}
/** Nombre del lugar en la fecha t (G-11): el de `nombres` cuya época la cubre; si ninguno, el nombre principal. */
/** Nombre del lugar en la fecha t. Un nombre con fechas dice que se usaba entonces, no que sustituyera al principal
    («Ciudad de David» desde 1070 a.e.c. no deja de ser Jerusalén). Solo se cambia de nombre cuando los datos fechan
    también el principal y t cae fuera de su época (Afec antes de Antípatris). */
const enEpoca = (x, t) => (x.desde == null || t >= x.desde) && (x.hasta == null || t < x.hasta + 1);
function nombreEn(l, t) {
  const fechados = (l?.nombres || []).filter((x) => x.desde != null || x.hasta != null);
  const propio = fechados.filter((x) => x.nombre === l.nombre);
  if (!propio.length || propio.some((x) => enEpoca(x, t))) return l.nombre;
  const n = fechados.find((x) => x.nombre !== l.nombre && enEpoca(x, t));
  return n ? n.nombre : l.nombre;
}
const lugaresConEpoca = () => Object.values(BE.L).filter((l) => (l.nombres || []).some((n) => n.desde != null || n.hasta != null));

let clavePablo = '', claveEpocas = '', claveTiempo = '';
function pintarMapa() {
  if (!mapaListo || !marcaPablo) return;
  const t = E.t;
  const w = BE.dondeEsta(t);
  const g = geoRutas(w);
  const V = g.V;
  const soloViaje = E.sel?.tipo === 'viaje' ? E.sel.id : null;     // un viaje seleccionado oculta los demás
  const verViajes = F.capas.viajes || soloViaje;
  const filtra = (fs) => (!verViajes ? [] : soloViaje ? fs.filter((f) => f.properties.viaje === soloViaje) : fs);
  g.hecho = filtra(g.hecho); g.falta = filtra(g.falta); g.rastro = filtra(g.rastro);
  g.rastroVisible = [...new Set(g.rastro.map((f) => f.properties.viaje))].map((id) => BE.D.viajes.find((v) => v.id === id)).filter(Boolean);
  map.getSource('be-hecho').setData({ type: 'FeatureCollection', features: g.hecho });
  map.getSource('be-falta').setData({ type: 'FeatureCollection', features: g.falta });
  map.getSource('be-rastro').setData({ type: 'FeatureCollection', features: g.rastro });
  const { arcos, halos, oes, zonas, grupos } = geoCartas(t);
  // El color de las cartas de Pablo sale de --gold, que cambia con el modo reunión: la clase de la raíz entra en la clave,
  // y el rayado de sus zonas se vuelve a pintar con el color nuevo.
  const clase = document.documentElement.className;
  if (clase !== pintarMapa.clase) {
    if (pintarMapa.clase !== undefined && map.hasImage('be-rayado-carta')) map.updateImage('be-rayado-carta', imagenRayado(cssVar('--gold') || '#1f3b30', 'alternativa'));
    pintarMapa.clase = clase;
  }
  const claveCartas = [...grupos.keys()].join(',') + arcos.map((a) => a.properties.estado).join('') + E.sel?.id + clase;
  if (claveCartas !== pintarMapa.claveCartas) {
    pintarMapa.claveCartas = claveCartas;
    map.getSource('be-cartas').setData({ type: 'FeatureCollection', features: arcos });
    map.getSource('be-cartas-o').setData({ type: 'FeatureCollection', features: oes });
    map.getSource('be-halo').setData({ type: 'FeatureCollection', features: halos });
    map.getSource('be-zonas-carta').setData({ type: 'FeatureCollection', features: zonas });
    pintarEtiquetasCartas(grupos);
    sucio.etiquetas = true;
  }
  pintarInciertos();
  pintarFormas();
  pintarHallazgos();
  pintarRepite(g);
  pintarAreas(soloViaje, verViajes, V);
  // Pablo
  if (w?.pos && verViajes && (!soloViaje || soloViaje === V?.id)) {
    marcaPablo.setLngLat(w.pos);
    if (!marcaPablo.puesta) { marcaPablo.addTo(map); marcaPablo.puesta = true; }
    marcaPablo.getElement().classList.toggle('estimada', !!(w.estimada || w.incierto));
    const sig = w.parada ? BE.P[w.en.g + 1] : w.sig;
    const vSig = sig && verticeRuta(sig.lugar);
    if (sig && sig.viaje === V && vSig) {
      const q = marcaProxima.getElement();
      if (q.dataset.key !== sig.key) {
        q.dataset.key = sig.key;
        q.innerHTML = `<span class="proxima-icono" aria-hidden="true">›</span>Próxima: <b>${esc(sig.lugar.nombre)}</b> <span class="proxima-ref">${esc(sig.p.referencia)}</span>`;
        q.setAttribute('aria-label', `Ir a la próxima parada: ${sig.lugar.nombre}`);
        marcaProxima.setLngLat(vSig.c);
      }
      if (!marcaProxima.puesta) { marcaProxima.addTo(map); marcaProxima.puesta = true; }
    } else if (marcaProxima.puesta) { marcaProxima.remove(); marcaProxima.puesta = false; }
  } else {
    if (marcaPablo.puesta) { marcaPablo.remove(); marcaPablo.puesta = false; }
    if (marcaProxima.puesta) { marcaProxima.remove(); marcaProxima.puesta = false; }
  }
  pintarViajeros(verViajes);
  const clave = `${V?.id}|${w?.en.key}|${w?.parada}`;
  if (clave !== clavePablo) { clavePablo = clave; sucio.etiquetas = true; }
  // El nombre de un lugar cambia con la fecha (G-11): si cambia alguno, se reescriben las etiquetas.
  const ep = lugaresConEpoca().map((l) => nombreEn(l, t)).join('|');
  if (ep !== claveEpocas) { claveEpocas = ep; sucio.etiquetas = true; }
  // Los lugares que se ven dependen de la fecha y del tramo de la línea de tiempo.
  const ventana = ventanaRelevante();
  const kt = [...marcasLugar.keys()].filter((id) => enTiempo(id, ventana)).join(',');
  if (kt !== claveTiempo) { claveTiempo = kt; sucio.etiquetas = true; }
  pintarLeyenda(V, w, g);
  pintarMientras(t);
  if (E.play && w?.pos) seguir(w.pos);
  vigilarSalto();
}
/** Marcadores de otras personas con viajes (Pedro, Jesús…) cuando BE.donde sabe dónde están. */
function pintarViajeros(ver) {
  // Un grupo (el Arca) no lleva marcador: solo su ruta.
  const personas = new Set(BE.D.viajes.map(BE.duenoViaje).filter((p) => !BE.esGrupo(p)));
  personas.delete('pablo');
  for (const p of personas) {
    const w = ver ? BE.donde(p, E.t) : null;
    let m = marcasViajero.get(p);
    if (!w?.pos) { if (m?.puesta) { m.marker.remove(); m.puesta = false; } continue; }
    if (!m) {
      const el = document.createElement('button');
      el.type = 'button'; el.className = 'viajero'; el.dataset.sel = `persona:${p}`;
      el.innerHTML = `<span class="viajero-punto"></span><span class="viajero-rotulo">${esc(nombrePersona(p))}</span>`;
      el.style.setProperty('--accent', colorPersona(p));
      m = { el, marker: new maplibregl.Marker({ element: el, anchor: 'center' }), puesta: false };
      marcasViajero.set(p, m);
    }
    m.marker.setLngLat(w.pos);
    // Fecha estimada o lugar incierto (un candidato o el punto de una región): el mismo aspecto de posición estimada.
    m.el.classList.toggle('estimada', !!(w.estimada || w.incierto));
    if (!m.puesta) { m.marker.addTo(map); m.puesta = true; }
  }
}
/** Alto que tapa la hoja inferior en pantallas estrechas. La fila del suceso y la leyenda va dentro de la hoja, así que
    cuenta también plegada; 12 px de aire. */
function altoHoja() {
  if (!estrecha()) return 0;
  // La hoja de lectura (46vh) tapa más que la de la ficha cuando está abierta.
  const lec = document.getElementById('vista-lectura');
  return Math.max($('#panel').offsetHeight, lec && !lec.hidden ? lec.offsetHeight : 0) + 12;
}
/** Parte del mapa que se ve de verdad, en píxeles del contenedor: sin el relleno propio del mapa (grafo, conexión y
    lectura tapan la izquierda en escritorio, estudio.relleno de grafo.js) ni la hoja inferior del móvil. */
function zonaLibre() {
  const c = map.getContainer(), pad = map.getPadding();
  return { x0: pad.left, x1: c.clientWidth - pad.right, y0: pad.top, y1: c.clientHeight - Math.max(pad.bottom, altoHoja()) };
}
/** Si Pablo se acerca al borde (12 %) de la parte libre (zonaLibre), el mapa lo recentra en ella. */
function seguir(pos, forzar = false) {
  if (!mapaListo || (!forzar && map.isMoving())) return;
  const hoja = altoHoja();
  const z = zonaLibre(), p = map.project(pos);
  const mx = (z.x1 - z.x0) * 0.12, my = (z.y1 - z.y0) * 0.12;
  if (p.x < z.x0 + mx || p.x > z.x1 - mx || p.y < z.y0 + my || p.y > z.y1 - my) {
    map.easeTo({ center: pos, offset: [0, -hoja / 2], duration: 900 });
  }
}
/** Tras un salto en el tiempo, Pablo no puede quedar fuera. Si los datos no lo sitúan en esa fecha y no hay selección,
    el mapa enseña la época (encuadrarEpoca), si no se ve ya. Una estancia en un lugar sin dónde dibujarlo cuenta como
    sin situar. */
function seguirPablo() {
  tSalto = E.t;
  const w = BE.dondeEsta(E.t);
  if (w?.pos) seguir(w.pos, true);
  else if (!E.sel) encuadrarEpoca(E.t, { siVisible: true });
}
/** Un salto grande en el tiempo sin selección (una fecha escrita, un año buscado, un clic lejano en la pista a escala de
    milenios) reencuadra como seguirPablo, un momento después de que el cursor se pare. Reproducir y arrastrar poco a poco
    no reencuadran: se compara cada fotograma con el anterior, y cada uno avanza menos que SALTO por muchos años que sumen.
    Un paso pequeño justo después de un salto cancela el reencuadre pendiente: ya se está arrastrando. */
const SALTO = 20;
let tSalto = null, saltoTimer = 0;
function vigilarSalto() {
  const d = tSalto == null ? 0 : Math.abs(E.t - tSalto);
  tSalto = E.t;
  if (E.sel || E.play) { clearTimeout(saltoTimer); return; }
  if (d === 0) return;
  clearTimeout(saltoTimer);
  if (d < SALTO) return;
  saltoTimer = setTimeout(() => { if (!E.sel && !E.play && mapaListo) seguirPablo(); }, 300);
}

// ---------------------------------------------------------------------------
// Relevancia en el tiempo: el mapa solo dibuja los lugares que tienen algo (suceso, periodo, parada, carta, hallazgo,
// persona que vivió allí) en el tramo que enseña la línea de tiempo, como mucho 250 años a cada lado del cursor y
// nunca menos de medio año. Lo que implica la selección, el viaje en curso y las cartas dibujadas se ven siempre.
// ---------------------------------------------------------------------------
const MEDIO_TRAMO = 250;
let tramosCache = null;
/** Tramos [a, b] de los hechos fechados de un lugar (BE.hechosDe de tipos/lugar.js), una vez por carga de datos. */
function tramosDe(id) {
  if (!tramosCache || tramosCache.D !== BE.D) tramosCache = { D: BE.D, m: new Map() };
  let v = tramosCache.m.get(id);
  if (!v) { v = (BE.hechosDe?.(id) || []).map((h) => h.tr).filter(Boolean); tramosCache.m.set(id, v); }
  return v;
}
function ventanaRelevante() {
  const t = E.t, [v0, v1] = E.vista;
  return [Math.min(t - 0.5, Math.max(v0, t - MEDIO_TRAMO)), Math.max(t + 0.5, Math.min(v1, t + MEDIO_TRAMO))];
}
const cruza = (tr, w) => !!tr && tr[0] <= w[1] && tr[1] >= w[0];
const enTiempo = (id, w = ventanaRelevante()) => tramosDe(id).some((tr) => cruza(tr, w));

// ---------------------------------------------------------------------------
// Etiquetas: estados, nombres por época y de hoy (M-03, G-11), reparto sin solapes por importancia (M-14) y
// agrupación de puntos cercanos (M-15). Las dos cosas son fijas para cada zoom y monótonas: al acercarse, un grupo
// solo se parte y un rótulo que ya se veía no se esconde. Para eso cada rótulo tiene un tramo de zoom [desde, hasta)
// calculado de una vez, no en cada fotograma: dos rótulos se tocan en pantalla por debajo de cierto zoom, porque la
// distancia en píxeles entre sus anclas crece con 2^zoom y su tamaño no cambia.
// ---------------------------------------------------------------------------
function etiquetaHtml(m) {
  const l = m.l;
  const antiguo = nombreEn(l, E.t), hoy = m.hoy;
  let a = antiguo, b = '';
  if (F.nombres === 'actuales') a = hoy || antiguo;
  else if (F.nombres === 'ambos' && hoy) {
    if (E.mapa === 'actual') { a = hoy; b = antiguo; } else b = `hoy ${hoy}`;
  }
  if (m.clase === 'difuso') b = 'ubicación incierta';
  return `<span class="nombre-a">${esc(a)}</span>${b ? `<small class="nombre-b">${esc(b)}</small>` : ''}`;
}
/** Posición en píxeles del mundo a zoom 0 (teselas de 512 px). A zoom z, la distancia en pantalla es esta por 2^z. */
function mundo0(pos) { const c = maplibregl.MercatorCoordinate.fromLngLat(pos); return { x: c.x * 512, y: c.y * 512 }; }
const NIVEL_MIN = 2, NIVEL_MAX = 14, RADIO_GRUPO = 16;
/** Agrupación anidada, como supercluster: se empieza con cada punto suelto al zoom 14 y, bajando de nivel en nivel,
    se juntan los grupos que quedan a menos de 16 px. Un grupo de un nivel es la unión de grupos del nivel de encima, así
    que al acercarse un grupo solo se parte. Devuelve, para cada punto, el zoom desde el que va suelto, y las burbujas
    ({ ids, pos, desde, hasta }) de los grupos de tres o más. */
let cacheGrupos = { clave: null };
function agrupamiento(puntos) {
  const clave = puntos.map((p) => p.id).join(',');
  if (cacheGrupos.clave === clave) return cacheGrupos;
  const w = puntos.map((p) => mundo0(p.pos));
  let grupos = puntos.map((_, i) => ({ ids: [i], x: w[i].x, y: w[i].y }));
  const libre = new Map(puntos.map((p) => [p.id, -Infinity]));
  const burbujas = new Map();         // clave de miembros → burbuja
  for (let n = NIVEL_MAX; n >= NIVEL_MIN; n--) {
    const s = 2 ** n, usado = new Set(), nuevos = [];
    for (let i = 0; i < grupos.length; i++) {
      if (usado.has(i)) continue;
      const g = grupos[i], junta = [g];
      for (let j = i + 1; j < grupos.length; j++) {
        if (!usado.has(j) && Math.hypot((grupos[j].x - g.x) * s, (grupos[j].y - g.y) * s) < RADIO_GRUPO) { usado.add(j); junta.push(grupos[j]); }
      }
      const ids = junta.flatMap((x) => x.ids).sort((a, b) => a - b);
      nuevos.push({ ids, x: ids.reduce((t, k) => t + w[k].x, 0) / ids.length, y: ids.reduce((t, k) => t + w[k].y, 0) / ids.length });
    }
    grupos = nuevos;
    for (const g of grupos) {
      if (g.ids.length < 3) continue;
      for (const k of g.ids) libre.set(puntos[k].id, Math.max(libre.get(puntos[k].id), n + 1));
      const k = g.ids.join(',');
      const b = burbujas.get(k);
      if (b) b.desde = n;
      else {
        const ms = g.ids.map((i) => puntos[i]);
        burbujas.set(k, { ids: ms.map((p) => p.id), pos: [ms.reduce((t, p) => t + p.pos[0], 0) / ms.length, ms.reduce((t, p) => t + p.pos[1], 0) / ms.length], desde: n, hasta: n + 1 });
      }
    }
  }
  const lista = [...burbujas.values()];
  for (const b of lista) if (b.desde === NIVEL_MIN) b.desde = -Infinity;
  cacheGrupos = { clave, libre, burbujas: lista };
  return cacheGrupos;
}
/** Tramo de zoom (zlo, zhi) en que se tocan dos cajas { x0, x1, y0, y1 } (px, relativas a su ancla) con anclas a y b
    en píxeles de zoom 0; null si nunca se tocan. */
function choqueZoom(A, B) {
  const tramoEje = (d, lo, hi) => {
    if (Math.abs(d) < 1e-9) return lo < 0 && hi > 0 ? [0, Infinity] : null;
    return d > 0 ? [Math.max(0, lo / d), hi / d] : [Math.max(0, hi / d), lo / d];
  };
  const ex = tramoEje(B.w.x - A.w.x, A.caja.x0 - 3 - B.caja.x1, A.caja.x1 + 3 - B.caja.x0);
  const ey = tramoEje(B.w.y - A.w.y, A.caja.y0 - 1 - B.caja.y1, A.caja.y1 + 1 - B.caja.y0);
  if (!ex || !ey) return null;
  const s0 = Math.max(ex[0], ey[0]), s1 = Math.min(ex[1], ey[1]);
  if (!(s1 > s0)) return null;
  return [s0 > 0 ? Math.log2(s0) : -Infinity, Math.log2(s1)];
}
/** Reparto fijo: recorre los rótulos en orden (primero los que se ven siempre, luego por el zoom en que aparecen, por
    importancia y, a igual importancia, el lugar con más hechos) y recorta el tramo [desde, hasta) de cada uno para que
    no pise a los anteriores. Uno que aparece al acercarse empieza después de su último choque; uno con fin (regiones,
    agua) acaba antes de su primer choque. */
function repartir(items, burbujas) {
  const orden = [...items].sort((a, b) => (b.prio >= 90) - (a.prio >= 90) || (a.prio >= 90 ? b.prio - a.prio : 0)
    || (a.hasta < Infinity) - (b.hasta < Infinity) || a.desde - b.desde || b.prio - a.prio || (b.peso || 0) - (a.peso || 0) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const puestos = [];
  const recortar = (x, otro) => {
    const c = choqueZoom(otro, x);
    // Un choque que solo pasaría por encima del zoom máximo no cuenta: los números de un recorrido van anclados a unos
    // píxeles de su lugar y, a zoom 20, acababan pisando su nombre y escondían Jerusalén y Betania a cualquier zoom.
    if (!c || c[0] >= ZOOM_MAX) return;
    const bs = Math.max(otro.d, c[0]), be = Math.min(otro.h, c[1]);
    if (!(be > bs) || be <= x.d || bs >= x.h) return;
    if (x.hasta === Infinity || bs <= x.d) x.d = Math.max(x.d, be); else x.h = Math.min(x.h, bs);
  };
  for (const x of items) { x.d = x.desde; x.h = x.hasta; }
  const obstaculos = items.filter((x) => x.obstaculo);
  for (const x of orden) {
    if (x.obstaculo) { puestos.push(x); continue; }   // un punto que se dibuja siempre no cede su sitio
    // Las burbujas solo apartan a lo secundario (< 50); lo del viaje o de la selección se dibuja encima de ellas.
    if (x.prio < 50) for (const b of burbujas) recortar(x, b);
    // Los puntos de candidatos y hallazgos apartan a todos los rótulos de candidatos y zonas, vayan antes o después en
    // el orden (el nombre «ʽAmwas» no pasa por encima del punto de El-Qubeiba). A un nombre de lugar solo lo apartan los
    // puntos del lugar elegido o de la parada; los demás quedan debajo de él (z-index 1), como Betfagué junto al monte
    // de los Olivos.
    if (x.cand) for (const p of obstaculos) { if (x.d >= x.h) break; if (p.el !== x.el) recortar(x, p); }
    for (const p of puestos) { if (x.d >= x.h) break; if (!p.obstaculo || p.exento) recortar(x, p); }
    if (x.d < x.h) puestos.push(x);
  }
}
const firma = (el) => [...el.classList].filter((c) => c !== 'sin-etiqueta' && c !== 'agrupado' && c !== 'cand--junto' && !c.startsWith('maplibregl-')).join('.');
function pintarEtiquetas() {
  if (!mapaListo) return;
  const w = BE.dondeEsta(E.t);
  const V = BE.viajeActual(w);
  const psV = V ? BE.P.filter((s) => s.viaje === V) : [];
  const corte = w ? w.en.i : -1;
  const visitados = new Set(), futuros = new Set();
  if (F.capas.viajes) psV.forEach((s) => { (w && w.en.viaje === V && s.i <= corte ? visitados : futuros).add(s.lugar.id); });
  visitados.forEach((id) => futuros.delete(id));
  const actual = w && w.parada && F.capas.viajes ? w.en.lugar.id : null;
  const deCartas = new Set();
  for (const c of BE.D.cartas) if (cartaEnMapa(c, E.t)) { BE.origenesCarta(c).forEach((x) => deCartas.add(x)); BE.destinosCarta(c).forEach((x) => deCartas.add(x)); }
  const res = resaltadoMapa ?? E.resaltado?.lugares;
  const selL = E.sel?.tipo === 'lugar' ? E.sel.id : null;
  const zoom = map.getZoom();
  const ventana = ventanaRelevante();
  // Sin selección, los lugares que enseñan la época (los que encuadra encuadrarEpoca) se nombran como una ciudad mayor:
  // en 2001 a.e.c. el mapa se va a Ur, y Ur tiene que llevar su nombre a ese zoom.
  const deEpoca = E.sel ? null : lugaresEpocaEn(E.t);
  const items = [], puntos = [], marcas = [];
  for (const [id, m] of marcasLugar) {
    const cls = m.el.classList;
    const enRes = res ? res.has(id) : false;
    const esSel = selL === id;
    const oculto = !F.capas.pendientes && m.l.estado === 'pendiente' && !enRes && !esSel;
    const fijo = esSel || enRes || id === actual || visitados.has(id) || futuros.has(id) || deCartas.has(id) || !!deEpoca?.has(id);
    const otraEpoca = !oculto && !fijo && m.clase !== 'agua' && !enTiempo(id, ventana);
    cls.toggle('oculto', oculto);
    cls.toggle('otra-epoca', otraEpoca);
    cls.toggle('pendiente', m.l.estado === 'pendiente');
    cls.toggle('es-actual', id === actual);
    cls.toggle('visitado', visitados.has(id));
    cls.toggle('futuro', futuros.has(id));
    cls.toggle('de-carta', deCartas.has(id));
    cls.toggle('resaltado', enRes);
    cls.toggle('atenuado', !!res && !enRes);
    const principal = MAYORES.has(id) || !!deEpoca?.has(id) || visitados.has(id) || futuros.has(id) || deCartas.has(id) || enRes;
    cls.toggle('menor', !principal);
    if (oculto || otraEpoca) continue;
    if (!m.region) {
      const html = etiquetaHtml(m);
      const et = m.el.querySelector('.etiqueta');
      if (et.dataset.html !== html) { et.innerHTML = html; et.dataset.html = html; }
    } else {
      const n = nombreEn(m.l, E.t);
      const rt = m.el.querySelector('.region-texto');
      if (rt.textContent !== n) rt.textContent = n;
    }
    // Importancia y tramo de zoom en que puede verse el rótulo.
    let prio, desde = -Infinity, hasta = Infinity;
    if (id === actual) prio = 100;
    else if (esSel) prio = 95;
    else if (resaltadoMapa?.has(id)) prio = 92;             // la parada del recorrido o la fila elegida en «Nombres»
    else if (enRes) prio = 80;
    else if (visitados.has(id) || futuros.has(id)) prio = 60;
    else if (deCartas.has(id)) prio = 50;
    else if (MAYORES.has(id) || deEpoca?.has(id)) { prio = 40; desde = 4.3; }
    else { prio = 20; desde = 6.3; }
    if (MAYORES.has(id) && prio < 90) prio += 5;          // Jerusalén gana a Betania cuando las dos son de la selección
    // Una región o un mar de la selección se nombra siempre, pero por detrás de las ciudades de la selección.
    if (m.region) { if (esSel) prio = 90; else if (enRes) prio = 75; else { prio = 10; desde = 3.6; hasta = 8; } }
    if (m.clase === 'agua') { if (esSel) prio = 90; else if (enRes) prio = 75; else { prio = 12; desde = m.l.tipo === 'mar' ? 4 : 6.5; } }
    // Los nombres de lugar van por encima de los puntos de candidatos y hallazgos que los rodean; los resaltados, también
    // por encima de los candidatos resaltados (cand--del-foco, z-index 2): en la entrada en Jerusalén, Betfagué y el monte
    // de los Olivos van juntos y el nombre del monte se lee por encima del punto.
    m.el.style.zIndex = !enRes && id !== actual ? '1' : '3';
    const it = { id, el: m.el, medir: m.el.querySelector(m.region ? '.region-texto' : '.etiqueta'), prio, desde, hasta, pos: [m.l.lon, m.l.lat], esSel, peso: tramosDe(id).length, deLugar: !m.region && m.clase !== 'agua' };
    items.push(it);
    marcas.push({ m, it });
    if (prio === 20 && m.clase !== 'region' && m.clase !== 'agua') puntos.push(it);   // los menores se agrupan
  }
  // Agrupación (M-15): los puntos menores que se tocan en pantalla se juntan en una burbuja con su número.
  const grupos = agrupamiento(puntos);
  const agrupables = new Set(puntos);
  for (const p of puntos) p.desde = Math.max(p.desde, grupos.libre.get(p.id));
  const extra = (el, sel, prio, pos, desde = -Infinity, esSel = false) => items.push({ id: `~${items.length}`, el, medir: sel ? el.querySelector(sel) : el, prio, desde, hasta: Infinity, pos, esSel });
  if (marcaPablo?.puesta) extra(marcaPablo.getElement(), '.pablo-rotulo', 99, marcaPablo.getLngLat().toArray());
  if (marcaProxima?.puesta) extra(marcaProxima.getElement(), null, 70, marcaProxima.getLngLat().toArray());
  for (const m of marcasViajero.values()) if (m.puesta) extra(m.el, '.viajero-rotulo', 90, m.marker.getLngLat().toArray());
  // Solo el lugar incierto elegido, la parada del recorrido o el candidato marcado se libran de esperar a separarse de
  // Jerusalén (ver anclas): los que implica una persona elegida (Getsemaní, Gólgota con Jesús) esperan como los demás.
  const exentoCand = (lid) => selL === lid || !!resaltadoMapa?.has(lid) || candFoco?.lugar === lid;
  // Lugares inciertos: los rótulos del lugar seleccionado (o resaltado) siempre; los de los demás, desde el zoom 7,5,
  // porque alrededor de Jerusalén a zoom 7 se pisan entre ellos y con las burbujas.
  for (const [k, m] of marcasCand) {
    const lid = k.slice(0, k.indexOf('|'));
    const suyo = selL === lid || !!res?.has(lid);
    const pos = m.marker.getLngLat().toArray();
    if (!k.endsWith('|')) extra(m.el, '.cand-rotulo', m.el.classList.contains('cand--foco') ? 97 : suyo ? 60 : 30, pos, suyo ? -Infinity : 7.5);
    else extra(m.el, null, selL === lid || resaltadoMapa?.has(lid) ? 96 : suyo ? 78 : 35, pos, suyo ? -Infinity : 7.5, selL === lid);
    Object.assign(items.at(-1), { cand: true, rotuloDe: lid, exento: exentoCand(lid) });
  }
  for (const m of marcasCarta.values()) extra(m.el, null, m.el.classList.contains('pildora-carta--sel') ? 98 : 45, m.marker.getLngLat().toArray());
  // Los puntos de candidatos y los hallazgos se dibujan siempre: son obstáculos fijos para los rótulos que se reparten
  // después de ellos (los de candidatos y zonas, desde el zoom 7,5). Los nombres de lugar van antes y se dibujan encima
  // de los puntos (z-index 1), así que un punto nunca tapa el nombre del monte de los Olivos.
  for (const [k, m] of marcasCand) {
    const punto = m.el.querySelector('.cand-punto');
    const lid = k.slice(0, k.indexOf('|'));
    // El punto de un candidato del lugar elegido o de la parada va antes que los nombres y los aparta (a Betfagué, parada
    // de la entrada en Jerusalén, no se le pone encima «Monte de los Olivos»); los demás solo apartan rótulos de candidatos.
    const exento = exentoCand(lid);
    if (punto && m.marker._map) { extra(m.el, '.cand-punto', exento ? 91 : 19, m.marker.getLngLat().toArray(), 6.31); Object.assign(items.at(-1), { ajeno: true, obstaculo: true, candDe: lid, exento }); }
  }
  for (const m of marcasHallazgo.values()) if (m.marker._map) { extra(m.el, null, 19, m.marker.getLngLat().toArray(), 6.31); Object.assign(items.at(-1), { ajeno: true, obstaculo: true }); }
  // Los números de un recorrido guiado (recorridos.js) van anclados abajo, 14 px sobre su lugar: se reparten como uno más.
  for (const el of map.getContainer().querySelectorAll('.marca-num')) {
    const r = el.getBoundingClientRect(), c = map.getContainer().getBoundingClientRect();
    // La parada activa gana; un número que pisa a otro espera a que el zoom los separe (el 3 de Capernaúm y el 2·4 del
    // mar de Galilea a zoom 7,5).
    // Anclado en su lugar exacto (data-lugar), como el nombre de ese lugar: así los dos no se tocan a ningún zoom.
    const l = BE.L[el.dataset.lugar];
    const pos = l?.lon != null ? [l.lon, l.lat] : map.unproject([r.left + r.width / 2 - c.left, r.bottom + 14 - c.top]).toArray();
    const activa = el.classList.contains('marca-num--activa');   // la parada de ahora se ve aunque roce una tarjeta
    if (r.width) { extra(el, null, activa ? 100 : 99, pos, -Infinity, activa); Object.assign(items.at(-1), { ajeno: true, num: true }); }
  }
  // Cajas: se miden una vez por aspecto (clases y texto), relativas al ancla, para que no bailen entre zooms.
  const marco = map.getContainer().getBoundingClientRect();
  for (const { m } of marcas) m.el.classList.remove('agrupado');
  const validos = items.filter((x) => x.medir);
  for (const x of validos) {
    const f = `${firma(x.el)}|${x.medir.className}|${x.medir.innerHTML}`;
    const k = x.medir === x.el ? '_caja' : `_caja_${x.medir.className.split(' ')[0]}`;   // un elemento puede dar dos cajas
    if (x.el[k] && x.el[k].f === f) { x.caja = x.el[k].c; continue; }
    const r = x.medir.getBoundingClientRect();
    if (!r.width) { x.caja = null; continue; }
    const p = map.project(x.pos);
    const ax = marco.left + p.x, ay = marco.top + p.y;
    x.caja = { x0: Math.floor(r.left - ax), x1: Math.ceil(r.right - ax), y0: Math.floor(r.top - ay), y1: Math.ceil(r.bottom - ay) };
    // El número de un recorrido es una píldora redonda sobre su lugar: sin su borde de abajo deja sitio al nombre del lugar.
    if (x.ajeno && !x.obstaculo) x.caja.y1 -= 4;
    x.el[k] = { f, c: x.caja };
  }
  const conCaja = validos.filter((x) => x.caja);
  for (const x of conCaja) x.w = mundo0(x.pos);
  const burbujas = grupos.burbujas.map((b) => {
    const r = 12 + 3.5 * (String(b.ids.length).length - 1);
    return { ...b, w: mundo0(b.pos), d: b.desde, h: b.hasta, caja: { x0: -r, x1: r, y0: -12, y1: 12 } };
  });
  // Lo menudo no tapa a los lugares con nombre: una burbuja no sale mientras pise una ciudad mayor, lo elegido o lo
  // resaltado (a zoom 7, la de Betania, Olivos y Moria tapaba Jerusalén), y el punto candidato de un lugar incierto no
  // elegido no sale mientras pise el punto o el nombre de cualquier lugar que ya se nombra a ese zoom (ocho candidatos
  // de Getsemaní, Gólgota y Betfagué sobre Jerusalén a zoom 7; un candidato de Betfagué sobre «Monte de los Olivos» a
  // zoom 13). Es un zoom desde, así que al acercarse solo aparecen.
  const caja7 = (c) => ({ x0: Math.min(c.x0, -7), x1: Math.max(c.x1, 7), y0: Math.min(c.y0, -7), y1: Math.max(c.y1, 7) });
  const lugaresCon = conCaja.filter((x) => x.deLugar).map((x) => {
    const fuerte = MAYORES.has(x.id) || x.esSel || x.prio >= 75;
    return { w: x.w, caja: fuerte ? caja7(x.caja) : x.caja, d: x.desde, fuerte };
  });
  // Contra un nombre menor basta con que el centro del punto (sin su borde) no pise las letras.
  const nucleo = (x) => ({ w: x.w, caja: { x0: x.caja.x0 + 3, x1: x.caja.x1 - 3, y0: x.caja.y0 + 3, y1: x.caja.y1 - 3 } });
  const libreDe = (x, todos) => lugaresCon.reduce((z, a) => {
    if (!todos && !a.fuerte) return z;
    const c = choqueZoom(a, a.fuerte ? x : nucleo(x));
    return c && c[1] > a.d ? Math.max(z, c[1]) : z;
  }, -Infinity);
  for (const b of burbujas) b.d = Math.max(b.d, libreDe(b, false));
  const libreCand = new Map();
  for (const x of conCaja) {
    if (!x.candDe) continue;
    const libre = x.exento ? -Infinity : libreDe(x, true);
    x.desde = Math.max(x.desde, libre);
    x.el.classList.toggle('cand--junto', zoom < libre);
    libreCand.set(x.el, libre);
    libreCand.set(x.candDe, Math.max(libreCand.get(x.candDe) ?? -Infinity, libre));
  }
  // El nombre de un candidato sale con su punto; el rótulo de la zona («Betfagué · 2 candidatos»), cuando ya se ven todos.
  for (const x of conCaja) {
    if (!x.rotuloDe || x.exento) continue;
    const z = x.el.classList.contains('cand') ? libreCand.get(x.el) : libreCand.get(x.rotuloDe);
    if (z != null) x.desde = Math.max(x.desde, z);
  }
  repartir(conCaja, burbujas);
  // En pantalla: el tramo de zoom manda; además, lo que no es el lugar seleccionado no puede salirse del mapa ni quedar
  // bajo las tarjetas y los controles. Esconderlo no deja el sitio a otro, así que el reparto no cambia al moverse.
  const caja = (el) => el.getBoundingClientRect();
  const tapas = loQueTapa().map(caja).filter((r) => r.width > 0);
  const choca = (r, c) => !(r.right < c.left || r.left > c.right || r.bottom < c.top || r.top > c.bottom);
  const dentro = (r) => r.left >= marco.left && r.right <= marco.right && r.top >= marco.top && r.bottom <= marco.bottom;
  const ver = items.map((x) => {
    const ok = !!x.caja && x.d <= zoom && zoom < x.h;
    if (!ok || x.esSel) return ok;
    const r = x.medir.getBoundingClientRect();
    return dentro(r) && !tapas.some((c) => choca(r, c));
  });
  items.forEach((x, i) => { if (!x.ajeno || x.num) x.el.classList.toggle('sin-etiqueta', !ver[i]); });
  for (const { m, it } of marcas) m.el.classList.toggle('agrupado', agrupables.has(it) && zoom < grupos.libre.get(it.id));
  pintarBurbujas(burbujas.filter((b) => b.d <= zoom && zoom < b.h));
}
function pintarBurbujas(lista) {
  while (marcasGrupo.length > lista.length) marcasGrupo.pop().marker.remove();
  lista.forEach((b, i) => {
    let g = marcasGrupo[i];
    if (!g) {
      const el = document.createElement('button');
      el.type = 'button'; el.className = 'grupo-lugares';
      el.addEventListener('click', (e) => { e.stopPropagation(); const ids = JSON.parse(el.dataset.ids); map.fitBounds(cajaDe(ids.map((id) => coord(BE.L[id]))), { padding: 80, maxZoom: Math.min(NIVEL_MAX, Math.floor(map.getZoom()) + 3), duration: 600 }); });
      g = { el, marker: new maplibregl.Marker({ element: el, anchor: 'center' }).setLngLat(b.pos).addTo(map) };
      marcasGrupo.push(g);
    }
    const ms = b.ids.map((id) => BE.L[id]);
    g.marker.setLngLat(b.pos);
    g.el.textContent = String(ms.length);
    g.el.dataset.ids = JSON.stringify(b.ids);
    g.el.setAttribute('aria-label', `${ms.length} lugares juntos: ${ms.map((l) => l.nombre).join(', ')}. Pulsa para acercarte.`);
    g.el.title = ms.map((l) => l.nombre).join(' · ');
  });
}

// ---------------------------------------------------------------------------
// Leyenda y «Mientras tanto»
// ---------------------------------------------------------------------------
/** La leyenda explica lo que hay en pantalla: el título «Viajes de Pablo» solo si se dibuja algo de Pablo, y la fila
    de la posición estimada solo si hay un marcador estimado a la vista. */
function pintarLeyenda(V, w, g) {
  pintarLeyenda.args = [V, w, g];
  const pendiente = BE.D.cartas.some((c) => cartaEnMapa(c, E.t) && estadoCarta(c, E.t) === 'pendiente');
  const escritores = [...new Set(BE.D.cartas.filter((c) => cartaEnMapa(c, E.t)).map((c) => c.escritor || 'pablo'))];
  const inciertos = claveInciertos.split('|')[0];
  const formas = claveFormas.split('|')[0];
  // Solo si alguna marca de hallazgo cae en el encuadre: se vuelve a mirar al mover el mapa.
  const caja = map.getBounds();
  const hallazgos = [...marcasHallazgo.values()].some((m) => caja.contains(m.marker.getLngLat()));
  const S = E.sel?.tipo === 'viaje' ? BE.D.viajes.find((v) => v.id === E.sel.id) : null;   // viaje seleccionado abajo
  const rastro = g.rastroVisible;
  const dePablo = !!(V && g.hecho.length + g.falta.length) || rastro.some((v) => BE.duenoViaje(v) === 'pablo');
  const estimada = (marcaPablo?.puesta && marcaPablo.getElement().classList.contains('estimada')) || [...marcasViajero.values()].some((m) => m.puesta && m.el.classList.contains('estimada'));
  const viajeros = [...marcasViajero.values()].some((m) => m.puesta);
  const apagado = g.rastro.some((f) => f.properties.estado !== 'actual');   // algún rastro en gris
  const repiten = viajesRepetidos(g);
  const deducidos = [...g.rastro, ...g.hecho, ...g.falta].some((f) => f.properties.deducido);
  const abanico = g.rastro.some((f) => f.properties.rama != null);
  // Solo las áreas que el mapa dibuja ahora: abiertas.
  const areas = [...marcasArea.values(), ...zonasArea.values()].filter((m) => m.estado === 'abierta');
  const clave = `${areas.map((m) => m.fila)}|${repiten.map((v) => v.id)}|${apagado}|${deducidos}|${abanico}|${V?.id}|${estimada}|${E.sel?.tipo}|${E.sel?.id}|${pendiente}|${escritores}|${inciertos}|${formas}|${hallazgos}|${F.capas.viajes}|${F.nivel1}|${rastro.map((v) => v.id)}|${dePablo}|${viajeros}`;
  if (clave === pintarLeyenda.clave) return;
  pintarLeyenda.clave = clave;
  const filas = [];
  const titulo = S || (F.capas.viajes && V && dePablo ? V : null);
  if (V && dePablo && (!S || S === V)) {
    filas.push('<div class="be-legend__row"><span class="be-legend__line"></span>Recorrido hasta esta fecha</div>');
    if (BE.P.some((s) => s.viaje === V && s.lugar.precision === 'zona')) filas.push('<div class="be-legend__row"><span class="be-legend__line be-legend__line--approx"></span>Ruta sin trazado conocido (región)</div>');
    filas.push('<div class="be-legend__row"><span class="be-legend__line be-legend__line--todo"></span>Lo que falta del viaje</div>');
  }
  if (S) filas.push(`<div class="be-legend__row"><span class="be-legend__line${S === V ? ' be-legend__line--todo' : ''}"></span>${S === V ? 'Solo este viaje' : 'Solo este viaje, completo'}; vuelve a pulsarlo para quitarlo</div>`);
  else if (rastro.length) {
    // Solo si hay algún rastro apagado: un viaje en curso va en su color y esta fila no lo describe.
    if (apagado) filas.push('<div class="be-legend__row"><span class="leyenda-rastro"></span>Otros viajes: en gris claro, los que ya pasaron</div>');
    // Con viajes de más de una persona, quién es cada color (Pablo lleva uno por viaje y ya tiene sus filas). El viaje
    // de Pablo en curso cuenta como una persona más, aunque no vaya en el rastro.
    if (g.rastro.some((f) => f.properties.incierto)) filas.push('<div class="be-legend__row"><span class="be-legend__line be-legend__line--approx"></span>A trazos: tramo hacia un lugar incierto (su candidato preferido o el centro de su zona)</div>');
    const quienes = new Set(rastro.map(BE.duenoViaje));
    if (V && g.hecho.length + g.falta.length) quienes.add('pablo');
    if (quienes.size > 1) {
      for (const p of [...quienes].filter((x) => x !== 'pablo')) {
        filas.push(`<div class="be-legend__row"><span class="leyenda-viajero" style="--viajero:${colorPersona(p)}"></span>${esc(BE.nombreDeDueno(p))}</div>`);
      }
    }
  }
  if (deducidos) filas.push('<div class="be-legend__row"><span class="be-legend__line be-legend__line--deducida"></span>De puntos: tramo hacia una parada pendiente de verificar</div>');
  if (abanico) filas.push('<div class="be-legend__row"><svg class="leyenda-abanico" viewBox="0 0 22 12" aria-hidden="true"><path d="M2 6 20 1M2 6h18M2 6l18 5"/></svg>En abanico: destinos a los que el grupo llega a la vez, sin orden entre ellos</div>');
  for (const m of areas) filas.push(`<div class="be-legend__row"><span class="leyenda-area" style="--viajero:${m.color || m.el.style.getPropertyValue('--viajero')}"></span>${esc(m.fila)}</div>`);
  if (repiten.length) filas.push(`<div class="be-legend__row"><span class="leyenda-repite" aria-hidden="true">↻</span>Se repite cada año: ${repiten.map((v) => esc(v.nombre)).join(', ')}</div>`);
  if (escritores.length) {
    filas.push(`<div class="be-legend__row"><span class="be-legend__line be-legend__line--letter" style="--carta:${colorEscritor(escritores[0])}"></span>Carta ${escritores.length > 1 ? `de ${esc(nombrePersona(escritores[0]))}` : 'escrita cerca de esta fecha'}</div>`);
    for (const e of escritores.slice(1)) filas.push(`<div class="be-legend__row"><span class="be-legend__line be-legend__line--letter" style="--carta:${colorEscritor(e)}"></span>Carta de ${esc(nombrePersona(e))}</div>`);
  }
  if (pendiente) filas.push('<div class="be-legend__row"><span class="be-legend__line be-legend__line--pendiente"></span>Carta que escribirá poco después</div>');
  // Lo incierto: con un lugar incierto seleccionado, cada estado de sus candidatos; si no, una sola fila.
  const selIncierto = E.sel?.tipo === 'lugar' && candidatosDe(BE.L[E.sel.id]) ? BE.L[E.sel.id] : null;
  if (selIncierto) {
    const estados = new Set(candidatosVisibles(selIncierto).map(({ c }) => c.estado));
    for (const [k, s] of Object.entries(CAND)) if (estados.has(k)) filas.push(`<div class="be-legend__row"><span class="leyenda-cand leyenda-cand--${k}" style="--cand:${s.color}"></span>${esc(s.rotulo)}</div>`);
  } else if (inciertos) filas.push(`<div class="be-legend__row"><span class="leyenda-cand leyenda-cand--favorecido_nivel_1" style="--cand:${CAND.favorecido_nivel_1.color}"></span>Lugar incierto: zona o candidatos, nunca un punto</div>`);
  if (formas) filas.push('<div class="be-legend__row"><span class="leyenda-forma"></span>Lo que abarca una región, aproximado con su fuente</div>');
  if (hallazgos) filas.push('<div class="be-legend__row"><span class="leyenda-hallazgo"></span>Hallazgo arqueológico</div>');
  if (estimada) filas.push('<div class="be-legend__row"><span class="leyenda-estimada"></span>Posición estimada (tiempo narrativo o lugar incierto)</div>');
  if (F.capas.viajes && !S && !dePablo && !rastro.length && !viajeros && !areas.length) filas.push('<div class="be-legend__row be-muted">Ningún viaje cerca de esta fecha</div>');
  if (F.nivel1) filas.push('<div class="be-legend__row"><span class="be-tier be-tier--1" data-n="1">Solo fuentes principales</span></div>');
  const cabecera = titulo ? `${esc(titulo.nombre)} · ${esc(fechaCorta(titulo.fecha))}` : selIncierto ? `${esc(selIncierto.nombre)} · cómo dibujamos lo incierto`
    : dePablo ? 'Viajes de Pablo' : rastro.length ? 'Viajes' : 'Leyenda';
  $('#leyenda').innerHTML = `<div class="be-card__eyebrow">${cabecera}</div>${filas.join('')}`;
  $('#leyenda').style.setProperty('--accent', titulo ? colorViaje(titulo.id) : '');
  if (marcaPablo) marcaPablo.getElement().style.setProperty('--accent', V ? colorViaje(V.id) : '');
  sucio.etiquetas = true;
}
/** Claves de lo que se está mirando: la selección o, en un recorrido guiado, su parada. Deshacen empates. */
function clavesEnFoco() {
  if (E.sel?.tipo === 'recorrido') {
    const rc = (BE.D.recorridos || []).find((r) => r.id === E.sel.id);
    const p = rc?.paradas?.[BE.recorridos?.pasoDe?.(rc.id) ?? 0];
    const s = p && BE.parseSel(p.sel);
    if (s) return { sel: s, claves: BE.implicados(s).claves };
  }
  return { sel: E.sel, claves: E.resaltado?.claves || new Set() };
}
/** El suceso más concreto de esta fecha: con cientos de sucesos, el primero de la lista suele ser uno de todo un siglo.
    Uno que dura más de cinco años y más que el tramo a la vista no es «mientras tanto» sino el fondo: no se enseña.
    A igual duración gana el que está en foco. `filtro` deja fuera sucesos. */
function sucesoMientras(t, filtro = () => true, claves = clavesEnFoco().claves) {
  let ev = null, ancho = Infinity;
  for (const e of BE.D.eventos || []) {
    const v = BE.ventanaEvento(e);
    if (!v || t < v[0] || t >= v[1] || !filtro(e)) continue;
    const d = v[1] - v[0];
    if (d < ancho - 1e-9 || (Math.abs(d - ancho) <= 1e-9 && claves.has(`evento:${e.id}`) && !claves.has(`evento:${ev.id}`))) { ev = e; ancho = d; }
  }
  return ev && ancho <= Math.max(5, BE.span()) ? ev : null;
}
const nombreLugar = (id) => BE.L[id]?.nombre;
/** Qué enseña «Mientras tanto»: { ev, lugar }. Sale de la misma fuente que la etiqueta del cursor en la línea de tiempo
    (BE.donde de la persona seleccionada o, si no, de Pablo), para que las dos digan el mismo sitio. */
function eleccionMientras(t) {
  const { sel, claves } = clavesEnFoco();
  const cubre = (e) => { const v = BE.ventanaEvento(e); return !!v && t >= v[0] && t < v[1]; };
  // Un suceso seleccionado (o la parada del recorrido) que cubre esta fecha es lo que pasa ahora, no otro del mismo día.
  if (sel?.tipo === 'evento') {
    const e = (BE.D.eventos || []).find((x) => x.id === sel.id);
    if (e && cubre(e)) return { ev: e, lugar: (e.lugares || []).map(nombreLugar).find(Boolean) };
  }
  const quien = E.sel?.tipo === 'persona' && E.sel.id !== 'pablo' ? E.sel.id : 'pablo';
  const w = quien === 'pablo' ? BE.dondeEsta(t) : BE.donde(quien, t);
  if (w) {
    // El suceso del que sale el lugar de la bandera (BE.sucesoEn). En un hueco entre dos estancias en el mismo sitio
    // no hay ninguno: el suceso anterior ya acabó.
    const propio = BE.sucesoEn(quien, t);
    if (propio) return { ev: propio, lugar: w.en.lugar.nombre };
    const suyo = (e) => (e.personas || []).includes(quien);
    if (w.parada) {
      const e = sucesoMientras(t, (x) => suyo(x) && (x.lugares || []).includes(w.en.lugar.id), claves);
      if (e) return { ev: e, lugar: w.en.lugar.nombre };
    }
    // Lo que la persona hace en otro sitio contradiría la etiqueta del cursor: solo sucesos de otros.
    const e = sucesoMientras(t, (x) => !suyo(x), claves);
    return e ? { ev: e, lugar: (e.lugares || []).map(nombreLugar).find(Boolean) } : null;
  }
  const e = sucesoMientras(t, undefined, claves);
  return e ? { ev: e, lugar: (e.lugares || []).map(nombreLugar).find(Boolean) } : null;
}
function pintarMientras(t) {
  const m = eleccionMientras(t);
  const el = $('#mientras'), tira = $('#tira-suceso');
  // «Mientras tanto» solo cuando hay alguien situado con quien comparar (la persona elegida o, si no, Pablo) y el suceso
  // es de otro. El suceso elegido, el de esa persona o uno sin nadie situado es «Suceso».
  const quien = E.sel?.tipo === 'persona' && E.sel.id !== 'pablo' ? E.sel.id : 'pablo';
  // Con un lugar elegido, un suceso de otro sitio también es «Mientras tanto»: el mapa enseña Jerusalén y la tarjeta,
  // Ecbátana.
  const otroLugar = E.sel?.tipo === 'lugar' && !!m && !(m.ev.lugares || []).includes(E.sel.id);
  const propio = !!m && !otroLugar && ((m.ev.personas || []).includes(quien) || (E.sel?.tipo === 'evento' && E.sel.id === m.ev.id)
    || !(quien === 'pablo' ? BE.dondeEsta(t) : BE.donde(quien, t)));
  const clave = m ? `${m.ev.id}|${m.lugar}|${propio}` : '';
  if (clave === pintarMientras.clave) return;
  pintarMientras.clave = clave;
  sucio.etiquetas = true;
  if (!m) { el.hidden = true; tira.hidden = true; return; }
  const { ev, lugar } = m;
  const dePablo = propio;
  el.hidden = false;
  tira.hidden = false;
  tira.dataset.sel = `evento:${ev.id}`;
  tira.innerHTML = `<span class="tira-suceso__tipo">${dePablo ? 'Suceso' : 'Mientras tanto'}${lugar ? ` · ${esc(lugar)}` : ''}</span> ${esc(ev.titulo)}`;
  el.innerHTML = `<div class="be-card__eyebrow">${dePablo ? 'Suceso' : 'Mientras tanto'}${lugar ? ` · ${esc(lugar)}` : ''}</div>
    <button type="button" class="mientras-titulo" data-sel="evento:${esc(ev.id)}">${esc(ev.titulo)}</button>
    <p>${esc(ev.resumen)}</p>
    <div class="fila-chips">${BE.chipsCitas((ev.pasajes || []).join('; '))}<span class="be-chrono be-chrono--tnm">${esc(ev.fecha?.texto || fechaCorta(ev.fecha))}</span></div>`;
}

// ---------------------------------------------------------------------------
// Menú de capas y filtros (M-20) y «Nombres de este encuadre» (pantalla 02)
// ---------------------------------------------------------------------------
class ControlCapas {
  onAdd() {
    const d = document.createElement('div');
    d.className = 'maplibregl-ctrl maplibregl-ctrl-group control-capas';
    d.innerHTML = `<button type="button" id="capas-boton" aria-expanded="false" aria-controls="capas-menu" title="Capas y filtros" aria-label="Capas y filtros"><svg class="be-i" viewBox="0 0 24 24" aria-hidden="true"><path d="m12 4 9 5-9 5-9-5Z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="m3 13.5 9 5 9-5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg></button>
      <button type="button" id="nombres-boton" aria-expanded="false" aria-controls="nombres-encuadre" title="Nombres de este encuadre: antiguo y de hoy" aria-label="Nombres de este encuadre"><span class="aa" aria-hidden="true">Aa</span></button>`;
    d.querySelector('#capas-boton').addEventListener('click', () => abrirPanelMapa('capas'));
    d.querySelector('#nombres-boton').addEventListener('click', () => abrirPanelMapa('nombres'));
    return d;
  }
  onRemove() {}
}
function crearPanelesMapa() {
  const mapa = $('#mapa');
  mapa.insertAdjacentHTML('beforeend', `<div class="be-float panel-mapa capas-menu" id="capas-menu" role="dialog" aria-label="Capas y filtros" hidden></div>
    <div class="be-float panel-mapa nombres-encuadre" id="nombres-encuadre" role="dialog" aria-label="Nombres de este encuadre" hidden></div>
    <button type="button" class="be-float situacion" id="situacion" aria-label="Mapa de situación: pulsa para ir a ese punto" title="Dónde estás en el mundo bíblico" hidden><img src="maps/mundo-mini.webp" alt=""><span class="situacion-recuadro"></span></button>`);
  const menu = $('#capas-menu');
  menu.addEventListener('change', (e) => {
    const x = e.target;
    if (x.name === 'capa') F.capas[x.value] = x.checked;
    else if (x.name === 'nombres') F.nombres = x.value;
    else if (x.name === 'cartas') F.cartas = x.value;
    else if (x.name === 'nivel1') F.nivel1 = x.checked;
    filtrosCambiados();
    pintarNombresEncuadre();
  });
  const nom = $('#nombres-encuadre');
  nom.addEventListener('change', (e) => { if (e.target.name === 'nombres-2') { F.nombres = e.target.value; filtrosCambiados(); pintarNombresEncuadre(); } });
  nom.addEventListener('click', (e) => {
    const f = e.target.closest('[data-lugar]');
    if (!f) return;
    const id = f.dataset.lugar;
    resaltar([id]);
    encuadrarLugares([id]);
    nom.querySelectorAll('[data-lugar]').forEach((x) => x.classList.toggle('fila--foco', x === f));
  });
  for (const p of [menu, nom]) p.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.stopPropagation(); abrirPanelMapa(null); } });
  $('#situacion').addEventListener('click', (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    const fx = (e.clientX - r.left) / r.width, fy = (e.clientY - r.top) / r.height;
    const lon = MINI.oeste + fx * (MINI.este - MINI.oeste);
    const lat = latDeY(mercY(MINI.norte) - fy * (mercY(MINI.norte) - mercY(MINI.sur)));
    map.easeTo({ center: [lon, lat], duration: 700 });
  });
  pintarMenuCapas();
}
let panelAbierto = null;
function abrirPanelMapa(cual) {
  panelAbierto = panelAbierto === cual ? null : cual;
  $('#capas-menu').hidden = panelAbierto !== 'capas';
  $('#nombres-encuadre').hidden = panelAbierto !== 'nombres';
  $('#capas-boton')?.setAttribute('aria-expanded', String(panelAbierto === 'capas'));
  $('#nombres-boton')?.setAttribute('aria-expanded', String(panelAbierto === 'nombres'));
  if (panelAbierto !== 'nombres' && resaltadoMapa) resaltar(null);
  pintarNombresEncuadre();
  if (panelAbierto) (panelAbierto === 'capas' ? $('#capas-menu') : $('#nombres-encuadre')).querySelector('input, button')?.focus();
}
function pintarMenuCapas() {
  const menu = $('#capas-menu');
  if (!menu) return;
  const radio = (grupo, [k, t], actual) => `<label class="capa-opcion"><input type="radio" name="${grupo}" value="${k}"${actual === k ? ' checked' : ''}> ${esc(t)}</label>`;
  menu.innerHTML = `<fieldset><legend class="be-card__eyebrow">Capas</legend>${CAPAS.map(([k, t]) => `<label class="capa-opcion"><input type="checkbox" name="capa" value="${k}"${F.capas[k] ? ' checked' : ''}> ${esc(t)}${k === 'pendientes' ? ' <span class="muestra-pendiente" aria-hidden="true"></span>' : ''}</label>`).join('')}</fieldset>
    <fieldset><legend class="be-card__eyebrow">Fuentes</legend><label class="capa-opcion"><input type="checkbox" name="nivel1"${F.nivel1 ? ' checked' : ''}> Solo fuentes principales</label></fieldset>
    <fieldset><legend class="be-card__eyebrow">Nombres en el mapa</legend>${NOMBRES.map((o) => radio('nombres', o, F.nombres)).join('')}</fieldset>
    <fieldset><legend class="be-card__eyebrow">Cartas</legend>${FILTRO_CARTAS.map((o) => radio('cartas', o, F.cartas)).join('')}</fieldset>`;
  document.querySelector('#capas-boton')?.classList.toggle('con-filtros', CAPAS.some(([k]) => !F.capas[k]) || F.nivel1 || F.cartas !== 'cerca');
}
function pintarNombresEncuadre() {
  const el = $('#nombres-encuadre');
  if (!el || el.hidden || !map) return;
  const b = map.getBounds();
  const filas = [];
  for (const l of Object.values(BE.L)) {
    const cs = candidatosDe(l);
    const p = BE.puntoLugar(l)?.c;
    if (!p || !b.contains(p)) continue;
    const hoy = nombreHoy(l);
    if (!hoy && !cs) continue;
    filas.push({ l, hoy, cs });
  }
  filas.sort((a, b2) => a.l.nombre.localeCompare(b2.l.nombre, 'es'));
  const epoca = (l) => (l.nombres || []).filter((n) => n.desde != null || n.hasta != null).map((n) => `${n.nombre} (${n.desde != null ? BE.fmtAnio(n.desde) : '…'} - ${n.hasta != null ? BE.fmtAnio(n.hasta) : '…'})`).join(' · ');
  el.innerHTML = `<div class="nombres-cab"><h3 class="be-card__eyebrow">Nombres de este encuadre <b class="cuenta">${filas.length}</b></h3>
      <div class="be-seg nombres-seg" role="radiogroup" aria-label="Nombres en el mapa">${NOMBRES.map(([k, t]) => `<label class="be-seg__opt${F.nombres === k ? ' be-seg__opt--on' : ''}"><input class="sr-only" type="radio" name="nombres-2" value="${k}"${F.nombres === k ? ' checked' : ''}>${esc(t.replace('Los dos donde ayuda', 'Los dos'))}</label>`).join('')}</div></div>
    ${filas.length ? `<table class="tabla-nombres"><thead><tr><th scope="col" title="Como lo escribe la Traducción del Nuevo Mundo">En la Biblia</th><th scope="col">Hoy</th></tr></thead><tbody>${filas.map(({ l, hoy, cs }) => `<tr><td colspan="2"><button type="button" class="fila-nombre" data-lugar="${esc(l.id)}"><span><b>${esc(l.nombre)}</b>${epoca(l) ? `<small>${esc(epoca(l))}</small>` : ''}</span><span>${cs ? '<i class="be-muted">sin identificar</i>' : esc(hoy)}</span></button></td></tr>`).join('')}</tbody></table>` : '<p class="be-muted">Ningún lugar de este encuadre tiene nombre de hoy en los datos. Aléjate o muévete.</p>'}
    <p class="nota-nombres">Las provincias antiguas, como Asia (Ap 1:4), no coinciden con los países de hoy: no las traducimos, las superponemos.</p>
    <p class="nota-nombres"><span class="be-tier be-tier--2" data-n="2">OpenBible.info</span> Coordenadas de OpenBible.info (CC BY 4.0): solo tomamos el punto, nunca su identificación.</p>`;
}
/** Mapa de situación (M-16): el mundo bíblico en pequeño con el recuadro de lo que se ve. */
function pintarSituacion() {
  const el = $('#situacion');
  if (!el || !map) return;
  const ver = !estrecha() && map.getZoom() >= 6.6;
  if (el.hidden === ver) el.hidden = !ver;
  if (!ver) return;
  const b = map.getBounds();
  const W = el.clientWidth, H = el.clientHeight;
  const x = (lon) => ((lon - MINI.oeste) / (MINI.este - MINI.oeste)) * W;
  const y = (lat) => ((mercY(MINI.norte) - mercY(lat)) / (mercY(MINI.norte) - mercY(MINI.sur))) * H;
  const r = el.querySelector('.situacion-recuadro');
  const x0 = clamp(x(b.getWest()), 0, W), x1 = clamp(x(b.getEast()), 0, W), y0 = clamp(y(b.getNorth()), 0, H), y1 = clamp(y(b.getSouth()), 0, H);
  Object.assign(r.style, { left: `${x0}px`, top: `${y0}px`, width: `${Math.max(4, x1 - x0)}px`, height: `${Math.max(4, y1 - y0)}px` });
}

// ---------------------------------------------------------------------------
// Encuadre y resaltado
// ---------------------------------------------------------------------------
/** Lugares que representan la época de t, para no dejar el mapa en el Egeo hablando de otra: los de «Ahora mismo»
    (quién está dónde) o, si no hay, los del suceso de «Mientras tanto» si es de unos pocos años, los de la corte de
    quien gobierna, los de la potencia del momento, los del suceso de «Mientras tanto» aunque dure más o, como último
    recurso, los del suceso con lugar más cercano en el tiempo. Solo ids con punto o con candidatos. Un suceso de
    cuarenta años (las naves de Salomón a Ofir) no vale más que la corte de Jerusalén para enseñar 1000 a.e.c. */
function lugaresDeEpoca(t) {
  const conPuntos = (ids) => [...new Set(ids)].filter((id) => BE.L[id] && puntosDe(id).length);
  const r = BE.resumenAhora?.(t);
  const ev = sucesoMientras(t);
  const corto = (() => { const v = ev && BE.ventanaEvento(ev); return !!v && v[1] - v[0] <= 5; })();
  const pasos = [
    () => (r ? r.lugares.map((g) => g.lugar.id) : []),
    () => (corto ? ev.lugares || [] : []),
    () => (r ? r.gobierno.flatMap((p) => p.lugares || []) : []),
    () => (r ? r.potencias.flatMap((p) => p.lugares || []) : []),
    () => ev?.lugares || [],
    () => {
      let mejor = null, dist = Infinity;
      for (const e of BE.D.eventos || []) {
        const v = BE.ventanaEvento(e);
        if (!v || !conPuntos(e.lugares || []).length) continue;
        const d = t < v[0] ? v[0] - t : t > v[1] ? t - v[1] : 0;
        if (d < dist) { dist = d; mejor = e; }
      }
      return mejor ? mejor.lugares : [];
    },
  ];
  for (const paso of pasos) { const ids = conPuntos(paso()); if (ids.length) return ids; }
  return [];
}
let epocaMemo = { clave: null, ids: null };
function lugaresEpocaEn(t) {
  const clave = `${t}|${BE.span()}`;
  if (epocaMemo.clave !== clave) epocaMemo = { clave, ids: new Set(lugaresDeEpoca(t)) };
  return epocaMemo.ids;
}
/** Encuadra la época de t (lugaresDeEpoca). Con siVisible, no mueve el mapa si todo eso ya se ve. */
function encuadrarEpoca(t, { siVisible = false } = {}) {
  if (!map) return;   // sin MapLibre (unpkg caído) la línea y las fichas siguen: no hay nada que encuadrar
  const pts = lugaresDeEpoca(t).flatMap(puntosDe);
  if (!pts.length) return;
  repintarParaEncuadrar();
  const padding = rellenoEncuadre(cajaDe(pts));
  // «Ya se ve» es dentro de la parte libre del mapa: en el móvil, un punto bajo la hoja inferior no se ve.
  if (siVisible) {
    const z = zonaLibre();
    if (pts.every((q) => { const { x, y } = map.project(q); return x >= z.x0 && x <= z.x1 && y >= z.y0 && y <= z.y1; })) return;
  }
  map.fitBounds(cajaDe(pts), { padding, maxZoom: pts.length > 1 ? 7 : Math.max(map.getZoom(), 5.5), duration: 700 });
}
/** Al abrir sin selección, si Pablo queda fuera de la vista o bajo la hoja inferior, centra el mapa en él. Si los datos
    no lo sitúan en esta fecha, encuadra la época (encuadrarEpoca). */
function mostrarPablo() {
  if (E.sel || !map) return;
  const w = BE.dondeEsta(E.t);
  if (!w?.pos) { encuadrarEpoca(E.t, { siVisible: true }); return; }
  const hoja = altoHoja();
  const z = zonaLibre(), q = map.project(w.pos), m = 40;
  if (q.x > z.x0 + m && q.x < z.x1 - m && q.y > z.y0 + m && q.y < z.y1 - m) return;
  map.jumpTo({ center: w.pos, zoom: estrecha() ? Math.max(map.getZoom(), 5.5) : map.getZoom() });
  const cq = map.project(w.pos);
  map.jumpTo({ center: map.unproject([cq.x, cq.y + hoja / 2]) });
}
/** Caja [[oeste, sur], [este, norte]] de unos puntos, ensanchada km a cada lado si se pide. */
function cajaDe(pts, km = 0) {
  const lons = pts.map((p) => p[0]), lats = pts.map((p) => p[1]);
  const dLat = km / 111, dLon = km / (111 * Math.cos((lats[0] * Math.PI) / 180));
  return [[Math.min(...lons) - dLon, Math.min(...lats) - dLat], [Math.max(...lons) + dLon, Math.max(...lats) + dLat]];
}
/** Lo que se pone encima del mapa, visible: las tarjetas (la leyenda, «Mientras tanto», las del recorrido guiado,
    «Ahora mismo», el mapa de situación) y los controles (los botones de arriba a la derecha, los modos del mapa y, en el
    móvil, la fila del suceso y el botón «Leyenda»). Una sola lista para el encuadre (tapas) y para los rótulos. */
function loQueTapa() {
  const els = [$('#leyenda'), $('#mientras'), ...document.querySelectorAll('#vista-recorrido > *'), $('#vista-ahora'), $('#situacion'),
    map.getContainer().querySelector('.maplibregl-ctrl-top-right'), $('.modos'), $('#tira-suceso'), $('#leyenda-boton')];
  return els.filter((el) => el && !el.hidden && el.offsetParent);
}
/** Lo que tapa el mapa (loQueTapa), en píxeles del contenedor, con la esquina en que está. Solo mide: quien encuadra
    pinta antes la leyenda y «Mientras tanto» de lo nuevo (repintarParaEncuadrar). */
function tapas() {
  const c = map.getContainer().getBoundingClientRect(), out = [];
  for (const el of loQueTapa()) {
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2 || r.right <= c.left || r.left >= c.right || r.bottom <= c.top || r.top >= c.bottom) continue;
    out.push({ x0: r.left - c.left, x1: r.right - c.left, y0: r.top - c.top, y1: r.bottom - c.top,
      izq: r.left + r.right < c.left + c.right, arriba: r.top + r.bottom < c.top + c.bottom });
  }
  return out;
}
/** Al encuadrar, la leyenda y «Mientras tanto» aún tienen el contenido de antes, y con ellas lo encuadrado acababa debajo:
    se pinta el mapa de la selección y la fecha nuevas antes de medirlas. Solo al encuadrar, nunca en cada fotograma. */
function repintarParaEncuadrar() { pintarMapa(); }
/** Relleno para encuadrar la caja [[oeste, sur], [este, norte]] en la parte del mapa que no tapan las tarjetas (tapas).
    Cada tarjeta se deja libre por su lado o por encima o debajo; de todas las maneras se queda la que deja la caja más
    grande. Con el mapa bajo (la línea de tiempo alta), lo encuadrado va encima de la leyenda o entre ella y «Mientras
    tanto», nunca debajo. En el móvil la hoja inferior tapa el fondo del mapa. */
function rellenoEncuadre(caja = [[0, 0], [0, 0]]) {
  const c = map.getContainer(), W = c.clientWidth, H = c.clientHeight, base = map.getPadding();
  // Los bordes del mapa dejan sitio a la píldora de números de un recorrido («1·5·6·7·8», unos 75 × 26 px), que va
  // centrada 14 px encima de su lugar: media píldora y algo de aire a cada lado, para que no salga cortada. Junto a una
  // tarjeta el margen es menor: con el mapa bajo de 1440 × 900, uno de 48 px dejaba entre la leyenda y «Mientras
  // tanto» una columna de 53 px, y una zona de 20 km se veía con 4 grados de ancho.
  // En el móvil la hoja inferior (la ficha o la de lectura, 46vh) se deja libre entera mientras quede un mapa usable
  // encima; solo si dejaría menos de 80 px, se acepta que tape un poco y el relleno se queda en el 60 % del mapa.
  const hoja = altoHoja() + 20, arriba = 44;
  const borde = estrecha() ? { top: arriba, bottom: H - arriba - hoja >= 80 ? hoja : Math.min(hoja, H * 0.6), left: 48, right: 50 } : { top: arriba, bottom: 24, left: 48, right: 60 };
  const ts = tapas(), LADO = 24, ENCIMA = 40, DEBAJO = 16;
  // La forma de la caja en píxeles al zoom 0; un punto cuenta como una caja diminuta, y gana el hueco más ancho y alto.
  const [[o, s], [e, n]] = caja;
  const bw = Math.max(((e - o) / 360) * 512, 1e-6), bh = Math.max(((mercY(n) - mercY(s)) / (2 * Math.PI)) * 512, 1e-6);
  let mejor = null;
  for (let k = 0; k < 1 << ts.length; k++) {
    const p = { ...borde };
    ts.forEach((t, i) => {
      if (k & (1 << i)) { if (t.izq) p.left = Math.max(p.left, t.x1 + LADO); else p.right = Math.max(p.right, W - t.x0 + LADO); }
      else if (t.arriba) p.top = Math.max(p.top, t.y1 + ENCIMA); else p.bottom = Math.max(p.bottom, H - t.y0 + DEBAJO);
    });
    const w = W - base.left - base.right - p.left - p.right, h = H - base.top - base.bottom - p.top - p.bottom;
    if (w < 20 || h < 20) continue;
    // A igual tamaño de lo encuadrado (un punto cabe igual en muchos huecos), gana el hueco más grande.
    const z = Math.min(w / bw, h / bh);
    if (!mejor || z > mejor.z * 1.001 || (z > mejor.z / 1.001 && w * h > mejor.area)) mejor = { z, p, area: w * h };
  }
  // caber() no encoge lo elegido: devolvería lo encuadrado bajo la leyenda.
  return mejor?.p || caber(borde);
}
/** Que el relleno quepa en lo que deja el relleno propio del mapa: con el grafo abierto, grafo.js lo pone a 768 px a la
    izquierda, y los márgenes más la tarjeta «Mientras tanto» ya no cabían («Map cannot fit within canvas…»). Se encoge
    hasta dejar 160 × 120 px libres. */
function caber(p) {
  const c = map.getContainer(), base = map.getPadding();
  const libreX = Math.max(0, c.clientWidth - base.left - base.right - 160), libreY = Math.max(0, c.clientHeight - base.top - base.bottom - 120);
  const fx = p.left + p.right > libreX ? libreX / (p.left + p.right) : 1;
  const fy = p.top + p.bottom > libreY ? libreY / (p.top + p.bottom) : 1;
  return { top: p.top * fy, bottom: p.bottom * fy, left: p.left * fx, right: p.right * fx };
}
/** Zoom más lejano al que se encuadra la forma de una zona: el de su punto (una región, 5,5). Si la forma no cabe, se
    corta por arriba y por abajo en vez de quedarse diminuta. */
const ZOOM_FORMA = 5.5;
/** Puntos que ocupa un lugar: su coordenada o, si es incierto, sus candidatos con el borde de cada zona. */
function puntosDe(id) {
  const l = BE.L[id];
  if (!l) return [];
  if (!candidatosDe(l)) return l.lat != null ? [[l.lon, l.lat]] : [];
  const out = [];
  for (const { c } of candidatosVisibles(l)) {
    const g = c.geometria;
    if (g.tipo === 'zona') out.push(...(c.shape?.bbox || cajaDe([[g.lon, g.lat]], g.radio_km)));
    else { out.push([g.lon, g.lat]); if (g.hasta) out.push([g.hasta.lon, g.hasta.lat]); }
  }
  return out;
}
/** De lo que implica la selección, la parte que importa en la fecha del cursor. Un lugar se encuadra solo a sí mismo
    (sus arcos y viajes pueden salir del encuadre). Una persona, los sitios donde la ponen los datos en el tramo que
    enseña la línea de tiempo (como mucho 10 años a cada lado del cursor) o, si no hay, los de su estancia más cercana. Las regiones y
    los países (Egipto, Arabia) solo cuentan si no queda otra cosa, salvo en la trayectoria de una persona: su punto es
    simbólico y estira el encuadre. */
function lugaresEnFoco(ids) {
  let xs = ids.filter((id) => BE.L[id]);
  const s = E.sel, r = E.resaltado?.lugares;
  const deSeleccion = !!r && xs.length === r.size && xs.every((id) => r.has(id));
  if (deSeleccion && s?.tipo === 'lugar' && BE.L[s.id]) xs = [s.id];
  else if (deSeleccion && s?.tipo === 'persona') {
    const est = (BE.estancias?.(s.id) || []).filter((e) => e.lugar?.id);
    const t = E.t, a = Math.min(t, Math.max(E.vista[0], t - 10)), b = Math.max(t, Math.min(E.vista[1], t + 10));
    let cerca = est.filter((e) => e.b >= a && e.a <= b);
    if (!cerca.length && est.length) {
      const d = (e) => (t < e.a ? e.a - t : t > e.b ? t - e.b : 0);
      const m = Math.min(...est.map(d));
      cerca = est.filter((e) => d(e) <= m + 1);
    }
    if (cerca.length) return [...new Set(cerca.map((e) => e.lugar.id))];   // aquí una región cuenta: Egipto en 2 a.e.c.
  }
  const sinRegiones = xs.filter((id) => !REGION.has(BE.L[id].tipo) && BE.L[id].precision !== 'zona');
  return sinRegiones.length ? sinRegiones : xs;
}
/** Zoom hasta el que el relieve más fino que cubre (lon, lat) se ve nítido: Jerusalén aguanta el máximo, la tierra de
    Israel 10, el Mediterráneo 8 y el resto del mundo 7,5. */
function topeRelieve(lon, lat) {
  const dentro = (e) => lon >= e.oeste && lon <= e.este && lat >= e.sur && lat <= e.norte;
  const [, med, isr, jer] = BASES;
  return dentro(jer.ext) ? ZOOM_MAX : dentro(isr.ext) ? 10 : dentro(med.ext) ? 8 : 7.5;
}
/** Distancia en km de la diagonal de una caja [[oeste, sur], [este, norte]]. */
const diagonalKm = ([[o, s], [e, n]]) => Math.hypot((e - o) * 111 * Math.cos((((s + n) / 2) * Math.PI) / 180), (n - s) * 111);
function encuadrarLugares(ids, { duracion = 700 } = {}) {
  if (!map) return;
  // Antes de que cargue el mapa no hay leyenda ni «Mientras tanto» que esquivar: al cargar se encuadra otra vez.
  encuadrePendiente = mapaListo && marcaPablo ? null : { ids, sel: BE.selTexto(E.sel) };
  repintarParaEncuadrar();
  const foco = lugaresEnFoco(ids);
  // Un lugar con forma se encuadra entero (Canaán va de Sidón a Gaza, no se queda en su punto de Galilea).
  const forma = (id) => conPunto(BE.L[id]) && BE.L[id].shape?.bbox;
  const base = foco.flatMap((id) => forma(id) || puntosDe(id));
  const pts = [...base, ...puntosZonasSel(base)];
  // Una selección sin lugar en el mapa (la muerte de Adán, la Septuaginta) no deja el encuadre de antes: enseña su época.
  if (!pts.length) { if (E.sel) encuadrarEpoca(E.t); return; }
  // Un lugar incierto con un candidato con forma (Benjamín, el desierto de Judá) se encuadra igual.
  const conForma = foco.some((id) => forma(id) || candidatosVisibles(BE.L[id]).some(({ c }) => c.shape?.bbox));
  const padding = rellenoEncuadre(cajaDe(pts));
  if (pts.length === 1) {   // fitBounds no deja el relleno fijado en el mapa, easeTo sí
    const [x, y] = pts[0];
    // Una ciudad se ve con la tierra de Israel ya en relieve fino y sus vecinos con nombre; una región, de más lejos; un
    // sitio pegado a otro lugar (Getsemaní, el Gólgota, junto a Jerusalén), a la escala de la ciudad.
    // Una región o un país con la misma coordenada (Cilicia y Tarso, Samaria y su región) no cuenta como vecino. Nunca
    // más cerca de lo que aguanta el relieve de esa zona (topeRelieve), ni aunque el mapa ya estuviera más cerca.
    const l = foco.length === 1 ? BE.L[foco[0]] : null;
    const pegado = l && !MAYORES.has(l.id) && Object.values(BE.L).some((o) => o !== l && o.lat != null && !REGION.has(o.tipo) && o.precision !== 'zona' && Math.hypot((o.lon - x) * 94, (o.lat - y) * 111) < 3);
    const tope = topeRelieve(x, y);
    const cerca = !l || REGION.has(l.tipo) ? 5.5 : pegado ? Math.min(12.5, tope) : 7.5;
    map.fitBounds([[x - 0.01, y - 0.01], [x + 0.01, y + 0.01]], { padding, maxZoom: Math.max(cerca, Math.min(map.getZoom(), tope)), duration: duracion });
    return;
  }
  // Lo que cabe en unos kilómetros (la última semana en Jerusalén) se acerca hasta que los rótulos se separan.
  // Una persona se ve con su entorno, nunca más cerca que el zoom 9.
  const caja = cajaDe(pts), km = diagonalKm(caja);
  const tope = Math.min(E.sel?.tipo === 'persona' ? 9 : km < 5 ? ZOOM_MAX : km < 60 ? 11 : 8,
    Math.max(8, topeRelieve((caja[0][0] + caja[1][0]) / 2, (caja[0][1] + caja[1][1]) / 2)));
  // Si el mapa no puede bajar (o subir) lo bastante para dejar la caja en la parte visible sin salirse del relieve, como
  // Ofir en un móvil con la hoja abierta, se acerca hasta que cabe en vertical: se corta por los lados en vez de enseñar
  // el mar Caspio.
  const cam = map.cameraForBounds(caja, { padding, maxZoom: tope });
  if (cam && conForma && cam.zoom < ZOOM_FORMA) {
    const centro = [(caja[0][0] + caja[1][0]) / 2, latDeY((mercY(caja[0][1]) + mercY(caja[1][1])) / 2)];
    map.easeTo({ center: centro, zoom: ZOOM_FORMA, offset: [(padding.left - padding.right) / 2, (padding.top - padding.bottom) / 2], duration: duracion });
    return;
  }
  if (cam) {
    const H = map.getContainer().clientHeight, libre = H - padding.top - padding.bottom;
    // En vertical, el centro de la caja; en horizontal, la mediana de los puntos: el lado donde hay más.
    const lons = pts.map((p) => p[0]).sort((a, b) => a - b);
    const lat = latDeY((mercY(caja[0][1]) + mercY(caja[1][1])) / 2), lon = (lons[(lons.length - 1) >> 1] + lons[lons.length >> 1]) / 2;
    const zoomPara = (px, d) => (d > 0 ? Math.log2((px * 2 * Math.PI) / (512 * d)) : Infinity);
    const zS = zoomPara(libre / 2 + padding.bottom, mercY(lat) - mercY(MUNDO.sur));
    const zN = zoomPara(libre / 2 + padding.top, mercY(MUNDO.norte) - mercY(lat));
    const z = Math.min(ZOOM_MAX, Math.max(zS, zN));
    if (z > cam.zoom + 0.05) {
      map.easeTo({ center: [lon, lat], zoom: z, offset: [(padding.left - padding.right) / 2, (padding.top - padding.bottom) / 2], duration: duracion });
      return;
    }
  }
  map.fitBounds(caja, { padding, maxZoom: tope, duration: duracion });
}
/** Resalta en el mapa estos lugares por encima de lo que implique la selección. resaltar(null) vuelve a la selección. */
function resaltar(ids) {
  resaltadoMapa = ids ? new Set(ids) : null;
  sucio.etiquetas = sucio.mapa = true; programar();
}
function volverAlInicio() { map?.fitBounds(ENCUADRE_INICIAL, { duration: 600 }); }
/** Arranque del mapa: MapLibre, marcas al cargar, cortina y modo inicial. Sin MapLibre, la línea y las fichas siguen. */
function iniciar() {
  calcularColores();
  if (!window.maplibregl) {
    $('#mapa').insertAdjacentHTML('beforeend', '<p class="sin-mapa">No se pudo cargar MapLibre desde unpkg.com. La línea de tiempo y las fichas funcionan sin mapa.</p>');
  } else {
    crearPanelesMapa();
    crearMapa();
    // Con el encuadre de la entrada ya puesto (una recarga), Pablo no lo cambia.
    map.once('load', () => { crearMarcas(); encuadrarAlCargar(); sucio.mapa = sucio.etiquetas = true; programar(); pintarSituacion(); requestAnimationFrame(() => requestAnimationFrame(() => { if (!marcoDeInicio) mostrarPablo(); })); });
  }
  iniciarCortina();
  ponerMapa(E.mapa, false);
  // «Mientras tanto» depende también del tramo a la vista: al cambiar el zoom de la línea se revisa.
  // Los lugares que se ven dependen también de ese tramo: se revisan en el siguiente fotograma.
  BE.pintores.push((c) => { if (c.linea && !c.mapa && mapaListo) { pintarMientras(E.t); sucio.mapa = true; programar(); } });
  // Al cambiar de selección, el candidato marcado deja de valer.
  BE.pintores.push(() => { if (candFoco && !(E.sel?.tipo === 'lugar' && E.sel.id === candFoco.lugar)) { candFoco = null; claveInciertos = ''; sucio.mapa = true; } });
  document.addEventListener('click', (e) => {
    if (!panelAbierto) return;
    if (e.target.closest('#capas-menu, #nombres-encuadre, .control-capas')) return;
    abrirPanelMapa(null);
  });
}

/** Primer encuadre, al arrancar, con la dirección ya leída y el alto de la línea ya puesto. Con selección (un enlace
    compartido, una pregunta de la portada), se encuadra como al pulsarla en la línea; sin ella, si Pablo queda fuera, el
    mapa se centra en él antes de pintar nada, en vez de saltar al cargar el estilo (la línea alta deja menos mapa). */
let marcoDeInicio = false;
function encuadreDeInicio() {
  if (!map) return;
  // Una recarga, o la vuelta desde otra página, abre la entrada con el encuadre en que se dejó. Se lee antes de
  // resize(), que también acaba en moveend y lo reescribiría.
  const marco = BE.historia?.marco();
  map.resize();
  if (marco) { marcoDeInicio = true; ponerMarco(marco); }
  else if (E.sel) encuadrarLugares([...E.resaltado.lugares]);
  else mostrarPablo();
}
/** Lo último que se pidió encuadrar antes de que cargara el mapa, con la selección de entonces: al cargar, con la leyenda
    y «Mientras tanto» ya pintadas, se encuadra otra vez, sin animar, si la selección sigue siendo esa. El encuadre
    guardado de una entrada (ponerMarco) lo anula. */
let encuadrePendiente = null;
function encuadrarAlCargar() {
  const p = encuadrePendiente;
  encuadrePendiente = null;
  if (p && p.sel === BE.selTexto(E.sel)) encuadrarLugares(p.ids, { duracion: 0 });
}
/** Pone el mapa en el encuadre que guardó una entrada del historial, sin animar, y sin que un salto en el tiempo de la
    misma vuelta lo cambie (vigilarSalto). */
function ponerMarco({ lon, lat, zoom }) {
  if (!map) return;
  encuadrePendiente = null;
  map.jumpTo({ center: [lon, lat], zoom });
  tSalto = E.t;
  clearTimeout(saltoTimer);
}
BE.mapa = { areas: () => [...zonasArea].map(([k, z]) => ({ key: k, estado: z.estado, p: z.p, animando: !!z.anim, borde: !!z.anim?.borde, centro: z.centro, zonas: z.etiquetas.length, chip: !!z.chip && !z.chip.hidden })),
  escriturasAreas: () => componerZonas.escrituras || 0, resaltar, ventanaViaje, encuadrar: encuadrarLugares, volverAlInicio, iniciar, encuadreDeInicio, ponerMarco, enfocarCandidato, get candidatoFoco() { return candFoco; }, get gl() { return map; } };
Object.assign(BE, {
  ponerMapa, pintarMapa, pintarEtiquetas, seguirPablo, cartaVisible, cartaEnMapa, estadoCarta, colorViaje, colorEscritor, colorPersona,
  nombreHoy, nombreEn, candidatosDe, candidatosVisibles, CANDIDATO: CAND, ventanaDeCarta,
});
})();
