// Back-testing core. Pure functions (no DOM, no AFL): turns Buy/Sell/Short/Cover signals into trades,
// sizes them in a portfolio and reports the statistics.  Follows AmiBroker's two-pass design:
//   pass 1 (per symbol)  -> rawTrades(): honour trade delays, prices, stops; remove redundant signals
//   pass 2 (portfolio)   -> portfolio(): rank by PositionScore, apply MaxOpenPositions, position size, cash, commission
//   rotational mode      -> rotational(): rebalance every bar by PositionScore

const truthy = (x) => x !== 0 && x !== undefined && !Number.isNaN(x);
const at = (arr, i, d) => (arr && typeof arr === 'object' ? arr[i] : (arr === undefined ? d : arr));

export const DEFAULT_OPTIONS = {
  initialEquity: 100000, maxOpenPositions: 10, commissionMode: 0, commissionAmount: 0, allowSameBarExit: 1,
  allowPositionShrinking: 0, activateStopsImmediately: 0, priceBounds: 1, minShares: 1, roundLotSize: 0,
  worstRankHeld: 0, reverseEntrySignalForce: 0, holdMinBars: 0, interestRate: 0, marginRequirement: 100,
  tradeDelays: [0, 0, 0, 0], positionSize: { size: 100, type: 2 }, mode: 0,
};

/** Merge the SetOption()/SetTradeDelays()/SetPositionSize() calls recorded by the AFL engine into a full option set. */
export function optionsFromResult(res, overrides = {}) {
  const o = { ...DEFAULT_OPTIONS, tradeDelays: [...DEFAULT_OPTIONS.tradeDelays], positionSize: { ...DEFAULT_OPTIONS.positionSize } };
  const map = { initialequity: 'initialEquity', maxopenpositions: 'maxOpenPositions', commissionmode: 'commissionMode',
    commissionamount: 'commissionAmount', allowsamebarexit: 'allowSameBarExit', allowpositionshrinking: 'allowPositionShrinking',
    activatestopsimmediately: 'activateStopsImmediately', pricebounds: 'priceBounds', minshares: 'minShares', roundlotsize: 'roundLotSize',
    worstrankheld: 'worstRankHeld', reverseentrysignalforce: 'reverseEntrySignalForce', holdminbars: 'holdMinBars',
    interestrate: 'interestRate', marginrequirement: 'marginRequirement' };
  const r = (res && res.options) || {};
  for (const [k, v] of Object.entries(r)) if (map[k] && Number.isFinite(Number(v))) o[map[k]] = Number(v);
  if (Array.isArray(r.tradedelays)) for (let i = 0; i < 4; i++) if (Number.isFinite(r.tradedelays[i])) o.tradeDelays[i] = r.tradedelays[i];
  if (r.positionsizeset) o.positionSize = { ...r.positionsizeset };
  if (Number.isFinite(r.backtestmode)) o.mode = r.backtestmode;
  return { ...o, ...overrides };
}

/**
 * Pass 1. bars: {t,o,h,l,c}; sig: {buy,sell,short,cover (arrays|null), buyPrice,... (array|scalar|undefined), stops:[...]}
 * Returns raw trades [{dir:1|-1, ei, xi, ep, xp, reason}]. An open trade at the end is closed on the last bar (flag open:true).
 */
