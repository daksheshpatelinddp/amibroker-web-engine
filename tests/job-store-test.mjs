import { saveJob, loadJob, deleteJob } from '../js/job-store.js';
let p = 0, f = 0; const ok = (c, m) => { c ? p++ : (f++, console.log('FAIL', m)); };
globalThis.localStorage ??= (() => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; })();
await deleteJob(); ok((await loadJob()) == null, 'empty');
await saveJob({ mode: 'optimize', state: { next: 5, rows: [{ a: 1 }] } });
const j = await loadJob(); ok(j && j.state.next === 5 && j.state.rows.length === 1, 'round trip');
await deleteJob(); ok((await loadJob()) == null, 'deleted');
console.log(`${p} passed, ${f} failed`); process.exit(f ? 1 : 0);
