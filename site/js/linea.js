/* biblical-atlas · línea de tiempo: de Adán (4026 a.e.c.) al año 100 en seis escalas, carriles que salen de los datos
   (eras, imperios, reyes, personas, cartas, sucesos, meses hebreos, fechas seculares), densidad, minimapa, regla, bucle,
   marcadores, pausa en los sucesos, escribir la fecha y gestos (rueda, arrastre, pinza). Cada carril crece en filas para
   que todo nombre se lea entero (linea-filas.js); cada marca es un botón. Pulsar una marca la elige y el cursor entra en
   ella por el punto señalado: ni la escala ni la vista se mueven.
   Dueño durante el reparto: app-tiempo. */
'use strict';
(() => {
const BE = window.BE;
const { E, sucio, programar, esc, $, clamp, tramo, fechaCorta, fmtAnio, citas, span, setT, reproducir, saltar, MESES, norm } = BE;

// Rango del cursor: de la creación de Adán (4026 a.e.c. = −4025) al año 100. base.js lo lee siempre a través de BE.
BE.T_MIN = -4025; BE.T_MAX = 100;
const SPAN_MIN = 0.03;                          // unos once días
const spanMax = () => BE.T_MAX - BE.T_MIN;
const ZOOMS = [
  { n: 'Milenios', c: 'Mil', s: 4125 }, { n: 'Siglos', c: 'Sig', s: 400 }, { n: 'Décadas', c: 'Déc', s: 40 },
  { n: 'Años', c: 'Año', s: 8 }, { n: 'Meses', c: 'Mes', s: 1.5 }, { n: 'Días', c: 'Día', s: 0.12 },
];
const EJE = 26, CARRIL = 30;
const FIL = BE.filas;

// Estado propio de la línea. Lo que se comparte va en la dirección (BE.parametros).
const L = {
  fijados: [],            // carriles fijados arriba, en orden (T-06, T-08): ids de carril o de persona
  secular: true,          // fechas seculares como nota (C-02)
  pausa: true,            // pausa en los sucesos al reproducir (T-11)
  regla: null,            // [a, b] medidos con la regla (T-15)
  bucle: null,            // [a, b] que la reproducción repite (T-12)
  grande: false,          // línea alta (tecla T); en la pantalla ancha y alta es como abre
  pedida: false,          // alta pedida con la T, el botón o el menú: gana también al grafo abierto
  modoRegla: false,
  meses: null,            // «ambos», «nuestros» o «hebreos»; null: lo de siempre, ambos
  vel: null,              // velocidad elegida a mano: índice de VELOCIDADES; null: según la escala
};

const ICONOS = {
  persona: '<svg class="be-i be-i--sm" viewBox="0 0 24 24"><circle cx="12" cy="8" r="3.6" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M5 20c1-4 4-6 7-6s6 2 7 6" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>',
  carta: '<svg class="be-i be-i--sm" viewBox="0 0 24 24"><path d="M6 3h8l4 4v14H6Z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M9 11h6M9 15h6" stroke="currentColor" stroke-width="1.6"/></svg>',
  reloj: '<svg class="be-i be-i--sm" viewBox="0 0 24 24"><circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M12 7v5l3 2" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>',
  corona: '<svg class="be-i be-i--sm" viewBox="0 0 24 24"><path d="m4 17-1-9 5 4 4-6 4 6 5-4-1 9Z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/></svg>',
  reloj2: '<svg class="be-i be-i--sm" viewBox="0 0 24 24"><path d="M7 3h10M7 21h10M8 3c0 5 8 5 8 9s-8 4-8 9M16 3c0 5-8 5-8 9s8 4 8 9" fill="none" stroke="currentColor" stroke-width="1.7"/></svg>',
  templo: '<svg class="be-i be-i--sm" viewBox="0 0 24 24"><path d="M3 9 12 4l9 5M5 10v8M9.5 10v8M14.5 10v8M19 10v8M3 20h18" fill="none" stroke="currentColor" stroke-width="1.7"/></svg>',
  calendario: '<svg class="be-i be-i--sm" viewBox="0 0 24 24"><rect x="4" y="5" width="16" height="15" rx="2" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M4 10h16M9 3v4M15 3v4" stroke="currentColor" stroke-width="1.7"/></svg>',
  secular: '<svg class="be-i be-i--sm" viewBox="0 0 24 24"><rect x="4" y="6" width="16" height="12" rx="3" fill="none" stroke="currentColor" stroke-width="1.7" stroke-dasharray="3 2.4"/></svg>',
  alfiler: '<svg class="be-i be-i--sm" viewBox="0 0 24 24"><path d="M9 3h6l-1 6 3 3H7l3-3Zm3 9v9" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>',
  info: '<svg class="be-i be-i--sm" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M12 11v5.5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><circle cx="12" cy="7.8" r="1.2" fill="currentColor"/></svg>',
  desplegar: '<svg class="be-i be-i--sm" viewBox="0 0 24 24" aria-hidden="true"><path d="m7 10 5 5 5-5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  menu: '<svg class="be-i" viewBox="0 0 24 24" aria-hidden="true"><circle cx="5" cy="12" r="1.8" fill="currentColor"/><circle cx="12" cy="12" r="1.8" fill="currentColor"/><circle cx="19" cy="12" r="1.8" fill="currentColor"/></svg>',
};
function colorPotencia(p) {
  const n = norm(`${p.id} ${p.nombre}`);
  if (/egipt/.test(n)) return 'var(--emp-egipto)';
  if (/asiri/.test(n)) return 'var(--emp-asiria)';
  if (/babilon|caldea/.test(n)) return 'var(--emp-babilonia)';
  if (/medo|persa|persia/.test(n)) return 'var(--emp-persia)';
  if (/grec|macedon|seleuc|tolom/.test(n)) return 'var(--emp-grecia)';
  if (/roma/.test(n)) return 'var(--emp-roma)';
  if (/israel|juda/.test(n)) return 'var(--emp-israel)';
  return 'var(--node-periodo)';
}

// ---------------------------------------------------------------------------
// Contraste (be-64b.1): el color de cada barra se resuelve, y el texto de encima va en blanco o en tinta oscura, lo que
// lea mejor. Una barra que casi no se distingue del fondo de la línea lleva borde. Se recalcula al cambiar el tema.
// ---------------------------------------------------------------------------
const colores = new Map();
let raizColores = null;
function rgbDe(color) {
  const raiz = document.documentElement.className;
  if (raiz !== raizColores) { raizColores = raiz; colores.clear(); }
  if (colores.has(color)) return colores.get(color);
  const v = /^var\((--[\w-]+)\)$/.exec(color);
  const c = v ? getComputedStyle(document.documentElement).getPropertyValue(v[1]).trim() : color;
  let rgb = null;
  const h = /^#([\da-f]{3}|[\da-f]{6})$/i.exec(c);
  if (h) { const s = h[1].length === 3 ? [...h[1]].map((x) => x + x).join('') : h[1]; const n = parseInt(s, 16); rgb = [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
  else { const m = /rgba?\(([^)]+)\)/.exec(c); if (m) rgb = m[1].split(/[\s,/]+/).slice(0, 3).map(Number); }
  colores.set(color, rgb);
  return rgb;
}
const luz = (rgb) => { const [r, g, b] = rgb.map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const contraste = (a, b) => { const x = luz(a), y = luz(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
const BLANCO = [255, 255, 255], TINTA = [24, 34, 28];
/** Clases del texto y de la forma de una barra de ese color: «sobre-claro» si la tinta oscura lee mejor que el blanco;
    «con-borde» si la barra y el fondo de la línea no llegan a 3:1 en alguno de los dos fondos de los carriles. */
function tonos(color) {
  const c = rgbDe(color);
  if (!c) return { texto: '', forma: '' };
  const fondos = [rgbDe('var(--surface)') || BLANCO, rgbDe('var(--surface-2)') || BLANCO];
  return { texto: contraste(c, BLANCO) >= contraste(c, TINTA) ? '' : ' sobre-claro', forma: fondos.some((f) => contraste(c, f) < 3) ? ' con-borde' : '' };
}
/** El color mezclado con negro en la fracción f: el segundo tono de las eras, para que dos vecinas no se fundan. */
function oscurecer(color, f) {
  const c = rgbDe(color);
  return c ? `rgb(${c.map((v) => Math.round(v * (1 - f))).join(', ')})` : color;
}
/** Color de la barra de un periodo según su carril. */
function colorPeriodo(c, p) {
  if (c.clase === 'potencia') return colorPotencia(p);
  if (c.clase === 'era') return c.ps.indexOf(p) % 2 ? oscurecer('var(--node-periodo)', 0.22) : 'var(--node-periodo)';
  const k = c.id.replace(/-.*/, '');
  return { reyes: 'var(--emp-persia)', sacerdotes: 'var(--tier1)', gobernadores: 'var(--node-periodo)' }[k] || 'var(--emp-roma)';
}

let anchoLinea = 800, altoFilas = 0, cabAlto = EJE;
const xDe = (t) => ((t - E.vista[0]) / span()) * anchoLinea;
const tDe = (x) => E.vista[0] + (x / anchoLinea) * span();
const anchoTexto = (s, px = 10.5) => s.length * px * 0.6 + 4;
const visible = (tr) => tr && tr[1] > E.vista[0] && tr[0] < E.vista[1];
function nivelFuentes(ids) { return Math.min(...(ids || []).map((id) => BE.D.fuentes[id]?.nivel || 2)); }
function dim(clave) {
  const r = E.resaltado;
  if (!r) return '';
  return r.claves.has(clave) ? ' resaltado' : ' atenuado';
}

// ---------------------------------------------------------------------------
// Marcas: lo que dibuja cada carril, sacado de los datos una vez por carga. Cada una es un momento (un punto con la
// línea de las fechas entre las que pudo ser) o un tramo (una barra). linea-filas.js las reparte en filas.
// ---------------------------------------------------------------------------
const periodosDe = (tipo) => (BE.D.periodos || []).filter((p) => p.tipo === tipo);
const TIPO_PERIODO = { era: 'Era', potencia: 'Potencia mundial', rey: 'Rey', emperador: 'Emperador', gobernador: 'Gobernador', 'sumo-sacerdote': 'Sumo sacerdote' };
/** Un momento: un punto en medio de la ventana en que lo sitúa el sitio, con la línea de las fechas entre las que pudo
    ser (esa ventana y lo que dice su fecha). */
function momentoMarca(o, win, dicho) {
  const w0 = Math.min(win[0], dicho ? dicho[0] : win[0]), w1 = Math.max(win[1], dicho ? dicho[1] : win[1]);
  return { group: 0, ...o, shape: 'moment', start: win[0], end: win[1], anchor: (win[0] + win[1]) / 2, w0, w1 };
}
/** Un tramo: una barra de su principio a su fin, de un día como mínimo. */
function tramoMarca(o, tr) {
  return { group: 0, ...o, shape: 'span', start: tr[0], end: Math.max(tr[1], tr[0] + BE.DIA) };
}
/** Extremo sin fecha: «end» o «start». Ese lado se difumina en vez de acabar en seco. */
function extremoAbierto(f, tr) {
  if (tr?.abierto === 'd') return 'end';
  if (tr?.abierto === 'i') return 'start';
  if (f && f.desde != null && f.hasta == null) return 'end';
  if (f && f.hasta != null && f.desde == null) return 'start';
  return null;
}
const textoFechaDe = (f) => (f ? f.texto || fechaCorta(f) : '');
function marcasSucesos() {
  const out = [];
  for (const e of BE.D.eventos || []) {
    const win = BE.ventanaEvento(e);
    if (!win) continue;
    out.push(momentoMarca({ id: `evento:${e.id}`, sel: `evento:${e.id}`, name: e.titulo, cert: FIL.certainty(e.fecha), tipo: 'Suceso', fechaTipo: e.fecha?.tipo,
      fecha: textoFechaDe(e.fecha), color: 'var(--gold)', passages: e.pasajes || [] }, win, BE.ventanaFecha(e.fecha) || tramo(e.fecha)));
  }
  FIL.storyOrder(out);   // los del mismo día, en el orden del relato
  return out;
}
function marcasCartas() {
  return BE.cartasOrdenadas().map((c) => {
    const win = BE.ventanaCarta(c);
    return win && momentoMarca({ id: `carta:${c.id}`, sel: `carta:${c.id}`, name: c.libro, cert: FIL.certainty(c.fecha), tipo: 'Carta', fechaTipo: c.fecha?.tipo,
      fecha: textoFechaDe(c.fecha), color: 'var(--tier2)' }, win, tramo(c.fecha));
  }).filter(Boolean);
}
/** Una parada de un viaje o una estancia de una persona: tramo si dura, momento si no. La que sale del orden del relato
    es un cálculo, salvo que ya sea dudosa. */
function marcaEstancia(s, color, group, tipo) {
  const f = s.fecha || s.p?.fecha || null;
  let cert = FIL.certainty(f || {});
  if (s.narrativa && cert !== 'uncertain') cert = 'computed';
  const o = { id: `${s.sel}#${s.key}`, sel: s.sel, name: s.lugar.nombre, titulo: s.titulo && s.titulo !== s.lugar.nombre ? s.titulo : '',
    cert, tipo, fecha: f ? textoFechaDe(f) : '', fechaTipo: f?.tipo === 'derivada' ? 'derivada' : s.narrativa ? 'narrativa' : f?.tipo, color, group };
  return s.b > s.a ? tramoMarca(o, [s.a, s.b]) : momentoMarca(o, [s.a, s.b]);
}
/** Los viajes de una persona (T-06): un tramo por viaje y, en filas propias debajo, sus paradas. P son sus paradas en
    orden. Pablo lleva un color por viaje y cualquier otro viajero el suyo, el mismo que en el mapa. Un viaje que se
    repetía cada año (`repeats: yearly`) lo dice tras su nombre. */
function marcasViajes(P, colorDe) {
  const out = [];
  for (const v of BE.D.viajes) {
    const ps = P.filter((x) => x.viaje === v);
    if (!ps.length) continue;
    const color = colorDe(v);
    out.push(tramoMarca({ id: `viaje:${v.id}`, sel: `viaje:${v.id}`, name: v.nombre, cert: FIL.certainty(v.fecha), tipo: 'Viaje',
      fecha: textoFechaDe(v.fecha), color, repite: v.repeats === 'yearly' }, [Math.min(...ps.map((s) => s.a)), Math.max(...ps.map((s) => s.b))]));
    for (const s of ps) out.push(marcaEstancia(s, color, 1, 'Parada de un viaje'));
  }
  return out;
}
/** «Viajes de Pablo»: solo los suyos. Los de los demás van en el carril de cada persona, con la misma forma. */
const marcasPablo = () => marcasViajes(BE.P, (v) => BE.colorViaje(v.id));
function marcasPeriodos(c) {
  return c.ps.map((p) => {
    const tr = BE.tramoPeriodo(p);
    if (!tr) return null;
    return tramoMarca({ id: `periodo:${p.id}`, sel: `periodo:${p.id}`, name: p.nombre, cert: FIL.certainty(p.fecha, tr.abierto),
      openEnd: extremoAbierto(p.fecha, tr), tipo: TIPO_PERIODO[p.tipo] || 'Periodo', fechaTipo: p.fecha?.tipo, fecha: textoFechaDe(p.fecha), color: () => colorPeriodo(c, p) }, tr);
  }).filter(Boolean);
}
/** Fechas seculares como nota (C-02, C-04): contorno de trazos; no mueven el cursor. */
function marcasSecular(c) {
  const out = [];
  for (const o of c.conAlt) (o.alternativas || []).forEach((alt, i) => {
    const tr = tramo(alt.fecha);
    if (!tr) return;
    const tipo = BE.D.eventos.includes(o) ? 'evento' : (BE.D.periodos.includes(o) ? 'periodo' : 'persona');
    out.push(tramoMarca({ id: `${tipo}:${o.id}#secular${i}`, sel: `${tipo}:${o.id}`, name: o.titulo || o.nombre, cert: 'exact',
      tipo: 'Fecha secular, solo como nota', fecha: textoFechaDe(alt.fecha), color: 'var(--secular)', secular: true, sinCursor: true }, tr));
  });
  return out;
}

// ---------------------------------------------------------------------------
// Carriles: cuáles hay y en qué orden
// ---------------------------------------------------------------------------
let cacheCat = null;
/** Catálogo de carriles posibles con estos datos. Se calcula una vez por carga de datos. El orden de arriba abajo es el
    de `orden`: los que más crecen (Pablo, Cartas, Sucesos) van los últimos, así su crecimiento no empuja a nadie. */
function catalogo() {
  if (cacheCat && cacheCat.D === BE.D) return cacheCat.lista;
  const D = BE.D;
  const lista = [];
  const lanePeriodos = (id, nombre, icono, ps, orden, extra = {}) => {
    if (!ps.length) return;
    const c = { id, nombre, icono, tipo: 'periodos', ps, orden, n2: ps.every((p) => nivelFuentes(p.fuentes) > 1), ...extra };
    c.marcas = () => marcasPeriodos(c);
    lista.push(c);
  };
  if (D.calendario?.meses?.length) lista.push({ id: 'meses', nombre: 'Meses', icono: 'calendario', tipo: 'meses', filas: 1, orden: 0, hay: () => span() < 2.5,
    medir: medirMeses, ayuda: 'Nuestros meses y los meses hebreos, alineados. Las equivalencias son aproximadas.' });
  lanePeriodos('eras', 'Eras', 'reloj2', periodosDe('era'), 1, { clase: 'era' });
  lanePeriodos('imperios', 'Imperio (Dn\u00a02)', 'corona', periodosDe('potencia'), 2, { clase: 'potencia' });
  lista.push({ id: 'pablo', nombre: 'Viajes de Pablo', icono: 'persona', tipo: 'pablo', orden: 20, clases: ['carril-viajes'], marcas: marcasPablo });
  if (D.cartas.length) lista.push({ id: 'cartas', nombre: 'Cartas', icono: 'carta', tipo: 'cartas', orden: 21, marcas: marcasCartas });
  lista.push({ id: 'sucesos', nombre: 'Sucesos', icono: 'reloj', tipo: 'sucesos', orden: 22, marcas: marcasSucesos });
  lanePeriodos('emperadores', 'Emperadores', 'corona', periodosDe('emperador'), 3);
  for (const { k, nombre, ps } of reinos()) lanePeriodos(k ? `reyes-${k}` : 'reyes', nombre, 'corona', ps, 4);
  lanePeriodos('gobernadores', 'Gobernadores', 'corona', periodosDe('gobernador'), 5);
  lanePeriodos('sacerdotes', 'Sumos sacerdotes', 'templo', periodosDe('sumo-sacerdote'), 6);
  const conAlt = [...(D.eventos || []), ...(D.periodos || []), ...Object.values(D.personas || {})].filter((o) => o.alternativas?.length);
  if (conAlt.length) {
    const c = { id: 'secular', nombre: 'Secular · nota', icono: 'secular', tipo: 'secular', orden: 7, conAlt,
      ayuda: 'Fechas de la cronología secular cuando difiere. Solo como nota: no mueven el cursor.' };
    c.marcas = () => marcasSecular(c);
    lista.push(c);
  }
  cacheCat = { D, lista };
  return lista;
}
/** Reyes por reino. Los datos no dicen el reino, pero sí las capitales: dos reinados que comparten un lugar son del
    mismo reino (Omrí une Tirsá y Samaria; David, Hebrón y Jerusalén). Un grupo de un solo reinado se une al que empieza
    cuando él acaba (Saúl, en Guibeá, con David). El carril se nombra por su lugar más repetido y, si otro se repite
    tres veces o más, por los dos: «Reyes · Samaria y Tirsá». */
function reinos() {
  const reyes = periodosDe('rey');
  const padre = reyes.map((_, i) => i);
  const raiz = (i) => (padre[i] === i ? i : (padre[i] = raiz(padre[i])));
  const porLugar = new Map();
  reyes.forEach((p, i) => (p.lugares || []).forEach((l) => { if (porLugar.has(l)) padre[raiz(i)] = raiz(porLugar.get(l)); else porLugar.set(l, i); }));
  const grupos = new Map();
  reyes.forEach((p, i) => { const r = raiz(i); if (!grupos.has(r)) grupos.set(r, []); grupos.get(r).push(p); });
  const lista = [...grupos.values()];
  for (const g of lista.filter((x) => x.length === 1)) {
    const tr = tramo(g[0].fecha);
    const otro = tr && lista.find((x) => x !== g && x.length > 1 && x.some((p) => { const t2 = tramo(p.fecha); return t2 && Math.abs(t2[0] - (tr[1] - 1)) <= 1; }));
    if (otro) { otro.push(g[0]); g.length = 0; }
  }
  return lista.filter((g) => g.length).map((ps) => {
    const cuenta = new Map();
    for (const p of ps) for (const l of new Set(p.lugares || [])) cuenta.set(l, (cuenta.get(l) || 0) + 1);
    const orden = [...cuenta.entries()].filter(([l]) => BE.L[l]).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    const k = orden[0]?.[0] || '';
    const nombres = orden.slice(0, 2).filter(([, n], i) => i === 0 || n >= 3).map(([l]) => BE.L[l].nombre);
    return { k, nombre: nombres.length ? `Reyes · ${nombres.join(' y ')}` : 'Reyes', ps };
  });
}
const cachePersona = new Map();
/** Carril de una persona (T-06): sus estancias con lugar, nombradas por el lugar. Si viaja, primero sus viajes como en
    «Viajes de Pablo» (un tramo por viaje y sus paradas debajo) y después, en filas propias, los sucesos y los sitios
    donde vivió. Su actividad y los caminos entre estancias van de adorno en una franja fina arriba del carril, nunca en
    las filas. */
function carrilPersona(id) {
  if (id === 'pablo') return catalogo().find((c) => c.id === 'pablo');
  const p = BE.PERS[id];
  if (!p) return null;
  const guardado = cachePersona.get(id);
  if (guardado && guardado.D === BE.D) return guardado.c;
  const est = BE.estancias(id);
  const act = p.fecha ? tramo(p.fecha) : null;
  const enViaje = est.filter((s) => s.origen === 'viaje');
  const marcas = () => {
    const color = BE.colorPersona(id), resto = est.filter((s) => s.origen !== 'viaje');
    return [...marcasViajes(enViaje, () => color), ...resto.map((s) => marcaEstancia(s, color, enViaje.length ? 2 : 0, 'Estancia'))];
  };
  const c = !est.length && !act ? null : { id, nombre: p.nombre, icono: 'persona', tipo: 'persona', persona: id, orden: 19, est, act, marcas };
  cachePersona.set(id, { D: BE.D, c });
  return c;
}
const carrilPorId = (id) => catalogo().find((c) => c.id === id) || carrilPersona(id);
/** Personas que pueden tener carril: con estancias o con fecha de actividad. */
function personasConCarril() {
  const ids = new Set(BE.personasConEstancias());
  for (const p of Object.values(BE.PERS)) if (p.fecha && tramo(p.fecha)) ids.add(p.id);
  return [...ids].map((id) => BE.PERS[id]).filter(Boolean).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
}
/** Carriles de la línea, en su orden: los fijados arriba en el orden en que se fijaron; después los meses (solo a
    escala de meses y días) y el resto del catálogo. La persona elegida tiene su carril justo antes de «Viajes de
    Pablo». Sin tope ni prioridades: cada carril con algo en la vista enseña todas sus filas, y uno sin nada no ocupa
    sitio. */
let carrilesVista = [];
/** De quién es el carril que trajo la selección. Elegir a una persona lo trae; elegir después una marca de ese mismo
    carril (un viaje, una parada, un suceso) no lo quita, así que la marca pulsada no desaparece bajo el dedo. */
let personaSel = null;
function personaDelCarril() {
  if (E.sel?.tipo === 'persona') personaSel = E.sel.id;
  else if (personaSel) {
    const selT = BE.selTexto(E.sel), c = carrilPersona(personaSel);
    if (!selT || !c || !marcasDe(c).items.some((it) => it.sel === selT)) personaSel = null;
  }
  return personaSel;
}
function elegirCarriles() {
  const fijos = L.fijados.map(carrilPorId).filter((c) => c && (c.tipo !== 'secular' || L.secular));
  const ids = new Set(fijos.map((c) => c.id));
  const resto = [];
  const quien = personaDelCarril();
  if (quien && !ids.has(quien)) { const c = carrilPersona(quien); if (c && c.id !== 'pablo') resto.push(c); }
  for (const c of catalogo()) {
    if (ids.has(c.id) || (c.tipo === 'meses' && !c.hay()) || (c.tipo === 'secular' && !L.secular)) continue;
    resto.push(c);
  }
  resto.sort((a, b) => a.orden - b.orden);
  carrilesVista = [...fijos, ...resto];
  for (const c of carrilesVista) c.medir?.();
  return carrilesVista;
}
/** Las marcas de un carril, hechas una vez: { id, items, packKey, medida }. */
function marcasDe(c) {
  if (!c.lane) c.lane = { id: c.id, items: c.marcas ? c.marcas() : [], packKey: null, medida: null };
  return c.lane;
}
function rotuloHtml(c) {
  const fijo = L.fijados.includes(c.id);
  const n2 = c.n2 ? BE.marcaNivel(2) : '';
  const pin = `<button type="button" class="carril-pin${fijo ? ' on' : ''}" data-fijar="${esc(c.id)}" aria-pressed="${fijo}" aria-label="${fijo ? 'Soltar' : 'Fijar'} el carril ${esc(c.nombre)}" title="${fijo ? 'Soltar este carril' : 'Fijar este carril arriba'}">${ICONOS.alfiler}</button>`;
  const nombres = c.nombres || [c.nombre];
  return nombres.map((nm, i) => {
    const ayuda = c.ayudas?.[i] || c.ayuda;
    const icono = c.iconos ? (ICONOS[c.iconos[i]] || '') : (ICONOS[c.icono] || '');
    const clase = c.clases?.[i] ? ` ${c.clases[i]}` : '';
    const mas = c.tipo === 'meses' && i === Math.max(0, (c.tiposFila || []).indexOf('hebreos')) ? enlaceCalendario('carril-ayuda', '?', '¿Qué meses son estos?') : '';
    const texto = c.cortos?.[i] ? `<span class="nombre-largo">${esc(nm)}</span><span class="nombre-corto" aria-hidden="true">${esc(c.cortos[i])}</span>` : esc(nm);
    const una = /\s/.test(nm.trim()) ? '' : ' una-palabra';   // solo un nombre de una palabra se parte con guion (linea.css)
    return `<div class="be-lane-label${c.persona ? ' carril-persona' : ''}${clase}${una}"${ayuda ? ` title="${esc(ayuda)}"` : ''}>${icono}${c.persona ? `<button type="button" class="carril-nombre enlace-titulo" data-sel="persona:${esc(c.persona)}">${esc(nm)}</button><span class="edad" data-edad="${esc(c.persona)}"></span>` : `<span>${texto}</span>`}${mas}${i === 0 ? `${n2}${pin}` : ''}</div>`;
  }).join('');
}
/** Un elemento por carril: su nombre a la izquierda y su franja, donde van las marcas. Se conservan entre pintados, así
    que una marca que tiene el foco del teclado lo sigue teniendo. */
const carrilEls = new Map();
let claveEtiquetas = '';
function pintarCarriles() {
  const clave = carrilesVista.map((c) => `${c.id}:${L.fijados.includes(c.id)}:${(c.nombres || []).join('/')}`).join('|');
  if (clave === claveEtiquetas) return;
  claveEtiquetas = clave;
  const filas = $('#linea-filas');
  // «Carriles» abre el menú de los carriles: se dibuja como un botón, con su flecha, para que se vea que se pulsa.
  if (!$('#carriles .carriles-boton')) $('#carriles').innerHTML = `<button type="button" class="carriles-boton" data-linea="carriles" aria-haspopup="dialog" aria-expanded="false" aria-label="Carriles: elegir cuáles se ven y fijarlos" title="Elegir qué carriles se ven y fijarlos arriba"><span>Carriles</span>${ICONOS.desplegar}</button>`;
  const vivos = new Set();
  for (const c of carrilesVista) {
    let x = carrilEls.get(c.id);
    if (x && x.c !== c) { x.el.remove(); carrilEls.delete(c.id); x = null; }   // otra carga de datos: marcas nuevas
    if (!x) {
      const el = document.createElement('div');
      el.className = `carril carril--${c.tipo}`;
      el.dataset.carril = c.id;
      el.innerHTML = `<div class="carril-rotulo"></div><div class="carril-pista">${c.tipo === 'meses' ? '<svg class="meses-svg" aria-hidden="false"></svg>' : ''}</div>`;
      x = { c, el, rotulo: el.firstElementChild, pista: el.lastElementChild, shown: new Set() };
      carrilEls.set(c.id, x);
    }
    x.rotulo.innerHTML = rotuloHtml(c);
    filas.insertBefore(x.el, $('#linea-medida'));   // en su orden, antes de la medida de la letra
    vivos.add(c.id);
  }
  for (const [id, x] of carrilEls) if (!vivos.has(id)) x.el.remove();
}

// ---------------------------------------------------------------------------
// Dibujo de la línea: la regla arriba (fija al bajar por los carriles), los carriles con sus marcas y, detrás de ellas,
// un fondo con la línea del cursor, las noches, la regla, el bucle y las bandas «juntos».
// ---------------------------------------------------------------------------
/** Geometría de las marcas. La fila crece con la letra («Letra grande»); con el dedo, filas y dianas de 44 px. */
const G = { row: 22, dotR: 5, pad: 6, fade: 14, fadeOpen: 36, gap: 10, maxLabel: 0, coarse: false };
let claveLetra = '', medida = null, lienzo = null, esperaLetra = null;
const tactil = () => matchMedia('(pointer: coarse)').matches;
/** Lee la letra de verdad de los nombres (la de .m-nombre, con los --fs-* del tema) y prepara cómo medirlos. Solo cambia
    con la letra, el modo táctil o la carga de las fuentes: entonces los nombres se vuelven a medir y las filas a repartir. */
function prepararLetra() {
  const probe = $('#linea-medida');
  const cs = getComputedStyle(probe), ci = getComputedStyle(probe.firstElementChild);
  const fuente = (s) => `${s.fontStyle} ${s.fontWeight} ${s.fontSize} ${s.fontFamily}`;
  const fName = fuente(cs), fTag = fuente(ci), coarse = tactil();
  // Solo cuenta la letra de las marcas: que cargue otra (la de la ficha) no puede repartir de nuevo las filas.
  const lista = !document.fonts || (document.fonts.check(fName) && document.fonts.check(fTag));
  if (!lista && !esperaLetra) {
    esperaLetra = Promise.all([document.fonts.load(fName), document.fonts.load(fTag)]).catch(() => null)
      .then(() => { esperaLetra = null; sucio.linea = true; programar(); });
  }
  // Con el dedo, un nombre de varias líneas no pasa de la mitad de la pista menos su punto: así cabe entero a un lado
  // del punto, esté donde esté, y nunca lo tapa.
  const maxLabel = coarse ? Math.max(100, Math.floor((anchoLinea - 24) / 2) - 8) : 0;
  const clave = `${fName}|${fTag}|${coarse}|${lista}|${maxLabel}`;
  if (clave === claveLetra) return;
  claveLetra = clave;
  const fs = parseFloat(cs.fontSize) || 12.5;
  // Con el dedo un nombre va en tres líneas como mucho (interlínea 1,12 en linea.css): la fila las cabe con cualquier letra.
  Object.assign(G, { coarse, row: coarse ? Math.max(44, Math.ceil(3 * 1.12 * fs) + 2) : Math.max(22, Math.ceil(fs * 1.75)), dotR: coarse ? 6 : 5, maxLabel });
  lienzo = lienzo || document.createElement('canvas').getContext('2d');
  lienzo.font = fName;
  const space = lienzo.measureText(' ').width;
  medida = {
    space,
    name: (s) => { lienzo.font = fName; return lienzo.measureText(s).width; },
    tag: (s) => { lienzo.font = fTag; return lienzo.measureText(s).width; },
  };
  for (const c of carrilesVista) if (c.lane) c.lane.medida = null;
}
const altoRotulo = () => (G.coarse ? 44 : 26);
const decorDe = (c) => (c.tipo === 'persona' ? 8 : 2);   // la franja de adorno de una persona, arriba de sus filas

/** Mientras se arrastra la franja, las filas se congelan: ninguna marca cambia de fila y ningún carril encoge. */
let hold = null;
let desdeFranja = false, ultimaSel = '', lastClicked = null;   // la marca pulsada la última vez (FIL.nextSel)
function pintarLineaFija() {
  const svg = $('#linea-svg');
  const pista = $('#pista'), cuerpo = $('#linea-cuerpo');
  anchoLinea = pista.clientWidth || 800;
  cabAlto = pista.offsetHeight || EJE;
  // Todo lo que el pintado necesita medir del panel se lee aquí, antes de escribir nada: leerlo después de poner los
  // altos de los carriles obligaría al navegador a recolocar la página otra vez.
  const med = medidasPanel(cuerpo);
  const focoAntes = document.activeElement?.closest?.('#linea-filas .m') || null;
  const s = span(), pxAnio = anchoLinea / s;
  svg.setAttribute('width', anchoLinea); svg.setAttribute('height', cabAlto);
  svg.setAttribute('viewBox', `0 0 ${anchoLinea} ${cabAlto}`);
  prepararLetra();
  elegirCarriles();
  pintarCarriles();
  const V = BE.viajeActual(BE.dondeEsta(E.t));
  rejilla = [];
  const regla = [defsRegla(), `<g class="eje">${marcasEje(pxAnio)}</g>`, densidad(), selEnRegla(), reglaEnRegla(), bucleEnRegla(), pintarMarcadores(), '<g id="linea-cursor"></g>'];
  svg.innerHTML = regla.join('');
  pintarFilas(V, med);
  // La marca con el foco cuyo carril se quitó o se escondió (una persona soltada con Esc): el foco no cae a la página,
  // pasa a la parada del tabulador de la franja.
  if (focoAntes && (!focoAntes.isConnected || focoAntes.closest('[hidden]'))) $('#linea-filas .m[tabindex="0"]')?.focus({ preventScroll: true });
  sucio.cursor = true;
  pintarVelocidad();
  let zon = '';
  document.querySelectorAll('[data-zoom]').forEach((b) => {
    const z = +b.dataset.zoom;
    const on = Math.abs(Math.log(s / z)) < Math.log(2.2);
    b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on));
    if (on) zon = b.dataset.zoom;
  });
  const zsel = $('#zoom-select');
  if (zsel && zsel.value !== zon) zsel.value = zon;
  pintarMinimapa();
  pintarSelectorMeses();
  ajustarBarra();
  pintarLineaFija.claveV = V?.id;
}
function defsRegla() {
  return '<defs><pattern id="p-rayas" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(135)"><rect width="3" height="8" fill="rgba(122,92,142,.13)"/></pattern></defs>';
}
const DEFS_MESES = '<defs><pattern id="p-hebreo" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="1.4" height="6" fill="rgba(74,65,54,.16)"/></pattern></defs>';

/** Todas las filas: reparte cada carril (linea-filas.js), da a cada uno su alto, pinta el fondo y pone en la página las
    marcas cercanas a lo que se ve. Un carril sin nada en la vista no ocupa sitio y se nombra en la línea del final. */
/** Lo que se mide del panel para colocar las marcas y el botón de la marca elegida. */
function medidasPanel(cuerpo = $('#linea-cuerpo')) {
  return { vh: cuerpo.clientHeight, top: cuerpo.scrollTop, cab: cuerpo.offsetTop, wCar: $('#carriles').offsetWidth, hLinea: $('#linea').clientHeight };
}
/** Alto del nombre de cada carril, que puede ir en varias líneas: el carril mide al menos eso, así que ningún nombre
    se sale por abajo. Se lee del DOM solo cuando cambian los nombres, la letra o el ancho, y antes de escribir nada. Un
    carril escondido no se puede medir: se mide en el pintado siguiente, que se pide. */
let claveNombres = '';
const altosNombre = new Map();
function medirNombres() {
  const clave = `${claveEtiquetas}|${claveLetra}|${innerWidth}`;
  if (clave !== claveNombres) { claveNombres = clave; altosNombre.clear(); }
  let faltan = false;
  for (const c of carrilesVista) {
    if (altosNombre.has(c.id) || c.nombres) continue;
    const x = carrilEls.get(c.id);
    if (!x || x.el.hidden) { faltan = true; continue; }
    altosNombre.set(c.id, x.rotulo.firstElementChild?.offsetHeight || 0);
  }
  return faltan;
}
function pintarFilas(V, med) {
  const view = { v0: E.vista[0], span: span() };
  const geom = { w: anchoLinea, t0: BE.T_MIN, G, key: `${claveLetra}|${G.row}` };
  const vacios = [];
  let top = 0, shownN = 0;
  const faltan = medirNombres();
  let otraVez = false;
  const selT = BE.selTexto(E.sel);
  for (const c of carrilesVista) {
    const x = carrilEls.get(c.id);
    c.top = top;
    if (c.tipo === 'meses') {
      c.alto = Math.max(1, c.filas || 1) * CARRIL;
      const partes = [DEFS_MESES];
      pintarMeses(partes, { y: 0, tiposFila: c.tiposFila });
      x.pista.firstElementChild.setAttribute('width', anchoLinea);
      x.pista.firstElementChild.setAttribute('height', c.alto);
      x.pista.firstElementChild.innerHTML = partes.join('');
    } else {
      const lane = marcasDe(c);
      if (lane.medida !== claveLetra) { FIL.measure(lane.items, medida, G); lane.medida = claveLetra; lane.packKey = null; }
      c.decor = decorDe(c);
      c.out = FIL.layoutLane(lane, view, geom, hold);
      c.alto = c.out.nRows ? Math.max(c.out.nRows * G.row + c.decor + 3, altoRotulo(), altosNombre.get(c.id) || 0) : 0;
      if (c.alto && faltan && !altosNombre.has(c.id)) otraVez = true;   // recién aparecido: se mide en el pintado siguiente
      if (!c.alto) vacios.push(c.nombre);
      for (const it of c.out.visible) it._clase = dim(it.sel);
    }
    x.el.hidden = !c.alto;
    x.el.classList.toggle('par', !!c.alto && shownN++ % 2 === 1);   // el fondo alterno cuenta solo los carriles que se ven
    x.el.style.height = `${c.alto}px`;
    top += c.alto;
  }
  altoFilas = top;
  if (otraVez) { sucio.linea = true; programar(); }
  const filas = $('#linea-filas');
  filas.style.setProperty('--fila', `${G.row}px`);
  filas.classList.toggle('arrastrando', !!hold);
  const vac = $('#linea-vacios');
  vac.textContent = vacios.length ? `Sin nada en esta vista: ${vacios.join(', ')}.` : '';
  vac.hidden = !vacios.length;
  pintarFondo();
  ventanaMarcas(true, V, selT, med);
  // Una selección que llega de fuera de la franja (la búsqueda, una ficha, el grafo, la dirección) baja los carriles
  // hasta su marca, una vez. Un clic en una marca nunca los mueve.
  if (selT !== ultimaSel) {
    if (!desdeFranja) lastClicked = null;   // lo elegido llegó de otro sitio: ninguna marca recordada
    if (selT && !desdeFranja) { const it = marcasDeSel(selT)[0]; if (it) { verFila(it); med = null; } }
    ultimaSel = selT;
  }
  desdeFranja = false;
  pintarIrSel(med);
}

/** El fondo, detrás de las marcas y del alto de todos los carriles. */
let rejilla = [];
function pintarFondo() {
  const f = $('#linea-fondo');
  const h = Math.max(1, altoFilas);
  f.setAttribute('width', anchoLinea); f.setAttribute('height', h);
  f.setAttribute('viewBox', `0 0 ${anchoLinea} ${h}`);
  f.style.height = `${h}px`;
  const partes = [defsRegla()];
  partes.push(noches(h));
  partes.push(`<g class="rejilla-lineas">${rejilla.map((x) => `<line x1="${x}" x2="${x}" y1="0" y2="${h}" class="rejilla"/>`).join('')}</g>`);
  partes.push(adornosPersonas());
  partes.push(pintarJuntos());
  partes.push(reglaEnFondo(h));
  partes.push(bucleEnFondo(h));
  partes.push('<g id="fondo-cursor"></g>');
  f.innerHTML = partes.join('');
}

// ---------------------------------------------------------------------------
// Marcas: un botón por marca, con su dibujo y su nombre
// ---------------------------------------------------------------------------
const colorDe = (it) => (typeof it.color === 'function' ? it.color() : it.color);
const CERT_ARIA = { exact: 'fecha de la fuente', approx: 'fecha aproximada', computed: 'fecha calculada', uncertain: 'fecha dudosa' };
function crearMarca(it) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = `m${it.secular ? ' m--secular' : ''}${FIL.hollow(it) ? ' m--hueca' : ''}`;
  b.dataset.sel = it.sel;
  b.dataset.id = it.id;
  b.tabIndex = -1;
  // Lo calculado lo dice el nombre accesible con palabras: «situada por el orden del relato» si sale de él.
  const cert = it.cert === 'computed' && /narrativa/.test(it.fechaTipo || '') ? 'situada por el orden del relato' : CERT_ARIA[it.cert];
  b.setAttribute('aria-label', `${it.titulo ? `${it.titulo}, ` : ''}${it.name}. ${it.tipo}, ${it.shape === 'moment' ? 'momento' : 'tramo'}, ${cert}${it.fecha ? `. ${it.fecha}` : ''}${it.repite ? '. Se repetía cada año' : ''}`);
  b.setAttribute('aria-pressed', 'false');
  if (it.shape === 'span') {
    it.barEl = document.createElement('span');
    it.barEl.className = 'm-barra';
    b.appendChild(it.barEl);
  } else {
    it.winEl = document.createElement('span');
    it.winEl.className = `m-ventana${it.cert === 'exact' ? ' topes' : ''}`;
    it.dotEl = document.createElement('span');
    it.dotEl.className = 'm-punto';
    b.append(it.winEl, it.dotEl);
  }
  const lab = document.createElement('span');
  lab.className = 'm-nombre';
  const txt = document.createElement('span');
  txt.className = 't';
  txt.textContent = it.name;
  const tag = FIL.TAG[it.cert];
  if (tag) { const i = document.createElement('i'); i.textContent = tag; txt.append(' ', i); }
  if (it.repite) { const i = document.createElement('i'); i.className = 'm-repite'; i.textContent = FIL.REPEAT; txt.append(' ', i); }
  lab.appendChild(txt);
  b.appendChild(lab);
  it.labEl = lab;
  it.el = b;
  return b;
}
/** Colores de la marca, que dependen del tema: se vuelven a poner al cambiarlo. */
function colorear(it) {
  const tema = document.documentElement.className;
  if (it._tema === tema) return;
  it._tema = tema;
  const c = colorDe(it), hueca = FIL.hollow(it);
  const forma = it.barEl || it.dotEl;
  forma.style.borderColor = hueca ? c : '';
  forma.style.background = hueca ? 'var(--surface)' : c;
  // Atenuada, la marca se pinta con su color lavado hacia el fondo (linea.css): lo toma de --c.
  it.el.style.setProperty('--c', c);
  if (it.winEl) it.winEl.style.color = c;
  // Una fecha secular se pinta clara con contorno de trazos (linea.css): su nombre va en el color secular, no según c.
  const tn = it.secular ? { texto: '', forma: '' } : tonos(c);
  it.labEl.classList.toggle('sobre-claro', !!tn.texto);
  // Una forma llena que casi no se distingue del fondo de la línea lleva borde (be-64b.1).
  forma.classList.toggle('con-borde', !hueca && !!tn.forma);
}
function mascara(el, l, r) {
  const v = l || r ? `linear-gradient(90deg, transparent 0, #000 ${l}px, #000 calc(100% - ${r}px), transparent 100%)` : '';
  el.style.maskImage = v; el.style.webkitMaskImage = v;
}
/** Pone una marca en su sitio: caja, dibujo, nombre y estado (elegida, resaltada, atenuada). */
function pintarMarca(it, top, selT, V) {
  const el = it.el || crearMarca(it);
  colorear(it);
  // La caja del botón se queda dentro de la pista, a 2 px del borde: así el anillo del foco se ve entero. El dibujo y el
  // nombre van en su sitio de siempre, y lo que sale de la pista lo recorta la pista.
  let h0 = Math.max(it._hit[0], 2), h1 = Math.min(it._hit[1], anchoLinea - 2);
  if (h1 - h0 < 4) [h0, h1] = it._hit;
  el.style.left = `${h0}px`; el.style.width = `${h1 - h0}px`;
  el.style.top = `${top}px`; el.style.height = `${G.row}px`;
  if (it.barEl) {
    const [bx, bw, fl, fr] = it._bar;
    it.barEl.style.left = `${bx - h0}px`; it.barEl.style.width = `${bw}px`;
    if (it._fl !== fl || it._fr !== fr) { mascara(it.barEl, fl, fr); it._fl = fl; it._fr = fr; }
  }
  if (it.winEl) {
    if (it._win) {
      const [wx, ww, fl, fr] = it._win;
      it.winEl.hidden = false;
      it.winEl.style.left = `${wx - h0}px`; it.winEl.style.width = `${ww}px`;
      if (it._fl !== fl || it._fr !== fr) { mascara(it.winEl, fl, fr); it._fl = fl; it._fr = fr; }
    } else it.winEl.hidden = true;
    it.dotEl.style.left = `${it._dot - G.dotR - h0}px`;
  }
  it.labEl.style.left = `${it._lx - h0}px`;
  const varias = it.lines > 1 && !it._in;
  it.labEl.classList.toggle('varias', varias);
  it.labEl.style.width = varias ? `${it.labelW}px` : '';
  it.labEl.classList.toggle('en-barra', it._labOnFill);
  it.labEl.classList.toggle('fuera', !it._labOnFill);
  const elegida = it.sel === selT;
  el.setAttribute('aria-pressed', String(elegida));
  const clase = `m${it.secular ? ' m--secular' : ''}${FIL.hollow(it) ? ' m--hueca' : ''}${it._clase || ''}${V && it.sel === `viaje:${V.id}` ? ' activo' : ''}`;
  if (el.className !== clase) el.className = clase;
}
/** Solo van en la página las marcas de las filas cercanas a lo que se ve (una altura del panel por arriba y otra por
    abajo): a escala de milenios los carriles miden miles de píxeles y todas sus marcas a la vez harían lento el
    arrastre. Las filas y los altos son los de verdad, así que al bajar cada nombre está donde debe. */
function ventanaMarcas(repintar, V = BE.viajeActual(BE.dondeEsta(E.t)), selT = BE.selTexto(E.sel), med = medidasPanel()) {
  const vh = med.vh || 300;
  const y0 = med.top - vh, y1 = med.top + 2 * vh;
  const conFoco = document.activeElement;
  let perdioFoco = false;
  for (const c of carrilesVista) {
    const x = carrilEls.get(c.id);
    if (!x || c.tipo === 'meses') continue;
    const keep = new Set();
    if (c.alto) {
      for (const it of c.out.visible) {
        const top = c.decor + it._drow * G.row;
        const y = c.top + top;
        // La marca con el foco se queda en la página aunque la rueda la saque de la ventana: el foco no salta a otra.
        if ((y + G.row < y0 || y > y1) && !(it.el && it.el === conFoco)) continue;
        keep.add(it);
        const nueva = !it.el || it.el.parentNode !== x.pista;
        if (nueva || repintar) pintarMarca(it, top, selT, V);
        if (nueva) x.pista.appendChild(it.el);
      }
    }
    for (const it of x.shown) if (!keep.has(it) && it.el) { perdioFoco ||= it.el === document.activeElement; it.el.remove(); }
    x.shown = keep;
  }
  tabuladores();
  // Una marca con el foco que sale de la ventana se quita como las demás (si no, quedaría pintada donde ya no está);
  // el foco pasa a la marca que ahora es la parada del tabulador, sin mover nada.
  if (perdioFoco) $('#linea-filas .m[tabindex="0"]')?.focus({ preventScroll: true });
}
const marcasVisibles = () => carrilesVista.flatMap((c) => (c.alto && c.out ? c.out.visible.map((it) => ({ it, c })) : []));
const marcasDeSel = (selT) => marcasVisibles().filter(({ it }) => it.sel === selT).map(({ it }) => it);
const carrilDe = (it) => carrilesVista.find((c) => c.out && c.out.visible.includes(it));
const topDe = (it, c = carrilDe(it)) => c.top + c.decor + it._drow * G.row;
/** Baja o sube los carriles lo justo para que se vea la fila de la marca. */
function verFila(it) {
  const cuerpo = $('#linea-cuerpo');
  const y = topDe(it), alto = cuerpo.clientHeight - cabAlto, m = 4;
  if (y - m < cuerpo.scrollTop) cuerpo.scrollTop = Math.max(0, y - m);
  else if (y + G.row + m > cuerpo.scrollTop + alto) cuerpo.scrollTop = y + G.row + m - alto;
}

// ---------------------------------------------------------------------------
// Teclado: la franja es una sola parada del tabulador; las flechas van de marca en marca sin mover el cursor
// ---------------------------------------------------------------------------
let focoId = null;
/** Filas de marcas de arriba abajo, carril por carril; cada una de izquierda a derecha, solo lo que cae en la franja. */
function filasTeclado() {
  const out = [];
  for (const c of carrilesVista) {
    if (!c.alto || !c.out) continue;
    const porFila = new Map();
    for (const it of c.out.visible) if (it._hit[1] > 0 && it._hit[0] < anchoLinea) { if (!porFila.has(it._drow)) porFila.set(it._drow, []); porFila.get(it._drow).push(it); }
    for (const r of [...porFila.keys()].sort((a, b) => a - b)) out.push(porFila.get(r).sort((a, b) => a._hit[0] - b._hit[0]));
  }
  return out;
}
/** Solo una marca lleva tabindex 0: la que tuvo el foco, la elegida o la primera. */
function tabuladores() {
  const todas = marcasVisibles().filter(({ it }) => it.el?.isConnected).map(({ it }) => it);
  const selT = BE.selTexto(E.sel);
  const objetivo = todas.find((it) => it.id === focoId) || todas.find((it) => it.sel === selT) || filasTeclado().flat().find((it) => it.el?.isConnected);
  for (const it of todas) it.el.tabIndex = it === objetivo ? 0 : -1;
}
function enfocar(it) {
  focoId = it.id;
  verFila(it);
  ventanaMarcas(false);
  it.el?.focus({ preventScroll: true });
}
function teclaMarca(e) {
  const b = e.target.closest('.m');
  if (!b || e.shiftKey || e.altKey || e.ctrlKey || e.metaKey) return;
  const k = e.key;
  if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(k)) return;
  e.preventDefault(); e.stopPropagation();   // las flechas de una marca no mueven el cursor (base.js)
  const rows = filasTeclado();
  const ri = rows.findIndex((r) => r.some((it) => it.id === b.dataset.id));
  if (ri < 0) return;
  const row = rows[ri], i = row.findIndex((it) => it.id === b.dataset.id), it = row[i];
  if (k === 'ArrowRight' || k === 'ArrowLeft') { const n = row[i + (k === 'ArrowRight' ? 1 : -1)]; if (n) enfocar(n); }
  else if (k === 'Home' || k === 'End') enfocar(row[k === 'Home' ? 0 : row.length - 1]);
  else {
    const next = rows[ri + (k === 'ArrowDown' ? 1 : -1)];
    if (!next) return;
    const cx = (it._hit[0] + it._hit[1]) / 2;
    let best = next[0];
    for (const c of next) if (Math.abs((c._hit[0] + c._hit[1]) / 2 - cx) < Math.abs((best._hit[0] + best._hit[1]) / 2 - cx)) best = c;
    enfocar(best);
  }
}
const vivo = (texto) => { const v = $('#linea-vivo'); if (v) v.textContent = texto; };

/** Elegir una marca: el cursor entra en ella por el punto señalado (con el teclado, por el más cercano) y la marca se
    elige y abre su ficha. Ni la escala, ni la vista, ni los carriles se mueven. Una fecha secular no mueve el cursor.
    Pulsar otra vez la misma marca suelta lo elegido, como un segundo clic en el mapa, y el cursor no se mueve. Otra
    marca de lo elegido (otra estancia de la persona) lleva el cursor a ella y no suelta nada. */
function elegirMarca(it, tSeñalado) {
  if (FIL.nextSel(it.sel, it.id, BE.selTexto(E.sel), lastClicked) == null) { BE.limpiarSeleccion(); vivo('Nada elegido.'); return; }
  lastClicked = it.id;
  const t = it.sinCursor ? null : FIL.clickTarget(it, tSeñalado, E.t, { v0: E.vista[0], span: span() }, BE.DIA);
  if (t != null) setT(t);
  desdeFranja = true;
  const sel = BE.parseSel(it.sel);
  if (sel && BE.selTexto(E.sel) !== it.sel) BE.seleccionar(sel, { mover: false });
  else { sucio.linea = true; programar(); }
  vivo(`Elegido: ${it.name}.${it.fecha ? ` ${it.fecha}.` : ''}`);
}

// ---------------------------------------------------------------------------
// La marca elegida fuera de la vista: un botón la trae sin cambiar la escala ni el cursor
// ---------------------------------------------------------------------------
function pintarIrSel(med) {
  paintDimming(med || medidasPanel());
  const b = $('#linea-ir-sel');
  if (!b) return;
  const selT = BE.selTexto(E.sel);
  let it = null, c = null;
  if (selT) {
    const todas = carrilesVista.flatMap((x) => (x.lane && x.alto !== undefined ? x.lane.items.filter((y) => y.sel === selT).map((y) => [y, x]) : []));
    if (todas.length === 1) [it, c] = todas[0];
  }
  b.hidden = true;
  if (!it) return;
  const lo = it.shape === 'moment' ? it.w0 : it.start, hi = it.shape === 'moment' ? it.w1 : it.end;
  const m = med || medidasPanel();
  const cab = m.cab;
  let lado = null;
  if (hi <= E.vista[0]) lado = 'izq';
  else if (lo >= E.vista[1]) lado = 'der';
  else if (c.out?.visible.includes(it)) {
    const y = topDe(it, c);
    if (y + G.row <= m.top) lado = 'arriba';
    else if (y >= m.top + m.vh - cabAlto) lado = 'abajo';
  }
  if (!lado) return;
  b.hidden = false;
  b.dataset.lado = lado;
  b.textContent = { izq: `← ${it.name}`, der: `${it.name} →`, arriba: `↑ ${it.name}`, abajo: `↓ ${it.name}` }[lado];
  b.setAttribute('aria-label', `Llevar la vista a ${it.name}`);
  b.style.left = b.style.right = b.style.top = b.style.bottom = '';
  const wCar = m.wCar;
  if (lado === 'izq') { b.style.left = `${wCar + 4}px`; b.style.top = `${cab + 2}px`; }
  else if (lado === 'der') { b.style.right = '6px'; b.style.top = `${cab + 2}px`; }
  // Arriba y abajo, en la columna de los nombres de carril: ahí no tapa ninguna marca.
  else if (lado === 'arriba') { b.style.left = '4px'; b.style.top = `${cab + cabAlto + 4}px`; }
  else { b.style.left = '4px'; b.style.bottom = `${m.hLinea - cab - m.vh + 6}px`; }
  b.classList.toggle('en-rotulos', lado === 'arriba' || lado === 'abajo');
  b._it = it;
}
/** Atenuar solo tiene sentido mientras se ve lo elegido (FIL.dimOthers). Si su marca sale entera de la vista, de lado o
    por arriba o por abajo del panel alto, las demás recuperan su color y la selección se queda; al volver, se atenúan
    otra vez. Lo elegido sin marca propia (Edén en 1473 a.e.c.) atenúa mientras se ve algo que tiene que ver con él. Va
    aquí porque el botón de traer la marca se decide con las mismas medidas: al pintar, al desplazar y al cambiar el alto. */
function paintDimming(m) {
  const selT = BE.selTexto(E.sel);
  const v = { w: anchoLinea, top: m.top, h: m.vh - cabAlto, row: G.row };
  const s = { own: false, ownInView: false, relatedInView: false };
  let othersInView = false;
  for (const c of carrilesVista) {
    if (!c.lane || !c.out) continue;
    if (selT && !s.own) s.own = c.lane.items.some((it) => it.sel === selT);
    for (const it of c.out.visible) {
      if (it._clase === ' atenuado') othersInView = true;
      else if (it._clase === ' resaltado' && it._hit[1] > 0 && it._hit[0] < anchoLinea) s.relatedInView = true;
      if (it.sel === selT && !s.ownInView) s.ownInView = FIL.inView(it._hit, topDe(it, c), v);
    }
  }
  $('#linea-filas').classList.toggle('sin-foco', othersInView && !FIL.dimOthers(s));
}
function irASel(b) {
  const it = b._it;
  if (!it) return;
  const lado = b.dataset.lado;
  if (lado === 'arriba' || lado === 'abajo') { verFila(it); ventanaMarcas(false); pintarIrSel(); return; }
  // Mueve la vista lo justo para que se vea la marca entera, o su comienzo si no cabe; la escala no cambia.
  const s = span(), m = s * 0.05;
  const lo = it.shape === 'moment' ? it.w0 : it.start, hi = it.shape === 'moment' ? it.w1 : it.end;
  let v0 = lado === 'izq' ? lo - m : hi + m - s;
  if (hi - lo > s - 2 * m) v0 = lo - m;
  v0 = clamp(v0, BE.T_MIN, BE.T_MAX - s);
  E.vista = [v0, v0 + s];
  sucio.linea = true; programar();
}

/** Lo que dibuja la línea, para las pruebas (tests/site/timeline-marks.test.mjs): cada marca de los carriles que hay,
    con su sitio si se ve. Solo lectura. */
BE.lineaMarcas = () => {
  const out = [];
  for (const c of carrilesVista) {
    if (!c.lane) continue;
    const vis = new Set(c.alto && c.out ? c.out.visible : []);
    for (const it of c.lane.items) {
      const v = vis.has(it);
      out.push({ id: it.id, sel: it.sel, lane: c.id, name: it.name, label: FIL.labelText(it), cert: it.cert, shape: it.shape, hollow: FIL.hollow(it), group: it.group || 0, rowWorld: it.row ?? null, repite: !!it.repite,
        t0: it.shape === 'moment' ? it.w0 : it.start, t1: it.shape === 'moment' ? it.w1 : it.end, anchor: it.anchor ?? null,
        visible: v, row: v ? it._drow : null, x: v ? it._hit[0] : null, w: v ? it._hit[1] - it._hit[0] : null, top: v ? topDe(it, c) : null,
        labelX: v ? it._lx : null, labelW: v ? FIL.lwOf(it) : null, secular: !!it.secular });
    }
  }
  return out;
};
BE.lineaCarriles = () => carrilesVista.map((c) => ({ id: c.id, nombre: c.nombre, tipo: c.tipo, alto: c.alto || 0, top: c.top || 0, filas: c.out?.nRows ?? null }));

/** Donde dos carriles de persona vecinos coinciden en el mismo lugar a la vez, una banda los une (T-06). */
function pintarJuntos() {
  const ps = carrilesVista.filter((c) => c.alto && (c.tipo === 'persona' || c.tipo === 'pablo'));
  const out = [];
  for (let i = 0; i + 1 < ps.length; i++) {
    const A = ps[i], B = ps[i + 1];
    if (Math.abs(B.top - (A.top + A.alto)) > 0.5) continue;   // solo si van seguidos
    const ea = BE.estancias(A.id === 'pablo' ? 'pablo' : A.persona), eb = BE.estancias(B.id === 'pablo' ? 'pablo' : B.persona);
    for (const a of ea) for (const b of eb) {
      if (!a.lugar.id || a.lugar.id !== b.lugar.id) continue;   // dos áreas desconocidas no son el mismo sitio
      const t0 = Math.max(a.a, b.a), t1 = Math.min(a.b, b.b);
      if (t1 <= t0 || t1 < E.vista[0] || t0 > E.vista[1]) continue;
      const x0 = xDe(t0), x1 = Math.max(xDe(t1), x0 + 3);
      out.push(`<rect x="${x0}" y="${A.top}" width="${x1 - x0}" height="${A.alto + B.alto}" class="banda-juntos"><title>Juntos en ${esc(a.lugar.nombre)}</title></rect>`);
    }
  }
  return out.join('');
}
/** Adorno de un carril de persona, en su franja fina de arriba: su actividad y el camino (sin fecha) entre dos
    estancias cercanas. No son marcas: no se pulsan y no ocupan filas. */
function adornosPersonas() {
  const out = [];
  for (const c of carrilesVista) {
    if (c.tipo !== 'persona' || !c.alto) continue;
    const color = BE.colorPersona(c.persona);
    if (c.act && visible(c.act)) {
      const x0 = xDe(c.act[0]), x1 = Math.max(xDe(c.act[1]), x0 + 3);
      out.push(`<rect x="${x0}" y="${c.top + 2}" width="${x1 - x0}" height="3" rx="1.5" class="barra-actividad" style="fill:${color}"/>`);
    }
    const est = c.est.filter((s) => s.b > E.vista[0] - span() && s.a < E.vista[1] + span());
    for (let i = 0; i + 1 < est.length; i++) {
      const a = est[i], b = est[i + 1];
      if (b.a <= a.b || b.a - a.b > 0.25 || a.lugar.id === b.lugar.id) continue;
      out.push(`<line x1="${xDe(a.b)}" x2="${xDe(b.a)}" y1="${c.top + 6}" y2="${c.top + 6}" class="camino" style="stroke:${color}"/>`);
    }
  }
  return out.join('');
}
/** Recorta un texto a lo que cabe en px (los meses: tres letras o la inicial si no cabe más). */
function recortar(texto, px) {
  if (!(px >= 24)) return px === Infinity ? texto : '';
  const max = Math.floor(px / 6.3);
  return texto.length <= max ? texto : `${texto.slice(0, Math.max(1, max - 1))}…`;
}

// ---------------------------------------------------------------------------
// Meses: nuestros meses y los hebreos, alineados (T-19)
// ---------------------------------------------------------------------------
/** Nuestros meses: el calendario gregoriano aplicado hacia atrás, solo para orientar. Sin días bisiestos: el cuarto de
    día que sobra cada año se lo queda el 31 de diciembre. Días de medianoche a medianoche, como hoy. */
const DIAS_ANTES = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334, 365];
const MESES_LARGOS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const inicioNuestro = (y, m) => (m >= 12 ? y + 1 : y + DIAS_ANTES[m] * BE.DIA);
/** Como fmtCursor de base.js, con los meses de verdad: «abr. 33 e.c.» o, sin `fino`, «33 e.c.». */
const fmtMes = (t, fino) => (fino ? `${MESES[mesNuestro(t).m]} ${fmtAnio(Math.floor(t))}` : fmtAnio(Math.floor(t)));
function mesNuestro(t) {
  const y = Math.floor(t), d = (t - y) / BE.DIA;
  let m = 0;
  while (m < 11 && d >= DIAS_ANTES[m + 1]) m++;
  return { anio: y, m, dia: Math.min(DIAS_ANTES[m + 1] - DIAS_ANTES[m], Math.floor(d - DIAS_ANTES[m]) + 1) };
}
const MODOS_MESES = [['ambos', 'Ambos'], ['nuestros', 'Nuestros'], ['hebreos', 'Hebreos']];
const modoMeses = () => L.meses || 'ambos';   // los dos calendarios, también en el móvil: caben, y es lo que pedimos
const AYUDA_NUESTROS = 'Nuestros meses: el calendario gregoriano es de 1582. Aquí se aplica hacia atrás solo para orientar.';
const AYUDA_HEBREOS = 'Meses hebreos: lunares y aproximados, de luna nueva a luna nueva. Los nombres cambian con la época: en cursiva, un nombre de después del exilio que la Biblia de antes no usa. El día hebreo empezaba al ponerse el sol: la franja sombreada ya es el día siguiente.';
const ANACRONICO = 'Va en cursiva porque la Biblia de esa época no le da este nombre.';
const mayus = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const AYUDA_FIESTAS = 'Fiestas del calendario hebreo (tabla B15 de la Biblia de estudio), en su día aproximado.';
/** Enlace a la página del calendario. Lleva la vista actual para que su «Volver al mapa» vuelva aquí. */
function enlaceCalendario(clase, texto, titulo) {
  return `<a class="${clase}" href="calendario.html" data-calendario="1" title="${esc(titulo)}" aria-label="${esc(titulo)}">${esc(texto)}</a>`;
}
/** Fiestas que caen en [a, b]: { nombre, corto, a, b, mes } en el año hebreo de cada una. */
function fiestasEn(a, b) {
  const out = [];
  const cal = BE.calendario();
  for (let y = Math.floor(a - cal.inicio) - 1; y <= Math.ceil(b); y++) {
    for (const M of BE.anioHebreo(y).meses) {
      for (const f of M.mes.fiestas || []) {
        const fa = M.a + (f.desde - 1) * BE.DIA, fb = M.a + (f.hasta ?? f.desde) * BE.DIA;
        if (f.instituida != null && fa < f.instituida) continue;   // antes de instituirse no hay fiesta que pintar
        if (fb > a && fa < b) out.push({ ...f, a: fa, b: fb, mes: M.mes, anio: y, corto: nombreCortoFiesta(f.nombre) });
      }
    }
  }
  return out;
}
/** «Fiesta de las Semanas (Pentecostés)» → «Pentecostés»; «Fiesta de los Panes Sin Levadura» → «Panes Sin Levadura». */
function nombreCortoFiesta(n) {
  const par = n.match(/\(([^)]+)\)/);
  if (par) return par[1];
  const c = n.replace(/^(fiesta|ofrenda|toque|d[ií]a) de (la |las |los |el )?/i, '');
  return c.charAt(0).toUpperCase() + c.slice(1);
}
function medirMeses() {
  const modo = modoMeses();
  const tipos = modo === 'ambos' ? ['nuestros', 'hebreos'] : [modo];
  if (span() < 0.35 && fiestasEn(E.vista[0], E.vista[1]).length) tipos.push('fiestas');
  this.tiposFila = tipos;
  this.filas = tipos.length;
  this.nombres = tipos.map((k) => ({ nuestros: 'Nuestros meses', hebreos: 'Meses hebreos', fiestas: 'Fiestas' })[k]);
  this.cortos = tipos.map((k) => ({ nuestros: 'Nuestros', hebreos: 'Hebreos', fiestas: 'Fiestas' })[k]);
  this.ayudas = tipos.map((k) => ({ nuestros: AYUDA_NUESTROS, hebreos: AYUDA_HEBREOS, fiestas: AYUDA_FIESTAS })[k]);
  this.clases = tipos.map((k) => `carril-mes carril-mes--${k}`);
}
/** Sombra de las horas entre la puesta de sol y nuestra medianoche, a escala de días: el día hebreo iba de una puesta
    de sol a la siguiente (Perspicacia «Día»), así que esas horas ya son el día hebreo siguiente y todavía nuestra fecha
    anterior. La puesta se pone a las 18:00: las horas de luz iban más o menos de seis a seis (el mismo artículo). */
