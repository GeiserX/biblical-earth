// Zone shapes on the map, in a real headless browser. A place with a point and a `shape` (Canaán, Galilea) draws its
// outline only while it is selected or highlighted, on a layer that takes no click, and the map frames the whole shape;
// a place without one draws nothing there. A candidate zone with a shape (the desert of Judah) draws its ellipse
// instead of its circle. The place card says what the shape is and where it comes from, and the outline takes its
// colour from --tier1, so the meeting theme repaints it. Framing a shape zooms in on a small one and, at 1440 by 900,
// keeps a big one on the map and clear of the legend; an uncertain place and its focused candidate frame the shape's
// box. The shape comes back after a style reload, the curtain sits under it, a letter destination with a shape draws
// it, and the card links the shape's sources.
//
// Run from the repository root, one browser at a time:
//   node --test --test-concurrency=1 tests/site/map-shapes.test.mjs
// Needs python3 with requirements.txt (the data is built into a temporary directory), network access for MapLibre
// (unpkg.com) and playwright-core with a Chromium: either importable, or PLAYWRIGHT_MODULE_DIR=<a node_modules directory
// that holds it>. CHROME_PATH picks another Chromium binary. BE_ROOT=<a checkout> tests that checkout's site instead of
// this one (the control: on a checkout without shapes, every test fails).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = process.env.BE_ROOT ? path.resolve(process.env.BE_ROOT) : path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const PHONE = { width: 430, height: 932, touch: true };
const DESKTOP = { width: 1440, height: 900, touch: false };

async function loadChromium() {
  for (const name of ['playwright-core', 'playwright']) {
    try { return (await import(name)).chromium; } catch { /* next */ }
    if (process.env.PLAYWRIGHT_MODULE_DIR) {
      try { return createRequire(path.join(path.resolve(process.env.PLAYWRIGHT_MODULE_DIR), 'index.js'))(name).chromium; } catch { /* next */ }
    }
  }
  throw new Error('playwright-core not found: install it or set PLAYWRIGHT_MODULE_DIR to a node_modules directory that holds it');
}

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf', '.pbf': 'application/x-protobuf', '.webp': 'image/webp', '.jpg': 'image/jpeg' };
function serve(siteDir, dataDir) {
  const server = http.createServer((req, res) => {
    const url = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    const rel = url === '/' ? 'index.html' : url.slice(1);
    const file = ['data.json', 'data.js'].includes(rel) ? path.join(dataDir, rel) : path.join(siteDir, rel);
    if (!file.startsWith(siteDir) && !file.startsWith(dataDir)) { res.writeHead(403).end(); return; }
    fs.readFile(file, (err, body) => {
      if (err) { res.writeHead(404).end(); return; }
      res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' }).end(body);
    });
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}

let browser, server, base, tmp;
before(async () => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'be-map-shapes-'));
  execFileSync('python3', [path.join(ROOT, 'scripts/build.py'), '--salida', tmp], { cwd: ROOT, stdio: 'pipe' });
  server = await serve(path.join(ROOT, 'site'), tmp);
  base = `http://127.0.0.1:${server.address().port}/index.html`;
  const chromium = await loadChromium();
  browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH || undefined });
});
after(async () => {
  await browser?.close();
  server?.close();
  if (tmp) fs.rmSync(tmp, { recursive: true, force: true });
});

/** A page with the data and the map loaded. Tiles from other hosts are not needed; MapLibre from unpkg is. */
async function openMap(screen = DESKTOP, hash = 't=50.5') {
  const context = await browser.newContext({ viewport: { width: screen.width, height: screen.height }, deviceScaleFactor: 1, isMobile: screen.touch, hasTouch: screen.touch });
  const page = await context.newPage();
  page.setDefaultTimeout(8000);
  page.pageErrors = [];
  page.on('pageerror', (e) => page.pageErrors.push(e.message));
  const local = base.slice(0, base.lastIndexOf('/'));
  await page.route((url) => !url.href.startsWith(local) && !url.hostname.endsWith('unpkg.com'), (route) => route.abort());
  await page.goto(`${base}#${hash}`);
  await page.waitForFunction(() => window.__be?.map?.loaded?.() && window.__be.map.getSource('be-rastro') && document.querySelector('.maplibregl-marker'), null, { timeout: 30000 });
  await page.waitForTimeout(300);
  return page;
}

