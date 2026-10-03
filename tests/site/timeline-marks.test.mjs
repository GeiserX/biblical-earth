// The timeline strip in a real headless browser: every mark in view shows its whole name, never covered and never cut;
// clicking a mark selects it and puts the cursor at the pointed moment without moving the scale, the view or the lanes,
// and clicking the selected mark again releases it;
// no label says «cálculo»; dragging moves time, the ruler moves the cursor, the wheel zooms at the pointer and the lanes
// scroll with the wheel over their names or a vertical drag; person lanes
// follow the same rule; selecting a period does not reframe the view; the map follows the cursor.
//
// It walks six scales around three dates (50 e.c., the last Passover in 33 e.c., 1513 a.e.c.) at 1440x900 with a mouse
// and at 430x900 with touch, and prints what it measured.
//
// Run from the repository root, one browser at a time:
//   node --test --test-concurrency=1 tests/site/timeline-marks.test.mjs
// Needs python3 with requirements.txt (the data is built into a temporary directory) and playwright-core with a
// Chromium: either importable, or PLAYWRIGHT_MODULE_DIR=<a node_modules directory that holds it>. CHROME_PATH picks
// another Chromium binary. BE_ROOT=<a checkout> tests that checkout's data and site instead of this one (the control:
// on a checkout from before this timeline, the click and period tests fail).
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
const DESKTOP = { name: '1440', viewport: { width: 1440, height: 900 } };
const PHONE = { name: '430', viewport: { width: 430, height: 900 }, isMobile: true, hasTouch: true };
const SCALES = [4125, 400, 40, 8, 1.5, 0.12];
const DAY = 1 / 365.2425;

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
const errors = [], failed = [], external = [];
const report = [];
const note = (s) => { report.push(s); console.log(s); };
async function open(screen, hash = 't=50.5&v=8') {
  const context = await browser.newContext({ deviceScaleFactor: 1, ...screen });
  const p = await context.newPage();
  p.on('pageerror', (e) => errors.push(`${screen.name} pageerror: ${e.message}`));
  p.on('console', (m) => { if (m.type() === 'error' && !/GPU stall|GL Driver Message|ReadPixels/.test(m.text())) errors.push(`${screen.name} console: ${m.text()}`); });
  p.on('requestfailed', (r) => (r.url().startsWith(base.replace(/index\.html$/, '')) ? failed : external).push(`${r.url()} ${r.failure()?.errorText}`));
  p.on('response', (r) => { if (r.status() >= 400 && r.url().startsWith(base.replace(/index\.html$/, ''))) failed.push(`${r.url()} ${r.status()}`); });
  await p.goto(`${base}#${hash}`);
  await p.waitForFunction(() => window.BE?.lineaMarcas && document.querySelector('#linea-filas .m'), null, { timeout: 25000 });
  await frames(p);
  return p;
}
const frames = (p, n = 3) => p.evaluate((k) => new Promise((r) => { const go = (i) => (i ? requestAnimationFrame(() => go(i - 1)) : r()); go(k); }), n);

/** Puts the cursor at t and the view around it (the cursor at 40 %), scrolled to the top, as «Ir a» does. */
async function goTo(p, t, span) {
  await p.evaluate(([t, s]) => {
    const BE = window.BE;
    BE.limpiarSeleccion();
    BE.setT(t);
    const v0 = Math.max(BE.T_MIN, Math.min(BE.T_MAX - s, t - 0.4 * s));
    BE.E.vista = [v0, v0 + s];
    BE.sucio.linea = true; BE.programar();
    document.querySelector('#linea-cuerpo').scrollTop = 0;
  }, [t, span]);
  await frames(p);
}
const state = (p) => p.evaluate(() => ({ t: window.BE.E.t, vista: [...window.BE.E.vista], sel: window.BE.selTexto(window.BE.E.sel), scroll: document.querySelector('#linea-cuerpo').scrollTop }));

/** Walks the lanes from top to bottom and checks every mark that the page draws: its whole label, inside the track,
    covering no other mark of its row. Returns what it saw and what was wrong. */
function walkLanes(p) {
  return p.evaluate(async () => {
    const cuerpo = document.querySelector('#linea-cuerpo');
    const raf = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const seen = new Map(), problems = [], overLong = new Set();
    const row = parseFloat(getComputedStyle(document.querySelector('#linea-filas')).getPropertyValue('--fila')) || 22;
    for (let y = 0, guard = 0; guard < 400; guard++, y += Math.max(120, cuerpo.clientHeight)) {
      cuerpo.scrollTop = y;
      await raf();
      for (const lane of document.querySelectorAll('#linea-filas .carril:not([hidden])')) {
        const pista = lane.querySelector('.carril-pista'), pr = pista.getBoundingClientRect();
        const marks = [...pista.querySelectorAll(':scope > .m')].map((b) => ({ b, r: b.getBoundingClientRect(), l: b.querySelector('.m-nombre .t').getBoundingClientRect(), id: b.dataset.id, text: b.querySelector('.m-nombre .t').textContent }));
        for (const m of marks) {
          seen.set(m.id, m.text);
          if (m.l.left < pr.left - 2.5 || m.l.right > pr.right + 2.5) problems.push(`${lane.dataset.carril}: «${m.text}» is cut by the track edge (${Math.round(m.l.left - pr.left)}..${Math.round(m.l.right - pr.left)} of ${Math.round(pr.width)})`);
          const dot = m.b.querySelector('.m-punto')?.getBoundingClientRect();
          // A name never covers its own dot. The one case left: on a phone, a name so long that three lines of half the
          // track do not hold it has no side of its dot where it fits whole; it is counted, not hidden.
          if (dot && dot.width && Math.min(m.l.right, dot.right) - Math.max(m.l.left, dot.left) > 1 && Math.min(m.l.bottom, dot.bottom) - Math.max(m.l.top, dot.top) > 1) {
            if (m.l.width - 4 > (pr.width - 24) / 2) overLong.add(m.id); else problems.push(`${lane.dataset.carril}: «${m.text}» covers its own dot`);
          }
          if (m.l.height > row + 1) problems.push(`${lane.dataset.carril}: «${m.text}» is taller (${m.l.height}) than its row (${row})`);
          for (const o of marks) {
            if (o === m || Math.abs(o.r.top - m.r.top) > 1) continue;
            const over = Math.min(m.l.right, o.r.right) - Math.max(m.l.left, o.r.left);
            if (over > 2.5 && (m.l.right <= m.r.right + 3)) problems.push(`${lane.dataset.carril}: «${m.text}» covers «${o.text}» by ${over.toFixed(1)} px`);
          }
        }
      }
      if (y + cuerpo.clientHeight >= cuerpo.scrollHeight) break;
    }
    cuerpo.scrollTop = 0;
    await raf();
    return { seen: [...seen], problems, overLong: overLong.size };
  });
}
/** The label of the lane «Viajes de Pablo»: its name whole, in as many lines as it needs, inside the label, and the label
    inside its lane. Height is measured on boxes: with line height 1 the font's ascent and descent pass the line box
    (scrollHeight 32 for two lines of 30 px with «Letra grande») without any letter being cut. */
async function viajesWhole(p, name, pinned = false) {
  const label = await p.evaluate(() => {
    const l = [...document.querySelectorAll('.carril-rotulo .be-lane-label')].find((x) => x.textContent.trim() === 'Viajes de Pablo');
    const s = l?.querySelector('span');
    if (!s) return null;
    const a = l.getBoundingClientRect(), b = s.getBoundingClientRect(), c = l.closest('.carril').getBoundingClientRect(), lh = parseFloat(getComputedStyle(s).lineHeight);
    return { pinned: !!l.querySelector('.carril-pin.on'), lines: Math.round(b.height / lh), label: Math.round(a.height), cutX: s.scrollWidth > s.clientWidth + 0.5, cutY: l.scrollHeight > l.clientHeight + 1 || b.top < a.top - 0.5 || b.bottom > a.bottom + 0.5 || a.top < c.top - 0.5 || a.bottom > c.bottom + 0.5 };
  });
  note(`${name} «Viajes de Pablo»: ${label ? `${label.lines} line(s) in ${label.label} px${label.pinned ? ', pinned' : ''}${label.cutX || label.cutY ? ', cut' : ', whole'}` : 'no label'}`);
  assert.ok(label && !label.cutX && !label.cutY && label.pinned === pinned, JSON.stringify(label));
}
/** What the timeline says it draws (BE.lineaMarcas) and what a mark in view is, measured from the data alone. */
function hookView(p) {
  return p.evaluate(() => {
    const BE = window.BE, [v0, v1] = BE.E.vista, w = document.querySelector('#pista').clientWidth, ppy = w / (v1 - v0);
    const all = BE.lineaMarcas();
    const lanes = BE.lineaCarriles();
    const missing = [];
    for (const it of all) {
      if (it.visible) continue;
      // A moment whose dot is in view, a bar wholly inside the view however short, or a bar with at least 24 px in view is
      // a mark in view: it must be drawn.
      const inView = it.shape === 'moment' ? it.anchor >= v0 + 6 / ppy && it.anchor <= v1 - 6 / ppy : (it.t0 >= v0 && it.t1 <= v1) || (Math.min(it.t1, v1) - Math.max(it.t0, v0)) * ppy >= 24;
      if (inView) missing.push(`${it.lane}: ${it.name}`);
    }
    return { visible: all.filter((x) => x.visible), missing, lanes, vac: document.querySelector('#linea-vacios').textContent };
  });
}

before(async () => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'be-timeline-marks-'));
  execFileSync('python3', [path.join(ROOT, 'scripts/build.py'), '--out', tmp], { cwd: ROOT, stdio: 'pipe' });
  server = await serve(path.join(ROOT, 'site'), tmp);
  base = `http://127.0.0.1:${server.address().port}/index.html`;
  const chromium = await loadChromium();
  browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH || undefined,
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
});
after(async () => {
  await browser?.close();
  server?.close();
  if (tmp) fs.rmSync(tmp, { recursive: true, force: true });
  console.log(`\nSUMMARY\n${report.join('\n')}\nconsole/page errors: ${errors.length}; failed same-origin requests: ${failed.length}; failed external requests: ${external.length}`);
});

/** The dates of the walk: 50 e.c., the middle of the window of the last Passover (33 e.c.), 1513 a.e.c. */
async function dates(p) {
  const pascua = await p.evaluate(() => { const e = window.BE.D.eventos.find((x) => x.id === 'ultima-pascua'); const v = e && window.BE.ventanaEvento(e); return v ? (v[0] + v[1]) / 2 : 33.25; });
  return [['50 e.c.', 50.5], ['33 e.c.', pascua], ['1513 a.e.c.', -1512.5]];
}