function noches(h) {
  if (!(span() < 0.35) || !BE.calendario().meses.length || modoMeses() === 'nuestros') return '';
  const pxDia = (anchoLinea / span()) * BE.DIA;
  if (pxDia < 4) return '';
  const out = [];
  for (let y = Math.floor(E.vista[0]); y <= Math.floor(E.vista[1]); y++) {
    const k0 = Math.max(0, Math.floor((E.vista[0] - y) / BE.DIA) - 1), k1 = Math.min(365, Math.ceil((E.vista[1] - y) / BE.DIA) + 1);
    for (let k = k0; k <= k1; k++) {
      const a = y + (k + 0.75) * BE.DIA, b = Math.min(y + (k + 1) * BE.DIA, y + 1);
      if (b < E.vista[0] || a > E.vista[1] || b <= a) continue;
      out.push(`<rect x="${xDe(a)}" y="0" width="${Math.max(1, xDe(b) - xDe(a))}" height="${h}"/>`);
    }
  }
  return `<g class="noche-hebrea" aria-hidden="true">${out.join('')}</g>`;
}
/** Los meses (T-19): una fila por calendario, alineadas, y a escala de días una fila de fiestas. Los meses hebreos llevan
    el nombre de su época (Abib antes del exilio, Nisán después); si la Biblia de esa época no les da nombre, el de
    siempre va en cursiva. Nuestros meses van en contorno y los hebreos rellenos y rayados: se distinguen sin color. */
