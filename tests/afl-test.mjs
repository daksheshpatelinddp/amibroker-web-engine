// Run:  node tests/afl-test.mjs     (no browser needed)
import { aflEngine, parse } from '../js/afl-engine.js';
import * as L from '../js/afl-lib.js';
import { BUILTIN_FORMULAS } from '../js/builtin-formulas.js';
import { AFL_REFERENCE, AFL_EXAMPLE } from '../js/afl-reference.js';
import { FormulaStore } from '../js/formula-store.js';
import { makeBars } from './data.mjs';

let pass = 0, fail = 0;
const ok = (cond, msg) => { if (cond) pass++; else { fail++; console.log('  FAIL:', msg); } };
const near = (a, b, tol = 1e-9) => Math.abs(a - b) <= tol * Math.max(1, Math.abs(b));
const bars = makeBars(1500);
const run = (code, opts) => aflEngine.run(code, bars, opts);
const last = (a) => a[a.length - 1];

// ---------------------------------------------------------------- built-in library
console.log('built-in formulas');
const keys = new Set();
for (const f of BUILTIN_FORMULAS) {
  ok(!keys.has(f.key), `duplicate key ${f.key}`); keys.add(f.key);
  const r = run(f.code, { symbol: 'TEST' });
  ok(r.errors.length === 0, `${f.name}: ${r.errors.join('; ')}`);
  if (f.kind === 'exploration') ok(r.filter && r.columns.length > 0, `${f.name}: needs Filter + AddColumn`);
  else ok(r.plots.length > 0, `${f.name}: draws nothing`);
  if (f.kind === 'system') ok(r.buy && r.sell, `${f.name}: needs Buy/Sell`);
  for (const p of r.plots) {
    ok(p.data.length === bars.t.length, `${f.name}/${p.name}: length`);
    const finite = p.data.filter(Number.isFinite).length;
    ok(finite > 50, `${f.name}/${p.name}: only ${finite} finite values`);
  }
}
console.log(`  ${BUILTIN_FORMULAS.length} formulas checked`);

