// Back-testing core. Pure functions (no DOM, no AFL): turns Buy/Sell/Short/Cover signals into trades,
// sizes them in a portfolio and reports the statistics.  Follows AmiBroker's two-pass design:
//   pass 1 (per symbol)  -> rawTrades(): trade delays, trade prices, built-in stops, hold-min-bars; removes redundant signals
//   pass 2 (portfolio)   -> portfolio(): rank by PositionScore, MaxOpenPositions/Long/Short, position size, cash, margin, commission, interest
//   rotational mode      -> rotational(): rebalance every bar by PositionScore
//   individual mode      -> individual(): every symbol gets its own account
import { computeStats } from './bt-report.js';

const truthy = (x) => x !== 0 && x !== undefined && !Number.isNaN(x);
const at = (arr, i, d) => (arr && typeof arr === 'object' ? arr[i] : (arr === undefined ? d : arr));
const dayNum = (d) => Date.parse(d) / 86400000;

export const DEFAULT_OPTIONS = {
  initialEquity: 100000, positions: 'both', futuresMode: 0, minShares: 1, minPosValue: 0, accountMargin: 100, roundLotSize: 0, tickSize: 0,
  commissionMode: 0, commissionAmount: 0, commissionTable: null, interestRate: 0,
  allowPositionShrinking: 0, activateStopsImmediately: 0, reverseEntrySignalForce: 1, allowSameBarExit: 1, priceBounds: 1,
  tradePrices: { buy: 'close', sell: 'close', short: 'close', cover: 'close' }, tradeDelays: [0, 0, 0, 0], stops: [],
  maxOpenPositions: 10, maxOpenLong: 0, maxOpenShort: 0, separateLongShortRank: 0, worstRankHeld: 0, positionSize: { size: 100, type: 2 },
  limitVolPct: 0, noVolLimitIfZero: 1, usePrevBarEquity: 0, holdMinBars: 0, holdMinDays: 0, earlyExitBars: 0, earlyExitDays: 0, earlyExitFee: 0,
  riskFree: 5, mode: 0, reportMode: 0,
};

const FORMULA_KEYS = {
  initialequity: 'initialEquity', maxopenpositions: 'maxOpenPositions', maxopenlong: 'maxOpenLong', maxopenshort: 'maxOpenShort',
  separatelongshortrank: 'separateLongShortRank', commissionmode: 'commissionMode', commissionamount: 'commissionAmount',
  allowsamebarexit: 'allowSameBarExit', allowpositionshrinking: 'allowPositionShrinking', activatestopsimmediately: 'activateStopsImmediately',
  pricebounds: 'priceBounds', priceboundchecking: 'priceBounds', minshares: 'minShares', minposvalue: 'minPosValue', roundlotsize: 'roundLotSize', ticksize: 'tickSize',
  worstrankheld: 'worstRankHeld', reverseentrysignalforce: 'reverseEntrySignalForce', reversesignalforcesexit: 'reverseEntrySignalForce',
  holdminbars: 'holdMinBars', holdmindays: 'holdMinDays', earlyexitbars: 'earlyExitBars', earlyexitdays: 'earlyExitDays', earlyexitfee: 'earlyExitFee',
  interestrate: 'interestRate', marginrequirement: 'accountMargin', accountmargin: 'accountMargin', futuresmode: 'futuresMode',
  usepreviousbarequityforpossizing: 'usePrevBarEquity', portfolioreportmode: 'reportMode',
};

/**
 * Merge, in AmiBroker's order of priority:  Settings window (base)  <  the formula's SetOption / SetTradeDelays / SetPositionSize  <  overrides.
 */