function pintarMeses(partes, c) {
  // Fijado a escala de siglos o milenios serían miles de meses de menos de un píxel: se avisa en su lugar.
  if (anchoLinea / span() / 12 < 3) { partes.push(`<text x="8" y="${c.y + 19}" class="texto-fuera">Acerca la línea para ver los meses</text>`); return; }
  const tipos = c.tiposFila || ['hebreos'];
  const dias = span() < 0.35, pxDia = (anchoLinea / span()) * BE.DIA;
  tipos.forEach((tipo, fila) => {
    const y = c.y + fila * CARRIL;
    if (tipo === 'fiestas') { pintarFiestas(partes, y); return; }
    const cajas = [];
    if (tipo === 'nuestros') {
      for (let anio = Math.floor(E.vista[0]); anio <= Math.floor(E.vista[1]); anio++) {
        for (let m = 0; m < 12; m++) {
          const a = inicioNuestro(anio, m), b = inicioNuestro(anio, m + 1);
          if (b < E.vista[0] || a > E.vista[1]) continue;
          cajas.push({ a, b, k: m, nombre: MESES_LARGOS[m], anio, titulo: `${MESES_LARGOS[m]} de ${fmtAnio(anio)} (nuestro calendario, aplicado hacia atrás)`,
            aviso: `${mayus(MESES_LARGOS[m])} de ${fmtAnio(anio)}, en nuestro calendario, aplicado hacia atrás solo para orientar.` });
        }
      }
    } else {
      const cal = BE.calendario();
      for (let anio = Math.floor(E.vista[0] - cal.inicio) - 1; anio <= Math.ceil(E.vista[1]); anio++) {
        BE.anioHebreo(anio).meses.forEach((M, k) => {
          if (M.b < E.vista[0] || M.a > E.vista[1]) return;
          const nm = BE.nombreMes(M.mes, anio);
          const eq = typeof M.mes.equivale === 'string' ? `, más o menos ${M.mes.equivale}` : '';
          const extra = M.mes.id === 'veadar' ? '\nEl mes que se añadía algunos años.' : '';
          cajas.push({ a: M.a, b: M.b, k, nombre: nm.nombre, anacronico: nm.anacronico, anadido: M.mes.id === 'veadar', anio,
            titulo: `${nm.nombre}: mes hebreo${eq}${nm.anacronico ? ' (nombre de después del exilio)' : ''}${extra}${nm.nota ? `\n${nm.nota}` : ''}`,
            aviso: `${nm.nombre}: mes hebreo${eq}.${extra.replace('\n', ' ')}${nm.anacronico ? ` ${ANACRONICO}${nm.nota ? ` ${nm.nota}` : ''}` : ''}` });
        });
      }
    }
    for (const cj of cajas) {
      const x0 = xDe(cj.a), x1 = xDe(cj.b), w = x1 - x0;
      const libre = Math.min(x1, anchoLinea) - Math.max(x0, 0) - 12;
      const conAnio = `${cj.nombre} de ${fmtAnio(tipo === 'nuestros' ? cj.anio : Math.floor(Math.max(cj.a, E.vista[0])))}`;
      const texto = anchoTexto(conAnio) + 10 <= libre && dias ? conAnio : recortar(cj.nombre, libre);
      const cls = `mes mes--${tipo} mes-${cj.k % 2}${cj.anacronico ? ' anacronico' : ''}${cj.anadido ? ' anadido' : ''}`;
      const tx = Math.max(x0, 0) + 7;
      let numeros = '';
      if (dias) {
        // Días del mes: una marca en cada cambio de día y el número si cabe, sin pisar el nombre.
        const finNombre = texto ? tx + anchoTexto(texto) + 4 : -Infinity;
        const n = Math.round((cj.b - cj.a) / BE.DIA);
        for (let d = 1; d <= n; d++) {
          const ta = cj.a + (d - 1) * BE.DIA, xa = xDe(ta), xm = xDe(ta + BE.DIA / 2);
          if (xa > anchoLinea + 2 || xDe(ta + BE.DIA) < -2) continue;
          if (d > 1 && pxDia >= 5) numeros += `<line x1="${xa}" x2="${xa}" y1="${y + 18}" y2="${y + 24}" class="mes-dia"/>`;
          if (pxDia >= 15 && xm - 6 > finNombre && (pxDia >= 22 || d % 2 === 1)) numeros += `<text x="${xm}" y="${y + 19}" text-anchor="middle" class="mes-num">${d}</text>`;
        }
      }
      // Sin sitio para el nombre (meses en el móvil), tres letras o la inicial, centradas; el nombre entero va en el título.
      let corto = '';
      if (!texto && !dias) {
        const vis = libre + 12, tres = cj.nombre.slice(0, 3);
        corto = vis - 6 >= tres.length * 6.3 ? tres : vis >= 11 ? cj.nombre.charAt(0).toUpperCase() : '';
      }
      const rotulo = texto ? `<text x="${tx}" y="${y + 19}" class="mes-texto">${esc(texto)}</text>`
        : corto ? `<text x="${((Math.max(x0, 0) + Math.min(x1, anchoLinea)) / 2).toFixed(1)}" y="${y + 19}" text-anchor="middle" class="mes-texto mes-texto--corto">${esc(corto)}</text>` : '';
      // Al tocarla, la caja cuyo nombre no se lee entero (o va en cursiva) lo dice en un aviso: en el móvil no hay título.
      const avisar = !texto || texto !== cj.nombre && texto !== conAnio || cj.anacronico;
      partes.push(`<g class="${cls}"${avisar ? ` data-aviso="${esc(cj.aviso)}"` : ''}><title>${esc(cj.titulo)}</title><rect x="${x0}" y="${y + 6}" width="${Math.max(1, w - 1)}" height="18" rx="4" class="mes-caja"/>${cj.anadido || tipo === 'hebreos' ? `<rect x="${x0}" y="${y + 6}" width="${Math.max(1, w - 1)}" height="18" rx="4" fill="url(#p-hebreo)" pointer-events="none"/>` : ''}${numeros}${rotulo}</g>`);
    }
  });
}
/** Fiestas (B15) a escala de días: un tramo por fiesta, del día en que empieza al día en que acaba. Una fiesta dentro
    de otra (la ofrenda de las primicias, el 16 de nisán, dentro de los Panes Sin Levadura) va encima. El rótulo va
    dentro si cabe, si no a un lado, y si no queda sitio se lee al pasar por encima. */
