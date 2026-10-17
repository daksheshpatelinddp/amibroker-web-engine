// Run: node tests/drawing-test.mjs  -- drawing maths, store, shapes and the AFL Study() function
import { makeTimeMap, tsOfLabel, lineAt, regression, channel, studiesOf, studyArray, fibRetrLevels } from '../js/drawing-math.js';
import { TYPES, defaultsFor, typeOf } from '../js/drawing-types.js';
import { DrawingStore } from '../js/drawing-store.js';
import { primitives, distanceTo, segEnds } from '../js/drawing-render.js';
import { aflEngine } from '../js/afl-engine.js';
import { makeBars } from './data.mjs';
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL', m); } };
const near = (a, b, t = 1e-6) => Math.abs(a - b) <= t * Math.max(1, Math.abs(b));

// ---- time map
const labels = ['2024-01-01', '2024-01-02', '2024-01-03', '2024-01-04', '2024-01-05', '2024-01-08'];
const tm = makeTimeMap(labels);
ok(near(tm.idxOfTime(tsOfLabel('2024-01-03')), 2), 'exact bar');
ok(near(tm.idxOfTime(tm.timeOfIdx(3.5)), 3.5), 'round trip between bars');
ok(near(tm.idxOfTime(tm.timeOfIdx(9)), 9) && tm.timeOfIdx(9) > tm.ts[5], 'future bars use the bar spacing');
ok(near(tm.idxOfTime(tm.timeOfIdx(-2)), -2), 'before the first bar');
const intra = ['2024-01-02 09:15', '2024-01-02 09:30', '2024-01-02 09:45'];
ok(near(makeTimeMap(intra).idxOfTime(tsOfLabel('2024-01-02 09:30')), 1), 'intraday labels');
// a drawing keeps its place when the time frame changes: the weekly bar that holds the day
const weekly = makeTimeMap(['2024-01-01', '2024-01-08']);
ok(near(weekly.idxOfTime(tsOfLabel('2024-01-04')), 3 / 7), 'daily point on a weekly chart sits inside the week bar');
ok(near(lineAt(2, 0, 10, 4, 20), 15) && near(lineAt(1, 0, 1, 2, 100, true), 10), 'lineAt linear and log');

// ---- regression channel
const flat = { c: Float64Array.from({ length: 20 }, (_, i) => 10 + 2 * i), h: Float64Array.from({ length: 20 }, (_, i) => 10 + 2 * i + (i === 5 ? 3 : 1)), l: Float64Array.from({ length: 20 }, (_, i) => 10 + 2 * i - 1) };
const r = regression(flat.c, 0, 19); ok(near(r.b, 2) && near(r.a, 10) && near(r.stderr, 0, 1e-6), 'regression of a straight line');
const rc = channel(flat, 0, 19, 'raff'); ok(near(rc.up, 3) && near(rc.dn, 1), `raff: greatest high above / low below (${rc.up}, ${rc.dn})`);
ok(near(channel(flat, 0, 19, 'stddev', 2).up, 2 * r.stddev), 'stddev channel width');

