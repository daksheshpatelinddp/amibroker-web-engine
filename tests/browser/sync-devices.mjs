// Run: node tests/browser/sync-devices.mjs -- the "Sync data between devices" window in Chromium: device A saves to a fake GitHub (and to a
// backup file), brand-new device B / C load it, Undo, add-missing, a public repo is warned about, tokens never travel.
import fs from 'fs'; import os from 'os'; import path from 'path';
import { serve, launch } from './_serve.mjs';
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL', m); } };
const { server, port } = await serve(); const b = await launch();
const files = new Map(); let shaN = 1, isPrivate = true;
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };
async function device(name) {
  const ctx = await b.newContext(); const pg = await ctx.newPage(); const errs = [], dialogs = []; pg.on('pageerror', (e) => errs.push(e.message));
  let answer = true; pg.on('dialog', (d) => { dialogs.push(d.message()); answer ? d.accept() : d.dismiss(); });
  await ctx.route('https://api.github.com/**', async (route) => {
    const req = route.request(), u = new URL(req.url()), m = req.method();
    if (m === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    if (/^\/repos\/[^/]+\/[^/]+$/.test(u.pathname)) return route.fulfill({ status: 200, headers: CORS, json: { private: isPrivate } });
    const cm = u.pathname.match(/^\/repos\/[^/]+\/[^/]+\/contents\/(.+)$/);
    if (cm) { const p = decodeURIComponent(cm[1]);
      if (m === 'GET') { if (!files.has(p)) return route.fulfill({ status: 404, headers: CORS, body: '{}' }); const f = files.get(p); return /raw/.test(req.headers().accept || '') ? route.fulfill({ status: 200, headers: CORS, contentType: 'application/json', body: f.text }) : route.fulfill({ status: 200, headers: CORS, json: { sha: f.sha } }); }
      if (m === 'PUT') { const body = JSON.parse(req.postData()); files.set(p, { text: Buffer.from(body.content, 'base64').toString('utf8'), sha: 's' + shaN++ }); return route.fulfill({ status: 201, headers: CORS, json: { content: { sha: 's' } } }); } }
    return route.fulfill({ status: 404, headers: CORS, body: '{}' });
  });
  await pg.goto(`http://localhost:${port}/tests/browser/sync-harness.html`); await pg.waitForFunction(() => window.ready);
  return { pg, ctx, errs, dialogs, say: (v) => { answer = v; }, name };
}
const openWin = async (d) => { await d.pg.evaluate(() => window.openSyncTest()); };
const fill = async (d, token) => { await d.pg.fill('input[placeholder="owner/amibroker-analysis-runner"]', 'me/private-runner'); await d.pg.fill('input[placeholder^="GitHub token"]', token); };
const msgText = (d) => d.pg.evaluate(() => [...document.querySelectorAll('#modal-root div')].filter((x) => /Saved to GitHub|Loaded|Could not|Nothing|Not saved|Undone|Backup file/.test(x.textContent) && x.children.length === 0).map((x) => x.textContent).join(' | '));

// ---- Device A: the phone with all the work
const A = await device('phone');
await A.pg.evaluate(() => {
  window.formulaStore.save({ name: 'Alok Jain Momentum', code: 'Buy = C > MA(C, 20);', kind: 'system' }); window.formulaStore.save({ name: 'RSI Explore', code: 'Filter = RSI(14) > 70;', kind: 'exploration' });
  localStorage.setItem('amibroker_categories_v2', JSON.stringify({ v: 2, names: {}, favorites: ['TCS', 'INFY'], marker: 'phone-categories' }));
  localStorage.setItem('amibroker_workspace_v1', JSON.stringify({ v: 1, activeId: 's1', sheets: [{ id: 's1', name: 'Sheet 1' }, { id: 's2', name: 'Weekly' }] }));
  localStorage.setItem('aa_projects_v1', JSON.stringify([{ name: 'my project' }]));
  localStorage.setItem('aa_remote_cfg_v1', JSON.stringify({ repo: 'me/private-runner', token: 'PHONE-SECRET-TOKEN', branch: 'main', shards: 8 }));
  localStorage.setItem('amibroker_ai_cfg_v1', JSON.stringify({ key: 'PHONE-AI-KEY' }));
});
await openWin(A); await fill(A, 'PHONE-SECRET-TOKEN');
// a PUBLIC repo is warned about, and "No" saves nothing
isPrivate = false; A.say(false); await A.pg.getByRole('button', { name: 'Save to GitHub' }).click(); await A.pg.waitForFunction(() => /Not saved/.test(document.body.innerText));
ok(A.dialogs.some((m) => /PUBLIC/.test(m)) && !files.has('sync/app-data.json'), 'a public repo is warned about and nothing is saved when you say No');
isPrivate = true; A.say(true); await A.pg.getByRole('button', { name: 'Save to GitHub' }).click(); await A.pg.waitForFunction(() => /Saved to GitHub/.test(document.body.innerText));
const saved = files.get('sync/app-data.json'); ok(!!saved, 'saved to sync/app-data.json in the repo');
const bundle = JSON.parse(saved.text);
ok(/2 formulas, 2 sheets/.test(await msgText(A)), 'the window says what was saved: ' + (await msgText(A)));
ok(!saved.text.includes('SECRET') && !saved.text.includes('PHONE-AI-KEY') && !bundle.items.aa_remote_cfg_v1, 'the token and AI key are not in the saved file');
ok(bundle.items.amibroker_categories_v2.includes('phone-categories') && bundle.items.aa_projects_v1.includes('my project'), 'categories and projects are in it');
// backup file
const dl = A.pg.waitForEvent('download'); await A.pg.getByRole('button', { name: 'Download backup file' }).click(); const dlf = await dl;
const tmp = path.join(os.tmpdir(), 'bk-' + Date.now() + '.json'); await dlf.saveAs(tmp); const fileBundle = JSON.parse(fs.readFileSync(tmp, 'utf8'));
ok(/^amibroker-backup-\d{4}-\d\d-\d\d\.json$/.test(dlf.suggestedFilename()) && fileBundle.items.amibroker_formulas_v1 === bundle.items.amibroker_formulas_v1, 'a backup file can be downloaded: ' + dlf.suggestedFilename());

// ---- Device B: the son's laptop, brand new
const B = await device('laptop');
await B.pg.evaluate(() => { window.newDeviceHint(); });
await openWin(B); await fill(B, 'SON-TOKEN');
await B.pg.getByRole('button', { name: 'Load from GitHub' }).click(); await B.pg.waitForFunction(() => /Copy from GitHub/.test(document.body.innerText));
const txt = await B.pg.evaluate(() => document.body.innerText);
ok(/The copy: 2 formulas, 2 sheets/.test(txt) && /This device now: 0 formulas/.test(txt), 'B sees the copy (2 formulas) and its own empty state');
ok(await B.pg.locator('select').last().inputValue() === 'replace', 'a device with no formulas defaults to "Replace"');
await B.pg.getByRole('button', { name: 'Load now' }).click(); await B.pg.waitForFunction(() => window.__reloaded > 0, null, { timeout: 5000 });
const got = await B.pg.evaluate(() => ({ f: new window.formulaStore.constructor().user.map((x) => x.name), cat: localStorage.getItem('amibroker_categories_v2'), tok: JSON.parse(localStorage.getItem('aa_remote_cfg_v1')).token, ws: JSON.parse(localStorage.getItem('amibroker_workspace_v1')).sheets.length }));
ok(got.f.join() === 'Alok Jain Momentum,RSI Explore' || [...got.f].sort().join() === 'Alok Jain Momentum,RSI Explore', 'the laptop has the formulas after loading: ' + got.f);
ok(/phone-categories/.test(got.cat) && got.ws === 2, 'categories and sheets arrived');
ok(got.tok === 'SON-TOKEN', "the laptop keeps its own token (the phone's never traveled)");
// undo
await openWin(B); ok(await B.pg.getByRole('button', { name: /Undo last load/ }).count() === 1, 'an Undo button is there after a load');
await B.pg.getByRole('button', { name: /Undo last load/ }).click(); await B.pg.waitForFunction(() => /Undone/.test(document.body.innerText));
ok(await B.pg.evaluate(() => localStorage.getItem('amibroker_formulas_v1') === null && localStorage.getItem('amibroker_categories_v2') === null), 'Undo puts the laptop back as it was');

// ---- Device C: has its own formula, "add what is missing"
const C = await device('tablet');
await C.pg.evaluate(() => { window.formulaStore.save({ name: 'Tablet only', code: 'Buy=1;', kind: 'system' }); localStorage.setItem('amibroker_categories_v2', JSON.stringify({ v: 2, names: {}, marker: 'tablet-categories' })); });
await openWin(C); await fill(C, 'TAB-TOKEN'); await C.pg.getByRole('button', { name: 'Load from GitHub' }).click(); await C.pg.waitForFunction(() => /Copy from GitHub/.test(document.body.innerText));
ok(await C.pg.locator('select').last().inputValue() === 'add', 'a device that already has formulas defaults to "Add what is missing"');
await C.pg.getByRole('button', { name: 'Load now' }).click(); await C.pg.waitForFunction(() => window.__reloaded > 0, null, { timeout: 5000 });
const c = await C.pg.evaluate(() => ({ f: new window.formulaStore.constructor().user.map((x) => x.name).sort(), cat: localStorage.getItem('amibroker_categories_v2') }));
ok(c.f.join() === 'Alok Jain Momentum,RSI Explore,Tablet only', 'the tablet has all three formulas: ' + c.f);
ok(/tablet-categories/.test(c.cat), "the tablet's own categories were not overwritten");

// ---- Device D: opens the backup FILE
const D = await device('friend'); await openWin(D);
await D.pg.setInputFiles('input[type=file]', tmp); await D.pg.waitForFunction(() => /Copy from the file/.test(document.body.innerText));
await D.pg.getByRole('button', { name: 'Load now' }).click(); await D.pg.waitForFunction(() => window.__reloaded > 0, null, { timeout: 5000 });
ok(await D.pg.evaluate(() => new window.formulaStore.constructor().user.length) === 2, 'a backup file loads on another device without GitHub');
await D.pg.evaluate(() => window.openSyncTest()); await D.pg.setInputFiles('input[type=file]', { name: 'x.json', mimeType: 'application/json', buffer: Buffer.from('{"hello":1}') });
await D.pg.waitForFunction(() => /not a data backup/i.test(document.body.innerText)); ok(true, 'a wrong file is refused with a plain message');
// nothing saved yet on a fresh repo -> plain message
files.delete('sync/app-data.json'); const E = await device('x'); await openWin(E); await fill(E, 'T'); await E.pg.getByRole('button', { name: 'Load from GitHub' }).click(); await E.pg.waitForFunction(() => /Nothing saved on GitHub yet/.test(document.body.innerText)); ok(true, 'nothing on GitHub yet: told to save from the other device first');
for (const d of [A, B, C, D, E]) ok(d.errs.length === 0, `${d.name}: no page errors ${d.errs.join('|')}`);
await b.close(); server.close(); console.log(fail ? `${fail} FAILED` : `sync-devices: all ${pass} checks passed`); process.exit(fail ? 1 : 0);
