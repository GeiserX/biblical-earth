// How the map frames what is opened, in a real headless browser with MapLibre loaded. Opening a tour, a journey, a
// person or a place puts all its stops in the part of the map that nothing covers: not under the legend (lower left),
// «Mientras tanto» (upper right), the tour's card (upper left), the map's controls (the buttons at the top right, the
// map modes, the event row and «Leyenda» on the phone) or, on the phone, the sheet. A tour's first stop shows
// the whole tour; a later stop keeps the one before and the one after in view. Each way in is checked: a card of the
// landing, the search box and, for the tour, the size the owner reported (1730 by 1170) and the step after it.
//
// At 1440 by 900 the timeline opens at its normal height; raised (linea=grande) it leaves the map 282 px, the hardest
// case. At 430 the sheet covers the lower half. Those are the sizes where the cards covered the stops.
//
// Run from the repository root, one browser at a time:
//   node --test --test-concurrency=1 tests/site/map-frame.test.mjs
// Needs network access for MapLibre (unpkg.com) and playwright-core with a Chromium: either importable, or
// PLAYWRIGHT_MODULE_DIR=<a node_modules directory that holds it>. CHROME_PATH picks another Chromium binary. It uses
// site/data.json when it exists, BE_DATA_FILE=<data.json> when given, or builds the data into a temporary directory.
// BE_ROOT=<a checkout> tests that checkout's site (the control: on main before this change, the tour, the place and the
// journey fail at 1440 and the tour fails at 430 and at 1730).
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
const WIDE = { name: '1730', viewport: { width: 1730, height: 1170 } };
const DESKTOP = { name: '1440', viewport: { width: 1440, height: 900 } };
const PHONE = { name: '430', viewport: { width: 430, height: 932 }, isMobile: true, hasTouch: true };

async function loadChromium() {
  for (const name of ['playwright-core', 'playwright']) {
    try { return (await import(name)).chromium; } catch { /* next */ }
    if (process.env.PLAYWRIGHT_MODULE_DIR) {
      try { return createRequire(path.join(path.resolve(process.env.PLAYWRIGHT_MODULE_DIR), 'index.js'))(name).chromium; } catch { /* next */ }
    }
  }
  throw new Error('playwright-core not found: install it or set PLAYWRIGHT_MODULE_DIR to a node_modules directory that holds it');
}

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.webp': 'image/webp' };
function serve(siteDir, dataFile) {
  const server = http.createServer((req, res) => {
    const rel = decodeURIComponent(new URL(req.url, 'http://x').pathname).slice(1) || 'index.html';
    const file = rel === 'data.json' ? dataFile : path.join(siteDir, rel);
    if (file !== dataFile && !file.startsWith(siteDir)) { res.writeHead(403).end(); return; }
    fs.readFile(file, (err, body) => {
      if (err) { res.writeHead(404).end(); return; }
      res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' }).end(body);
    });
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}

let browser, server, base, tmp;
before(async () => {
  const site = path.join(ROOT, 'site');
  let data = process.env.BE_DATA_FILE ? path.resolve(process.env.BE_DATA_FILE) : path.join(site, 'data.json');
  if (!fs.existsSync(data)) {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'be-map-frame-'));
    execFileSync('python3', [path.join(ROOT, 'scripts/build.py'), '--salida', tmp], { cwd: ROOT, stdio: 'pipe' });
    data = path.join(tmp, 'data.json');
  }
  server = await serve(site, data);
  base = `http://127.0.0.1:${server.address().port}/`;
  const chromium = await loadChromium();
  browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH || undefined, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
});
after(async () => {
  await browser?.close();
  server?.close();
  if (tmp) fs.rmSync(tmp, { recursive: true, force: true });
});