export function rawTrades(bars, sig, opt = DEFAULT_OPTIONS) {
  const n = bars.t.length, trades = [];
  const [dB, dS, dSh, dC] = opt.tradeDelays;
  const sg = (arr, i) => (arr && i >= 0 && i < n ? truthy(arr[i]) : false);
  const price = (arr, i, d) => {
    let p = at(arr, i, undefined);
    if (p === undefined || Number.isNaN(p)) p = d;
    if (opt.priceBounds) p = Math.min(bars.h[i], Math.max(bars.l[i], p));
    return p;
  };
  const stops = sig.stops || [];
  let pos = null;
  for (let i = 0; i < n; i++) {
    if (!(bars.c[i] > 0)) continue;
    // ---- stops (active from the bar after entry unless ActivateStopsImmediately)
    if (pos && (i > pos.ei || opt.activateStopsImmediately)) {
      const dir = pos.dir;
      pos.hi = Math.max(pos.hi, bars.h[i]); pos.lo = Math.min(pos.lo, bars.l[i]);
      for (const s of stops) {
        const amt = at(s.amountArr || s.amount, i, s.amount);
        if (!(s.mode > 0 || s.type === 3)) continue;
        let level = NaN, hit = false;
        if (s.type === 3) {                                  // N-bar stop: exit at close after N bars
          if (i - pos.ei >= amt) { pos.exit = { i, p: bars.c[i], why: 'nbar' }; }
        } else {
          const pct = s.mode === 1 || s.mode === 3, base = s.type === 2 ? (dir > 0 ? pos.hi : pos.lo) : pos.ep;
          const off = pct ? base * amt / 100 : amt;
          if (s.type === 0) level = dir > 0 ? pos.ep - (pct ? pos.ep * amt / 100 : amt) : pos.ep + (pct ? pos.ep * amt / 100 : amt);
          else if (s.type === 1) level = dir > 0 ? pos.ep + (pct ? pos.ep * amt / 100 : amt) : pos.ep - (pct ? pos.ep * amt / 100 : amt);
          else level = dir > 0 ? base - off : base + off;
          if (s.type === 1) hit = dir > 0 ? bars.h[i] >= level : bars.l[i] <= level;
          else hit = dir > 0 ? bars.l[i] <= level : bars.h[i] >= level;
          if (hit && !pos.exit) {
            let p = level;
            if (s.exitAtStop === 0 || s.exitAtStop === undefined) p = bars.c[i];               // exit at the usual exit price of that bar
            else if (s.type !== 1) p = dir > 0 ? Math.min(level, bars.o[i]) : Math.max(level, bars.o[i]); // gap beyond the stop: open price
            pos.exit = { i, p, why: ['loss', 'profit', 'trail'][s.type] };
          }
        }
      }
      if (pos.exit) { trades.push({ dir, ei: pos.ei, xi: pos.exit.i, ep: pos.ep, xp: pos.exit.p, reason: pos.exit.why, hi: pos.hi, lo: pos.lo }); pos = null; }
    }
    // ---- exits by signal
    if (pos && i - pos.ei >= (opt.holdMinBars || 0)) {
      const ex = pos.dir > 0 ? sg(sig.sell, i - dS) : sg(sig.cover, i - dC);
      if (ex) {
        const p = pos.dir > 0 ? price(sig.sellPrice, i, bars.c[i]) : price(sig.coverPrice, i, bars.c[i]);
        trades.push({ dir: pos.dir, ei: pos.ei, xi: i, ep: pos.ep, xp: p, reason: 'signal', hi: pos.hi, lo: pos.lo }); pos = null;
      }
    }
    // ---- entries
    if (!pos) {
      const lg = sg(sig.buy, i - dB), sh = sg(sig.short, i - dSh);
      let dir = 0; if (lg) dir = 1; else if (sh) dir = -1;
      if (dir) {
        const p = dir > 0 ? price(sig.buyPrice, i, bars.c[i]) : price(sig.shortPrice, i, bars.c[i]);
        pos = { dir, ei: i, ep: p, hi: Math.max(bars.h[i], p), lo: Math.min(bars.l[i], p), sigBar: dir > 0 ? i - dB : i - dSh };
        if (opt.allowSameBarExit && (dir > 0 ? sg(sig.sell, i - dS) : sg(sig.cover, i - dC))) {
          const xp = dir > 0 ? price(sig.sellPrice, i, bars.c[i]) : price(sig.coverPrice, i, bars.c[i]);
          trades.push({ dir, ei: i, xi: i, ep: p, xp, reason: 'signal', hi: pos.hi, lo: pos.lo, sigBar: pos.sigBar }); pos = null;
        }
      }
    } else if (pos && opt.reverseEntrySignalForce) {
      const rev = pos.dir > 0 ? sg(sig.short, i - dSh) : sg(sig.buy, i - dB);
      if (rev) {
        const p = bars.c[i];
        trades.push({ dir: pos.dir, ei: pos.ei, xi: i, ep: pos.ep, xp: p, reason: 'reverse', hi: pos.hi, lo: pos.lo });
        const nd = -pos.dir; pos = { dir: nd, ei: i, ep: p, hi: p, lo: p, sigBar: i };
      }
    }
    if (pos && pos.sigBar === undefined) pos.sigBar = i;
    if (pos && pos.entryTagged !== true) { pos.entryTagged = true; pos.sb = pos.sigBar; }
  }
  if (pos) trades.push({ dir: pos.dir, ei: pos.ei, xi: n - 1, ep: pos.ep, xp: bars.c[n - 1], reason: 'open', open: true, hi: pos.hi, lo: pos.lo });
  // remember where the entry signal was, so PositionScore / PositionSize can be read from that bar
  for (const t of trades) t.sigBar = Math.max(0, t.ei - (t.dir > 0 ? opt.tradeDelays[0] : opt.tradeDelays[2]));
  return trades;
}

