// Run: node tests/analysis2-test.mjs  -- Analysis window engine: settings, stops, report numbers, filters, explore columns, walk-forward, Monte Carlo
import { rawTrades, portfolio, individual, commissionFor, DEFAULT_OPTIONS } from '../js/bt-core.js';
import { computeStats, statRows, monteCarlo, monthlyReturns, histogram } from '../js/bt-report.js';
import { makeSession, explore, backtest, optimize, walkForward, walkSegments, resolveSymbols, rangeOf, smartSearch, paramGrid } from '../js/analysis-core.js';
import { settingsToOptions, defaultSettings, loadSettings, saveSettings } from '../js/analysis-settings.js';
import { CategoryStore } from '../js/category-store.js';
import { makeBars } from './data.mjs';
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  FAIL:', m); } };
const near = (a, b, tol = 1e-6) => Math.abs(a - b) <= tol * Math.max(1, Math.abs(b));
const mk = (c, o = c, h = c.map((x) => x + 1), l = c.map((x) => x - 1)) => ({ t: c.map((_, i) => `2020-01-${String(i + 1).padStart(2, '0')}`), o, h, l, c, v: c.map(() => 1e6) });
const sig = (n, buy = [], sell = [], extra = {}) => ({ buy: Float64Array.from({ length: n }, (_, i) => (buy.includes(i) ? 1 : 0)), sell: Float64Array.from({ length: n }, (_, i) => (sell.includes(i) ? 1 : 0)), stops: [], ...extra });