async function open(screen, hash = '') {
  const context = await browser.newContext({ deviceScaleFactor: 1, ...screen });
  context.setDefaultTimeout(30000);
  const page = await context.newPage();
  page.pageErrors = [];
  page.on('pageerror', (e) => page.pageErrors.push(e.message));
  await page.route((u) => !u.href.startsWith(base) && !u.hostname.endsWith('unpkg.com'), (r) => r.abort());
  await page.goto(`${base}index.html${hash ? `#${hash}` : ''}`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.BE?.D && window.__be, null, { timeout: 60000 });
  return page;
}
/** The map has loaded and stopped: a frame asked for at load (encuadrarAlCargar) has ended too. */
async function still(page) {
  await page.waitForFunction(() => { const m = window.__be?.map; return !!m && m.loaded() && !m.isMoving(); }, null, { timeout: 60000 });
  await page.waitForTimeout(1000);
  await page.waitForFunction(() => !window.__be.map.isMoving(), null, { timeout: 60000 });
}
/** Clicks a link of the landing, as a person does, with the map in whatever state it is. */
async function fromLanding(screen, href) {
  const page = await open(screen);
  await page.evaluate((h) => document.querySelector(`#vista-portada a[href="${h}"]`).click(), href);
  await still(page);
  return page;
}
async function fromSearch(screen, text) {
  const page = await open(screen, 't=50.3000');
  await still(page);
  await page.locator('#q').fill(text);
  await page.waitForFunction((t) => { const r = document.querySelector('#resultados'); return !r.hidden && r.innerText.includes(t); }, text);
  await page.keyboard.press('Enter');
  await still(page);
  return page;
}

/** The stops that the selection must show, and the ones that are off the map or under a card. A tour's are the places
    of all its stops on the first one, and of the stop and its neighbours on the others; a place's, itself; a person's,
    where the data put them up to ten years around the cursor; anything else's, the places it involves. Regions and
    zones count only when nothing else is left, as on the map. */
const hidden = (page) => page.evaluate(() => {
  const { BE } = window.__be, E = BE.E, m = window.__be.map, sel = E.sel;
  const c = m.getContainer().getBoundingClientRect();
  const cards = ['#leyenda', '#mientras', '#vista-recorrido > *', '#vista-ahora', '#situacion', '#mapa .maplibregl-ctrl-top-right', '.modos', '#tira-suceso', '#leyenda-boton', ...(innerWidth <= 760 ? ['#panel', '#vista-lectura'] : [])]
    .flatMap((q) => [...document.querySelectorAll(q)]).filter((el) => !el.hidden && el.offsetParent)
    .map((el) => ({ el, r: el.getBoundingClientRect() }));
  const places = (p) => { const s = BE.parseSel(p?.sel); return !s ? [] : s.tipo === 'lugar' ? [s.id] : [...BE.implicados(s).lugares]; };
  let ids;
  if (sel.tipo === 'recorrido') {
    const rc = BE.D.recorridos.find((r) => r.id === sel.id), i = BE.recorridos.pasoDe(sel.id);
    ids = (i === 0 ? rc.paradas : [rc.paradas[i - 1], rc.paradas[i], rc.paradas[i + 1]]).flatMap(places);
  } else if (sel.tipo === 'lugar') ids = [sel.id];
  else if (sel.tipo === 'persona') {
    const t = E.t, a = Math.min(t, Math.max(E.vista[0], t - 10)), b = Math.max(t, Math.min(E.vista[1], t + 10));
    ids = BE.estancias(sel.id).filter((e) => e.lugar?.id && e.b >= a && e.a <= b).map((e) => e.lugar.id);
  } else ids = [...E.resaltado.lugares];
  ids = [...new Set(ids)].filter((id) => BE.L[id]?.lat != null);
  const REGION = ['region', 'provincia', 'pais', 'reino', 'desierto', 'llanura', 'valle'];
  const towns = ids.filter((id) => !REGION.includes(BE.L[id].tipo) && BE.L[id].precision !== 'zona');
  if (towns.length && sel.tipo !== 'persona') ids = towns;
  const out = [];
  for (const id of ids) {
    const p = m.project([BE.L[id].lon, BE.L[id].lat]), x = c.left + p.x, y = c.top + p.y;
    if (x < c.left || x > c.right || y < c.top || y > c.bottom) { out.push(`${id} off the map`); continue; }
    const under = cards.find(({ r }) => x >= r.left && x <= r.right && y >= r.top && y <= r.bottom);
    if (under) out.push(`${id} under ${under.el.id || [...under.el.classList].find((k) => k !== 'be-float') || under.el.tagName}`);
  }
  return { sel: BE.selTexto(sel), n: ids.length, out, zoom: +m.getZoom().toFixed(2), map: `${Math.round(c.width)}x${Math.round(c.height)}` };
});
async function assertFramed(page, what) {
  const r = await hidden(page);
  console.log(`${what}: ${r.sel}, ${r.n} stops, zoom ${r.zoom}, map ${r.map}${r.out.length ? `, hidden: ${r.out.join(', ')}` : ''}`);
  assert.ok(r.n > 0, `${what}: nothing to check`);
  assert.deepEqual(r.out, [], `${what}: stops off the map or under a card at zoom ${r.zoom}, map ${r.map}`);
  assert.deepEqual(page.pageErrors, []);
  return r;
}

const TOUR = 'sel=recorrido:de-babilonia-a-jerusalen&paso=1';
const LANDING = [
  ['the tour «De Babilonia a Jerusalén»', `#${TOUR}`],
  ['the place card, Jerusalén in 520 a.e.c.', '#sel=lugar:jerusalen&t=-518.5000'],
  ['the question about Babilonia in 30 e.c.', '#sel=lugar:babilonia&t=30.5000'],
  ['the example Pedro, a person', '#sel=persona:pedro'],
  ['the question about the letters', '#sel=carta:1-tesalonicenses&cartas=todas'],
];

test('each card of the landing opens with every stop clear of the cards, at 1440 by 900 and at 430', async () => {
  for (const screen of [DESKTOP, PHONE]) {
    for (const [what, href] of LANDING) {
      const page = await fromLanding(screen, href);
      await assertFramed(page, `${screen.name}, landing, ${what}`);
      await page.context().close();
    }
  }
});

test('the tour the owner opened, at 1730 by 1170, shows Babilonia and Jerusalén clear of the cards', async () => {
  const page = await fromLanding(WIDE, `#${TOUR}`);
  const r = await assertFramed(page, '1730, landing, the tour');
  // The same tour from a shared link frames the same way: a link without a frame of its own is a fresh open.
  const shared = await open(WIDE, `t=-605.4422&v=40&${TOUR}&mapa=antiguo`);
  await still(shared);
  const s = await assertFramed(shared, '1730, shared link to the tour');
  assert.ok(Math.abs(s.zoom - r.zoom) < 0.3, `the shared link opens at zoom ${s.zoom}, the landing at ${r.zoom}`);
  await page.context().close();
  await shared.context().close();
});

test('a tour and a journey from the search box frame all their stops; the next stop keeps its neighbours in view', async () => {
  for (const screen of [DESKTOP, PHONE]) {
    const page = await fromSearch(screen, 'De Babilonia a Jerusalén');
    await assertFramed(page, `${screen.name}, search, the tour`);
    // Stop 2, the fall of Babilonia, is Babilonia alone: Jerusalén, where stop 1 was, stays in view.
    await page.evaluate(() => window.BE.recorridos.avanzar(1));
    await still(page);
    assert.equal(await page.evaluate(() => window.BE.recorridos.pasoDe('de-babilonia-a-jerusalen')), 1);
    await assertFramed(page, `${screen.name}, the tour's stop 2`);
    await page.context().close();
    const journey = await fromSearch(screen, 'Primer viaje');
    await assertFramed(journey, `${screen.name}, search, a journey`);
    await journey.context().close();
  }
});

test('the tour with the strip raised at 1440, and an event chosen on the timeline on the phone, keep every stop clear', async () => {
  // Raised by hand (T or linea=grande) the map is 282 px tall: the stops go above the legend or between the cards.
  const tall = await open(DESKTOP, `t=-605.4422&v=40&${TOUR}&linea=grande`);
  await still(tall);
  await assertFramed(tall, '1440, strip raised, the tour');
  await tall.context().close();
  // On the phone, «Babilonia destruye Jerusalén» pressed on the timeline put Babilonia under the map's buttons.
  const page = await open(PHONE, 't=-605.4422&v=40');
  await still(page);
  const id = await page.evaluate(() => { const m = window.BE.lineaMarcas().find((q) => q.name === 'Babilonia destruye Jerusalén'); document.querySelector('#linea-cuerpo').scrollTop = Math.max(0, m.top - 60); return m.id; });
  // The lanes draw only the marks near what is in view: wait for this one after scrolling to it.
  await page.waitForFunction((i) => document.querySelector(`#linea-filas .m[data-id="${CSS.escape(i)}"]`), id);
  const [x, y] = await page.evaluate((i) => { const r = document.querySelector(`#linea-filas .m[data-id="${CSS.escape(i)}"] .m-nombre .t`).getBoundingClientRect(); return [r.left + Math.min(r.width / 2, 20), r.top + r.height / 2]; }, id);
  await page.touchscreen.tap(x, y);
  await still(page);
  assert.equal(await page.evaluate(() => window.BE.selTexto(window.BE.E.sel)), 'evento:destruccion-de-jerusalen-607');
  await assertFramed(page, '430, an event pressed on the timeline');
  await page.context().close();
});

test('430: in reading mode the passage chosen is framed above the reading sheet, not under it', async () => {
  // The reading sheet takes 46 % of the screen, more than the 60 % of the map the margin was capped at: the lower part
  // of the sheet covered what was framed.
  const page = await open(PHONE, 'leer=hch-16');
  await still(page);
  await page.waitForFunction(() => !document.querySelector('#vista-lectura')?.hidden && document.querySelector('[data-lectura-pasaje]'));
  for (const i of [0, 3]) {
    await page.evaluate((k) => document.querySelector(`[data-lectura-pasaje="${k}"]`).click(), i);
    await still(page);
    await assertFramed(page, `430, reading Hechos 16, passage ${i + 1}`);
  }
  await page.context().close();
});