for (const screen of [DESKTOP, PHONE]) {
  test(`${screen.name}: every mark in view has its whole name, uncovered and uncut; no label says «cálculo»`, async () => {
    const p = await open(screen);
    const all = [];
    for (const [dname, t] of await dates(p)) for (const s of SCALES) {
      await goTo(p, t, s);
      const h = await hookView(p);
      const walk = await walkLanes(p);
      const seen = new Map(walk.seen);
      const notDrawn = h.visible.filter((x) => !seen.has(x.id)).map((x) => `${x.lane}: ${x.name}`);
      const wrongText = h.visible.filter((x) => seen.has(x.id) && seen.get(x.id) !== x.label).map((x) => `«${seen.get(x.id)}» should be «${x.label}»`);
      const calc = [...seen.values()].filter((x) => /c[aá]lculo/i.test(x));
      const approx = h.visible.filter((x) => x.cert === 'approx');
      const approxOk = approx.filter((x) => seen.get(x.id)?.endsWith(' aprox.')).length;
      const plainWithTag = h.visible.filter((x) => (x.cert === 'exact' || x.cert === 'computed') && / aprox\.$|¿\?$/.test(seen.get(x.id) || '')).length;
      note(`${screen.name} ${dname} span ${s}: ${h.visible.length} marks in view, ${seen.size} drawn, ${h.missing.length} missing, ${notDrawn.length} not drawn, ${walk.problems.length} overlap/cut, ${walk.overLong} over-long names beside their dot, ${calc.length} «cálculo», ${approxOk}/${approx.length} «aprox.», lanes ${h.lanes.filter((l) => l.alto).length} shown`);
      all.push(...h.missing.map((x) => `${dname} ${s}: missing ${x}`), ...notDrawn.map((x) => `${dname} ${s}: not drawn ${x}`), ...walk.problems.map((x) => `${dname} ${s}: ${x}`),
        ...wrongText.map((x) => `${dname} ${s}: ${x}`), ...calc.map((x) => `${dname} ${s}: says cálculo: ${x}`));
      if (approxOk !== approx.length) all.push(`${dname} ${s}: ${approx.length - approxOk} approximate marks lack «aprox.»`);
      if (plainWithTag) all.push(`${dname} ${s}: ${plainWithTag} exact or calculated marks carry a word`);
      assert.ok(h.visible.length > 0 || s < 1, `${dname} ${s}: nothing in view`);
    }
    await p.context().close();
    assert.deepEqual(all.slice(0, 40), []);
  });

  test(`${screen.name}: clicking a mark keeps the scale, the view and the lanes, and puts the cursor at the pointed moment`, async () => {
    const p = await open(screen);
    const bad = [];
    let clicks = 0;
    for (const [dname, t] of await dates(p)) for (const s of SCALES) {
      await goTo(p, t, s);
      const vis = (await hookView(p)).visible.filter((x) => !x.secular && x.x + x.w > 0 && x.x < 5000).sort((a, b) => a.top - b.top || a.x - b.x);
      const pick = vis.length <= 20 ? vis : Array.from({ length: 20 }, (_, i) => vis[Math.floor((i * vis.length) / 20)]);
      for (const [i, it] of pick.entries()) {
        // Bring its row into view first (the test scrolls; the click must not).
        const target = await p.evaluate(([id, top, onLabel]) => {
          const cuerpo = document.querySelector('#linea-cuerpo');
          const head = document.querySelector('.linea-cabeza').offsetHeight;
          if (top < cuerpo.scrollTop || top + 44 > cuerpo.scrollTop + cuerpo.clientHeight - head) cuerpo.scrollTop = Math.max(0, top - 30);
          return new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => {
            const b = document.querySelector(`#linea-filas .m[data-id="${CSS.escape(id)}"]`);
            if (!b) return r(null);
            const pr = b.closest('.carril-pista').getBoundingClientRect();
            const part = onLabel ? b.querySelector('.m-nombre .t') : (b.querySelector('.m-punto') || b.querySelector('.m-barra'));
            const r0 = part.getBoundingClientRect();
            const x0 = Math.max(r0.left, pr.left + 1), x1 = Math.min(r0.right, pr.right - 1);
            const cx = x1 > x0 ? (x0 + x1) / 2 : (b.getBoundingClientRect().left + b.getBoundingClientRect().right) / 2;
            const rect = b.getBoundingClientRect();
            r({ x: cx, y: (r0.top + r0.bottom) / 2, rect: [rect.left, rect.top, rect.width], pista: [pr.left, pr.width] });
          })));
        }, [it.id, it.top, i % 2 === 1]);
        if (!target) { bad.push(`${dname} ${s}: «${it.name}» has no button after scrolling to it`); continue; }
        const before = await state(p);
        if (screen.hasTouch) await p.touchscreen.tap(target.x, target.y); else await p.mouse.click(target.x, target.y);
        await frames(p);
        const after = await state(p);
        const rect = await p.evaluate((id) => { const b = document.querySelector(`#linea-filas .m[data-id="${CSS.escape(id)}"]`); if (!b) return null; const r = b.getBoundingClientRect(); return [r.left, r.top, r.width]; }, it.id);
        clicks++;
        const span = before.vista[1] - before.vista[0];
        if (after.vista[0] !== before.vista[0] || after.vista[1] !== before.vista[1]) bad.push(`${dname} ${s}: «${it.name}» moved the view ${before.vista.map((x) => x.toFixed(3))} → ${after.vista.map((x) => x.toFixed(3))}`);
        if (Math.abs(after.scroll - before.scroll) > 0.5) bad.push(`${dname} ${s}: «${it.name}» scrolled the lanes ${before.scroll} → ${after.scroll}`);
        if (!rect || rect.some((v, k) => Math.abs(v - target.rect[k]) > 1)) bad.push(`${dname} ${s}: «${it.name}» moved on screen ${JSON.stringify(target.rect)} → ${JSON.stringify(rect)}`);
        if (after.sel !== it.sel) bad.push(`${dname} ${s}: «${it.name}» selected ${after.sel || 'nothing'}`);
        // The cursor: the pointed time, clamped into the visible part of [start, end), never at the end. A pointer lands on
        // whole pixels, so the check allows one and a half pixels of time.
        const tp = before.vista[0] + ((target.x - target.pista[0]) / target.pista[1]) * span;
        const hi = it.t1 > it.t0 ? it.t1 - Math.min((it.t1 - it.t0) / 2, DAY / 24) : it.t1;
        const want = Math.max(Math.max(it.t0, before.vista[0]), Math.min(Math.min(hi, before.vista[1]), tp));
        if (Math.abs(after.t - want) > (span / target.pista[1]) * 1.5 + 1e-7) bad.push(`${dname} ${s}: «${it.name}» put the cursor at ${after.t.toFixed(5)}, pointed ${tp.toFixed(5)}, expected ${want.toFixed(5)} in [${it.t0.toFixed(5)}, ${it.t1.toFixed(5)})`);
      }
      note(`${screen.name} ${dname} span ${s}: ${pick.length} marks clicked`);
    }
    note(`${screen.name}: ${clicks} clicks, ${bad.length} problems`);
    await p.context().close();
    assert.ok(clicks >= 200, `only ${clicks} clicks`);
    assert.deepEqual(bad.slice(0, 30), []);
  });
}

test('1440: with a person selected, a click on another of their stays moves the cursor there; a second click on the same stay releases the person', async () => {
  // Moisés selected by the address, so no mark was clicked yet. His lane goes away when he is released: the click that
  // releases him must not select him again on its way up the page.
  const p = await open(DESKTOP, 't=-1480&v=100&sel=persona:moises');
  const own = (await hookView(p)).visible.filter((x) => x.sel === 'persona:moises' && x.x > 0 && x.x + x.w < 1200);
  assert.ok(own.length >= 2, `only ${own.length} stays of Moisés in view`);
  const [A, B] = own;
  const clickOn = async (m) => {
    await p.evaluate((id) => { const c = document.querySelector('#linea-cuerpo'); const x = window.BE.lineaMarcas().find((q) => q.id === id); c.scrollTop = Math.max(0, x.top - 120); }, m.id);
    await frames(p);
    const [x, y] = await p.evaluate((id) => { const r = document.querySelector(`#linea-filas .m[data-id="${CSS.escape(id)}"] .m-nombre .t`).getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; }, m.id);
    await p.mouse.click(x, y); await frames(p);
    return state(p);
  };
  const a = await clickOn(A);
  assert.equal(a.sel, 'persona:moises', 'a click on stay A keeps the person');
  assert.ok(a.t >= A.t0 - 1e-9 && a.t <= A.t1 + 1e-9, 'the cursor is inside stay A');
  const b = await clickOn(B);
  assert.equal(b.sel, 'persona:moises', 'a click on stay B keeps the person');
  assert.ok(b.t >= B.t0 - 1e-9 && b.t <= B.t1 + 1e-9, 'the cursor is inside stay B');
  const again = await clickOn(B);
  assert.equal(again.sel, '', 'a second click on stay B releases the person');
  assert.equal(again.t, b.t, 'releasing does not move the cursor');
  await p.context().close();
});

test('1440: a second click on the selected mark releases it, Esc releases it, an empty click releases it; the keyboard walks the strip', async () => {
  const p = await open(DESKTOP, 't=50.5&v=8');
  const it = (await hookView(p)).visible.filter((x) => !x.secular && x.top < 250 && x.x > 0 && x.x + x.w < 1200).sort((a, b) => a.top - b.top)[0];
  const box = async () => p.evaluate((id) => { const r = document.querySelector(`#linea-filas .m[data-id="${CSS.escape(id)}"] .m-nombre .t`).getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; }, it.id);
  let [x, y] = await box();
  await p.mouse.click(x, y); await frames(p);
  const first = await state(p);
  assert.equal(first.sel, it.sel, 'the first click selects');
  // A second click on the selected mark lets it go, as on the map, and moves neither the cursor nor the view.
  await p.mouse.click(x, y); await frames(p);
  const second = await state(p);
  assert.equal(second.sel, '', 'a second click releases the selection');
  assert.equal(second.t, first.t); assert.deepEqual(second.vista, first.vista);
  await p.mouse.click(x, y); await frames(p);
  assert.equal((await state(p)).sel, it.sel, 'a third click selects it again');
  const before = await state(p);
  await p.keyboard.press('Escape'); await frames(p);
  const esc = await state(p);
  assert.equal(esc.sel, '', 'Esc releases');
  assert.equal(esc.t, before.t); assert.deepEqual(esc.vista, before.vista);
  // An empty click with a selection only releases it.
  await p.mouse.click(x, y); await frames(p);
  const empty = await p.evaluate(() => { const pr = document.querySelector('#linea-filas .carril:not([hidden]) .carril-pista').getBoundingClientRect(); return [pr.left + 3, pr.bottom - 2]; });
  const withSel = await state(p);
  await p.mouse.click(empty[0], empty[1]); await frames(p);
  const released = await state(p);
  assert.equal(released.sel, ''); assert.equal(released.t, withSel.t, 'the empty click only released the selection');
  // One tab stop, arrows move the focus and nothing else, Enter selects at the nearest point.
  assert.equal(await p.evaluate(() => document.querySelectorAll('#linea-filas .m[tabindex="0"]').length), 1);
  await p.evaluate(() => document.querySelector('#linea-filas .m[tabindex="0"]').focus());
  const k0 = await state(p);
  for (const key of ['ArrowRight', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'End', 'Home']) await p.keyboard.press(key);
  await frames(p);
  const k1 = await state(p);
  const focused = await p.evaluate(() => document.activeElement?.matches('#linea-filas .m') ? document.activeElement.dataset.id : null);
  assert.ok(focused, 'the focus stays on a mark');
  assert.equal(k1.t, k0.t); assert.deepEqual(k1.vista, k0.vista);
  await p.keyboard.press('Enter'); await frames(p);
  const k2 = await state(p);
  const f = (await hookView(p)).visible.find((m) => m.id === focused);
  assert.equal(k2.sel, f.sel);
  assert.ok(k2.t >= Math.max(f.t0, k2.vista[0]) - 1e-9 && k2.t <= Math.min(f.t1, k2.vista[1]) + 1e-9, 'Enter puts the cursor inside the mark');
  assert.deepEqual(k2.vista, k1.vista);
  await p.keyboard.press('Enter'); await frames(p);
  assert.equal((await state(p)).sel, '', 'Enter on the selected mark releases it');
  const ring = await p.evaluate(() => { const s = getComputedStyle(document.activeElement); return `${s.outlineStyle} ${s.outlineWidth}`; });
  note(`1440 keyboard: focus ring ${ring}`);
  await p.context().close();
});