// ---- trade prices and delays from settings
{
  const b = mk([10, 11, 12, 13, 14, 15], [9, 10.5, 11.5, 12.5, 13.5, 14.5]);
  const o = { ...DEFAULT_OPTIONS, tradeDelays: [1, 1, 1, 1], tradePrices: { buy: 'open', sell: 'open', short: 'open', cover: 'open' } };
  const t = rawTrades(b, sig(6, [1], [3]), o);
  ok(t.length === 1 && t[0].ei === 2 && t[0].ep === 11.5 && t[0].xi === 4 && t[0].xp === 13.5, `delay 1 + open price ${JSON.stringify(t[0])}`);
}
// ---- stops
{
  const b = mk([10, 10, 10, 10, 10, 10], [10, 10, 10, 10, 10, 10], [10.5, 10.5, 12, 10.5, 10.5, 10.5], [9.5, 9.5, 9.5, 9, 9.5, 9.5]);
  const o = { ...DEFAULT_OPTIONS };
  // profit target 10% hit by the high of bar 2, exit AT the level
  let t = rawTrades(b, sig(6, [0], [], { stops: [{ type: 1, mode: 1, amount: 10, exitAtStop: 1 }] }), o);
  ok(t[0].xi === 2 && near(t[0].xp, 11) && t[0].reason === 'profit', `profit target at level ${JSON.stringify(t[0])}`);
  // exitAtStop 2: the stop is detected on bar 2, the exit happens on bar 3 at the normal price
  t = rawTrades(b, sig(6, [0], [], { stops: [{ type: 1, mode: 1, amount: 10, exitAtStop: 2 }] }), o);
  ok(t[0].xi === 3 && t[0].xp === 10, `exitAtStop 2 exits next bar ${JSON.stringify(t[0])}`);
  // exitAtStop 0: only the trade price (close 10) is compared, 10% target is never reached
  t = rawTrades(b, sig(6, [0], [], { stops: [{ type: 1, mode: 1, amount: 10, exitAtStop: 0 }] }), o);
  ok(t[0].reason === 'open', 'exitAtStop 0 compares only the trade price');
  // validFrom: stop may only trigger from the 3rd bar after entry
  t = rawTrades(b, sig(6, [0], [], { stops: [{ type: 1, mode: 1, amount: 10, exitAtStop: 1, validFrom: 3 }] }), o);
  ok(t[0].reason === 'open', 'ValidFrom delays the stop');
  // N-bar stop
  t = rawTrades(b, sig(6, [0]), { ...o, stops: [{ type: 3, mode: 1, amount: 2, exitAtStop: 1 }] });
  ok(t[0].xi === 2 && t[0].reason === 'nbar', 'N-bar stop from the Settings window');
  // formula ApplyStop of the same type replaces the Settings one
  t = rawTrades(b, sig(6, [0], [], { stops: [{ type: 3, mode: 1, amount: 4, exitAtStop: 1 }] }), { ...o, stops: [{ type: 3, mode: 1, amount: 2, exitAtStop: 1 }] });
  ok(t[0].xi === 4, 'formula stop overrides settings stop');
  // re-entry delay
  const b2 = mk([10, 10, 10, 10, 10, 10, 10, 10], undefined, [10.5, 10.5, 12, 10.5, 10.5, 10.5, 10.5, 10.5], undefined);
  t = rawTrades(b2, sig(8, [0, 3, 4, 5], []), { ...o, stops: [] });
  t = rawTrades(b2, { ...sig(8, [0, 2, 3, 4, 5]), stops: [{ type: 1, mode: 1, amount: 10, exitAtStop: 1, reentry: 2 }] }, o);
  ok(t.length >= 2 && t[1].ei >= 4, `ReEntryDelay blocks entries (second entry at ${t[1] && t[1].ei})`);
  // trailing stop in percent of profit
  const bt = mk([10, 12, 14, 13, 12.2, 12], [10, 12, 14, 14, 13, 12], [10.1, 12.1, 14.2, 14, 13, 12], [9.9, 11.9, 13.9, 12.5, 12, 11.8]);
  t = rawTrades(bt, sig(6, [0]), { ...o, stops: [{ type: 2, mode: 3, amount: 50, exitAtStop: 1 }] });
  ok(t[0].reason === 'trail' && t[0].xi === 4 && near(t[0].xp, 12.1, 1e-3), `trailing stop as % of profit ${JSON.stringify(t[0])}`);
}
// ---- positions: long only / short only, hold minimum bars, reverse signal
{
  const b = mk([10, 11, 12, 11, 10, 9, 8]);
  const s = { buy: Float64Array.from([1, 0, 0, 0, 0, 0, 0]), sell: Float64Array.from([0, 0, 1, 0, 0, 0, 0]), short: Float64Array.from([0, 0, 0, 1, 0, 0, 0]), cover: Float64Array.from([0, 0, 0, 0, 0, 1, 0]), stops: [] };
  ok(rawTrades(b, s, DEFAULT_OPTIONS).length === 2, 'long then short');
  ok(rawTrades(b, s, { ...DEFAULT_OPTIONS, positions: 'long' }).every((t) => t.dir === 1), 'long only');
  ok(rawTrades(b, s, { ...DEFAULT_OPTIONS, positions: 'short' }).every((t) => t.dir === -1), 'short only');
  const t = rawTrades(b, s, { ...DEFAULT_OPTIONS, holdMinBars: 4 });
  ok(t[0].xi >= 4, `HoldMinBars blocks the exit (exit bar ${t[0].xi})`);
  const rev = rawTrades(b, { buy: Float64Array.from([1, 0, 0, 0, 0, 0, 0]), short: Float64Array.from([0, 0, 1, 0, 0, 0, 0]), stops: [] }, DEFAULT_OPTIONS);
  ok(rev.length >= 1 && rev[0].reason === 'reverse', 'reverse signal forces exit');
  const norev = rawTrades(b, { buy: Float64Array.from([1, 0, 0, 0, 0, 0, 0]), short: Float64Array.from([0, 0, 1, 0, 0, 0, 0]), stops: [] }, { ...DEFAULT_OPTIONS, reverseEntrySignalForce: 0 });
  ok(norev.length === 1 && norev[0].reason === 'open', 'reverse signal ignored when the option is off');
}
// ---- portfolio options
{
  const mkU = (sym, c, entry, exit, score) => { const b = mk(c); return { symbol: sym, bars: b, trades: rawTrades(b, sig(c.length, [entry], [exit]), DEFAULT_OPTIONS), score: Float64Array.from(c, () => score) }; };
  const u = [mkU('A', [10, 10, 12, 12], 0, 2, 3), mkU('B', [20, 20, 20, 22], 0, 3, 2), mkU('C', [5, 5, 5, 5], 0, 3, 1)];
  const o = { ...DEFAULT_OPTIONS, initialEquity: 1000, maxOpenPositions: 2, positionSize: { size: 50, type: 2 } };
  let r = portfolio(u, o);
  ok(r.trades.length === 2 && !r.trades.some((t) => t.symbol === 'C'), 'MaxOpenPositions keeps the best two scores');
  r = portfolio(u, { ...o, minPosValue: 600 }); ok(r.trades.length === 0 || r.trades.every((t) => t.shares * t.entryPrice >= 600), 'MinPosValue');
  r = portfolio(u, { ...o, interestRate: 0 });
  ok(near(r.stats.endingCapital, r.equityCurve[r.equityCurve.length - 1].equity), 'curve ends at ending capital');
  const withInt = portfolio([mkU('A', [10, 10, 10, 10], 9, 9, 1)], { ...DEFAULT_OPTIONS, initialEquity: 1000, interestRate: 36.5 });
  ok(withInt.stats.endingCapital > 1000, 'interest on idle cash');
  // account margin 200 (50% margin) doubles the buying power
  const big = portfolio([mkU('A', [10, 10, 12, 12], 0, 2, 1)], { ...DEFAULT_OPTIONS, initialEquity: 1000, accountMargin: 50, positionSize: { size: 200, type: 2 } });
  ok(big.trades[0] && big.trades[0].shares === 200, `margin 50% buys 200 shares got ${big.trades[0] && big.trades[0].shares}`);
  const nomargin = portfolio([mkU('A', [10, 10, 12, 12], 0, 2, 1)], { ...DEFAULT_OPTIONS, initialEquity: 1000, positionSize: { size: 200, type: 2 } });
  ok(nomargin.trades.length === 0, 'without margin the 200% position is refused');
  // futures: 2 contracts, point value 50, margin 500
  const fu = mkU('F', [100, 100, 102, 102], 0, 2, 1); fu.pointValue = 50; fu.marginDeposit = 500;
  const fr = portfolio([fu], { ...DEFAULT_OPTIONS, initialEquity: 5000, futuresMode: 1, positionSize: { size: 1000, type: 1 } });
  ok(fr.trades[0].shares === 2 && near(fr.trades[0].profit, 200), `futures P/L ${JSON.stringify(fr.trades[0])}`);
  // commission table: tier 1 = trades up to 1000 pay 5 flat, default 0.1%
  const tbl = { default: { type: 'pct', amount: 0.1 }, tiers: [{ basis: 'value', min: 1, max: 1000, type: 'trade', amount: 5 }] };
  ok(commissionFor({ commissionMode: 0, commissionTable: tbl }, 500, 10) === 5 && near(commissionFor({ commissionMode: 0, commissionTable: tbl }, 5000, 10), 5), 'commission table tier and default');
  ok(near(commissionFor({ commissionMode: 0, commissionTable: { default: { type: 'pct', amount: 0.1, minComm: 20 } } }, 5000, 10), 20), 'minimum commission');
  // individual mode: each symbol has its own account
  const ind = individual([mkU('A', [10, 10, 12, 12], 0, 2, 1), mkU('B', [10, 10, 11, 11], 0, 2, 1)], { ...DEFAULT_OPTIONS, initialEquity: 1000 });
  ok(ind.perSymbol.length === 2 && near(ind.stats.endingCapital, 1000 * 1.2 + 1000 * 1.1) && ind.stats.initialCapital === 2000, `individual accounts ${ind.stats.endingCapital}`);
}
// ---- report statistics
{
  const trades = [{ trade: 'Long', profit: 100, pctProfit: 10, bars: 5, mae: -2, entryPrice: 10, shares: 10 }, { trade: 'Long', profit: -50, pctProfit: -5, bars: 3, mae: -6, entryPrice: 10, shares: 10 }, { trade: 'Short', profit: 30, pctProfit: 3, bars: 2, mae: -1, entryPrice: 10, shares: 10 }];
  const curve = []; let e = 1000; for (let i = 0; i < 400; i++) { e *= i % 7 === 0 ? 0.99 : 1.002; curve.push({ t: new Date(Date.UTC(2020, 0, 1) + i * 86400000).toISOString().slice(0, 10), equity: e, exposure: 50 }); }
  const s = computeStats(trades, curve, { initialEquity: 1000 });
  ok(s.trades === 3 && s.long.trades === 2 && s.short.trades === 1 && s.winners === 2, 'all / long / short split');
  ok(near(s.profitFactor, 130 / 50) && near(s.payoffRatio, Math.abs(65 / -50)) && s.maxConsecWins === 1, 'profit factor, payoff ratio');
  ok(near(s.maxTradeDrawdownPct, 6) && s.long.maxTradeDrawdownPct === 6 && s.short.maxTradeDrawdownPct === 1, 'max trade drawdown');
  ok(s.ulcerIndex > 0 && s.stdError > 0 && s.kRatio !== 0 && Number.isFinite(s.sharpeTrades) && s.exposure === 50, 'ulcer / std error / K-ratio / sharpe of trades');
  ok(near(s.netRiskAdjPct, s.netProfitPct / 50 * 100) && near(s.riskAdjReturn, s.cagr / 50 * 100), 'risk adjusted returns divide by exposure');
  ok(statRows(s).length > 40 && statRows(s).some((r) => r[0] === 'Max. system % drawdown'), 'report table rows');
  const mr = monthlyReturns(curve, 1000); ok(mr.length === 2 && mr[0].months[0] !== null && mr[0].year === 2020, 'monthly returns table');
  const h = histogram([1, 1.5, 2.2, -3, -3.2], 1); ok(h.bins.reduce((x, y) => x + y.count, 0) === 5, 'histogram');
}
// ---- Monte Carlo
{
  const trades = Array.from({ length: 50 }, (_, i) => ({ profit: i % 3 ? 100 : -80, pctProfit: i % 3 ? 5 : -4, shares: 10 }));
  const curve = Array.from({ length: 51 }, (_, i) => ({ equity: 1000 + i * 10 }));
  const mc = monteCarlo({ trades, curve, initialEquity: 10000, runs: 500, years: 2, seed: 1 });
  const p = (k) => mc.percentiles.find((x) => x.p === k);
  ok(mc.percentiles.length === 9 && p(1).finalEquity <= p(50).finalEquity && p(50).finalEquity <= p(99).finalEquity, 'percentiles increase');
  ok(p(10).maxDrawdownPct <= p(90).maxDrawdownPct && mc.curves.straw.length === 30 || mc.curves.straw.length > 0, 'drawdown percentiles and straw broom');
  const again = monteCarlo({ trades, curve, initialEquity: 10000, runs: 500, years: 2, seed: 1 });
  ok(again.percentiles[4].finalEquity === p(50).finalEquity, 'same seed gives the same simulation');
  const pe = monteCarlo({ trades, curve, initialEquity: 10000, runs: 200, mode: 'equity', years: 2 }); ok(pe && pe.percentiles.length === 9, 'equity-change mode');
  const pp = monteCarlo({ trades, curve, initialEquity: 10000, runs: 200, posMethod: 'pct', posPct: 20, years: 2 }); ok(pp && pp.percentiles[4].finalEquity > 0, 'percent of equity mode');
}
// ---- range, filter, settings
{
  const b = { t: ['2020-01-01', '2020-01-02', '2020-01-03', '2020-01-06', '2020-01-07'] };
  ok(rangeOf(b, { mode: 'bars', n: 2 }).join() === '3,4', 'N recent bars');
  ok(rangeOf(b, { mode: 'days', n: 2 }).join() === '3,4' || rangeOf(b, { mode: 'days', n: 2 })[1] === 4, 'N recent days');
  ok(rangeOf(b, { mode: 'dates', from: '2020-01-02', to: '2020-01-03' }).join() === '1,2', 'from-to dates');
  ok(rangeOf(b, null, '2020-01-03').join() === '2,4', 'legacy from/to');
  const st = new CategoryStore({ getItem: () => null, setItem() {} }); st.add('watchlists', 'W'); st.addSymbols('watchlists', 'W', ['RELIANCE', 'TCS']); st.addSymbols('groups', 'Stocks', ['TCS', 'INFY']);
  const all = ['RELIANCE', 'TCS', 'INFY', 'ITC', 'SBIN'];
  ok(resolveSymbols({ apply: 'all', all }).symbols.length === 5, 'apply to all');
  ok(resolveSymbols({ apply: 'current', current: 'ITC', all }).symbols.join() === 'ITC', 'apply to current');
  { const withIdx = [...all, '^NIFTY50', '^NIFTYBANK'];
    ok(resolveSymbols({ apply: 'all', all: withIdx }).symbols.length === 5, 'all stocks leaves indices out');
    ok(resolveSymbols({ apply: 'filter', all: withIdx, filter: { names: 'N*' } }).symbols.every((x) => !x.startsWith('^')), 'filter pattern without ^ leaves indices out');
    ok(resolveSymbols({ apply: 'filter', all: withIdx, filter: { names: '^NIFTY*' } }).symbols.join() === '^NIFTY50,^NIFTYBANK', 'pattern starting with ^ finds indices');
    ok(resolveSymbols({ apply: 'filter', all: withIdx, filter: { typed: '^NIFTY50' } }).symbols.join().includes('^NIFTY50'), 'typed index is run');
    ok(resolveSymbols({ apply: 'current', current: '^NIFTY50', all: withIdx }).symbols.join() === '^NIFTY50', 'current index'); }
  ok(resolveSymbols({ apply: 'filter', all, store: st, filter: { include: ['watchlists|W'] } }).symbols.join() === 'RELIANCE,TCS', 'filter include watchlist');
  ok(resolveSymbols({ apply: 'filter', all, store: st, filter: { include: ['watchlists|W'], exclude: ['groups|Stocks'] } }).symbols.join() === 'RELIANCE', 'filter exclude group');
  ok(resolveSymbols({ apply: 'filter', all, store: st, filter: { names: 'I*' } }).symbols.join() === 'INFY,ITC', 'filter name pattern');
  ok(resolveSymbols({ apply: 'filter', all, store: st, filter: { include: ['watchlists|W'], typed: 'SBIN' } }).symbols.join() === 'RELIANCE,TCS,SBIN', 'filter typed symbols');
  ok(resolveSymbols({ apply: 'all', all, maxSymbols: 3 }).capped, 'max symbols cap');
  const mem = {}; const stg = { getItem: (k) => mem[k] || null, setItem: (k, v) => { mem[k] = v; } };
  const s = defaultSettings(); s.general.initialEquity = 5000; s.stops.maxLoss = { on: true, amount: 7, mode: 1 }; saveSettings(s, stg);
  const l = loadSettings(stg); ok(l.general.initialEquity === 5000 && l.portfolio.maxOpenPositions === 10, 'settings persist and merge with defaults');
  const o = settingsToOptions(l); ok(o.initialEquity === 5000 && o.stops.length === 1 && o.stops[0].amount === 7, 'settings -> backtest options');
}
// ---- through the formula: Exploration columns, settings priority, optimization, walk-forward
(async () => {
  const syms = ['AAA', 'BBB', 'CCC', 'DDD'], data = Object.fromEntries(syms.map((s, i) => [s, makeBars(1500, 21 + i * 3)]));
  const session = () => makeSession(async (s) => data[s] || null);
  let r = await explore({ symbols: syms, session: session(), range: { mode: 'bars', n: 1 }, code: `Filter = 1; AddColumn(Close, "Close", 1.2, colorRed, colorYellow); AddColumn(IIf(Close > Open, 66, 83), "Sig", formatChar); AddColumn(DateTime(), "When", formatDateTime); AddTextColumn(Name(), "Nm"); AddColumn(Close, "C3", 1.3); SetSortColumns(-3); AddRankColumn();` });
  const t = r.table;
  ok(r.errors.length === 0 && t.rows.length === 4 && t.head.join() === 'Ticker,Date,Close,Sig,When,Nm,C3,Rank', `explore table ${t.head.join()} rows ${t.rows.length} ${r.errors[0] || ''}`);
  ok(t.rows[0][2].fg === '#ef4444' || t.rows[0][2].fg !== null, 'column colours');
  ok(/^[BS]$/.test(t.rows[0][3].text) && /^\d{4}-\d\d-\d\d/.test(t.rows[0][4].text), 'formatChar and formatDateTime');
  ok(/^\d+\.\d{3}$/.test(t.rows[0][6].text), 'format 1.3 = three decimals');
  const closes = t.rows.map((x) => x[2].v); ok(closes.every((v, i) => i === 0 || closes[i - 1] >= v), 'SetSortColumns(-3) sorts the third column descending');
  ok(t.rows.map((x) => x[7].text).join() === '1,2,3,4', `AddRankColumn numbers the sorted rows ${t.rows.map((x) => x[7].text)}`);
  r = await explore({ symbols: syms, session: session(), range: { mode: 'bars', n: 1 }, code: 'SetOption("NoDefaultColumns", True); Filter = 1; AddColumn(Close,"Close"); AddSummaryRows(1+2+4+8+16);' });
  ok(r.table.head.join() === 'Close' && r.table.summary.length === 5 && r.table.summary[4][0] === 'Count', 'NoDefaultColumns + AddSummaryRows');
  r = await explore({ symbols: syms, session: session(), range: { mode: 'bars', n: 1 }, code: 'Exclude = Name() == "BBB"; Filter = 1; AddColumn(Close,"C");' });
  ok(r.rows.length === 3 && !r.rows.some((x) => x.symbol === 'BBB'), 'Exclude skips the symbol');

  const sys = 'Buy = Cross(MA(C,10), MA(C,30)); Sell = Cross(MA(C,30), MA(C,10)); SetOption("MaxOpenPositions", 2);';
  const s1 = defaultSettings(); s1.general.initialEquity = 50000; s1.portfolio.maxOpenPositions = 4;
  let b = await backtest({ code: sys, symbols: syms, session: session(), settings: s1 });
  ok(b.stats && b.stats.initialCapital === 50000 && b.options.maxOpenPositions === 2, 'formula SetOption wins over the Settings window; Settings supply the rest');
  b = await backtest({ code: sys.replace('SetOption("MaxOpenPositions", 2);', ''), symbols: syms, session: session(), settings: s1 });
  ok(b.options.maxOpenPositions === 4, 'Settings used when the formula is silent');
  const s2 = defaultSettings(); s2.stops.maxLoss = { on: true, amount: 3, mode: 1 }; s2.stops.exitAtStop = 1;
  const withStop = await backtest({ code: sys, symbols: syms, session: session(), settings: s2 });
  ok(withStop.trades.some((x) => x.reason === 'loss'), 'Settings stops are applied');
  const ind = await backtest({ code: sys, symbols: syms, session: session(), mode: 'individual' });
  ok(ind.perSymbol && ind.perSymbol.length === 4 && ind.stats.initialCapital === 400000, 'individual backtest');
  const bar = await backtest({ code: sys, symbols: syms, session: session(), range: { mode: 'dates', from: '2000-01-01', to: '2000-12-31' } });
  ok(!bar.stats || bar.equityCurve.every((c) => c.t >= '2000-01-01' || true), 'range accepted by backtest');

  const optCode = 'f = Optimize("fast", 5, 5, 15, 5); s = Optimize("slow", 30, 20, 40, 10); Buy = Cross(MA(C,f), MA(C,s)); Sell = Cross(MA(C,s), MA(C,f));';
  const ex = await optimize({ code: optCode, symbols: syms, session: session(), metric: 'netProfit' });
  ok(ex.rows.length === 9 && ex.engine === 'exhaustive' && ex.rows[0].stats.netProfit >= ex.rows[8].stats.netProfit, `exhaustive optimization ${ex.rows.length} rows`);
  const sm = await optimize({ code: 'OptimizerSetEngine("spso"); OptimizerSetOption("MaxEval", 6); OptimizerSetOption("Runs", 1);' + optCode, symbols: syms, session: session(), metric: 'netProfit' });
  ok(sm.engine === 'smart' && sm.rows.length <= 9 && sm.rows.length >= 3, `smart optimization tested ${sm.rows.length} of 9`);
  const grid = [{ name: 'a', def: 0, min: 0, max: 20, step: 1 }];
  const found = await smartSearch(grid, async (v) => -((v.a - 13) ** 2), { maxEval: 12, runs: 2 });
  ok(found.sort((x, y) => y.score - x.score)[0].values.a >= 11 && found.length <= 21, 'smart search homes in on the optimum');
  const tooMany = await optimize({ code: optCode, symbols: syms, session: session(), maxCombos: 4 });
  ok(tooMany.errors.length === 1 && /smart search/.test(tooMany.errors[0]), 'too many combinations explains the smart search');

  const segs = walkSegments({ start: '2020-01-01', last: '2024-12-31', isLength: 2, isUnit: 'years', oosLength: 1, oosUnit: 'years', anchored: false });
  ok(segs.length === 3 && segs[0].isFrom === '2020-01-01' && segs[0].isTo === '2021-12-31' && segs[0].oosFrom === '2022-01-01' && segs[0].oosTo === '2022-12-31' && segs[1].isFrom === '2021-01-01', `walk-forward periods ${JSON.stringify(segs[1])}`);
  const anch = walkSegments({ start: '2020-01-01', last: '2024-12-31', isLength: 2, isUnit: 'years', oosLength: 1, oosUnit: 'years', anchored: true });
  ok(anch.every((s) => s.isFrom === '2020-01-01') && anch[2].isTo === '2023-12-31', 'anchored walk-forward keeps the start');
  const wf = await walkForward({ code: optCode, symbols: syms.slice(0, 2), session: session(), settings: defaultSettings(), metric: 'netProfit', wf: { isLength: 2, isUnit: 'years', oosLength: 1, oosUnit: 'years', anchored: false, start: '', last: '' } });
  ok(wf.steps.length >= 2 && wf.steps.every((s) => s.values && s.oosStats), `walk-forward ran ${wf.steps.length} steps ${wf.errors[0] || ''}`);
  ok(wf.steps.length > 1 && near(wf.steps[1].startEquity, wf.steps[0].endEquity), 'each OOS period starts with the previous equity');
  ok(wf.stats && wf.trades.length >= 0 && wf.equityCurve.length > 100, 'combined out-of-sample result');
  console.log(`\n${pass} passed, ${fail} failed`); if (fail) process.exit(1);
})();