/** Single-security equity curve (AFL Equity(1)): all-in, long or short, compounding. */
export function singleEquity(bars, sig, opt = DEFAULT_OPTIONS) {
  const n = bars.t.length, eq = new Float64Array(n);
  let cash = opt.initialEquity; const tr = rawTrades(bars, sig, opt);
  let k = 0, cur = null;
  for (let i = 0; i < n; i++) {
    while (k < tr.length && tr[k].ei === i && !cur) { cur = { ...tr[k], sh: cash / tr[k].ep }; k++; }
    if (cur && cur.xi === i) { cash += cur.dir * cur.sh * (cur.xp - cur.ep); cur = null; }
    eq[i] = cash + (cur ? cur.dir * cur.sh * (bars.c[i] - cur.ep) : 0);
    // a trade that closes on its entry bar was consumed above
    while (k < tr.length && tr[k].ei === i && !cur && tr[k].xi === i) { cash += tr[k].dir * (cash / tr[k].ep) * (tr[k].xp - tr[k].ep); k++; }
  }
  return { equity: eq, trades: tr };
}

const commission = (opt, value, shares) => {
  const a = opt.commissionAmount || 0;
  if (opt.commissionMode === 1) return Math.abs(value) * a / 100;
  if (opt.commissionMode === 2) return a;
  if (opt.commissionMode === 3) return Math.abs(shares) * a;
  return 0;
};

/**
 * Pass 2. universe: [{ symbol, bars, trades, score(arr|undefined), size(arr|undefined) }]
 * Returns { trades, equityCurve:[{t,equity,cash,exposure}], stats }.
 */
