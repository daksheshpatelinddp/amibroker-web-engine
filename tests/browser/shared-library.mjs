// Run: node tests/browser/shared-library.mjs -- the PUBLIC library in Chromium with a fake GitHub (api + raw): the owner publishes from the
// Sync window, a brand-new device loads everything by itself, later changes follow, a device's own changes are kept, and failures are quiet.
import { serve, launch } from './_serve.mjs';
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL', m); } };
const { server, port } = await serve(); const b = await launch();
const files = new Map(); let shaN = 1, isPrivate = false, rawDown = false; const rawHits = [];
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };
async function device(name) {
  const ctx = await b.newContext(); const pg = await ctx.newPage(); const errs = []; pg.on('pageerror', (e) => errs.push(e.message)); pg.on('dialog', (d) => d.accept());
  await ctx.route('https://api.github.com/**', async (route) => {
    const req = route.request(), u = new URL(req.url()), m = req.method();
    if (m === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    if (/^\/repos\/[^/]+\/[^/]+$/.test(u.pathname)) return route.fulfill({ status: 200, headers: CORS, json: { private: isPrivate } });
    const cm = u.pathname.match(/^\/repos\/[^/]+\/[^/]+\/contents\/(.+)$/);
    if (cm) { const p = decodeURIComponent(cm[1]);
      if (m === 'GET') { if (!files.has(p)) return route.fulfill({ status: 404, headers: CORS, body: '{}' }); return route.fulfill({ status: 200, headers: CORS, json: { sha: files.get(p).sha } }); }
      if (m === 'PUT') { const body = JSON.parse(req.postData()); files.set(p, { text: Buffer.from(body.content, 'base64').toString('utf8'), sha: 's' + shaN++ }); return route.fulfill({ status: 201, headers: CORS, json: { content: { sha: 's' } } }); } }
    return route.fulfill({ status: 404, headers: CORS, body: '{}' });
  });
  await ctx.route('https://raw.githubusercontent.com/**', async (route) => {          // what anybody can read without a login
    const u = new URL(route.request().url()); rawHits.push(u.pathname + u.search);
    if (rawDown) return route.abort('failed');
    const m = u.pathname.match(/^\/([^/]+\/[^/]+)\/([^/]+)\/(.+)$/); const f = m && files.get(m[3]);
    return f ? route.fulfill({ status: 200, headers: CORS, contentType: 'text/plain', body: f.text }) : route.fulfill({ status: 404, headers: CORS, body: '404: Not Found' });
  });
  await pg.goto(`http://localhost:${port}/tests/browser/sync-harness.html`); await pg.waitForFunction(() => window.ready);
  return { pg, ctx, errs, name };
}
const names = (d) => d.pg.evaluate(() => new window.formulaStore.constructor().user.map((x) => x.name).sort().join('|'));
const cats = (d) => d.pg.evaluate(() => JSON.parse(localStorage.getItem('amibroker_categories_v2') || '{}').favorites);
const publish = async (d) => { await d.pg.evaluate(() => window.openSyncTest()); if (await d.pg.locator('input[placeholder^="GitHub token"]').inputValue() === '') { await d.pg.fill('input[placeholder="owner/amibroker-analysis-runner"]', 'me/private-runner'); await d.pg.fill('input[placeholder^="GitHub token"]', 'OWNER-TOKEN'); }
  await d.pg.getByRole('button', { name: 'Publish my data to everyone' }).click(); await d.pg.waitForFunction(() => /Published:|Could not publish/.test(document.body.innerText)); const t = await d.pg.evaluate(() => document.body.innerText); await d.pg.evaluate(() => document.getElementById('modal-root') && document.getElementById('modal-root').remove()); return t; };

// ---- the owner (phone)
const A = await device('phone');
await A.pg.evaluate(() => {
  window.formulaStore.save({ name: 'Alok Jain Momentum', code: 'Buy = C > MA(C, 20);', kind: 'system' }); window.formulaStore.save({ name: 'RSI Explore', code: 'Filter = RSI(14) > 70;', kind: 'exploration' });
  localStorage.setItem('amibroker_categories_v2', JSON.stringify({ v: 2, names: {}, favorites: ['TCS'] }));
  localStorage.setItem('amibroker_workspace_v1', JSON.stringify({ v: 1, activeId: 's1', sheets: [{ id: 's1', name: 'Sheet 1' }] }));
  localStorage.setItem('aa_remote_cfg_v1', JSON.stringify({ repo: 'me/private-runner', token: 'OWNER-TOKEN', branch: 'main', shards: 8 }));
  localStorage.setItem('amibroker_ai_cfg_v1', JSON.stringify({ key: 'AI-SECRET' })); localStorage.setItem('intraday_cfg_v1', '{"server":"http://my-private-server"}'); localStorage.setItem('user_databases_v1', '[{"id":"x","name":"X","folder":"x"}]');
});
isPrivate = true; let t = await publish(A); ok(/PRIVATE/.test(t) && !files.has('app-data.json'), 'publishing to a PRIVATE repo is refused with a plain reason (nobody could read it)');
isPrivate = false; t = await publish(A); ok(/Published: 2 formulas/.test(t) && files.has('app-data.json'), 'the owner publishes: ' + (t.match(/Published:[^\n]*/) || [''])[0]);
const pub = JSON.parse(files.get('app-data.json').text);
ok(pub.public === true && Object.keys(pub.items).every((k) => !/aa_remote|ai_cfg|intraday|user_databases|pseudo/.test(k)) && !files.get('app-data.json').text.match(/SECRET|OWNER-TOKEN|my-private-server/), 'the public file holds no token, AI key or server setting');

// ---- a brand-new device (son's laptop): opens the app, nothing else
const B = await device('laptop');
let r = await B.pg.evaluate(() => window.runAuto()); await B.pg.waitForFunction(() => window.__reloaded > 0, null, { timeout: 5000 });
ok(r.status === 'loaded' && r.newDevice === true, 'a new device loads the public library by itself: ' + JSON.stringify(r));
ok(await names(B) === 'Alok Jain Momentum|RSI Explore' && (await cats(B))[0] === 'TCS', 'it has the formulas and categories, nothing was pressed');
ok(await B.pg.evaluate(() => localStorage.getItem('aa_remote_cfg_v1') === null && localStorage.getItem('amibroker_ai_cfg_v1') === null), 'no token or key arrived');
ok((await B.pg.evaluate(() => window.runAuto())).status === 'current', 'next start: same copy, nothing happens (no repeated reloads)');
ok(rawHits.every((h) => /\/daksheshpatelinddp\/amibroker-shared-data\/main\/app-data\.json\?t=\d+$/.test(h)), 'it reads the default public repo address: ' + rawHits[0]);

// ---- the owner changes things and publishes again: the laptop follows, untouched items too
await A.pg.evaluate(() => { window.formulaStore.save({ name: 'Third formula', code: 'Buy=3;', kind: 'system' }); localStorage.setItem('amibroker_categories_v2', JSON.stringify({ v: 2, names: {}, favorites: ['TCS', 'INFY'] })); });
await new Promise((r2) => setTimeout(r2, 20)); await publish(A);
await B.pg.evaluate(() => { window.__reloaded = 0; sessionStorage.clear(); });
r = await B.pg.evaluate(() => window.runAuto()); ok(r.status === 'loaded' && (await names(B)).split('|').length === 3 && (await cats(B)).length === 2, 'a later publish reaches the laptop (new formula + untouched categories)');
// the laptop user changes their categories; the owner publishes more; the laptop keeps its own categories but still gets formulas
await B.pg.evaluate(() => localStorage.setItem('amibroker_categories_v2', JSON.stringify({ v: 2, names: {}, favorites: ['SON-PICK'] })));
await A.pg.evaluate(() => { window.formulaStore.save({ name: 'Fourth formula', code: 'Buy=4;', kind: 'system' }); localStorage.setItem('amibroker_categories_v2', JSON.stringify({ v: 2, names: {}, favorites: ['OWNER-NEW'] })); });
await new Promise((r2) => setTimeout(r2, 20)); await publish(A); await B.pg.evaluate(() => sessionStorage.clear());
await B.pg.evaluate(() => window.runAuto());
ok((await names(B)).split('|').length === 4 && (await cats(B))[0] === 'SON-PICK', "the son's own category changes are kept; the owner's new formula still arrives");

// ---- a device that already has its own formulas
const C = await device('tablet');
await C.pg.evaluate(() => { window.formulaStore.save({ name: 'Tablet only', code: 'Buy=1;', kind: 'system' }); localStorage.setItem('amibroker_categories_v2', JSON.stringify({ v: 2, names: {}, favorites: ['TABLET'] })); });
r = await C.pg.evaluate(() => window.runAuto()); ok(r.status === 'loaded' && r.newDevice === false && (await names(C)).split('|').length === 5 && (await cats(C))[0] === 'TABLET', 'a device with its own work keeps it and gains the public formulas');
// switched off on this device
await C.pg.evaluate(() => { localStorage.setItem('shared_cfg_v1', JSON.stringify({ repo: 'daksheshpatelinddp/amibroker-shared-data', branch: 'main', auto: false })); sessionStorage.clear(); });
ok((await C.pg.evaluate(() => window.runAuto())).status === 'off', '"do not load automatically" is respected');

// ---- quiet failures: no internet, or nothing published yet
const D = await device('offline'); rawDown = true;
ok((await D.pg.evaluate(() => window.runAuto())).status === 'unavailable', 'no connection: nothing happens, no error'); rawDown = false;
const keep = files.get('app-data.json'); files.delete('app-data.json');
ok((await D.pg.evaluate(() => window.runAuto())).status === 'unavailable', 'nothing published yet: quiet'); files.set('app-data.json', keep);

// ---- "Load public library now" replaces on purpose, and can be undone
await D.pg.evaluate(() => { window.formulaStore.save({ name: 'D own', code: 'Buy=9;', kind: 'system' }); window.__reloaded = 0; });
await D.pg.evaluate(() => window.openSyncTest()); await D.pg.getByRole('button', { name: 'Load public library now' }).click(); await D.pg.waitForFunction(() => window.__reloaded > 0, null, { timeout: 6000 });
ok(!(await names(D)).includes('D own') && (await names(D)).includes('Fourth formula'), 'Load public library now replaces this device with the public copy');
await D.pg.evaluate(() => window.openSyncTest()); await D.pg.getByRole('button', { name: /Undo last load/ }).click(); await D.pg.waitForFunction(() => /Undone/.test(document.body.innerText));
ok((await names(D)).includes('D own'), 'and Undo brings the device back');
for (const d of [A, B, C, D]) ok(d.errs.length === 0, `${d.name}: no page errors ${d.errs.join('|')}`);
await b.close(); server.close(); console.log(fail ? `${fail} FAILED` : `shared-library: all ${pass} checks passed`); process.exit(fail ? 1 : 0);
