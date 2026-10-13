// Run: node tests/analysis-test.mjs   -- scan / explore / backtest / optimize on synthetic data (no browser)
import { makeSession, scan, explore, backtest, optimize, buildBreadth, paramGrid } from '../js/analysis-core.js';
import { rawTrades, portfolio, DEFAULT_OPTIONS } from '../js/bt-core.js';
import { BUILTIN_FORMULAS } from '../js/builtin-formulas.js';
import { makeBars } from './data.mjs';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  FAIL:', m); } };
const near = (a, b, tol = 1e-6) => Math.abs(a - b) <= tol * Math.max(1, Math.abs(b));
const F = (k) => BUILTIN_FORMULAS.find((f) => f.key === k).code;
const syms = ['AAA', 'BBB', 'CCC', 'DDD', 'EEE', 'FFF'];
const data = Object.fromEntries(syms.map((s, i) => [s, makeBars(900, 11 + i * 5)]));
const session = () => makeSession(async (s) => data[s] || null);

// ---- hand-checked single trade: buy bar 2 close, sell bar 5 close, 100% equity
{
  const b = { t: ['d0', 'd1', 'd2', 'd3', 'd4', 'd5', 'd6'], o: [10, 10, 10, 11, 12, 13, 13], h: [10, 10, 11, 12, 13, 14, 14], l: [10, 10, 10, 11, 12, 13, 13], c: [10, 10, 10, 12, 12, 14, 13], v: Array(7).fill(1) };
  const sig = { buy: Float64Array.from([0, 0, 1, 0, 0, 0, 0]), sell: Float64Array.from([0, 0, 0, 0, 0, 1, 0]), stops: [] };
  const tr = rawTrades(b, sig, DEFAULT_OPTIONS);
  ok(tr.length === 1 && tr[0].ei === 2 && tr[0].xi === 5 && tr[0].ep === 10 && tr[0].xp === 14, 'raw trade entry/exit');
  const r = portfolio([{ symbol: 'X', bars: b, trades: tr }], { ...DEFAULT_OPTIONS, initialEquity: 1000 });
  ok(r.trades.length === 1 && r.trades[0].shares === 100 && near(r.trades[0].profit, 400), `profit 400 got ${r.trades[0] && r.trades[0].profit}`);
  ok(near(r.stats.endingCapital, 1400) && near(r.stats.netProfitPct, 40), 'ending capital 1400');
  // delay 1: executes next bar
  const tr2 = rawTrades(b, sig, { ...DEFAULT_OPTIONS, tradeDelays: [1, 1, 1, 1] });
  ok(tr2[0].ei === 3 && tr2[0].xi === 6, 'trade delay 1');
  // 5% stop loss on a long
  const b2 = { ...b, l: [10, 10, 10, 9, 12, 13, 13], c: [10, 10, 10, 9.2, 12, 14, 13] };
  const tr3 = rawTrades(b2, sig, { ...DEFAULT_OPTIONS }.constructor === Object ? DEFAULT_OPTIONS : DEFAULT_OPTIONS);
  const trs = rawTrades(b2, { ...sig, stops: [{ type: 0, mode: 1, amount: 5, exitAtStop: 1 }] }, DEFAULT_OPTIONS);
  ok(trs[0].reason === 'loss' && near(trs[0].xp, 9.5) && trs[0].xi === 3, `stop loss exit at 9.5 got ${trs[0].xp}`);
  // short: profit when price falls
  const bs = { ...b, c: [10, 10, 10, 9, 8, 8, 8], o: [10, 10, 10, 9, 8, 8, 8], h: [10, 10, 10, 9, 8, 8, 8], l: [10, 10, 10, 9, 8, 8, 8] };
  const ts = rawTrades(bs, { short: Float64Array.from([0, 0, 1, 0, 0, 0, 0]), cover: Float64Array.from([0, 0, 0, 0, 1, 0, 0]), stops: [] }, DEFAULT_OPTIONS);
  const rs = portfolio([{ symbol: 'S', bars: bs, trades: ts }], { ...DEFAULT_OPTIONS, initialEquity: 1000 });
  ok(near(rs.trades[0].profit, 200) && near(rs.stats.endingCapital, 1200), `short profit 200 got ${rs.trades[0].profit} / ${rs.stats.endingCapital}`);
  // commission 1% each side
  const rc = portfolio([{ symbol: 'X', bars: b, trades: tr }], { ...DEFAULT_OPTIONS, initialEquity: 2000, positionSize: { size: 50, type: 2 }, commissionMode: 1, commissionAmount: 1 });
  ok(near(rc.stats.endingCapital, 2000 + 400 - 10 - 14), `commission end ${rc.stats.endingCapital}`);
}