/** Selects, waits two frames and reads what the shape sources draw, the legend, the card and the map's bounds. */
function shapesAt(page, sel) {
  return page.evaluate(async (sel) => {
    const { map, seleccionar } = window.__be;
    seleccionar(sel, { mover: false });
    await new Promise((r) => setTimeout(r, 900));
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const formas = map.getSource('be-formas') ? (await map.getSource('be-formas').getData()).features : null;
    const zonas = (await map.getSource('be-zonas').getData()).features;
    const b = map.getBounds();
    return {
      formas: formas && formas.map((f) => ({ lugar: f.properties.lugar, color: f.properties.color, n: f.geometry.coordinates[0].length })),
      zonas: zonas.map((f) => ({ lugar: f.properties.lugar, ring: f.geometry.coordinates[0] })),
      leyenda: document.querySelector('#leyenda')?.textContent.replace(/\s+/g, ' ').trim() ?? '',
      ficha: document.querySelector('#panel-cuerpo')?.textContent.replace(/\s+/g, ' ').trim() ?? '',
      caja: [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()],
    };
  }, sel);
}
const dentro = ([o, s, e, n], [lat, lon]) => lon >= o && lon <= e && lat >= s && lat <= n;

test('a place with a shape draws it while selected, frames all of it and its card says what it is', async () => {
  for (const screen of [DESKTOP, PHONE]) {
    const page = await openMap(screen, 't=-1900');
    const d = await shapesAt(page, { tipo: 'lugar', id: 'canaan' });
    assert.deepEqual(d.formas?.map((f) => `${f.lugar}:${f.n}`), ['canaan:12'], `${screen.width}px: Canaán draws its 11-vertex outline`);
    // Sidón (north) and Gaza (south-west) are both in view: the frame is the shape, not the point in Galilea.
    assert.ok(dentro(d.caja, [33.561, 35.372]) && dentro(d.caja, [31.504, 34.464]), `${screen.width}px: Sidón and Gaza in view, bounds ${d.caja}`);
    assert.match(d.ficha, /Qué abarca/);
    assert.match(d.ficha, /contorno de 11 vértices, por Sidón, Dan y Gaza/);
    assert.match(d.ficha, /no es una frontera trazada/);
    assert.match(d.leyenda, /Lo que abarca una región/);
    const g = await shapesAt(page, { tipo: 'lugar', id: 'galilea' });
    assert.deepEqual(g.formas?.map((f) => `${f.lugar}:${f.n}`), ['galilea:5']);
    assert.match(g.ficha, /rectángulo de unos 40 km de este a oeste y 60 de norte a sur/);
    const j = await shapesAt(page, { tipo: 'lugar', id: 'jerusalen' });
    assert.deepEqual(j.formas, [], 'a city without a shape draws none');
    assert.doesNotMatch(j.leyenda, /Lo que abarca una región/);
    assert.deepEqual(page.pageErrors, []);
    await page.context().close();
  }
});

test('the shape takes no click: a click inside Canaán, highlighted by an event, leaves the event selected', async () => {
  // With the uncertain places and the journeys hidden, nothing else on the map takes the click.
  const page = await openMap(DESKTOP, 't=-1465.5&ocultas=inciertos,viajes,cartas');
  const sel = { tipo: 'evento', id: 'conquista-de-canaan' };
  const d = await shapesAt(page, sel);
  assert.ok(d.formas?.some((f) => f.lugar === 'canaan'), `the event highlights Canaán and draws its shape: ${JSON.stringify(d.formas)}`);
  const capas = await page.evaluate(() => window.__be.map.getStyle().layers.map((l) => l.id));
  assert.ok(capas.indexOf('be-formas-relleno') < capas.indexOf('be-zonas-relleno'), 'the shape sits under the candidate zones');
  // Closer in, a pixel inside the outline with the bare map under it: no place name, no candidate zone, no route.
  const xy = await page.evaluate(async () => {
    const { map } = window.__be;
    map.jumpTo({ center: [35.0, 32.3], zoom: 9 });
    await new Promise((r) => map.once('idle', r));
    const clic = ['be-zonas-relleno', 'be-rastro-toque', 'be-cartas-toque', 'be-hecho', 'be-falta'].filter((id) => map.getLayer(id));
    // queryRenderedFeatures counts from the map's corner; elementFromPoint and the mouse, from the page's.
    const caja = map.getContainer().getBoundingClientRect();
    for (let y = 100; y < caja.height - 100; y += 30) for (let x = 100; x < caja.width - 100; x += 30) {
      const el = document.elementFromPoint(caja.left + x, caja.top + y);
      if (el?.tagName === 'CANVAS' && !map.queryRenderedFeatures([x, y], { layers: clic }).length
        && map.queryRenderedFeatures([x, y], { layers: ['be-formas-relleno'] }).length) return [caja.left + x, caja.top + y];
    }
    return null;
  });
  assert.ok(xy, 'found a bare pixel inside the shape');
  await page.mouse.click(xy[0], xy[1]);
  await page.waitForTimeout(400);
  const ahora = await page.evaluate(() => window.__be.E.sel);
  assert.deepEqual({ tipo: ahora?.tipo, id: ahora?.id }, sel, 'the click went through the shape: the event is still selected');
  assert.deepEqual(page.pageErrors, []);
  await page.context().close();
});