export function optionsFromResult(res, overrides = {}, base = {}) {
  const o = { ...DEFAULT_OPTIONS, ...base, tradeDelays: [...(base.tradeDelays || DEFAULT_OPTIONS.tradeDelays)], tradePrices: { ...DEFAULT_OPTIONS.tradePrices, ...(base.tradePrices || {}) },
    positionSize: { ...(base.positionSize || DEFAULT_OPTIONS.positionSize) }, stops: [...(base.stops || [])] };
  const r = (res && res.options) || {};
  for (const [k, v] of Object.entries(r)) { const key = FORMULA_KEYS[k]; if (!key) continue; const x = typeof v === 'boolean' ? (v ? 1 : 0) : Number(v); if (Number.isFinite(x)) o[key] = x; }
  if (Array.isArray(r.tradedelays)) for (let i = 0; i < 4; i++) if (Number.isFinite(r.tradedelays[i])) o.tradeDelays[i] = r.tradedelays[i];
  if (r.positionsizeset) o.positionSize = { ...r.positionsizeset };
  if (Number.isFinite(r.backtestmode)) o.mode = r.backtestmode;
  return { ...o, ...overrides };
}

const priceAt = (b, f, i) => (f === 'open' ? b.o[i] : f === 'high' ? b.h[i] : f === 'low' ? b.l[i] : f === 'avg' ? (b.h[i] + b.l[i]) / 2 : b.c[i]);

/** Stops from the Settings window are replaced by ApplyStop() calls of the same type in the formula. */
function mergeStops(fromSettings, fromFormula) {
  const f = fromFormula || [], have = new Set(f.map((s) => s.type));
  return [...(fromSettings || []).filter((s) => !have.has(s.type)), ...f];
}

/**
 * Pass 1. bars: {t,o,h,l,c}; sig: {buy,sell,short,cover (arrays|null), buyPrice,... (array|scalar|undefined), stops:[...]}
 * Returns raw trades [{dir:1|-1, ei, xi, ep, xp, reason}]. A trade still open on the last bar is closed there (open:true).
 */