function pintarFiestas(partes, y) {
  const fs = fiestasEn(E.vista[0], E.vista[1]).map((f) => ({ ...f, x0: xDe(f.a), x1: xDe(f.b) }))
    .sort((p, q) => (q.x1 - q.x0) - (p.x1 - p.x0) || p.x0 - q.x0);
  const puestos = [];
  for (const f of fs) {
    const w = f.x1 - f.x0;
    const dentro = fs.filter((o) => o !== f && o.x0 >= f.x0 && o.x1 <= f.x1);
    const titulo = `${f.nombre} · ${f.desde === (f.hasta ?? f.desde) ? `${f.desde}` : `del ${f.desde} al ${f.hasta}`} de ${BE.nombreMes(f.mes, f.anio).nombre.toLowerCase()} (fecha aproximada)`;
    partes.push(`<g class="fiesta"><title>${esc(titulo)}</title><rect x="${f.x0}" y="${y + 6}" width="${Math.max(3, w - 1)}" height="18" rx="5" class="fiesta-caja"/></g>`);
    f.titulo = titulo; f.dentro = dentro;
  }
  // Rótulos: primero las fiestas largas, en el hueco libre de su tramo (sin las que lleva dentro); después las cortas.
  const rot = [];
  const libre = (a, ancho) => !puestos.some(([c, d]) => a < d + 4 && a + ancho > c - 4);
  for (const f of fs) {
    const huecos = [];
    let x = Math.max(f.x0, 0) + 6;
    for (const o of [...f.dentro].sort((p, q) => p.x0 - q.x0)) { if (o.x0 > x) huecos.push([x, o.x0 - 4]); x = Math.max(x, o.x1 + 4); }
    huecos.push([x, Math.min(f.x1, anchoLinea) - 4]);
    // Fuera de su tramo no puede pisar otra fiesta, salvo la que la contiene.
    const fuera = (a, ancho) => a >= 0 && a + ancho <= anchoLinea && libre(a, ancho)
      && !fs.some((o) => o !== f && !f.dentro.includes(o) && !(o.x0 <= f.x0 && o.x1 >= f.x1) && a < o.x1 && a + ancho > o.x0);
    const opciones = [];
    for (const t of [f.nombre, f.corto]) for (const [a, b] of huecos) opciones.push([t, a, b - a >= anchoTexto(t), '']);
    for (const t of [f.nombre, f.corto]) for (const a of [f.x1 + 4, f.x0 - 4 - anchoTexto(t)]) opciones.push([t, a, true, ' fiesta-texto--fuera', true]);
    const op = opciones.find(([t, a, cabe, , esFuera]) => cabe && (esFuera ? fuera(a, anchoTexto(t)) : libre(a, anchoTexto(t))));
    if (!op) continue;
    const [t, a, , clase] = op;
    puestos.push([a, a + anchoTexto(t)]);
    rot.push(`<text x="${a}" y="${y + 19}" class="fiesta-texto${clase}">${esc(t)}</text>`);
  }
  partes.push(`<g class="fiesta-rotulos" aria-hidden="true">${rot.join('')}</g>`);
}

