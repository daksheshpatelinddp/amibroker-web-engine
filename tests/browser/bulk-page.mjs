// Run: node tests/browser/bulk-page.mjs -- drives bulk-test.html (the page you open on the phone) against the fake R2.
import { serve, launch } from './_serve.mjs';
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL', m); } };
const { server, port } = await serve();
const b = await launch(); const pg = await b.newPage(); const errs = []; pg.on('pageerror', (e) => errs.push(e.message));
await pg.route('https://cdn.jsdelivr.net/npm/hyparquet**', (r) => r.fulfill({ contentType: 'text/javascript', body: 'export const parquetMetadataAsync = async () => {}; export const parquetRead = async () => {};' }));
await pg.goto(`http://localhost:${port}/bulk-test.html?base=/r2/nse`); await pg.waitForFunction(() => window.__ready);
const text = () => pg.textContent('#out');
const waitFor = (re) => pg.waitForFunction((s) => new RegExp(s).test(document.getElementById('out').textContent), re.source, { timeout: 60000 });
await pg.fill('#n', '100');
await pg.click('#b1'); await waitFor(/\[1\] done/); let t = await text(); ok(/100 stocks, 120000 bars/.test(t), 'run 1 loads 100 stocks: ' + t.slice(-250));
await pg.click('#b1'); await waitFor(/\[1\] done[\s\S]*\[1\] done/); t = await text(); ok(/0 requests, [\d.]+ MB downloaded, 200 blocks from browser storage/.test(t), 'second run from browser storage');
await pg.click('#b2'); await waitFor(/\[2\] done/); t = await text(); ok(/\[2\] done: 130 stocks, 39000 bars/.test(t), 'scan of 130 stocks x 300 bars');
await pg.click('#b3'); await waitFor(/\[3\] \d+ combinations per second/); t = await text(); ok(/kept in memory by \d+ workers/.test(t), 'optimizer benchmark ran'); console.log(t.split('\n').slice(-6).join('\n'));
await pg.click('#b4'); await waitFor(/Browser store cleared/);
await pg.click('#b1'); await waitFor(/\[1\] done[\s\S]*\[1\] done[\s\S]*\[1\] done/); t = await text(); ok(!/0 blocks from browser storage[\s\S]*$/.test('') && /[1-9]\d* requests/.test(t.split('[1] done').pop()), 'after clearing, it downloads again');
ok(!/ERROR/.test(t), 'no ERROR lines'); ok(errs.length === 0, 'no page errors ' + errs.join('|'));
await b.close(); server.close();
console.log(fail ? `${fail} FAILED` : `bulk-page: all ${pass} checks passed`); process.exit(fail ? 1 : 0);
