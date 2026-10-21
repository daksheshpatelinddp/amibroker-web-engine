// Run: node tests/browser/categories-import-ui.mjs -- importing a big classification CSV in the real page (no crash, counts right) in the real app page: minimise keeps a running analysis, big result lists, big charts
import { chromium } from '/opt/npm-tools/node_modules/playwright/index.mjs';
import http from 'http'; import fs from 'fs'; import path from 'path'; import { fileURLToPath } from 'url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const server = http.createServer((q, r) => { const f = path.join(root, decodeURIComponent(q.url.split('?')[0])); fs.readFile(f, (e, b) => { if (e) { r.writeHead(404); r.end(); } else { r.writeHead(200, { 'content-type': f.endsWith('.js') ? 'text/javascript' : 'text/html' }); r.end(b); } }); }).listen(0);
const port = server.address().port; let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL', m); } };
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' }), pg = await b.newPage({ viewport: { width: 390, height: 780 } });
const errs = []; pg.on('pageerror', (e) => errs.push(e.message));
await pg.addInitScript(() => { window.tailwind = {}; });
await pg.route('**/*', (r) => { const u = r.request().url(); if (u.startsWith(`http://localhost:${port}`)) return r.continue(); if (u.includes('hyparquet')) return r.fulfill({ contentType: 'text/javascript', body: 'export const parquetMetadataAsync=()=>{};export const parquetRead=()=>{};export const parquetReadObjects=()=>{};' }); return r.abort(); });
pg.on('crash', () => { console.log('PAGE CRASHED'); fail++; });
await pg.goto(`http://localhost:${port}/index.html`); await pg.waitForTimeout(1500);
// a 4517-symbol database and an NSE-like classification CSV served from localhost
const N = 4517, all = Array.from({ length: N }, (_, i) => 'SYM' + i);
const idx = ['NIFTY 50', 'NIFTY NEXT 50', 'NIFTY 100', 'NIFTY 200', 'NIFTY 500', 'NIFTY TOTAL MARKET', 'NIFTY BANK', 'NIFTY IT'];
const lines = ['Symbol,Group,Sector,Industry']; const want = {};
for (let i = 0; i < 755; i++) {
  const g = []; if (i < 50) g.push('NIFTY 50'); if (i >= 50 && i < 100) g.push('NIFTY NEXT 50'); if (i < 100) g.push('NIFTY 100'); if (i < 200) g.push('NIFTY 200'); if (i < 500) g.push('NIFTY 500'); g.push('NIFTY TOTAL MARKET'); if (i % 30 === 0) g.push('NIFTY BANK'); if (i % 40 === 1) g.push('NIFTY IT');
  g.forEach((x) => { want[x] = (want[x] || 0) + 1; });
  lines.push(`SYM${i},${g.join('|')},Sector ${i % 20},${i % 30 === 0 ? 'Bank' : 'Sector ' + (i % 20)}`);
}
const csv = lines.join('\r\n') + '\r\n';
await pg.route('**/nse-test.csv', (r) => r.fulfill({ status: 200, contentType: 'text/csv', headers: { 'access-control-allow-origin': '*' }, body: csv }));
await pg.evaluate(async (all) => {
  const { host } = await import('/js/host.js'); host.symbols = () => all; host.symbol = () => 'SYM0'; host.activeDb = () => 'nse'; host.symbolsOf = async () => all;
  window.prompt = () => `http://localhost:${location.port}/nse-test.csv`; window.confirm = () => true;
  const { categoryStore } = await import('/js/category-store.js'); window.__writes = 0; const ls = Storage.prototype.setItem; Storage.prototype.setItem = function (k, v) { if (/categories/.test(k)) window.__writes++; return ls.call(this, k, v); };
  await import('/js/categories-ui.js').then((m) => m.openCategories({ type: 'groups' }));
}, all);
await pg.waitForSelector('text=Import classification from link', { timeout: 5000 });
const t0 = Date.now(); await pg.evaluate(() => { window.__writes = 0; });
await pg.getByRole('button', { name: 'Import classification from link…' }).click();
await pg.waitForSelector('text=/755 rows/', { timeout: 20000 }); const ms = Date.now() - t0;
ok(ms < 8000, 'import done in ' + ms + ' ms');
ok(await pg.evaluate(() => window.__writes) <= 3, 'store saved ' + await pg.evaluate(() => window.__writes) + ' times');
const got = await pg.evaluate(async () => { const { categoryStore } = await import('/js/category-store.js'); const st = categoryStore('nse'); const o = {}; st.names('groups').forEach((n) => { o[n] = st.count('groups', n); }); return o; });
for (const [g, n] of Object.entries(want)) ok(got[g] === n, `${g}: ${got[g]} of ${n}`);
// again: replaces, same numbers, no duplicates
await pg.getByRole('button', { name: 'Import classification from link…' }).click(); await pg.waitForTimeout(1500);
const got2 = await pg.evaluate(async () => { const { categoryStore } = await import('/js/category-store.js'); const st = categoryStore('nse'); return st.count('groups', 'NIFTY 500'); });
ok(got2 === 500, 'second import keeps NIFTY 500 at 500: ' + got2);
ok(!errs.length, 'no page errors: ' + errs.join(' | '));
console.log(`${pass} passed, ${fail} failed`); await b.close(); server.close(); process.exit(fail ? 1 : 0);