export function portfolio(universe, opt = DEFAULT_OPTIONS, benchmark = null) {
  const dates = [...new Set(universe.flatMap((u) => u.bars.t))].sort();
  const idxMap = universe.map((u) => new Map(u.bars.t.map((d, i) => [d, i])));
  let cash = opt.initialEquity;
  const open = [], done = [], curve = [];
  const entriesByDate = new Map();
  universe.forEach((u, ui) => {
    for (const tr of u.trades) {
      const d = u.bars.t[tr.ei]; if (!entriesByDate.has(d)) entriesByDate.set(d, []);
      entriesByDate.get(d).push({ ui, tr, score: at(u.score, tr.sigBar, 0) });
    }
  });
  const px = (ui, d, f) => { const i = idxMap[ui].get(d); return i === undefined ? undefined : universe[ui].bars[f][i]; };
  const lastPx = (p, d) => { const i = idxMap[p.ui].get(d); if (i !== undefined) p.last = universe[p.ui].bars.c[i]; return p.last; };
  const round = (sh) => { if (opt.roundLotSize > 0) sh = Math.floor(sh / opt.roundLotSize) * opt.roundLotSize; else sh = Math.floor(sh); return sh; };

  for (const d of dates) {
    // exits that happen on this date (use the raw trade's own exit bar)
    for (let k = open.length - 1; k >= 0; k--) {
      const p = open[k], xd = universe[p.ui].bars.t[p.tr.xi];
      if (xd === d && !(p.tr.open)) {
        const c = commission(opt, p.sh * p.tr.xp, p.sh);
        cash += p.dir * p.sh * p.tr.xp - c;                    // long: sell proceeds, short: buy-back cost
        done.push(finish(p, universe, p.tr.xp, p.tr.xi, c));
        open.splice(k, 1);
      }
    }
    // entries on this date, best score first
    const cands = (entriesByDate.get(d) || []).sort((a, b) => b.score - a.score);
    for (const cd of cands) {
      if (open.length >= opt.maxOpenPositions) break;
      const u = universe[cd.ui], tr = cd.tr;
      let eq = cash; for (const p of open) eq += p.dir * p.sh * (lastPx(p, d) ?? p.ep);   // equity = cash + signed position values
      let value, shares = 0;
      const sz = at(u.size, tr.sigBar, NaN);
      if (Number.isFinite(sz) && sz !== 0) value = sz > 0 ? sz : -sz / 100 * eq;
      else {
        const ps = opt.positionSize || { size: 100, type: 2 };
        value = ps.type === 1 ? ps.size : ps.type === 2 || ps.type === 3 ? ps.size / 100 * eq : NaN;
        if (ps.type === 4) shares = ps.size;
      }
      if (!shares) shares = round(value / tr.ep);
      if (shares < Math.max(1, opt.minShares || 1)) continue;
      let cost = shares * tr.ep;
      if (tr.dir > 0 && cost + commission(opt, cost, shares) > cash) {
        if (!opt.allowPositionShrinking) continue;
        shares = round((cash - commission(opt, cash, 0)) / tr.ep); if (shares < 1) continue; cost = shares * tr.ep;
      }
      const c = commission(opt, cost, shares);
      cash -= tr.dir * cost + c;                                // long pays, short receives the proceeds
      open.push({ ui: cd.ui, tr, dir: tr.dir, sh: shares, ep: tr.ep, ed: d, entryCommission: c, last: tr.ep });
      if (tr.xi === tr.ei) { // exited on the same bar
        const p = open.pop(), c2 = commission(opt, p.sh * tr.xp, p.sh);
        cash += p.dir * p.sh * tr.xp - c2;
        done.push(finish(p, universe, tr.xp, tr.xi, c2));
      }
    }
    // mark to market: equity = cash + signed value of all positions
    let eqv = cash, invested = 0;
    for (const p of open) { const l = lastPx(p, d) || p.ep; eqv += p.dir * p.sh * l; invested += p.sh * l; }
    curve.push({ t: d, equity: eqv, cash, exposure: eqv > 0 ? 100 * invested / eqv : 0, open: open.length });
  }
  // positions still open at the end are marked at the last close
  for (const p of open) done.push(finish(p, universe, p.last ?? p.ep, p.tr.xi, 0, true));
  return { trades: done.sort((a, b) => (a.entryDate < b.entryDate ? -1 : a.entryDate > b.entryDate ? 1 : 0)), equityCurve: curve, stats: stats(done, curve, opt, benchmark) };
}

function finish(p, universe, xp, xi, exitCommission, still = false) {
  const u = universe[p.ui], dir = p.dir, tr = p.tr;
  const gross = dir * p.sh * (xp - p.ep), cost = (p.entryCommission || 0) + (exitCommission || 0);
  const mae = dir > 0 ? (tr.lo - p.ep) / p.ep * 100 : (p.ep - tr.hi) / p.ep * 100;
  const mfe = dir > 0 ? (tr.hi - p.ep) / p.ep * 100 : (p.ep - tr.lo) / p.ep * 100;
  return {
    symbol: u.symbol, trade: dir > 0 ? 'Long' : 'Short', entryDate: u.bars.t[tr.ei], entryPrice: p.ep, exitDate: u.bars.t[Math.min(xi, u.bars.t.length - 1)],
    exitPrice: xp, shares: p.sh, profit: gross - cost, pctProfit: dir * (xp / p.ep - 1) * 100, bars: Math.max(0, xi - tr.ei), reason: tr.reason,
    mae, mfe, commission: cost, open: !!still,
  };
}

