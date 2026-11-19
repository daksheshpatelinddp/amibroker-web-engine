// Backtest report maths, no DOM: the statistics of AmiBroker's report (All / Long / Short), monthly returns,
// profit distribution, Monte Carlo simulation. Definitions follow AmiBroker's "Reading backtest report" page.

const sum = (a, f = (x) => x) => a.reduce((s, x) => s + f(x), 0);
const avg = (a) => (a.length ? sum(a) / a.length : 0);
const dayMs = 86400000;
const yearsBetween = (d0, d1) => (d0 && d1 ? Math.max(0, (Date.parse(d1) - Date.parse(d0)) / (365.25 * dayMs)) : 0);

/** Trade-based statistics for a list of trades (all, only longs, or only shorts). */
export function tradeStats(trs) {
  const wins = trs.filter((t) => t.profit > 0), loss = trs.filter((t) => t.profit <= 0);
  const gp = sum(wins, (t) => t.profit), gl = -sum(loss, (t) => t.profit);
  const streak = (fn) => { let best = 0, cur = 0; for (const t of trs) { if (fn(t)) { cur++; if (cur > best) best = cur; } else cur = 0; } return best; };
  const net = sum(trs, (t) => t.profit);
  let mtd = 0, mtdPct = 0;
  for (const t of trs) { const p = Math.max(0, -(t.mae || 0)); if (p > mtdPct) mtdPct = p; const d = p / 100 * (t.entryPrice || 0) * (t.shares || 0); if (d > mtd) mtd = d; }
  const avgWin = avg(wins.map((t) => t.profit)), avgLoss = avg(loss.map((t) => t.profit));
  return {
    trades: trs.length, winners: wins.length, losers: loss.length, winPct: trs.length ? 100 * wins.length / trs.length : 0, lossPct: trs.length ? 100 * loss.length / trs.length : 0,
    netProfit: net, grossProfit: gp, grossLoss: -gl, profitFactor: gl > 0 ? gp / gl : (gp > 0 ? Infinity : 0),
    avgProfit: trs.length ? net / trs.length : 0, avgProfitPct: avg(trs.map((t) => t.pctProfit)),
    avgWin: avgWin, avgLoss: avgLoss, avgWinPct: avg(wins.map((t) => t.pctProfit)), avgLossPct: avg(loss.map((t) => t.pctProfit)),
    largestWin: wins.length ? Math.max(...wins.map((t) => t.profit)) : 0, largestLoss: loss.length ? Math.min(...loss.map((t) => t.profit)) : 0,
    payoffRatio: avgLoss !== 0 ? Math.abs(avgWin / avgLoss) : (avgWin > 0 ? Infinity : 0),
    avgBars: avg(trs.map((t) => t.bars)), avgBarsWin: avg(wins.map((t) => t.bars)), avgBarsLoss: avg(loss.map((t) => t.bars)),
    maxConsecWins: streak((t) => t.profit > 0), maxConsecLosses: streak((t) => t.profit <= 0),
    maxTradeDrawdown: mtd, maxTradeDrawdownPct: mtdPct, commissionPaid: sum(trs, (t) => t.commission || 0),
  };
}

/** Linear regression of y on 0..n-1 */
function regress(y) {
  const n = y.length; if (n < 3) return { slope: 0, intercept: y[0] || 0, stdErr: 0, sxx: 0 };
  const mx = (n - 1) / 2, my = avg(y); let sxy = 0, sxx = 0;
  for (let i = 0; i < n; i++) { sxy += (i - mx) * (y[i] - my); sxx += (i - mx) ** 2; }
  const slope = sxy / sxx, intercept = my - slope * mx; let ss = 0;
  for (let i = 0; i < n; i++) ss += (y[i] - (intercept + slope * i)) ** 2;
  return { slope, intercept, stdErr: Math.sqrt(ss / (n - 2)), sxx };
}