/** Scrolls the lanes to the mark called `name` and clicks or taps its name, as a person would. */
async function pressMark(p, screen, name) {
  const id = await p.evaluate((n) => { const m = window.BE.lineaMarcas().find((q) => q.name === n); const c = document.querySelector('#linea-cuerpo'); c.scrollTop = Math.max(0, m.top - 60); return m.id; }, name);
  await frames(p);
  const [x, y] = await p.evaluate((i) => { const r = document.querySelector(`#linea-filas .m[data-id="${CSS.escape(i)}"] .m-nombre .t`).getBoundingClientRect(); return [r.left + Math.min(r.width / 2, 20), r.top + r.height / 2]; }, id);
  if (screen.hasTouch) await p.touchscreen.tap(x, y); else await p.mouse.click(x, y);
  await frames(p);
  return { id, ...(await state(p)) };
}

test('after Back reselects a mark, the first click or tap on it releases it, on the computer and on the phone', async () => {
  // docs/ideas/atras-adelante-flecos.md, question 4: each entry remembers the mark pressed in it, and Back gives it back
  // to the strip. Before, Back counted as a selection from elsewhere: the first click only moved the cursor, or nothing.
  for (const [screen, first, second, back] of [[DESKTOP, 'Galión, procónsul de Acaya', 'Segundo viaje misional', '#atras'],
    [PHONE, 'La congregación cristiana', 'Roma, sexta potencia mundial', '#hoja-atras']]) {
    const p = await open(screen, 't=50.5&v=8');
    const press = (name) => pressMark(p, screen, name);
    const a = await press(first);
    assert.notEqual(a.sel, '', `${screen.name}: «${first}» was not selected`);
    const b = await press(second);
    assert.notEqual(b.sel, a.sel, `${screen.name}: «${second}» was not selected`);
    await p.locator(back).click();
    await frames(p, 6);
    const back1 = await state(p);
    assert.equal(back1.sel, a.sel, `${screen.name}: Back did not bring «${first}» back`);
    assert.ok(Math.abs(back1.t - a.t) < 1e-4, `${screen.name}: Back did not bring the cursor back (${back1.t}, was ${a.t})`);   // the address keeps 4 decimals
    const released = await press(first);
    assert.equal(released.sel, '', `${screen.name}: the first click after Back on «${first}» did not release it`);
    assert.equal(released.t, back1.t, `${screen.name}: releasing moved the cursor`);
    await p.context().close();
  }
});

test('after Back, a journey bar pressed in a traveller\'s lane comes back in that lane, pressed, and the first click releases it', async () => {
  // The bar of a journey of Jesús lives only in his lane, which stays while one of its marks is selected. A selection
  // from elsewhere takes the lane away; Back brings the bar back, so it brings the lane back with it.
  const p = await open(DESKTOP, 't=30.5&v=8');
  await p.keyboard.press('Shift');   // a key wakes the history: the next view gets its entry
  await p.evaluate(() => window.BE.seleccionar({ tipo: 'persona', id: 'jesus' }, { mover: false }));
  await frames(p, 6);
  const barIn = (id) => p.evaluate((i) => {
    const b = document.querySelector(`#linea-filas .carril[data-carril="jesus"]:not([hidden]) .m[data-id="${CSS.escape(i)}"]`);
    if (!b) return null;
    b.scrollIntoView({ block: 'center' });
    const r = b.querySelector('.m-barra').getBoundingClientRect(), pr = b.closest('.carril-pista').getBoundingClientRect();
    const x0 = Math.max(r.left, pr.left + 2), x1 = Math.min(r.right, pr.right - 2);
    return { x: (x0 + x1) / 2, y: r.top + r.height / 2, pressed: b.getAttribute('aria-pressed') };
  }, id);
  const id = await p.evaluate(() => window.BE.lineaMarcas().find((m) => m.lane === 'jesus' && m.sel.startsWith('viaje:') && m.visible)?.id);
  assert.ok(id, 'a journey bar of Jesús in view');
  const a = await barIn(id);
  await p.mouse.click(a.x, a.y);
  await frames(p, 6);
  assert.equal((await state(p)).sel, id, `the bar «${id}» was not selected`);
  await p.waitForFunction((i) => history.state?.mark === i, id, { timeout: 3000 });
  await p.locator('#q').fill('Corinto');
  await p.waitForFunction(() => !document.querySelector('#resultados').hidden);
  await p.keyboard.press('Enter');
  await frames(p, 6);
  assert.equal(await barIn(id), null, 'the lane of Jesús is still there after selecting Corinto');
  await p.locator('#atras').click();
  await frames(p, 6);
  assert.equal((await state(p)).sel, id, 'Back did not bring the journey back');
  const b = await barIn(id);
  assert.ok(b, 'after Back the bar has no lane to be in: the lane of Jesús is gone');
  assert.equal(b.pressed, 'true', 'after Back the bar is not pressed');
  await p.mouse.click(b.x, b.y);
  await frames(p, 6);
  assert.equal((await state(p)).sel, '', 'the first click after Back on the bar did not release it');
  await p.context().close();
});

test('after a reload, or «Acerca de» and back with «Volver al mapa», the first click or tap on the pressed mark releases it', async () => {
  // The entry keeps the mark pressed in it, and the page gives it back to the strip when it loads, not only on Back.
  const marked = async (p) => { await p.waitForFunction(() => window.BE?.lineaMarcas && document.querySelector('#linea-filas .m'), null, { timeout: 25000 }); await frames(p, 6); };
  for (const [screen, name, way] of [[DESKTOP, 'Galión, procónsul de Acaya', 'reload'], [DESKTOP, 'Galión, procónsul de Acaya', 'volver'],
    [PHONE, 'La congregación cristiana', 'reload']]) {
    const p = await open(screen, 't=50.5&v=8');
    const a = await pressMark(p, screen, name);
    assert.notEqual(a.sel, '', `${screen.name}: «${name}» was not selected`);
    await p.waitForFunction((id) => history.state?.mark === id, a.id, { timeout: 3000 });
    if (way === 'reload') await p.reload();
    else {
      await Promise.all([p.waitForURL(/acerca\.html/), p.locator('#acerca').click()]);
      await Promise.all([p.waitForURL(/index\.html/), p.locator('a.be-btn[data-volver]').click()]);
    }
    await marked(p);
    const back = await state(p);
    assert.equal(back.sel, a.sel, `${screen.name}, ${way}: «${name}» is not selected after it`);
    const released = await pressMark(p, screen, name);
    assert.equal(released.sel, '', `${screen.name}, ${way}: the first click after it on «${name}» did not release it`);
    await p.context().close();
  }
});

test('1440: dragging moves time, the ruler moves the cursor, the wheel zooms at the pointer, the lanes scroll by their names or a vertical drag (Shift pans, Ctrl zooms)', async () => {
  const p = await open(DESKTOP, 't=50.5&v=40');
  await frames(p);
  const w = await p.evaluate(() => document.querySelector('#pista').clientWidth);
  const lane = await p.evaluate(() => { const r = document.querySelector('#linea-filas .carril:not([hidden]) .carril-pista').getBoundingClientRect(); return [r.left + 200, r.top + r.height / 2]; });
  const a = await state(p);
  await p.mouse.move(lane[0], lane[1]); await p.mouse.down();
  for (let i = 1; i <= 20; i++) await p.mouse.move(lane[0] + i * 20, lane[1]);
  await p.mouse.up(); await frames(p);
  const b = await state(p);
  const span = a.vista[1] - a.vista[0];
  note(`1440 drag 400 px at décadas: view moved ${(a.vista[0] - b.vista[0]).toFixed(3)} years (expected ${(400 * span / w).toFixed(3)}), span ${span} → ${b.vista[1] - b.vista[0]}, cursor ${a.t === b.t ? 'unchanged' : 'moved'}, selection ${b.sel || 'none'}`);
  assert.ok(Math.abs((a.vista[0] - b.vista[0]) - (400 * span) / w) < span * 0.01);
  assert.ok(Math.abs((b.vista[1] - b.vista[0]) - span) < 1e-9);
  assert.equal(b.t, a.t); assert.equal(b.sel, '');
  // The ruler: press and drag move the cursor; the view stays.
  const ruler = await p.evaluate(() => { const r = document.querySelector('#pista').getBoundingClientRect(); return [r.left, r.top + r.height / 2]; });
  await p.mouse.move(ruler[0] + 300, ruler[1]); await p.mouse.down(); await p.mouse.move(ruler[0] + 500, ruler[1], { steps: 5 }); await p.mouse.up(); await frames(p);
  const c = await state(p);
  const expectT = c.vista[0] + (500 / w) * (c.vista[1] - c.vista[0]);
  note(`1440 ruler: cursor at ${c.t.toFixed(3)} (expected ${expectT.toFixed(3)}), view ${c.vista[0] === b.vista[0] ? 'unchanged' : 'moved'}; aria-valuetext «${await p.getAttribute('#pista', 'aria-valuetext')}»`);
  assert.ok(Math.abs(c.t - expectT) < (c.vista[1] - c.vista[0]) / w * 2);
  assert.deepEqual(c.vista, b.vista);
  assert.equal(await p.getAttribute('#pista', 'role'), 'slider');
  // The wheel over the lanes zooms at the pointer: the moment under it stays put and the lanes do not scroll.
  const x0 = await p.evaluate(() => document.querySelector('#pista').getBoundingClientRect().left);
  const under = (s) => s.vista[0] + ((lane[0] - x0) / w) * (s.vista[1] - s.vista[0]);
  await p.mouse.move(lane[0], lane[1] + 20);
  await p.mouse.wheel(0, 300); await frames(p);
  const z = await state(p);
  note(`1440 wheel over the lanes: span ${(c.vista[1] - c.vista[0]).toFixed(3)} → ${(z.vista[1] - z.vista[0]).toFixed(3)}, moment under the pointer ${under(c).toFixed(3)} → ${under(z).toFixed(3)}, scrollTop ${c.scroll} → ${z.scroll}`);
  assert.ok((z.vista[1] - z.vista[0]) > (c.vista[1] - c.vista[0]) * 1.2, 'the wheel did not zoom out');
  assert.ok(Math.abs(under(z) - under(c)) < (z.vista[1] - z.vista[0]) / w * 2, 'the moment under the pointer moved');
  assert.equal(z.scroll, c.scroll);
  // The wheel over the lane names scrolls the lanes and leaves the view; so does a vertical drag on the lanes.
  const names = await p.evaluate(() => { const r = document.querySelector('#linea-filas .carril:not([hidden]) .carril-rotulo').getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; });
  await p.mouse.move(names[0], names[1]);
  await p.mouse.wheel(0, 300); await frames(p);
  const y = await state(p);
  note(`1440 wheel over the lane names: scrollTop ${z.scroll} → ${y.scroll}, view ${y.vista[0] === z.vista[0] ? 'unchanged' : 'moved'}`);
  assert.ok(y.scroll > z.scroll); assert.deepEqual(y.vista, z.vista);
  await p.evaluate(() => { document.querySelector('#linea-cuerpo').scrollTop = 0; });
  await p.mouse.move(lane[0], lane[1] + 60); await p.mouse.down();
  for (let i = 1; i <= 10; i++) await p.mouse.move(lane[0] + 1, lane[1] + 60 - i * 10);
  await p.mouse.up(); await frames(p);
  const d = await state(p);
  note(`1440 vertical drag of 100 px: scrollTop 0 → ${d.scroll}, view ${d.vista[0] === y.vista[0] ? 'unchanged' : 'moved'}, selection ${d.sel || 'none'}`);
  assert.ok(d.scroll > 0); assert.deepEqual(d.vista, y.vista); assert.equal(d.sel, '');
  await p.keyboard.down('Shift'); await p.mouse.wheel(0, 200); await p.keyboard.up('Shift'); await frames(p);
  const e = await state(p);
  assert.notEqual(e.vista[0], d.vista[0]); assert.ok(Math.abs((e.vista[1] - e.vista[0]) - (d.vista[1] - d.vista[0])) < 1e-9);
  await p.keyboard.down('Control'); await p.mouse.wheel(0, 100); await p.keyboard.up('Control'); await frames(p);
  const f = await state(p);
  note(`1440 Shift+wheel panned ${(e.vista[0] - d.vista[0]).toFixed(3)} years; Ctrl+wheel span ${(e.vista[1] - e.vista[0]).toFixed(3)} → ${(f.vista[1] - f.vista[0]).toFixed(3)}`);
  assert.ok(Math.abs((f.vista[1] - f.vista[0]) - (e.vista[1] - e.vista[0])) > 1e-6);
  // The map follows the cursor: Pablo's marker moves when the ruler takes the cursor from 50 to 57.
  await goTo(p, 50.5, 40);
  const pablo = () => p.evaluate(() => { const m = document.querySelector('.maplibregl-marker.pablo'); return m ? `${m.style.transform}|${m.isConnected}` : null; });
  const m0 = await pablo();
  const x57 = await p.evaluate(() => { const BE = window.BE, r = document.querySelector('#pista').getBoundingClientRect(); return [r.left + ((57.3 - BE.E.vista[0]) / (BE.E.vista[1] - BE.E.vista[0])) * r.width, r.top + r.height / 2]; });
  await p.mouse.click(x57[0], x57[1]); await frames(p, 6);
  const m1 = await pablo();
  note(`1440 map: Pablo's marker ${m0 && m1 && m0 !== m1 ? 'moved' : 'did not move'} with the cursor (${(await state(p)).t.toFixed(2)})`);
  assert.ok(m0 && m1 && m0 !== m1, `${m0} → ${m1}`);
  await p.context().close();
});