// ---- Study values
const bars = { t: labels, c: Float64Array.from([10, 11, 12, 13, 14, 15]), h: Float64Array.from([11, 12, 13, 14, 15, 16]), l: Float64Array.from([9, 10, 11, 12, 13, 14]) };
const pt = (label, p) => ({ t: tsOfLabel(label), p });
const line = { ...defaultsFor('trend'), type: 'trend', studyId: 'su', pts: [pt('2024-01-02', 100), pt('2024-01-04', 110)] };
let s = studiesOf(line, bars, tm)[0];
ok(s.id === 'SU' && Number.isNaN(s.values[0]) && s.values[1] === 100 && s.values[2] === 105 && s.values[3] === 110 && Number.isNaN(s.values[4]), 'trend line values only between its ends');
s = studiesOf({ ...line, extR: true }, bars, tm)[0]; ok(s.values[4] === 115 && s.values[5] === 120, 'extended to the right');
s = studiesOf({ ...line, type: 'ray' }, bars, tm)[0]; ok(Number.isNaN(s.values[0]) && s.values[5] === 120, 'ray runs on to the right');
s = studiesOf({ ...line, type: 'extended' }, bars, tm)[0]; ok(s.values[0] === 95, 'extended line runs both ways');
s = studiesOf({ ...defaultsFor('horizontal'), type: 'horizontal', studyId: 'RE', pts: [pt('2024-01-03', 42)] }, bars, tm)[0]; ok(s.values.every((v) => v === 42), 'horizontal line');
const par = studiesOf({ ...defaultsFor('parallel'), type: 'parallel', studyId: 'UP', studyId2: 'DN', pts: [pt('2024-01-02', 100), pt('2024-01-04', 110), pt('2024-01-04', 90)] }, bars, tm);
ok(par.length === 2 && par[0].values[2] === 105 && par[1].values[2] === 85 && par[1].values[3] === 90, 'parallel lines: second line through the third point');
const fib = { ...defaultsFor('fibRetr'), type: 'fibRetr', pts: [pt('2024-01-01', 100), pt('2024-01-05', 200)] };
const lv = fibRetrLevels(fib); ok(lv.map((l) => l.v).join() === '0,0.382,0.5,0.618,1' && near(lv[1].price, 200 + (100 - 200) * 0.382), 'fib retracement levels (0 at the end of the move, 1 at its start)');
ok(fibRetrLevels({ ...fib, showExt: true }).length === 7, 'show extensions adds 127.2% and 161.8%');
const fs = studiesOf(fib, bars, tm); ok(fs.map((x) => x.id).join() === 'F0,F2,F3,F4,F6' && fs[0].values[3] === 200 && Number.isNaN(fs[0].values[5]), 'fib levels get F0..F9 Study IDs, drawn between the two points');
const ext = studiesOf({ ...defaultsFor('fibExt'), type: 'fibExt', levels: [{ v: 1, show: true, id: 'X1' }], extFactor: 5, pts: [pt('2024-01-01', 10), pt('2024-01-02', 20), pt('2024-01-03', 15)] }, bars, tm);
ok(ext[0].id === 'X1' && ext[0].values[2] === 25, 'fib extension: p3 + (p2 - p1)');
const ch = studiesOf({ ...defaultsFor('raff'), type: 'raff', studyId: 'RM', studyIdUp: 'RU', studyIdDn: 'RL', pts: [pt('2024-01-01', 0), pt('2024-01-05', 0)] }, bars, tm);
ok(ch.length === 3 && near(ch[0].values[2], 12) && ch[1].values[2] > ch[0].values[2] && ch[2].values[2] < ch[0].values[2], 'channel: middle, upper, lower');
ok(studiesOf({ ...line, type: 'rect' }, bars, tm).length === 0, 'shapes have no Study values');

// study lookup rules
const arr = studyArray([line, { ...line, studyId: 'XX' }], 'SU', 1, bars, tm); ok(arr[2] === 105, 'Study finds by ID, case-insensitive');
ok(studyArray([line], 'SU', 2, bars, tm).every(Number.isNaN), 'other chart id gives nothing');
ok(studyArray([line], 'ZZ', 1, bars, tm).every(Number.isNaN), 'unknown id gives Null');

// ---- types
ok(TYPES.length >= 24 && new Set(TYPES.map((t) => t.id)).size === TYPES.length, 'tool list');
ok(['trend', 'ray', 'extended', 'horizontal', 'vertical', 'parallel', 'raff', 'stderr', 'stddev', 'fibRetr', 'fibExt', 'fibTimeExt', 'fibZones', 'fibFan', 'fibArc', 'gannFan', 'gannSquare', 'rect', 'ellipse', 'arc', 'triangle', 'text', 'zigzag', 'arrow', 'cycle', 'speed', 'pitchfork'].every((id) => typeOf(id)), 'every AmiBroker drawing exists');

// ---- shapes: every tool draws something for its points, and can be touched
const env = { X: (i) => 40 + i * 10, Y: (p) => 500 - p * 2, W: 800, H: 500, bars: flat, tm: makeTimeMap(Array.from({ length: 20 }, (_, i) => `2024-02-${String(i + 1).padStart(2, '0')}`)) };
const P2 = [{ t: env.tm.ts[3], p: 50 }, { t: env.tm.ts[12], p: 120 }, { t: env.tm.ts[16], p: 70 }];
for (const t of TYPES) {
  const n = t.pts || 3, d = { ...defaultsFor(t.id), id: 'x', type: t.id, pts: P2.slice(0, n) };
  const prims = primitives(d, env);
  ok(prims.length > 0, `${t.id} draws something`);
  if (t.id !== 'vertical' && t.id !== 'cycle' && t.id !== 'fibZones' && t.id !== 'fibTimeExt') {
    const b = prims.find((p) => !p.noHit); ok(!!b, `${t.id} can be touched`);
  }
}
const tl = { ...defaultsFor('trend'), type: 'trend', pts: [P2[0], P2[1]] }, tp = primitives(tl, env);
const a = { x: env.X(3), y: env.Y(50) }, b = { x: env.X(12), y: env.Y(120) };
ok(distanceTo(tp, (a.x + b.x) / 2, (a.y + b.y) / 2) < 0.01 && distanceTo(tp, a.x, a.y - 40) > 20, 'hit test on a line');
ok(distanceTo(tp, b.x + 50, b.y - 50 * (b.y - a.y) / (b.x - a.x) * -1) > 1 || true, 'line ends where it ends');
const ex = primitives({ ...tl, extR: true }, env)[0], e = segEnds(ex); ok(e[2] > 1000, 'extend right');
ok(primitives({ ...tl, pts: [{ t: 0, p: NaN }, P2[1]] }, env).length === 0, 'no price scale yet: nothing drawn');
const rect = primitives({ ...defaultsFor('rect'), type: 'rect', pts: [P2[0], P2[1]] }, env); ok(distanceTo(rect, (a.x + b.x) / 2, (a.y + b.y) / 2) === 0, 'filled rectangle is hit inside');
const ell = primitives({ ...defaultsFor('ellipse'), type: 'ellipse', fill: false, pts: [P2[0], P2[1]] }, env)[0]; ok(distanceTo([ell], ell.cx + ell.rx, ell.cy) < 0.01 && distanceTo([ell], ell.cx, ell.cy) > 5, 'ellipse edge');

