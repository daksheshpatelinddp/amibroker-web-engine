// Run: node tests/category-perf-test.mjs -- a big classification import must save once, not once per row (Aw Snap on a phone)
import { CategoryStore } from '../js/category-store.js';
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL', m); } };
let writes = 0, bytes = 0; const mem = {};
const st = new CategoryStore({ getItem: (k) => mem[k] ?? null, setItem: (k, v) => { writes++; bytes += v.length; mem[k] = v; } }, 'perf');
const all = Array.from({ length: 4500 }, (_, i) => 'SYM' + i); let notified = 0; st.onChange(() => notified++);
const lines = ['Symbol,Group,Sector,Industry'];
for (let i = 0; i < 4500; i++) lines.push(`SYM${i},${[`G${i % 40}`, `G${(i + 7) % 40}`, `G${(i + 13) % 40}`].join('|')},Sector ${i % 25},Ind ${i % 25}-${i % 2}`);
const t0 = Date.now(); writes = 0; const r = st.importClassification(lines.join('\r\n'), all); const ms = Date.now() - t0;
ok(r.rows === 4500, 'rows'); ok(writes <= 2, 'saved once, not per row: ' + writes + ' writes'); ok(notified <= 2, 'listeners told once: ' + notified); ok(ms < 3000, 'fast: ' + ms + ' ms');
ok(st.count('groups', 'G0', all) > 300 && st.count('sectors', 'Sector 3', all) === 180, 'content right');
const again = st.importClassification(lines.join('\r\n'), all); ok(st.count('groups', 'G0', all) === st.members('groups', 'G0').length, 'second import (replace) is consistent');
console.log(`${pass} passed, ${fail} failed (${ms} ms, ${(bytes / 1e6).toFixed(1)} MB written)`); process.exit(fail ? 1 : 0);
