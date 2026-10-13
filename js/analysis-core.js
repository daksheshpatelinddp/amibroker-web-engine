// Analysis engine: Scan, Exploration, Backtest, Optimization. No DOM. Works on arrays from barsToArrays().
//   loadBars(symbol) -> Promise<{t,o,h,l,c,v,dq,delpct}|null>
import { aflEngine } from './afl-engine.js';
import { periodKey } from './timeframe.js';
import { rawTrades, portfolio, rotational, optionsFromResult } from './bt-core.js';

export const METRICS = {
  cagr: ['CAGR %', 1], netProfit: ['Net profit', 1], netProfitPct: ['Net profit %', 1], sharpe: ['Sharpe ratio', 1], sortino: ['Sortino ratio', 1],
  profitFactor: ['Profit factor', 1], carMdd: ['CAR / MaxDD', 1], riskAdjReturn: ['Risk-adjusted return %', 1], winPct: ['Win %', 1],
  maxDrawdownPct: ['Max drawdown % (lower is better)', -1], recoveryFactor: ['Recovery factor', 1], avgProfitPct: ['Avg profit/loss %', 1],
};

/** Arrays of a longer time frame built from daily arrays (same rules as the chart: first open, max high, min low, last close, sum volume). */
export function resampleArrays(b, tf) {
  if (!tf || tf === 'D') return b;
  const out = { t: [], o: [], h: [], l: [], c: [], v: [], dq: [], delpct: [] };
  let key = null, i0 = -1;
  const push = (i) => {
    const dq = b.dq[i];
    out.t.push(b.t[i]); out.c.push(b.c[i]);
    out.o.push(out._o); out.h.push(out._h); out.l.push(out._l); out.v.push(out._v); out.dq.push(dq);
    out.delpct.push(b.delpct[i]);
  };
  for (let i = 0; i < b.t.length; i++) {
    const k = periodKey(b.t[i], tf);
    if (k !== key) {
      if (i0 >= 0) push(i - 1);
      key = k; i0 = i; out._o = b.o[i]; out._h = b.h[i]; out._l = b.l[i]; out._v = Number.isFinite(b.v[i]) ? b.v[i] : 0;
    } else {
      if (b.h[i] > out._h) out._h = b.h[i];
      if (b.l[i] < out._l) out._l = b.l[i];
      out._v += Number.isFinite(b.v[i]) ? b.v[i] : 0;
    }
  }
  if (i0 >= 0) push(b.t.length - 1);
  delete out._o; delete out._h; delete out._l; delete out._v;
  return out;
}

const sliceArr = (a, from, to) => (a && typeof a === 'object' && a.length !== undefined ? Float64Array.from(a.subarray ? a.subarray(from, to + 1) : a.slice(from, to + 1)) : a);
const sliceBars = (b, from, to) => ({ t: b.t.slice(from, to + 1), o: b.o.slice(from, to + 1), h: b.h.slice(from, to + 1), l: b.l.slice(from, to + 1), c: b.c.slice(from, to + 1), v: b.v.slice(from, to + 1) });
const lowerBound = (t, d) => { let lo = 0, hi = t.length; while (lo < hi) { const m = (lo + hi) >> 1; if (t[m] < d) lo = m + 1; else hi = m; } return lo; };
const rangeOf = (b, from, to) => {
  const a = from ? lowerBound(b.t, from) : 0;
  let z = to ? lowerBound(b.t, to + '\u0001') - 1 : b.t.length - 1;
  z = Math.min(z, b.t.length - 1);
  return [a, z];
};

/** Shared loader with a cache; foreign symbols asked for by a formula are fetched and the formula is run again. */
export function makeSession(loadBars, interval = 'D') {
  const cache = new Map(), foreign = {};
  const get = async (sym) => {
    if (cache.has(sym)) return cache.get(sym);
    let b = null; try { b = await loadBars(sym); } catch (e) { b = null; }
    if (b && b.t && b.t.length) b = resampleArrays(b, interval); else b = null;
    cache.set(sym, b); return b;
  };
  const runOn = async (sym, bars, code, opts) => {
    let res = aflEngine.run(code, bars, { ...opts, symbol: sym, foreign });
    for (let tries = 0; tries < 2 && res.needSymbols && res.needSymbols.length; tries++) {
      let any = false;
      for (const need of res.needSymbols) if (!foreign[need]) { const fb = await get(need); if (fb) { foreign[need] = fb; any = true; } }
      if (!any) break;
      res = aflEngine.run(code, bars, { ...opts, symbol: sym, foreign });
    }
    return res;
  };
  return { get, runOn, cache, foreign };
}

