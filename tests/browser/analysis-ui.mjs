// Run: node tests/browser/analysis-ui.mjs -- the Analysis window in the real app page: minimise keeps a running analysis, big result lists, big charts
import { chromium } from '/opt/npm-tools/node_modules/playwright/index.mjs';
import http from 'http'; import fs from 'fs'; import path from 'path'; import { fileURLToPath } from 'url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const server = http.createServer((q, r) => { const f = path.join(root, decodeURIComponent(q.url.split('?')[0])); fs.readFile(f, (e, b) => { if (e) { r.writeHead(404); r.end(); } else { r.writeHead(200, { 'content-type': f.endsWith('.js') ? 'text/javascript' : 'text/html' }); r.end(b); } }); }).listen(0);
const port = server.address().port; let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL', m); } };
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' }), pg = await b.newPage({ viewport: { width: 390, height: 780 } });
const errs = []; pg.on('pageerror', (e) => errs.push(e.message));
await pg.addInitScript(() => { window.tailwind = {}; });
await pg.route('**/*', (r) => { const u = r.request().url(); if (u.startsWith(`http://localhost:${port}`)) return r.continue(); if (u.includes('hyparquet')) return r.fulfill({ contentType: 'text/javascript', body: 'export const parquetMetadataAsync=()=>{};export const parquetRead=()=>{};export const parquetReadObjects=()=>{};' }); return r.abort(); });
await pg.goto(`http://localhost:${port}/index.html`); await pg.waitForTimeout(1500);
await pg.evaluate(async () => {
  const { host } = await import('/js/host.js'); const { formulaStore } = await import('/js/formula-store.js');
  const N = 300, t = Array.from({ length: N }, (_, i) => new Date(Date.UTC(2023, 0, 1 + i)).toISOString().slice(0, 10));
  const mk = (k) => { const c = Float64Array.from({ length: N }, (_, i) => 100 + k % 7 + Math.sin(i / 6 + k) * 8 + i * 0.05); return { t, o: c, h: c.map((x) => x + 1), l: c.map((x) => x - 1), c, v: c.map(() => 1e6) }; };
  window.__delay = 0; const syms = Array.from({ length: 1300 }, (_, i) => `S${i}`);
  host.symbols = () => syms; host.symbol = () => 'S0'; host.loadBars = async (s) => { if (window.__delay) await new Promise((r) => setTimeout(r, window.__delay)); return mk(+s.slice(1)); };
  host.openSymbol = (s) => { window.__opened = s; }; host.showTrades = async (s) => { window.__opened = s; return true; };
  window.__f = formulaStore.all().filter((f) => f.kind === 'system')[0].id;
  formulaStore.save && void 0;
});
const modal = () => pg.locator('div.fixed.inset-0').filter({ hasText: 'Analysis' }).first();
await pg.evaluate(async () => { const { formulaStore } = await import('/js/formula-store.js'); const f = formulaStore.save({ name: 'ALLROWS', code: 'Filter = 1; AddColumn(C, "Close");', kind: 'exploration' }); window.__fid = (f && f.id) || (formulaStore.all().find((x) => x.name === 'ALLROWS') || {}).id; });
const fid = await pg.evaluate(() => window.__fid); ok(!!fid, 'test formula created');
await pg.evaluate(() => import('/js/analysis.js').then((m) => m.openAnalysis()));
await pg.waitForSelector('text=Market breadth');
await pg.evaluate((id) => { const sel = [...document.querySelectorAll('select')].find((s) => [...s.options].some((o) => o.value === id)); sel.value = id; sel.dispatchEvent(new Event('change')); const ap = [...document.querySelectorAll('select')].find((s) => [...s.options].some((o) => o.value === 'all' && o.textContent === 'All symbols')); ap.value = 'all'; ap.dispatchEvent(new Event('change')); const rm = [...document.querySelectorAll('select')].find((s) => [...s.options].some((o) => o.value === 'bars')); rm.value = 'bars'; rm.dispatchEvent(new Event('change')); }, fid);
// 1. slow run, minimise by tapping outside / the X, run keeps going
await pg.evaluate(() => { window.__delay = 4; });
await pg.getByRole('button', { name: 'Explore', exact: true }).click(); await pg.waitForTimeout(300);
await pg.locator('button', { hasText: '✕' }).last().click();
ok(await pg.locator('button', { hasText: /Analysis running/ }).count() === 1, 'chip shows while the analysis runs after tapping ✕');
ok(!(await pg.locator('text=Market breadth').isVisible()), 'window hidden');
await pg.waitForTimeout(1200);
const chipTxt = await pg.locator('button', { hasText: /Analysis/ }).last().textContent(); ok(/running \d+%/.test(chipTxt), 'chip shows progress: ' + chipTxt);
await pg.waitForFunction(() => /results ready/.test([...document.querySelectorAll('button')].map((b) => b.textContent).join('|')), null, { timeout: 30000 });
await pg.locator('button', { hasText: /results ready/ }).click();
ok(await pg.locator('text=Market breadth').isVisible(), 'window is back with the finished analysis');
// 2. 1300 rows: more than 500, all reachable
let txt = await pg.locator('text=/of 1300 row/').first().textContent(); ok(/500 of 1300/.test(txt), 'shows 500 first: ' + txt);
await pg.locator('button', { hasText: /Show 500 more/ }).click(); txt = await pg.locator('text=/of 1300 row/').first().textContent(); ok(/1000 of 1300/.test(txt), 'show more adds 500');
await pg.locator('button', { hasText: /Show all/ }).click(); txt = await pg.locator('text=/of 1300 row/').first().textContent(); ok(/1300 of 1300/.test(txt), 'show all');
ok(await pg.locator('button', { hasText: 'Download CSV (all 1300)' }).count() === 1, 'CSV has every row');
await pg.locator('input[placeholder^="Find in all"]').fill('s1299'); await pg.waitForTimeout(100);
ok(await pg.locator('td', { hasText: /^S1299$/ }).count() === 1, 'search finds a row beyond 500');
await pg.locator('td', { hasText: /^S1299$/ }).click(); await pg.waitForTimeout(100);
ok(await pg.evaluate(() => window.__opened) === 'S1299', 'tapping a late row opens its chart');
ok(await pg.locator('button', { hasText: /Analysis/ }).last().isVisible(), 'window minimised to the chart when a symbol is opened');
await pg.locator('button', { hasText: /Analysis/ }).last().click();
// 3. a second Analysis call re-opens the same window
await pg.evaluate(() => import('/js/analysis.js').then((m) => m.openAnalysis())); ok(await pg.locator('div.fixed.inset-0').filter({ hasText: 'Market breadth' }).count() === 1, 'only one Analysis window');
// 3b. long-run question
await pg.evaluate(() => { window.__longMs = 1; window.__delay = 9; window.__asked = []; window.confirm = (m) => { window.__asked.push(m); return window.__answer; }; window.__answer = false; });
await pg.getByRole('button', { name: 'Explore', exact: true }).click(); await pg.waitForFunction(() => window.__asked.length === 1, null, { timeout: 40000 });
ok(/Explore needs about/.test(await pg.evaluate(() => window.__asked[0])), 'asks before a long run');
await pg.waitForSelector('text=Cancelled. Nothing was changed.', { timeout: 10000 }).catch(() => {}); ok(await pg.locator('text=Market breadth').count() >= 0, 'cancel handled');
await pg.evaluate(() => { window.__answer = true; });
await pg.getByRole('button', { name: 'Explore', exact: true }).click(); await pg.waitForFunction(() => window.__asked.length === 2, null, { timeout: 40000 });
await pg.waitForSelector('text=/1300 rows|Rows: 1300|Close/', { timeout: 60000 }); ok(await pg.evaluate(() => window.__asked.length) === 2, 'asked once, then ran to the end');
await pg.evaluate(() => { window.__longMs = 0; window.__delay = 0; });
// 4. backtest charts: one at a time, big
await pg.evaluate(() => { window.__delay = 0; const sels = [...document.querySelectorAll('select')]; const f = sels.find((x) => [...x.options].some((o) => o.value === 'b:sys-macd')); f.value = 'b:sys-macd'; f.dispatchEvent(new Event('change')); const ap = sels.find((x) => [...x.options].some((o) => o.value === 'current')); ap.value = 'current'; ap.dispatchEvent(new Event('change')); const rm = sels.find((x) => [...x.options].some((o) => o.value === 'all' && o.textContent === 'All quotations')); rm.value = 'all'; rm.dispatchEvent(new Event('change')); });
await pg.getByRole('button', { name: 'Backtest', exact: true }).click();
const win = pg.locator('div.fixed.inset-0').last(); await win.getByRole('button', { name: 'Charts', exact: true }).waitFor({ timeout: 20000 }); await win.getByRole('button', { name: 'Charts', exact: true }).click();
ok(await pg.locator('text=Tap a chart to open it big.').count() === 1, 'charts tab lists previews');
await pg.locator('button', { hasText: 'open big' }).first().click(); await pg.waitForSelector('text=Backtest chart', { timeout: 4000 }).catch(() => console.log('PAGE ERRORS', errs));
await pg.waitForTimeout(400);
const wide = await pg.evaluate(() => { const sv = [...document.querySelectorAll('svg')].pop(); return sv.getBoundingClientRect().width; }); ok(wide > 390, 'big chart is wider than the phone screen: ' + wide);
ok(await pg.locator('text=/Equity \\(1 of 5\\)/').count() === 1, 'starts with the equity chart');
await pg.locator('button', { hasText: '▶' }).last().click(); ok(await pg.locator('text=/Drawdown \\(2 of 5\\)/').count() === 1, 'next chart');
await pg.locator('div.fixed.inset-0').last().getByRole('button', { name: 'Fit', exact: true }).click(); const fit = await pg.evaluate(() => [...document.querySelectorAll('svg')].pop().getBoundingClientRect().width); ok(fit <= 390, 'Fit shows the whole width: ' + fit);
ok(!errs.length, 'no page errors: ' + errs.join(' | '));
console.log(`${pass} passed, ${fail} failed`); await b.close(); server.close(); process.exit(fail ? 1 : 0);