test('a candidate zone with a shape draws its ellipse instead of its circle', async () => {
  const page = await openMap(DESKTOP, 't=29.5');
  const d = await shapesAt(page, { tipo: 'lugar', id: 'desierto-de-juda' });
  const z = d.zonas.find((x) => x.lugar === 'desierto-de-juda');
  assert.ok(z, 'the desert draws a zone');
  const lats = z.ring.map((p) => p[1]), lons = z.ring.map((p) => p[0]);
  const alto = (Math.max(...lats) - Math.min(...lats)) * 111.2, ancho = (Math.max(...lons) - Math.min(...lons)) * 111.2 * Math.cos(31.4 * Math.PI / 180);
  // 80 km along the Dead Sea and 20 across, not a 40 km circle (80 by 80).
  assert.ok(alto > 75 && alto < 85 && ancho < 30, `ellipse of ${alto.toFixed(1)} by ${ancho.toFixed(1)} km`);
  assert.match(d.ficha, /zona dibujada como una elipse de unos 80 × 20 km/);
  assert.deepEqual(page.pageErrors, []);
  await page.context().close();
});

test('the meeting theme repaints the outline with its own --tier1', async () => {
  const page = await openMap(DESKTOP, 't=-1900');
  const claro = await shapesAt(page, { tipo: 'lugar', id: 'canaan' });
  await page.evaluate(() => window.__be.BE.ponerPreferencia('reunion', true));
  const oscuro = await shapesAt(page, { tipo: 'lugar', id: 'canaan' });
  const tier1 = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--tier1').trim());
  assert.notEqual(claro.formas[0].color, oscuro.formas[0].color);
  assert.equal(oscuro.formas[0].color, tier1);
  await page.evaluate(() => window.__be.BE.ponerPreferencia('reunion', false));
  assert.deepEqual(page.pageErrors, []);
  await page.context().close();
});

/** Selects and lets the map frame the selection (mover: true), then reads the zoom and the shape's screen box. */
function frameAt(page, sel) {
  return page.evaluate(async (sel) => {
    const { map, seleccionar, BE } = window.__be;
    seleccionar(sel, { mover: true });
    await new Promise((r) => setTimeout(r, 1500));
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const c = map.getContainer().getBoundingClientRect(), ley = document.querySelector('#leyenda');
    const lb = ley && ley.offsetParent ? ley.getBoundingClientRect() : null;
    const bbox = BE.L[sel.id]?.shape?.bbox || BE.L[sel.id]?.candidatos?.[0]?.shape?.bbox;
    let tapados = 0;
    if (bbox) {
      const a = map.project([bbox[0][0], bbox[1][1]]), b = map.project([bbox[1][0], bbox[0][1]]);
      // 121 points across the shape's box: each must be on the map and not under the legend.
      for (let i = 0; i <= 10; i++) for (let j = 0; j <= 10; j++) {
        const x = c.left + a.x + (b.x - a.x) * i / 10, y = c.top + a.y + (b.y - a.y) * j / 10;
        const fuera = x < c.left || x > c.right || y < c.top || y > c.bottom;
        if (fuera || (lb && x >= lb.left && x <= lb.right && y >= lb.top && y <= lb.bottom)) tapados++;
      }
    }
    return { zoom: map.getZoom(), tapados, caja: bbox && [map.project(bbox[0]), map.project(bbox[1])].map((p) => [Math.round(p.x), Math.round(p.y)]).join(' ') };
  }, sel);
}