export function rawTrades(bars, sig, opt = DEFAULT_OPTIONS) {
  const n = bars.t.length, trades = [];
  const [dB, dS, dSh, dC] = opt.tradeDelays || [0, 0, 0, 0];
  const tp = { ...DEFAULT_OPTIONS.tradePrices, ...(opt.tradePrices || {}) };
  const sg = (arr, i) => (arr && i >= 0 && i < n ? truthy(arr[i]) : false);
  const px = (arr, field, i) => {
    let p = at(arr, i, undefined);
    if (p === undefined || Number.isNaN(p)) p = priceAt(bars, field, i);
    if (opt.priceBounds) p = Math.min(bars.h[i], Math.max(bars.l[i], p));
    return p;
  };
  const sellPx = (i) => px(sig.sellPrice, tp.sell, i), coverPx = (i) => px(sig.coverPrice, tp.cover, i);
  const buyPx = (i) => px(sig.buyPrice, tp.buy, i), shortPx = (i) => px(sig.shortPrice, tp.short, i);
  const exitPx = (dir, i) => (dir > 0 ? sellPx(i) : coverPx(i));
  const stops = mergeStops(opt.stops, sig.stops);
  const tick = opt.tickSize > 0 ? opt.tickSize : 0, snap = (x) => (tick ? Math.round(x / tick) * tick : x);
  const longOK = opt.positions !== 'short', shortOK = opt.positions !== 'long';
  const holdBars = opt.holdMinBars || 0, holdDays = opt.holdMinDays || 0;
  let pos = null, blockUntil = -1;

  const close = (i, p, why) => { trades.push({ dir: pos.dir, ei: pos.ei, xi: i, ep: pos.ep, xp: p, reason: why, hi: pos.hi, lo: pos.lo, sigBar: pos.sigBar }); pos = null; };
  const open = (dir, i, p) => { const sb = i - (dir > 0 ? dB : dSh); pos = { dir, ei: i, ep: p, hi: Math.max(bars.h[i], p), lo: Math.min(bars.l[i], p), sigBar: Math.max(0, sb) }; };

  for (let i = 0; i < n; i++) {
    if (!(bars.c[i] > 0)) continue;
    const dir = pos ? pos.dir : 0;
    if (pos) { pos.hi = Math.max(pos.hi, bars.h[i]); pos.lo = Math.min(pos.lo, bars.l[i]); }
    const held = pos ? i - pos.ei : 0;
    const blocked = pos && (held < holdBars || (holdDays > 0 && dayNum(bars.t[i]) - dayNum(bars.t[pos.ei]) < holdDays));
    // ---- a stop that fired last bar with ExitAtStop = 2 exits now at the normal price
    if (pos && !blocked && pos.pending) { const why = pos.pending, re = pos.pendingReentry || 0; close(i, exitPx(dir, i), why); blockUntil = i + re; }
    // ---- built-in stops (active from the bar after entry unless ActivateStopsImmediately)
    if (pos && !blocked && (i > pos.ei || opt.activateStopsImmediately)) {
      const order = [0, 1, 2, 3];
      for (const type of order) {
        for (const s of stops.filter((x) => x.type === type)) {
          if (!pos) break;
          if (!(s.mode > 0 || type === 3)) continue;
          const k = i - pos.ei, from = s.validFrom || 0, to = s.validTo === undefined ? -1 : s.validTo;
          if (k < from || (to >= 0 && k > to)) continue;
          const amt = s.amountArr ? (s.volatile ? s.amountArr[i] : s.amountArr[pos.sigBar]) : s.amount;
          if (!Number.isFinite(amt)) continue;
          if (type === 3) { if (k >= amt) { close(i, exitPx(dir, i), 'nbar'); blockUntil = i + (s.reentry || 0); } continue; }
          const pct = s.mode === 1, risk = s.mode === 3;
          let level;
          if (type === 0) level = dir > 0 ? pos.ep - (pct ? pos.ep * amt / 100 : amt) : pos.ep + (pct ? pos.ep * amt / 100 : amt);
          else if (type === 1) level = dir > 0 ? pos.ep + (pct ? pos.ep * amt / 100 : amt) : pos.ep - (pct ? pos.ep * amt / 100 : amt);
          else {
            const base = dir > 0 ? pos.hi : pos.lo;
            if (risk) { const gain = dir > 0 ? pos.hi - pos.ep : pos.ep - pos.lo; if (!(gain > 0)) continue; level = dir > 0 ? pos.ep + gain * (1 - amt / 100) : pos.ep - gain * (1 - amt / 100); }
            else level = dir > 0 ? base - (pct ? base * amt / 100 : amt) : base + (pct ? base * amt / 100 : amt);
          }
          level = snap(level);
          const eas = s.exitAtStop === undefined ? 0 : s.exitAtStop;
          const why = ['loss', 'profit', 'trail'][type];
          if (eas === 0) {                                  // only the trade price is compared with the stop
            const p = exitPx(dir, i), hit = type === 1 ? (dir > 0 ? p >= level : p <= level) : (dir > 0 ? p <= level : p >= level);
            if (hit) { close(i, p, why); blockUntil = i + (s.reentry || 0); }
          } else {
            const hit = type === 1 ? (dir > 0 ? bars.h[i] >= level : bars.l[i] <= level) : (dir > 0 ? bars.l[i] <= level : bars.h[i] >= level);
            if (!hit) continue;
            if (eas === 2) { pos.pending = why; pos.pendingReentry = s.reentry || 0; }
            else {
              let p = level;
              if (type !== 1) p = dir > 0 ? Math.min(level, bars.o[i]) : Math.max(level, bars.o[i]);     // gap beyond the stop: filled at the open
              else p = dir > 0 ? Math.max(level, bars.o[i]) : Math.min(level, bars.o[i]);
              p = Math.min(bars.h[i], Math.max(bars.l[i], p));
              close(i, p, why); blockUntil = i + (s.reentry || 0);
            }
          }
        }
        if (!pos) break;
      }
    }
    // ---- exits by signal, and exits forced by a reverse entry signal
    if (pos && !blocked) {
      const exitSig = pos.dir > 0 ? sg(sig.sell, i - dS) : sg(sig.cover, i - dC);
      const revSig = opt.reverseEntrySignalForce && (pos.dir > 0 ? (shortOK && sg(sig.short, i - dSh)) : (longOK && sg(sig.buy, i - dB)));
      if (exitSig) close(i, exitPx(pos.dir, i), 'signal');
      else if (revSig) close(i, exitPx(pos.dir, i), 'reverse');
    }
    // ---- entries
    if (!pos && i >= blockUntil) {
      const lg = longOK && sg(sig.buy, i - dB), sh = shortOK && sg(sig.short, i - dSh);
      const d = lg ? 1 : sh ? -1 : 0;
      if (d) {
        const p = d > 0 ? buyPx(i) : shortPx(i); open(d, i, p);
        if (opt.allowSameBarExit && (d > 0 ? sg(sig.sell, i - dS) : sg(sig.cover, i - dC))) close(i, exitPx(d, i), 'signal');
      }
    }
  }
  if (pos) trades.push({ dir: pos.dir, ei: pos.ei, xi: n - 1, ep: pos.ep, xp: bars.c[n - 1], reason: 'open', open: true, hi: pos.hi, lo: pos.lo, sigBar: pos.sigBar });
  return trades;
}

