// TimeFrameSet / Restore / Expand / Compress / GetPrice, checked against AmiBroker's documented behavior and the app's own weekly/monthly bars.
import { aflEngine } from '../js/afl-engine.js';
import { resampleArrays } from '../js/analysis-core.js';
import { makeBars } from './data.mjs';
let pass = 0, fail = 0;
const ok = (c, m) => (c ? pass++ : (fail++, console.log('FAIL', m)));
const near = (a, b) => Math.abs(a - b) < 1e-9 || (Number.isNaN(a) && Number.isNaN(b));
const bars = makeBars(520, 11);
const run = (code, b = bars, opts = {}) => aflEngine.run(code, b, { symbol: 'T', ...opts });
const V = (r, k) => r.vars[k.toLowerCase()];
const W = resampleArrays(bars, 'W'), M = resampleArrays(bars, 'M');

// ---- TimeFrameSet gives the same bars as the weekly / monthly chart
{
  const r = run('TimeFrameSet(inWeekly); wc = C; wo = O; wh = H; wl = L; wv = V; nb = BarCount; dn = DateNum(); TimeFrameRestore(); nb2 = BarCount;');
  ok(!r.errors.length, 'weekly set runs: ' + r.errors);
  ok(V(r, 'nb') === W.t.length && V(r, 'nb2') === bars.t.length, 'BarCount changes and is restored');
  const same = (k, src) => V(r, k).every((x, i) => near(x, src[i]));
  ok(same('wc', W.c) && same('wo', W.o) && same('wh', W.h) && same('wl', W.l) && same('wv', W.v), 'weekly OHLCV equals the weekly chart');
  const dn = V(r, 'dn'); const [y, m, d] = W.t[3].split('-').map(Number);
  ok(dn[3] === (y - 1900) * 10000 + m * 100 + d, 'DateNum() follows the weekly bars (label = last trading day)');
}
{
  const r = run('TimeFrameSet(inMonthly); wc = C; wo = O; nb = BarCount; TimeFrameRestore();');
  ok(V(r, 'nb') === M.t.length && V(r, 'wc').every((x, i) => near(x, M.c[i])) && V(r, 'wo').every((x, i) => near(x, M.o[i])), 'monthly bars equal the monthly chart');
}
{
  const Q = resampleArrays(bars, 'Q'), Y = resampleArrays(bars, 'Y');
  const rq = run('TimeFrameSet(inQuarterly); nb = BarCount; c1 = C; TimeFrameRestore();'), ry = run('TimeFrameSet(inYearly); nb = BarCount; TimeFrameRestore();');
  ok(V(rq, 'nb') === Q.t.length && V(rq, 'c1').every((x, i) => near(x, Q.c[i])) && V(ry, 'nb') === Y.t.length, 'quarterly and yearly');
}

// ---- indicators inside the time frame, then expand
{
  const r = run('TimeFrameSet(inWeekly); wma = MA(C, 5); TimeFrameRestore(); e = TimeFrameExpand(wma, inWeekly); f = TimeFrameExpand(wma, inWeekly, expandFirst); p = TimeFrameExpand(wma, inWeekly, expandPoint);');
  ok(!r.errors.length, 'expand runs: ' + r.errors);
  const wma = []; for (let k = 0; k < W.c.length; k++) { if (k < 4) wma.push(NaN); else { let s = 0; for (let j = k - 4; j <= k; j++) s += W.c[j]; wma.push(s / 5); } }
  // group boundaries of the base bars
  const key = (d) => { const x = new Date(d + 'T00:00:00Z'); x.setUTCDate(x.getUTCDate() - ((x.getUTCDay() + 6) % 7)); return x.toISOString().slice(0, 10); };
  const grp = []; let kk = -1, last = null;
  bars.t.forEach((d, i) => { const g = key(d); if (g !== last) { kk++; last = g; } grp.push(kk); });
  const lastOf = (k) => { let z = -1; grp.forEach((g, i) => { if (g === k) z = i; }); return z; };
  let allOk = true, firstOk = true, pointOk = true;
  const e = V(r, 'e'), f = V(r, 'f'), p = V(r, 'p');
  for (let i = 0; i < bars.t.length; i++) {
    const k = grp[i], isLast = lastOf(k) === i;
    const wantLast = isLast ? wma[k] : (k > 0 ? wma[k - 1] : NaN);
    if (!near(e[i], wantLast)) allOk = false;
    if (!near(f[i], wma[k])) firstOk = false;
    if (!near(p[i], isLast ? wma[k] : NaN)) pointOk = false;
  }
  ok(allOk, 'expandLast: value on the last bar of the week, previous week before it (no look-ahead)');
  ok(firstOk, 'expandFirst: value from the first bar of the week');
  ok(pointOk, 'expandPoint: last bar only, others Null');
}

