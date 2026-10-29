// Run: node tests/browser/fflate-load.mjs  -- the optional fast inflater (fflate) must never be waited for.
//  A) the CDN never answers  -> decoding still finishes at normal speed (the first attempt hung in exactly this situation)
//  B) the CDN answers        -> the workers pick fflate up in the background and give the same numbers
import fs from 'fs'; import path from 'path';
import { serve, launch, root } from './_serve.mjs';
const exp = JSON.parse(fs.readFileSync(path.join(root, 'tests/fixtures/fake-r2/expected.json')));
const fflateFile = process.env.FFLATE_FILE || '/home/claude/work/tmp/node_modules/fflate/esm/browser.js';
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL', m); } };
const all = Object.keys(exp);
const { server, port } = await serve();
const b = await launch();
async function scenario(name, handler) {
  const ctx = await b.newContext(); const pg = await ctx.newPage(); const errs = []; pg.on('pageerror', (e) => errs.push(e.message));
  await pg.route('https://cdn.jsdelivr.net/npm/hyparquet**', (r) => r.fulfill({ contentType: 'text/javascript', body: 'export const parquetMetadataAsync = async () => {}; export const parquetRead = async () => {};' }));
  await pg.route('https://cdn.jsdelivr.net/npm/fflate**', handler);
  await pg.goto(`http://localhost:${port}/tests/browser/bulk-harness.html`); await pg.waitForFunction(() => window.ready);
  const t0 = Date.now();
  const r = await pg.evaluate(async (s) => collect(makeEngine('ff'), s), all);
  const ms = Date.now() - t0;
  let bad = 0; for (const s of all) { const g = r.out[s], e = exp[s]; if (!g || g.n !== e.n || Math.abs(g.sumClose - e.sumClose) > 1e-6) bad++; }
  ok(bad === 0 && Object.keys(r.out).length === all.length, `${name}: all ${all.length} stocks correct (${bad} wrong)`);
  ok(errs.length === 0, `${name}: no page errors ${errs.join('|')}`);
  console.log(`${name}: ${all.length} stocks in ${ms} ms, ${r.stats.decode}`);
  await ctx.close(); return ms;
}
const msA = await scenario('A) CDN never answers', () => { /* never fulfilled, never continued */ });
ok(msA < 15000, 'A) finished although the CDN request never completed');
if (fs.existsSync(fflateFile)) await scenario('B) CDN answers (fflate loaded)', (r) => r.fulfill({ contentType: 'text/javascript', body: fs.readFileSync(fflateFile) }));
else console.log('B) skipped: set FFLATE_FILE to fflate/esm/browser.js (npm install fflate)');
await scenario('C) CDN blocked (404)', (r) => r.fulfill({ status: 404, body: '' }));
await b.close(); server.close();
console.log(fail ? `${fail} FAILED` : `fflate-load: all ${pass} checks passed`); process.exit(fail ? 1 : 0);
