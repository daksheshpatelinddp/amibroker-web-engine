import { fileURLToPath } from 'url';
// Conformance: run PARITY_EXPLORATION.afl through the app engine on AmiBroker's own bars and compare
// every column with AmiBroker's exported values.   node tests/conformance/run.mjs <ami.csv> [afl]
import fs from 'fs';
import { aflEngine } from '../../js/afl-engine.js';
const HERE = (f) => fileURLToPath(new URL(f, import.meta.url));
const args = process.argv.slice(2);
const GATE = args.length === 0;   // no arguments: check the two stored AmiBroker fixtures and fail on any NEW difference
const KNOWN = new Set(['WMA10', 'ADX14', 'PDI14', 'MDI14', 'SAR', 'PEAK10', 'TROUGH10', 'ZIG10', 'MFI14']);   // differences still open (see CONFORMANCE.md)
const [csvPath, aflPath = fileURLToPath(new URL('./PARITY_EXPLORATION.afl', import.meta.url))] = args;
const check = (csvPath) => {
const lines = fs.readFileSync(csvPath, 'utf8').trim().split(/\r?\n/);
const head = lines.shift().split(',');
const byT = new Map();
for (const ln of lines) {
  const f = ln.split(','), t = f[0];
  if (!byT.has(t)) byT.set(t, []);
  byT.get(t).push(f);
}
const ix = Object.fromEntries(head.map((h, i) => [h, i]));
const iso = (s) => { const [m, d, y] = s.split(' ')[0].split('/'); return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`; };
const afl = fs.readFileSync(aflPath, 'utf8');
const stat = {}; let shown = 0;
for (const [tk, rows] of byT) {
  const col = (n) => rows.map((r) => Number(r[ix[n]]));
  const bars = { t: rows.map((r) => iso(r[ix['Date/Time']])), o: col('Open'), h: col('High'), l: col('Low'), c: col('Close'), v: col('Volume'), dq: rows.map(() => 0), delpct: rows.map(() => 0) };
  const res = aflEngine.run(afl, bars, { symbol: tk, action: 4, rangeFrom: 0, rangeTo: bars.t.length, foreign: {} });
  if (res.errors.length) { console.log('ERR', res.errors); process.exit(1); }
  for (const c of res.columns) {
    const j = ix[c.name]; if (j === undefined) continue;
    const s = stat[c.name] || (stat[c.name] = { nullMis: 0, bad: 0, n: 0, firstBad: null, ex: null });
    for (let i = 0; i < rows.length; i++) {
      const raw = rows[i][j], a = raw === '' ? NaN : Number(raw), b = c.data[i];
      const an = Number.isNaN(a), bn = !Number.isFinite(b);
      if (an !== bn) { s.nullMis++; if (!s.ex) s.ex = `${tk}#${i} ami=${raw || 'null'} app=${bn ? 'null' : b}`; continue; }
      if (an) continue;
      s.n++;
      if (Math.abs(a - b) > 1e-3 * Math.max(1, Math.abs(a)) + 0.006) { s.bad++; if (s.firstBad === null) s.firstBad = `${tk}#${i} ami=${a} app=${b}`; }
    }
  }
}
let ok = 0, tot = 0, fresh = [];
for (const [k, s] of Object.entries(stat)) {
  tot++;
  if (!s.nullMis && !s.bad) { ok++; continue; }
  if (!KNOWN.has(k)) fresh.push(k);
  console.log(k.padEnd(10), `nullMis=${s.nullMis} bad=${s.bad}/${s.n}`, s.ex ? ' | ' + s.ex : '', s.firstBad ? ' | ' + s.firstBad : '');
}
console.log(`${ok}/${tot} columns identical`);
return fresh;
};
if (GATE) {
  let bad = [];
  for (const f of ['fixtures/ami_weekly.csv', 'fixtures/ami_daily.csv']) { console.log('==', f); bad = bad.concat(check(HERE(f))); }
  if (bad.length) { console.log('NEW DIFFERENCES:', [...new Set(bad)].join(', ')); process.exit(1); }
  console.log('conformance OK (only the known open differences remain)');
} else check(csvPath);