test('framing a shape: a small one zooms in, and at 1440 a big one stays on the map and clear of the legend', async () => {
  // The strip raised (linea=grande): at 1440 by 900 the map is 282 px tall, the hardest case.
  const page = await openMap(DESKTOP, 't=29.5&linea=grande');
  // Genesaret is 5 by 2.5 km: framed by its shape, not by the region zoom of its point (5.5).
  const g = await frameAt(page, { tipo: 'lugar', id: 'genesaret' });
  assert.ok(g.zoom >= 9, `Genesaret framed at zoom ${g.zoom.toFixed(2)}`);
  // With the strip raised at 1440 by 900 the map is 282 px tall and the legend fills its lower left: Canaán goes to the
  // right of the legend, no further out than the zoom of its point.
  await page.evaluate(() => window.__be.setT(-1467.5));
  const c = await frameAt(page, { tipo: 'lugar', id: 'canaan' });
  assert.equal(c.tapados, 0, `points of Canaán's box off the map or under the legend: ${c.tapados}/121`);
  assert.ok(c.zoom >= 5.49, `Canaán framed at zoom ${c.zoom.toFixed(2)}`);
  // The same for an uncertain place whose candidate has a shape.
  await page.evaluate(() => window.__be.setT(-1431));
  const b = await frameAt(page, { tipo: 'lugar', id: 'benjamin' });
  assert.equal(b.tapados, 0, `points of Benjamín's box off the map or under the legend: ${b.tapados}/121 at zoom ${b.zoom.toFixed(2)}, box ${b.caja}`);
  assert.deepEqual(page.pageErrors, []);
  await page.context().close();
});

test('an uncertain place frames its candidate shape, and focusing the candidate frames that shape too', async () => {
  const page = await openMap(DESKTOP, 't=-1440.5');
  const r = await page.evaluate(async () => {
    const { map, seleccionar, BE } = window.__be;
    const cajas = [];
    const cam = map.cameraForBounds.bind(map), fit = map.fitBounds.bind(map);
    map.cameraForBounds = (b, o) => { cajas.push(['camara', JSON.parse(JSON.stringify(b))]); return cam(b, o); };
    map.fitBounds = (b, o) => { cajas.push(['encuadre', JSON.parse(JSON.stringify(b))]); return fit(b, o); };
    seleccionar({ tipo: 'lugar', id: 'benjamin' }, { mover: true });
    await new Promise((res) => setTimeout(res, 1200));
    const n = cajas.length;
    document.querySelector('#panel-cuerpo [data-cand="benjamin|0"]').click();
    await new Promise((res) => setTimeout(res, 1200));
    return { bbox: BE.L.benjamin.candidatos[0].shape.bbox, alSeleccionar: cajas.slice(0, n), alEnfocar: cajas.slice(n) };
  });
  const igual = (b) => b && b.flat().every((v, k) => Math.abs(v - r.bbox.flat()[k]) < 1e-6);
  assert.ok(r.alSeleccionar.some(([, b]) => igual(b)), `selecting Benjamín frames its polygon's box ${JSON.stringify(r)}`);
  assert.ok(r.alEnfocar.some(([k, b]) => k === 'encuadre' && igual(b)), `focusing the candidate frames its polygon's box ${JSON.stringify(r.alEnfocar)}`);
  assert.deepEqual(page.pageErrors, []);
  await page.context().close();
});

