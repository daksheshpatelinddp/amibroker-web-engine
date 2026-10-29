// Run: node tests/browser/bulk-load.mjs  -- iterMany in real Chromium against a fake R2 (v2 packs, byte-range server):
// correct data, only the needed byte ranges downloaded, batched browser-storage reads/writes, instant second run.
import fs from 'fs'; import path from 'path';
import { serve, launch, root } from './_serve.mjs';
const exp = JSON.parse(fs.readFileSync(path.join(root, 'tests/fixtures/fake-r2/expected.json')));
const log = []; const { server, port } = await serve({ log });
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL', m); } };
const b = await launch(); const pg = await b.newPage(); const errs = []; pg.on('pageerror', (e) => errs.push(e.message)); pg.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
await pg.route('https://cdn.jsdelivr.net/**', (r) => r.fulfill({ contentType: 'text/javascript', body: 'export const parquetMetadataAsync = async () => { throw new Error("stub"); }; export const parquetRead = async () => { throw new Error("stub"); };' }));   // parquet reader is not used in pack mode (and the sandbox has no internet)
await pg.goto(`http://localhost:${port}/tests/browser/bulk-harness.html`); await pg.waitForFunction(() => window.ready);
const all = Object.keys(exp);
const check = (res, syms, tag) => { let bad = 0; for (const s of syms) { const g = res.out[s], e = exp[s]; if (!g || g.n !== e.n || Math.abs(g.sumClose - e.sumClose) > 1e-6 || g.lastClose !== e.lastClose) bad++; } ok(bad === 0, `${tag}: ${bad} stocks wrong`); ok(Object.keys(res.out).length === syms.length, `${tag}: stock count`); };

// 1) every 3rd stock, cold browser store
const pick = all.filter((_, i) => i % 3 === 0);
log.length = 0;
let r1 = await pg.evaluate(async (s) => { const e = makeEngine('cold1'); const r = await collect(e, s); return { ...r, tx: { ...window.txCount } }; }, pick);
check(r1, pick, 'cold run');
const recentFile = JSON.parse(fs.readFileSync(path.join(root, 'tests/fixtures/fake-r2/nse/recent.json'))).size;
const recentBytes = log.filter((l) => l.url.includes('/r/')).reduce((a, l) => a + l.bytes, 0);
console.log(`cold: ${r1.stats.requests} requests, ${(r1.stats.bytes / 1e6).toFixed(2)} MB; recent pack bytes ${recentBytes} of ${recentFile}; storage tx ${JSON.stringify(r1.tx)}`);
ok(r1.tx.readonly <= 3 && r1.tx.readwrite <= 4, `batched storage: ${JSON.stringify(r1.tx)}`);
ok(log.filter((l) => l.url.startsWith('/r2/')).every((l) => l.range || l.url.endsWith('.json')), 'no whole pack downloaded (only ranges and the two small json files)');

// 2) a few scattered stocks only: must NOT pull the whole recent pack
const few = [all[2], all[60], all[125]];
log.length = 0;
const r2 = await pg.evaluate(async (s) => collect(makeEngine('cold2'), s), few);
check(r2, few, 'few stocks');
const rb2 = log.filter((l) => l.url.includes('/r/')).reduce((a, l) => a + l.bytes, 0);
console.log(`3 scattered stocks: ${r2.stats.requests} requests, ${r2.stats.bytes} bytes, recent bytes ${rb2} of ${recentFile}`);
ok(rb2 < recentFile * 0.5, 'recent pack: only the needed ranges were downloaded');

// 3) same stocks again in a NEW engine object (page "reopened"): from browser storage, no network, few transactions
log.length = 0;
await pg.evaluate(() => { window.txCount = { readonly: 0, readwrite: 0 }; });
const r3 = await pg.evaluate(async (s) => { const r = await collect(makeEngine('cold1'), s); return { ...r, tx: { ...window.txCount } }; }, pick);
check(r3, pick, 'repeat run');
console.log(`repeat: ${r3.stats.requests} requests, from browser storage ${r3.stats.fromBrowserCache}, tx ${JSON.stringify(r3.tx)}`);
ok(r3.stats.requests === 0 && log.filter((l) => l.url.startsWith('/r2/') && !l.url.endsWith('.json')).length === 0, 'repeat run downloads nothing');
ok(r3.tx.readonly <= 3 && r3.tx.readwrite === 0, 'repeat run: batched reads, no writes');
ok(r3.stats.fromBrowserCache === pick.length * 2, 'every block came from browser storage');

// 3b) one chart (2 range requests, decoded in the page): rows are complete and equal to the bulk numbers
log.length = 0;
const one = await pg.evaluate(async (sym) => { const e = makeEngine('chart1'); const rows = await e.getBars(sym); let sum = 0; for (const r of rows) sum += r.close; return { n: rows.length, sum, last: rows[rows.length - 1].close, hasDelivery: rows.some((r) => !Number.isNaN(r.delivery)), reqs: e.stats.requests }; }, all[5]);
ok(one.n === exp[all[5]].n && Math.abs(one.sum - exp[all[5]].sumClose) < 1e-6 && one.last === exp[all[5]].lastClose && one.hasDelivery, 'single chart from v2 packs: ' + JSON.stringify(one));
console.log('single chart:', one.reqs, 'requests (after manifest + recent.json)');

// 4) alias still resolves
const al = await pg.evaluate(async () => { const e = makeEngine('cold3'); const r = await collect(e, ['OLDNAME']); return Object.keys(r.out); });
ok(al.length === 1 && al[0] === all[0], 'old ticker resolves to the latest one');
ok(errs.length === 0, 'no browser errors: ' + errs.join(' | '));

// 5) decoding in Web Workers: same numbers as before, and the engine reports it
const w1 = await pg.evaluate(async (s) => collect(makeEngine('wk1'), s), pick);
check(w1, pick, 'worker decode'); console.log('decode:', w1.stats.decode);
ok(/workers$/.test(w1.stats.decode), 'decoded in a worker pool: ' + w1.stats.decode);

// 6) decoding inside the page (engine.workers = false) gives the same numbers
const w2 = await pg.evaluate(async (s) => { const e = makeEngine('wk2'); e.workers = false; return collect(e, s); }, pick);
check(w2, pick, 'in-page decode'); ok(w2.stats.decode === 'in page', 'in-page decode reported');

// 7) workers that cannot start (bad script address): falls back to the page, still correct, quickly
const t7 = Date.now();
const w3 = await pg.evaluate(async (s) => { const e = makeEngine('wk3'); e.pool = new WorkerPool({ url: '/js/does-not-exist.js' }); const r = await collect(e, s); return { ...r, why: e.pool.fallbackReason }; }, pick);
check(w3, pick, 'worker start failure'); console.log('start failure ->', w3.stats.decode, '|', w3.why, '|', Date.now() - t7, 'ms');
ok(w3.stats.decode === 'in page' && Date.now() - t7 < 5000, 'start failure falls back to the page without a long wait');
await b.close(); server.close();
console.log(fail ? `${fail} FAILED` : `bulk-load: all ${pass} checks passed`); process.exit(fail ? 1 : 0);