// ---------------------------------------------------------------------------
// Eje: años sin año cero (C-12), meses y días hebreos
// ---------------------------------------------------------------------------
const PASOS_ANIO = [1000, 500, 200, 100, 50, 20, 10, 5, 2, 1];
/** Posiciones t de los múltiplos de `paso` en años de calendario: los a.e.c. se cuentan hacia atrás (600 a.e.c. = −599),
    así las marcas caen en años redondos a los dos lados del cero y no aparece un «año 0». */
function multiplos(paso, a, b) {
  const out = [];
  if (b >= 1) for (let L = Math.max(1, Math.ceil(Math.max(a, 1) / paso)) * paso; L <= b; L += paso) out.push(L);
  if (a <= 0) {
    const Lmin = 1 - Math.min(b, 0), Lmax = 1 - a;
    for (let L = Math.ceil(Lmin / paso) * paso; L <= Lmax; L += paso) out.push(1 - L);
  }
  return out.sort((x, y) => x - y);
}
function marcasEje(pxAnio) {
  const out = [];
  const [a, b] = E.vista;
  // Un rótulo que pisaría al anterior («ene. 1513 a.e.c.» antes de «feb.») se queda sin texto; la marca sí se dibuja.
  let finRotulo = -Infinity;
  const mayorTick = (x, texto) => {
    const cabe = x + 5 >= finRotulo + 6;
    if (cabe) finRotulo = x + 5 + texto.length * 5.6;
    rejilla.push(x);
    out.push(`<line x1="${x}" x2="${x}" y1="0" y2="${EJE}" class="tick-mayor"/>${cabe ? `<text x="${x + 5}" y="16" class="tick-texto">${esc(texto)}</text>` : ''}`);
  };
  const menorTick = (x) => out.push(`<line x1="${x}" x2="${x}" y1="${EJE - 6}" y2="${EJE}" class="tick-menor"/>`);
  if (span() < 0.35 && BE.calendario().meses.length) {
    // Días: marca mayor el 1, 8, 15 y 22 de cada mes; menor, cada día. Los días del calendario que va primero: los
    // hebreos empiezan al ponerse el sol, los nuestros a medianoche.
    const marcar = (t, d, nombre) => {
      if (t < a - BE.DIA || t > b + BE.DIA) return;
      if ((d - 1) % 7 === 0 && d < 29) mayorTick(xDe(t), `${d} ${nombre}`);
      else if (pxAnio * BE.DIA >= 5) menorTick(xDe(t));
    };
    if (modoMeses() === 'nuestros') {
      for (let anio = Math.floor(a); anio <= Math.floor(b); anio++) {
        for (let m = 0; m < 12; m++) for (let d = 1; d <= DIAS_ANTES[m + 1] - DIAS_ANTES[m]; d++) marcar(inicioNuestro(anio, m) + (d - 1) * BE.DIA, d, MESES[m]);
      }
    } else {
      const cal = BE.calendario();
      for (let anio = Math.floor(a - cal.inicio) - 1; anio <= Math.ceil(b); anio++) {
        for (const M of BE.anioHebreo(anio).meses) {
          const nombre = BE.nombreMes(M.mes, anio).nombre.toLowerCase();
          for (let d = 1; M.a + (d - 1) * BE.DIA < M.b - BE.DIA / 2; d++) marcar(M.a + (d - 1) * BE.DIA, d, nombre);
        }
      }
    }
  } else if (pxAnio * 1 < 70) {
    // Años: la marca mayor es el paso más fino que deja 70 px entre etiquetas.
    const mayor = [...PASOS_ANIO].reverse().find((p) => p * pxAnio >= 70) || 1000;
    const menor = [mayor / 10, mayor / 5, mayor / 2].find((p) => p >= 1 && Number.isInteger(p) && p * pxAnio >= 6);
    const mayores = multiplos(mayor, a - mayor, b + mayor);
    if (menor) {
      const set = new Set(mayores);
      for (const t of multiplos(menor, a - menor, b + menor)) if (!set.has(t)) menorTick(xDe(t));
    }
    for (const t of mayores) mayorTick(xDe(t), fmtAnio(t));
    // El paso de a.e.c. a e.c. se marca con «1 e.c.» si hay sitio.
    if (mayor >= 10 && a < 1 && b > 1 && mayores.every((t) => Math.abs(xDe(t) - xDe(1)) > 64)) { finRotulo = -Infinity; mayorTick(xDe(1), '1 e.c.'); }
  } else {
    // Años con meses (v0): de 5 en 5 años hasta mes a mes.
    const pasos = [5, 2, 1, 0.5, 0.25, 1 / 12];
    let mayor = pasos.find((p, i) => (p * pxAnio < 70 ? false : (i === pasos.length - 1 || pasos[i + 1] * pxAnio < 70))) || 1 / 12;
    if (mayor * pxAnio < 70) mayor = pasos.find((p) => p * pxAnio >= 70) || 5;
    const menor = mayor >= 5 ? 1 : mayor >= 1 ? (pxAnio > 140 ? 1 / 12 : 0.25) : 1 / 12;
    const inicio = Math.floor(a / menor) * menor;
    for (let t = inicio; t <= b + menor; t += menor) {
      const tt = Math.round(t * 12) / 12;
      const yy = Math.floor(tt + 1e-9);
      const x = xDe(inicioNuestro(yy, Math.round((tt - yy) * 12)));   // el mes empieza donde empieza en la fila «Nuestros meses»
      const esMayor = Math.abs(tt / mayor - Math.round(tt / mayor)) < 1e-6;
      if (esMayor) {
        const y = Math.floor(tt + 1e-9), mes = Math.round((tt - y) * 12);
        mayorTick(x, mayor >= 1 ? fmtAnio(y) : (mes === 0 ? `${MESES[0]} ${fmtAnio(y)}` : MESES[mes]));
      } else menorTick(x);
    }
  }
  out.push(`<line x1="0" x2="${anchoLinea}" y1="${EJE}" y2="${EJE}" class="linea-eje"/>`);
  return out.join('');
}

// ---------------------------------------------------------------------------
// Densidad de hechos (T-05) y minimapa (T-04)
// ---------------------------------------------------------------------------
let cacheMomentos = null;
/** Momentos de todos los hechos con fecha: sucesos, paradas, cartas, inicios de periodo y relaciones fechadas. */
function momentosHechos() {
  if (cacheMomentos && cacheMomentos.D === BE.D) return cacheMomentos.ts;
  const ts = [];
  for (const e of BE.D.eventos || []) { const m = BE.momentoEvento(e); if (m != null) ts.push(m); }
  for (const s of BE.P) ts.push((s.a + s.b) / 2);
  for (const c of BE.D.cartas) { const m = BE.momentoCarta(c); if (m != null) ts.push(m); }
  for (const p of BE.D.periodos || []) { if (p.tipo === 'era' || p.tipo === 'potencia') continue; const tr = tramo(p.fecha); if (tr) ts.push(tr[0]); }
  for (const p of Object.values(BE.PERS)) for (const r of p.relaciones || []) { const tr = r.fecha && tramo(r.fecha); if (tr) ts.push(tr[0]); }
  ts.sort((x, y) => x - y);
  cacheMomentos = { D: BE.D, ts };
  return ts;
}
function contarEntre(ts, a, b) {
  const idx = (v) => { let lo = 0, hi = ts.length; while (lo < hi) { const m = (lo + hi) >> 1; if (ts[m] < v) lo = m + 1; else hi = m; } return lo; };
  return idx(b) - idx(a);
}
function densidad() {
  const ts = momentosHechos();
  if (!ts.length) return '';
  const n = Math.max(20, Math.floor(anchoLinea / 6));
  const w = span() / n;
  const cuentas = [];
  for (let i = 0; i < n; i++) cuentas.push(contarEntre(ts, E.vista[0] + i * w, E.vista[0] + (i + 1) * w));
  const max = Math.max(...cuentas);
  if (!max) return '';
  const bw = anchoLinea / n;
  const d = cuentas.map((c, i) => (c ? `M${(i * bw + 0.5).toFixed(1)} ${EJE}v-${(1.5 + 6 * Math.sqrt(c / max)).toFixed(1)}h${(bw - 1).toFixed(1)}v${(1.5 + 6 * Math.sqrt(c / max)).toFixed(1)}z` : '')).join('');
  return `<path d="${d}" class="densidad"><title>Densidad: cuántos hechos con fecha tenemos en cada tramo (${contarEntre(ts, E.vista[0], E.vista[1])} a la vista)</title></path>`;
}
function fondoMinimapa() {
  const tramos = periodosDe('era').length ? periodosDe('era') : periodosDe('potencia');
  const total = spanMax();
  if (!tramos.length) return '';
  const pct = (t) => `${(((t - BE.T_MIN) / total) * 100).toFixed(2)}%`;
  const stops = [];
  [...tramos].sort((a, b) => BE.tramoPeriodo(a)[0] - BE.tramoPeriodo(b)[0]).forEach((p, i) => {
    const tr = BE.tramoPeriodo(p);
    const col = p.tipo === 'potencia' ? colorPotencia(p) : (i % 2 ? 'var(--node-periodo)' : '#9a8ab4');
    stops.push(`${col} ${pct(tr[0])} ${pct(tr[1])}`);
  });
  return `linear-gradient(90deg, var(--paper-2) 0 ${pct(Math.min(...tramos.map((p) => BE.tramoPeriodo(p)[0])))}, ${stops.join(', ')}, var(--paper-2) ${pct(Math.max(...tramos.map((p) => BE.tramoPeriodo(p)[1])))} 100%)`;
}
function pintarMinimapa() {
  const mm = $('#minimapa');
  if (!mm) return;
  if (!mm.dataset.fondo) { mm.dataset.fondo = '1'; const f = fondoMinimapa(); if (f) mm.style.background = f; }
  const total = spanMax();
  const win = mm.querySelector('.be-minimap__win');
  const l = ((E.vista[0] - BE.T_MIN) / total) * 100, w = (span() / total) * 100;
  win.style.left = `${clamp(l, 0, 100)}%`;
  win.style.width = `max(4px, ${Math.min(w, 100 - clamp(l, 0, 100))}%)`;
}
function cursorMinimapa() {
  const c = $('#minimapa .minimapa-cursor');
  if (c) c.style.left = `${((E.t - BE.T_MIN) / spanMax()) * 100}%`;
}

// ---------------------------------------------------------------------------
// Regla (T-15), bucle (T-12) y marcadores (T-14)
// ---------------------------------------------------------------------------
/** Duración legible de d años, en la unidad que tenga sentido. La resta en años astronómicos ya no cuenta el año cero. */
function duracion(d) {
  d = Math.abs(d);
  const dias = Math.round(d / BE.DIA);
  if (dias < 1) return 'menos de un día';
  if (dias < 60) return `${dias} ${dias === 1 ? 'día' : 'días'}`;
  const meses = Math.round(d * 12);
  if (meses < 24) return `${meses} meses`;
  const anios = Math.round(d);
  return `${Math.abs(d - anios) < 0.05 ? '' : 'unos '}${anios} años`;
}
/** Redondea una fecha al año, al mes o al día según la escala. */
function ajustar(t) {
  const s = span();
  if (s > 20) return Math.round(t);
  if (s > 1.5) return Math.round(t * 12) / 12;
  return Math.round(t / BE.DIA) * BE.DIA;
}
const textoFecha = (t) => { const s = span(); return s > 20 ? fmtAnio(Math.round(t)) : fmtMes(t + 1e-6, true); };
/** Lo medido con la regla, si cae en la vista: [a, b]. */
function reglaVista() {
  if (!L.regla) return null;
  const [a, b] = [Math.min(...L.regla), Math.max(...L.regla)];
  return b < E.vista[0] || a > E.vista[1] ? null : [a, b];
}
/** La banda de lo medido, detrás de las marcas y de arriba abajo de los carriles. */
function reglaEnFondo(h) {
  const r = reglaVista();
  if (!r) return '';
  const x0 = xDe(r[0]), x1 = xDe(r[1]);
  return `<g class="regla"><rect x="${x0}" y="0" width="${Math.max(1, x1 - x0)}" height="${h}" class="regla-banda"/>
    <line x1="${x0}" x2="${x0}" y1="0" y2="${h}" class="regla-borde"/><line x1="${x1}" x2="${x1}" y1="0" y2="${h}" class="regla-borde"/></g>`;
}
/** Lo que mide, en la regla de arriba, con su botón para quitarla. */
function reglaEnRegla() {
  const r = reglaVista();
  if (!r) return '';
  const x0 = xDe(r[0]), x1 = xDe(r[1]);
  const texto = `${textoFecha(r[0])} → ${textoFecha(r[1])}: ${duracion(r[1] - r[0])}`;
  const w = anchoTexto(texto) + 30;
  const lx = clamp((x0 + x1) / 2 - w / 2, 2, anchoLinea - w - 2);
  return `<g class="regla"><rect x="${lx}" y="3" width="${w}" height="20" rx="10" class="regla-etiqueta"/><text x="${lx + 10}" y="17" class="regla-texto">${esc(texto)}</text>
    <g class="regla-quitar" data-linea="quitar-regla" role="button" tabindex="0" aria-label="Quitar la regla"><title>Quitar la regla</title><circle cx="${lx + w - 11}" cy="13" r="7"/><path d="M${lx + w - 14} 10l6 6m0-6-6 6"/></g></g>`;
}
const bordesBucle = () => (L.bucle ? [[L.bucle[0], 1], [L.bucle[1], -1]].filter(([t]) => t >= E.vista[0] && t <= E.vista[1]) : []);
function bucleEnRegla() {
  return bordesBucle().map(([t, lado]) => { const x = xDe(t); return `<path d="M${x + lado * 6} ${EJE - 8}h${-lado * 6}v8" class="bucle-marca"><title>Bucle de ${esc(textoFecha(L.bucle[0]))} a ${esc(textoFecha(L.bucle[1]))}</title></path>`; }).join('');
}
function bucleEnFondo(h) {
  return bordesBucle().map(([t]) => { const x = xDe(t); return `<line x1="${x}" x2="${x}" y1="0" y2="${h}" class="bucle-marca"/>`; }).join('');
}
/** El tramo de lo elegido, como una raya al pie de la regla: se ve aunque su carril quede más abajo. */
function selEnRegla() {
  const selT = BE.selTexto(E.sel);
  if (!selT) return '';
  const out = [];
  for (const c of carrilesVista) {
    if (c.tipo === 'meses') continue;
    for (const it of marcasDe(c).items) {
      if (it.sel !== selT) continue;
      const a = xDe(it.shape === 'moment' ? it.w0 : it.start), b = xDe(it.shape === 'moment' ? it.w1 : it.end);
      const x0 = clamp(a, -4, anchoLinea + 4), x1 = clamp(Math.max(b, a + 3), -4, anchoLinea + 4);
      if (x1 > 0 && x0 < anchoLinea) out.push(`<rect x="${x0}" y="${EJE - 4}" width="${Math.max(3, x1 - x0)}" height="4" rx="2" class="sel-regla"/>`);
    }
  }
  return out.join('');
}
const CLAVE_MARCAS = 'biblical-atlas:marcadores';
function marcadores() { try { return JSON.parse(localStorage.getItem(CLAVE_MARCAS) || '[]'); } catch { return []; } }
function guardarMarcadores(ms) { try { localStorage.setItem(CLAVE_MARCAS, JSON.stringify(ms)); } catch { BE.avisar('Este navegador no deja guardar marcadores.'); } }
function nuevoMarcador() {
  const ms = marcadores();
  const nombre = `${fmtMes(E.t, span() < 4)}${E.sel ? ` · ${BE.nombreSel(E.sel)}` : ''}`;
  ms.push({ t: +E.t.toFixed(4), sel: E.sel ? BE.selTexto(E.sel) : null, nombre });
  guardarMarcadores(ms);
  BE.avisar(`Marcador guardado: ${nombre}`);
  sucio.linea = true; programar();
}
function irAMarcador(i) {
  const m = marcadores()[i];
  if (!m) return;
  const sel = m.sel ? BE.parseSel(m.sel) : null;
  if (sel && BE.selTexto(sel) !== BE.selTexto(E.sel)) BE.seleccionar(sel, { mover: false });
  setT(m.t); BE.asegurarVisible(m.t, true);
}
function pintarMarcadores() {
  return marcadores().map((m, i) => {
    if (m.t < E.vista[0] || m.t > E.vista[1]) return '';
    const x = xDe(m.t);
    return `<path d="M${x - 5} 0h10l-5 7z" class="marcador" data-marcador="${i}" role="button" tabindex="0" aria-label="Marcador: ${esc(m.nombre)}"><title>Marcador: ${esc(m.nombre)}</title></path>`;
  }).join('');
}

// ---------------------------------------------------------------------------
// Cursor y frase de contexto
// ---------------------------------------------------------------------------
const estrecha = () => matchMedia('(max-width: 760px)').matches;
const CURSIVA_CHIP = 'En cursiva: nombre de después del exilio; la Biblia de esa época no llama así a ese mes.';
/** La fecha del cursor en los dos calendarios, según la escala y el selector «Meses». `primera` es la que manda (con su
    año); `segunda`, la otra, sin año: en hebreo la equivalencia de la tabla B15 («marzo-abril»), en nuestro calendario
    el día o el mes hebreo. A escala de años o más, solo el año. `anacronico`: el nombre hebreo no es de esa época. */
