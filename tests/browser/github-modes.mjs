// Run (needs the runner repo next to this one):
//   RUNNER_DIR=/path/to/amibroker-analysis-runner node --import $RUNNER_DIR/src/register.mjs tests/browser/github-modes.mjs
// The real Analysis window in Chromium: Scan / Explore / Backtest run on the phone, then sent to a FAKE GitHub whose machines are the REAL
// runner code (plan / shards / merge). The screens made from the GitHub result must show the same as the screens of the local run.
import fs from 'fs'; import path from 'path'; import zlib from 'zlib'; import { pathToFileURL } from 'url';
import { serve, launch, root } from './_serve.mjs';
const RUNNER = process.env.RUNNER_DIR || '/home/claude/work/runner/amibroker-analysis-runner';
if (!fs.existsSync(RUNNER)) { console.log('github-modes: skipped (set RUNNER_DIR)'); process.exit(0); }
process.env.NO_JITTER = '1';
const imp = (f) => import(pathToFileURL(path.join(RUNNER, 'src', f)).href);
const { loadEngine } = await imp('engine.mjs'), { planJob, runShard, mergeJob } = await imp('jobs.mjs');
const engine = await loadEngine(root);
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL', m); } };

const { server, port } = await serve();
const files = new Map(); let shaN = 1; const dispatched = []; const running = [];
const store = {                                                                // what the runner sees: the same files the app writes through the GitHub API
  async get(p) { return files.has(p) ? JSON.parse(files.get(p).text) : null; },
  async put(p, o) { files.set(p, { text: JSON.stringify(o), sha: 's' + shaN++ }); }, async dispatch() { return false; } };