/** Rotational mode: every bar rank the symbols by PositionScore, hold the best MaxOpenPositions. */
export function rotational(universe, opt = DEFAULT_OPTIONS, benchmark = null) {
  const dates = [...new Set(universe.flatMap((u) => u.bars.t))].sort();
  const idxMap = universe.map((u) => new Map(u.bars.t.map((d, i) => [d, i])));
  const delay = opt.tradeDelays[0] || 0;
  let cash = opt.initialEquity; const open = [], done = [], curve = [];
  const maxPos = Math.max(1, opt.maxOpenPositions), worst = opt.worstRankHeld > 0 ? opt.worstRankHeld : maxPos;
  const priceOf = (ui, d) => { const i = idxMap[ui].get(d); return i === undefined ? undefined : i; };
  for (let di = 0; di < dates.length; di++) {
    const d = dates[di];
    // rank, using the score from `delay` bars ago
    const ranked = [];
    universe.forEach((u, ui) => {
      const i = priceOf(ui, d); if (i === undefined) return;
      const s = at(u.score, Math.max(0, i - delay), NaN);
      if (Number.isFinite(s) && s > 0) ranked.push({ ui, s, i });
    });
    ranked.sort((a, b) => b.s - a.s);
    const rankOf = new Map(ranked.map((r, k) => [r.ui, k + 1]));
    // sell what dropped out
    for (let k = open.length - 1; k >= 0; k--) {
      const p = open[k], r = rankOf.get(p.ui), i = priceOf(p.ui, d);
      if (i === undefined) continue;
      if (r === undefined || r > worst) {
        const u = universe[p.ui], xp = at(u.sellPrice, i, u.bars.c[i]) ?? u.bars.c[i], c = commission(opt, p.sh * xp, p.sh);
        cash += p.sh * xp - c;
        done.push(finish({ ...p, tr: { ...p.tr, xi: i } }, universe, xp, i, c));
        open.splice(k, 1);
      }
    }
    // buy the best ones we do not hold
    for (const r of ranked) {
      if (open.length >= maxPos) break;
      if (open.some((p) => p.ui === r.ui)) continue;
      if (r.s <= 0) continue;
      const u = universe[r.ui], ep = at(u.buyPrice, r.i, u.bars.c[r.i]) ?? u.bars.c[r.i];
      let eq = cash; for (const p of open) { const i = priceOf(p.ui, d); eq += p.sh * (i === undefined ? p.ep : universe[p.ui].bars.c[i]); }
      const ps = opt.positionSize || { size: 100 / maxPos, type: 2 };
      const sz = at(u.size, r.i, NaN);
      let value = Number.isFinite(sz) && sz !== 0 ? (sz > 0 ? sz : -sz / 100 * eq) : (ps.type === 1 ? ps.size : ps.size / 100 * eq);
      let shares = ps.type === 4 && !Number.isFinite(sz) ? ps.size : Math.floor(value / ep);
      if (shares < 1) continue;
      let c = commission(opt, shares * ep, shares);
      if (shares * ep + c > cash) { if (!opt.allowPositionShrinking) continue; shares = Math.floor((cash - c) / ep); if (shares < 1) continue; c = commission(opt, shares * ep, shares); }
      cash -= shares * ep + c;
      open.push({ ui: r.ui, dir: 1, sh: shares, ep, ed: d, entryCommission: c, last: ep, tr: { dir: 1, ei: r.i, xi: r.i, ep, lo: ep, hi: ep, reason: 'rank' } });
    }
    let posVal = 0, inv = 0;
    for (const p of open) { const i = priceOf(p.ui, d); if (i !== undefined) { p.last = universe[p.ui].bars.c[i]; p.tr.hi = Math.max(p.tr.hi, universe[p.ui].bars.h[i]); p.tr.lo = Math.min(p.tr.lo, universe[p.ui].bars.l[i]); } posVal += p.sh * p.last; }
    const eqv = cash + posVal; inv = posVal;
    curve.push({ t: d, equity: eqv, cash, exposure: eqv > 0 ? 100 * inv / eqv : 0, open: open.length });
  }
  for (const p of open) done.push(finish({ ...p, tr: { ...p.tr, xi: universe[p.ui].bars.t.length - 1, open: true } }, universe, p.last, universe[p.ui].bars.t.length - 1, 0, true));
  return { trades: done, equityCurve: curve, stats: stats(done, curve, opt, benchmark) };
}