(async () => {
  // ---- scan
  let s = session();
  let r = await scan({ code: F('sys-scan-buy'), symbols: syms, session: s });
  ok(Array.isArray(r.rows) && r.errors.length === 0, 'scan runs');
  r = await scan({ code: 'Buy = 1; Sell = 0;', symbols: syms, session: s });
  ok(r.rows.length === syms.length && r.rows[0].signal === 'Buy', 'scan finds the signal on every symbol');
  // ---- explore
  r = await explore({ code: F('exploration-basic'), symbols: syms, session: s });
  ok(r.rows.length === syms.length && r.columns.includes('Close') && r.errors.length === 0, `explore rows=${r.rows.length}`);
  r = await explore({ code: F('xy-profit'), symbols: syms, session: s });
  ok(r.errors.length === 0 && r.xy['Profit vs MAE'] && r.xy['Profit vs MAE'].points.length > 0 && r.rows.length > 0, `XY exploration (${r.errors[0] || 'ok'})`);
  r = await explore({ code: F('risk-yield'), symbols: syms, session: s });
  ok(r.xy['Risk/Yield'] && r.xy['Risk/Yield'].points.length === syms.length, 'risk-yield points');
  // ---- backtest: MACD system, portfolio
  let b = await backtest({ code: F('sys-macd'), symbols: syms, session: s });
  ok(b.errors.length === 0 && b.stats && b.stats.trades > 10, `macd backtest trades=${b.stats && b.stats.trades}`);
  ok(b.equityCurve.length > 100 && b.equityCurve.every((p) => Number.isFinite(p.equity)), 'equity curve finite');
  ok(b.trades.every((t) => t.shares > 0 && Number.isFinite(t.profit)), 'trades have shares & profit');
  const sumP = b.trades.reduce((a, t) => a + t.profit, 0);
  ok(near(b.stats.endingCapital - b.stats.initialCapital, sumP, 1e-6), `equity change equals sum of trade profits (${b.stats.endingCapital - b.stats.initialCapital} vs ${sumP})`);
  const eq0 = b.equityCurve.every((p) => p.equity > 0);
  ok(eq0, 'equity stays positive');
  // ---- rotational
  b = await backtest({ code: F('sys-rotational'), symbols: syms, session: s });
  ok(b.errors.length === 0 && b.stats && b.stats.trades > 0 && b.options.mode === 1, `rotational trades=${b.stats && b.stats.trades}`);
  ok(b.equityCurve.every((p) => p.open <= 4), 'rotational never holds more than 4');
  // ---- date range
  b = await backtest({ code: F('sys-macd'), symbols: syms, session: s, from: '2020-01-01', to: '2020-12-31' });
  ok(b.equityCurve[0].t >= '2020-01-01' && b.equityCurve[b.equityCurve.length - 1].t <= '2020-12-31', 'date range respected');
  // ---- optimize
  const grid = paramGrid([{ name: 'a', min: 1, max: 3, step: 1 }, { name: 'b', min: 10, max: 20, step: 10 }]);
  ok(grid.length === 6, 'grid size');
  const o = await optimize({ code: F('sys-optimize-ma'), symbols: syms.slice(0, 3), session: s, metric: 'netProfit' });
  ok(o.errors.length === 0 && o.rows.length === 6 * 3 - 0 || o.rows.length > 0, `optimize rows=${o.rows.length} ${o.errors[0] || ''}`);
  ok(o.rows.length > 1 && o.rows[0].stats.netProfit >= o.rows[o.rows.length - 1].stats.netProfit, 'optimize sorted best first');
  const o2 = await optimize({ code: F('sys-macd'), symbols: syms, session: s });
  ok(o2.errors.length === 1, 'no Optimize() reported');
  // ---- breadth
  const br = await buildBreadth({ symbols: syms, session: s });
  ok(br.dates.length > 100 && br.adv[50] + br.dec[50] + br.unch[50] === syms.length, 'breadth counts every symbol');
  console.log(`${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