/** The complete report numbers. `curve` = [{t,equity,exposure}] */
export function computeStats(trades, curve, opt) {
  const all = tradeStats(trades), longT = trades.filter((t) => t.trade === 'Long'), shortT = trades.filter((t) => t.trade === 'Short');
  const L = tradeStats(longT), S = tradeStats(shortT);
  const eq = curve.map((c) => c.equity), n = eq.length, init = opt.initialEquity, end = n ? eq[n - 1] : init;
  const years = n > 1 ? yearsBetween(curve[0].t, curve[n - 1].t) : 0;
  const netProfit = end - init, netProfitPct = init ? (end / init - 1) * 100 : 0;
  let peak = -Infinity, maxDD = 0, maxDDPct = 0, sq = 0;
  for (const v of eq) { if (v > peak) peak = v; const dd = peak - v, p = peak > 0 ? dd / peak * 100 : 0; if (dd > maxDD) maxDD = dd; if (p > maxDDPct) maxDDPct = p; sq += p * p; }
  const cagr = years > 0 && end > 0 && init > 0 ? (Math.pow(end / init, 1 / years) - 1) * 100 : 0;
  const exposure = n ? avg(curve.map((c) => c.exposure || 0)) : 0;
  const rets = []; for (let i = 1; i < n; i++) if (eq[i - 1] > 0) rets.push(eq[i] / eq[i - 1] - 1);
  const mean = avg(rets), sd = rets.length > 1 ? Math.sqrt(sum(rets, (x) => (x - mean) ** 2) / (rets.length - 1)) : 0;
  const down = rets.length ? Math.sqrt(sum(rets.filter((x) => x < 0), (x) => x * x) / rets.length) : 0;
  const perYear = years > 0 ? n / years : 252;
  const rf = opt.riskFree === undefined ? 5 : opt.riskFree;
  // Sharpe ratio of trades (AmiBroker's definition): annualise mean and st.dev of trade % returns by barsPerYear / avgBarsPerTrade
  let sharpeTrades = 0;
  if (trades.length > 1 && all.avgBars > 0) {
    const pr = trades.map((t) => t.pctProfit), m = avg(pr), s = Math.sqrt(sum(pr, (x) => (x - m) ** 2) / (pr.length - 1)), k = perYear / all.avgBars;
    sharpeTrades = s > 0 ? (m * k - rf) / (s * k) : 0;
  }
  const reg = regress(eq), ulcer = n ? Math.sqrt(sq / n) : 0;
  const upi = ulcer > 0 ? (cagr - rf) / ulcer : 0;
  const stdErr = reg.stdErr, slopeYear = reg.slope * perYear;
  return {
    ...all, long: L, short: S, all,
    initialCapital: init, endingCapital: end, netProfit, netProfitPct, exposure,
    netRiskAdjPct: exposure > 0 ? netProfitPct / exposure * 100 : 0,
    cagr, annualReturnPct: cagr, riskAdjReturn: exposure > 0 ? cagr / exposure * 100 : 0,
    maxDrawdown: maxDD, maxDrawdownPct: maxDDPct, maxSystemDrawdown: maxDD, maxSystemDrawdownPct: maxDDPct,
    recoveryFactor: maxDD > 0 ? netProfit / maxDD : 0, carMdd: maxDDPct > 0 ? cagr / maxDDPct : 0,
    rarMdd: maxDDPct > 0 && exposure > 0 ? (cagr / exposure * 100) / maxDDPct : 0,
    riskAdjReturnPct: maxDDPct > 0 ? netProfitPct / maxDDPct : 0,
    sharpe: sd > 0 ? mean / sd * Math.sqrt(perYear) : 0, sortino: down > 0 ? mean / down * Math.sqrt(perYear) : 0,
    sharpeTrades, ulcer, ulcerIndex: ulcer, ulcerPerformance: upi, stdError: stdErr,
    riskRewardRatio: stdErr > 0 ? slopeYear / stdErr : 0, kRatio: stdErr > 0 && n > 2 ? reg.slope * Math.sqrt(reg.sxx) / (stdErr * Math.sqrt(n)) : 0,
    openTrades: trades.filter((t) => t.open).length, years, barsInTest: n,
  };
}