function fechaCursor(t, corto = false) {
  const s = span();
  if (!(s < 4) || !BE.calendario().meses.length) return { primera: fmtMes(t, s < 4), segunda: '' };
  const dias = s < 0.35, y = Math.floor(t);
  const h = BE.diaHebreo(t), n = mesNuestro(t);
  const mesH = h.nombre.toLowerCase();   // sin abreviar: «abi.» o «kis.» no los reconoce nadie, y el más largo tiene seis letras
  const mesN = corto ? MESES[n.m] : MESES_LARGOS[n.m];
  const de = corto ? ' ' : ' de ';
  const hebreo = dias ? `${h.dia}${de}${mesH}` : mesH;
  const hebreoEntero = dias ? `${h.dia} de ${h.nombre.toLowerCase()}` : h.nombre.toLowerCase();
  const nuestro = dias ? `${n.dia}${de}${mesN}` : mesN;
  if (modoMeses() === 'nuestros') return { primera: `${nuestro}${de}${fmtAnio(y)}`, segunda: hebreoEntero, anacronico: false, anacronicoSegunda: h.anacronico };
  const eq = typeof h.mes.equivale === 'string' ? h.mes.equivale : nuestro;
  return { primera: `${hebreo}${de}${fmtAnio(y)}`, segunda: eq, anacronico: h.anacronico };
}
function textoCursor(t, fino, corto = false) {
  const f = fechaCursor(t, corto);
  return f.primera;
}
function pintarCursor() {
  const g = $('#linea-cursor');
  if (!g) return;
  const x = xDe(E.t);
  // La bandera dice de quién es el lugar: la persona elegida o, si no, Pablo. Sale de BE.donde, como «Ahora mismo».
  const quien = E.sel?.tipo === 'persona' && BE.PERS[E.sel.id] ? E.sel.id : 'pablo';
  const w = BE.donde(quien, E.t);
  const fino = span() < 4;
  // «Juan, el apóstol en Patmos» se lee mal: la aclaración va entre paréntesis.
  const nombre = (BE.PERS[quien]?.nombre || 'Pablo').replace(/^([^,]+), (.+)$/, '$1 ($2)');
  const lugar = w ? `${nombre} ${w.parada ? 'en' : 'hacia'} ${(w.parada ? w.en : w.sig).lugar.nombre}` : '';
  const aprox = w?.estimada || !fino || span() < 4;   // una fecha de mes o de día sale de un calendario aproximado
  const bandera = `${aprox ? 'c. ' : ''}${textoCursor(E.t, fino, estrecha())}${lugar ? ` · ${lugar}` : ''}`;
  const anchoB = anchoTexto(bandera, 10.5) + 14;
  const bx = clamp(x - anchoB / 2, 0, anchoLinea - anchoB);
  let banda = '';
  if (w?.estimada && w.banda) {
    const b0 = xDe(w.banda[0]), b1 = xDe(w.banda[1]);
    banda = `<rect x="${b0}" y="0" width="${Math.max(0, b1 - b0)}" height="${Math.max(1, altoFilas)}" fill="url(#p-rayas)" class="banda-incierta"><title>Tiempo narrativo: sabemos el orden, no la fecha exacta</title></rect>`;
  }
  // En el fondo, la línea del cursor de arriba abajo de los carriles (detrás de las marcas); en la regla, su bandera.
  const gf = $('#fondo-cursor');
  if (gf) gf.innerHTML = `${banda}<line x1="${x}" x2="${x}" y1="0" y2="${Math.max(1, altoFilas)}" class="cursor-linea"/>`;
  g.innerHTML = `<line x1="${x}" x2="${x}" y1="0" y2="${cabAlto}" class="cursor-linea"/>
    <rect x="${bx}" y="3" width="${anchoB}" height="20" rx="5" class="cursor-bandera"/><text x="${bx + anchoB / 2}" y="17" text-anchor="middle" class="cursor-texto${tonos('var(--gold)').texto}">${esc(bandera)}</text>`;
  const pista = $('#pista');
  pista.setAttribute('aria-valuenow', E.t.toFixed(2));
  pista.setAttribute('aria-valuetext', bandera);
  const pw = BE.dondeEsta(E.t);
  const fc = fechaCursor(E.t, estrecha());
  const c = pw?.estimada || !fino || span() < 4 ? 'c. ' : '';
  const valor = `${c}${fc.anacronico ? `<i>${esc(fc.primera)}</i>` : esc(fc.primera)}`;
  if ($('#fecha-valor').innerHTML !== valor) $('#fecha-valor').innerHTML = valor;
  const otra = $('#fecha-otra');
  if (otra) {
    const txt = fc.segunda || '';
    if (otra.textContent !== txt) otra.textContent = txt;
    otra.hidden = !txt;
    otra.classList.toggle('anacronico', !!fc.anacronicoSegunda);
    otra.title = !txt ? '' : modoMeses() === 'nuestros' ? `Fecha hebrea aproximada.${fc.anacronicoSegunda ? ` ${CURSIVA_CHIP}` : ''}` : 'Nuestros meses, aproximados: el calendario gregoriano es de 1582 y aquí solo orienta';
  }
  // La cronología va en el texto emergente de la fecha, no en una pista visible: es jerga para quien lee.
  const ayuda = `${pw?.estimada || BE.relatoEn?.(E.t) ? 'Fecha estimada: sabemos el orden del relato, no el día. ' : ''}${fc.anacronico ? `${CURSIVA_CHIP} ` : ''}Fechas según la cronología de la Traducción del Nuevo Mundo. Pulsa para ir a otra fecha.`;
  if ($('#fecha-valor').title !== ayuda) $('#fecha-valor').title = ayuda;
  $('#linea-estado').textContent = BE.fraseAhora ? BE.fraseAhora(E.t) : '';
  // Edad en la fecha, solo con base (T-18).
  document.querySelectorAll('#linea-filas [data-edad]').forEach((el) => {
    const e = BE.edad(el.dataset.edad, E.t);
    const txt = e ? ` · ${e.texto}` : '';
    if (el.textContent !== txt) { el.textContent = txt; el.title = e ? `Según su nacimiento: ${e.nacimiento}` : ''; }
  });
  cursorMinimapa();
}

// ---------------------------------------------------------------------------
// Ir a una fecha (el panel de la fecha, datepicker.js, llama a BE.irA)
// ---------------------------------------------------------------------------
/** Lleva el cursor a t y, si la escala es muy lejana, acerca a décadas (o a días si la fecha es de un día). */
function irA(t, escala) {
  setT(t);
  const s = escala || (span() > 60 ? 40 : span());
  const v0 = clamp(t - s * 0.4, BE.T_MIN, BE.T_MAX - s);
  E.vista = [v0, v0 + s];
  sucio.linea = true; programar();
}

// ---------------------------------------------------------------------------
// Zoom, menú de la línea y carriles
// ---------------------------------------------------------------------------
function zoomEn(factor, tAncla) {
  const s = clamp(span() * factor, SPAN_MIN, spanMax());
  const f = (tAncla - E.vista[0]) / span();
  let v0 = tAncla - f * s;
  v0 = clamp(v0, BE.T_MIN, BE.T_MAX - s);
  E.vista = [v0, v0 + s];
  sucio.linea = true; programar();
}
/** Encuadra [a, b] con un margen: el tramo ocupa la fracción `ocupa` de la vista, centrado. */
function encuadrarTiempo(a, b, ocupa = 1 / 1.08) {
  const s = clamp((b - a) / ocupa, SPAN_MIN, spanMax());
  const v0 = clamp((a + b) / 2 - s / 2, BE.T_MIN, BE.T_MAX - s);
  E.vista = [v0, v0 + s];
  sucio.linea = true; programar();
}
/** La línea abre alta en la pantalla ancha de 1000 px de alto o más; en una más baja abre normal. A 1440 × 900 la línea
    alta dejaba al mapa 282 px, casi todos bajo la leyenda y «Mientras tanto»: un recorrido abierto desde la portada no
    enseñaba mapa. */
const altaDeInicio = () => !estrecha() && innerHeight >= 1000;
/** Con el grafo o la conexión encima del mapa, la línea alta de inicio les deja su sitio (linea.css); pedida con la T,
    el botón o el menú, se ve alta también con ellos. */
const grafoEncima = () => !!document.querySelector('.mapa > :is(.vista-grafo, .vista-conexion):not([hidden])');
const grandeVista = () => L.grande && (L.pedida || !grafoEncima());
function ponerGrande(on, pedida = false) {
  L.grande = on;
  L.pedida = on && pedida;
  $('#app').classList.toggle('linea-grande', on);
  $('#app').classList.toggle('linea-pedida', L.pedida);
  const b = $('[data-linea="grande"]');
  if (b) b.setAttribute('aria-pressed', String(grandeVista()));
  BE.guardarHash();
}
/** La tecla T, el botón de alto y el menú cambian lo que se ve: alta si se ve normal, normal si se ve alta. */
const alternarGrande = () => ponerGrande(!grandeVista(), true);
function fijar(id) {
  const i = L.fijados.indexOf(id);
  if (i >= 0) L.fijados.splice(i, 1); else L.fijados.push(id);
  sucio.linea = true; programar(); BE.guardarHash();
  if (menuAbierto()) abrirMenu(menuAbierto());
}
function rangoSeleccion() {
  if (!E.sel) return null;
  const r = BE.implicados(E.sel);
  const ts = [];
  for (const k of r.claves) {
    const i = k.indexOf(':'), tipo = k.slice(0, i), id = k.slice(i + 1);
    if (tipo === 'parada') { const s = BE.P.find((x) => x.key === id); if (s) ts.push(s.a, s.b); }
    else if (tipo === 'evento') { const e = BE.D.eventos.find((x) => x.id === id); const v = e && BE.ventanaEvento(e); if (v) ts.push(...v); }
    else if (tipo === 'carta') { const c = BE.D.cartas.find((x) => x.id === id); const v = c && BE.ventanaCarta(c); if (v) ts.push(...v); }
    else if (tipo === 'periodo') { const p = BE.D.periodos.find((x) => x.id === id); const v = p && BE.tramoPeriodo(p); if (v) ts.push(...v); }
  }
  return ts.length ? [Math.min(...ts), Math.max(...ts)] : null;
}
function ponerBucle() {
  if (L.bucle) { L.bucle = null; BE.avisar('Bucle quitado.'); }
  else {
    const r = L.regla ? [Math.min(...L.regla), Math.max(...L.regla)] : (rangoSeleccion() || [...E.vista]);
    L.bucle = r;
    if (E.t < r[0] || E.t > r[1]) setT(r[0]);
    BE.avisar(`Bucle de ${textoFecha(r[0])} a ${textoFecha(r[1])}. Pulsa reproducir.`);
  }
  sucio.linea = true; programar(); BE.guardarHash();
}
let menuEl = null;
const menuAbierto = () => (menuEl && !menuEl.hidden ? menuEl.dataset.seccion || 'todo' : null);
let menuOrigen = null;   // botón que abrió el menú: al cerrar, el foco vuelve a él si estaba dentro del menú
function cerrarMenu() {
  if (!menuEl || menuEl.hidden) return;
  const dentro = menuEl.contains(document.activeElement);
  menuEl.hidden = true;
  $('#linea-menu-boton')?.setAttribute('aria-expanded', 'false');
  $('.carriles-boton')?.setAttribute('aria-expanded', 'false');
  if (dentro) menuOrigen?.focus();
}
function abrirMenu(seccion = 'todo') {
  const yaAbierto = !!menuEl && !menuEl.hidden;
  const foco = yaAbierto && menuEl.contains(document.activeElement) ? document.activeElement : null;
  const claveFoco = foco && ['data-fijar', 'data-linea', 'data-ir-marcador', 'data-meses', 'data-vel'].map((a) => foco.hasAttribute(a) ? `[${a}="${CSS.escape(foco.getAttribute(a))}"]` : '').find(Boolean);
  if (!menuEl) {
    menuEl = document.createElement('div');
    menuEl.className = 'linea-menu be-card';
    menuEl.id = 'linea-menu';
    menuEl.setAttribute('role', 'dialog');
    menuEl.setAttribute('aria-label', 'Opciones de la línea de tiempo');
    document.body.appendChild(menuEl);
    menuEl.addEventListener('click', clicMenu);
  }
  menuEl.dataset.seccion = seccion;
  const ms = marcadores();
  const sinc = BE.sincronia?.abierta?.();
  const casilla = (id, on, texto) => `<label class="menu-fila"><input type="checkbox" data-linea="${id}"${on ? ' checked' : ''}> ${texto}</label>`;
  const boton = (id, texto, extra = '') => `<button type="button" class="menu-fila menu-boton" data-linea="${id}"${extra}>${texto}</button>`;
  const lanes = catalogo().filter((c) => c.tipo !== 'pablo' || BE.P.length);
  const personas = personasConCarril().filter((p) => !L.fijados.includes(p.id) && p.id !== 'pablo');
  menuEl.innerHTML = `
    ${seccion === 'todo' ? `<div class="be-card__eyebrow">Línea de tiempo</div>
    ${boton('grande', `${grandeVista() ? 'Reducir' : 'Ampliar'} la línea <kbd class="be-kbd">T</kbd>`)}
    ${BE.sincronia ? boton('sincronia', sinc ? 'Cerrar la sincronía' : '¿Quién había en un lugar? (sincronía)') : ''}
    <div class="menu-sub">Velocidad al reproducir</div>
    <div class="velocidad menu-velocidad${L.vel != null ? ' manual' : ''}" role="group" aria-label="Velocidad de reproducción">${botonesVelocidad()}</div>
    ${casilla('vel-auto', L.vel == null, 'Según la escala de la línea')}
    ${casilla('pausa', L.pausa, 'Pausar un momento en cada suceso al reproducir')}
    ${casilla('secular', L.secular, 'Fechas seculares como nota')}
    ${boton('regla', L.regla ? 'Quitar la regla' : 'Medir entre dos fechas (regla) <kbd class="be-kbd">Alt</kbd>+arrastrar')}
    ${boton('bucle', L.bucle ? 'Quitar el bucle' : `Repetir en bucle ${L.regla ? 'lo medido' : (E.sel ? 'lo seleccionado' : 'el tramo a la vista')}`)}
    ${boton('marcar', 'Guardar esta fecha como marcador')}
    ${boton('fechas', 'Sobre las fechas: de dónde salen y qué quiere decir cada marca')}
    ${ms.length ? `<div class="menu-sub">Marcadores</div>${ms.map((m, i) => `<div class="menu-marcador"><button type="button" class="enlace-titulo" data-ir-marcador="${i}">${esc(m.nombre)}</button><button type="button" class="menu-x" data-borrar-marcador="${i}" aria-label="Borrar el marcador ${esc(m.nombre)}">×</button></div>`).join('')}` : ''}` : ''}
    ${BE.calendario().meses.length ? `<div class="be-card__eyebrow">Meses</div>
    <div class="menu-meses"><div class="be-seg meses-seg" role="radiogroup" aria-label="Meses">${MODOS_MESES.map(([k, t]) => `<button type="button" class="be-seg__opt${modoMeses() === k ? ' be-seg__opt--on' : ''}" role="radio" aria-checked="${modoMeses() === k}" data-meses="${k}">${t}</button>`).join('')}</div>${enlaceCalendario('meses-que', '¿Qué meses son estos?', 'Qué meses son estos: el calendario de la Biblia, explicado')}</div>` : ''}
    <div class="be-card__eyebrow">Carriles</div>
    <p class="menu-ayuda">Los fijados van arriba y no se van al cambiar de escala. Los demás salen cuando tienen algo a la vista.</p>
    ${lanes.map((c) => { const on = L.fijados.includes(c.id); return `<button type="button" class="menu-fila menu-carril${on ? ' on' : ''}" data-fijar="${esc(c.id)}" aria-pressed="${on}">${ICONOS.alfiler}<span>${esc(c.nombre)}</span>${carrilesVista.includes(c) && c.alto ? '<small>a la vista</small>' : ''}</button>`; }).join('')}
    ${L.fijados.filter((id) => BE.PERS[id] && id !== 'pablo').map((id) => `<button type="button" class="menu-fila menu-carril on" data-fijar="${esc(id)}" aria-pressed="true">${ICONOS.alfiler}<span>${esc(BE.PERS[id].nombre)}</span></button>`).join('')}
    ${personas.length ? `<label class="menu-fila menu-persona"><span>Añadir persona</span><select data-linea="persona"><option value="">Elige…</option>${personas.map((p) => `<option value="${esc(p.id)}">${esc(p.nombre)}</option>`).join('')}</select></label>` : ''}`;
  menuEl.hidden = false;
  const b = (seccion === 'carriles' ? $('.carriles-boton') : $('#linea-menu-boton')) || $('#linea-menu-boton');
  const r = b.getBoundingClientRect();
  const w = Math.min(320, window.innerWidth - 16);
  menuEl.style.width = `${w}px`;
  menuEl.style.left = `${clamp(seccion === 'carriles' ? r.left : r.right - w, 8, window.innerWidth - w - 8)}px`;
  menuEl.style.bottom = `${window.innerHeight - r.top + 8}px`;
  menuEl.style.maxHeight = `${Math.max(160, r.top - 16)}px`;
  $('#linea-menu-boton')?.setAttribute('aria-expanded', 'true');   // el diálogo es el suyo, lo abra quien lo abra
  $('.carriles-boton')?.setAttribute('aria-expanded', String(seccion === 'carriles'));
  // Es un diálogo: al abrirlo, el foco entra en su primer control (al repintarlo abierto no se mueve).
  if (!yaAbierto) { menuOrigen = b; menuEl.querySelector('button, input, select')?.focus(); }
  else if (foco && !menuEl.contains(document.activeElement)) (menuEl.querySelector(claveFoco || 'button, input, select') || menuEl.querySelector('button, input, select'))?.focus();
}
function clicMenu(e) {
  const f = e.target.closest('[data-fijar]');
  if (f) { fijar(f.dataset.fijar); return; }
  const mm = e.target.closest('[data-meses]');
  if (mm) { ponerMeses(mm.dataset.meses); abrirMenu(menuAbierto()); return; }
  const v = e.target.closest('[data-vel]');
  if (v) { cambiarVelocidad(+v.dataset.vel); abrirMenu(menuAbierto()); return; }
  const ir = e.target.closest('[data-ir-marcador]');
  if (ir) { cerrarMenu(); irAMarcador(+ir.dataset.irMarcador); return; }
  const borrar = e.target.closest('[data-borrar-marcador]');
  if (borrar) { const ms = marcadores(); ms.splice(+borrar.dataset.borrarMarcador, 1); guardarMarcadores(ms); sucio.linea = true; programar(); abrirMenu(menuAbierto()); return; }
  const b = e.target.closest('[data-linea]');
  if (!b || b.tagName === 'SELECT') return;
  const que = b.dataset.linea;
  if (que === 'pausa') { L.pausa = b.checked; BE.guardarHash(); return; }
  if (que === 'vel-auto') { L.vel = b.checked ? null : VELOCIDADES.indexOf(velocidadAuto()); pintarVelocidad(); BE.guardarHash(); abrirMenu(menuAbierto()); return; }
  if (que === 'secular') { ponerSecular(b.checked); return; }
  cerrarMenu();
  if (que === 'grande') alternarGrande();
  else if (que === 'sincronia') BE.sincronia.alternar();
  else if (que === 'regla') { if (L.regla) { L.regla = null; sucio.linea = true; programar(); BE.guardarHash(); } else { L.modoRegla = true; $('#pista').classList.add('modo-regla'); BE.avisar('Arrastra sobre la línea entre las dos fechas.'); } }
  else if (que === 'bucle') ponerBucle();
  else if (que === 'marcar') nuevoMarcador();
  else if (que === 'fechas') abrirAyudaFechas($('#linea-menu-boton'));
}
function ponerSecular(on) {
  L.secular = on; cacheCat = null;
  sucio.linea = sucio.panel = true; BE.pintarPanel(true); programar(); BE.guardarHash();
}