test('430: a horizontal finger drag moves time, a vertical one scrolls the lanes, a tap near a mark selects it', async () => {
  const p = await open(PHONE, 't=50.5&v=8');
  const cdp = await p.context().newCDPSession(p);
  const touch = async (x0, y0, x1, y1) => {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x0, y: y0 }] });
    for (let i = 1; i <= 12; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x0 + ((x1 - x0) * i) / 12, y: y0 + ((y1 - y0) * i) / 12 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await frames(p, 4);
  };
  const r = await p.evaluate(() => { const c = document.querySelector('#linea-cuerpo').getBoundingClientRect(), pr = document.querySelector('#pista').getBoundingClientRect(); return { x: pr.left + 60, y: c.top + c.height * 0.6, w: pr.width }; });
  const a = await state(p);
  await touch(r.x, r.y, r.x + 150, r.y + 4);
  const b = await state(p);
  const span = a.vista[1] - a.vista[0];
  note(`430 finger drag 150 px: view moved ${(a.vista[0] - b.vista[0]).toFixed(3)} years (expected ${(150 * span / r.w).toFixed(3)}), cursor ${a.t === b.t ? 'unchanged' : 'moved'}`);
  assert.ok(Math.abs((a.vista[0] - b.vista[0]) - (150 * span) / r.w) < span * 0.02);
  assert.equal(b.t, a.t);
  // A vertical swipe goes through the browser's own gesture path (touch-action: pan-y lets it scroll natively).
  // Headless Chromium refuses a gesture that starts below about 800 px, so it starts at the top of the lanes.
  const y0 = await p.evaluate(() => Math.round(document.querySelector('#linea-filas').getBoundingClientRect().top + 30));
  await cdp.send('Input.synthesizeScrollGesture', { x: Math.round(r.x + 40), y: Math.min(y0, 790), yDistance: -80, xDistance: 0, gestureSourceType: 'touch', speed: 600 });
  await frames(p, 4);
  const c = await state(p);
  note(`430 finger up 80 px: scrollTop ${b.scroll} → ${c.scroll}, view ${c.vista[0] === b.vista[0] ? 'unchanged' : 'moved'}`);
  assert.ok(c.scroll > b.scroll); assert.deepEqual(c.vista, b.vista);
  // A tap a few pixels beside a mark of that row selects it (looked for over a few scroll positions).
  let near = null;
  for (const top of [0, 44, 88, 132, 176, 220]) {
    await p.evaluate((y) => { document.querySelector('#linea-cuerpo').scrollTop = y; }, top);
    await frames(p);
    near = await p.evaluate(() => {
    const head = document.querySelector('.linea-cabeza').getBoundingClientRect().bottom;
    for (const b of document.querySelectorAll('#linea-filas .m')) {
      const r = b.getBoundingClientRect(), pr = b.closest('.carril-pista').getBoundingClientRect(), cr = document.querySelector('#linea-cuerpo').getBoundingClientRect();
      if (r.top < head || r.bottom > cr.bottom + 0.5) continue;
      for (const x of [r.right + 8, r.left - 8]) {
        if (x < pr.left + 2 || x > pr.right - 2 || document.elementFromPoint(x, (r.top + r.bottom) / 2)?.closest('.m')) continue;
        return { x, y: (r.top + r.bottom) / 2, sel: b.dataset.sel, h: r.height, wdt: r.width };
      }
    }
    return { none: [...document.querySelectorAll('#linea-filas .m')].map((b) => { const r = b.getBoundingClientRect(); return [Math.round(r.left), Math.round(r.right), Math.round(r.top), Math.round(r.bottom)]; }).slice(0, 12), head };
    });
    if (near && !near.none) break;
  }
  const c2 = await state(p);
  assert.ok(near && !near.none, `a mark with free space beside it: ${JSON.stringify(near)}`);
  await p.touchscreen.tap(near.x, near.y); await frames(p);
  const d = await state(p);
  note(`430 tap 8 px beside a mark (${near.wdt}x${near.h}): selected ${d.sel === near.sel ? 'it' : d.sel || 'nothing'}, view ${d.vista[0] === c2.vista[0] ? 'unchanged' : 'moved'}`);
  assert.equal(d.sel, near.sel); assert.deepEqual(d.vista, c2.vista);
  assert.equal(await p.evaluate(() => visualViewport.scale), 1);
  await p.context().close();
});

test('person lanes follow the row rule; selecting a period does not reframe the view', async () => {
  for (const screen of [DESKTOP, PHONE]) {
    const p = await open(screen, 't=50.5&v=8');
    // A person picked from a card: its lane appears just before «Viajes de Pablo» and its marks pass the same checks.
    await p.evaluate(() => window.BE.seleccionar({ tipo: 'persona', id: 'timoteo' }, { mover: false }));
    await frames(p);
    await p.evaluate(() => { const c = document.querySelector('#panel-cuerpo [data-sel="persona:silas"]'); if (c) c.click(); else window.BE.seleccionar({ tipo: 'persona', id: 'silas' }, { mover: false }); });
    await frames(p);
    const h = await hookView(p);
    const silas = h.lanes.find((l) => l.id === 'silas');
    const walk = await walkLanes(p);
    const seen = new Map(walk.seen);
    const personMarks = h.visible.filter((x) => x.lane === 'silas');
    note(`${screen.name} person lane: silas ${silas ? `${silas.filas} rows, ${personMarks.length} marks, ${personMarks.filter((x) => seen.has(x.id)).length} drawn` : 'absent'}; ${walk.problems.filter((x) => x.startsWith('silas')).length} problems`);
    assert.ok(silas && silas.alto > 0, 'the lane of the selected person shows');
    // The fixed lane says what it shows (only Pablo's journeys); the person lane goes by the person's name, just before it.
    const ids = h.lanes.filter((l) => l.alto).map((l) => l.id);
    assert.equal(h.lanes.find((l) => l.id === 'pablo')?.nombre, 'Viajes de Pablo');
    assert.equal(silas.nombre, 'Silas');
    assert.equal(ids.indexOf('silas') + 1, ids.indexOf('pablo'), ids.join(' '));
    // Its name is whole on both screens: on the phone it goes in two lines inside the label, never cut.
    await viajesWhole(p, screen.name);
    assert.ok(personMarks.length > 0 && personMarks.every((x) => seen.has(x.id)));
    assert.deepEqual(walk.problems.filter((x) => x.startsWith('silas')), []);
    await p.context().close();
    // Pinned person lanes from the address.
    const q = await open(screen, 't=50.5&v=8&carriles=timoteo,silas');
    const lanes = (await hookView(q)).lanes;
    note(`${screen.name} carriles=timoteo,silas: top lanes ${lanes.slice(0, 2).map((l) => `${l.id}(${l.filas})`).join(', ')}`);
    assert.deepEqual(lanes.slice(0, 2).map((l) => l.id), ['timoteo', 'silas']);
    const qw = await walkLanes(q);
    assert.deepEqual(qw.problems, []);
    // Pinned from an old link: the pin takes room from the name, which then goes in two lines, still whole.
    const r = await open(screen, 't=50.5&v=8&carriles=pablo');
    assert.equal((await hookView(r)).lanes[0].id, 'pablo');
    await viajesWhole(r, `${screen.name} carriles=pablo`, true);
    // With «Letra grande» the two lines are taller than the label was: it grows to hold them, inside its lane.
    await r.evaluate(() => window.BE.ponerPreferencia('letra-grande', true));
    await frames(r, 4);
    await viajesWhole(r, `${screen.name} carriles=pablo letra grande`, true);
    await r.context().close();
    // A period chosen from outside the strip (search, a card) keeps the scale; on the strip, clicking one too.
    for (const s of [40, 0.12]) {
      await goTo(q, 50.5, s);
      const before = await state(q);
      await q.evaluate(() => { const p = window.BE.D.periodos.find((x) => x.tipo === 'potencia' && /babilon/i.test(x.id)); window.BE.seleccionar({ tipo: 'periodo', id: p.id }); });
      await frames(q);
      const after = await state(q);
      note(`${screen.name} select Babilonia from outside at span ${s}: span ${(before.vista[1] - before.vista[0]).toFixed(3)} → ${(after.vista[1] - after.vista[0]).toFixed(3)}`);
      assert.ok(Math.abs((after.vista[1] - after.vista[0]) - (before.vista[1] - before.vista[0])) < 1e-9);
    }
    await q.context().close();
  }
});

