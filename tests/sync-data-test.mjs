// Run: node tests/sync-data-test.mjs -- what is synced, what never is, replace / add-missing, formulas joined by id, undo.
import { collect, plan, apply, restore, summarize, itemsOf, isSyncKey, checkBundle, MAX_PSEUDO_BYTES, collectPublic, planFollow, nextState, hash32, isPublicKey } from '../js/sync-data.js';
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL', m); } };
const mem = (init = {}) => { const m = new Map(Object.entries(init)); return { get length() { return m.size; }, key: (i) => [...m.keys()][i], getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), _m: m }; };
const fx = (arr) => JSON.stringify({ v: 1, formulas: arr });

const A = mem({
  amibroker_formulas_v1: fx([{ id: 'u:a', name: 'Momentum', code: 'Buy=1;', updated: 100 }, { id: 'u:b', name: 'RSI', code: 'Buy=2;', updated: 100 }]),
  amibroker_categories_v2: JSON.stringify({ v: 2, names: {}, favorites: ['TCS'] }), amibroker_categories_v2__bse: JSON.stringify({ v: 2, names: {} }),
  amibroker_workspace_v1: JSON.stringify({ v: 1, activeId: 's1', sheets: [{ id: 's1' }, { id: 's2' }] }), aa_settings_v1: '{"x":1}', aa_projects_v1: '[{"n":1}]',
  aa_remote_cfg_v1: '{"repo":"me/r","token":"SECRET-TOKEN"}', amibroker_ai_cfg_v1: '{"key":"SECRET-AI"}', amibroker_pseudo_v1: 'x'.repeat(MAX_PSEUDO_BYTES + 10),
  some_other_key: 'junk', symbols_nse: '["A","B"]', aa_remote_jobs_v1: '[]' });

const { bundle, skipped } = collect(A, { device: 'phone', now: 5 });
const keys = Object.keys(bundle.items);
ok(keys.includes('amibroker_formulas_v1') && keys.includes('amibroker_categories_v2') && keys.includes('amibroker_categories_v2__bse') && keys.includes('amibroker_workspace_v1') && keys.includes('aa_settings_v1') && keys.includes('aa_projects_v1'), 'formulas, categories (both markets), sheets, settings and projects are collected');
ok(!JSON.stringify(bundle).includes('SECRET'), 'the GitHub token and the AI key are never in the bundle');
ok(!keys.includes('some_other_key') && !keys.includes('symbols_nse') && !keys.includes('aa_remote_jobs_v1'), 'unrelated keys, symbol-list caches and the job list are left out');
ok(skipped.length === 1 && skipped[0].key === 'amibroker_pseudo_v1', 'an oversized breadth series is skipped and reported: ' + JSON.stringify(skipped));
ok(bundle.device === 'phone' && bundle.savedAt === 5 && checkBundle(bundle) === bundle, 'bundle header');
let threw = ''; try { checkBundle({ nope: 1 }); } catch (e) { threw = e.message; } ok(/not a data backup/.test(threw), 'a foreign file is refused');
ok(!isSyncKey('aa_remote_cfg_v1') && isSyncKey('amibroker_categories_v2__nasdaq'), 'key rules');

const s = summarize(bundle.items); ok(s.formulas === 2 && s.sheets === 2 && [...s.markets].sort().join() === 'BSE,NSE', 'summary: ' + JSON.stringify(s));

// a NEW empty device, "replace": everything arrives
const B = mem({ aa_remote_cfg_v1: '{"repo":"son/r","token":"HIS-TOKEN"}' });
let pl = plan(B, bundle, 'replace'); ok(Object.keys(pl.writes).length === keys.length, 'replace: all items written');
const undo1 = apply(B, pl);
ok(B.getItem('amibroker_formulas_v1') === A.getItem('amibroker_formulas_v1') && B.getItem('amibroker_categories_v2') === A.getItem('amibroker_categories_v2'), 'the new device now holds the formulas and categories');
ok(B.getItem('aa_remote_cfg_v1').includes('HIS-TOKEN'), "the new device's own token is untouched");
restore(B, undo1); ok(B.getItem('amibroker_formulas_v1') === null && B.getItem('aa_settings_v1') === null && B.getItem('aa_remote_cfg_v1').includes('HIS-TOKEN'), 'undo puts the device back as it was');

// a device with its own work, "add what is missing"
const C = mem({ amibroker_formulas_v1: fx([{ id: 'u:a', name: 'Momentum (edited here)', code: 'Buy=9;', updated: 200 }, { id: 'u:z', name: 'Mine', code: 'Buy=3;', updated: 50 }]),
  amibroker_categories_v2: JSON.stringify({ v: 2, names: { MINE: 1 } }), amibroker_workspace_v1: '' });