const tick = () => new Promise((r) => setTimeout(r, 0));

/** Runs `fn(symbol, i)` over symbols with a little pause so the screen stays alive. */
async function eachSymbol(symbols, onProgress, cancel, fn) {
  for (let i = 0; i < symbols.length; i++) {
    if (cancel && cancel.stop) break;
    if (onProgress && i % 3 === 0) { onProgress(i, symbols.length, symbols[i]); await tick(); }
    await fn(symbols[i], i);
  }
  if (onProgress) onProgress(symbols.length, symbols.length, '');
}

// ------------------------------------------------------------------ Scan
export async function scan({ code, symbols, session, from, to, lastBars = 1, params, onProgress, cancel }) {
  const rows = [], errors = [];
  await eachSymbol(symbols, onProgress, cancel, async (sym, i) => {
    const b = await session.get(sym); if (!b) return;
    const [a, z] = rangeOf(b, from, to); if (z < a) return;
    const res = await session.runOn(sym, b, code, { action: 3, stockNum: i, rangeFrom: a, rangeTo: z, params, interval: 'D' });
    if (res.errors.length) { errors.push(`${sym}: ${res.errors[0]}`); return; }
    if (!res.usesSignals) return;
    const get = (arr, k) => arr && arr[k] && arr[k] === arr[k] && arr[k] !== 0;
    for (let k = z; k > z - lastBars && k >= a; k--) {
      const hit = ['buy', 'sell', 'short', 'cover'].filter((nm) => get(res[nm], k));
      if (hit.length) rows.push({ symbol: sym, date: b.t[k], signal: hit.map((x) => x[0].toUpperCase() + x.slice(1)).join('+'), close: b.c[k] });
    }
  });
  return { rows, errors };
}

// ------------------------------------------------------------------ Exploration
export async function explore({ code, symbols, session, from, to, params, maxRows = 5000, onProgress, cancel }) {
  const rows = [], errors = [], xy = {}, cols = [];
  await eachSymbol(symbols, onProgress, cancel, async (sym, i) => {
    const b = await session.get(sym); if (!b) return;
    const [a, z] = rangeOf(b, from, to); if (z < a) return;
    const res = await session.runOn(sym, b, code, { action: 4, stockNum: i, rangeFrom: a, rangeTo: z, params, interval: 'D' });
    if (res.errors.length) { errors.push(`${sym}: ${res.errors[0]}`); return; }
    for (const [name, c] of Object.entries(res.xy || {})) {
      const t = (xy[name] = xy[name] || { points: [], xLabel: c.xLabel, yLabel: c.yLabel });
      t.xLabel = c.xLabel; t.yLabel = c.yLabel; t.points.push(...c.points.map((p) => ({ ...p, label: p.label || sym })));
    }
    if (!res.filter) return;
    for (const c of res.columns) if (!cols.includes(c.name)) cols.push(c.name);
    for (let k = a; k <= z && rows.length < maxRows; k++) {
      if (!(res.filter[k] && res.filter[k] === res.filter[k])) continue;
      const row = { symbol: sym, date: b.t[k], values: {} };
      for (const c of res.columns) row.values[c.name] = c.text ? c.data : c.data[k];
      rows.push(row);
    }
  });
  return { rows, columns: cols, xy, errors };
}

// ------------------------------------------------------------------ Backtest
function buildUniverseEntry(sym, b, res, opt, a, z) {
  const bars = sliceBars(b, a, z);
  const v = (k) => (res.vars[k] !== undefined ? res.vars[k] : undefined);
  const sl = (x) => (x === undefined ? undefined : sliceArr(x, a, z));
  const cl = (arr) => (arr ? sliceArr(arr, a, z) : null);
  const sig = { buy: cl(res.buy), sell: cl(res.sell), short: cl(res.short), cover: cl(res.cover),
    buyPrice: sl(v('buyprice')), sellPrice: sl(v('sellprice')), shortPrice: sl(v('shortprice')), coverPrice: sl(v('coverprice')), stops: res.stops };
  const u = { symbol: sym, bars, score: sl(v('positionscore')), size: sl(v('positionsize')), buyPrice: sig.buyPrice, sellPrice: sig.sellPrice };
  if (opt.mode !== 1) u.trades = rawTrades(bars, sig, opt); else u.trades = [];
  return u;
}