for (const screen of [DESKTOP, PHONE]) {
  test(`${screen.name}: speed at milenios and décadas, and only the marks near the panel are in the page`, async () => {
    const p = await open(screen, 't=50.5&v=4125');
    const m = await p.evaluate(async () => {
      const BE = window.BE, raf = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      const median = (xs) => xs.sort((a, b) => a - b)[Math.floor(xs.length / 2)];
      const render = [];
      for (let i = 0; i < 9; i++) { BE.E.vista = [BE.E.vista[0] + 0.01, BE.E.vista[1] + 0.01]; const t0 = performance.now(); BE.pintarLineaFija(); render.push(performance.now() - t0); await raf(); }
      const cuerpo = document.querySelector('#linea-cuerpo'), row = parseFloat(getComputedStyle(document.querySelector('#linea-filas')).getPropertyValue('--fila'));
      const attached = document.querySelectorAll('#linea-filas .m').length;
      const perRow = Math.max(...BE.lineaCarriles().map((l) => l.filas || 0)) ? null : null;
      const budget = BE.lineaMarcas().filter((x) => x.visible && x.top + row >= cuerpo.scrollTop - cuerpo.clientHeight && x.top <= cuerpo.scrollTop + 2 * cuerpo.clientHeight).length;
      const total = BE.lineaMarcas().filter((x) => x.visible).length;
      // A drag at décadas: 20 frames of 20 px each, rows held as during a real drag.
      const s = 40, v0 = 50.5 - 0.4 * s;
      BE.E.vista = [v0, v0 + s]; BE.pintarLineaFija(); await raf();
      const w = document.querySelector('#pista').clientWidth, drag = [];
      for (let i = 1; i <= 20; i++) { BE.E.vista = [v0 - (i * 20 * s) / w, v0 - (i * 20 * s) / w + s]; const t0 = performance.now(); BE.pintarLineaFija(); drag.push(performance.now() - t0); await raf(); }
      return { render: median(render), drag: median(drag), attached, budget, total, height: cuerpo.scrollHeight };
    });
    note(`${screen.name} speed: milenios render median ${m.render.toFixed(1)} ms, décadas drag frame median ${m.drag.toFixed(1)} ms; at milenios ${m.attached} buttons in the page for ${m.total} marks in view (${m.budget} within three panel heights), lanes ${m.height} px tall`);
    assert.ok(m.attached <= m.budget + 5, `${m.attached} buttons in the page, ${m.budget} expected at most`);
    assert.ok(m.render <= 50, `render ${m.render} ms`);
    assert.ok(m.drag <= 16, `drag frame ${m.drag} ms`);
    await p.context().close();
  });
}

test('1440: a selected mark out of view is named at the edge, and its button brings it back without changing the scale or the cursor', async () => {
  // The strip raised, as it opened at 900 px tall before: the letters lane is in it and the panel scrolls.
  const p = await open(DESKTOP, 't=50.5&v=8&linea=grande');
  const it = (await hookView(p)).visible.find((x) => x.lane === 'cartas');
  await p.evaluate(({ id }) => { const b = document.querySelector(`#linea-filas .m[data-id="${CSS.escape(id)}"]`); b.scrollIntoView({ block: 'center' }); }, it);
  await frames(p);
  await p.evaluate(({ id }) => document.querySelector(`#linea-filas .m[data-id="${CSS.escape(id)}"]`).click(), it);
  await frames(p);
  // Pan the view two screens later: the letter is out of the view in time.
  const a = await state(p);
  await p.evaluate(() => { const BE = window.BE, s = BE.E.vista[1] - BE.E.vista[0]; BE.E.vista = [BE.E.vista[0] + 2 * s, BE.E.vista[1] + 2 * s]; BE.sucio.linea = true; BE.programar(); });
  await frames(p);
  const btn = await p.evaluate(() => { const b = document.querySelector('#linea-ir-sel'); return b.hidden ? null : { text: b.textContent, side: b.dataset.lado }; });
  note(`1440 selected «${it.name}» out of view: button «${btn?.text}» (${btn?.side})`);
  assert.ok(btn && btn.side === 'izq' && btn.text.includes(it.name));
  const b = await state(p);
  await p.click('#linea-ir-sel'); await frames(p);
  const c = await state(p);
  assert.equal(c.t, b.t, 'the cursor stays');
  assert.ok(Math.abs((c.vista[1] - c.vista[0]) - (b.vista[1] - b.vista[0])) < 1e-9, 'the scale stays');
  assert.ok(c.vista[0] <= it.t0 && c.vista[1] >= it.t1, 'the letter is in view again');
  // Scrolled away vertically: the edge button scrolls back.
  await p.evaluate(() => { document.querySelector('#linea-cuerpo').scrollTop = 0; });
  await frames(p);
  const up = await p.evaluate(() => { const b = document.querySelector('#linea-ir-sel'); return b.hidden ? null : b.dataset.lado; });
  if (up) { await p.click('#linea-ir-sel'); await frames(p); }
  const seen = await p.evaluate(({ id }) => { const b = document.querySelector(`#linea-filas .m[data-id="${CSS.escape(id)}"]`), c = document.querySelector('#linea-cuerpo').getBoundingClientRect(); if (!b) return false; const r = b.getBoundingClientRect(); return r.top >= c.top - 1 && r.bottom <= c.bottom + 1; }, it);
  note(`1440 scrolled to the top: edge button ${up || 'not needed'}; the letter ${seen ? 'is' : 'is not'} in view after it`);
  assert.ok(seen);
  await p.context().close();
  void a;
});

test('1440 × 1100: the panel opens tall, the splitter shrinks it and the size survives a reload; at 900 px tall it opens normal', async () => {
  // A screen 1000 px tall or more opens the strip tall; a lower one, normal, so the map keeps its room.
  const context = await browser.newContext({ deviceScaleFactor: 1, viewport: { width: 1440, height: 1100 } });
  const p = await context.newPage();
  p.on('pageerror', (e) => errors.push(`panel pageerror: ${e.message}`));
  await p.goto(`${base}#t=50.5&v=8`);
  await p.waitForFunction(() => window.BE?.lineaMarcas && document.querySelector('#linea-filas .m'), null, { timeout: 25000 });
  await frames(p);
  const h0 = await p.evaluate(() => document.querySelector('#linea').offsetHeight);
  // The map is framed once, with the tall strip already in place: it does not jump when its style and marks load.
  const centre = () => p.evaluate(() => { const c = window.__be.map.getCenter(); return [c.lng, c.lat, window.__be.map.loaded()]; });
  const c0 = await centre();
  await p.waitForFunction(() => window.__be.map.loaded() && document.querySelectorAll('.maplibregl-marker').length > 0, null, { timeout: 30000 });
  await new Promise((r) => setTimeout(r, 1500));
  const c1 = await centre();
  note(`1440 map on load: centre ${c0.slice(0, 2).map((x) => x.toFixed(3))} (loaded ${c0[2]}) → ${c1.slice(0, 2).map((x) => x.toFixed(3))}`);
  assert.ok(Math.abs(c0[0] - c1[0]) < 1e-6 && Math.abs(c0[1] - c1[1]) < 1e-6, 'the map jumped after loading');
  const sep = await p.evaluate(() => { const r = document.querySelector('#sep-linea').getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; });
  await p.mouse.move(sep[0], sep[1]); await p.mouse.down(); await p.mouse.move(sep[0], sep[1] + 200, { steps: 8 }); await p.mouse.up();
  await frames(p);
  const h1 = await p.evaluate(() => document.querySelector('#linea').offsetHeight);
  await p.reload();
  await p.waitForFunction(() => window.BE?.lineaMarcas && document.querySelector('#linea-filas .m'), null, { timeout: 25000 });
  await frames(p, 6);
  const h2 = await p.evaluate(() => document.querySelector('#linea').offsetHeight);
  note(`1440 panel: opens at ${h0} px, splitter −200 px → ${h1} px, after a reload ${h2} px; hash «${await p.evaluate(() => location.hash)}»`);
  assert.ok(Math.abs(h0 - Math.min(1100 * 0.62, 600)) <= 2, `opens at ${h0}`);
  assert.ok(Math.abs(h1 - (h0 - 200)) <= 4);
  assert.ok(Math.abs(h2 - h1) <= 2);
  await context.close();
  // On a screen 900 px tall the strip opens at its normal height, so the map keeps its room; T still raises it. With
  // the tall strip a tour opened from the landing had 282 px of map, most of it under the legend and «Mientras tanto».
  const low = await browser.newContext({ deviceScaleFactor: 1, ...DESKTOP });
  const q = await low.newPage();
  q.on('pageerror', (e) => errors.push(`panel 768 pageerror: ${e.message}`));
  await q.goto(`${base}#t=50.5&v=8`);
  await q.waitForFunction(() => window.BE?.lineaMarcas && document.querySelector('#linea-filas .m'), null, { timeout: 25000 });
  await frames(q);
  const l0 = await q.evaluate(() => document.querySelector('#linea').offsetHeight);
  await q.evaluate(() => document.activeElement?.blur());
  await q.keyboard.press('t'); await frames(q, 4);
  const l1 = await q.evaluate(() => document.querySelector('#linea').offsetHeight);
  note(`1440x900 panel: opens at ${l0} px, T → ${l1} px; hash «${await q.evaluate(() => location.hash)}»`);
  assert.ok(l0 <= 260, `opens at ${l0}`);
  assert.ok(l1 > l0 + 100);
  await low.close();
});

test('1440: the sincronía lies above the strip: its place picker takes the click and «Cerrar» closes it', async () => {
  for (const hash of ['t=50.5&v=8', 't=50.5&v=8&linea=normal']) {
    const p = await open(DESKTOP, hash);
    await p.evaluate(() => window.BE.sincronia.alternar());
    await frames(p, 4);
    const sel = await p.evaluate(() => { const r = document.querySelector('#vista-sincronia select[data-sinc="lugar"]').getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; });
    const before = await state(p);
    await p.mouse.click(sel[0], sel[1]); await frames(p);
    const after = await state(p);
    const focus = await p.evaluate(() => document.activeElement?.tagName);
    const cerrar = await p.evaluate(() => { const r = document.querySelector('#vista-sincronia [data-sinc="cerrar"]').getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; });
    await p.keyboard.press('Escape');
    await p.mouse.click(cerrar[0], cerrar[1]); await frames(p);
    const closed = await p.evaluate(() => document.querySelector('#vista-sincronia').hidden);
    note(`1440 sincronía (${hash}): click on the place picker ${after.t === before.t ? 'kept' : 'moved'} the cursor, focus ${focus}; «Cerrar» ${closed ? 'closed it' : 'did not close it'}`);
    assert.equal(after.t, before.t); assert.equal(focus, 'SELECT'); assert.ok(closed);
    await p.context().close();
  }
});

test('1440: with the graph open, T and the menu change what the strip shows, both ways', async () => {
  const p = await open(DESKTOP, 't=50.5&v=8&sel=persona:pablo&grafo=pablo');
  const h = () => p.evaluate(() => document.querySelector('#linea').offsetHeight);
  await p.evaluate(() => document.activeElement?.blur());
  const h0 = await h();
  await p.keyboard.press('t'); await frames(p, 4);
  const h1 = await h();
  await p.keyboard.press('t'); await frames(p, 4);
  const h2 = await h();
  await p.evaluate(() => document.querySelector('#linea-menu-boton, [data-linea="menu"]')?.click());
  await frames(p);
  const label = await p.evaluate(() => document.querySelector('#linea-menu [data-linea="grande"]')?.textContent.trim() || null);
  note(`1440 graph open: strip ${h0} px, T → ${h1} px, T → ${h2} px; menu says «${label}»`);
  assert.ok(h1 > h0 + 100, `T did not raise the strip (${h0} → ${h1})`);
  assert.equal(h2, h0);
  if (label) assert.match(label, /^Ampliar/);
  await p.context().close();
});