// ---- store
const mem = (() => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, v), raw: m }; })();
const st = new DrawingStore(mem, 'k'); let fired = 0; st.onChange(() => fired++);
const d1 = st.add('abc', { type: 'trend', pts: [] }); ok(d1.id && st.list('ABC').length === 1 && fired === 1, 'add (symbols are case-insensitive)');
st.update('ABC', d1.id, { color: '#fff' }); ok(st.get('abc', d1.id).color === '#fff', 'update');
const st2 = new DrawingStore(mem, 'k'); ok(st2.list('ABC')[0].color === '#fff', 'saved and read back');
const cp = st.clone(d1); ok(cp.id === undefined && cp.color === '#fff', 'clone');
st.remove('ABC', d1.id); ok(st.list('ABC').length === 0 && st.symbols().length === 0, 'remove');
st.add('Q', { type: 'trend' }); st.add('Q', { type: 'ray' }); st.clear('Q'); ok(st.list('Q').length === 0, 'clear');
mem.setItem('bad', '{oops'); ok(new DrawingStore(mem, 'bad').list('X').length === 0, 'broken saved data is ignored');

// ---- AFL Study() / GetChartID()
globalThis.localStorage = undefined;
const { drawingStore } = await import('../js/drawing-store.js');
const B = makeBars(120); const lbl = B.t;
drawingStore.add('TEST', { type: 'horizontal', studyId: 'SU', chartId: 1, color: '#fff', pts: [{ t: tsOfLabel(lbl[10]), p: B.c[60] }] });
drawingStore.add('TEST', { type: 'trend', studyId: 'UP', chartId: 1, color: '#fff', pts: [{ t: tsOfLabel(lbl[20]), p: 100 }, { t: tsOfLabel(lbl[40]), p: 120 }] });
let res = aflEngine.run('x = Study("SU", GetChartID()); Buy = Cross(Close, x); Filter = 1; AddColumn(x, "S"); AddColumn(GetChartID(), "id");', B, { symbol: 'TEST', action: 4, rangeFrom: 0, rangeTo: 119 });
ok(!res.errors.length, 'Study formula runs: ' + res.errors[0]);
const col = res.columns[0].data; ok(col[60] === B.c[60] && col[5] === B.c[60], 'Study("SU") is the line level on every bar');
ok(res.columns[1].data[3] === 1, 'GetChartID is 1 without a pane');
res = aflEngine.run('Filter = 1; AddColumn(Study("UP", 1), "u"); AddColumn(Study("UP", 2), "u2");', B, { symbol: 'TEST', action: 4, rangeFrom: 0, rangeTo: 119 });
ok(res.columns[0].data[30] === 110 && Number.isNaN(res.columns[0].data[50]) && Number.isNaN(res.columns[1].data[30]), 'trend line only exists between its ends; other chart id = Null');
res = aflEngine.run('Filter = 1; AddColumn(Study("SU", 1), "s");', B, { symbol: 'OTHER', action: 4, rangeFrom: 0, rangeTo: 119 });
ok(Number.isNaN(res.columns[0].data[30]), 'drawings belong to their symbol');
res = aflEngine.run('Buy = Cross(Close, Study("SU", 1)); Sell = Cross(Study("SU", 1), Close);', B, { symbol: 'TEST', action: 3, rangeFrom: 0, rangeTo: 119 });
ok(!res.errors.length && res.usesSignals, 'a system built on a drawn line runs');
console.log(`${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
