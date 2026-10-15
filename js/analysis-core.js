// Analysis engine: Scan, Exploration, Backtest (portfolio / individual), Optimization (exhaustive / smart), Walk-Forward, Monte Carlo. No DOM.
//   loadBars(symbol) -> Promise<{t,o,h,l,c,v,dq,delpct}|null>
import { aflEngine } from './afl-engine.js';
import { periodKey } from './timeframe.js';
import { rawTrades, portfolio, rotational, individual, optionsFromResult } from './bt-core.js';
import { computeStats } from './bt-report.js';
import { settingsToOptions, defaultSettings } from './analysis-settings.js';
import { colorToHex } from './afl-engine.js';

export const METRICS = {
  carMdd: ['CAR / MaxDD', 1], cagr: ['CAGR %', 1], netProfit: ['Net profit', 1], netProfitPct: ['Net profit %', 1], rarMdd: ['RAR / MaxDD', 1],
  sharpeTrades: ['Sharpe ratio of trades', 1], sharpe: ['Sharpe ratio (daily)', 1], sortino: ['Sortino ratio', 1], profitFactor: ['Profit factor', 1],
  riskAdjReturn: ['Risk-adjusted return %', 1], winPct: ['Win %', 1], maxDrawdownPct: ['Max drawdown % (lower is better)', -1], recoveryFactor: ['Recovery factor', 1],
  ulcerPerformance: ['Ulcer performance index', 1], kRatio: ['K-ratio', 1], riskRewardRatio: ['Risk-reward ratio', 1], avgProfitPct: ['Avg profit/loss %', 1], trades: ['Number of trades', 1],
};