test('1440: names on bars read in both themes and faint bars carry a border', async () => {
  const p = await open(DESKTOP, 't=50.5&v=8');
  for (const theme of ['claro', 'reunión']) {
    await p.evaluate((dark) => document.documentElement.classList.toggle('be-reunion', dark), theme === 'reunión');
    let low = [], unbordered = [], names = 0;
    for (const [t, s] of [[-1512.5, 4125], [-480, 400], [50.5, 8]]) {
      await goTo(p, t, s);
      const r = await p.evaluate(async () => {
        const rgb = (c) => (c.match(/[\d.]+/g) || []).slice(0, 3).map(Number);
        const lum = (c) => { const [r, g, b] = c.map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
        const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
        const cuerpo = document.querySelector('#linea-cuerpo');
        const raf = () => new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res)));
        const low = [], unb = []; let n = 0;
        for (let y = 0, g = 0; g < 200; g++, y += cuerpo.clientHeight) {
          cuerpo.scrollTop = y; await raf();
          for (const b of document.querySelectorAll('#linea-filas .carril:not([hidden]) .m')) {
            const bar = b.querySelector('.m-barra'); if (!bar) continue;
            const bg = getComputedStyle(bar).backgroundColor;
            const lab = b.querySelector('.m-nombre');
            if (lab.classList.contains('en-barra')) { n++; const c = ratio(rgb(getComputedStyle(lab).color), rgb(bg)); if (c < 4.5) low.push(`${lab.textContent} ${c.toFixed(2)}`); }
            if (!b.matches('.m--hueca, .m--secular, .atenuado')) {
              // The background the bar sits on: the first ancestor with an opaque one.
              let el = b.closest('.carril'), fondo = 'rgba(0, 0, 0, 0)';
              while (el && /rgba\(.*, 0\)$|transparent/.test(fondo = getComputedStyle(el).backgroundColor)) el = el.parentElement;
              const f = rgb(fondo);
              if (ratio(rgb(bg), f) < 3 && !bar.classList.contains('con-borde')) unb.push(`${lab.textContent} ${ratio(rgb(bg), f).toFixed(2)}`);
            }
          }
          if (y + cuerpo.clientHeight >= cuerpo.scrollHeight) break;
        }
        return { low: [...new Set(low)], unb: [...new Set(unb)], n };
      });
      low.push(...r.low); unbordered.push(...r.unb); names += r.n;
    }
    low = [...new Set(low)]; unbordered = [...new Set(unbordered)];
    note(`1440 theme ${theme}: ${names} names on bars, ${low.length} under 4.5:1${low.length ? ` (${low.slice(0, 4).join('; ')})` : ''}; ${unbordered.length} faint bars without border`);
    assert.deepEqual(low.slice(0, 10), []);
    assert.deepEqual(unbordered.slice(0, 10), []);
  }
  await p.evaluate(() => document.documentElement.classList.remove('be-reunion'));
  await p.context().close();
});

/** The colours of every mark the strip draws, by id: the fill and edge of its dot or bar, its name and the lane under
    it. Computed colours come as rgb() or, for a color-mix(), as color(srgb …) with channels from 0 to 1. */
const markColours = (p) => p.evaluate(() => {
  const rgb = (c) => { const n = (c.match(/-?[\d.]+/g) || []).map(Number).slice(0, 3); return c.startsWith('color(') ? n.map((v) => Math.round(v * 255)) : n; };
  const out = {};
  for (const b of document.querySelectorAll('#linea-filas .carril:not([hidden]) .m')) {
    const f = b.querySelector('.m-barra, .m-punto'), s = getComputedStyle(f), lab = b.querySelector('.m-nombre');
    let el = b.closest('.carril'), fondo;
    while (el && /rgba\(.*, 0\)$|transparent/.test(fondo = getComputedStyle(el).backgroundColor)) el = el.parentElement;
    out[b.dataset.id] = { sel: b.dataset.sel, bar: f.classList.contains('m-barra'), hollow: b.matches('.m--hueca'), secular: b.matches('.m--secular'), dim: b.matches('.atenuado'),
      onBar: lab.classList.contains('en-barra'), name: lab.textContent, fill: rgb(s.backgroundColor), edge: rgb(s.borderTopColor), shadow: s.boxShadow, text: rgb(getComputedStyle(lab).color), lane: rgb(fondo) };
  }
  return out;
});
const lum = (c) => { const [r, g, b] = c.map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
function hue([r, g, b]) {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  if (!d) return null;
  const h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return (h * 60 + 360) % 360;
}
const spread = (c) => Math.max(...c) - Math.min(...c);

test('1440: with an event selected the other marks keep their shape and their colour, washed; releasing gives it all back', async () => {
  // The owner: with a mark selected, the others lost their colour (white bars, hollow dots). Now a bar keeps its colour
  // at 45 % toward the background, with its name in ink at 4.5:1 or more, and a dot keeps its circle at 60 %, so the
  // nearly black ones read grey. When nothing is selected, every mark is at full colour again.
  const p = await open(DESKTOP, 't=-605.4422&v=40');
  for (const theme of ['claro', 'reunión']) {
    await p.evaluate((dark) => document.documentElement.classList.toggle('be-reunion', dark), theme === 'reunión');
    await frames(p);
    const full = await markColours(p);
    const a = await pressMark(p, DESKTOP, 'Babilonia destruye Jerusalén');
    assert.equal(a.sel, 'evento:destruccion-de-jerusalen-607');
    assert.equal(await p.evaluate(() => document.querySelector('#linea-filas').classList.contains('sin-foco')), false, `${theme}: nothing is dimmed`);
    const dimmed = await markColours(p);
    const dots = [], bars = [], low = [];
    for (const [id, d] of Object.entries(dimmed)) {
      const f = full[id];
      if (!f) continue;
      if (d.sel === a.sel) { assert.deepEqual([d.fill, d.edge], [f.fill, f.edge], `${theme}: the selected mark changed colour`); continue; }
      if (!d.dim || d.secular) continue;
      if (!d.bar && !d.hollow) {
        // The dot keeps its circle: filled, apart from the lane and lighter than before (toward the background).
        dots.push(`${d.name} ${f.fill} -> ${d.fill}`);
        assert.ok(ratio(d.fill, d.lane) >= 1.5, `${theme}: «${d.name}» lost its dot: ${d.fill} on ${d.lane}`);
        assert.ok(ratio(d.fill, f.lane) < ratio(f.fill, f.lane), `${theme}: «${d.name}» is not washed: ${f.fill} -> ${d.fill}`);
        if (theme === 'claro' && spread(f.fill) < 40) assert.ok(spread(d.fill) < 30 && lum(d.fill) > 0.12, `${theme}: «${d.name}» was dark and is not grey: ${d.fill}`);
      }
      if (d.bar && !d.hollow) {
        // The bar keeps its hue and loses strength.
        bars.push(`${d.name} ${f.fill} -> ${d.fill}`);
        const h0 = hue(f.fill), h1 = hue(d.fill);
        if (h0 != null && spread(f.fill) >= 30) assert.ok(h1 != null && Math.min(Math.abs(h0 - h1), 360 - Math.abs(h0 - h1)) < 15, `${theme}: «${d.name}» changed hue: ${f.fill} -> ${d.fill}`);
        assert.ok(ratio(d.fill, f.lane) < ratio(f.fill, f.lane), `${theme}: «${d.name}» is not washed: ${f.fill} -> ${d.fill}`);
        assert.ok(ratio(d.fill, d.lane) > 1.15, `${theme}: «${d.name}» is the colour of its lane: ${d.fill}`);
        if (d.onBar && ratio(d.text, d.fill) < 4.5) low.push(`${d.name} ${ratio(d.text, d.fill).toFixed(2)}`);
      }
    }
    note(`1440 ${theme}, one event selected: ${dots.length} dots and ${bars.length} bars dimmed, ${low.length} names under 4.5:1; e.g. ${dots[0]}; ${bars[0]}`);
    assert.ok(dots.length >= 3 && bars.length >= 2, `${theme}: too few dimmed marks to judge (${dots.length} dots, ${bars.length} bars)`);
    assert.deepEqual(low, [], `${theme}: names on washed bars under 4.5:1`);
    // A second click releases the selection, and every mark is back to its full colour.
    const r = await pressMark(p, DESKTOP, 'Babilonia destruye Jerusalén');
    assert.equal(r.sel, '');
    const back = await markColours(p);
    for (const [id, f] of Object.entries(full)) if (back[id]) assert.deepEqual([back[id].fill, back[id].edge, back[id].text], [f.fill, f.edge, f.text], `${theme}: «${f.name}» did not get its colour back`);
  }
  await p.evaluate(() => document.documentElement.classList.remove('be-reunion'));
  await p.context().close();
});

test('«Carriles» is a button that looks like one and says what it does; a click, a tap and Enter open the lane chooser', async () => {
  // The owner: nobody knew that «CARRILES» could be pressed. It is a button with a border and an arrow, an accessible
  // name that says what it does and aria-expanded, and it fits the lane column in both themes and with «Letra grande».
  for (const screen of [DESKTOP, PHONE]) {
    const p = await open(screen, 't=50.5&v=8');
    const look = () => p.evaluate(() => {
      const b = document.querySelector('#carriles .carriles-boton'), s = getComputedStyle(b), r = b.getBoundingClientRect();
      const col = document.querySelector('#carriles').getBoundingClientRect();
      const menu = document.querySelector('#linea-menu');
      return { tag: b.tagName, name: b.getAttribute('aria-label'), title: b.title, expanded: b.getAttribute('aria-expanded'), popup: b.getAttribute('aria-haspopup'),
        border: `${s.borderTopStyle} ${parseFloat(s.borderTopWidth)}`, cursor: s.cursor, icon: !!b.querySelector('svg'),
        fits: r.left >= col.left - 0.5 && r.right <= col.right + 0.5 && r.top >= col.top - 0.5 && r.bottom <= col.bottom + 0.5, cut: b.scrollWidth > b.clientWidth + 1,
        open: !!menu && !menu.hidden && /Carriles/.test(menu.textContent) && !!menu.querySelector('[data-fijar]') };
    });
    for (const cls of ['', 'be-reunion', 'be-letra-grande', 'be-reunion be-letra-grande']) {
      await p.evaluate((c) => { const h = document.documentElement; h.classList.remove('be-reunion', 'be-letra-grande'); if (c) h.classList.add(...c.split(' ')); }, cls);
      await frames(p);
      const l = await look();
      note(`${screen.name} «Carriles» ${cls || 'claro'}: ${l.tag}, «${l.name}», border ${l.border}, ${l.fits ? 'inside' : 'outside'} its column${l.cut ? ', cut' : ''}`);
      assert.equal(l.tag, 'BUTTON');
      assert.match(l.name, /^Carriles: elegir cuáles se ven/);
      assert.ok(l.title, 'no tooltip');
      assert.equal(l.popup, 'dialog');
      assert.equal(l.expanded, 'false');
      assert.equal(l.border, 'solid 1', `${cls}: no border`);
      assert.equal(l.cursor, 'pointer');
      assert.ok(l.icon, 'no arrow');
      assert.ok(l.fits && !l.cut, `${screen.name} ${cls}: the button leaves its column or is cut`);
    }
    await p.evaluate(() => document.documentElement.classList.remove('be-reunion', 'be-letra-grande'));
    await frames(p);
    const b = p.locator('#carriles .carriles-boton');
    if (screen.hasTouch) await b.tap(); else await b.click();
    await frames(p);
    let l = await look();
    assert.ok(l.open, `${screen.name}: a ${screen.hasTouch ? 'tap' : 'click'} did not open the lane chooser`);
    assert.equal(l.expanded, 'true');
    // The dialog belongs to the «…» button too: it says it is open, whichever button opened it.
    assert.equal(await p.evaluate(() => document.querySelector('#linea-menu-boton').getAttribute('aria-expanded')), 'true');
    if (screen.hasTouch) await b.tap(); else await b.click();
    await frames(p);
    l = await look();
    assert.ok(!l.open, `${screen.name}: a second press did not close it`);
    assert.equal(l.expanded, 'false');
    await b.focus();
    await p.keyboard.press('Enter');
    await frames(p);
    l = await look();
    assert.ok(l.open, `${screen.name}: Enter did not open the lane chooser`);
    assert.equal(l.expanded, 'true');
    await p.context().close();
  }
});

test('430: a pinch that starts during a drag, and the ruler used with a finger, leave the strip as it was', async () => {
  const p = await open(PHONE, 't=50.5&v=8');
  const cdp = await p.context().newCDPSession(p);
  const r = await p.evaluate(() => { const c = document.querySelector('#linea-cuerpo').getBoundingClientRect(), pr = document.querySelector('#pista').getBoundingClientRect(); return { x: pr.left + 60, y: c.top + c.height * 0.6 }; });
  const T = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts });
  await T('touchStart', [{ x: r.x, y: r.y, id: 1 }]);
  for (let i = 1; i <= 8; i++) await T('touchMove', [{ x: r.x + i * 10, y: r.y, id: 1 }]);
  await T('touchStart', [{ x: r.x + 80, y: r.y, id: 1 }, { x: r.x + 160, y: r.y + 10, id: 2 }]);
  await T('touchMove', [{ x: r.x + 70, y: r.y, id: 1 }, { x: r.x + 180, y: r.y + 10, id: 2 }]);
  await T('touchEnd', []);
  await frames(p, 4);
  const dragging = await p.evaluate(() => document.querySelector('#linea-filas').classList.contains('arrastrando'));
  await goTo(p, -1499.5, 40);
  const lanes = await p.evaluate(() => window.BE.lineaCarriles().filter((l) => ['pablo', 'cartas'].includes(l.id)).map((l) => `${l.id}:${l.alto}`));
  note(`430 drag then pinch: «arrastrando» ${dragging ? 'stays' : 'gone'}; at 1500 a.e.c. ${lanes.join(' ')}`);
  assert.equal(dragging, false);
  assert.ok(lanes.every((x) => x.endsWith(':0')), lanes.join(' '));
  // The ruler with a finger, then a one-finger drag: it moves time and keeps the scale.
  await goTo(p, 50.5, 8);
  await p.evaluate(() => { window.BE.lineaEstado.modoRegla = true; document.querySelector('#pista').classList.add('modo-regla'); });
  await T('touchStart', [{ x: r.x, y: r.y, id: 3 }]);
  for (let i = 1; i <= 6; i++) await T('touchMove', [{ x: r.x + i * 15, y: r.y, id: 3 }]);
  await T('touchEnd', []);
  await frames(p, 4);
  const a = await state(p);
  await T('touchStart', [{ x: r.x, y: r.y, id: 4 }]);
  for (let i = 1; i <= 12; i++) await T('touchMove', [{ x: r.x + i * 12, y: r.y + 1, id: 4 }]);
  await T('touchEnd', []);
  await frames(p, 4);
  const b = await state(p);
  const s0 = a.vista[1] - a.vista[0], s1 = b.vista[1] - b.vista[0];
  note(`430 ruler with a finger, then a drag: span ${s0} → ${s1}, view moved ${(a.vista[0] - b.vista[0]).toFixed(3)} years`);
  assert.ok(Math.abs(s1 - s0) < 1e-9, `the drag changed the scale ${s0} → ${s1}`);
  assert.ok(a.vista[0] - b.vista[0] > 0.5);
  await p.context().close();
});