/** Single-security equity curve (AFL Equity(1)): all-in, long or short, compounding. */
export function singleEquity(bars, sig, opt = DEFAULT_OPTIONS) {
  const n = bars.t.length, eq = new Float64Array(n);
  let cash = opt.initialEquity; const tr = rawTrades(bars, sig, opt);
  let k = 0, cur = null;
  for (let i = 0; i < n; i++) {
    while (k < tr.length && tr[k].ei === i && !cur) {
      if (tr[k].xi === i) { cash += tr[k].dir * (cash / tr[k].ep) * (tr[k].xp - tr[k].ep); k++; continue; }
      cur = { ...tr[k], sh: cash / tr[k].ep }; k++;
    }
    if (cur && cur.xi === i) { cash += cur.dir * cur.sh * (cur.xp - cur.ep); cur = null; }
    eq[i] = cash + (cur ? cur.dir * cur.sh * (bars.c[i] - cur.ep) : 0);
  }
  return { equity: eq, trades: tr };
}

/** Commission: mode 1 % of trade, 2 per trade, 3 per share, 0 = the commission table (tiers) when one is defined. */
export function commissionFor(opt, value, shares) {
  const a = opt.commissionAmount || 0, v = Math.abs(value);
  if (opt.commissionMode === 1) return v * a / 100;
  if (opt.commissionMode === 2) return a;
  if (opt.commissionMode === 3) return Math.abs(shares) * a;
  const t = opt.commissionTable;
  if (opt.commissionMode === 0 && t) {
    const tiers = [...(t.tiers || [])].filter((x) => x && ((x.min || 0) > 0 || (x.max || 0) > 0));
    const basis = (x) => (x.basis === 'shares' ? Math.abs(shares) : v);
    const tier = tiers.find((x) => basis(x) >= (x.min || 0) && ((x.max || 0) === 0 || basis(x) <= x.max)) || t.default;
    if (tier) {
      let c = tier.type === 'share' ? Math.abs(shares) * (tier.amount || 0) : tier.type === 'pct' ? v * (tier.amount || 0) / 100 : (tier.amount || 0);
      if (tier.minComm > 0) c = Math.max(c, tier.minComm); if (tier.maxComm > 0) c = Math.min(c, tier.maxComm);
      return c;
    }
  }
  return 0;
}

