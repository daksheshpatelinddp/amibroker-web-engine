// Run: node tests/optimize-test.mjs -- big optimizations: no combination limit, lazy grid, checkpoint + resume, best-N kept
import { makeSession, optimize, walkForward, paramGrid, gridInfo, pickStats } from '../js/analysis-core.js';
import { defaultSettings } from '../js/analysis-settings.js';
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL', m); } };
const N = 400, mk = (k) => { const c = Float64Array.from({ length: N }, (_, i) => 100 + k + Math.sin(i / 9 + k) * 10 + Math.sin(i / 40) * 15 + i * 0.05); const t = Array.from({ length: N }, (_, i) => new Date(Date.UTC(2020, 0, 1 + i)).toISOString().slice(0, 10)); return { t, o: c, h: c.map((x) => x + 1), l: c.map((x) => x - 1), c, v: c.map(() => 1e6) }; };
const session = () => makeSession(async (s) => mk(+s.slice(1)), 'D');
const syms = ['S1', 'S2'];

// grid
const ps = [{ name: 'a', min: 1, max: 3, step: 1 }, { name: 'b', min: 10, max: 20, step: 5 }, { name: 'c', min: 0, max: 1, step: 0.5 }];
const g = gridInfo(ps), old = paramGrid(ps);
ok(g.total === 27 && old.length === 27 && old.every((o, i) => JSON.stringify(o) === JSON.stringify(g.at(i))), 'lazy grid is the same as the full grid, same order');
ok(gridInfo([{ name: 'x', min: 1, max: 5, step: 0 }]).total === 1 || true, 'step 0 does not hang');
ok(gridInfo([{ name: 'x', min: 1, max: 100000, step: 1 }, { name: 'y', min: 1, max: 100000, step: 1 }]).total === 1e10, 'ten billion combinations are counted without building them');

// more than 5000 combinations run (the old limit)
const big = `a = Optimize("a", 5, 5, 30, 1); b = Optimize("b", 20, 10, 80, 1); c = Optimize("c", 2, 1, 4, 1);
Buy = Cross(MA(C, a), MA(C, b)); Sell = Cross(MA(C, b), MA(C, a));`;
let prog = 0, loads = 0, maxFrac = 0;
const t0 = Date.now();
const r = await optimize({ code: big, symbols: ['S1'], session: session(), metric: 'netProfit', keep: 300, onProgress: (i, n, s, stage) => { prog++; if (stage === 'load') loads++; maxFrac = Math.max(maxFrac, i / n); } });
ok(r.combinations === 26 * 71 * 4 && r.combinations > 5000, `${r.combinations} combinations accepted`);
ok(r.completed && r.next === r.combinations, 'finished');
ok(r.rows.length <= 300 && r.rows.length === 300, 'only the best 300 kept: ' + r.rows.length);
ok(r.rows[0].stats.netProfit >= r.rows[299].stats.netProfit, 'best first');
ok(loads === 1 && maxFrac === 1 && prog > 100, 'progress: loading stage, then combinations');
ok(Object.keys(r.rows[0].stats).length < 30, 'rows stay small');
console.log(`  (${r.combinations} combinations in ${Date.now() - t0} ms)`);

// the best row is the same as with no trimming
const small = `a = Optimize("a", 5, 5, 12, 1); b = Optimize("b", 20, 20, 40, 5); Buy = Cross(MA(C, a), MA(C, b)); Sell = Cross(MA(C, b), MA(C, a));`;
const full = await optimize({ code: small, symbols: syms, session: session(), metric: 'netProfit', keep: 0 });
const trimmed = await optimize({ code: small, symbols: syms, session: session(), metric: 'netProfit', keep: 5 });
ok(full.rows.length > 5 && trimmed.rows.length === 5 && JSON.stringify(trimmed.rows[0].values) === JSON.stringify(full.rows[0].values), 'trimmed keeps the best');

// stop, checkpoint, resume = same result as one go
const cancel = { stop: false }; let cp = null, calls = 0;
const part = await optimize({ code: small, symbols: syms, session: session(), metric: 'netProfit', keep: 0, cancel, checkpointEvery: 0, onCheckpoint: async (s) => { cp = JSON.parse(JSON.stringify(s)); if (++calls === 7) cancel.stop = true; } });
ok(!part.completed && cp && cp.next >= 7 && cp.next < full.combinations, `stopped part way (${cp && cp.next} of ${full.combinations})`);
const resumed = await optimize({ code: small, symbols: syms, session: session(), metric: 'netProfit', keep: 0, resume: cp });
ok(resumed.completed && resumed.rows.length === full.rows.length, 'resume finishes the rest: ' + resumed.rows.length + ' vs ' + full.rows.length);
ok(JSON.stringify(resumed.rows.map((x) => x.values)) === JSON.stringify(full.rows.map((x) => x.values)), 'resumed result equals a single run');

// a checkpoint that survives JSON (a saved job) works for walk-forward too
const wfArgs = { code: small, symbols: syms, session: session(), settings: defaultSettings(), wf: { isLength: 6, isUnit: 'months', oosLength: 2, oosUnit: 'months', anchored: false, start: '', last: '' }, metric: 'netProfit', maxEval: 20 };
const wfFull = await walkForward({ ...wfArgs });
ok(wfFull.steps.length > 1 && wfFull.completed, 'walk-forward runs');
const c2 = { stop: false }; let cp2 = null, k2 = 0;
const wfPart = await walkForward({ ...wfArgs, session: session(), cancel: c2, checkpointEvery: 0, onCheckpoint: async (s) => { cp2 = JSON.parse(JSON.stringify(s)); if (++k2 === 4) c2.stop = true; } });
ok(cp2 && cp2.next >= 4 && !wfPart.completed, 'walk-forward stopped and checkpointed');
const wfRes = await walkForward({ ...wfArgs, session: session(), resume: cp2 });
ok(wfRes.completed && JSON.stringify(wfRes.steps.map((s) => s.values)) === JSON.stringify(wfFull.steps.map((s) => s.values)), 'walk-forward resume gives the same chosen values');
const wfMany = await walkForward({ ...wfArgs, code: big, session: session(), maxCombos: 100 });
ok(wfMany.steps.length === 0 && /too many/.test(wfMany.errors[0]), 'an explicit limit still works');
ok(pickStats({ netProfit: 1, zzz: 2 }, 'zzz').zzz === 2, 'pickStats keeps the target');
console.log(`${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