test('430: with «Letra grande» a name on several lines keeps its lines apart and inside its row', async () => {
  const p = await open(PHONE, 't=50.5&v=8');
  await p.evaluate(() => document.documentElement.classList.add('be-letra-grande'));
  await frames(p, 4);
  const bad = [];
  for (const [t, s] of [[50.5, 8], [-1512.5, 4125]]) {
    await goTo(p, t, s);
    const r = await p.evaluate(() => [...document.querySelectorAll('#linea-filas .m-nombre.varias .t')].filter((x) => parseFloat(getComputedStyle(x).lineHeight) < parseFloat(getComputedStyle(x).fontSize)).map((x) => x.textContent));
    const walk = await walkLanes(p);
    bad.push(...r.map((x) => `${t}/${s}: «${x}» lines overlap`), ...walk.problems.map((x) => `${t}/${s}: ${x}`));
  }
  note(`430 letra grande: ${bad.length} problems`);
  assert.deepEqual(bad.slice(0, 10), []);
  await p.context().close();
});

test('1440: lanes alternate their background among the lanes shown, and every mark box lies inside its track', async () => {
  const p = await open(DESKTOP, 't=50.5&v=8');
  for (const [t, s] of [[50.5, 8], [50.5, 40], [-1512.5, 0.12], [-1512.5, 4125]]) {
    await goTo(p, t, s);
    const r = await p.evaluate(() => {
      const lanes = [...document.querySelectorAll('#linea-filas .carril:not([hidden])')];
      const same = [];
      for (let i = 1; i < lanes.length; i++) if (getComputedStyle(lanes[i]).backgroundColor === getComputedStyle(lanes[i - 1]).backgroundColor) same.push(`${lanes[i - 1].dataset.carril}|${lanes[i].dataset.carril}`);
      const out = [];
      for (const b of document.querySelectorAll('#linea-filas .m')) {
        const r = b.getBoundingClientRect(), pr = b.closest('.carril-pista').getBoundingClientRect();
        if (r.left < pr.left - 0.5 || r.right > pr.right + 0.5) out.push(`${b.dataset.id} ${Math.round(r.left - pr.left)}..${Math.round(r.right - pr.left)}`);
      }
      return { same, out, n: lanes.length };
    });
    note(`1440 ${t}/${s}: ${r.n} lanes, ${r.same.length} neighbours with one background, ${r.out.length} mark boxes out of their track`);
    assert.deepEqual(r.same, []); assert.deepEqual(r.out.slice(0, 5), []);
  }
  await p.context().close();
});

test('1440: the focus never falls out of the strip: a person released with Esc, the wheel over a focused mark', async () => {
  const p = await open(DESKTOP, 't=50.5&v=8');
  await p.evaluate(() => window.BE.seleccionar({ tipo: 'persona', id: 'silas' }, { mover: false }));
  await frames(p);
  const id = await p.evaluate(() => { const b = document.querySelector('#linea-filas .carril[data-carril="silas"] .m'); b.scrollIntoView({ block: 'center' }); b.focus(); return b.dataset.id; });
  await frames(p);
  await p.keyboard.press('Escape'); await frames(p, 4);
  const esc = await p.evaluate(() => ({ sel: window.BE.selTexto(window.BE.E.sel), silas: !!document.querySelector('#linea-filas .carril[data-carril="silas"]:not([hidden])'), focus: document.activeElement?.closest('#linea-filas .m') ? document.activeElement.dataset.id : document.activeElement?.tagName }));
  note(`1440 Esc on «${id}» of Silas: selection «${esc.sel}», Silas lane ${esc.silas ? 'still there' : 'gone'}, focus on ${esc.focus}`);
  assert.ok(!['BODY', 'HTML', undefined].includes(esc.focus), `the focus fell to ${esc.focus}`);
  await goTo(p, -1512.5, 4125);
  const first = await p.evaluate(() => { const b = document.querySelector('#linea-filas .m[tabindex="0"]'); b.focus(); return b.dataset.id; });
  // Over the lane names, where the wheel scrolls the lanes (over the tracks it zooms).
  const r = await p.evaluate(() => { const c = document.querySelector('#linea-cuerpo').getBoundingClientRect(), n = document.querySelector('#linea-filas .carril-rotulo').getBoundingClientRect(); return [n.left + n.width / 2, c.top + c.height / 2]; });
  await p.mouse.move(r[0], r[1]);
  const ids = new Set();
  for (let i = 0; i < 12; i++) { await p.mouse.wheel(0, 400); await frames(p); ids.add(await p.evaluate(() => document.activeElement?.dataset?.id || document.activeElement?.tagName)); }
  note(`1440 wheel ×12 with the focus on «${first}»: focus on ${[...ids].join(', ')}`);
  assert.deepEqual([...ids], [first]);
  await p.context().close();
});

/** The lane of a traveller as the timeline builds it (BE.lineaMarcas): the journeys of that person that have a stop on the
    map, the bars (one per journey), the stops and the rest of the marks, each with its group of rows. */
function travellerLane(p, id) {
  return p.evaluate((id) => {
    const BE = window.BE;
    const ms = BE.lineaMarcas().filter((m) => m.lane === id);
    const P = id === 'pablo' ? BE.P : BE.estancias(id).filter((s) => s.origen === 'viaje');
    const pick = (m) => ({ id: m.id, sel: m.sel, group: m.group, t0: m.t0, t1: m.t1, row: m.rowWorld, visible: m.visible, label: m.label, repite: m.repite });
    return {
      journeys: [...new Set(P.map((s) => s.viaje.id))].sort(),
      bars: ms.filter((m) => m.sel.startsWith('viaje:')).map(pick),
      stops: ms.filter((m) => m.sel.startsWith('parada:')).map((m) => ({ ...pick(m), journey: m.sel.slice(7).split('/')[0] })),
      rest: ms.filter((m) => !m.sel.startsWith('viaje:') && !m.sel.startsWith('parada:')).map(pick),
    };
  }, id);
}

/** Every lane label drawn: its name whole (no ellipsis, no clipped line) inside the label, and the label inside its lane.
    A word is split across lines only when it is wider than the box on its own («Gobernadores» on a phone), never
    «Je-sús» beside the age. */
function lanesLabels(p) {
  return p.evaluate(() => [...document.querySelectorAll('#linea-filas .carril:not([hidden]) .carril-rotulo .be-lane-label')].map((l) => {
    const s = l.querySelector('.carril-nombre') || l.querySelector(':scope > span:not(.edad):not(.be-tier)');
    if (!s) return null;
    const a = l.getBoundingClientRect(), b = s.getBoundingClientRect(), c = l.closest('.carril').getBoundingClientRect();
    const cs = getComputedStyle(s);
    const lh = parseFloat(cs.lineHeight) || b.height;
    const ctx = (window.__lanesCtx ||= document.createElement('canvas').getContext('2d'));
    ctx.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
    // The room the name could have: the label without its padding and its icon; a person's name, 75 % of it at most.
    const lcs = getComputedStyle(l), icon = l.querySelector(':scope > svg');
    const content = l.clientWidth - parseFloat(lcs.paddingLeft) - parseFloat(lcs.paddingRight);
    const room = content - (icon?.checkVisibility() ? icon.getBoundingClientRect().width + (parseFloat(lcs.columnGap) || 0) : 0);
    const inner = (s.classList.contains('carril-nombre') ? Math.min(room, 0.75 * content) : room) - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    const split = [];
    const walk = document.createTreeWalker(s, NodeFilter.SHOW_TEXT);
    for (let n = walk.nextNode(); n; n = walk.nextNode()) {
      if (!n.parentElement.checkVisibility()) continue;
      for (const m of n.data.matchAll(/\S+/g)) {
        const r = document.createRange();
        r.setStart(n, m.index); r.setEnd(n, m.index + m[0].length);
        const lines = new Set([...r.getClientRects()].map((x) => Math.round(x.top)));
        if (lines.size > 1 && ctx.measureText(m[0]).width <= inner + 0.5) split.push(m[0]);
      }
    }
    // Height on boxes, as in viajesWhole: with line height 1 the font's ascent and descent pass the line box.
    // The text itself, measured on its line boxes: scrollWidth would count the transparent ::after that widens a
    // button for a finger.
    const all = document.createRange();
    all.selectNodeContents(s);
    const tr = all.getBoundingClientRect();
    const why = [[tr.left < b.left - 0.5 || tr.right > b.right + 0.5, 'wider than its box'], [l.scrollHeight > l.clientHeight + 1, 'taller than its label'],
      [b.top < a.top - 0.5 || b.bottom > a.bottom + 0.5 || b.right > a.right + 0.5, 'out of its label'],
      [a.top < c.top - 0.5 || a.bottom > c.bottom + 0.5, `label ${Math.round(a.height)} px out of its lane of ${Math.round(c.height)}`],
      [split.length, `split ${split.map((w) => `«${w}»`).join(', ')}, which fits on its own`]].filter(([x]) => x).map(([, w]) => w);
    return { lane: l.closest('.carril').dataset.carril, name: s.textContent.trim(), lines: Math.round(b.height / lh), cut: why.join(', ') };
  }).filter(Boolean));
}