// ---- compress without switching, GetPrice
{
  const r = run('wc = TimeFrameCompress(Close, inWeekly); wh = TimeFrameCompress(High, inWeekly, compressHigh); wl = TimeFrameCompress(Low, inWeekly, compressLow); wo = TimeFrameCompress(Open, inWeekly, compressOpen); wv = TimeFrameCompress(Volume, inWeekly, compressVolume); nb = BarCount; ma = MA(C, 3);');
  ok(!r.errors.length, 'compress runs: ' + r.errors);
  ok(V(r, 'nb') === bars.t.length, 'chart time frame unchanged by TimeFrameCompress');
  const same = (k, src) => V(r, k).length === src.length && V(r, k).every((x, i) => near(x, src[i]));
  ok(same('wc', W.c) && same('wh', W.h) && same('wl', W.l) && same('wo', W.o) && same('wv', W.v), 'all compress modes');
}
{
  const r = run('po = TimeFrameGetPrice("O", inWeekly, -1); pc = TimeFrameGetPrice("C", inWeekly, -1); cur = TimeFrameGetPrice("O", inWeekly, 0);');
  const key = (d) => { const x = new Date(d + 'T00:00:00Z'); x.setUTCDate(x.getUTCDate() - ((x.getUTCDay() + 6) % 7)); return x.toISOString().slice(0, 10); };
  let allOk = true; const po = V(r, 'po'), pc = V(r, 'pc'), cur = V(r, 'cur');
  let k = -1, last = null;
  bars.t.forEach((d, i) => { const g = key(d); if (g !== last) { k++; last = g; } if (!near(cur[i], W.o[k]) || !near(po[i], k > 0 ? W.o[k - 1] : NaN) || !near(pc[i], k > 0 ? W.c[k - 1] : NaN)) allOk = false; });
  ok(allOk, 'TimeFrameGetPrice: previous week open/close and this week open on every daily bar');
}

// ---- N-day bars and Interval()
{
  const r = run('TimeFrameSet(3*inDaily); nb = BarCount; c3 = C; iv = Interval(); TimeFrameRestore(); iv2 = Interval();');
  ok(V(r, 'nb') === Math.ceil(bars.t.length / 3) && near(V(r, 'c3')[0], bars.c[2]) && V(r, 'iv') === 3 * 86400 && V(r, 'iv2') === 86400, '3-day bars; Interval() follows the time frame');
}

// ---- no Restore at the end is fine; a second TimeFrameSet starts from the base
{
  const r = run('TimeFrameSet(inMonthly); a = BarCount; TimeFrameSet(inWeekly); b = BarCount;');
  ok(!r.errors.length && V(r, 'a') === M.t.length && V(r, 'b') === W.t.length, 'second TimeFrameSet builds from the base bars; the formula ends in the base time frame');
}

// ---- mixing is a readable error, not silent garbage
{
  let r = run('TimeFrameSet(inWeekly); w = MA(C,5); TimeFrameRestore(); x = w + C;');
  ok(r.errors.length && /TimeFrameExpand/.test(r.errors[0]), 'weekly array + daily array -> error mentioning TimeFrameExpand: ' + r.errors[0]);
  r = run('TimeFrameSet(inWeekly); Buy = Cross(C, MA(C,5)); TimeFrameRestore();');
  ok(r.errors.length && /Buy/.test(r.errors[0]) && /TimeFrameExpand/.test(r.errors[0]), 'Buy made in weekly bars -> error: ' + r.errors[0]);
  r = run('TimeFrameSet(inWeekly); Plot(C, "w", colorRed); TimeFrameRestore();');
  ok(r.errors.length && /Plot/.test(r.errors[0]), 'Plot of weekly array on a daily chart -> error');
  r = run('TimeFrameSet(inWeekly); w = Cross(C, MA(C,5)); TimeFrameRestore(); Buy = TimeFrameExpand(w, inWeekly, expandPoint); Sell = 0;');
  ok(!r.errors.length && r.buy.length === bars.t.length, 'Buy from an expanded weekly signal is accepted');
}