pl = plan(C, bundle, 'add'); apply(C, pl);
const fm = JSON.parse(C.getItem('amibroker_formulas_v1')).formulas, byId = Object.fromEntries(fm.map((f) => [f.id, f]));
ok(fm.length === 3 && byId['u:b'] && byId['u:z'] && byId['u:a'].code === 'Buy=9;', 'add: formulas joined, the newer edit made here is kept (' + fm.map((f) => f.id) + ')');
ok(JSON.parse(C.getItem('amibroker_categories_v2')).names.MINE === 1, 'add: existing categories on this device are not overwritten');
ok(C.getItem('amibroker_categories_v2__bse') && JSON.parse(C.getItem('amibroker_workspace_v1')).sheets.length === 2, 'add: what was missing or empty is filled in (other market, sheets)');
ok(pl.notes.some((n) => /1 added/.test(n) && /3 in total/.test(n)), 'add: a plain note: ' + pl.notes);
// the other copy has the newer version of a formula
const D = mem({ amibroker_formulas_v1: fx([{ id: 'u:a', name: 'Old', code: 'Buy=0;', updated: 1 }]) });
apply(D, plan(D, bundle, 'add')); ok(JSON.parse(D.getItem('amibroker_formulas_v1')).formulas.find((f) => f.id === 'u:a').code === 'Buy=1;', 'add: the newer copy wins');
// nothing to do
const E = mem(Object.fromEntries(Object.entries(bundle.items))); ok(Object.keys(plan(E, bundle, 'replace').writes).length === 0, 'replace: an identical device has nothing to write');
ok(Object.keys(itemsOf(A)).length === keys.length + 1, 'itemsOf lists what this device holds');

// ---- the PUBLIC library: what is published, and how a device follows it
const P = collectPublic(A, { device: 'phone', now: 10 });
ok(P.public === true && Object.keys(P.items).sort().join() === ['aa_projects_v1', 'aa_settings_v1', 'amibroker_categories_v2', 'amibroker_categories_v2__bse', 'amibroker_formulas_v1', 'amibroker_workspace_v1'].join(), 'public items: ' + Object.keys(P.items));
ok(!JSON.stringify(P).includes('SECRET') && !('amibroker_pseudo_v1' in P.items) && !isPublicKey('intraday_cfg_v1') && !isPublicKey('user_databases_v1') && !isPublicKey('aa_remote_cfg_v1'), 'no tokens, keys, server settings or breadth data in the public file');
ok(hash32('abc') === hash32('abc') && hash32('abc') !== hash32('abd'), 'hash');
// a brand-new device takes everything
const N = mem(); const f1 = planFollow(N, P, null); ok(f1.newDevice && Object.keys(f1.writes).length === Object.keys(P.items).length, 'new device: takes everything');
apply(N, f1); const st1 = nextState(N, P, null, f1.writes);
ok(st1.version === '10' && st1.hashes.amibroker_categories_v2 === hash32(P.items.amibroker_categories_v2), 'state remembers the version and the loaded values');
ok(Object.keys(planFollow(N, P, st1).writes).length === 0, 'the same copy again: nothing to do');
// the owner changes the categories and adds a formula; the laptop did not touch its categories -> follows
const P2 = { ...P, savedAt: 20, items: { ...P.items, amibroker_categories_v2: JSON.stringify({ v: 2, names: {}, favorites: ['NEW'] }), amibroker_formulas_v1: fx([...JSON.parse(P.items.amibroker_formulas_v1).formulas, { id: 'u:c', name: 'New one', code: 'Buy=5;', updated: 300 }]) } };
const f2 = planFollow(N, P2, st1); apply(N, f2);
ok(JSON.parse(N.getItem('amibroker_categories_v2')).favorites[0] === 'NEW' && JSON.parse(N.getItem('amibroker_formulas_v1')).formulas.length === 3, 'untouched items follow the public copy; new formulas arrive');
// the laptop user edits categories; the next public copy must not overwrite that, but still brings formulas
const st2 = nextState(N, P2, st1, f2.writes); N.setItem('amibroker_categories_v2', JSON.stringify({ v: 2, names: {}, favorites: ['MINE'] }));
const P3 = { ...P2, savedAt: 30, items: { ...P2.items, amibroker_categories_v2: JSON.stringify({ v: 2, names: {}, favorites: ['OWNER-AGAIN'] }), amibroker_formulas_v1: fx([...JSON.parse(P2.items.amibroker_formulas_v1).formulas, { id: 'u:d', name: 'Fourth', code: 'Buy=6;', updated: 400 }]) } };
apply(N, planFollow(N, P3, st2));
ok(JSON.parse(N.getItem('amibroker_categories_v2')).favorites[0] === 'MINE' && JSON.parse(N.getItem('amibroker_formulas_v1')).formulas.length === 4, 'what you changed yourself is kept; formulas still arrive');
// an existing device that never loaded before (has its own formulas): keeps its own categories, formulas are joined
const X = mem({ amibroker_formulas_v1: fx([{ id: 'u:own', name: 'Own', code: 'Buy=0;', updated: 5 }]), amibroker_categories_v2: JSON.stringify({ v: 2, names: {}, favorites: ['OWN'] }) });
const fx2 = planFollow(X, P, null); ok(!fx2.newDevice, 'a device with its own formulas is not "new"'); apply(X, fx2);
ok(JSON.parse(X.getItem('amibroker_categories_v2')).favorites[0] === 'OWN' && JSON.parse(X.getItem('amibroker_formulas_v1')).formulas.length === 3 && X.getItem('aa_projects_v1'), 'existing device: own categories kept, formulas joined, missing items filled');
// force replaces everything
const fz = planFollow(X, P2, null, { force: true }); apply(X, fz); ok(JSON.parse(X.getItem('amibroker_categories_v2')).favorites[0] === 'NEW', 'force: replaces with the public copy');
console.log(fail ? `${fail} FAILED` : `sync-data: all ${pass} checks passed`); process.exit(fail ? 1 : 0);