function stats(trades, curve, opt, benchmark) {
  const closed = trades.filter((t) => !t.open || true);
  const wins = closed.filter((t) => t.profit > 0), loss = closed.filter((t) => t.profit <= 0);
  const sum = (a, f) => a.reduce((s, x) => s + f(x), 0);
  const gp = sum(wins, (t) => t.profit), gl = -sum(loss, (t) => t.profit);
  const eq = curve.map((c) => c.equity), n = eq.length;
  const init = opt.initialEquity, end = n ? eq[n - 1] : init;
  let peak = -Infinity, maxDD = 0, maxDDPct = 0;
  for (const v of eq) { if (v > peak) peak = v; const dd = peak - v; if (dd > maxDD) maxDD = dd; const p = peak > 0 ? dd / peak * 100 : 0; if (p > maxDDPct) maxDDPct = p; }
  const years = n > 1 ? (Date.parse(curve[n - 1].t) - Date.parse(curve[0].t)) / (365.25 * 86400000) : 0;
  const cagr = years > 0 && end > 0 ? (Math.pow(end / init, 1 / years) - 1) * 100 : 0;
  const rets = []; for (let i = 1; i < n; i++) if (eq[i - 1] > 0) rets.push(eq[i] / eq[i - 1] - 1);
  const mean = rets.length ? sum(rets, (x) => x) / rets.length : 0;
  const sd = rets.length > 1 ? Math.sqrt(sum(rets, (x) => (x - mean) ** 2) / (rets.length - 1)) : 0;
  const downside = rets.length ? Math.sqrt(sum(rets.filter((x) => x < 0), (x) => x * x) / rets.length) : 0;
  const perYear = years > 0 ? n / years : 252;
  const sharpe = sd > 0 ? mean / sd * Math.sqrt(perYear) : 0, sortino = downside > 0 ? mean / downside * Math.sqrt(perYear) : 0;
  const net = sum(closed, (t) => t.profit);
  const avg = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0);
  const streak = (fn) => { let best = 0, cur = 0; for (const t of closed) { if (fn(t)) { cur++; best = Math.max(best, cur); } else cur = 0; } return best; };
  return {
    initialCapital: init, endingCapital: end, netProfit: end - init, netProfitPct: init ? (end / init - 1) * 100 : 0, cagr,
    exposure: n ? avg(curve.map((c) => c.exposure)) : 0, maxDrawdown: maxDD, maxDrawdownPct: maxDDPct,
    sharpe, sortino, ulcer: 0, profitFactor: gl > 0 ? gp / gl : (gp > 0 ? Infinity : 0), recoveryFactor: maxDD > 0 ? (end - init) / maxDD : 0,
    carMdd: maxDDPct > 0 ? cagr / maxDDPct : 0, riskAdjReturn: maxDDPct > 0 ? (end / init - 1) * 100 / maxDDPct : 0,
    trades: closed.length, winners: wins.length, losers: loss.length, winPct: closed.length ? 100 * wins.length / closed.length : 0,
    avgProfit: closed.length ? net / closed.length : 0, avgProfitPct: avg(closed.map((t) => t.pctProfit)),
    avgWin: avg(wins.map((t) => t.profit)), avgLoss: avg(loss.map((t) => t.profit)), avgWinPct: avg(wins.map((t) => t.pctProfit)), avgLossPct: avg(loss.map((t) => t.pctProfit)),
    largestWin: wins.length ? Math.max(...wins.map((t) => t.profit)) : 0, largestLoss: loss.length ? Math.min(...loss.map((t) => t.profit)) : 0,
    avgBars: avg(closed.map((t) => t.bars)), maxConsecWins: streak((t) => t.profit > 0), maxConsecLosses: streak((t) => t.profit <= 0),
    commissionPaid: sum(closed, (t) => t.commission || 0), openTrades: closed.filter((t) => t.open).length,
    benchmarkPct: benchmark ? benchmark : null,
  };
}
