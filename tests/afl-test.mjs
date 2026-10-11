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
const skip = new Set(['if', 'for', 'while', 'do', 'function', 'name', 'array', 'x', 'y', 'a', 'b']);
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
  ok(r.vars.p === 12 && r.params.length === 2 && r.params[0].name === 'Len', 'Param override + registry');
  r = run('Buy = Cross(Close, MA(Close,20)); Sell = 0; Filter = Buy; AddColumn(Close,"C",1.2); AddTextColumn("hi","T");');
  ok(r.buy && r.sell && r.filter && r.columns.length === 2 && r.usesSignals, 'signal variables + columns captured');
  r = run('Plot(Close,"c",colorRed,styleLine|styleThick); Plot(Volume,"v",IIf(Close>Open,colorGreen,colorRed),styleHistogram|styleOwnScale);');
  ok(r.plots[0].thick && r.plots[1].kind === 'hist' && r.plots[1].ownScale && r.plots[1].color.length === bars.t.length, 'Plot flags');
  r = run('PlotShapes(Cross(Close,MA(Close,10))*shapeUpArrow, colorGreen, 0, Low);');
  ok(r.shapes.length === 1 && r.shapes[0].position === 'below', 'PlotShapes position from Low');
  r = run('Title = "{{NAME}} {{DATE}}";', { symbol: 'ABC' });
  ok(r.title.startsWith('ABC 20'), 'Title placeholders');
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
