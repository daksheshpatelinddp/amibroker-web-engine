// ATR / +DI / -DI / ADX must equal AmiBroker's own numbers (export of the Exploration helper T04_values_exploration.afl on RELIANCE, weekly).
import fs from 'fs';
import * as L from '../js/afl-lib.js';
let fail = 0;
for (const fx of ['ab_adx_reliance.csv', 'ab_adx_cesc.csv']) {
const lines = fs.readFileSync(new URL('./fixtures/' + fx, import.meta.url), 'utf8').trim().split('\n').slice(1).map((l) => l.split(','));
const col = (i) => Float64Array.from(lines.map((r) => (r[i] === '' ? NaN : +r[i])));
const H = col(3), Lo = col(4), C = col(5);
const cases = { ATR14: [6, L.atr(H, Lo, C, 14)], PDI14: [7, L.pdi(H, Lo, C, 14)], MDI14: [8, L.mdi(H, Lo, C, 14)], ADX14: [9, L.adx(H, Lo, C, 14)], ADX5: [10, L.adx(H, Lo, C, 5)], PDI5: [11, L.pdi(H, Lo, C, 5)], MDI5: [12, L.mdi(H, Lo, C, 5)] };
for (const [name, [ci, mine]] of Object.entries(cases)) {
  const ab = col(ci); let mx = 0, startOk = ab.findIndex((v) => !Number.isNaN(v)) === mine.findIndex((v) => !Number.isNaN(v));
  for (let i = 0; i < C.length; i++) { if (Number.isNaN(ab[i]) !== Number.isNaN(mine[i])) startOk = false; else if (!Number.isNaN(ab[i])) mx = Math.max(mx, Math.abs(ab[i] - mine[i])); }
  const ok = startOk && mx < 5e-4; if (!ok) fail++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${fx} ${name}  first bar ${startOk ? 'same' : 'DIFFERENT'}, max diff ${mx.toExponential(1)}`);
}
}
console.log(fail ? `${fail} failed` : 'all ADX family values equal AmiBroker');
process.exit(fail ? 1 : 0);