// ------------------------------------------------------------------ time frames
/** Arrays of a longer time frame built from daily arrays (same rules as the chart: first open, max high, min low, last close, sum volume). */
export function resampleArrays(b, tf) {
  if (!tf || tf === 'D') return b;
  const out = { t: [], o: [], h: [], l: [], c: [], v: [], dq: [], delpct: [] };
  let key = null, i0 = -1;
  const push = (i) => {
    out.t.push(b.t[i]); out.c.push(b.c[i]);
    out.o.push(out._o); out.h.push(out._h); out.l.push(out._l); out.v.push(out._v); out.dq.push(b.dq ? b.dq[i] : NaN);
    out.delpct.push(b.delpct ? b.delpct[i] : NaN);
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
const dayNum = (d) => Date.parse(d) / 86400000;

/**
 * Range, like AmiBroker's Range box: {mode:'all'} | {mode:'bars', n} (N recent bars) | {mode:'days', n} (N recent days) | {mode:'dates', from, to}
 * Old callers pass from / to instead.
 */
export function normRange(range, from, to) {
  if (range && range.mode) return range;
  if (from || to) return { mode: 'dates', from: from || null, to: to || null };
  return { mode: 'all' };
}
export function rangeOf(b, range, from, to) {
  const r = normRange(range, from, to), last = b.t.length - 1;
  if (last < 0) return [0, -1];
  if (r.mode === 'bars') return [Math.max(0, last - Math.max(1, r.n | 0) + 1), last];
  if (r.mode === 'days') { const cut = new Date(dayNum(b.t[last]) * 86400000 - (Math.max(1, r.n | 0) - 1) * 86400000).toISOString().slice(0, 10); return [lowerBound(b.t, cut), last]; }
  const a = r.from ? lowerBound(b.t, r.from) : 0;
  let z = r.to ? lowerBound(b.t, r.to + '\u0001') - 1 : last;
  return [a, Math.min(z, last)];
}

// ------------------------------------------------------------------ choosing symbols (Apply to / Filter)
const wildcard = (p) => new RegExp('^' + p.trim().replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.') + '$', 'i');
/**
 * apply: 'current' | 'all' | 'filter'.  filter = {include:[keys], exclude:[keys], names:'RELI*, TCS', typed:'A, B', limit:N}
 * keys are "type|name" from CategoryStore.options(). Empty include = every symbol.
 */
export function resolveSymbols({ apply = 'all', current = '', all = [], filter = {}, store = null, maxSymbols = 0 }) {
  let list;
  if (apply === 'current') list = current ? [current] : [];
  else if (apply === 'filter') {
    const f = filter || {}, up = (s) => String(s).toUpperCase();
    const inc = (f.include || []).length ? new Set((f.include || []).flatMap((k) => (store ? store.resolve(k, all) : []).map(up))) : null;
    const exc = new Set((f.exclude || []).flatMap((k) => (store ? store.resolve(k, all) : []).map(up)));
    const pats = String(f.names || '').split(/[,\s]+/).filter(Boolean).map(wildcard);
    list = all.filter((s) => (!inc || inc.has(up(s))) && !exc.has(up(s)) && (!pats.length || pats.some((p) => p.test(s))));
    const typed = String(f.typed || '').split(/[,\s]+/).map((x) => x.trim().toUpperCase()).filter(Boolean);
    for (const t of typed) if (!list.some((s) => up(s) === t) && !exc.has(t)) list.push(all.find((s) => up(s) === t) || t);
    if (f.limit > 0) list = list.slice(0, f.limit);
  } else list = [...all];
  let capped = false;
  if (maxSymbols > 0 && list.length > maxSymbols && apply !== 'current') { list = list.slice(0, maxSymbols); capped = true; }
  return { symbols: list, capped };
}

// ------------------------------------------------------------------ session
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
async function eachSymbol(symbols, onProgress, cancel, fn) {
  for (let i = 0; i < symbols.length; i++) {
    if (cancel && cancel.stop) break;
    if (onProgress && i % 3 === 0) { onProgress(i, symbols.length, symbols[i]); await tick(); }
    await fn(symbols[i], i);
  }
  if (onProgress) onProgress(symbols.length, symbols.length, '');
}
const flag = (arr, k) => !!(arr && arr[k] && arr[k] === arr[k]);
const excluded = (res, z) => { const e = res.vars && res.vars.exclude; return e !== undefined && (typeof e === 'object' ? flag(e, z) : !!e); };

// ------------------------------------------------------------------ Scan
export async function scan({ code, symbols, session, range, from, to, lastBars = 1, params, onProgress, cancel }) {
  const rows = [], errors = [];
  await eachSymbol(symbols, onProgress, cancel, async (sym, i) => {
    const b = await session.get(sym); if (!b) return;
    const [a, z] = rangeOf(b, range, from, to); if (z < a) return;
    const res = await session.runOn(sym, b, code, { action: 3, stockNum: i, rangeFrom: a, rangeTo: z, params, interval: 'D' });
    if (res.errors.length) { errors.push(`${sym}: ${res.errors[0]}`); return; }
    if (!res.usesSignals || excluded(res, z)) return;
    const pr = { buy: 'buyprice', sell: 'sellprice', short: 'shortprice', cover: 'coverprice' };
    const names = { buy: 'Buy', sell: 'Sell', short: 'Short', cover: 'Cover' };
    for (let k = z; k > z - lastBars && k >= a; k--) {
      const hit = ['buy', 'sell', 'short', 'cover'].filter((nm) => flag(res[nm], k));
      if (hit.length) {
        const pa = res.vars[pr[hit[0]]]; const price = pa !== undefined ? (typeof pa === 'object' ? pa[k] : pa) : b.c[k];
        rows.push({ symbol: sym, date: b.t[k], signal: hit.map((x) => names[x]).join('+'), close: b.c[k], price: Number.isFinite(price) ? price : b.c[k] });
      }
    }
  });
  return { rows, errors };
}

// ------------------------------------------------------------------ Exploration
const decimals = (f) => Math.max(0, Math.min(8, Math.round((f - Math.trunc(f)) * 10)));
function cellOf(col, k) {
  if (col.kind === 'text') return { v: col.data, text: col.data };
  if (col.kind === 'rank') return { v: NaN, text: '' };
  const v = col.data[k];
  if (col.texts) return { v: col.kind === 'multi' ? col.texts[k] : v, text: col.texts[k] };
  return { v, text: Number.isFinite(v) ? v.toFixed(decimals(col.format)) : '-' };
}
const colorAt = (c, k) => { const x = c === undefined ? undefined : (typeof c === 'object' ? c[k] : c); return x === undefined ? null : colorToHex(x); };

/**
 * Rows of the exploration, ready to show: table = { head:[names], cols:[{name,kind}], rows:[[{v,text,fg,bg}]], summary:[[...]] }
 * Also keeps the older fields: rows[].values, columns (names), xy.
 */
export async function explore({ code, symbols, session, range, from, to, params, maxRows = 5000, onProgress, cancel }) {
  const rows = [], errors = [], xy = {}, colNames = []; let meta = null, noDefault = false, sortCols = [], summary = null;
  await eachSymbol(symbols, onProgress, cancel, async (sym, i) => {
    const b = await session.get(sym); if (!b) return;
    const [a, z] = rangeOf(b, range, from, to); if (z < a) return;
    const res = await session.runOn(sym, b, code, { action: 4, stockNum: i, rangeFrom: a, rangeTo: z, params, interval: 'D' });
    if (res.errors.length) { errors.push(`${sym}: ${res.errors[0]}`); return; }
    for (const [name, c] of Object.entries(res.xy || {})) {
      const t = (xy[name] = xy[name] || { points: [], xLabel: c.xLabel, yLabel: c.yLabel });
      t.xLabel = c.xLabel; t.yLabel = c.yLabel; t.points.push(...c.points.map((p) => ({ ...p, label: p.label || sym })));
    }
    if (!res.filter || excluded(res, z)) return;
    noDefault = !!res.options.nodefaultcolumns; sortCols = res.sortColumns || sortCols; summary = res.summary || summary;
    if (!meta) meta = res.columns.map((c) => ({ name: c.name, kind: c.kind || (c.text ? 'text' : 'num'), format: c.format, sort: c.sort }));
    for (const c of res.columns) if (!colNames.includes(c.name)) colNames.push(c.name);
    for (let k = a; k <= z && rows.length < maxRows; k++) {
      if (!flag(res.filter, k)) continue;
      const row = { symbol: sym, date: b.t[k], values: {}, cells: [] };
      for (const c of res.columns) { const cell = cellOf(c, k); cell.fg = colorAt(c.fg, k); cell.bg = colorAt(c.bg, k); row.cells.push(cell); row.values[c.name] = c.text ? c.data : cell.v; }
      rows.push(row);
    }
  });
  const table = buildTable(rows, meta || [], { noDefault, sortCols, summary });
  return { rows: table.rowsSorted, columns: colNames, xy, errors, table };
}

/** Sort, rank and summarise exploration rows. Column numbers of SetSortColumns count Ticker (1) and Date (2) unless NoDefaultColumns. */
export function buildTable(rows, meta, { noDefault = false, sortCols = [], summary = null } = {}) {
  const lead = noDefault ? 0 : 2;
  const cmp = (cols) => (x, y) => {
    for (const sc of cols) {
      const ci = Math.abs(sc) - 1, asc = sc > 0; let a, b;
      if (ci < lead) { a = ci === 0 ? x.symbol : x.date; b = ci === 0 ? y.symbol : y.date; } else { a = x.cells[ci - lead] && x.cells[ci - lead].v; b = y.cells[ci - lead] && y.cells[ci - lead].v; }
      if (a === b || (Number.isNaN(a) && Number.isNaN(b))) continue;
      const na = typeof a === 'number' && !Number.isNaN(a), nb = typeof b === 'number' && !Number.isNaN(b);
      let r; if (na && nb) r = a - b; else if (na) r = -1; else if (nb) r = 1; else r = String(a).localeCompare(String(b));
      if (r) return asc ? r : -r;
    }
    return 0;
  };
  const sorted = sortCols.length ? [...rows].sort(cmp(sortCols)) : [...rows];
  meta.forEach((m, ci) => {
    if (m.kind !== 'rank') return;
    const order = m.sort && m.sort.length ? [...rows].sort(cmp(m.sort)) : rows, pos = new Map(order.map((r, k) => [r, k + 1]));
    rows.forEach((r) => { const v = pos.get(r); r.cells[ci] = { v, text: v.toFixed(decimals(m.format || 1)) }; r.values[m.name] = v; });
  });
  const head = [...(noDefault ? [] : ['Ticker', 'Date']), ...meta.map((m) => m.name)];
  const body = sorted.map((r) => [...(noDefault ? [] : [{ v: r.symbol, text: r.symbol }, { v: r.date, text: r.date }]), ...r.cells]);
  const out = { head, cols: head.map((h, k) => ({ name: h, kind: k < lead ? 'text' : (meta[k - lead] || {}).kind })), rows: body, rowsSorted: sorted, summary: [] };
  if (summary && summary.mask) {
    const fmt = summary.format || 1.2, d = decimals(fmt);
    const kinds = [[1, 'Total', (v) => v.reduce((s, x) => s + x, 0)], [2, 'Min', (v) => Math.min(...v)], [4, 'Max', (v) => Math.max(...v)], [8, 'Average', (v) => v.reduce((s, x) => s + x, 0) / v.length], [16, 'Count', (v) => v.length]];
    for (const [bit, label, fn] of kinds) if (summary.mask & bit) {
      out.summary.push(head.map((h, k) => {
        if (k === 0) return label; if (k < lead) return '';
        const m = meta[k - lead]; if (!m || m.kind !== 'num') return '';
        const vals = body.map((r) => r[k].v).filter(Number.isFinite); return vals.length ? (bit === 16 ? String(vals.length) : fn(vals).toFixed(d)) : '';
      }));
    }
  }
  return out;
}

// ------------------------------------------------------------------ Backtest
function varScalar(res, k) { const v = res.vars[k]; return typeof v === 'number' && Number.isFinite(v) ? v : undefined; }
function buildUniverseEntry(sym, b, res, opt, a, z) {
  const bars = sliceBars(b, a, z);
  const v = (k) => (res.vars[k] !== undefined ? res.vars[k] : undefined);
  const sl = (x) => (x === undefined ? undefined : sliceArr(x, a, z));
  const cl = (arr) => (arr ? sliceArr(arr, a, z) : null);
  const stops = (res.stops || []).map((s) => ({ ...s, amountArr: s.amountArr ? sliceArr(s.amountArr, a, z) : null }));
  const sig = { buy: cl(res.buy), sell: cl(res.sell), short: cl(res.short), cover: cl(res.cover),
    buyPrice: sl(v('buyprice')), sellPrice: sl(v('sellprice')), shortPrice: sl(v('shortprice')), coverPrice: sl(v('coverprice')), stops };
  const tickSym = varScalar(res, 'ticksize'), o2 = tickSym !== undefined ? { ...opt, tickSize: tickSym } : opt;
  const u = { symbol: sym, bars, score: sl(v('positionscore')), size: sl(v('positionsize')), buyPrice: sig.buyPrice, sellPrice: sig.sellPrice,
    pointValue: varScalar(res, 'pointvalue') || 1, marginDeposit: varScalar(res, 'margindeposit') || 0, roundLot: varScalar(res, 'roundlotsize') || 0 };
  u.trades = opt.mode !== 1 ? rawTrades(bars, sig, o2) : [];
  return u;
}

/** Runs the formula on every symbol (full history). Result entries are reused by optimization and walk-forward. */
export async function runAll({ code, symbols, session, params, optValues, action = 5, onProgress, cancel, errors = [] }) {
  const runs = [];
  await eachSymbol(symbols, onProgress, cancel, async (sym, i) => {
    const b = await session.get(sym); if (!b) return;
    const res = await session.runOn(sym, b, code, { action, stockNum: i, rangeFrom: 0, rangeTo: b.t.length - 1, params, optValues, interval: 'D' });
    if (res.errors.length) { errors.push(`${sym}: ${res.errors[0]}`); return; }
    if (excluded(res, b.t.length - 1)) return;
    runs.push({ sym, b, res });
  });
  return runs;
}

/** Portfolio / individual / rotational simulation on already computed runs, for a range. */
export function simulate(runs, { range, from, to, overrides = {}, settings = null, mode = 'portfolio' } = {}) {
  if (!runs.length) return null;
  const base = settingsToOptions(settings || defaultSettings());
  const opt = optionsFromResult(runs[0].res, overrides, base);
  const universe = [];
  for (const r of runs) { const [a, z] = rangeOf(r.b, range, from, to); if (z < a) continue; universe.push(buildUniverseEntry(r.sym, r.b, r.res, opt, a, z)); }
  if (!universe.length) return null;
  const out = opt.mode === 1 ? rotational(universe, opt) : mode === 'individual' ? individual(universe, opt) : portfolio(universe, opt);
  return { ...out, options: opt, universe: universe.length };
}

export async function backtest({ code, symbols, session, range, from, to, params, optValues, overrides = {}, settings = null, mode = 'portfolio', onProgress, cancel, prepared = null }) {
  const errors = [], t0 = Date.now();
  const runs = prepared || await runAll({ code, symbols, session, params, optValues, onProgress, cancel, errors });
  if (!runs.length) return { trades: [], equityCurve: [], stats: null, errors: errors.length ? errors : ['No symbol produced data'], runs };
  const sim = simulate(runs, { range, from, to, overrides, settings, mode });
  if (!sim) return { trades: [], equityCurve: [], stats: null, errors: errors.length ? errors : ['No data in the chosen range'], runs };
  return { ...sim, errors, runs, optParams: runs[0].res.optParams, info: { symbols: runs.length, requested: symbols.length, seconds: (Date.now() - t0) / 1000, bars: runs.reduce((s, r) => s + r.b.t.length, 0) } };
}

// ------------------------------------------------------------------ Optimization
export function paramGrid(optParams) {
  const lists = optParams.map((p) => { const v = []; for (let x = p.min; x <= p.max + 1e-9; x += p.step) v.push(Math.round(x * 1e8) / 1e8); return v.length ? v : [p.def]; });
  let combos = [{}];
  optParams.forEach((p, k) => { const next = []; for (const c of combos) for (const v of lists[k]) next.push({ ...c, [p.name]: v }); combos = next; });
  return combos;
}
const gridSizes = (optParams) => optParams.map((p) => Math.max(1, Math.floor((p.max - p.min) / p.step + 1e-9) + 1));
const valueAt = (p, i) => Math.round((p.min + i * p.step) * 1e8) / 1e8;

/** Particle-swarm search over the grid of Optimize() values. evalFn(values) -> Promise<number|null> (bigger is better). */
export async function smartSearch(optParams, evalFn, { maxEval = 500, runs = 3, seed = 7, cancel, onProgress } = {}) {
  let a = seed >>> 0; const rnd = () => { a += 0x6D2B79F5; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const sizes = gridSizes(optParams), D = sizes.length, seen = new Map(); let evals = 0;
  const key = (idx) => idx.join(',');
  const score = async (idx) => {
    const k = key(idx); if (seen.has(k)) return seen.get(k).score;
    const values = {}; optParams.forEach((p, d) => { values[p.name] = valueAt(p, idx[d]); });
    const s = await evalFn(values); evals++; if (onProgress) onProgress(evals, maxEval * runs, JSON.stringify(values));
    seen.set(k, { idx: [...idx], values, score: s === null || !Number.isFinite(s) ? -Infinity : s }); return seen.get(k).score;
  };
  const total = sizes.reduce((x, y) => x * y, 1);
  for (let run = 0; run < runs && seen.size < total; run++) {
    const S = Math.min(total, Math.max(6, 6 + 2 * D)), P = [];
    for (let i = 0; i < S; i++) P.push({ x: sizes.map((n) => rnd() * (n - 1)), v: sizes.map((n) => (rnd() - 0.5) * (n - 1) * 0.3), best: null, bs: -Infinity });
    let gBest = null, gs = -Infinity, used = 0;
    while (used < maxEval && seen.size < total) {
      for (const p of P) {
        if (cancel && cancel.stop) return [...seen.values()];
        const idx = p.x.map((x, d) => Math.max(0, Math.min(sizes[d] - 1, Math.round(x)))), before = seen.size, s = await score(idx);
        if (seen.size > before) used++;
        if (s > p.bs) { p.bs = s; p.best = [...p.x]; } if (s > gs) { gs = s; gBest = [...p.x]; }
        if (used >= maxEval) break;
      }
      for (const p of P) for (let d = 0; d < D; d++) {
        p.v[d] = 0.72 * p.v[d] + 1.49 * rnd() * ((p.best ? p.best[d] : p.x[d]) - p.x[d]) + 1.49 * rnd() * ((gBest ? gBest[d] : p.x[d]) - p.x[d]);
        p.x[d] = Math.max(0, Math.min(sizes[d] - 1, p.x[d] + p.v[d]));
        if (rnd() < 0.05) p.x[d] = rnd() * (sizes[d] - 1);                      // a little random restart keeps the swarm from stalling
      }
    }
  }
  return [...seen.values()];
}

/**
 * Optimization. engine: 'exhaustive' (every combination, up to maxCombos) or 'smart' (particle swarm, maxEval tests per run).
 * A formula can choose with OptimizerSetEngine("spso"|"trib"|"cmae") and OptimizerSetOption("MaxEval"|"Runs", n).
 */
export async function optimize({ code, symbols, session, range, from, to, params, overrides, settings = null, metric = 'carMdd', engine = 'exhaustive', maxEval = 500, runs: nRuns = 3, maxCombos = 3000, onProgress, cancel }) {
  const probeRuns = await runAll({ code, symbols: symbols.slice(0, 1), session, params });
  const optParams = probeRuns[0] ? probeRuns[0].res.optParams : [];
  if (!optParams.length) return { rows: [], optParams, errors: ['This formula has no Optimize() calls. Use Optimize("name", default, min, max, step) in place of a fixed number.'] };
  const fo = probeRuns[0].res.options;
  if (fo.optimizerengine) engine = ['spso', 'trib', 'cmae'].includes(fo.optimizerengine) ? 'smart' : 'exhaustive';
  if (Number.isFinite(fo.optimizer_maxeval) && fo.optimizer_maxeval > 0) maxEval = fo.optimizer_maxeval;
  if (Number.isFinite(fo.optimizer_runs) && fo.optimizer_runs > 0) nRuns = fo.optimizer_runs;
  const dir = (METRICS[metric] || METRICS.carMdd)[1], rows = [];
  const evalCombo = async (vals) => {
    const sub = await backtest({ code, symbols, session, range, from, to, params, optValues: vals, overrides, settings });
    if (!sub.stats) return null;
    rows.push({ values: vals, stats: sub.stats }); return dir * sub.stats[metric];
  };
  if (engine === 'smart') {
    await smartSearch(optParams, evalCombo, { maxEval, runs: nRuns, cancel, onProgress });
  } else {
    const combos = paramGrid(optParams);
    if (combos.length > maxCombos) return { rows: [], optParams, errors: [`${combos.length} combinations is more than the limit of ${maxCombos}. Narrow the min/max, enlarge the step, or use the smart search (OptimizerSetEngine("spso")).`] };
    for (let i = 0; i < combos.length; i++) {
      if (cancel && cancel.stop) break;
      if (onProgress) { onProgress(i, combos.length, JSON.stringify(combos[i])); await tick(); }
      await evalCombo(combos[i]);
    }
    if (onProgress) onProgress(combos.length, combos.length, '');
  }
  rows.sort((x, y) => dir * (y.stats[metric] - x.stats[metric]));
  return { rows, optParams, errors: rows.length ? [] : ['No combination produced trades'], engine, tested: rows.length, metric };
}

// ------------------------------------------------------------------ Walk-Forward
const addSpan = (d, n, unit) => { const t = new Date(d + 'T00:00:00Z'); if (unit === 'years') t.setUTCFullYear(t.getUTCFullYear() + n); else if (unit === 'months') t.setUTCMonth(t.getUTCMonth() + n); else t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };
const prevDay = (d) => addSpan(d, -1, 'days');

/** The in-sample / out-of-sample periods of a walk-forward test (AmiBroker "easy mode": OOS follows IS, step = OOS length). */
export function walkSegments({ start, last, isLength, isUnit, oosLength, oosUnit, anchored }) {
  const segs = []; let isStart = start, isEnd = prevDay(addSpan(start, isLength, isUnit));
  for (let guard = 0; guard < 500; guard++) {
    const oosStart = addSpan(isEnd, 1, 'days'); if (oosStart > last) break;
    let oosEnd = prevDay(addSpan(oosStart, oosLength, oosUnit)); if (oosEnd > last) oosEnd = last;
    segs.push({ isFrom: isStart, isTo: isEnd, oosFrom: oosStart, oosTo: oosEnd });
    if (oosEnd >= last) break;
    isEnd = oosEnd; if (!anchored) isStart = addSpan(isStart, oosLength, oosUnit);
  }
  return segs;
}

/**
 * Walk-forward: optimise on each in-sample period, then test the best values on the following out-of-sample period.
 * Every OOS period starts with the equity the previous one ended with. Returns the steps and the combined OOS result.
 */
export async function walkForward({ code, symbols, session, params, overrides = {}, settings = null, wf, metric = 'carMdd', engine = 'exhaustive', maxEval = 300, maxCombos = 600, onProgress, cancel }) {
  const errors = [];
  let minD = '9999', maxD = '0000';
  for (const s of symbols) { const b = await session.get(s); if (b) { if (b.t[0] < minD) minD = b.t[0]; if (b.t[b.t.length - 1] > maxD) maxD = b.t[b.t.length - 1]; } }
  if (minD === '9999') return { steps: [], errors: ['No data'] };
  const segs = walkSegments({ start: wf.start || minD, last: wf.last || maxD, isLength: wf.isLength, isUnit: wf.isUnit, oosLength: wf.oosLength, oosUnit: wf.oosUnit, anchored: wf.anchored });
  if (!segs.length) return { steps: [], errors: ['The in-sample period is longer than the data. Shorten it or check the dates.'] };
  const probe = await runAll({ code, symbols: symbols.slice(0, 1), session, params });
  const optParams = probe[0] ? probe[0].res.optParams : [];
  if (!optParams.length) return { steps: [], errors: ['This formula has no Optimize() calls, so there is nothing to walk forward.'] };
  const dir = (METRICS[metric] || METRICS.carMdd)[1];
  const combos = engine === 'smart' ? null : paramGrid(optParams);
  if (combos && combos.length > maxCombos) return { steps: [], errors: [`${combos.length} combinations x ${segs.length} periods is too many. Narrow the ranges (limit ${maxCombos} combinations) or use the smart search.`] };
  const rng = (s) => ({ range: { mode: 'dates', from: s.isFrom, to: s.isTo } });
  const best = segs.map(() => ({ score: -Infinity, values: null, stats: null }));
  const consider = (k, vals, stats) => { const sc = dir * stats[metric]; if (Number.isFinite(sc) && sc > best[k].score) best[k] = { score: sc, values: vals, stats }; };
  if (combos) {
    // every combination is run once on the full history; each in-sample period then only slices it
    for (let c = 0; c < combos.length; c++) {
      if (cancel && cancel.stop) break;
      if (onProgress) { onProgress(c, combos.length, JSON.stringify(combos[c])); await tick(); }
      const runs = await runAll({ code, symbols, session, params, optValues: combos[c], errors });
      if (!runs.length) continue;
      segs.forEach((s, k) => { const sim = simulate(runs, { ...rng(s), overrides, settings }); if (sim && sim.stats) consider(k, combos[c], sim.stats); });
    }
  } else {
    for (let k = 0; k < segs.length; k++) {
      if (cancel && cancel.stop) break;
      await smartSearch(optParams, async (vals) => { const b = await backtest({ code, symbols, session, ...rng(segs[k]), params, optValues: vals, overrides, settings }); if (!b.stats) return null; consider(k, vals, b.stats); return dir * b.stats[metric]; },
        { maxEval, runs: 1, cancel, onProgress: (i, n, s) => onProgress && onProgress(k * maxEval + i, segs.length * maxEval, `period ${k + 1}: ${s}`) });
    }
  }
  // out-of-sample runs, chained
  const steps = [], allTrades = [], curve = []; let equity = (overrides.initialEquity !== undefined ? overrides.initialEquity : (settings ? settings.general.initialEquity : 100000)), firstEq = equity;
  for (let k = 0; k < segs.length; k++) {
    if (cancel && cancel.stop) break;
    const b = best[k]; if (!b.values) { steps.push({ ...segs[k], values: null, error: 'no trades in the in-sample period' }); continue; }
    const oos = await backtest({ code, symbols, session, range: { mode: 'dates', from: segs[k].oosFrom, to: segs[k].oosTo }, params, optValues: b.values, overrides: { ...overrides, initialEquity: equity }, settings });
    if (!oos.stats) { steps.push({ ...segs[k], values: b.values, isStats: b.stats, error: 'no data in the out-of-sample period' }); continue; }
    steps.push({ step: k + 1, ...segs[k], values: b.values, isStats: b.stats, oosStats: oos.stats, startEquity: equity, endEquity: oos.stats.endingCapital });
    allTrades.push(...oos.trades); curve.push(...oos.equityCurve); equity = oos.stats.endingCapital;
  }
  const opt = optionsFromResult(probe[0].res, { ...overrides, initialEquity: firstEq }, settingsToOptions(settings || defaultSettings()));
  const stats = curve.length ? computeStats(allTrades, curve, opt) : null;
  return { steps, optParams, trades: allTrades, equityCurve: curve, stats, errors, metric, segments: segs.length };
}

// ------------------------------------------------------------------ market breadth (advancing / declining issues per day)
export async function buildBreadth({ symbols, session, onProgress, cancel }) {
  const days = new Map();
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