// ---------------------------------------------------------------------------
// «Sobre las fechas» (be-64b.6): de dónde salen las fechas y qué quiere decir cada marca, con una muestra de cada una.
// ---------------------------------------------------------------------------
let ayudaFechas = null, origenAyuda = null;
const muestra = (cuerpo) => `<svg class="fa-muestra" viewBox="0 0 34 14" width="34" height="14" aria-hidden="true">${cuerpo}</svg>`;
function abrirAyudaFechas(origen) {
  if (!ayudaFechas) {
    ayudaFechas = document.createElement('div');
    ayudaFechas.id = 'fechas-ayuda';
    ayudaFechas.className = 'fechas-ayuda be-card';
    ayudaFechas.setAttribute('role', 'dialog');
    ayudaFechas.setAttribute('aria-labelledby', 'fechas-ayuda-titulo');
    document.body.appendChild(ayudaFechas);
    ayudaFechas.addEventListener('change', (e) => { if (e.target.matches('[data-fa="secular"]')) ponerSecular(e.target.checked); });
    ayudaFechas.addEventListener('click', (e) => { if (e.target.closest('[data-fa="cerrar"]')) cerrarAyudaFechas(); });
    ayudaFechas.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); cerrarAyudaFechas(); return; }
      if (e.key === 'Tab') {   // el foco se queda dentro mientras está abierta
        const fs = [...ayudaFechas.querySelectorAll('a, button, input')], i = fs.indexOf(document.activeElement);
        e.preventDefault(); fs[(i + (e.shiftKey ? -1 : 1) + fs.length) % fs.length].focus();
      }
      if (e.key !== 'Tab') e.stopPropagation();   // las flechas y el espacio no mueven el cursor detrás
    });
  }
  ayudaFechas.innerHTML = `<div class="fa-cabecera"><h2 class="be-card__eyebrow" id="fechas-ayuda-titulo">Sobre las fechas</h2><button type="button" class="menu-x" data-fa="cerrar" aria-label="Cerrar">×</button></div>
    <p class="fa-texto">Las fechas siguen la cronología de la Traducción del Nuevo Mundo.</p>
    <ul class="fa-lista">
      <li><span class="fa-c">c.</span><span>Junto a la fecha de arriba: fecha aproximada. La fuente da el año más o menos, la sacamos del orden del relato, o es un mes o un día de un calendario que solo podemos aproximar.</span></li>
      <li>${muestra('<rect x="3" y="6" width="28" height="2" fill="var(--gold)" opacity=".75"/><rect x="2" y="3" width="2" height="8" fill="var(--gold)"/><rect x="30" y="3" width="2" height="8" fill="var(--gold)"/><circle cx="17" cy="7" r="4.5" fill="var(--gold)"/>')}<span>Un punto es algo que pasó en un momento. La línea fina de debajo marca entre qué fechas pudo ser.</span></li>
      <li>${muestra('<rect x="1" y="2" width="32" height="10" rx="3" fill="var(--emp-persia)"/>')}<span>Una barra es algo que duró, de su principio a su fin.</span></li>
      <li>${muestra('<defs><linearGradient id="fa-dif"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".3" stop-color="#fff"/><stop offset=".7" stop-color="#fff"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient><mask id="fa-m"><rect width="34" height="14" fill="url(#fa-dif)"/></mask></defs><rect x="1" y="2" width="32" height="10" rx="3" fill="var(--emp-persia)" mask="url(#fa-m)"/>')}<span>Con los extremos que se desvanecen y la palabra «aprox.»: fecha aproximada.</span></li>
      <li>${muestra('<rect x="1.75" y="2.75" width="30.5" height="8.5" rx="3" fill="var(--surface)" stroke="var(--emp-persia)" stroke-width="1.5"/>')}<span>Hueca: la fecha la calculamos nosotros o sale del orden del relato. La ficha explica la cuenta.</span></li>
      <li>${muestra('<defs><linearGradient id="fa-dud"><stop offset="0" stop-color="#fff"/><stop offset=".45" stop-color="#fff"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient><mask id="fa-md"><rect width="34" height="14" fill="url(#fa-dud)"/></mask></defs><rect x="1" y="2" width="32" height="10" rx="3" fill="var(--emp-persia)" mask="url(#fa-md)"/>')}<span>Desvanecida y con «¿?»: fecha dudosa, o de la que no sabemos cuándo empezó o acabó.</span></li>
      <li>${muestra('<rect x="1.5" y="2.5" width="31" height="9" rx="3" fill="var(--secular-soft)" stroke="var(--secular)" stroke-width="1.2" stroke-dasharray="4 3"/>')}<span>Borde de trazos gris azulado: fecha de la historia secular cuando difiere. Va solo como nota y no mueve el cursor.</span></li>
    </ul>
    <label class="menu-fila fa-casilla"><input type="checkbox" data-fa="secular"${L.secular ? ' checked' : ''}> Enseñar las fechas seculares como nota</label>
    <a class="fa-mas" href="acerca.html#datos">Cómo tratamos las fuentes y las fechas</a>`;
  ayudaFechas.hidden = false;
  const r = (origen && document.contains(origen) && origen.offsetParent ? origen : $('#linea-menu-boton')).getBoundingClientRect();
  const w = Math.min(340, window.innerWidth - 16);
  ayudaFechas.style.width = `${w}px`;
  ayudaFechas.style.left = `${clamp(r.right - w, 8, window.innerWidth - w - 8)}px`;
  ayudaFechas.style.bottom = `${window.innerHeight - r.top + 8}px`;
  ayudaFechas.style.maxHeight = `${Math.max(160, r.top - 16)}px`;
  origenAyuda = origen;
  $('#fechas-boton')?.setAttribute('aria-expanded', 'true');
  ayudaFechas.querySelector('input').focus();
}
function cerrarAyudaFechas() {
  if (!ayudaFechas || ayudaFechas.hidden) return;
  const dentro = ayudaFechas.contains(document.activeElement);
  ayudaFechas.hidden = true;
  $('#fechas-boton')?.setAttribute('aria-expanded', 'false');
  if (dentro) ((origenAyuda && origenAyuda.offsetParent && origenAyuda) || $('#linea-menu-boton'))?.focus();
}

// Velocidad (be-64b.2): cuánto tiempo pasa en cada segundo de reproducción, dicho con palabras. Sin elegir, sigue a la
// escala (la línea entera en unos 160 s, redondeado al escalón más cercano); con − y +, queda fija aunque cambie la escala.
const DIA1 = 1 / 365.2425, HORA1 = DIA1 / 24;
const VELOCIDADES = [
  [HORA1, '1 hora'], [3 * HORA1, '3 horas'], [6 * HORA1, '6 horas'], [12 * HORA1, '12 horas'],
  [DIA1, '1 día'], [2 * DIA1, '2 días'], [3 * DIA1, '3 días'], [7 * DIA1, '1 semana'], [14 * DIA1, '2 semanas'],
  [1 / 12, '1 mes'], [2 / 12, '2 meses'], [3 / 12, '3 meses'], [6 / 12, '6 meses'],
  [1, '1 año'], [2, '2 años'], [5, '5 años'], [10, '10 años'], [25, '25 años'], [50, '50 años'], [100, '100 años'], [250, '250 años'],
];
const velocidadAuto = () => { const v = span() / 160; return VELOCIDADES.reduce((m, x) => (Math.abs(Math.log(x[0] / v)) < Math.abs(Math.log(m[0] / v)) ? x : m)); };
const velocidadActual = () => (L.vel != null ? VELOCIDADES[L.vel] : velocidadAuto());
BE.velocidad = () => velocidadActual()[0];
BE.textoVelocidad = () => `${velocidadActual()[1]} por segundo`;
const claveVel = (x) => norm(x[1].replace('ñ', 'ni')).replace(' ', '-');   // «vel=3-meses», «vel=1-anio», «vel=2-dias»: sin tildes en la dirección
function cambiarVelocidad(d) {
  L.vel = clamp(VELOCIDADES.indexOf(velocidadActual()) + d, 0, VELOCIDADES.length - 1);
  pintarVelocidad(); BE.guardarHash();
}
function pintarVelocidad() {
  const i = VELOCIDADES.indexOf(velocidadActual()), texto = BE.textoVelocidad();
  const ayuda = `Velocidad al reproducir: ${texto}. ${L.vel == null ? 'Sigue a la escala de la línea.' : 'Elegida a mano: no cambia con la escala.'}`;
  for (const el of document.querySelectorAll('[data-vel-texto]')) { if (el.textContent !== texto) el.textContent = texto; el.title = ayuda; }
  for (const b of document.querySelectorAll('[data-vel]')) b.disabled = +b.dataset.vel < 0 ? i <= 0 : i >= VELOCIDADES.length - 1;
  document.querySelectorAll('.velocidad').forEach((g) => g.classList.toggle('manual', L.vel != null));
}
const botonesVelocidad = () => `<button type="button" class="vel-boton" data-vel="-1" aria-label="Más despacio" title="Más despacio">−</button><span class="be-speed" data-vel-texto aria-live="polite">${esc(BE.textoVelocidad())}</span><button type="button" class="vel-boton" data-vel="1" aria-label="Más deprisa" title="Más deprisa">+</button>`;

let tAnterior = null, reanudar = 0, paradoEnFin = null;
function momentosFoco() {
  const out = [];
  const foco = E.resaltado?.claves;
  if (foco) {
    for (const k of foco) {
      const i = k.indexOf(':'), tipo = k.slice(0, i), id = k.slice(i + 1);
      if (tipo === 'evento') { const e = BE.D.eventos.find((x) => x.id === id); const m = e && BE.momentoEvento(e); if (m != null) out.push({ t: m, texto: `${e.titulo} · ${e.fecha?.texto || ''}` }); }
      else if (tipo === 'parada') { const s = BE.P.find((x) => x.key === id); if (s) out.push({ t: s.a, texto: `${s.lugar.nombre} · ${s.p.referencia}` }); }
    }
  } else if (span() <= 60) {
    for (const e of BE.D.eventos || []) { const m = BE.momentoEvento(e); if (m != null) out.push({ t: m, texto: `${e.titulo} · ${e.fecha?.texto || ''}` }); }
  }
  return out;
}
function vigilarReproduccion() {
  if (!E.play) { tAnterior = null; return; }
  if (L.bucle && (E.t >= L.bucle[1] || E.t < L.bucle[0] - 1e-6)) {
    tAnterior = null; setT(L.bucle[0]); BE.asegurarVisible(L.bucle[0], false); return;
  }
  // Con un periodo elegido, la reproducción se para donde acaba (be-64b.7): no sigue siglos después sin que se vea nada.
  // Se para una vez: si se vuelve a pulsar reproducir, sigue.
  const p = E.sel?.tipo === 'periodo' && BE.D.periodos.find((x) => x.id === E.sel.id), tr = p && BE.tramoPeriodo(p);
  // El primer fotograma de base.js puede retroceder un pelo (su dt sale negativo): la vuelta atrás que rearma la parada
  // tiene que ser mayor que eso.
  if (paradoEnFin && (!tr || paradoEnFin !== p.id || E.t < tr[1] - Math.max(0.01, BE.velocidad() * 0.25))) paradoEnFin = null;
  if (tAnterior != null && tr && !paradoEnFin && tAnterior < tr[1] && E.t >= tr[1]) {
    reproducir(false);
    clearTimeout(reanudar);
    setT(tr[1] - 1e-4);
    paradoEnFin = p.id;
    BE.avisar(`${tr.abierto === 'd' ? `Aquí acaba lo que dibujamos de ${p.nombre}: no sabemos cuándo dejó de serlo.` : `Fin de ${p.nombre} (${p.fecha.texto || fechaCorta(p.fecha)}).`} Pulsa reproducir para seguir.`, 5000);
    tAnterior = null;
    return;
  }
  if (tAnterior != null && L.pausa && E.t > tAnterior) {
    const hit = momentosFoco().find((m) => m.t > tAnterior && m.t <= E.t);
    if (hit) {
      reproducir(false);
      BE.avisar(hit.texto);
      clearTimeout(reanudar);
      const t = E.t;
      reanudar = setTimeout(() => { if (!E.play && Math.abs(E.t - t) < 1e-9) reproducir(true); }, 1500);
      tAnterior = null;
      return;
    }
  }
  tAnterior = E.t;
}

// ---------------------------------------------------------------------------
// Arranque y gestos
// ---------------------------------------------------------------------------
function montarBarra() {
  const zoom = $('.zoom');
  zoom.innerHTML = ZOOMS.map((z) => `<button type="button" data-zoom="${z.s}" title="${z.n}"><span class="z-largo">${z.n}</span><span class="z-corto" aria-hidden="true">${z.c}</span></button>`).join('');
  // En el móvil las seis escalas no caben con dianas de 44 px: la misma elección va en un desplegable (be-f1w).
  const zsel = document.createElement('select');
  zsel.className = 'zoom-select'; zsel.id = 'zoom-select';
  zsel.setAttribute('aria-label', 'Escala de la línea de tiempo');
  zsel.innerHTML = `<option value="" disabled hidden>Escala</option>${ZOOMS.map((z) => `<option value="${z.s}">${z.n}</option>`).join('')}`;
  zoom.after(zsel);
  zsel.addEventListener('change', () => { if (zsel.value) ponerEscala(+zsel.value); });
  const vel = document.createElement('div');
  vel.className = 'velocidad'; vel.setAttribute('role', 'group'); vel.setAttribute('aria-label', 'Velocidad de reproducción');
  vel.innerHTML = botonesVelocidad();
  $('#velocidad').replaceWith(vel);
  vel.addEventListener('click', (e) => { const b = e.target.closest('[data-vel]'); if (b) cambiarVelocidad(+b.dataset.vel); });
  const crono = $('.linea-barra .cronologia');
  const mm = document.createElement('div');
  mm.id = 'minimapa'; mm.className = 'be-minimap minimapa';
  mm.setAttribute('role', 'slider'); mm.setAttribute('tabindex', '-1');
  mm.setAttribute('aria-label', 'Toda la historia bíblica: pulsa para ir a esa época');
  mm.title = 'Toda la historia, de Adán al año 100. El marco es lo que ves en la línea.';
  mm.innerHTML = '<span class="be-minimap__win"></span><span class="minimapa-cursor"></span>';
  crono.before(mm);
  const botones = document.createElement('span');
  botones.className = 'linea-botones'; botones.id = 'linea-botones';
  botones.innerHTML = `<button type="button" class="be-btn be-btn--icon be-btn--ghost linea-boton" id="linea-menu-boton" aria-haspopup="dialog" aria-expanded="false" aria-label="Opciones de la línea de tiempo" title="Opciones: ampliar, sincronía, regla, bucle, marcadores y carriles">${ICONOS.menu}</button>`;
  crono.after(botones);
  // «Sobre las fechas» (be-64b.6): la píldora «Cronología TNM» parecía un botón y no hacía nada. Ahora es un botón que
  // dice lo que hace: explica de dónde salen las fechas y qué quiere decir cada marca de la línea.
  const fechasBoton = document.createElement('button');
  fechasBoton.type = 'button'; fechasBoton.className = 'cronologia fechas-boton'; fechasBoton.id = 'fechas-boton';
  fechasBoton.setAttribute('aria-haspopup', 'dialog'); fechasBoton.setAttribute('aria-expanded', 'false');
  fechasBoton.title = 'De dónde salen las fechas y qué quiere decir cada marca';
  fechasBoton.innerHTML = `${ICONOS.info}<span>Sobre las fechas</span>`;
  crono.replaceWith(fechasBoton);
  fechasBoton.addEventListener('click', (e) => { e.stopPropagation(); if (ayudaFechas && !ayudaFechas.hidden) cerrarAyudaFechas(); else abrirAyudaFechas(fechasBoton); });
  // Selector «Meses»: qué filas de meses enseña la regla y qué fecha va primero. Sale a escala de meses y de días.
  const meses = document.createElement('div');
  meses.className = 'meses-control';
  meses.id = 'meses-control';
  meses.hidden = true;
  meses.innerHTML = `<span class="meses-etiqueta" id="meses-etiqueta">Meses</span><div class="be-seg meses-seg" role="radiogroup" aria-labelledby="meses-etiqueta">${MODOS_MESES.map(([k, t]) => `<button type="button" class="be-seg__opt" role="radio" data-meses="${k}" title="${esc({ ambos: 'Nuestros meses y los hebreos, alineados', nuestros: 'Solo nuestros meses. ' + AYUDA_NUESTROS.replace(/^Nuestros meses: (.)/, (_, c) => c.toUpperCase()), hebreos: 'Solo los meses hebreos, lunares y aproximados' }[k])}">${t}</button>`).join('')}</div>${enlaceCalendario('meses-que', '¿Qué meses son estos?', 'Qué meses son estos: el calendario de la Biblia, explicado')}`;
  zoom.after(meses);
  meses.addEventListener('click', (e) => { const b = e.target.closest('[data-meses]'); if (b) ponerMeses(b.dataset.meses); });
  meses.addEventListener('keydown', (e) => {
    const i = MODOS_MESES.findIndex(([k]) => k === modoMeses()), d = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
    if (d == null || e.altKey || e.metaKey || e.ctrlKey || !e.target.closest('[data-meses]')) return;   // con Alt, ⌘ o Ctrl, del navegador
    e.preventDefault(); e.stopPropagation();
    ponerMeses(MODOS_MESES[(i + d + 3) % 3][0]);
    meses.querySelector(`[data-meses="${modoMeses()}"]`)?.focus();
  });
  // La fecha en el otro calendario, junto a la de la barra superior.
  const otra = document.createElement('span');
  otra.className = 'fecha-otra'; otra.id = 'fecha-otra'; otra.hidden = true;
  $('#fecha-valor').after(otra);
  // Los enlaces a las páginas del calendario y de «Acerca de» llevan la vista: su «Volver al mapa» vuelve a esta fecha y
  // esta selección. El calendario la recibe en #desde=…; «Acerca de» en ?desde=…, porque su # es la sección («#gracias»).
  // Desde el mapa llevan también volver=atras: allí «Volver al mapa» vuelve con Atrás a esta misma entrada
  // (js/volver.js). Desde la portada no, porque Atrás llevaría a la portada.
  document.addEventListener('click', (e) => {
    const a = e.target.closest?.('a[data-calendario]');
    const b = e.target.closest?.('a[href^="acerca.html"]');
    if (!a && !b) return;
    // La vista se lee ahora, no de location.hash, que se escribe con un cuarto de segundo de retraso. Sin la portada:
    // su botón dice «Volver al mapa» y lleva al mapa de detrás; Atrás sigue volviendo a la portada.
    const partes = BE.textoHash().split('&'), portada = partes.includes('portada=1');
    const vista = partes.filter((x) => x !== 'portada=1').join('&');
    if (a) a.href = `calendario.html${location.search}#desde=${encodeURIComponent(vista)}${portada ? '' : '&volver=atras'}`;
    if (b) {
      b.dataset.ancla ??= b.getAttribute('href').split('#')[1] || '';
      const q = new URLSearchParams(location.search);
      q.set('desde', vista);
      if (!portada) q.set('volver', 'atras');
      b.href = `acerca.html${String(q) ? `?${q}` : ''}${b.dataset.ancla ? `#${b.dataset.ancla}` : ''}`;
    }
  }, true);
  const irMinimapa = (e) => {
    const r = mm.getBoundingClientRect();
    const t = BE.T_MIN + clamp((e.clientX - r.left) / r.width, 0, 1) * spanMax();
    const s = span();
    const v0 = clamp(t - s / 2, BE.T_MIN, BE.T_MAX - s);
    E.vista = [v0, v0 + s]; sucio.linea = true; programar();
  };
  let arrastrando = false;
  mm.addEventListener('pointerdown', (e) => { arrastrando = true; try { mm.setPointerCapture(e.pointerId); } catch { /* puntero sintético */ } irMinimapa(e); });
  mm.addEventListener('pointermove', (e) => { if (arrastrando) irMinimapa(e); });
  mm.addEventListener('pointerup', () => { arrastrando = false; });
  $('#linea-menu-boton').addEventListener('click', (e) => { e.stopPropagation(); if (menuAbierto()) cerrarMenu(); else abrirMenu('todo'); });
  // La fecha abre el panel de la fecha (datepicker.js): qué quiere decir y cómo ir a otra, sin nada que escribir.
  $('#fecha').addEventListener('click', () => BE.datePicker?.open());
  $('#fecha').setAttribute('title', 'Pulsa para ir a otra fecha o ver qué quiere decir esta');
  $('#fecha').addEventListener('keydown', (e) => {
    if ((e.key === 'Enter' || e.key === ' ') && e.target === $('#fecha')) { e.preventDefault(); BE.datePicker?.open(); }
  });
  document.addEventListener('pointerdown', (e) => {
    if (menuAbierto() && !e.target.closest('#linea-menu, #linea-menu-boton, .carriles-boton')) cerrarMenu();
    if (ayudaFechas && !ayudaFechas.hidden && !e.target.closest('#fechas-ayuda, #fechas-boton, #linea-menu')) cerrarAyudaFechas();
  });
  $('#linea-cuerpo').addEventListener('click', (e) => {
    const f = e.target.closest('[data-fijar]');
    if (f) { e.stopPropagation(); fijar(f.dataset.fijar); return; }
    if (e.target.closest('.carriles-boton')) { e.stopPropagation(); if (menuAbierto() === 'carriles') cerrarMenu(); else abrirMenu('carriles'); return; }
    // Las filas de meses se explican al tocar su nombre: en el móvil no hay título emergente.
    const fila = !e.target.closest('a, button') && e.target.closest('.carril-mes[title]');
    if (fila) BE.avisar(fila.title, 8000);
  });
  document.addEventListener('change', (e) => {
    if (e.target.matches?.('#linea-menu select[data-linea="persona"]') && e.target.value) { fijar(e.target.value); }
  });
  document.addEventListener('keydown', (e) => {
    if (BE.portada?.abierta || e.target.matches?.('input, textarea, select') || e.metaKey || e.ctrlKey) return;
    if (e.key === 't' || e.key === 'T') { e.preventDefault(); alternarGrande(); }
    if (e.key === 'Escape') { cerrarMenu(); if (L.modoRegla) { L.modoRegla = false; $('#pista').classList.remove('modo-regla'); } }
  });
}
function ponerMeses(modo) {
  if (!MODOS_MESES.some(([k]) => k === modo)) return;
  L.meses = modo;
  sucio.linea = sucio.cursor = true; programar(); BE.guardarHash();
}
/** El selector «Meses» sigue a la escala y al modo. */
function pintarSelectorMeses() {
  const el = $('#meses-control');
  if (!el) return;
  el.hidden = !(span() < 4) || !BE.calendario().meses.length;
  const modo = modoMeses();
  el.querySelectorAll('[data-meses]').forEach((b) => {
    const on = b.dataset.meses === modo;
    b.classList.toggle('be-seg__opt--on', on); b.setAttribute('aria-checked', String(on)); b.tabIndex = on ? 0 : -1;
  });
}
/** La barra de la línea tiene un alto fijo: si lo que lleva no cabe a lo ancho, se compacta por pasos hasta que cabe, en
    vez de dejar el menú (…) fuera de la pantalla. 1: el selector «Meses» sin su rótulo ni su enlace (el «?» va al carril);
    2: las escalas abreviadas («Mil», «Sig»…); 3: la velocidad y «Sobre las fechas» pasan al menú de la línea. */
