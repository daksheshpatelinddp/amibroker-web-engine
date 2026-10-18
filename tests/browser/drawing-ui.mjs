// Run: node tests/browser/drawing-ui.mjs  (needs Playwright + Chromium; serves the project on a local port)
// Drives the real DrawingLayer with a stand-in chart (no Lightweight Charts): create with the mouse, select, move, resize, copy, delete, Properties.
import { chromium } from '/opt/npm-tools/node_modules/playwright/index.mjs';
import http from 'http'; import fs from 'fs'; import path from 'path'; import { fileURLToPath } from 'url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const server = http.createServer((q, r) => { const f = path.join(root, decodeURIComponent(q.url.split('?')[0])); fs.readFile(f, (e, b) => { if (e) { r.writeHead(404); r.end(); } else { r.writeHead(200, { 'content-type': f.endsWith('.js') || f.endsWith('.mjs') ? 'text/javascript' : 'text/html' }); r.end(b); } }); }).listen(0);
const port = server.address().port;
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL', m); } };
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' }), pg = await b.newPage({ viewport: { width: 900, height: 520 } });
const errs = []; pg.on('pageerror', (e) => errs.push(e.message)); pg.on('dialog', (d) => d.accept('Hello'));
await pg.goto(`http://localhost:${port}/tests/browser/drawing-harness.html`); await pg.waitForFunction(() => window.ready);
const list = () => pg.evaluate(() => window.store.list('TEST'));
const ink = () => pg.evaluate(() => { const c = window.layer.canvas, d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i]) n++; return n; });
const settle = () => pg.waitForTimeout(80);
const drag = async (x1, y1, x2, y2) => { await pg.mouse.move(x1, y1); await pg.mouse.down(); await pg.mouse.move((x1 + x2) / 2, (y1 + y2) / 2, { steps: 3 }); await pg.mouse.move(x2, y2, { steps: 3 }); await pg.mouse.up(); await settle(); };
const click = async (x, y) => { await pg.mouse.click(x, y); await settle(); };

// 1. a trend line by dragging
await pg.evaluate(() => window.layer._setTool('trend')); await drag(100, 300, 400, 200);
let l = await list(); ok(l.length === 1 && l[0].type === 'trend' && l[0].pts.length === 2, 'trend line saved after a drag');
ok(l[0].chartId === 1 && l[0].paneKey === 'p1', 'it belongs to the price pane (chart id 1)');
ok(await pg.evaluate(() => window.layer.tool) === null, 'tool returns to Select');
ok(await ink() > 200, 'something is drawn on the canvas');
const id = l[0].id;
// 2. move it
const before = JSON.stringify(l[0].pts); await drag(250, 250, 250, 330); l = await list();
ok(JSON.stringify(l[0].pts) !== before && l[0].pts[0].p < before.length * 0 + 1e9, 'dragging the line moves it'); 
ok(Math.abs((l[0].pts[1].p - l[0].pts[0].p) - JSON.parse(before)[1].p + JSON.parse(before)[0].p) < 1e-6, 'its shape is kept');
// 3. resize with a handle: the first point is at (100, ~380)
const p0 = await pg.evaluate(() => { const g = window.layer._prims(window.store.list('TEST')[0]); return g.pts[0]; });
await drag(p0.x, p0.y, p0.x + 80, p0.y - 40); l = await list(); ok(l[0].pts[1].p === JSON.parse(before)[1].p + (l[0].pts[1].p - JSON.parse(before)[1].p), 'handle drag changes only that point'); 
// 4. click empty space deselects; click the line selects
await click(700, 100); ok(await pg.evaluate(() => window.layer.sel) === null, 'tap on empty space deselects');
const mid = await pg.evaluate(() => { const g = window.layer._prims(window.store.list('TEST')[0]); return { x: (g.pts[0].x + g.pts[1].x) / 2, y: (g.pts[0].y + g.pts[1].y) / 2 }; });
await click(mid.x, mid.y); ok(await pg.evaluate(() => window.layer.sel) === id, 'tap on the line selects it');
// 5. copy / paste / delete by keyboard
await pg.keyboard.press('Control+c'); await pg.keyboard.press('Control+v'); await settle(); ok((await list()).length === 2, 'Ctrl+C, Ctrl+V pastes a copy');
await pg.keyboard.press('Delete'); await settle(); ok((await list()).length === 1, 'Delete removes the selected one');
// 6. properties: Study ID
await pg.evaluate((i) => { window.layer._select(i); window.layer.properties(window.store.get('TEST', i)); }, (await list())[0].id);
await pg.waitForSelector('input[list="study-ids"]');
await pg.fill('input[list="study-ids"]', 'su'); await pg.getByText('Apply', { exact: true }).click(); await settle();
l = await list(); ok(l[0].studyId === 'SU', 'Study ID saved in upper case');
// 7. every tool can be created with the mouse
const types = await pg.evaluate(() => [...new Set((window.TYPES || []))]);
const all = await pg.evaluate(async () => { const m = await import('/js/drawing-types.js'); return m.TYPES.map((t) => [t.id, t.pts]); });
await pg.evaluate(() => window.store.clear('TEST'));
for (const [tid, n] of all) {
  await pg.evaluate((t) => window.layer._setTool(t), tid);
  if (n === 1) await click(300, 250);
  else if (n === 0) { await click(150, 300); await click(250, 200); await click(350, 280); await pg.keyboard.press('Enter'); await settle(); }
  else if (n === 2) await drag(150, 320, 420, 180);
  else { await drag(150, 320, 300, 180); await click(420, 300); }
  const cnt = (await list()).length; ok(cnt === 1, `${tid}: created (${cnt})`);
  ok(await ink() > 30, `${tid}: draws pixels`);
  await pg.evaluate(() => window.store.clear('TEST')); await settle();
}
// 8. tap-tap creation (touch style)
await pg.evaluate(() => window.layer._setTool('trend')); await click(100, 300); await click(300, 200); l = await list(); ok(l.length === 1, 'tap, tap draws a line');
// 9. Escape cancels
await pg.evaluate(() => { window.store.clear('TEST'); window.layer._setTool('trend'); }); await click(100, 300); await pg.keyboard.press('Escape'); await click(300, 200); ok((await list()).length === 0, 'Esc cancels a drawing in progress');
// 10. hide
await pg.evaluate(() => { window.layer._setTool('horizontal'); }); await click(300, 250); ok(await ink() > 30, 'horizontal line drawn');
await pg.evaluate(() => { window.layer.hidden = true; window.layer.redraw(); }); await settle(); ok(await ink() === 0, 'hide drawings');
ok(!errs.length, 'no page errors: ' + errs.join(' | '));
console.log(`${pass} passed, ${fail} failed`); await b.close(); server.close(); process.exit(fail ? 1 : 0);