const lotOf = (u, opt) => (u.roundLot > 0 ? u.roundLot : opt.roundLotSize > 0 ? opt.roundLotSize : 0);
const roundShares = (sh, lot) => (lot > 0 ? Math.floor(sh / lot + 1e-9) * lot : Math.floor(sh + 1e-9));

/**
 * Pass 2. universe: [{ symbol, bars, trades, score(arr|undefined), size(arr|undefined), pointValue, marginDeposit, roundLot }]
 * Returns { trades, equityCurve:[{t,equity,cash,exposure,open,events}], stats }.
 */
export function portfolio(universe, opt = DEFAULT_OPTIONS) {
  const dates = [...new Set(universe.flatMap((u) => u.bars.t))].sort();
  const idxMap = universe.map((u) => new Map(u.bars.t.map((d, i) => [d, i])));
  const fut = !!opt.futuresMode;
  let cash = opt.initialEquity, prevEq = cash, prevDate = null;
  const open = [], done = [], curve = [];
  const entriesByDate = new Map();
  universe.forEach((u, ui) => {
    for (const tr of u.trades) {
      const d = u.bars.t[tr.ei]; if (!entriesByDate.has(d)) entriesByDate.set(d, []);
      entriesByDate.get(d).push({ ui, tr, score: at(u.score, tr.sigBar, 0) });
    }
  });
  const lastPx = (p, d) => { const i = idxMap[p.ui].get(d); if (i !== undefined) p.last = universe[p.ui].bars.c[i]; return p.last; };
  const valueOf = (p, price) => (fut ? p.margin * p.sh + p.dir * p.sh * p.pv * (price - p.ep) : p.dir * p.sh * price);
  const notional = (p, price) => (fut ? p.margin * p.sh : p.sh * price);

  for (const d of dates) {
    const events = [];
    // interest on uninvested cash (annual rate, per calendar day)
    if (opt.interestRate && prevDate && cash > 0) cash += cash * opt.interestRate / 100 * Math.max(0, dayNum(d) - dayNum(prevDate)) / 365;
    prevDate = d;
    // exits that happen on this date
    for (let k = open.length - 1; k >= 0; k--) {
      const p = open[k], xd = universe[p.ui].bars.t[p.tr.xi];
      if (xd === d && !p.tr.open) {
        const val = notional(p, p.tr.xp);
        let c = commissionFor(opt, val, p.sh);
        c += earlyFee(p, p.tr, universe[p.ui].bars.t, opt, val);
        cash += valueOf(p, p.tr.xp) - c;
        done.push(finish(p, universe, p.tr.xp, p.tr.xi, c)); events.push(`${p.dir > 0 ? 'Sell' : 'Cover'} ${universe[p.ui].symbol} @ ${p.tr.xp.toFixed(2)} x ${p.sh}`);
        open.splice(k, 1);
      }
    }
    // entries on this date, best score first
    let cands = (entriesByDate.get(d) || []);
    const byScore = (a, b) => Math.abs(b.score) - Math.abs(a.score);
    if (opt.separateLongShortRank) {
      const L = cands.filter((c) => c.tr.dir > 0).sort(byScore), Sh = cands.filter((c) => c.tr.dir < 0).sort(byScore), mix = [];
      for (let k = 0; k < Math.max(L.length, Sh.length); k++) { if (L[k]) mix.push(L[k]); if (Sh[k]) mix.push(Sh[k]); }
      cands = mix;
    } else cands = [...cands].sort(byScore);
    for (const cd of cands) {
      if (open.length >= opt.maxOpenPositions) break;
      const u = universe[cd.ui], tr = cd.tr;
      if (tr.dir > 0 && opt.maxOpenLong > 0 && open.filter((p) => p.dir > 0).length >= opt.maxOpenLong) continue;
      if (tr.dir < 0 && opt.maxOpenShort > 0 && open.filter((p) => p.dir < 0).length >= opt.maxOpenShort) continue;
      let eq = cash; for (const p of open) eq += valueOf(p, lastPx(p, d) ?? p.ep);
      const sizeEq = opt.usePrevBarEquity ? prevEq : eq;
      const pv = u.pointValue > 0 ? u.pointValue : 1;
      let margin = 0; if (fut) { const md = u.marginDeposit || 0; margin = md > 0 ? md : md < 0 ? -md / 100 * tr.ep * pv : tr.ep * pv; }
      let value, shares = 0;
      const sz = at(u.size, tr.sigBar, NaN);
      if (Number.isFinite(sz) && sz !== 0) value = sz > 0 ? sz : -sz / 100 * sizeEq;
      else {
        const ps = opt.positionSize || { size: 100, type: 2 };
        value = ps.type === 1 ? ps.size : ps.type === 2 || ps.type === 3 ? ps.size / 100 * sizeEq : NaN;
        if (ps.type === 4) shares = ps.size;
      }
      const lot = lotOf(u, opt);
      if (!shares) shares = roundShares(value / (fut ? margin : tr.ep), lot);
      if (opt.limitVolPct > 0) { const vol = u.bars.v ? u.bars.v[tr.ei] : 0; if (vol > 0 || !opt.noVolLimitIfZero) shares = Math.min(shares, roundShares(vol * opt.limitVolPct / 100, lot)); }
      if (shares < Math.max(lot > 0 ? lot : 1, opt.minShares || 1)) continue;
      const cost = (n) => (fut ? margin * n : n * tr.ep);
      const bp = eq * 100 / (opt.accountMargin || 100) - open.reduce((s, p) => s + notional(p, p.last ?? p.ep), 0);
      if (cost(shares) + commissionFor(opt, cost(shares), shares) > bp + 1e-9) {
        if (!opt.allowPositionShrinking) continue;
        let n2 = shares; while (n2 > 0 && cost(n2) + commissionFor(opt, cost(n2), n2) > bp) n2 = roundShares(n2 * 0.999 - (lot > 0 ? lot : 1), lot);
        shares = n2; if (shares < Math.max(lot > 0 ? lot : 1, opt.minShares || 1)) continue;
      }
      if (opt.minPosValue > 0 && shares * tr.ep < opt.minPosValue) continue;
      const c = commissionFor(opt, cost(shares), shares);
      const p = { ui: cd.ui, tr, dir: tr.dir, sh: shares, ep: tr.ep, ed: d, entryCommission: c, last: tr.ep, pv, margin };
      cash -= (fut ? margin * shares : tr.dir * shares * tr.ep) + c;
      open.push(p); events.push(`${tr.dir > 0 ? 'Buy' : 'Short'} ${u.symbol} @ ${tr.ep.toFixed(2)} x ${shares}`);
      if (tr.xi === tr.ei) {                                            // exited on the same bar
        open.pop(); const val = notional(p, tr.xp); let c2 = commissionFor(opt, val, p.sh); c2 += earlyFee(p, tr, u.bars.t, opt, val);
        cash += valueOf(p, tr.xp) - c2; done.push(finish(p, universe, tr.xp, tr.xi, c2)); events.push(`${tr.dir > 0 ? 'Sell' : 'Cover'} ${u.symbol} @ ${tr.xp.toFixed(2)} x ${shares}`);
      }
    }
    let eqv = cash, invested = 0;
    for (const p of open) { const l = lastPx(p, d) || p.ep; eqv += valueOf(p, l); invested += notional(p, l); }
    curve.push({ t: d, equity: eqv, cash, exposure: eqv > 0 ? 100 * invested / eqv : 0, open: open.length, events });
    prevEq = eqv;
  }
  // positions still open at the end are marked at the last close
  for (const p of open) done.push(finish(p, universe, p.last ?? p.ep, p.tr.xi, 0, true));
  done.sort((a, b) => (a.entryDate < b.entryDate ? -1 : a.entryDate > b.entryDate ? 1 : 0));
  return { trades: done, equityCurve: curve, stats: computeStats(done, curve, opt) };
}