// ---- impossible intervals say why
{
  let r = run('TimeFrameSet(in5Minute);');
  ok(r.errors.length && /intraday/i.test(r.errors[0]), 'minutes on daily data: ' + r.errors[0]);
  r = run('TimeFrameSet(inDaily);', W, { interval: 'W' });
  ok(r.errors.length && /shorter/i.test(r.errors[0]), 'daily on a weekly chart: ' + r.errors[0]);
  r = run('TimeFrameSet(-5);');
  ok(r.errors.length && /tick|negative/i.test(r.errors[0]), 'tick bars: ' + r.errors[0]);
  r = run('TimeFrameSet(inDaily); n = BarCount;');
  ok(!r.errors.length && V(r, 'n') === bars.t.length, 'same time frame is allowed');
}

// ---- weekly chart / analysis: monthly from weekly bars
{
  const r = run('TimeFrameSet(inMonthly); nb = BarCount; TimeFrameRestore();', W, { interval: 'W' });
  ok(!r.errors.length && V(r, 'nb') === M.t.length, 'monthly bars built from a weekly run');
}

// ---- Foreign() follows the time frame
{
  const idx = makeBars(520, 5);
  const r = run('TimeFrameSet(inWeekly); i = Foreign("^IDX", "C"); c1 = C; nb = BarCount; TimeFrameRestore();', bars, { foreign: { '^IDX': idx } });
  const Wi = resampleArrays(idx, 'W');
  ok(!r.errors.length && V(r, 'i').length === W.t.length && V(r, 'i').every((x, k) => near(x, Wi.c[k])), 'Foreign inside TimeFrameSet is the foreign symbol\'s weekly bars: ' + r.errors);
}

// ---- a typical weekly filter used in a daily system
{
  const r = run(`wC = TimeFrameCompress(C, inWeekly); wMA = MA(wC, 10);
    Filt = TimeFrameExpand(wC > wMA, inWeekly);
    Buy = Cross(C, MA(C, 20)) AND Filt; Sell = Cross(MA(C, 20), C);`);
  ok(!r.errors.length && r.usesSignals, 'weekly trend filter on a daily system: ' + r.errors);
}

// ---- the new constants exist with AmiBroker's values
{
  const r = run('a = inWeekly; b = inMonthly; c = inHourly; d = in15Minute; e = in5Minute; f = expandFirst; g = inDaily;');
  ok(V(r, 'a') === 432001 && V(r, 'b') === 2160001 && V(r, 'c') === 3600 && V(r, 'd') === 900 && V(r, 'e') === 300 && V(r, 'g') === 86400, 'constants');
}