let claveBarra = '';
function ajustarBarra() {
  const barra = $('.linea-barra');
  if (!barra) return;
  const clave = `${barra.clientWidth}|${$('#meses-control')?.hidden}`;
  if (clave === claveBarra) return;
  claveBarra = clave;
  let n = 0;
  barra.dataset.compacta = '0';
  while (barra.scrollWidth > barra.clientWidth + 1 && n < 3) barra.dataset.compacta = String(++n);
}

/** Escala de la línea (años que abarca), con el cursor a un 40 % del borde izquierdo. */
function ponerEscala(s) {
  const v0 = clamp(E.t - s * 0.4, BE.T_MIN, BE.T_MAX - s);
  E.vista = [v0, v0 + s]; sucio.linea = true; programar();
}
function iniciarLinea() {
  montarBarra();
  const pista = $('#pista'), cuerpo = $('#linea-cuerpo'), filas = $('#linea-filas');
  pista.setAttribute('aria-valuemin', String(BE.T_MIN));
  pista.setAttribute('aria-valuemax', String(BE.T_MAX));
  const moverVista = (v0) => { v0 = clamp(v0, BE.T_MIN, BE.T_MAX - span()); E.vista = [v0, v0 + span()]; sucio.linea = true; programar(); };
  // Rueda sobre la regla y los carriles: arriba y abajo cambian la escala en el puntero, como siempre; de lado o con
  // Mayúsculas mueve la vista; Ctrl o ⌘ (y la pinza del trackpad) también cambia la escala. Sobre los nombres de los
  // carriles, la rueda los recorre de arriba abajo (lo hace el navegador); también la barra y arrastrar en vertical.
  cuerpo.addEventListener('wheel', (e) => {
    const conTecla = e.ctrlKey || e.metaKey || e.shiftKey;
    if (!conTecla && e.target.closest('.carril-rotulo, #carriles')) return;
    e.preventDefault();
    const x = clamp(e.clientX - pista.getBoundingClientRect().left, 0, anchoLinea);
    if (!e.ctrlKey && !e.metaKey && (e.shiftKey || Math.abs(e.deltaX) > Math.abs(e.deltaY))) {
      moverVista(E.vista[0] + ((e.shiftKey && !e.deltaX ? e.deltaY : e.deltaX) / anchoLinea) * span());
    } else {
      zoomEn(Math.exp((e.deltaY || e.deltaX) * (e.ctrlKey ? 0.01 : 0.0015)), tDe(x));
    }
  }, { passive: false });
  let scrollPendiente = false;
  cuerpo.addEventListener('scroll', () => {
    if (scrollPendiente) return;
    scrollPendiente = true;
    requestAnimationFrame(() => { scrollPendiente = false; ventanaMarcas(false); pintarIrSel(); });
  });

  // La regla: pulsar o arrastrar mueve el cursor; la vista no se mueve. Con Alt (o el modo regla), mide.
  let enRegla = null, regla = null;
  const empezarRegla = (e, el) => {
    const t = ajustar(tDe(e.clientX - pista.getBoundingClientRect().left));
    regla = { a: t, el };
    L.regla = [t, t];
    try { el.setPointerCapture(e.pointerId); } catch { /* puntero sintético */ }
    sucio.linea = true; programar();
  };
  const moverRegla = (e) => { L.regla = [regla.a, ajustar(tDe(e.clientX - pista.getBoundingClientRect().left))]; sucio.linea = true; programar(); };
  const acabarRegla = () => {
    if (Math.abs(L.regla[1] - L.regla[0]) < 1e-6) L.regla = null;
    regla = null; L.modoRegla = false; pista.classList.remove('modo-regla');
    sucio.linea = true; programar(); BE.guardarHash();
  };
  pista.addEventListener('pointerdown', (e) => {
    if (e.button > 0 || e.target.closest('[data-marcador], [data-linea]')) return;
    if (e.altKey || L.modoRegla) { empezarRegla(e, pista); return; }
    enRegla = e.pointerId;
    try { pista.setPointerCapture(e.pointerId); } catch { /* puntero sintético */ }
    setT(tDe(e.clientX - pista.getBoundingClientRect().left));
  });
  pista.addEventListener('pointermove', (e) => {
    if (regla?.el === pista) moverRegla(e);
    else if (enRegla === e.pointerId) setT(tDe(e.clientX - pista.getBoundingClientRect().left));
  });
  const soltarRegla = () => { enRegla = null; if (regla?.el === pista) acabarRegla(); };
  pista.addEventListener('pointerup', soltarRegla);
  pista.addEventListener('pointercancel', soltarRegla);
  pista.addEventListener('click', (e) => {
    if (e.target.closest('[data-linea="quitar-regla"]')) { L.regla = null; sucio.linea = true; programar(); BE.guardarHash(); return; }
    const m = e.target.closest('[data-marcador]');
    if (m) irAMarcador(+m.dataset.marcador);
  });
  pista.addEventListener('keydown', (e) => {
    const g = e.target.closest?.('[data-marcador], [data-linea]');
    if (g && e.key === 'Enter') { e.preventDefault(); g.dispatchEvent(new MouseEvent('click', { bubbles: true })); }
  });

  // Los carriles: arrastrar mueve el tiempo; un clic en una marca la elige; un clic en un hueco suelta la selección o,
  // sin selección, pone el cursor ahí. Con el dedo: arriba y abajo baja por los carriles, de lado mueve el tiempo, dos
  // dedos cambian la escala, y un toque a menos de 12 px de una marca de esa fila la elige.
  const punteros = new Map();
  let arrastre = null, pinza = null, tragarClic = false;
  filas.addEventListener('pointerdown', (e) => {
    const pistaC = e.target.closest('.carril-pista');
    if (!pistaC || e.button > 0) return;
    // La regla no cuenta como dedo: si se contara, el siguiente arrastre de un dedo sería una pinza.
    if (!punteros.size && (e.altKey || L.modoRegla)) { empezarRegla(e, filas); return; }
    punteros.set(e.pointerId, { x: e.clientX, y: e.clientY });
    tragarClic = false;
    if (punteros.size === 2) {
      const [p, q] = [...punteros.values()];
      const x = (p.x + q.x) / 2 - pista.getBoundingClientRect().left;
      pinza = { d0: Math.hypot(p.x - q.x, p.y - q.y), s0: span(), t: tDe(x), x };
      arrastre = null; tragarClic = true;
      // Un arrastre que se vuelve pinza suelta las filas congeladas: si no, nadie las soltaría.
      if (hold) { hold = null; sucio.linea = true; programar(); }
      return;
    }
    arrastre = { id: e.pointerId, x0: e.clientX, y0: e.clientY, v0: E.vista[0], movido: false, pista: pistaC, marca: e.target.closest('.m'), raton: e.pointerType === 'mouse' };
  });
  window.addEventListener('pointermove', (e) => {
    if (regla?.el === filas) { moverRegla(e); return; }
    if (!punteros.has(e.pointerId)) return;
    punteros.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinza && punteros.size >= 2) {
      const [p, q] = [...punteros.values()];
      const d = Math.hypot(p.x - q.x, p.y - q.y);
      if (d > 10) {
        const s = clamp(pinza.s0 * pinza.d0 / d, SPAN_MIN, spanMax());
        const v0 = clamp(pinza.t - (pinza.x / anchoLinea) * s, BE.T_MIN, BE.T_MAX - s);
        E.vista = [v0, v0 + s]; sucio.linea = true; programar();
      }
      return;
    }
    if (!arrastre || arrastre.id !== e.pointerId) return;
    const dx = e.clientX - arrastre.x0, dy = e.clientY - arrastre.y0;
    // Con el ratón, arrastrar en vertical recorre los carriles: la rueda sobre ellos cambia la escala. Con el dedo lo hace
    // el navegador (touch-action: pan-y).
    if (arrastre.raton && arrastre.top == null && !arrastre.movido && Math.abs(dy) > 6 && Math.abs(dy) > Math.abs(dx)) {
      arrastre.top = cuerpo.scrollTop; tragarClic = true;
    }
    if (arrastre.top != null) { cuerpo.scrollTop = arrastre.top - dy; return; }
    if (!arrastre.movido && Math.abs(dx) > (arrastre.raton ? 6 : 10) && Math.abs(dx) > Math.abs(dy)) {
      arrastre.movido = true; tragarClic = true;
      hold = { rows: new Map(), edge: new Map() };
      try { filas.setPointerCapture(e.pointerId); } catch { /* puntero sintético */ }
    }
    if (arrastre.movido) moverVista(arrastre.v0 - (dx / anchoLinea) * span());
  });
  const tocarCerca = (e, pistaC) => {
    const c = carrilesVista.find((x) => carrilEls.get(x.id)?.pista === pistaC);
    if (!c || !c.out) return null;
    const r = pistaC.getBoundingClientRect();
    const x = e.clientX - r.left, fila = Math.floor((e.clientY - r.top - c.decor) / G.row);
    let mejor = null, d = 13;
    for (const it of c.out.visible) {
      if (it._drow !== fila) continue;
      const dd = x < it._hit[0] ? it._hit[0] - x : x > it._hit[1] ? x - it._hit[1] : 0;
      if (dd < d) { d = dd; mejor = it; }
    }
    return mejor && { it: mejor, t: tDe(clamp(x, mejor._hit[0], mejor._hit[1])) };
  };
  const fin = (e) => {
    if (regla?.el === filas) { punteros.delete(e.pointerId); acabarRegla(); return; }
    if (!punteros.has(e.pointerId)) return;
    punteros.delete(e.pointerId);
    if (pinza) { if (!punteros.size) pinza = null; return; }
    const a = arrastre;
    if (!a || a.id !== e.pointerId) return;
    arrastre = null;
    if (a.movido) { hold = null; sucio.linea = true; programar(); return; }
    if (a.top != null || e.type !== 'pointerup' || a.cancelado) return;
    // Con el dedo decide esta línea, no el navegador, que ajusta el toque a su manera y a veces a la marca de al lado: la
    // marca bajo el dedo o, si no hay, la de esa fila a menos de 12 px. El clic que da después el navegador no cuenta.
    if (!a.raton) {
      const it = a.marca && marcasVisibles().find(({ it: x }) => x.id === a.marca.dataset.id)?.it;
      const cerca = it ? { it, t: tDe(e.clientX - pista.getBoundingClientRect().left) } : tocarCerca(e, a.pista);
      if (cerca) { tragarClic = true; elegirMarca(cerca.it, cerca.t); return; }
    }
    if (a.marca) return;   // con el ratón, una marca la elige su clic
    // Un mes con el nombre cortado lo nombra entero.
    const mes = e.target.closest?.('g.mes[data-aviso]');
    if (mes && !E.sel) { BE.avisar(mes.dataset.aviso, 6000); return; }
    if (E.sel) { BE.limpiarSeleccion(); vivo('Nada elegido.'); }
    else setT(tDe(e.clientX - pista.getBoundingClientRect().left));
  };
  window.addEventListener('pointerup', fin);
  window.addEventListener('pointercancel', (e) => { if (arrastre?.id === e.pointerId) arrastre.cancelado = true; fin(e); });
  filas.addEventListener('click', (e) => {
    const b = e.target.closest('.m');
    if (!b) return;
    if (tragarClic) { tragarClic = false; e.preventDefault(); e.stopPropagation(); return; }
    const it = marcasVisibles().find(({ it: x }) => x.id === b.dataset.id)?.it;
    if (it) elegirMarca(it, e.detail === 0 ? null : tDe(e.clientX - pista.getBoundingClientRect().left));
  });
  filas.addEventListener('dblclick', (e) => { if (e.target.closest('.carril-pista')) e.preventDefault(); });
  filas.addEventListener('keydown', teclaMarca);
  filas.addEventListener('keydown', (e) => { if (e.key === 'Escape' && E.sel && e.target.closest('.m')) vivo('Nada elegido.'); });
  filas.addEventListener('focusin', (e) => { const b = e.target.closest('.m'); if (b) focoId = b.dataset.id; });
  $('#linea-ir-sel').addEventListener('click', (e) => irASel(e.currentTarget));

  document.querySelectorAll('[data-zoom]').forEach((b) => b.addEventListener('click', () => ponerEscala(+b.dataset.zoom)));
  $('#reproducir').addEventListener('click', () => reproducir(!E.play));
  $('#anterior').addEventListener('click', () => saltar(-1));
  $('#siguiente').addEventListener('click', () => saltar(1));
  new ResizeObserver(() => { sucio.linea = true; programar(); }).observe(pista);
  new ResizeObserver(() => { ventanaMarcas(false); pintarIrSel(); }).observe(cuerpo);
  new MutationObserver(() => { sucio.linea = sucio.cursor = true; programar(); }).observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
  // Con la letra ya cargada, los anchos cambian: la barra se vuelve a ajustar y los nombres se vuelven a medir.
  document.fonts?.ready.then(() => { claveBarra = ''; ajustarBarra(); sucio.linea = true; programar(); });
  BE.pintores.push(() => vigilarReproduccion());
}

/** Momentos a los que saltan «anterior» y «siguiente» (T-13): con algo seleccionado, lo suyo; sin selección, las paradas,
    las cartas, los sucesos y el comienzo de cada periodo. */
BE.hitos = () => {
  let ts = [];
  const r = E.resaltado;
  if (r) {
    for (const m of momentosFoco()) ts.push(m.t);
    for (const k of r.claves) {
      if (k.startsWith('carta:')) { const c = BE.D.cartas.find((x) => `carta:${x.id}` === k); const m = c && BE.momentoCarta(c); if (m != null) ts.push(m); }
      if (k.startsWith('periodo:')) { const p = BE.D.periodos.find((x) => `periodo:${x.id}` === k); const tr = p && BE.tramoPeriodo(p); if (tr) ts.push(BE.inicioPeriodo(p) + 0.01, tr[1] - 0.01); }
    }
  }
  if (!ts.length) {
    ts = BE.P.map((s) => (s.a + s.b) / 2).concat(BE.D.cartas.map(BE.momentoCarta).filter((x) => x != null));
    for (const e of BE.D.eventos || []) { const m = BE.momentoEvento(e); if (m != null) ts.push(m); }
    for (const p of BE.D.periodos || []) { const tr = tramo(p.fecha); if (tr && p.tipo !== 'era') ts.push(tr[0] + 0.01); }
  }
  return [...new Set(ts.map((x) => Math.round(x * 1000) / 1000))].sort((a, b) => a - b);
};

// Parámetros de la dirección: carriles fijados, fechas seculares, pausa, regla, bucle y línea ampliada.
const rango = (r) => (r ? `${Math.min(...r).toFixed(3)}~${Math.max(...r).toFixed(3)}` : null);
const leerRango = (v) => { const m = String(v || '').match(/^(-?[\d.]+)~(-?[\d.]+)$/); return m ? [+m[1], +m[2]] : null; };
BE.parametros.push(
  { nombre: 'carriles', escribir: () => (L.fijados.length ? L.fijados.join(',') : null), leer: (v) => { L.fijados = v ? v.split(',').filter((id) => carrilPorId(id)) : []; claveEtiquetas = ''; } },
  { nombre: 'secular', escribir: () => (L.secular ? null : '0'), leer: (v) => { L.secular = v !== '0'; } },
  { nombre: 'pausa', escribir: () => (L.pausa ? null : '0'), leer: (v) => { L.pausa = v !== '0'; } },
  // Velocidad elegida a mano, con palabras: «vel=3-meses» (por segundo).
  { nombre: 'vel', escribir: () => (L.vel != null ? claveVel(VELOCIDADES[L.vel]) : null), leer: (v) => { const i = VELOCIDADES.findIndex((x) => claveVel(x) === v); L.vel = i >= 0 ? i : null; } },
  { nombre: 'regla', escribir: () => rango(L.regla), leer: (v) => { L.regla = leerRango(v); } },
  { nombre: 'bucle', escribir: () => rango(L.bucle), leer: (v) => { L.bucle = leerRango(v); } },
  // La línea alta es como abre en la pantalla ancha y alta: la dirección solo lo dice cuando no es lo de siempre
  // («linea=normal» en esa pantalla, «linea=grande» en el móvil o en una pantalla baja).
  { nombre: 'linea', escribir: () => (L.grande === altaDeInicio() ? null : L.grande ? 'grande' : 'normal'),
    leer: (v) => { const on = v === 'grande' ? true : v === 'normal' ? false : altaDeInicio(); if (on !== $('#app').classList.contains('linea-grande')) ponerGrande(on); else L.grande = on; } },
  // Sin «meses» en la dirección vale lo de siempre: ambos, también en el móvil.
  { nombre: 'meses', escribir: () => L.meses, leer: (v) => { L.meses = MODOS_MESES.some(([k]) => k === v) ? v : null; } },
);

// La marca pulsada la última vez, para la entrada del historial (buscar.js): al volver a una entrada con Atrás o
// Adelante la línea la recupera, y un primer clic en ella la suelta, como antes de irse. Si se pulsó en el carril de
// una persona, la entrada guarda también de quién es: ese carril solo está mientras su persona o una de sus marcas
// está elegida, y sin él la marca volvería sin sitio donde verse.
const marcaPulsada = () => lastClicked;
const carrilPulsado = () => (lastClicked ? personaSel : null);
function ponerMarcaPulsada(id, persona = null) {
  lastClicked = id ?? null;
  if (lastClicked && persona) personaSel = persona;
}

Object.assign(BE, {
  pintarLineaFija, pintarCursor, iniciarLinea, irA, encuadrarTiempo, duracion, ponerGrande, alternarGrande, colorPotencia, fmtMes,
  marcaPulsada, carrilPulsado, ponerMarcaPulsada, lineaEstado: L, SPAN_MIN,
});
})();
