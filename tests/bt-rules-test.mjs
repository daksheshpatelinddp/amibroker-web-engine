// AmiBroker portfolio rules: same-bar re-entry, stop-on-first-failed-entry, net % Profit. Every rule can be switched off by an option.
import { rawTrades, portfolio, DEFAULT_OPTIONS } from '../js/bt-core.js';
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL', m); } };
const mk = (n, f) => { const t = [], o = [], h = [], l = [], c = []; for (let i = 0; i < n; i++) { t.push(`2020-01-${String(i + 1).padStart(2, '0')}`); const p = f(i); o.push(p); h.push(p + 1); l.push(p - 1); c.push(p); } return { t, o, h, l, c }; };
const arr = (n, on) => Array.from({ length: n }, (_, i) => (on.includes(i) ? 1 : 0));
const base = { ...DEFAULT_OPTIONS, tradePrices: { buy: 'open', sell: 'open', short: 'close', cover: 'close' }, maxOpenPositions: 14 };

// 1. position open, Sell and Buy on the same bar 5 -> no instant re-entry (default); with reenterSameBar: re-entry
const bars = mk(10, () => 100), sig = { buy: arr(10, [1, 5]), sell: arr(10, [5, 8]) };
let tr = rawTrades(bars, sig, base);
ok(tr.length === 1 && tr[0].ei === 1 && tr[0].xi === 5, 'no re-entry on the exit bar: ' + JSON.stringify(tr.map((t) => [t.ei, t.xi])));
tr = rawTrades(bars, sig, { ...base, reenterSameBar: 1 });
ok(tr.length === 2 && tr[1].ei === 5, 're-entry when the option is on');
// 2. flat, Buy and Sell on the same bar: same-bar exit still follows allowSameBarExit
const sig2 = { buy: arr(10, [3]), sell: arr(10, [3]) };
ok(rawTrades(bars, sig2, base).length === 1 && rawTrades(bars, sig2, base)[0].xi === 3, 'same bar entry+exit when allowed');
ok(rawTrades(bars, sig2, { ...base, allowSameBarExit: 0 }).length === 1 && rawTrades(bars, sig2, { ...base, allowSameBarExit: 0 })[0].open, 'no same bar exit when not allowed');
// 3. a Short signal still reverses a long on the same bar
const sig3 = { buy: arr(10, [1]), sell: arr(10, []), short: arr(10, [4]), cover: arr(10, []) };
tr = rawTrades(bars, sig3, base); ok(tr.length === 2 && tr[0].reason === 'reverse' && tr[1].dir === -1, 'reverse still works');
// 4. portfolio: price above the position value ends the entries of that bar (AmiBroker)
const mkU = (sym, price, score) => { const b = mk(6, () => price); return { symbol: sym, bars: b, trades: rawTrades(b, { buy: arr(6, [2]), sell: arr(6, [4]) }, base), score: Array(6).fill(score) }; };
const U = [mkU('BIG', 20000, 90), mkU('A', 10, 80), mkU('B', 10, 70)];
const po = { ...base, initialEquity: 100000, positionSize: { size: 10, type: 2 } };
let r = portfolio(U, po); ok(r.trades.length === 0, 'stop after the unaffordable top-ranked signal: ' + r.trades.length);
r = portfolio(U, { ...po, stopEntriesOnFailure: 0 }); ok(r.trades.map((t) => t.symbol).sort().join() === 'A,B', 'option off: lower ranked signals are tried');
// 5. cash short: top-ranked cannot be funded -> the rest is dropped; with the option off cheaper ones that fit are bought
const mk2 = (sym, price, score) => { const b = mk(6, () => price); return { symbol: sym, bars: b, trades: rawTrades(b, { buy: arr(6, [2]), sell: arr(6, [4]) }, base), score: Array(6).fill(score), size: Array(6).fill(sym === 'X' ? 60000 : 30000) }; };
const V = [mk2('P', 10, 90), mk2('Q', 10, 80), mk2('X', 10, 70)];
r = portfolio(V, { ...base, initialEquity: 100000 }); ok(r.trades.map((t) => t.symbol).sort().join() === 'P,Q', 'P and Q fit, X (60000) does not: ' + r.trades.map((t) => t.symbol));
const W = [mk2('X', 10, 90), mk2('P', 10, 80), mk2('Q', 10, 70)];
r = portfolio(W, { ...base, initialEquity: 100000, }); ok(r.trades.map((t) => t.symbol).sort().join() === 'P,X', 'X (60000) and P (30000) fit, Q does not, ' + r.trades.map((t) => t.symbol));
r = portfolio([mk2('Y', 10, 90), mk2('X', 10, 80), mk2('P', 10, 70)].map((u) => (u.symbol === 'Y' ? { ...u, size: Array(6).fill(70000) } : u)), { ...base, initialEquity: 100000 });
ok(r.trades.map((t) => t.symbol).join() === 'Y', 'Y 70000 then X 60000 fails -> P (30000, would fit) skipped: ' + r.trades.map((t) => t.symbol));
r = portfolio([mk2('Y', 10, 90), mk2('X', 10, 80), mk2('P', 10, 70)].map((u) => (u.symbol === 'Y' ? { ...u, size: Array(6).fill(70000) } : u)), { ...base, initialEquity: 100000, stopEntriesOnFailure: 0 });
ok(r.trades.map((t) => t.symbol).sort().join() === 'P,Y', 'option off: P is bought: ' + r.trades.map((t) => t.symbol));
// 6. maxOpenPositions still limits, % Profit is net of commission
const b6 = mk(6, (i) => (i < 4 ? 100 : 110)), u6 = { symbol: 'Z', bars: b6, trades: rawTrades(b6, { buy: arr(6, [1]), sell: arr(6, [4]) }, base), score: [] };
r = portfolio([u6], { ...base, initialEquity: 100000, positionSize: { size: 50, type: 2 }, commissionMode: 1, commissionAmount: 1 });
const t0 = r.trades[0]; ok(Math.abs(t0.pctProfit - t0.profit / (t0.shares * t0.entryPrice) * 100) < 1e-9 && t0.pctProfit < 10, 'net % profit ' + t0.pctProfit);
// 7. open positions are valued net of the commission their exit will cost (AmiBroker equity); option off = plain market value
{ const b7 = mk(4, () => 100), u7 = { symbol: 'E', bars: b7, trades: rawTrades(b7, { buy: arr(4, [0]), sell: arr(4, []) }, base), score: [] };
  const o7 = { ...base, initialEquity: 100000, positionSize: { size: 50, type: 2 }, commissionMode: 1, commissionAmount: 1 };
  let q = portfolio([u7], o7).equityCurve[0]; ok(Math.abs(q.equity - (100000 - 500 - 500)) < 1e-6, 'net of exit commission: ' + q.equity);
  q = portfolio([u7], { ...o7, equityNetOfExitCost: 0 }).equityCurve[0]; ok(Math.abs(q.equity - 99500) < 1e-6, 'option off: ' + q.equity); }
