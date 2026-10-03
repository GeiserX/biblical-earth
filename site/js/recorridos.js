/* biblical-atlas · recorridos guiados (pantalla 14, A-01) con sus preguntas de repaso (A-04) y su hoja de impresión
   (A-16); modo presentación (A-11), modo reunión (D-02), letra grande (D-11) y movimiento reducido (D-10), con el menú
   «Estudio» de la barra superior que abre también la lectura, el grafo, la conexión y la portada.
   Dueño durante el reparto: app-estudio. */
'use strict';
(() => {
const BE = window.BE;
const { E, esc, $, EXTERNO, fmtAnio, fechaCorta } = BE;

const reducido = () => matchMedia('(prefers-reduced-motion: reduce)').matches || document.documentElement.classList.contains('be-reunion');
const busca = (id) => (BE.D.recorridos || []).find((r) => r.id === id);
const CLAVE_PASO = 'biblical-atlas:recorrido:';
// marcoLlegada: el encuadre guardado de la entrada a la que se acaba de llegar (Atrás, Adelante, una recarga), solo
// hasta el siguiente fotograma, el que abre el recorrido (seguirSeleccion).
const R = { id: null, paso: 0, pasoHash: null, marcoLlegada: null, respuestas: {}, play: 0, marcas: [] };
const pasoDe = (id) => (R.id === id ? R.paso : (R.pasoHash ?? guardado(id)));
// El paso guardado es un entero desde 0; un valor que no es un número (una copia estropeada) cuenta como el primero.
// Quien lo usa lo recorta al número de paradas.
function guardado(id) {
  try {
    const n = Number(localStorage.getItem(CLAVE_PASO + id));
    return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
  } catch { return 0; }
}
function guardar() { try { localStorage.setItem(CLAVE_PASO + R.id, String(R.paso)); } catch { /* sin almacenamiento */ } }

/** Texto de la fecha de una parada: la de su selección si la tiene; si no, el año de la parada. */
function fechaParada(p) {
  const o = BE.objetoSel?.(BE.parseSel(p.sel));
  return o?.fecha?.texto || fmtAnio(Math.floor(p.t));
}
function lugaresParada(p) {
  const s = BE.parseSel(p.sel);
  if (!s) return [];
  if (s.tipo === 'lugar') return [s.id];
  return [...BE.implicados(s).lugares].filter((x) => BE.L[x]);
}
function librosDe(rc) {
  const ls = new Map();
  for (const p of rc.paradas) for (const c of BE.citas((p.pasajes || []).join('; '))) ls.set(c.libro.num, c.libro.nombre);
  return [...ls.entries()].sort((a, b) => a[0] - b[0]).map((x) => x[1]);
}

function fichaRecorrido(id) {
  const rc = busca(id);
  const n = rc.paradas.length;
  const i = Math.min(R.id === id ? R.paso : guardado(id), n - 1);
  const p = rc.paradas[i];
  const s = BE.parseSel(p.sel);
  const titulo = s ? BE.nombreSel(s) : p.sel;
  const q = p.pregunta;
  const resp = R.respuestas[`${id}/${i}`];
  const cita0 = BE.citas((p.pasajes || []).join('; '))[0];
  const sig = rc.paradas[i + 1], ant = rc.paradas[i - 1];
  const nombreDe = (x) => { const y = BE.parseSel(x.sel); return y ? BE.nombreSel(y) : x.sel; };
  const libros = librosDe(rc);
  return `${BE.migas('Recorridos', rc.titulo)}
    <div class="card-tools">${BE.notes?.pencilForSel({ tipo: 'recorrido', id }) || ''}<button type="button" class="be-btn be-btn--sm cerrar-ficha" data-recorrido-salir>Salir y explorar <span aria-hidden="true">×</span></button></div>
    <section class="be-card recorrido"><div class="be-card__pad">
      <div class="be-card__eyebrow">Recorrido guiado · parada ${i + 1} de ${n}${libros.length ? ` · ${esc(libros.slice(0, 3).join(', '))}` : ''}</div>
      <div class="progreso" role="list" aria-label="Paradas del recorrido">${rc.paradas.map((x, k) => `<button type="button" role="listitem" class="progreso-tramo${k < i ? ' progreso-tramo--visto' : ''}${k === i ? ' progreso-tramo--actual' : ''}" data-recorrido-ir="${k}" aria-label="Parada ${k + 1}: ${esc(nombreDe(x))}"${k === i ? ' aria-current="step"' : ''}><span class="progreso-barra"></span><span class="progreso-anio">${esc(fmtAnio(Math.floor(x.t)))}</span></button>`).join('')}</div>
      ${i === 0 ? `<div class="be-note recorrido-entrada"><span aria-hidden="true">◎</span><span>Vas a ver ${n} paradas${libros.length ? ` con ${esc(libros.join(', '))}` : ''}. Cada una mueve el cursor, el mapa y la ficha. El relato se lee en jw.org.</span></div>` : ''}
      <div class="parada-cab"><span class="be-num parada-num">${i + 1}</span><span class="be-chrono be-chrono--tnm">${esc(fechaParada(p))}</span></div>
      <h2 class="be-card__title">${s ? `<button type="button" class="enlace-titulo" data-sel="${esc(p.sel)}" title="Abrir su ficha">${esc(titulo)}</button>` : esc(titulo)}</h2>
      <p class="recorrido-texto">${esc(p.texto)}</p>
      ${(p.pasajes || []).length ? `<div class="fila-chips"><span class="be-muted">Lee el relato:</span>${BE.chipsCitas(p.pasajes.join('; '))}${cita0 ? `<a class="be-wol" href="${BE.urlCita(cita0)}" ${EXTERNO}>Leer ${esc(cita0.texto)} en jw.org</a>` : ''}</div>` : ''}
      ${p.no_sabemos ? `<div class="be-note be-note--uncertain"><span aria-hidden="true">?</span><span><b>Qué no sabemos.</b> ${esc(p.no_sabemos)}</span></div>` : ''}
    </div></section>
    ${q ? `<section class="be-card ficha-sec pregunta"><div class="be-card__pad"><h3 class="be-card__eyebrow">Pregunta de repaso</h3>
      <p class="pregunta-texto">${esc(q.texto)}</p>
      <div class="opciones" role="group" aria-label="Opciones">${q.opciones.map((o) => `<button type="button" class="opcion${resp === o ? (o === q.respuesta ? ' opcion--bien' : ' opcion--elegida') : ''}${resp && o === q.respuesta ? ' opcion--correcta' : ''}" data-recorrido-respuesta="${esc(o)}" aria-pressed="${resp === o}">${esc(o)}</button>`).join('')}</div>
      ${resp ? `<p class="explicacion" role="status"><b>${resp === q.respuesta ? 'Correcto.' : `La respuesta es ${esc(q.respuesta)}.`}</b> ${esc(q.explicacion)}</p>` : '<p class="be-muted">Nada se puntúa ni se envía: la respuesta sale al elegir.</p>'}
    </div></section>` : ''}
    ${i === n - 1 ? `<section class="be-card ficha-sec"><div class="be-card__pad"><h3 class="be-card__eyebrow">Resumen del recorrido</h3>
      <ol class="resumen-recorrido">${rc.paradas.map((x, k) => `<li><button type="button" class="enlace-texto" data-recorrido-ir="${k}"><span class="be-chrono be-chrono--tnm">${esc(fmtAnio(Math.floor(x.t)))}</span> ${esc(nombreDe(x))}</button></li>`).join('')}</ol>
      ${rc.paradas.some((x) => x.pregunta) ? '<button type="button" class="be-btn be-btn--sm be-btn--ghost" data-recorrido-repasar>Repasar las preguntas</button>' : ''}
      ${(BE.D.recorridos || []).filter((x) => x.id !== id).length ? `<h4 class="subgrupo">Otros recorridos</h4><div class="be-list">${BE.D.recorridos.filter((x) => x.id !== id).map((x) => BE.botonSel(`recorrido:${x.id}`, x.titulo, `${x.paradas.length} paradas`)).join('')}</div>` : ''}
    </div></section>` : ''}
    <nav class="recorrido-nav" aria-label="Paradas">
      ${ant ? `<button type="button" class="be-btn recorrido-ant" data-recorrido-ir="${i - 1}"><span aria-hidden="true">‹</span> ${i} · ${esc(nombreDe(ant))}</button>` : '<span></span>'}
      ${sig ? `<button type="button" class="be-btn be-btn--primary recorrido-sig" data-recorrido-ir="${i + 1}"><span class="be-caps">Parada ${i + 2} · ${esc(fmtAnio(Math.floor(sig.t)))}</span><span>${esc(nombreDe(sig))}</span></button>` : ''}
    </nav>
    <div class="fila-chips recorrido-herramientas">
      <button type="button" class="be-btn be-btn--sm be-btn--ghost" data-recorrido-play>${R.play ? 'Pausar' : 'Avance automático ▶'}</button>
      <button type="button" class="be-btn be-btn--sm be-btn--ghost" data-presentar>Presentar</button>
      <button type="button" class="be-btn be-btn--sm be-btn--ghost" data-recorrido-imprimir>Hoja para imprimir</button>
    </div>
    ${BE.porQueHtml(rc)}`;
}

function vistaSobreMapa() {
  const v = $('#vista-recorrido');
  const rc = R.id && busca(R.id);
  if (!rc) { v.hidden = true; v.innerHTML = ''; return; }
  const p = rc.paradas[R.paso];
  v.hidden = false;
  v.innerHTML = `<div class="be-float recorrido-flota"><span class="be-caps">Recorrido guiado</span><b>${esc(rc.titulo)}</b><span class="be-muted">parada ${R.paso + 1} de ${rc.paradas.length}</span>
    <button type="button" class="be-btn be-btn--sm be-btn--ghost" data-recorrido-salir>Salir y explorar</button></div>
    ${p?.no_sabemos ? `<div class="be-float recorrido-nosabemos"><span class="be-caps">Qué no sabemos</span><p>${esc(p.no_sabemos)}</p></div>` : ''}`;
}
function marcas() {
  for (const m of R.marcas) m.remove();
  R.marcas = [];
  const rc = R.id && busca(R.id);
  const map = BE.mapa.gl, ML = window.maplibregl;
  if (!rc || !map || !ML?.Marker) return;
  const por = new Map();
  rc.paradas.forEach((p, k) => { const l = lugaresParada(p).find((x) => BE.L[x].lat != null); if (l) { if (!por.has(l)) por.set(l, []); por.get(l).push(k); } });
  for (const [l, ks] of por) {
    const el = document.createElement('button');
    el.type = 'button';
    el.className = `marca-num${ks.includes(R.paso) ? ' marca-num--activa' : ''}${ks.every((k) => k < R.paso) ? ' marca-num--vista' : ''}`;
    el.textContent = ks.map((k) => k + 1).join('·');
    el.dataset.lugar = l;   // mapa.js reparte el número anclado en su lugar exacto
    el.setAttribute('aria-label', `Parada ${ks.map((k) => k + 1).join(' y ')}: ${BE.L[l].nombre}`);
    el.addEventListener('click', (ev) => { ev.stopPropagation(); irA(ks.includes(R.paso) ? R.paso : ks[0]); });
    R.marcas.push(new ML.Marker({ element: el, anchor: 'bottom', offset: [0, -14] }).setLngLat([BE.L[l].lon, BE.L[l].lat]).addTo(map));
  }
}

/** Lo que encuadra la parada i: en la primera, todas las paradas del recorrido; en las demás, la parada con la de antes
    y la de después, para que se vea de dónde viene y adónde va aunque el mapa sea bajo. */
function encuadreParada(rc, i) {
  const ks = i === 0 ? rc.paradas.map((_, k) => k) : [i - 1, i, i + 1];
  return [...new Set(ks.flatMap((k) => (rc.paradas[k] ? lugaresParada(rc.paradas[k]) : [])))];
}
/** Va a la parada i: cursor, mapa (su lugar resaltado y, si encuadrar, encuadrado con sus vecinas), ficha y dirección. */
function irA(i, { historia = true, encuadrar = true } = {}) {
  const rc = busca(R.id);
  if (!rc) return;
  i = Math.max(0, Math.min(rc.paradas.length - 1, i));
  if (historia && i !== R.paso) BE.historia?.marcar();
  R.paso = i;
  guardar();
  const p = rc.paradas[i];
  BE.setT(p.t);
  BE.asegurarVisible(BE.E.t, true);
  const ls = lugaresParada(p);
  vistaSobreMapa();   // antes de encuadrar: el encuadre deja libre el sitio de esta tarjeta
  BE.mapa.resaltar(ls.length ? ls : null);
  if (encuadrar) { const caja = encuadreParada(rc, i); if (caja.length) BE.mapa.encuadrar(caja); }
  BE.pintarPanel(true);
  marcas();
  BE.guardarHash();
}
/** Se llama en cada fotograma: entra o sale del recorrido según la selección. */
function seguirSeleccion() {
  const marco = R.marcoLlegada;
  R.marcoLlegada = null;
  const id = E.sel?.tipo === 'recorrido' ? E.sel.id : null;
  if (id === R.id) return;
  if (R.id) { parar(); BE.mapa.resaltar(null); }
  R.id = id;
  if (id) {
    BE.estudio?.abrirSolo?.('recorrido');   // el recorrido lleva su propio mapa: se cierran grafo, conexión y lectura
    const rc = busca(id);
    R.paso = Math.min(rc.paradas.length - 1, R.pasoHash ?? guardado(id));
    R.pasoHash = null;
    // Al llegar a una entrada que guarda su encuadre, el mapa se queda como se dejó, no en el de la parada.
    irA(R.paso, { historia: false, encuadrar: !marco });
    if (marco) BE.mapa.ponerMarco(marco);
  } else { vistaSobreMapa(); marcas(); }
}
function parar() { clearTimeout(R.play); R.play = 0; }
function reproducir() {
  if (R.play) { parar(); BE.pintarPanel(true); return; }
  const paso = () => {
    const rc = busca(R.id);
    if (!rc || R.paso >= rc.paradas.length - 1) { parar(); BE.pintarPanel(true); return; }
    irA(R.paso + 1);
    R.play = setTimeout(paso, 9000);
    BE.pintarPanel(true);
  };
  R.play = setTimeout(paso, 9000);
  BE.pintarPanel(true);
}

// ---------------------------------------------------------------------------
// Hoja de impresión (A-16): la historia, las fechas en su escala, las referencias y las preguntas con su respuesta
// ---------------------------------------------------------------------------
function hojaImpresion(id) {
  const rc = busca(id);
  const ts = rc.paradas.map((p) => p.t);
  const a = Math.min(...ts), z = Math.max(...ts), ancho = Math.max(1, z - a);
  const escala = `<svg class="hoja-escala" viewBox="0 0 1000 60" aria-hidden="true"><line x1="20" y1="30" x2="980" y2="30"/>${rc.paradas.map((p, k) => { const x = 20 + ((p.t - a) / ancho) * 960; return `<circle cx="${x}" cy="30" r="9"/><text x="${x}" y="34">${k + 1}</text><text class="hoja-anio" x="${x}" y="${k % 2 ? 56 : 12}">${esc(fmtAnio(Math.floor(p.t)))}</text>`; }).join('')}</svg>`;
  const qs = rc.paradas.map((p, k) => ({ p, k })).filter((x) => x.p.pregunta);
  let h = document.getElementById('hoja-recorrido');
  if (!h) { h = document.createElement('div'); h.id = 'hoja-recorrido'; h.className = 'hoja-impresion'; document.body.appendChild(h); }
  h.innerHTML = `<h1>${esc(rc.titulo)}</h1>${rc.resumen ? `<p>${esc(rc.resumen)}</p>` : ''}
    <p class="hoja-meta">${rc.paradas.length} paradas · ${esc(fechaCorta({ desde: Math.floor(a), hasta: Math.floor(z) }))} · fechas según la Traducción del Nuevo Mundo · biblical-atlas</p>
    ${escala}
    <ol class="hoja-paradas">${rc.paradas.map((p) => { const s = BE.parseSel(p.sel); return `<li><b>${esc(s ? BE.nombreSel(s) : p.sel)}</b> <span class="hoja-fecha">${esc(fechaParada(p))}</span><br>${esc(p.texto)}${(p.pasajes || []).length ? `<br><i>${esc(p.pasajes.join('; '))}</i>` : ''}${p.no_sabemos ? `<br>No sabemos: ${esc(p.no_sabemos)}` : ''}</li>`; }).join('')}</ol>
    ${qs.length ? `<h2>Preguntas</h2><ol class="hoja-preguntas">${qs.map(({ p }) => `<li>${esc(p.pregunta.texto)} <span class="hoja-opciones">(${esc(p.pregunta.opciones.join(' · '))})</span></li>`).join('')}</ol>
      <h2>Respuestas</h2><ol class="hoja-respuestas">${qs.map(({ p }) => `<li><b>${esc(p.pregunta.respuesta)}.</b> ${esc(p.pregunta.explicacion)}</li>`).join('')}</ol>` : ''}
    <p class="hoja-meta">El relato se lee en jw.org. Vista en línea: ${esc(location.href)}</p>`;
  window.print();
}

// ---------------------------------------------------------------------------
// Presentación (A-11), reunión (D-02), letra grande (D-11)
// ---------------------------------------------------------------------------
const PREF = 'biblical-atlas:pref:';
const raiz = document.documentElement;
function pref(nombre, valor) {
  if (valor === undefined) { try { return localStorage.getItem(PREF + nombre) === '1'; } catch { return false; } }
  try { localStorage.setItem(PREF + nombre, valor ? '1' : '0'); } catch { /* sin almacenamiento */ }
  return valor;
}
function ponerClase(nombre, on) { BE.ponerPreferencia(nombre, on); pintarMenu(); }
function avanzar(d) {
  if (R.id) { irA(R.paso + d); return; }
  if (BE.lectura?.abierta && BE.lectura.mover(d)) return;
  BE.saltar(d);
}
function presentar(on) {
  raiz.classList.toggle('be-presentando', on);
  if (on) {
    raiz.requestFullscreen?.().catch(() => {});
    BE.avisar('Presentación: ← y → (o el mando) avanzan; Esc sale.');
  } else if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
  pintarMenu();
  BE.sucio.linea = BE.sucio.etiquetas = true; BE.programar();
}
document.addEventListener('fullscreenchange', () => { if (!document.fullscreenElement && raiz.classList.contains('be-presentando')) presentar(false); });
window.addEventListener('keydown', (e) => {
  // Un diálogo abierto (las notas) se queda sus teclas: flechas y avance de página no mueven la presentación de debajo.
  // Con Alt, ⌘ o Ctrl las teclas son del navegador (Alt + ←, atrás; Ctrl + Av Pág, otra pestaña).
  if (!raiz.classList.contains('be-presentando') || e.altKey || e.metaKey || e.ctrlKey || e.target.matches?.('input, textarea, select') || e.target.closest?.('dialog[open]')) return;
  const k = e.key;
  if (['ArrowRight', 'PageDown', 'ArrowDown'].includes(k) || (k === ' ' && !e.target.matches?.('button, a'))) { e.preventDefault(); e.stopImmediatePropagation(); avanzar(1); }
  else if (['ArrowLeft', 'PageUp', 'ArrowUp'].includes(k)) { e.preventDefault(); e.stopImmediatePropagation(); avanzar(-1); }
  else if (k === 'Escape') { e.stopImmediatePropagation(); presentar(false); }
}, true);

// Menú «Estudio» en la barra superior: entra en las vistas de estudio y cambia la forma de ver el sitio.
function pintarMenu() {
  const m = document.getElementById('estudio-menu');
  if (!m) return;
  const on = (c) => raiz.classList.contains(`be-${c}`);
  m.innerHTML = `<div class="be-caps menu-titulo">Estudiar</div>
    <button type="button" role="menuitem" data-menu="portada">Portada</button>
    <button type="button" role="menuitem" data-menu="lectura">Modo lectura</button>
    <button type="button" role="menuitem" data-menu="grafo">Grafo de personas</button>
    <button type="button" role="menuitem" data-menu="conexion">¿Cómo se relacionan dos?</button>
    <button type="button" role="menuitem" data-menu="notas">Mis notas</button>
    <div class="be-caps menu-titulo">Ver</div>
    <button type="button" role="menuitemcheckbox" aria-checked="${on('letra-grande')}" data-menu="letra-grande">Letra grande</button>
    <button type="button" role="menuitemcheckbox" aria-checked="${on('presentando')}" data-menu="presentar">Presentación a pantalla completa</button>`;
}
function menu(abrir) {
  const b = document.getElementById('estudio-boton'), m = document.getElementById('estudio-menu');
  m.hidden = !abrir;
  b.setAttribute('aria-expanded', String(abrir));
  if (abrir) { pintarMenu(); m.querySelector('button')?.focus(); }
}
function accionMenu(a) {
  menu(false);
  const sel = E.sel;
  if (a === 'portada') BE.portada?.abrir();
  else if (a === 'lectura') {
    let id = 'hch-1';
    if (sel?.tipo === 'pasaje') id = sel.id;
    else if (sel?.tipo === 'libro') id = BE.idPasaje(BE.libroPorSlug(sel.id), 1);
    else { const o = BE.objetoSel?.(sel); const c = o && BE.citas(o.referencia || (o.pasajes || []).join('; '))[0]; if (c) id = BE.idPasaje(c.libro, c.cap); }
    BE.lectura.abrir(id);
  } else if (a === 'grafo') BE.grafo.abrir(sel ? BE.selTexto(sel) : 'pablo');
  else if (a === 'conexion') BE.conexion.abrir(sel && ['persona', 'lugar', 'carta'].includes(sel.tipo) ? BE.selTexto(sel) : null, null);
  else if (a === 'notas') BE.notes?.openList();
  else if (a === 'letra-grande') ponerClase(a, !raiz.classList.contains(`be-${a}`));
  else if (a === 'presentar') presentar(!raiz.classList.contains('be-presentando'));
}
function iniciar() {
  if (pref('letra-grande')) raiz.classList.add('be-letra-grande');
  if (pref('reunion')) raiz.classList.add('be-reunion');   // el modo reunión se pone y se quita con el botón de la luna (base.js)
  // El botón va en la barra superior, delante de «compartir» (index.html está congelado: lo pone este módulo).
  const cont = document.createElement('div');
  cont.className = 'estudio-ajustes';
  cont.innerHTML = '<button type="button" class="be-btn be-btn--sm be-btn--ghost" id="estudio-boton" aria-haspopup="menu" aria-expanded="false" aria-controls="estudio-menu" title="Estudiar: lectura, grafo, recorridos, presentación"><svg class="be-i be-i--sm" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5.5C6.5 4.5 9.5 4.5 12 6c2.5-1.5 5.5-1.5 8-.5v13c-2.5-1-5.5-1-8 .5-2.5-1.5-5.5-1.5-8-.5Z M12 6v13" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg><span class="estudio-texto">Estudio</span></button><div class="be-results estudio-menu" id="estudio-menu" role="menu" hidden></div>';
  const comp = document.getElementById('compartir');
  comp.parentNode.insertBefore(cont, comp);
  document.getElementById('estudio-boton').addEventListener('click', () => menu(document.getElementById('estudio-menu').hidden));
  document.getElementById('estudio-menu').addEventListener('click', (e) => { const b = e.target.closest('[data-menu]'); if (b) accionMenu(b.dataset.menu); });
  cont.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !document.getElementById('estudio-menu').hidden) { e.stopPropagation(); menu(false); document.getElementById('estudio-boton').focus(); }
    if (['ArrowDown', 'ArrowUp'].includes(e.key) && !document.getElementById('estudio-menu').hidden) {
      e.preventDefault(); e.stopPropagation();
      const bs = [...cont.querySelectorAll('[data-menu]')]; const i = bs.indexOf(document.activeElement);
      bs[(i + (e.key === 'ArrowDown' ? 1 : -1) + bs.length) % bs.length].focus();
    }
  });
  document.addEventListener('click', (e) => { if (!e.target.closest('.estudio-ajustes')) { const m = document.getElementById('estudio-menu'); if (m && !m.hidden) menu(false); } });

  // Botones de la ficha del recorrido.
  document.getElementById('panel-cuerpo').addEventListener('click', (e) => {
    const t = e.target;
    const ir = t.closest('[data-recorrido-ir]');
    if (ir) { parar(); irA(+ir.dataset.recorridoIr); return; }
    if (t.closest('[data-recorrido-salir]')) { salir(); return; }
    const r = t.closest('[data-recorrido-respuesta]');
    if (r) { R.respuestas[`${R.id}/${R.paso}`] = r.dataset.recorridoRespuesta; BE.pintarPanel(true); return; }
    if (t.closest('[data-recorrido-play]')) { reproducir(); return; }
    if (t.closest('[data-recorrido-imprimir]')) { hojaImpresion(R.id); return; }
    if (t.closest('[data-recorrido-repasar]')) { const rc = busca(R.id); const k = rc.paradas.findIndex((x) => x.pregunta); for (const key of Object.keys(R.respuestas)) if (key.startsWith(`${R.id}/`)) delete R.respuestas[key]; if (k >= 0) irA(k); }
  });
  document.getElementById('vista-recorrido').addEventListener('click', (e) => { if (e.target.closest('[data-recorrido-salir]')) salir(); });
  document.addEventListener('click', (e) => { if (e.target.closest('[data-presentar]')) presentar(!raiz.classList.contains('be-presentando')); });
  // Deslizar el dedo sobre la ficha en el móvil pasa de parada.
  let x0 = null;
  const cuerpo = document.getElementById('panel-cuerpo');
  cuerpo.addEventListener('touchstart', (e) => { x0 = R.id ? e.touches[0].clientX : null; }, { passive: true });
  cuerpo.addEventListener('touchend', (e) => { if (x0 == null) return; const dx = e.changedTouches[0].clientX - x0; if (Math.abs(dx) > 70) irA(R.paso + (dx < 0 ? 1 : -1)); x0 = null; });
  const map = BE.mapa.gl;
  if (map) map.once('load', () => { if (R.id) marcas(); });
}
/** «Salir y explorar»: deja la fecha y el mapa como están y quita la selección. Al volver se retoma la parada. */
function salir() {
  guardar();
  parar();
  BE.seleccionar(null, { mover: false, encuadrar: false });
}
BE.inicios.push(iniciar);
BE.pintores.push(seguirSeleccion);
// La parada solo va en la dirección mientras el recorrido está elegido: al quitarlo (Atrás a la portada, otra
// selección) no se queda colgada hasta el fotograma que lo cierra. Recién elegido, antes de que seguirSeleccion lo
// abra, ya dice la parada en la que va a abrir (la de la dirección, la guardada o la primera): si no, el historial veía
// dos vistas, el recorrido sin parada y la parada, y guardaba dos entradas que se ven igual.
function pasoEscrito() {
  if (E.sel?.tipo !== 'recorrido') return null;
  if (E.sel.id === R.id) return String(R.paso + 1);
  const rc = BE.D && busca(E.sel.id);
  return rc ? String(Math.min(rc.paradas.length - 1, pasoDe(E.sel.id)) + 1) : null;
}
BE.parametros.push({ nombre: 'paso', historia: true, escribir: pasoEscrito,
  leer(v) {
    const n = v ? Math.max(0, (+v || 1) - 1) : null;
    // Se lee al llegar a una entrada: si el recorrido se abre en el fotograma siguiente, su encuadre es el guardado.
    R.marcoLlegada = BE.historia?.marco() ?? null;
    if (R.id && n != null && n !== R.paso) irA(n, { historia: false }); else R.pasoHash = n;
  } });

BE.recorridos = { ficha: fichaRecorrido, irA, pasoDe, salir, presentar, avanzar };
BE.reducido = reducido;
})();