/** The statistics table of the report: [label, all, long, short, kind] (kind: money | pct | num | int | text) */
export function statRows(s) {
  const L = s.long, S = s.short, A = s.all;
  const r = (label, key, kind, onlyAll = false) => [label, s[key] !== undefined && onlyAll ? s[key] : A[key], onlyAll ? undefined : L[key], onlyAll ? undefined : S[key], kind];
  const o = (label, v, kind) => [label, v, undefined, undefined, kind];
  return [
    o('Initial capital', s.initialCapital, 'money'), o('Ending capital', s.endingCapital, 'money'), o('Net profit', s.netProfit, 'money'), o('Net profit %', s.netProfitPct, 'pct'),
    o('Exposure %', s.exposure, 'pct'), o('Net risk adjusted return %', s.netRiskAdjPct, 'pct'), o('Annual return % (CAR)', s.annualReturnPct, 'pct'), o('Risk adjusted return %', s.riskAdjReturn, 'pct'),
    r('Total trades', 'trades', 'int'), r('Avg. profit/loss', 'avgProfit', 'money'), r('Avg. profit/loss %', 'avgProfitPct', 'pct'), r('Avg. bars held', 'avgBars', 'num'),
    r('Winners', 'winners', 'int'), r('Win rate %', 'winPct', 'pct'), r('Total profit', 'grossProfit', 'money'), r('Avg. profit', 'avgWin', 'money'), r('Avg. profit %', 'avgWinPct', 'pct'),
    r('Avg. bars held (winners)', 'avgBarsWin', 'num'), r('Max. consecutive winners', 'maxConsecWins', 'int'), r('Largest winning trade', 'largestWin', 'money'),
    r('Losers', 'losers', 'int'), r('Loss rate %', 'lossPct', 'pct'), r('Total loss', 'grossLoss', 'money'), r('Avg. loss', 'avgLoss', 'money'), r('Avg. loss %', 'avgLossPct', 'pct'),
    r('Avg. bars held (losers)', 'avgBarsLoss', 'num'), r('Max. consecutive losers', 'maxConsecLosses', 'int'), r('Largest losing trade', 'largestLoss', 'money'),
    r('Max. trade drawdown', 'maxTradeDrawdown', 'money'), r('Max. trade % drawdown', 'maxTradeDrawdownPct', 'pct'),
    o('Max. system drawdown', s.maxSystemDrawdown, 'money'), o('Max. system % drawdown', s.maxSystemDrawdownPct, 'pct'),
    o('Recovery factor', s.recoveryFactor, 'num'), o('CAR/MaxDD', s.carMdd, 'num'), o('RAR/MaxDD', s.rarMdd, 'num'),
    r('Profit factor', 'profitFactor', 'num'), r('Payoff ratio', 'payoffRatio', 'num'),
    o('Standard error', s.stdError, 'num'), o('Risk-reward ratio', s.riskRewardRatio, 'num'), o('Ulcer index', s.ulcerIndex, 'num'), o('Ulcer performance index', s.ulcerPerformance, 'num'),
    o('Sharpe ratio of trades', s.sharpeTrades, 'num'), o('K-ratio', s.kRatio, 'num'), o('Sharpe ratio (daily returns)', s.sharpe, 'num'), o('Sortino ratio', s.sortino, 'num'),
    r('Commission paid', 'commissionPaid', 'money'),
  ];
}

/** Monthly returns from the equity curve: [{year, months:[12 x %|null], total}] */
export function monthlyReturns(curve, initial) {
  const byYm = new Map(); let lastEq = initial;
  for (const c of curve) { const ym = String(c.t).slice(0, 7); const rec = byYm.get(ym) || { start: lastEq, end: c.equity }; rec.end = c.equity; byYm.set(ym, rec); lastEq = c.equity; }
  const years = new Map();
  for (const [ym, r] of byYm) { const y = Number(ym.slice(0, 4)), m = Number(ym.slice(5, 7)) - 1; if (!years.has(y)) years.set(y, { year: y, months: Array(12).fill(null), start: r.start, end: r.end }); const row = years.get(y); row.months[m] = r.start > 0 ? (r.end / r.start - 1) * 100 : null; row.end = r.end; }
  return [...years.values()].sort((a, b) => a.year - b.year).map((r) => ({ year: r.year, months: r.months, total: r.start > 0 ? (r.end / r.start - 1) * 100 : null }));
}