// ---- intraday base: 5-minute bars -> 15 minutes, hourly, daily, weekly
{
  const t = [], o = [], h = [], l = [], c = [], v = [];
  const days = ['2026-10-19', '2026-10-20', '2026-10-21'];
  let px = 100;
  for (const d of days) for (let k = 0; k < 75; k++) {
    const m = 9 * 60 + 15 + k * 5, hh = String(Math.floor(m / 60)).padStart(2, '0'), mm = String(m % 60).padStart(2, '0');
    const op = px, cl = px + Math.sin(k) * 0.3 + 0.01; px = cl;
    t.push(`${d} ${hh}:${mm}`); o.push(op); c.push(cl); h.push(Math.max(op, cl) + 0.1); l.push(Math.min(op, cl) - 0.1); v.push(100 + k);
  }
  const b5 = { t, o, h, l, c, v, dq: v.map(() => NaN), delpct: v.map(() => NaN) };
  const r = run('TimeFrameSet(in15Minute); n15 = BarCount; o15 = O; c15 = C; v15 = V; TimeFrameRestore(); TimeFrameSet(inHourly); nh = BarCount; TimeFrameRestore(); TimeFrameSet(inDaily); nd = BarCount; dc = C; dh = H; dv = V; TimeFrameRestore(); TimeFrameSet(inWeekly); nw = BarCount; TimeFrameRestore();', b5, { interval: '5m' });
  ok(!r.errors.length, 'intraday compress runs: ' + r.errors);
  ok(V(r, 'n15') === 75 && near(V(r, 'o15')[0], o[0]) && near(V(r, 'c15')[0], c[2]) && V(r, 'v15')[0] === v[0] + v[1] + v[2], '15-minute bars from 5-minute bars (aligned to 09:15)');
  ok(V(r, 'nh') === 21, 'hourly bars: 7 per session (09:15 .. 15:15)');
  ok(V(r, 'nd') === 3 && near(V(r, 'dc')[0], c[74]) && near(V(r, 'dh')[1], Math.max(...h.slice(75, 150))) && V(r, 'dv')[2] === v.slice(150).reduce((a, x) => a + x, 0), 'daily bars from intraday bars');
  ok(V(r, 'nw') === 1, 'weekly bar from intraday bars');
  const r2 = run('TimeFrameSet(7*in1Minute);', b5, { interval: '5m' });
  ok(r2.errors.length && /multiple/.test(r2.errors[0]), '7 minutes from 5-minute bars: ' + r2.errors[0]);
  const r3 = run('TimeFrameSet(in1Minute);', b5, { interval: '5m' });
  ok(r3.errors.length && /shorter/.test(r3.errors[0]), '1 minute from 5-minute bars: ' + r3.errors[0]);
  const r4 = run('x = TimeFrameGetPrice("H", inDaily, -1); y = TimeFrameGetPrice("C", inDaily, -1);', b5, { interval: '5m' });
  ok(!r4.errors.length && Number.isNaN(V(r4, 'x')[10]) && near(V(r4, 'x')[80], Math.max(...h.slice(0, 75))) && near(V(r4, 'y')[80], c[74]), 'previous day high / close on intraday bars');
}

// ---- through the analysis engine (Scan / Backtest), daily and weekly runs
{
  const { makeSession, backtest, scan } = await import('../js/analysis-core.js');
  const syms = ['AAA', 'BBB', 'CCC'];
  const data = { AAA: makeBars(1500, 21), BBB: makeBars(1500, 22), CCC: makeBars(1500, 23) };
  const code = `TimeFrameSet( inWeekly ); wTrend = Close > MA( Close, 10 ); TimeFrameRestore();
    Buy = Cross( Close, MA( Close, 20 ) ) AND TimeFrameExpand( wTrend, inWeekly ); Sell = Cross( MA( Close, 20 ), Close );`;
  const plain = 'Buy = Cross( Close, MA( Close, 20 ) ); Sell = Cross( MA( Close, 20 ), Close );';
  const sess = () => makeSession(async (sym) => data[sym], 'D');
  const a = await backtest({ code, symbols: syms, session: sess() });
  const b = await backtest({ code: plain, symbols: syms, session: sess() });
  ok(a.errors.length === 0 && a.stats && a.stats.trades > 3 && a.stats.trades < b.stats.trades, `daily system with weekly filter: ${a.stats && a.stats.trades} trades (unfiltered ${b.stats && b.stats.trades}) ${a.errors[0] || ''}`);
  const sw = makeSession(async (sym) => data[sym], 'W');
  const c = await backtest({ code: 'TimeFrameSet( inMonthly ); mUp = Close > MA( Close, 3 ); TimeFrameRestore(); Buy = Cross( Close, MA( Close, 10 ) ) AND TimeFrameExpand( mUp, inMonthly ); Sell = Cross( MA( Close, 10 ), Close );', symbols: syms, session: sw });
  ok(c.errors.length === 0 && c.stats && c.stats.trades > 2, `weekly run with a monthly filter: ${c.stats && c.stats.trades} trades ${c.errors[0] || ''}`);
  const d = await backtest({ code: 'TimeFrameSet( inDaily ); Buy = 1; Sell = 0;', symbols: syms, session: sw });
  ok(d.errors.length > 0 && /shorter/.test(d.errors.join(' ')), 'daily inside a weekly run is reported: ' + d.errors[0]);
}
console.log(pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
