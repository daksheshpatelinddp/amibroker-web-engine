// Analysis Settings (AmiBroker: Analysis > Settings): General, Trades, Stops, Commissions, Portfolio, Report, Walk-Forward, Monte Carlo.
// Pure data (no DOM). The dialog is in analysis-settings-ui.js. A formula's own SetOption() / ApplyStop() / SetTradeDelays() wins over these.
const KEY = 'aa_settings_v1';
const tier = () => ({ basis: 'value', min: 0, max: 0, type: 'pct', amount: 0, minComm: 0, maxComm: 0 });

export const DEFAULT_SETTINGS = {
  general: { initialEquity: 100000, positions: 'both', futuresMode: false, minShares: 1, minPosValue: 0, accountMargin: 100, interestRate: 0,
    allowPositionShrinking: false, activateStopsImmediately: false, roundLotSize: 0, tickSize: 0, reverseSignalForcesExit: true, allowSameBarExit: true,
    priceBounds: true, maxSymbols: 500 },
  trades: { buyPrice: 'close', sellPrice: 'close', shortPrice: 'close', coverPrice: 'close', buyDelay: 0, sellDelay: 0, shortDelay: 0, coverDelay: 0 },
  stops: { maxLoss: { on: false, amount: 10, mode: 1 }, profit: { on: false, amount: 20, mode: 1 }, trail: { on: false, amount: 10, mode: 1 }, nbar: { on: false, amount: 10 }, exitAtStop: 1, reentryDelay: 0 },
  commission: { mode: 0, amount: 0, table: { default: { type: 'pct', amount: 0, minComm: 0, maxComm: 0 }, tiers: [tier(), tier(), tier(), tier(), tier()] } },
  portfolio: { maxOpenPositions: 10, positionSizeType: 'pct', positionSize: 100, maxOpenLong: 0, maxOpenShort: 0, separateLongShortRank: false, worstRankHeld: 0,
    limitVolPct: 0, noVolLimitIfZero: true, usePrevBarEquity: false, holdMinBars: 0, holdMinDays: 0, earlyExitBars: 0, earlyExitDays: 0, earlyExitFee: 0 },
  report: { resultList: 'trades', riskFree: 5, distSpacing: 1, includeTradeList: true },
  walkForward: { isLength: 3, isUnit: 'years', oosLength: 1, oosUnit: 'years', anchored: false, start: '', last: '', target: 'carMdd' },
  optimize: { target: 'carMdd', engine: 'exhaustive', maxEval: 1000, runs: 3 },
  monteCarlo: { enable: true, runs: 1000, mode: 'trades', posMethod: 'keep', posValue: 10000, posPct: 10, strawLines: 30 },
};

const clone = (o) => JSON.parse(JSON.stringify(o));
function merge(base, over) {
  if (Array.isArray(base)) return Array.isArray(over) ? over : base;
  if (base && typeof base === 'object') { const o = {}; for (const k of Object.keys(base)) o[k] = merge(base[k], over && typeof over === 'object' ? over[k] : undefined); return o; }
  return over === undefined || over === null ? base : (typeof base === typeof over ? over : base);
}
export function loadSettings(storage = (typeof localStorage !== 'undefined' ? localStorage : null)) {
  let s = null; try { s = storage && JSON.parse(storage.getItem(KEY) || 'null'); } catch (e) {}
  return merge(clone(DEFAULT_SETTINGS), s || {});
}
export function saveSettings(s, storage = (typeof localStorage !== 'undefined' ? localStorage : null)) { try { storage && storage.setItem(KEY, JSON.stringify(s)); } catch (e) {} }
export const defaultSettings = () => clone(DEFAULT_SETTINGS);

const SIZE_TYPE = { value: 1, pct: 2, shares: 4 };
/** Settings -> option object for bt-core (the base that the formula's SetOption() calls are applied over). */
export function settingsToOptions(S = DEFAULT_SETTINGS) {
  const g = S.general, t = S.trades, st = S.stops, p = S.portfolio, c = S.commission, b = (x) => (x ? 1 : 0);
  const stops = [];
  const add = (type, o, extra = {}) => { if (o && o.on && o.amount > 0) stops.push({ type, mode: o.mode === undefined ? 1 : o.mode, amount: Number(o.amount), exitAtStop: st.exitAtStop, reentry: st.reentryDelay || 0, ...extra }); };
  add(0, st.maxLoss); add(1, st.profit); add(2, st.trail);
  if (st.nbar && st.nbar.on && st.nbar.amount > 0) stops.push({ type: 3, mode: 1, amount: Number(st.nbar.amount), exitAtStop: st.exitAtStop, reentry: st.reentryDelay || 0 });
  const o = {
    initialEquity: g.initialEquity, positions: g.positions, futuresMode: b(g.futuresMode), minShares: g.minShares, minPosValue: g.minPosValue, accountMargin: g.accountMargin || 100,
    interestRate: g.interestRate, allowPositionShrinking: b(g.allowPositionShrinking), activateStopsImmediately: b(g.activateStopsImmediately), roundLotSize: g.roundLotSize, tickSize: g.tickSize,
    reverseEntrySignalForce: b(g.reverseSignalForcesExit), allowSameBarExit: b(g.allowSameBarExit), priceBounds: b(g.priceBounds),
    tradePrices: { buy: t.buyPrice, sell: t.sellPrice, short: t.shortPrice, cover: t.coverPrice }, tradeDelays: [t.buyDelay, t.sellDelay, t.shortDelay, t.coverDelay].map(Number),
    stops, commissionMode: c.mode, commissionAmount: c.amount, commissionTable: c.table,
    maxOpenPositions: p.maxOpenPositions, maxOpenLong: p.maxOpenLong, maxOpenShort: p.maxOpenShort, separateLongShortRank: b(p.separateLongShortRank), worstRankHeld: p.worstRankHeld,
    positionSize: { size: p.positionSize, type: SIZE_TYPE[p.positionSizeType] || 2 }, limitVolPct: p.limitVolPct, noVolLimitIfZero: b(p.noVolLimitIfZero), usePrevBarEquity: b(p.usePrevBarEquity),
    holdMinBars: p.holdMinBars, holdMinDays: p.holdMinDays, earlyExitBars: p.earlyExitBars, earlyExitDays: p.earlyExitDays, earlyExitFee: p.earlyExitFee,
    riskFree: S.report.riskFree, reportMode: { trades: 0, detail: 1, summary: 2 }[S.report.resultList] || 0,
  };
  return o;
}