/** Histogram of a list of numbers with a fixed bin width. */
export function histogram(values, width) {
  const v = values.filter(Number.isFinite); if (!v.length) return { bins: [], width };
  let w = width > 0 ? width : 1; const lo = Math.min(...v), hi = Math.max(...v);
  while ((hi - lo) / w > 60) w *= 2;
  const first = Math.floor(lo / w), last = Math.floor(hi / w), bins = [];
  for (let k = first; k <= last; k++) bins.push({ from: k * w, to: (k + 1) * w, count: 0 });
  for (const x of v) bins[Math.min(bins.length - 1, Math.floor(x / w) - first)].count++;
  return { bins, width: w };
}

// ------------------------------------------------------------------ Monte Carlo
function rng(seed) { let a = seed >>> 0; return () => { a += 0x6D2B79F5; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
export const MC_PCTS = [1, 5, 10, 25, 50, 75, 90, 95, 99];

/**
 * Bootstrap Monte Carlo (AmiBroker "Monte Carlo simulation"): resample the trades (or the bar-by-bar equity changes) with replacement.
 *  mode: 'trades' | 'equity';  posMethod: 'keep' (original profit $) | 'value' (constant $ per trade) | 'pct' (% of current equity, compounding)
 */
export function monteCarlo({ trades, curve, initialEquity, runs = 1000, mode = 'trades', posMethod = 'keep', posValue = 0, posPct = 10, seed = 12345, strawLines = 30, years = 0 }) {
  const R = rng(seed); let N, pick;
  if (mode === 'equity') { const r = []; for (let i = 1; i < curve.length; i++) if (curve[i - 1].equity > 0) r.push(curve[i].equity / curve[i - 1].equity); N = r.length; pick = (eq, k, rnd) => eq * r[Math.floor(rnd() * N)]; }
  else {
    const T = trades.filter((t) => !t.open || true); N = T.length;
    pick = (eq, k, rnd) => { const t = T[Math.floor(rnd() * N)]; const pct = t.pctProfit / 100; if (posMethod === 'value') return eq + (posValue || initialEquity * 0.1) * pct; if (posMethod === 'pct') return eq * (1 + posPct / 100 * pct); return eq + t.profit; };
  }
  if (!N) return null;
  const finals = [], cars = [], mdd = [], mddPct = [], lows = [], mins = new Float64Array(N + 1).fill(Infinity), maxs = new Float64Array(N + 1).fill(-Infinity), sums = new Float64Array(N + 1), straw = [];
  const yrs = years > 0 ? years : 1;
  for (let run = 0; run < runs; run++) {
    let eq = initialEquity, peak = eq, dd = 0, ddp = 0, low = eq; const path = new Float64Array(N + 1); path[0] = eq;
    for (let k = 0; k < N; k++) {
      eq = pick(eq, k, R); path[k + 1] = eq; if (eq > peak) peak = eq; const d = peak - eq; if (d > dd) dd = d; const dp = peak > 0 ? d / peak * 100 : 0; if (dp > ddp) ddp = dp; if (eq < low) low = eq;
    }
    finals.push(eq); lows.push(low); mdd.push(dd); mddPct.push(ddp); cars.push(eq > 0 && initialEquity > 0 ? (Math.pow(eq / initialEquity, 1 / yrs) - 1) * 100 : -100);
    for (let k = 0; k <= N; k++) { const v = path[k]; if (v < mins[k]) mins[k] = v; if (v > maxs[k]) maxs[k] = v; sums[k] += v; }
    if (straw.length < strawLines) straw.push(path);
  }
  const pct = (arr, p) => { const s = [...arr].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.max(0, Math.floor(p / 100 * (s.length - 1))))]; };
  const percentiles = MC_PCTS.map((p) => ({ p, finalEquity: pct(finals, p), car: pct(cars, p), maxDrawdown: pct(mdd, p), maxDrawdownPct: pct(mddPct, p), lowestEquity: pct(lows, p) }));
  const step = Math.max(1, Math.ceil((N + 1) / 300)), ds = (a) => { const o = []; for (let k = 0; k <= N; k += step) o.push(a[k]); if ((N) % step) o.push(a[N]); return o; };
  return { runs, steps: N, percentiles, curves: { min: ds(mins), max: ds(maxs), avg: ds(Array.from(sums, (x) => x / runs)), straw: straw.map(ds) },
    cdf: { finalEquity: [...finals].sort((a, b) => a - b), maxDrawdownPct: [...mddPct].sort((a, b) => a - b) } };
}