test('the shape survives a reload of the map style, and the curtain puts its images under it', async () => {
  const page = await openMap(DESKTOP, 't=-1900');
  await shapesAt(page, { tipo: 'lugar', id: 'canaan' });
  // A new style (OpenFreeMap failing over to our relief does this) drops every source: montarCapas must draw it again.
  const tras = await page.evaluate(async () => {
    const { map } = window.__be;
    const st = map.getStyle();
    st.layers = st.layers.filter((l) => !l.id.startsWith('be-'));
    for (const k of Object.keys(st.sources)) if (k.startsWith('be-')) delete st.sources[k];
    map.setStyle(st, { diff: false });
    await new Promise((r) => setTimeout(r, 1500));
    return (await map.getSource('be-formas').getData()).features.map((f) => f.properties.lugar);
  });
  assert.deepEqual(tras, ['canaan'], 'Canaán is drawn again after the style reload');
  const capas = await page.evaluate(async () => {
    const { map, ponerMapa } = window.__be;
    ponerMapa('cortina');
    for (let i = 0; i < 50 && !map.getStyle().layers.some((l) => l.id.startsWith('be-cortina-')); i++) await new Promise((r) => setTimeout(r, 200));
    return map.getStyle().layers.map((l) => l.id);
  });
  const cortinas = capas.filter((id) => id.startsWith('be-cortina-'));
  assert.ok(cortinas.length, 'the curtain mounted its layers');
  for (const id of cortinas) assert.ok(capas.indexOf(id) < capas.indexOf('be-formas-relleno'), `${id} sits under the shape`);
  assert.deepEqual(page.pageErrors, []);
  await page.context().close();
});

test('a letter destination with a shape draws the shape instead of the fixed circle', async () => {
  const page = await openMap(DESKTOP, 't=55.5');
  const r = await page.evaluate(async () => {
    const { map, seleccionar, setT, BE } = window.__be;
    const leer = async () => (await map.getSource('be-zonas-carta').getData()).features.map((f) => f.geometry.coordinates[0].length);
    // A fixture: every zone with a point gets a triangle around it, so a destination drawn from its shape has 4 points.
    for (const l of Object.values(BE.L)) {
      if (l.lat == null || l.shape || l.candidatos) continue;
      const ring = [[l.lon - 0.3, l.lat - 0.2], [l.lon + 0.3, l.lat - 0.2], [l.lon, l.lat + 0.3], [l.lon - 0.3, l.lat - 0.2]];
      l.shape = { type: 'polygon', vertices: ring.slice(0, 3).map(([x, y]) => [y, x]), ring, bbox: [[l.lon - 0.3, l.lat - 0.2], [l.lon + 0.3, l.lat + 0.3]] };
    }
    for (const t of [55.5, 50.5, 57.5, 60.5, 62.5]) {
      setT(t);
      seleccionar({ tipo: 'lugar', id: 'jerusalen' }, { mover: false });
      await new Promise((res) => setTimeout(res, 700));
      const n = await leer();
      if (n.length) return n;
    }
    return [];
  });
  assert.ok(r.length, 'some letter destination drew a zone');
  assert.ok(r.every((n) => n === 4), `every letter zone is the fixture's triangle: ${r}`);
  assert.deepEqual(page.pageErrors, []);
  await page.context().close();
});

test('the card shows the sources of a shape, on a place and on a candidate', async () => {
  const page = await openMap(DESKTOP, 't=-1440.5');
  const r = await page.evaluate(async () => {
    const { seleccionar } = window.__be;
    const enlaces = (el) => [...(el?.querySelectorAll('details.insignia a') || [])].map((a) => a.getAttribute('href'));
    seleccionar({ tipo: 'lugar', id: 'canaan' }, { mover: false });
    await new Promise((res) => setTimeout(res, 600));
    const sec = [...document.querySelectorAll('#panel-cuerpo .ficha-sec')].find((s) => /Qué abarca/.test(s.textContent));
    seleccionar({ tipo: 'lugar', id: 'benjamin' }, { mover: false });
    await new Promise((res) => setTimeout(res, 600));
    const li = document.querySelector('#panel-cuerpo [data-cand="benjamin|0"]')?.closest('li');
    return { canaan: enlaces(sec), benjamin: enlaces(li), fila: li?.textContent.replace(/\s+/g, ' ') ?? '' };
  });
  assert.ok(r.canaan.some((u) => /N%C3%BAmeros\/34|numeros\/34/i.test(u)), `«Qué abarca» links Números 34: ${r.canaan}`);
  assert.ok(r.benjamin.some((u) => /Josu%C3%A9\/18/.test(u)), `the candidate links Josué 18, a source of its shape: ${r.benjamin}`);
  assert.match(r.fila, /Forma: Perspicacia «Benjamín»/);
  assert.deepEqual(page.pageErrors, []);
  await page.context().close();
});