/** Fee for leaving a trade early (EarlyExitBars / EarlyExitDays with EarlyExitFee %). */
function earlyFee(p, tr, t, opt, value) {
  if (!(opt.earlyExitFee > 0)) return 0;
  const bars = tr.xi - tr.ei, days = dayNum(t[tr.xi]) - dayNum(t[tr.ei]);
  const early = (opt.earlyExitBars > 0 && bars < opt.earlyExitBars) || (opt.earlyExitDays > 0 && days < opt.earlyExitDays);
  return early ? value * opt.earlyExitFee / 100 : 0;
}

function finish(p, universe, xp, xi, exitCommission, still = false) {
  const u = universe[p.ui], dir = p.dir, tr = p.tr, pv = p.pv || 1;
  const gross = dir * p.sh * pv * (xp - p.ep), cost = (p.entryCommission || 0) + (exitCommission || 0);
  const mae = dir > 0 ? (tr.lo - p.ep) / p.ep * 100 : (p.ep - tr.hi) / p.ep * 100;
  const mfe = dir > 0 ? (tr.hi - p.ep) / p.ep * 100 : (p.ep - tr.lo) / p.ep * 100;
  return {
    symbol: u.symbol, trade: dir > 0 ? 'Long' : 'Short', entryDate: u.bars.t[tr.ei], entryPrice: p.ep, exitDate: u.bars.t[Math.min(xi, u.bars.t.length - 1)],
    exitPrice: xp, shares: p.sh, profit: gross - cost, pctProfit: dir * (xp / p.ep - 1) * 100, bars: Math.max(0, xi - tr.ei), reason: tr.reason,
    mae, mfe, commission: cost, open: !!still,
  };
}