async function runJob(id) {
  const job = await store.get(`jobs/${id}/job.json`); job.dataset = { ...job.dataset, baseUrl: `http://localhost:${port}/r2/nse` }; await store.put(`jobs/${id}/job.json`, job);   // the machines read the test data
  for (let round = 0; round < 5; round++) { const { shards } = await planJob(store, id); for (const i of shards) await runShard(store, engine, id, i, { progressMs: 50 }); const r = await mergeJob(store, engine, id); if (r.state !== 'continue') break; }
}
const b = await launch(); const ctx = await b.newContext(); const pg = await ctx.newPage(); const errs = []; pg.on('pageerror', (e) => errs.push(e.message));
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };
await ctx.route('https://api.github.com/**', async (route) => {
  const req = route.request(), u = new URL(req.url()), m = req.method();
  if (m === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
  const cm = u.pathname.match(/^\/repos\/[^/]+\/[^/]+\/contents\/(.+)$/);
  if (cm) {
    const p = decodeURIComponent(cm[1]);
    if (m === 'GET' && p === 'jobs') { const ids = [...new Set([...files.keys()].filter((k) => k.startsWith('jobs/')).map((k) => k.split('/')[1]))]; return route.fulfill({ status: 200, headers: CORS, json: ids.map((n) => ({ name: n, type: 'dir', path: 'jobs/' + n })) }); }
    if (m === 'GET' && !files.has(p) && [...files.keys()].some((k) => k.startsWith(p + '/'))) { const kids = [...files.entries()].filter(([k]) => k.startsWith(p + '/') && !k.slice(p.length + 1).includes('/')); return route.fulfill({ status: 200, headers: CORS, json: kids.map(([k, f]) => ({ name: k.split('/').pop(), type: 'file', size: f.text.length, path: k })) }); }
    if (m === 'GET') {
      if (!files.has(p)) return route.fulfill({ status: 404, headers: CORS, body: '{}' });
      const f = files.get(p); if (/raw/.test(req.headers().accept || '')) return route.fulfill({ status: 200, headers: CORS, contentType: 'application/json', body: f.text });
      return route.fulfill({ status: 200, headers: CORS, json: { sha: f.sha, content: Buffer.from(f.text).toString('base64') } });
    }
    if (m === 'PUT') { const body = JSON.parse(req.postData()); const sha = 's' + shaN++; files.set(p, { text: Buffer.from(body.content, 'base64').toString('utf8'), sha }); return route.fulfill({ status: 201, headers: CORS, json: { content: { sha } } }); }
  }
  if (/\/actions\/workflows\/analysis\.yml\/dispatches$/.test(u.pathname) && m === 'POST') { const { inputs } = JSON.parse(req.postData()); dispatched.push(inputs.job); running.push(runJob(inputs.job)); return route.fulfill({ status: 204, headers: CORS, body: '' }); }
  if (/\/actions\/workflows\/analysis\.yml$/.test(u.pathname)) return route.fulfill({ status: 200, headers: CORS, json: { id: 1 } });
  return route.fulfill({ status: 404, headers: CORS, body: '{}' });
});
await pg.route('https://cdn.jsdelivr.net/npm/hyparquet**', (r) => r.fulfill({ contentType: 'text/javascript', body: 'export const parquetMetadataAsync = async () => {}; export const parquetRead = async () => {};' }));
const dialogs = []; pg.on('dialog', (d) => { dialogs.push(d.message()); d.accept(); });
await pg.goto(`http://localhost:${port}/tests/browser/analysis-harness.html`); await pg.waitForFunction(() => window.ready);

const FORMULAS = {
  scan: { name: 'T Scan', kind: 'system', code: 'Buy = C > MA(C, 20); Sell = C < MA(C, 20);' },
  explore: { name: 'T Explore', kind: 'exploration', code: 'Filter = C > MA(C, 20) AND Ref(C, -1) <= MA(Ref(C, -1), 20); AddColumn(C, "Close", 1.2); AddColumn(Ref(C, -30), "C30", 1.2); AddColumn(RSI(14), "RSI", 1.2); SetSortColumns(-3, 1); AddSummaryRows(1 + 8, 1.2);' },
  opt: { name: 'T Opt', kind: 'system', code: 'a = Optimize("a", 5, 5, 8, 1); b = Optimize("b", 20, 20, 30, 5); Buy = Cross(MA(C, a), MA(C, b)); Sell = Cross(MA(C, b), MA(C, a));' },
  backtest: { name: 'T System', kind: 'system', code: 'SetPositionSize(10, spsPercentOfEquity); SetOption("MaxOpenPositions", 6); Buy = Cross(MA(C, 10), MA(C, 30)); Sell = Cross(MA(C, 30), MA(C, 10));' },
};
await pg.evaluate((F) => { for (const f of Object.values(F)) window.formulaStore.save(f); }, FORMULAS);
await pg.evaluate(() => window.openAnalysis());
await pg.locator('select').filter({ has: pg.locator('option', { hasText: 'All symbols' }) }).first().selectOption('all');   // Apply to: all symbols
const norm = (t) => (t || '').replace(/\s+/g, ' ').trim();
const pane = async () => norm(await pg.locator('table').first().evaluate((t) => t.closest('div').parentElement.parentElement.innerText).catch(() => ''));
const tabText = async (name) => { await pg.getByRole('button', { name, exact: true }).first().click(); return norm(await pg.evaluate(() => [...document.querySelectorAll('.fixed.inset-0')].pop().innerText)); };
const results = async () => tabText('Results');
const choose = async (name) => { const sel = pg.locator('select').filter({ has: pg.locator('option', { hasText: name }) }).first(); await sel.selectOption({ label: name }); };
const rowsOf = async () => pg.locator('table tbody tr').count();
const waitResult = async () => { await pg.waitForFunction(() => { const bs = [...document.querySelectorAll('button')]; return bs.some((x) => x.textContent === 'Results') && bs.filter((x) => ['Scan', 'Explore', 'Backtest'].includes(x.textContent)).every((x) => !x.disabled); }, null, { timeout: 120000 }); };
const waitRemote = async () => { for (let k = 0; k < 200; k++) { const t = (await tabText('Results')) + (await tabText('Info').catch(() => '')); if (/Result from GitHub/.test(t)) return; await new Promise((r) => setTimeout(r, 200)); } throw new Error('the GitHub result never appeared in the window: ' + (await pg.evaluate(() => [...document.querySelectorAll('.fixed.inset-0')].map((r) => r.innerText.replace(/\s+/g, ' ').slice(-500)).join(' ||| ')))); };

let panelOpen = false; const ids = {};
async function sendToGithub(label) {
  if (!panelOpen) {
    await pg.click('#aa-github');
    await pg.fill('input[placeholder="owner/amibroker-analysis-runner"]', 'me/runner'); await pg.fill('input[placeholder^="GitHub token"]', 'tok'); await pg.fill('input[placeholder="machines (1-20)"]', '3');
    await pg.getByRole('button', { name: 'Save & test' }).click(); panelOpen = true;
  }
  const before = dispatched.length;
  await pg.getByRole('button', { name: label, exact: true }).click();
  await pg.waitForFunction((n) => true, before); while (dispatched.length === before) await new Promise((r) => setTimeout(r, 50));
  await Promise.all(running);
  for (let k = 0; k < 30; k++) { await pg.getByRole('button', { name: 'Refresh', exact: true }).click(); await new Promise((r) => setTimeout(r, 300)); if (await pg.getByRole('button', { name: 'View result' }).count()) break; }
  const id = dispatched[dispatched.length - 1];
  await pg.getByRole('button', { name: 'View result' }).first().click(); panelOpen = false;
  await waitRemote(); return id;
}

for (const mode of ['scan', 'explore', 'backtest']) {
  const F = FORMULAS[mode], label = { scan: 'Send Scan', explore: 'Send Explore', backtest: 'Send Backtest' }[mode], local = { scan: 'Scan', explore: 'Explore', backtest: 'Backtest' }[mode];
  await choose(F.name);
  // 1. on the phone
  await pg.getByRole('button', { name: local, exact: true }).click(); await waitResult();
  const localResults = await results(), localRows = await rowsOf(); const localReport = mode === 'backtest' ? await tabText('Report') : '';
  // 2. on GitHub, viewed in the same window
  const id = await sendToGithub(label); ids[mode] = id;
  const remoteResults = await results(), remoteRows = await rowsOf(); const remoteReport = mode === 'backtest' ? await tabText('Report') : '';
  const job = JSON.parse(files.get(`jobs/${id}/job.json`).text), st = JSON.parse(files.get(`jobs/${id}/status.json`).text);
  console.log(`${mode}: ${job.symbols.length} symbols, ${st.shards} machines, ${localRows} rows on screen, result ${(files.get(`jobs/${id}/result.json`).text.length / 1024).toFixed(0)} KB`);
  ok(job.mode === mode && job.symbols.length === 130 && job.dataset && job.code === F.code, `${mode}: the job holds mode, all symbols, formula, dataset`);
  if (mode === 'explore') ok(/"gz":"/.test(files.get(`jobs/${id}/result.json`).text) && files.get(`jobs/${id}/result.json`).text.length < 700000, `explore: the stored result is compressed (${(files.get(`jobs/${id}/result.json`).text.length / 1024).toFixed(0)} KB)`);
  ok(st.shards === ({ scan: 2, explore: 2, backtest: 1 })[mode], `${mode}: machines used ${st.shards}`);
  ok(localRows > 0 && remoteRows === localRows, `${mode}: same number of rows on screen (${localRows} / ${remoteRows})`);
  ok(localResults.length > 200 && remoteResults === localResults, `${mode}: the Results screen is identical on the phone and from GitHub` + (remoteResults === localResults ? '' : `\n   phone : ${localResults.slice(0, 400)}\n   github: ${remoteResults.slice(0, 400)}`));
  if (mode === 'backtest') ok(localReport.length > 200 && (remoteReport === localReport || remoteReport.replace(/Monte Carlo[\s\S]*$/, '') === localReport.replace(/Monte Carlo[\s\S]*$/, '')), 'backtest: the Report tab (statistics, monthly returns) is identical');
  const info = await tabText('Info'); ok(/Result from GitHub/.test(info) && /Ran on GitHub/.test(info), `${mode}: Info says it came from GitHub`);
}
// Optimize still goes the old way through the same panel (5 buttons now)
{
  await choose('T Opt');
  const id = await sendToGithub('Send Optimize');
  const job = JSON.parse(files.get(`jobs/${id}/job.json`).text), st = JSON.parse(files.get(`jobs/${id}/status.json`).text), res = JSON.parse(files.get(`jobs/${id}/result.json`).text);
  ok(job.mode === 'optimize' && job.metric && job.wf && st.shards === 3 && res.result.rows.length === 12, `optimize: job and result as before (${st.shards} machines, ${res.result.rows.length} combinations)`);
  await results(); ok(await pg.locator('table tbody tr').count() >= 12, 'optimize: the result table is shown');
}
// Another device / cleared browser: the list is empty, "Load jobs from the repo" brings every result back, and it opens without a new analysis
{
  await pg.evaluate(() => localStorage.removeItem('aa_remote_jobs_v1'));
  const hitsBefore = dispatched.length;
  await pg.click('#aa-github'); panelOpen = true;
  await pg.getByRole('button', { name: 'Load jobs from the repo' }).click();
  await pg.waitForFunction(() => document.querySelectorAll('.fixed.inset-0').length > 1 && [...document.querySelectorAll('button')].filter((b) => b.textContent === 'View result').length >= 4, null, { timeout: 20000 }).catch(() => {});
  const cards = await pg.getByRole('button', { name: 'View result' }).count();
  ok(cards === 4, `jobs rebuilt from the repo: ${cards} results listed (scan, explore, backtest, optimize)`);
  const names = await pg.evaluate(() => [...document.querySelectorAll('.fixed.inset-0')].pop().innerText);
  ok(/Scan: T Scan · 130 symbols/.test(names) && /Backtest: T System/.test(names) && /Explore: T Explore/.test(names) && /Optimize: T Opt/.test(names), 'the list names the jobs again');
  await pg.getByRole('button', { name: 'View result' }).nth(3).click(); panelOpen = false;       // the oldest = the scan
  await waitRemote(); const again = await results();
  ok(/T Scan|Buy|Date|Symbol/.test(again) && await rowsOf() === 130, `the saved scan opens again with its ${await rowsOf()} rows, no new analysis (${dispatched.length - hitsBefore} new jobs started)`);
  ok(dispatched.length === hitsBefore, 'opening a saved result starts nothing on GitHub');
}
// An OLD big exploration result (stored plain, 70,000 rows, before the limit existed): the phone is warned about its size, it opens with its first 60,000 rows and says so
{
  const key = `jobs/${ids.explore}/result.json`, doc = JSON.parse(files.get(key).text);
  const plain = doc.result.gz ? JSON.parse(zlib.gunzipSync(Buffer.from(doc.result.gz, 'base64')).toString('utf8')) : doc.result;
  const base = plain.table.rows; let big = []; while (big.length < 70000) big = big.concat(base); big.length = 70000;
  plain.table.rows = big; plain.rows = big.map((r) => ({ symbol: r[0].v, date: r[1].v })); plain.truncated = 0;
  files.set(key, { text: JSON.stringify({ ...doc, result: plain }), sha: 'old' });
  await pg.click('#aa-github'); panelOpen = true;
  const before = dialogs.length;
  await pg.getByRole('button', { name: 'View result' }).nth(2).click(); panelOpen = false;       // the explore job
  await waitRemote(); const info = await tabText('Info');
  ok(dialogs.length === before + 1 && /result file is \d+ MB/.test(dialogs[dialogs.length - 1]), 'a big old result: the phone is told its size before downloading: ' + (dialogs[dialogs.length - 1] || '').slice(0, 60));
  ok(/Showing the first 60,000 of 70,000 rows/.test(info), 'an old 70,000-row exploration result opens, limited to 60,000 rows, with a note');
  await results(); ok(await rowsOf() > 100, 'and its table is shown');
}
ok(dialogs.filter((m) => /result file is/.test(m)).length === 1, 'the size warning came only for the one big old result, not for normal results');
ok(errs.length === 0, 'no page errors: ' + errs.join(' | '));
await b.close(); server.close();
console.log(fail ? `${fail} FAILED` : `github-modes: all ${pass} checks passed`); process.exit(fail ? 1 : 0);