test('every traveller lane carries one bar per journey with its stops below, like «Viajes de Pablo»', async () => {
  for (const screen of [DESKTOP, PHONE]) {
    const p = await open(screen, 't=30.5&v=40');
    for (const id of ['jesus', 'david', 'abrahan']) {
      await p.evaluate((id) => window.BE.seleccionar({ tipo: 'persona', id }, { mover: false }), id);
      await frames(p);
      const L = await travellerLane(p, id);
      assert.ok(L.bars.length, `${screen.name} ${id}: no journey bar in the lane (${L.journeys.length} journeys, ${L.stops.length} stops as loose marks)`);
      const bad = [];
      if (JSON.stringify(L.bars.map((b) => b.sel.slice(6)).sort()) !== JSON.stringify(L.journeys)) bad.push(`bars ${L.bars.map((b) => b.sel)} for journeys ${L.journeys}`);
      for (const b of L.bars) if (b.group !== 0) bad.push(`${b.sel} in group ${b.group}`);
      for (const s of L.stops) {
        const b = L.bars.find((x) => x.sel === `viaje:${s.journey}`);
        if (s.group !== 1) bad.push(`${s.sel} in group ${s.group}`);
        if (!b || s.t0 < b.t0 - 1e-6 || s.t1 > b.t1 + 3 / 365) bad.push(`${s.sel} outside its bar`);
      }
      for (const r of L.rest) if (r.group !== 2) bad.push(`${r.sel} in group ${r.group}`);
      // In a view around its first journey: bars above stops and stops above the rest (in the rows of the world: a name
      // that does not fit beside a screen edge moves to an edge row at the bottom, as in every lane), every name whole.
      const first = L.bars.sort((a, b) => a.t0 - b.t0)[0];
      await goTo(p, (first.t0 + first.t1) / 2, Math.max(2, (first.t1 - first.t0) * 3));
      await p.evaluate((id) => window.BE.seleccionar({ tipo: 'persona', id }, { mover: false }), id);
      await frames(p);
      const V = await travellerLane(p, id);
      const rows = (xs) => xs.filter((x) => x.row != null).map((x) => x.row);
      const [rb, rs, rr] = [rows(V.bars), rows(V.stops), rows(V.rest)];
      // Every mark of the lane has its row, so an unpacked group cannot hide behind an empty list below.
      const noRow = [...V.bars, ...V.stops, ...V.rest].filter((x) => x.row == null).map((x) => x.sel);
      if (noRow.length) bad.push(`${noRow.length} marks without a row of the world: ${noRow.slice(0, 4).join(', ')}`);
      if (!rb.length || !rs.length || !rr.length) bad.push(`an empty band of rows: bars ${rb.length}, stops ${rs.length}, others ${rr.length}`);
      if (rb.length && rs.length && Math.max(...rb) >= Math.min(...rs)) bad.push(`a bar row ${Math.max(...rb)} is not above the stop rows from ${Math.min(...rs)}`);
      if (rs.length && rr.length && Math.max(...rs) >= Math.min(...rr)) bad.push(`a stop row ${Math.max(...rs)} is not above the other rows from ${Math.min(...rr)}`);
      const inView = V.bars.filter((x) => x.visible).length;
      const walk = await walkLanes(p);
      bad.push(...walk.problems.filter((x) => x.startsWith(`${id}:`)));
      note(`${screen.name} ${id}: ${L.journeys.length} journeys, ${L.bars.length} bars, ${L.stops.length} stops, ${L.rest.length} other marks; rows of the world: bars ${Math.min(...rb)}-${Math.max(...rb)}, stops ${Math.min(...rs)}-${Math.max(...rs)}, others from ${rr.length ? Math.min(...rr) : '-'}; ${inView} bars in view around «${first.sel}»; ${bad.length} problems`);
      assert.ok(inView > 0, `${id}: no bar in view around its first journey`);
      assert.deepEqual(bad, []);
    }
    // Clicking a bar of that lane selects the journey and leaves the lane where it was.
    await goTo(p, 30.5, 8);
    await p.evaluate(() => window.BE.seleccionar({ tipo: 'persona', id: 'jesus' }, { mover: false }));
    await frames(p);
    const bar = await p.evaluate(() => {
      const b = [...document.querySelectorAll('#linea-filas .carril[data-carril="jesus"] .m')].find((x) => x.dataset.sel.startsWith('viaje:'));
      if (!b) return null;
      b.scrollIntoView({ block: 'center' });
      const r = b.querySelector('.m-barra').getBoundingClientRect(), pr = b.closest('.carril-pista').getBoundingClientRect();
      const x0 = Math.max(r.left, pr.left + 2), x1 = Math.min(r.right, pr.right - 2);
      return { sel: b.dataset.sel, x: (x0 + x1) / 2, y: r.top + r.height / 2 };
    });
    assert.ok(bar, 'a bar of Jesús in view');
    if (screen.hasTouch) await p.touchscreen.tap(bar.x, bar.y); else await p.mouse.click(bar.x, bar.y);
    await frames(p);
    const after = await p.evaluate(() => ({ sel: window.BE.selTexto(window.BE.E.sel), lane: !!document.querySelector('#linea-filas .carril[data-carril="jesus"]:not([hidden])') }));
    note(`${screen.name} click on «${bar.sel}» in the lane of Jesús: selected ${after.sel}, lane ${after.lane ? 'still there' : 'gone'}`);
    assert.equal(after.sel, bar.sel);
    assert.ok(after.lane, 'the lane of Jesús stays while one of its marks is selected');
    await p.context().close();
    // The fixed lane keeps its id and its meaning in an old link: Pablo's eight journeys, each with its stops below.
    const q = await open(screen, 't=50.5&v=40&carriles=pablo');
    const P = await travellerLane(q, 'pablo');
    note(`${screen.name} carriles=pablo: ${P.bars.length} bars, ${P.stops.length} stops`);
    assert.equal(P.bars.length, 8);
    assert.ok(P.bars.every((b) => b.group === 0) && P.stops.length > 0 && P.stops.every((s) => s.group === 1));
    await q.context().close();
  }
});

test('no lane name is cut: each goes in as many lines as it needs, pinned, with «Letra grande» and with a person', async () => {
  for (const screen of [DESKTOP, PHONE]) {
    const all = [];
    const p = await open(screen, 't=-600.5&v=4125');
    const ids = await p.evaluate(() => window.BE.lineaCarriles().map((c) => c.id).filter((id) => id !== 'meses'));
    // The traveller with the longest name, selected: its lane goes by its name.
    const larga = await p.evaluate(() => { const BE = window.BE; return [...new Set(BE.D.viajes.map(BE.duenoViaje))].filter((id) => BE.PERS[id]).sort((a, b) => BE.PERS[b].nombre.length - BE.PERS[a].nombre.length)[0]; });
    // Last, eight years around 520 a.e.c.: lanes of a single row, so the lane has to grow to its name. There «Letra
    // grande» goes on, and then the window narrows, with the same lanes: the heights of the names are measured again
    // although the list of lanes did not change. Jesús in 30 e.c. carries his age beside his name, which takes room from it.
    const casos = [['milenios', null], ['persona jesus', 'jesus'], ['pinned', `t=-600.5&v=4125&carriles=${ids.join(',')}`], ['letra grande', 'grande'], [`persona ${larga}`, 'persona'],
      ['8 años', 'cerca'], ['8 años, letra grande', 'grande'], ['8 años, letra grande, más estrecho', 'estrecho']];
    let q = p;
    for (const [nombre, how] of casos) {
      if (how && how.startsWith('t=')) { q = await open(screen, how); }
      else if (how === 'grande') { await q.evaluate(() => window.BE.ponerPreferencia('letra-grande', true)); await frames(q, 4); }
      else if (how === 'jesus') { await goTo(q, 30.9, 8); await q.evaluate(() => window.BE.seleccionar({ tipo: 'persona', id: 'jesus' }, { mover: false })); await frames(q, 4); }
      else if (how === 'persona') { await q.evaluate((id) => window.BE.seleccionar({ tipo: 'persona', id }, { mover: false }), larga); await frames(q, 4); }
      else if (how === 'cerca') { await q.evaluate(() => window.BE.ponerPreferencia('letra-grande', false)); await goTo(q, -519.5, 8); await frames(q, 4); }
      else if (how === 'estrecho') { await q.setViewportSize({ width: screen.viewport.width - 70, height: screen.viewport.height }); await frames(q, 4); }
      const ls = await lanesLabels(q);
      const cut = ls.filter((l) => l.cut);
      note(`${screen.name} lane names (${nombre}): ${ls.length} labels, ${ls.filter((l) => l.lines > 1).map((l) => `«${l.name}» ${l.lines}`).join(', ') || 'all in one line'}; ${cut.length} cut${cut.length ? `: ${cut.map((l) => `«${l.name}» (${l.cut})`).join(', ')}` : ''}`);
      all.push(...cut.map((l) => `${nombre}: «${l.name}» (${l.lane}): ${l.cut}`));
      assert.ok(ls.length >= (nombre.startsWith('8 años') ? 3 : 8), `${nombre}: only ${ls.length} labels`);
    }
    await p.context().close();
    if (q !== p) await q.context().close();
    assert.deepEqual(all, []);
  }
});

test('a journey that repeated every year says «↻ cada año» after its name', async () => {
  for (const screen of [DESKTOP, PHONE]) {
    const p = await open(screen, 't=50.5&v=40');
    const found = [];
    for (const [persona, viaje] of [['elcana-hijo-de-jeroham', 'elcana-sube-a-silo'], ['samuel', 'recorrido-de-samuel'], ['jose-esposo-de-maria', 'pascua-de-jesus-a-los-12']]) {
      await p.evaluate((id) => window.BE.seleccionar({ tipo: 'persona', id }, { mover: false }), persona);
      await frames(p);
      const L = await travellerLane(p, persona);
      const b = L.bars.find((x) => x.sel === `viaje:${viaje}`);
      assert.ok(b, `${viaje}: a bar in the lane of ${persona}`);
      await goTo(p, (b.t0 + b.t1) / 2, 8);
      await p.evaluate((id) => window.BE.seleccionar({ tipo: 'persona', id }, { mover: false }), persona);
      await frames(p);
      const drawn = await p.evaluate((sel) => { const m = document.querySelector(`#linea-filas .m[data-sel="${sel}"] .m-nombre .t`); return m ? m.textContent : null; }, `viaje:${viaje}`);
      const others = L.bars.filter((x) => x.sel !== `viaje:${viaje}` && x.repite).map((x) => x.sel);
      note(`${screen.name} ${viaje}: label «${b.label}», drawn «${drawn}»`);
      found.push(viaje);
      assert.ok(b.repite && b.label.endsWith('↻ cada año'), b.label);
      assert.equal(drawn, b.label);
      assert.deepEqual(others, [], `${persona}: only the yearly journey carries the mark`);
    }
    // A journey that happened once carries no mark.
    const pablo = await travellerLane(p, 'pablo');
    assert.ok(pablo.bars.length && pablo.bars.every((x) => !x.repite && !/cada año/.test(x.label)));
    assert.equal(found.length, 3);
    await p.context().close();
  }
});

test('no console error, no page error and no failed request in the whole run', () => {
  assert.deepEqual(errors, []);
  assert.deepEqual(failed, []);
});
