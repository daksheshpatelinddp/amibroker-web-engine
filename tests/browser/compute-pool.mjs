// Run: node tests/browser/compute-pool.mjs -- the optimizer worker pool in real Chromium (4 workers, fake R2).
import fs from 'fs'; import path from 'path';
import { serve, launch, root } from './_serve.mjs';
const exp = JSON.parse(fs.readFileSync(path.join(root, 'tests/fixtures/fake-r2/expected.json')));
const all = Object.keys(exp);
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL', m); } };
const { server, port } = await serve();
const b = await launch(); const pg = await b.newPage(); const errs = []; pg.on('pageerror', (e) => errs.push(e.message));
await pg.route('https://cdn.jsdelivr.net/**', (r) => r.fulfill({ contentType: 'text/javascript', body: 'export const parquetMetadataAsync = async () => {}; export const parquetRead = async () => {};' }));
await pg.goto(`http://localhost:${port}/tests/browser/bulk-harness.html`); await pg.waitForFunction(() => window.ready);

const res = await pg.evaluate(async (syms) => {
  const out = {};
  const eng = makeEngine('cp1');
  const pool = new ComputePool({ size: 4 });
  out.info = await pool.load(eng, syms);

  // reference: the same task run in the page over fully decoded stocks
  const stocks = []; for await (const s of makeEngine('cp1').iterMany(syms)) stocks.push(s);
  const combos = [[5, 20], [10, 50], [3, 8], [20, 100], [2, 60]];
  const ref = combos.map((c) => smaCross(stocks, c));
  const r = await pool.run({ task: { module: '/js/bench-task.js', export: 'smaCross' }, combos });
  out.k = r.k; out.ref = ref; out.got = combos.map((_, i) => [r.data[i * 2], r.data[i * 2 + 1]]);

  // a task given as a plain function, returning one number: total bars seen by all workers
  const r2 = await pool.run({ task: (st, p) => { let n = 0; for (const s of st) n += s.n; return n + p; }, combos: [0, 1000] });
  out.fn = Array.from(r2.data); out.fnK = r2.k;

  // a custom combine: best (largest) value over workers instead of the sum
  const r3 = await pool.run({ task: (st, p) => st.length, combos: [0], combine: (parts) => ({ k: 1, data: Float64Array.of(Math.max(...parts.map((x) => x.data[0]))) }) });
  out.maxPerWorker = r3.data[0];

  // many combinations: batches grow, progress is reported, numbers still match
  const many = []; for (let i = 0; i < 1500; i++) many.push([2 + (i % 10), 14 + (i % 37)]);
  let prog = 0;
  const r4 = await pool.run({ task: { module: '/js/bench-task.js', export: 'smaCross' }, combos: many, onProgress: () => { prog++; } });
  out.many = { done: r4.done, k: r4.k, progress: prog, sample: [r4.data[0], r4.data[1], r4.data[2 * 1499], r4.data[2 * 1499 + 1]], refFirst: smaCross(stocks, many[0]), refLast: smaCross(stocks, many[1499]) };

  // cancel
  let calls = 0; const pc = pool.run({ task: { module: '/js/bench-task.js', export: 'smaCross' }, combos: many.concat(many).concat(many), onProgress: () => { if (++calls === 2) pool.cancel(); } });
  const r5 = await pc; out.cancel = { done: r5.done, len: r5.data.length };

  // the benchmark
  out.bench = await pool.benchmark({ combos: 400 });
  // a task that throws is reported, the pool keeps working
  try { await pool.run({ task: () => { throw new Error('boom'); }, combos: [1] }); out.thrown = 'no'; } catch (e) { out.thrown = e.message; }
  const again = await pool.run({ task: (st, p) => p, combos: [7] }); out.after = Array.from(again.data);
  out.mode = pool.mode;
  pool.terminate();
  return out;
}, all);

console.log('loaded:', JSON.stringify(res.info));
ok(res.info.stocks === 130 && res.info.bars === 130 * 1200 && res.info.workers === 4, 'every stock kept in some worker: ' + JSON.stringify(res.info));
ok(res.k === 2, 'result size');
for (let i = 0; i < res.ref.length; i++) ok(Math.abs(res.got[i][0] - res.ref[i][0]) < 1e-6 * Math.max(1, Math.abs(res.ref[i][0])) && res.got[i][1] === res.ref[i][1], `combo ${i}: pool ${res.got[i]} vs page ${res.ref[i]}`);
ok(res.fnK === 1 && res.fn[0] === 130 * 1200 && res.fn[1] === 130 * 1200 + 1000 * 4, 'function task: ' + res.fn);   // +p from each of the 4 workers added up
ok(res.maxPerWorker >= 32 && res.maxPerWorker <= 33, 'custom combine (max stocks per worker) ' + res.maxPerWorker);
ok(res.many.done === 1500 && res.many.k === 2 && res.many.progress > 1, 'many combinations: ' + JSON.stringify(res.many));
ok(Math.abs(res.many.sample[0] - res.many.refFirst[0]) < 1e-6 * Math.max(1, Math.abs(res.many.refFirst[0])) && res.many.sample[3] === res.many.refLast[1], 'many: first/last values match');
ok(res.cancel.done < 4500 && res.cancel.done > 0 && res.cancel.len === res.cancel.done * 2, 'cancel stops early: ' + JSON.stringify(res.cancel));
console.log(`benchmark (${res.bench.mode}, ${res.bench.stocks} stocks, ${res.bench.bars} bars): ${Math.round(res.bench.combosPerSec)} combinations/s, ${(res.bench.stockBarsPerSec / 1e6).toFixed(1)} M stock-bars/s`);
ok(res.bench.combosPerSec > 0 && res.bench.done === 400, 'benchmark ran');
ok(/boom/.test(res.thrown), 'a failing task is reported: ' + res.thrown);
ok(res.after[0] === 28, 'pool still works after a failing task (7 added up over 4 workers): ' + res.after);
ok(errs.length === 0, 'no page errors: ' + errs.join('|'));
await b.close(); server.close();
console.log(fail ? `${fail} FAILED` : `compute-pool: all ${pass} checks passed`); process.exit(fail ? 1 : 0);
