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
// in-memory GitHub: contents API + dispatch (the job "finishes" instantly with a fake result)
const files = {}, calls = []; 
await pg.route('https://api.github.com/**', async (r) => {
  const q = r.request(), u = new URL(q.url()), m = q.method(); calls.push(m + ' ' + u.pathname);
  const cm = u.pathname.match(/\/repos\/([^/]+\/[^/]+)\/contents\/(.+)$/);
  if (cm) { const p = decodeURIComponent(cm[2]);
    if (m === 'GET') { if (!(p in files)) return r.fulfill({ status: 404, body: '{}' }); const raw = (q.headers().accept || '').includes('raw'); return r.fulfill({ status: 200, contentType: 'application/json', body: raw ? files[p] : JSON.stringify({ sha: 'x' + files[p].length }) }); }
    if (m === 'PUT') { const b = JSON.parse(q.postData()); files[p] = Buffer.from(b.content, 'base64').toString('utf8'); return r.fulfill({ status: 201, body: '{}' }); } }
  if (u.pathname.endsWith('/dispatches')) { const id = JSON.parse(q.postData()).inputs.job; const job = JSON.parse(files[`jobs/${id}/job.json`]);
    files[`jobs/${id}/status.json`] = JSON.stringify({ state: 'done', shards: job.shards, run: 1 });
    const mk = (v) => ({ values: { P: v }, stats: { netProfit: v * 100, netProfitPct: v, cagr: v, maxDrawdownPct: 5, trades: 10, profitFactor: 2, exposure: 50, riskAdjReturn: 1, carMdd: v / 5 } });
    files[`jobs/${id}/result.json`] = JSON.stringify({ v: 1, mode: job.mode, finishedAt: Date.now(), elapsedMs: 3600000, result: { rows: [mk(9), mk(7), mk(3)], optParams: [{ name: 'P' }], errors: [], engine: 'exhaustive', tested: 3, combinations: 3, next: 3, completed: true, metric: 'carMdd' } });
    return r.fulfill({ status: 204, body: '' }); }
  if (u.pathname.endsWith('/workflows/analysis.yml')) return r.fulfill({ status: 200, body: '{}' });
  return r.fulfill({ status: 404, body: '{}' });
});
await pg.evaluate(async () => {
  const { host } = await import('/js/host.js'); const { formulaStore } = await import('/js/formula-store.js');
  const N = 300, t = Array.from({ length: N }, (_, i) => new Date(Date.UTC(2023, 0, 1 + i)).toISOString().slice(0, 10));
  const c = Float64Array.from({ length: N }, (_, i) => 100 + Math.sin(i / 6) * 8 + i * 0.05);
  host.symbols = () => ['A', 'B']; host.symbol = () => 'A'; host.loadBars = async () => ({ t, o: c, h: c.map((x) => x + 1), l: c.map((x) => x - 1), c, v: c.map(() => 1000) });
  host.openSymbol = () => {}; window.__confirms = []; window.confirm = (m) => { window.__confirms.push(m); return true; };
  const f = formulaStore.save({ name: 'OPTF', code: 'p = Optimize("P", 5, 1, 10, 1); Buy = Cross(C, MA(C, p)); Sell = Cross(MA(C, p), C);', kind: 'system' }); window.__fid = f && f.id;
});
await pg.evaluate(() => import('/js/analysis.js').then((m) => m.openAnalysis()));
await pg.waitForSelector('text=Market breadth');
await pg.evaluate(() => { const sel = [...document.querySelectorAll('select')].find((s) => [...s.options].some((o) => o.value === window.__fid)); sel.value = window.__fid; sel.dispatchEvent(new Event('change')); });
await pg.evaluate(() => { const s = [...document.querySelectorAll('select')].find((x) => [...x.options].some((o) => o.value === 'all' || o.value === 'current')); if (s) { s.value = [...s.options].some((o) => o.value === 'all') ? 'all' : 'current'; s.dispatchEvent(new Event('change')); } });
await pg.locator('#aa-github').click(); await pg.waitForSelector('text=Run on GitHub', { timeout: 3000 });
ok(await pg.locator('text=No jobs sent yet.').count() === 1, 'empty job list');
// no token: refuses
await pg.getByRole('button', { name: 'Send Optimize' }).click(); await pg.waitForTimeout(200);
ok(calls.length === 0, 'nothing is sent without repo and token');
await pg.locator('input[placeholder^="owner/"]').fill('me/runner'); await pg.locator('input[type=password]').fill('ghp_test');
await pg.getByRole('button', { name: 'Save & test' }).click(); await pg.waitForTimeout(300);
ok(calls.some((c) => c.endsWith('/workflows/analysis.yml')), 'Save & test checks the workflow exists');
await pg.getByRole('button', { name: 'Send Optimize' }).click(); await pg.waitForTimeout(1200);
const jobKey = Object.keys(files).find((k) => k.endsWith('job.json')); ok(!!jobKey, 'job.json written');
const job = JSON.parse(files[jobKey] || '{}');
ok(job.mode === 'optimize' && job.symbols.length === 2 && /Optimize\(/.test(job.code) && job.interval === 'D' && job.dataset && job.dataset.baseUrl && job.shards === 6 && job.keep === 5000, 'job has formula, symbols, dataset, shards, keep: ' + JSON.stringify({ m: job.mode, s: job.shards, k: job.keep }));
ok(calls.some((c) => c.startsWith('POST') && c.endsWith('/dispatches')), 'workflow started');
ok((await pg.evaluate(() => window.__confirms.length)) === 1, 'asked before sending');
await pg.waitForSelector('text=finished', { timeout: 5000 });
ok(await pg.locator('text=Open on GitHub').count() === 1, 'job card with Actions link');
await pg.getByRole('button', { name: 'View result' }).click(); await pg.waitForSelector('text=Result from GitHub', { timeout: 5000 });
ok(await pg.locator('td', { hasText: /^9\.00$/ }).count() >= 1, 'result rows shown in the table');
ok(await pg.locator('text=/Best: P = 9/').count() >= 1, 'best row line');
// persistence of the job list + settings
const saved = await pg.evaluate(() => [localStorage.getItem('aa_remote_cfg_v1'), localStorage.getItem('aa_remote_jobs_v1')]);
ok(/me\/runner/.test(saved[0]) && JSON.parse(saved[1]).length === 1, 'repo and job list kept in this browser');
ok(!errs.length, 'no page errors: ' + errs.join(' | '));
console.log(`${pass} passed, ${fail} failed`); await b.close(); server.close(); process.exit(fail ? 1 : 0);