/** Individual backtest: each symbol trades with its own account (AmiBroker "Individual Backtest"). */
export function individual(universe, opt = DEFAULT_OPTIONS) {
  const per = universe.map((u) => ({ symbol: u.symbol, ...portfolio([u], opt) }));
  const trades = per.flatMap((p) => p.trades).sort((a, b) => (a.entryDate < b.entryDate ? -1 : 1));
  // combined curve: sum of the accounts day by day (carry the last value forward)
  const dates = [...new Set(per.flatMap((p) => p.equityCurve.map((c) => c.t)))].sort();
  const last = per.map(() => null), pos = per.map(() => 0), curve = [];
  for (const d of dates) {
    let eq = 0, exp = 0;
    per.forEach((p, k) => { while (pos[k] < p.equityCurve.length && p.equityCurve[pos[k]].t <= d) { last[k] = p.equityCurve[pos[k]]; pos[k]++; } eq += last[k] ? last[k].equity : opt.initialEquity; exp += last[k] ? last[k].exposure : 0; });
    curve.push({ t: d, equity: eq, exposure: per.length ? exp / per.length : 0, open: 0, events: [] });
  }
  const o2 = { ...opt, initialEquity: opt.initialEquity * per.length };
  return { trades, equityCurve: curve, perSymbol: per, stats: computeStats(trades, curve, o2) };
}

