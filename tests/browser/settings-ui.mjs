// Run: node tests/browser/settings-ui.mjs -- the Analysis Settings dialog in the real app page: every tab opens, AmiBroker's controls are there and write into the settings
import { chromium } from '/opt/npm-tools/node_modules/playwright/index.mjs';
import http from 'http'; import fs from 'fs'; import path from 'path'; import { fileURLToPath } from 'url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const mime = { '.js': 'text/javascript', '.html': 'text/html', '.css': 'text/css', '.json': 'application/json' };
const server = http.createServer((q, r) => { const f = path.join(root, decodeURIComponent(q.url.split('?')[0])); fs.readFile(f, (e, b) => { if (e) { r.writeHead(404); r.end(); } else { r.writeHead(200, { 'content-type': mime[path.extname(f)] || 'application/octet-stream' }); r.end(b); } }); }).listen(0);
await new Promise((r) => server.on('listening', r));
const port = server.address().port; let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL', m); } };
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' }), pg = await b.newPage({ viewport: { width: 390, height: 780 } });
const errs = []; pg.on('pageerror', (e) => errs.push(e.message));
await pg.addInitScript(() => { window.tailwind = {}; });
await pg.route('**/*', (r) => { const u = r.request().url(); if (u.startsWith(`http://localhost:${port}`)) return r.continue(); if (u.includes('hyparquet')) return r.fulfill({ contentType: 'text/javascript', body: 'export const parquetMetadataAsync=()=>{};export const parquetRead=()=>{};export const parquetReadObjects=()=>{};export const parquetMetadata=()=>{};export const asyncBufferFromUrl=()=>{};' }); return r.fulfill({ contentType: 'text/javascript', body: '' }); });
await pg.goto(`http://localhost:${port}/index.html`); await pg.waitForTimeout(1500);
await pg.evaluate(() => import('/js/analysis-settings-ui.js').then((m) => m.openAnalysisSettings({})));
await pg.waitForSelector('text=Analysis settings');
const tabNames = await pg.evaluate(() => [...document.querySelectorAll('button')].map((x) => x.textContent).filter((t) => ['General', 'Trades', 'Stops', 'Report', 'Portfolio', 'Walk-Forward', 'Monte Carlo', 'Optimize'].includes(t)));
ok(JSON.stringify(tabNames) === JSON.stringify(['General', 'Trades', 'Stops', 'Report', 'Portfolio', 'Walk-Forward', 'Monte Carlo', 'Optimize']), 'tab order ' + tabNames);
const text = () => pg.evaluate(() => document.body.innerText);
let t = await text();
for (const s of ['Pad and align all data to reference symbol', 'Initial equity:', 'Max. pos. value:', 'Round lot size:', '(zero means allow fractional # of shares)', 'commission table', '$ per share/contract', 'Fixed annual interest [%]:', 'Define...', 'Allow same bar exit / entry signal']) ok(t.includes(s), 'General has: ' + s);
// commission table dialog
await pg.getByRole('button', { name: 'Define...' }).click(); await pg.waitForSelector('text=Commission Table');
t = await text(); for (const s of ['Default', 'Tier 1', 'Tier 5', 'Tier Unit', 'Tier Minimum', 'Min % of value', 'Max % of value']) ok(t.includes(s), 'Commission table has: ' + s);
await pg.getByRole('button', { name: 'Close', exact: true }).click();
for (const [tab, items] of [['Trades', ['Scenario:', 'Custom (consult the manual)', 'Buy price', 'Buy delay']], ['Stops', ['Activate stops immediately', 'Maximum loss stop', 'Profit target', 'Trailing stop', 'N-bar stop', 'percent of profit', 'Has priority', 'Re-entry delay:']], ['Report', ['Result list shows:', 'Trade list', 'Detailed log', 'Summary', 'Risk-free rate for Sharpe ratio:']], ['Portfolio', ['Max. Open Positions:', 'Limit trade size as % of entry bar volume:', 'Use previous bar equity for position sizing']], ['Walk-Forward', ['Easy mode (EOD)', 'Advanced mode', 'In-sample data', 'Out-of-sample data', 'Optimization target:', 'periods:']], ['Monte Carlo', ['Enable Monte Carlo simulation', 'Straw broom chart plots:']], ['Optimize', ['Search']]]) {
  await pg.getByRole('button', { name: tab, exact: true }).click(); t = await text();
  for (const s of items) ok(t.includes(s), `${tab} has: ${s}`);
}
// the Optimization target list is AmiBroker's (+ the app's two extras)
const opts = await pg.evaluate(() => { const s = [...document.querySelectorAll('select')].find((x) => [...x.options].some((o) => o.text === '# of losers')); return s ? [...s.options].map((o) => o.text) : []; });
ok(opts[0] === '# of losers' && opts.includes('W. Tot. Profit') && opts.includes('CAR/MDD') && opts.length === 38, 'targets ' + opts.length);
// Scenario 1 sets prices/delays/stops exit and locks them
await pg.getByRole('button', { name: 'Trades', exact: true }).click();
await pg.evaluate(() => { const s = [...document.querySelectorAll('select')].find((x) => [...x.options].some((o) => o.text.startsWith('trade NEXT BAR on OPEN, the stops exit INTRADAY'))); s.value = '1'; s.dispatchEvent(new Event('change')); });
await pg.waitForTimeout(100);
const locked = await pg.evaluate(() => { const i = [...document.querySelectorAll('input[type=number]')]; return i.filter((x) => x.disabled).length; });
ok(locked >= 4, 'delays locked under a scenario ' + locked);
const vals = await pg.evaluate(() => [...document.querySelectorAll('input[type=number]')].map((x) => x.value).slice(0, 4).join());
ok(vals === '1,1,1,1', 'delays 1 ' + vals);
// stops: enable the maximum loss as percent
await pg.getByRole('button', { name: 'Stops', exact: true }).click();
await pg.evaluate(() => { const r = [...document.querySelectorAll('input[type=radio]')].find((x) => x.nextSibling && x.nextSibling.textContent === 'percent'); r.click(); });
await pg.waitForTimeout(100);
await pg.getByRole('button', { name: 'Save', exact: true }).click();
const saved = await pg.evaluate(() => JSON.parse(localStorage.getItem('aa_settings_v1')));
ok(saved.scenario === 1 && saved.stops.maxLoss.on === true && saved.trades.buyDelay === 1 && saved.trades.buyPrice === 'open' && saved.stops.maxLoss.exitAt === 1, 'saved ' + JSON.stringify(saved.stops.maxLoss));
ok(errs.length === 0, 'page errors: ' + errs.join(' | '));
console.log(`${pass} passed, ${fail} failed`); await b.close(); server.close();