// 8. 32-bit comparison like AmiBroker: a flat series is NOT above its own average
{ const { cross } = await import('../js/afl-lib.js'); const x = new Float64Array(60).fill(2836.55), m = new Float64Array(60).fill(2836.55 + 3e-13);
  ok(Math.fround(x[5]) > Math.fround(m[5]) === false && cross(x, m).every((v) => v === 0), 'float noise is not a crossing'); }
// 9. Foreign(): as-of alignment. Symbol bars on Tue/Thu and in a gap of the index take the latest index bar on or before them
{ const { aflEngine } = await import('../js/afl-engine.js');
  const sym = ['2020-01-07', '2020-01-16', '2020-03-10'], idx = ['2020-01-03', '2020-01-10', '2020-01-17', '2020-01-24', '2020-01-31', '2020-02-07'], iv = [100, 110, 120, 130, 140, 150];
  const mkb = (t, c) => ({ t, o: c, h: c, l: c, c, v: c.map(() => 1) });
  const r = aflEngine.run('NC = Foreign("IDX","Close"); Buy = 0; Sell = 0; AddColumn(NC,"NC");', mkb(sym, [1, 2, 3]), { symbol: 'S', foreign: { IDX: mkb(idx, iv) }, action: 1, rangeFrom: 0, rangeTo: 2 });
  const nc = r.errors.length ? r.errors : null; ok(!nc, 'foreign run ' + nc);
  const run2 = aflEngine.run('X = Foreign("IDX","Close"); Buy = X > 0; Sell = 0;', mkb(sym, [1, 2, 3]), { symbol: 'S', foreign: { IDX: mkb(idx, iv) }, action: 1, rangeFrom: 0, rangeTo: 2 });
  const xs = (run2.consts && run2.consts.get && run2.consts.get('x')) || run2.vars?.x || run2.variables?.x;
  if (xs) ok(xs[0] === 100 && xs[1] === 110 && xs[2] === 150, 'as-of values ' + Array.from(xs)); }
console.log(`${pass} passed, ${fail} failed`); if (fail) process.exit(1);