/** Rotational mode: every bar rank the symbols by PositionScore, hold the best MaxOpenPositions. */
export function rotational(universe, opt = DEFAULT_OPTIONS) {
  const dates = [...new Set(universe.flatMap((u) => u.bars.t))].sort();
  const idxMap = universe.map((u) => new Map(u.bars.t.map((d, i) => [d, i])));
  const delay = (opt.tradeDelays || [0])[0] || 0;
  let cash = opt.initialEquity; const open = [], done = [], curve = [];
  const maxPos = Math.max(1, opt.maxOpenPositions), worst = opt.worstRankHeld > 0 ? opt.worstRankHeld : maxPos;
  const priceOf = (ui, d) => { const i = idxMap[ui].get(d); return i === undefined ? undefined : i; };
  const tp = { ...DEFAULT_OPTIONS.tradePrices, ...(opt.tradePrices || {}) };
  for (let di = 0; di < dates.length; di++) {
    const d = dates[di];
    const ranked = [];
    universe.forEach((u, ui) => {
      const i = priceOf(ui, d); if (i === undefined) return;
      const s = at(u.score, Math.max(0, i - delay), NaN);
      if (Number.isFinite(s) && s > 0) ranked.push({ ui, s, i });
    });
    ranked.sort((a, b) => b.s - a.s);
    const rankOf = new Map(ranked.map((r, k) => [r.ui, k + 1]));
    for (let k = open.length - 1; k >= 0; k--) {
      const p = open[k], r = rankOf.get(p.ui), i = priceOf(p.ui, d);
      if (i === undefined) continue;
      if (r === undefined || r > worst) {
        const u = universe[p.ui], xp = at(u.sellPrice, i, priceAt(u.bars, tp.sell, i)) ?? u.bars.c[i], c = commissionFor(opt, p.sh * xp, p.sh);
        cash += p.sh * xp - c;
        done.push(finish({ ...p, tr: { ...p.tr, xi: i } }, universe, xp, i, c));
        open.splice(k, 1);
      }
    }
    for (const r of ranked) {
      if (open.length >= maxPos) break;
      if (open.some((p) => p.ui === r.ui)) continue;
      const u = universe[r.ui], ep = at(u.buyPrice, r.i, priceAt(u.bars, tp.buy, r.i)) ?? u.bars.c[r.i];
      let eq = cash; for (const p of open) { const i = priceOf(p.ui, d); eq += p.sh * (i === undefined ? p.ep : universe[p.ui].bars.c[i]); }
      const ps = opt.positionSize && opt.positionSize.size ? opt.positionSize : { size: 100 / maxPos, type: 2 };
      const size = opt.positionSize === DEFAULT_OPTIONS.positionSize || (opt.positionSize.size === 100 && opt.positionSize.type === 2) ? { size: 100 / maxPos, type: 2 } : ps;
      const sz = at(u.size, r.i, NaN);
      const value = Number.isFinite(sz) && sz !== 0 ? (sz > 0 ? sz : -sz / 100 * eq) : (size.type === 1 ? size.size : size.size / 100 * eq);
      let shares = size.type === 4 && !Number.isFinite(sz) ? size.size : roundShares(value / ep, lotOf(u, opt));
      if (shares < 1) continue;
      let c = commissionFor(opt, shares * ep, shares);
      if (shares * ep + c > cash) { if (!opt.allowPositionShrinking) continue; shares = Math.floor((cash - c) / ep); if (shares < 1) continue; c = commissionFor(opt, shares * ep, shares); }
      cash -= shares * ep + c;
      open.push({ ui: r.ui, dir: 1, sh: shares, ep, ed: d, entryCommission: c, last: ep, pv: 1, tr: { dir: 1, ei: r.i, xi: r.i, ep, lo: ep, hi: ep, reason: 'rank' } });
    }
    let posVal = 0;
    for (const p of open) { const i = priceOf(p.ui, d); if (i !== undefined) { p.last = universe[p.ui].bars.c[i]; p.tr.hi = Math.max(p.tr.hi, universe[p.ui].bars.h[i]); p.tr.lo = Math.min(p.tr.lo, universe[p.ui].bars.l[i]); } posVal += p.sh * p.last; }
    const eqv = cash + posVal;
    curve.push({ t: d, equity: eqv, cash, exposure: eqv > 0 ? 100 * posVal / eqv : 0, open: open.length, events: [] });
  }
  for (const p of open) done.push(finish({ ...p, tr: { ...p.tr, xi: universe[p.ui].bars.t.length - 1, open: true } }, universe, p.last, universe[p.ui].bars.t.length - 1, 0, true));
  return { trades: done, equityCurve: curve, stats: computeStats(done, curve, opt) };
}