export async function backtest({ code, symbols, session, from, to, params, optValues, overrides = {}, onProgress, cancel, prepared = null }) {
  const errors = [], universe = [];
  let res0 = null;
  // pass 1: run the formula on every symbol (or reuse the results of an earlier run)
  const runs = prepared || [];
  if (!prepared) {
    await eachSymbol(symbols, onProgress, cancel, async (sym, i) => {
      const b = await session.get(sym); if (!b) return;
      const [a, z] = rangeOf(b, from, to); if (z < a) return;
      const res = await session.runOn(sym, b, code, { action: 5, stockNum: i, rangeFrom: a, rangeTo: z, params, optValues, interval: 'D' });
      if (res.errors.length) { errors.push(`${sym}: ${res.errors[0]}`); return; }
      runs.push({ sym, b, res, a, z });
    });
  }
  if (!runs.length) return { trades: [], equityCurve: [], stats: null, errors: errors.length ? errors : ['No symbol produced data'], runs };
  res0 = runs[0].res;
  const opt = optionsFromResult(res0, overrides);
  for (const r of runs) universe.push(buildUniverseEntry(r.sym, r.b, r.res, opt, r.a, r.z));
  const out = opt.mode === 1 ? rotational(universe, opt) : portfolio(universe, opt);
  return { ...out, options: opt, errors, runs, optParams: res0.optParams };
}

// ------------------------------------------------------------------ Optimization
export function paramGrid(optParams) {
  const lists = optParams.map((p) => { const v = []; for (let x = p.min; x <= p.max + 1e-9; x += p.step) v.push(Math.round(x * 1e8) / 1e8); return v.length ? v : [p.def]; });
  let combos = [{}];
  optParams.forEach((p, k) => { const next = []; for (const c of combos) for (const v of lists[k]) next.push({ ...c, [p.name]: v }); combos = next; });
  return combos;
}

export async function optimize({ code, symbols, session, from, to, params, overrides, metric = 'cagr', maxCombos = 2000, onProgress, cancel }) {
  // probe run: find the Optimize() declarations
  const probe = await backtest({ code, symbols: symbols.slice(0, 1), session, from, to, params, overrides });
  const optParams = probe.optParams || [];
  if (!optParams.length) return { rows: [], optParams, errors: ['This formula has no Optimize() calls. Use Optimize("name", default, min, max, step) in place of a fixed number.'] };
  const combos = paramGrid(optParams);
  if (combos.length > maxCombos) return { rows: [], optParams, errors: [`${combos.length} combinations is more than the limit of ${maxCombos}. Narrow the min/max or enlarge the step.`] };
  const rows = [];
  for (let i = 0; i < combos.length; i++) {
    if (cancel && cancel.stop) break;
    if (onProgress) { onProgress(i, combos.length, JSON.stringify(combos[i])); await tick(); }
    const sub = await backtest({ code, symbols, session, from, to, params, optValues: combos[i], overrides });
    if (sub.stats) rows.push({ values: combos[i], stats: sub.stats });
    else if (sub.errors.length && !rows.length && i === 0) return { rows: [], optParams, errors: sub.errors };
  }
  const dir = (METRICS[metric] || METRICS.cagr)[1];
  rows.sort((x, y) => dir * (y.stats[metric] - x.stats[metric]));
  if (onProgress) onProgress(combos.length, combos.length, '');
  return { rows, optParams, errors: [] };
}

// ------------------------------------------------------------------ market breadth (advancing / declining issues per day)
export async function buildBreadth({ symbols, session, onProgress, cancel }) {
  const days = new Map();   // date -> {adv,dec,unch,advV,decV}
  await eachSymbol(symbols, onProgress, cancel, async (sym) => {
    const b = await session.get(sym); if (!b) return;
    for (let i = 1; i < b.t.length; i++) {
      const d = b.t[i]; let r = days.get(d); if (!r) { r = { adv: 0, dec: 0, unch: 0, advV: 0, decV: 0 }; days.set(d, r); }
      const diff = b.c[i] - b.c[i - 1], v = Number.isFinite(b.v[i]) ? b.v[i] : 0;
      if (diff > 0) { r.adv++; r.advV += v; } else if (diff < 0) { r.dec++; r.decV += v; } else r.unch++;
    }
  });
  const dates = [...days.keys()].sort();
  return { dates, adv: dates.map((d) => days.get(d).adv), dec: dates.map((d) => days.get(d).dec), unch: dates.map((d) => days.get(d).unch),
    advV: dates.map((d) => days.get(d).advV), decV: dates.map((d) => days.get(d).decV) };
}

export const toCSV = (cols, rows) => {
  const q = (x) => { const s = x === undefined || x === null ? '' : String(x); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  return [cols.map(q).join(','), ...rows.map((r) => r.map(q).join(','))].join('\n');
};