// ---------------------------------------------------------------- reference text only names real functions
console.log('reference');
const names = new Set(aflEngine.functionNames());
const refNames = new Set([...AFL_REFERENCE.matchAll(/\b([A-Za-z_][A-Za-z0-9_]*)\(/g)].map((m) => m[1].toLowerCase()));
const skip = new Set(['if', 'for', 'while', 'do', 'switch', 'function', 'name', 'array', 'x', 'y', 'a', 'b']);
for (const n of refNames) if (!skip.has(n) && !names.has(n) && !['_section_begin', '_section_end'].includes(n)) ok(false, `reference mentions unsupported function ${n}()`);
ok(run(AFL_EXAMPLE).errors.length === 0, 'AFL_EXAMPLE runs');

// ---------------------------------------------------------------- numbers
console.log('numbers');
{
  const c = Float64Array.from(bars.c);
  const m = L.ma(c, 5);
  ok(Number.isNaN(m[3]) && near(m[4], (c[0] + c[1] + c[2] + c[3] + c[4]) / 5), 'MA');
  const e = L.ema(c, 10), k = 2 / 11;
  ok(near(e[0], c[0]) && near(e[1], c[0] + k * (c[1] - c[0])), 'EMA recursion');
  const r = L.rsiA(c, 14);
  ok(r.every((v) => Number.isNaN(v) || (v >= 0 && v <= 100)), 'RSI in 0..100');
  ok(near(L.hhv(c, 3)[10], Math.max(c[8], c[9], c[10])), 'HHV');
  ok(near(L.llv(c, 3)[10], Math.min(c[8], c[9], c[10])), 'LLV');
  ok(L.ref(c, -1)[5] === c[4] && Number.isNaN(L.ref(c, -1)[0]) && L.ref(c, 1)[5] === c[6], 'Ref(-1) = previous bar');
  ok(near(L.sum(c, 3)[5], c[3] + c[4] + c[5]), 'Sum');
  const a = L.atr(Float64Array.from(bars.h), Float64Array.from(bars.l), c, 14);
  ok(a.every((v) => v > 0), 'ATR positive');
  const adx = L.adx(Float64Array.from(bars.h), Float64Array.from(bars.l), c, 14);
  ok(adx.slice(100).every((v) => v >= 0 && v <= 100), 'ADX 0..100');
  const x = Float64Array.from([1, 2, 3, 4, 5, 6]);
  ok(near(L.linRegSlope(x, 4)[5], 1), 'LinRegSlope of a straight line = 1');
  ok(near(L.tsf(x, 4)[5], 7), 'TSF forecasts the next value');
  ok(near(L.stdev(Float64Array.from([2, 4, 4, 4, 5, 5, 7, 9]), 8)[7], 2), 'StDev (population)');
  const cr = L.cross(Float64Array.from([1, 1, 3, 3]), Float64Array.from([2, 2, 2, 2]));
  ok(cr[2] === 1 && cr[3] === 0 && cr[1] === 0, 'Cross');
  const bs = L.barsSince(Float64Array.from([0, 1, 0, 0, 1, 0]));
  ok(Number.isNaN(bs[0]) && bs[1] === 0 && bs[3] === 2 && bs[5] === 1, 'BarsSince');
  const vw = L.valueWhen(Float64Array.from([0, 1, 0, 1, 0]), Float64Array.from([10, 20, 30, 40, 50]), 1);
  ok(vw[2] === 20 && vw[4] === 40, 'ValueWhen');
  const fl = L.flip(Float64Array.from([1, 0, 0, 0, 0]), Float64Array.from([0, 0, 1, 0, 0]));
  ok(fl.join() === '1,1,0,0,0', 'Flip');
}

// ---------------------------------------------------------------- language
console.log('language');
{
  let r = run('x = Close; x[5] = 1; y = Close;');
  ok(r.errors.length === 0 && r.vars.x[5] === 1 && r.vars.y[5] === bars.c[5], 'copy-on-write keeps Close intact');
  r = run('a = 1; b = a; a[3] = 7; c = 0; d = Close; d[0] = 5; e = d; e[1] = 9;');
  ok(r.errors.length === 0 && r.vars.d[1] === bars.c[1] && r.vars.e[1] === 9, 'aliasing: editing one array does not change another');
  r = run('s = 0; for(i=0;i<10;i++){ if(i==3) continue; if(i==6) break; s += i; }');
  ok(r.vars.s === 0 + 1 + 2 + 4 + 5, 'for/continue/break');
  r = run('i=0; while(i<5){ i++; } j=0; do { j += 2; } while(j<7);');
  ok(r.vars.i === 5 && r.vars.j === 8, 'while / do-while');
  r = run('function fib(n){ if(n<2) return n; return fib(n-1)+fib(n-2); } q = fib(10);');
  ok(r.errors.length === 0 && r.vars.q === 55, 'recursive user function');
  r = run('x = 2 ^ 3 ^ 2; y = -2 ^ 2; z = 10 % 4 + 1;');
  ok(r.vars.x === 512 && r.vars.y === -4 && r.vars.z === 3, 'operator precedence');
  r = run('a = 1 > 0 AND 2 > 1 OR 0; b = NOT 1; c = 5 > 3 ? 10 : 20; d = 4 | 2; e = 6 & 3; f = 7 AND 1000000;');
  ok(r.vars.a === 1 && r.vars.b === 0 && r.vars.c === 10 && r.vars.d === 6 && r.vars.e === 2 && r.vars.f === 1, 'logic + bitwise operators');
  r = run('t = "ab" + "cd" + 5; u = StrFormat("%.1f|%d|%s", 2.55, 7, "z"); v = NumToStr(3.14159, 1.3);');
  ok(r.vars.t === 'abcd5' && r.vars.u.endsWith('|7|z') && r.vars.v === '3.142', 'text functions: ' + JSON.stringify([r.vars.t, r.vars.u, r.vars.v]));
  r = run('/* block \n comment */ x = 1; // line\n y = x + 1;');
  ok(r.vars.y === 2, 'comments');
  r = run('x = IIf(Close > Open, 1, 0); y = Ref(Close, -1); z = Ref(Close, 1);');
  ok(r.vars.y[10] === bars.c[9] && r.vars.z[10] === bars.c[11], 'Ref(-1) is previous, Ref(+1) is next');
  r = run('p = Param("Len", 7, 1, 50, 1); q = Param("Len", 7, 1, 50, 1);', { params: { Len: 12 } });
  ok(r.vars.p === 12 && r.params.length === 1 && r.params[0].name === 'Len' && r.params[0].sincr === 0, 'Param override + registry');
  r = run('Buy = Cross(Close, MA(Close,20)); Sell = 0; Filter = Buy; AddColumn(Close,"C",1.2); AddTextColumn("hi","T");');
  ok(r.buy && r.sell && r.filter && r.columns.length === 2 && r.usesSignals, 'signal variables + columns captured');
  r = run('Plot(Close,"c",colorRed,styleLine|styleThick); Plot(Volume,"v",IIf(Close>Open,colorGreen,colorRed),styleHistogram|styleOwnScale);');
  ok(r.plots[0].thick && r.plots[1].kind === 'hist' && r.plots[1].ownScale && r.plots[1].color.length === bars.t.length, 'Plot flags');
  r = run('PlotShapes(Cross(Close,MA(Close,10))*shapeUpArrow, colorGreen, 0, Low);');
  ok(r.shapes.length === 1 && r.shapes[0].position === 'below', 'PlotShapes position from Low');
  r = run('Title = "{{NAME}} {{DATE}}";', { symbol: 'ABC' });
  ok(r.title.startsWith('ABC 20'), 'Title placeholders');
}

// ---------------------------------------------------------------- parameters (AmiBroker Param family)
console.log('parameters');
{
  let r = run('a = ParamStr("Ticker","MSFT"); b = ParamTime("Start","09:30"); c = ParamTime("Start2","13:35:15"); d = ParamTime("S3","09:30",1); e = ParamDate("Day","2003-05-03"); f = ParamDate("Day2","2003-05-03",1); k = ParamColor("Col", colorCycle); m = ParamColor("Col2", colorCycle);');
  ok(r.errors.length === 0, 'Param* run: ' + r.errors[0]);
  ok(r.vars.a === 'MSFT' && r.vars.b === 93000 && r.vars.c === 133515 && r.vars.d === '09:30:00', 'ParamStr / ParamTime');
  ok(r.vars.e === 1030503 && r.vars.f === '2003-05-03', 'ParamDate DateNum + string: ' + r.vars.e);
  ok(r.vars.k !== r.vars.m, 'colorCycle cycles');
  ok(['str', 'time', 'time', 'time', 'date', 'date', 'color', 'color'].join() === r.params.map((p) => p.type).join(), 'registry types');
  r = run('a = ParamStr("T","X"); b = ParamTime("S","09:30"); e = ParamDate("D","2003-05-03"); n = Param("N",5,1,10,1);', { params: { T: 'INFY', S: '15:20', D: '2024-01-31', N: 8 } });
  ok(r.vars.a === 'INFY' && r.vars.b === 152000 && r.vars.e === 1240131 && r.vars.n === 8, 'user values replace defaults');
  r = run('t = ParamToggle("Show","No|Yes",1); l = ParamList("Kind","A|B|C","B");', { params: { Show: 0, Kind: 'C' } });
  ok(r.vars.t === 0 && r.vars.l === 'C', 'toggle + list overrides');
}

// ParamField / ParamStyle / ParamTrigger
{
  let r = run('a = ParamField("Src", 3); b = ParamField("Src2", 4); c = ParamStyle("St", styleLine|styleThick, maskDefault); t = ParamTrigger("Go","Click"); Plot(a,"x",colorRed,c);');
  ok(r.errors.length === 0 && r.vars.a[10] === bars.c[10] && near(r.vars.b[10], (bars.h[10] + bars.l[10] + bars.c[10]) / 3) && r.vars.c === 5 && r.vars.t === 0, 'ParamField default Close / (H+L+C)/3, ParamStyle value, ParamTrigger 0: ' + r.errors[0]);
  ok(['field', 'field', 'style', 'trigger'].join() === r.params.map((p) => p.type).join() && r.plots[0].thick, 'registry types + style flags reach Plot');
  r = run('a = ParamField("Src", 3); c = ParamStyle("St", styleLine); t = ParamTrigger("Go","Click"); Plot(a,"x",colorRed,c);', { params: { Src: 5, St: 256 }, triggers: { Go: 1 } });
  ok(r.vars.a[7] === bars.v[7] && r.vars.t === 1 && r.plots[0].hidden === true, 'user values: Volume field, trigger fires once, Hidden style');
  r = run('a = ParamField("S", 7); b = ParamField("S2", 6);');
  ok(r.vars.a[3] === bars.dq[3] && r.vars.b[3] === 0, 'Delivery field + OI');
}

// ---------------------------------------------------------------- switch + on-chart GUI controls
console.log('switch + gui');
{
  let r = run('s=0; for(i=0;i<4;i++){ switch(i){ case 0: s+=1; break; case 1: s+=10; case 2: s+=100; break; default: s+=1000; } } t = ""; switch("b"){ case "a": t="A"; break; case "b": t="B"; break; }');
  ok(r.errors.length === 0 && r.vars.s === 1211 && r.vars.t === 'B', 'switch: break, fall-through, default, text: ' + (r.errors[0] || r.vars.s));
  const code = `
idA = 1; idB = 2; idS = 3; idE = 4; idD = 5; idR1 = 6; idR2 = 7;
a = GuiButton("Go", idA, 10, 10, 60, 22, notifyClicked);
b = GuiCheckBox("Show", idB, 80, 10, 60, 22, notifyClicked);
c = GuiSlider(idS, 150, 10, 120, 22, notifyEditChange);
GuiEdit(idE, 280, 10, 80, 22, notifyEditChange | notifyHitReturn);
GuiDateTime(idD, 370, 10, 100, 22, notifyEditChange);
GuiRadio("One", idR1, 10, 40, 60, 22, notifyClicked);
GuiRadio("Two", idR2, 80, 40, 60, 22, notifyClicked);
GuiSetRange(idS, 5, 50, 5, 5);
if (c == guiNew) GuiSetValue(idS, 20);
clicked = 0; ev = "";
for (n = 0; id = GuiGetEvent(n, 0); n++) {
  code = GuiGetEvent(n, 1);
  switch (id) { case idA: clicked++; break; case idS: ev = GuiGetEvent(n, 2); break; default: break; }
}
chk = GuiGetCheck(idB); val = GuiGetValue(idS); txt = GuiGetText(idE); dn = GuiGetValue(idD); cap = GuiGetText(idA);
GuiSetText("Run", idA);`;
  r = run(code);
  ok(r.errors.length === 0, 'GUI formula runs: ' + r.errors[0]);
  ok(r.gui.length === 7 && r.gui[0].type === 'button' && r.gui[0].x === 10 && r.gui[2].min === 5 && r.gui[2].max === 50 && r.gui[2].step === 5, 'controls described for the chart (type, position, slider range)');
  ok(r.vars.a === 1 && r.vars.c === 1, 'first run returns guiNew');
  ok(r.vars.val === 20 && r.guiState[3].value === 20, 'start value set once and kept as state');
  ok(r.gui[0].text === 'Run' && r.gui[5].group === 6 && r.gui[6].group === 6, 'GuiSetText(text,id) changes the caption; radios share a group');
  const st = r.guiState;
  st[2] = { checked: 1 }; st[3].value = 35; st[4] = { text: '42.5' }; st[5] = { text: '2024-01-31' };
  const r2 = run(code, { guiState: st, guiKnown: [1, 2, 3, 4, 5, 6, 7], guiEvents: [{ id: 1, code: 1 }, { id: 3, code: 16 }, { id: 1, code: 1 }] });
  ok(r2.vars.a === 2 && r2.vars.c === 2, 'later runs return guiExisting');
  ok(r2.vars.clicked === 2 && r2.vars.ev === '3:16', 'GuiGetEvent queue: 2 clicks, slider event text');
  ok(r2.vars.chk === 1 && r2.vars.val === 35 && r2.vars.txt === '42.5' && r2.vars.dn === 1240131, 'user changes are read back (check, slider, edit, date)');
  const r3 = run('GuiButton("x", 1, 0, 0, 10, 10, notifyClicked); GuiEnable(1, 0); GuiButton("y", 2, 0, 0, 10, 10, 1); GuiDestroy(2); z = GuiSetValue(99, 1);');
  ok(r3.gui.length === 1 && r3.gui[0].enabled === false && r3.vars.z === 0, 'GuiEnable / GuiDestroy / unknown id');
  ok(/greater than zero/.test(run('GuiButton("x", 0, 0, 0, 10, 10, 1);').errors[0] || ''), 'id must be above zero');
}

// ---------------------------------------------------------------- zig-zag, options
console.log('zigzag + options');
{
  const zz = bars.c.map((x) => x);
  let r = run('z = Zig(Close, 10); p = Peak(Close, 10, 1); tr = Trough(Close, 10, 1); pb = PeakBars(Close, 10, 1);');
  ok(r.errors.length === 0 && Number.isFinite(last(r.vars.z)) && Number.isFinite(last(r.vars.p)) && Number.isFinite(last(r.vars.pb)), 'Zig/Peak/Trough/PeakBars run');
  ok(Number.isNaN(r.vars.p[0]), 'Peak has no look-ahead at bar 0');
  r = run('SetOption("InitialEquity", 500000); SetTradeDelays(1,1,1,1); SetPositionSize(10, spsPercentOfEquity); ApplyStop(stopTypeLoss, stopModePercent, 5, 1); a = GetOption("InitialEquity"); b = GetOption("MaxOpenPositions");');
  ok(r.errors.length === 0 && r.vars.a === 500000 && r.vars.b === 10, 'SetOption / GetOption');
  ok(r.options.tradedelays.join() === '1,1,1,1' && r.stops.length === 1 && r.stops[0].amount === 5 && r.options.positionsizeset.size === 10, 'delays, size and stops are recorded for the backtester');
  r = aflEngine.run('x = Interval(); Title = "{{INTERVAL}}";', bars, { interval: 'W', intervalName: 'Weekly' });
  ok(r.vars.x === 604800 && r.title === 'Weekly', 'Interval() follows the chart time frame');
}

// ---------------------------------------------------------------- time frames + saved-layout migration
console.log('time frames + migration');
{
  const { resample, periodKey } = await import('../js/timeframe.js');
  const { Workspace } = await import('../js/workspace.js');
  const rows = bars.t.map((d, i) => ({ symbol: 'T', date: d, open: bars.o[i], high: bars.h[i], low: bars.l[i], close: bars.c[i], volume: bars.v[i], delivery: bars.dq[i] }));
  const w = resample(rows, 'W'), m = resample(rows, 'M'), y = resample(rows, 'Y');
  ok(w.length < rows.length / 4 && w.length > rows.length / 6, `weekly bars: ${w.length} from ${rows.length}`);
  ok(m.length < w.length && y.length < m.length && y.length >= 5, `monthly ${m.length}, yearly ${y.length}`);
  const first = rows.filter((r) => periodKey(r.date, 'M') === periodKey(rows[0].date, 'M'));
  ok(m[0].open === first[0].open && m[0].close === first[first.length - 1].close && m[0].high === Math.max(...first.map((r) => r.high)) && m[0].low === Math.min(...first.map((r) => r.low)), 'monthly OHLC = first open, max high, min low, last close');
  ok(m[0].volume === first.reduce((s, r) => s + r.volume, 0) && m[0].date === first[first.length - 1].date, 'monthly volume is the sum; bar dated on last trading day');
  ok(resample(rows, 'D') === rows, 'daily returns the same rows');
  ok(w.every((b) => new Date(b.date + 'T00:00:00Z').getUTCDay() >= 1 && new Date(b.date + 'T00:00:00Z').getUTCDay() <= 5), 'weekly bars end on a weekday');
  const barsW = { t: w.map((b) => b.date), o: w.map((b) => b.open), h: w.map((b) => b.high), l: w.map((b) => b.low), c: w.map((b) => b.close), v: w.map((b) => b.volume), dq: w.map((b) => b.delivery), delpct: w.map((b) => 0) };
  const rw = aflEngine.run('Plot(RSI(14),"r",colorRed); x = Interval();', barsW, { interval: 'W' });
  ok(rw.errors.length === 0 && rw.vars.x === 604800, 'formulas run on weekly bars');

  // an old saved layout (native panes with moving averages) becomes formula panes with the same settings
  const old = { v: 1, activeId: 's1', sheets: [{ id: 's1', name: 'Sheet 1', symbol: 'X', locked: false, symbolLinkIdx: 0, intervalLinkIdx: 0, panes: [
    { id: 'p1', kind: 'price', weight: 3, params: {}, overlays: [{ id: 'o1', type: 'ema', period: 21, color: '#f59e0b' }] },
    { id: 'p2', kind: 'rsi', weight: 1, params: { period: 9 }, overlays: [] },
    { id: 'p3', kind: 'macd', weight: 1, params: { fast: 8, slow: 21, signal: 5 }, overlays: [] },
    { id: 'p4', kind: 'volume', weight: 1, params: {}, overlays: [{ id: 'o2', type: 'sma', period: 30, color: '#38bdf8' }] },
  ] }] };
  const mem = { d: JSON.stringify(old), getItem() { return this.d; }, setItem(k, v) { this.d = v; } };
  const ws = new Workspace(mem, 'k');
  const ps = ws.sheets[0].panes;
  ok(ps.every((p) => p.kind === 'afl'), 'all panes migrated to formula panes');
  ok(ps[0].params.formulaId === 'b:price-ma' && ps[0].params.values['Period 1 (0 = off)'] === 21 && ps[0].params.values['Period 2 (0 = off)'] === 0 && ps[0].params.values['Average type'] === 'EMA', 'price + EMA overlay -> Price + Moving Averages');
  ok(ps[1].params.values.Period === 9 && ps[2].params.values.Fast === 8 && ps[3].params.values['Average period'] === 30, 'RSI / MACD / volume settings carried over');
  ok(JSON.parse(mem.d).sheets[0].panes[0].kind === 'afl', 'migrated layout is saved');
  const { formulaStore: fs } = await import('../js/formula-store.js');
  for (const p of ps) {
    const f = fs.get(p.params.formulaId);
    const r = aflEngine.run(f.code, bars, { params: p.params.values });
    ok(r.errors.length === 0 && r.plots.length > 0, `migrated pane ${f.name} runs`);
  }
  const mp = aflEngine.run(fs.get('b:price-ma').code, bars, { params: ps[0].params.values });
  ok(mp.plots.length === 2 && mp.plots[1].name === 'EMA 21', 'only the periods that are on are drawn (0 = off): ' + mp.plots.map((p) => p.name));
  const fresh = new Workspace({ getItem: () => null, setItem() {} }, 'k2');
  ok(fresh.sheets[0].panes.map((p) => p.params.formulaId).join() === 'b:price-candle,b:volume' && fresh.sheets[0].interval === 'D', 'new workspace starts with formula panes');
  const s2 = fresh.addSheet('Y'); fresh.cycleLink(fresh.sheets[0].id, 'interval'); fresh.cycleLink(s2.id, 'interval');
  ok(fresh.setInterval(fresh.sheets[0].id, 'W').length === 2 && s2.interval === 'W', 'interval link group: linked sheets follow the time frame');
}

// ---------------------------------------------------------------- errors give a line number
console.log('errors');
{
  let r = run('x = 1;\ny = Foo(2);');
  ok(r.errors[0] === "Line 2: Function 'foo' is not supported", 'unknown function: ' + r.errors[0]);
  r = run('x = 1\ny = 2;');
  ok(/^Line 1: Missing ';'/.test(r.errors[0]), 'missing semicolon: ' + r.errors[0]);
  r = run('y = nope + 1;');
  ok(/Line 1: Variable 'nope' used without/.test(r.errors[0]), 'undefined variable: ' + r.errors[0]);
  r = run('Plot(Close, "x", colorRed;');
  ok(r.errors.length === 1, 'bad bracket: ' + r.errors[0]);
  r = run('while(1){ x = 1; }');
  ok(/Execution limit/.test(r.errors[0]), 'infinite loop guard');
  r = run('x = "abc;');
  ok(/Unterminated/.test(r.errors[0]), 'unterminated string');
  r = run('Plot(Close,"ok",colorRed,styleLine);\nbad = ;');
  ok(r.errors.length === 1, 'syntax error stops before running');
  r = run('Plot(Close,"ok",colorRed,styleLine);\ny = Foo();');
  ok(r.errors.length === 1 && r.plots.length === 1, 'runtime error keeps plots drawn before it');
  r = run('x = Close; x[999999] = 1;');
  ok(/out of range/.test(r.errors[0]), 'index out of range');
  r = aflEngine.run('Plot(Close,"x");', { t: [], o: [], h: [], l: [], c: [], v: [] });
  ok(r.errors[0] === 'No data loaded', 'empty data');
}

// ---------------------------------------------------------------- performance
console.log('performance');
{
  const big = makeBars(7000);
  const t0 = Date.now();
  const r = aflEngine.run('for(i=1;i<BarCount;i++){ x[i] = Close[i] - Close[i-1]; } Plot(x,"x"); Plot(ADX(14),"a"); Plot(HHV(High,250),"h"); Plot(StDev(Close,100),"s");', big);
  const ms = Date.now() - t0;
  ok(r.errors.length === 0 && ms < 1500, `7000 bars with a loop + indicators in ${ms} ms (${r.errors[0] || 'ok'})`);
}

// ---------------------------------------------------------------- formula store
console.log('formula store');
{
  const mem = (() => { const m = {}; return { getItem: (k) => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = v; } }; })();
  const st = new FormulaStore(mem);
  ok(st.all().length === BUILTIN_FORMULAS.length, 'built-ins listed');
  const a = st.save({ name: 'Mine', code: 'Plot(Close,"c",colorRed);' });
  ok(a.id.startsWith('u:') && st.get(a.id).code.includes('Plot'), 'save new');
  st.save({ id: a.id, name: 'Mine', code: 'Plot(Open,"o",colorRed);' });
  ok(st.user.length === 1 && st.get(a.id).code.includes('Open'), 'update in place');
  const b = st.save({ name: 'Mine', code: 'x=1;' });
  ok(b.name === 'Mine (2)', 'duplicate names are numbered');
  ok(st.save({ id: 'b:price-candle', name: 'Copy of candle', code: 'x=1;' }).id !== 'b:price-candle', 'saving a built-in makes a copy');
  ok(new FormulaStore(mem).user.length === 3, 'persisted');
  let threw = false; try { st.save({ id: a.id, name: 'Mine (2)', code: 'x' }); } catch (e) { threw = true; }
  ok(threw, 'rename onto an existing name is refused');
  ok(st.remove(a.id) && !st.get(a.id), 'remove');
  const json = st.exportAll(); const st2 = new FormulaStore({ getItem: () => null, setItem() {} });
  ok(st2.importJSON(json) === st.user.length, 'export/import round trip');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
