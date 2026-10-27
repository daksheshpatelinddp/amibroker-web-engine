// AmiBroker time-frame functions: TimeFrameSet / TimeFrameRestore / TimeFrameExpand / TimeFrameCompress / TimeFrameGetPrice.
// https://www.amibroker.com/guide/afl/timeframeset.html
//
// How it works here: the formula always starts in the "base" time frame (the chart / analysis time frame, e.g. Daily). TimeFrameSet(inWeekly)
// builds weekly bars from the base bars and swaps Open/High/Low/Close/Volume/Avg/BarCount/DateNum()... for them, so every later function runs on weekly
// bars. TimeFrameRestore() swaps the base bars back. Arrays made in the other time frame keep their (shorter) length until TimeFrameExpand() maps
// them back to the base bars, exactly like in AmiBroker.
import { periodKey } from './timeframe.js';
import { SESSION_START } from './intraday.js';
import { isArr } from './afl-lib.js';

// Interval constants (seconds). inWeekly / inMonthly follow AmiBroker 5.x: Monday-Friday weeks and whole calendar months are not "5 / 25 days".
export const IN = {
  in1Minute: 60, in2Minute: 120, in3Minute: 180, in5Minute: 300, in10Minute: 600, in15Minute: 900, in30Minute: 1800, in45Minute: 2700, inMinute: 60,
  inHourly: 3600, inDaily: 86400, inWeekly: 5 * 86400 + 1, inMonthly: 25 * 86400 + 1, inQuarterly: 75 * 86400 + 1, inYearly: 300 * 86400 + 1,
};
// modes (use the names; the numbers are internal)
export const MODES = { expandLast: 0, expandFirst: 1, expandPoint: 2, compressLast: 0, compressOpen: 1, compressHigh: 2, compressLow: 3, compressVolume: 4 };

const KIND_SECONDS = { week: IN.inWeekly, month: IN.inMonthly, quarter: IN.inQuarterly, year: IN.inYearly };

/** {kind:'min'|'day'|'week'|'month'|'quarter'|'year', n} for an interval in seconds. Throws an Error with a readable message. */
export function classify(iv) {
  const v = Number(iv);
  if (!Number.isFinite(v) || v === 0) throw new Error('TimeFrameSet: the interval must be a number of seconds, e.g. inWeekly or 5*in1Minute');
  if (v < 0) throw new Error('TimeFrameSet: tick, volume and range bars (negative intervals) are not supported');
  if (v === IN.inWeekly) return { kind: 'week' };
  if (v === IN.inMonthly) return { kind: 'month' };
  if (v === IN.inQuarterly) return { kind: 'quarter' };
  if (v === IN.inYearly) return { kind: 'year' };
  if (v < 86400) {
    if (v % 60) throw new Error('TimeFrameSet: intraday intervals must be whole minutes');
    return { kind: 'min', n: v / 60 };
  }
  return { kind: 'day', n: Math.max(1, Math.round(v / 86400)) };
}
const seconds = (c) => (c.kind === 'min' ? c.n * 60 : c.kind === 'day' ? c.n * 86400 : KIND_SECONDS[c.kind]);

/** Base info from the app's time-frame id: 'D' 'W' 'M' 'Q' 'Y' or '15m'. */
export function baseInfo(tf) {
  const t = String(tf || 'D');
  if (/^\d+m$/.test(t)) return { kind: 'min', n: parseInt(t, 10) };
  return { kind: { D: 'day', W: 'week', M: 'month', Q: 'quarter', Y: 'year' }[t] || 'day', n: 1 };
}
export const baseSeconds = (tf) => seconds(baseInfo(tf));

const minuteOf = (label) => (String(label).length > 10 ? +String(label).slice(11, 13) * 60 + +String(label).slice(14, 16) : SESSION_START);
const dayOf = (label) => String(label).slice(0, 10);

/**
 * Bars of the target time frame from the base bars. Returns { bars, map, first, last, nc, same } where map[i] = compressed bar of base bar i,
 * first[k] / last[k] = first / last base bar of compressed bar k. Throws an Error with a readable message if the interval cannot be built.
 */
export function compressBars(b, baseTf, iv) {
  const base = baseInfo(baseTf), tg = classify(iv);
  const n = b.t.length;
  const bs = seconds(base), ts = seconds(tg);
  const sameFrame = base.kind === tg.kind && (base.n || 1) === (tg.n || 1);
  const name = (x) => (x.kind === 'min' ? `${x.n}-minute` : x.kind === 'day' ? (x.n === 1 ? 'daily' : `${x.n}-day`) : x.kind === 'week' ? 'weekly' : x.kind);
  if (!sameFrame) {
    if (tg.kind === 'min' && base.kind !== 'min') throw new Error(`TimeFrameSet: ${name(tg)} bars need intraday data, but this formula runs on ${name(base)} bars. Time frames can only be made longer than the one you run on.`);
    if (ts < bs) throw new Error(`TimeFrameSet: ${name(tg)} is shorter than the ${name(base)} bars this formula runs on. Time frames can only be made longer, never shorter.`);
    if (tg.kind === 'min' && base.kind === 'min' && tg.n % base.n) throw new Error(`TimeFrameSet: ${name(tg)} bars cannot be built from ${name(base)} bars (not a multiple).`);
  }
  if (sameFrame) {
    const id = new Int32Array(n); for (let i = 0; i < n; i++) id[i] = i;
    return { bars: b, map: id, first: id, last: id, nc: n, same: true };
  }
  // one key per base bar; consecutive equal keys form one compressed bar
  const keyOf = [];
  let dayNo = -1, prevDay = null, unit = 0;
  const groupN = tg.kind === 'day' ? tg.n : tg.kind === 'min' ? 0 : 0;
  const perBar = Math.max(1, Math.round(ts / bs));                // base bars per compressed bar when the target is a plain multiple
  for (let i = 0; i < n; i++) {
    const d = dayOf(b.t[i]);
    if (d !== prevDay) { dayNo++; prevDay = d; }
    switch (tg.kind) {
      case 'min': keyOf.push(`${d}|${Math.floor((minuteOf(b.t[i]) - SESSION_START) / tg.n)}`); break;
      case 'week': case 'month': case 'quarter': case 'year': keyOf.push(periodKey(d, { week: 'W', month: 'M', quarter: 'Q', year: 'Y' }[tg.kind])); break;
      default: {                                                  // N-day bars
        unit = base.kind === 'min' ? dayNo : i;
        keyOf.push(Math.floor(unit / (base.kind === 'min' || base.kind === 'day' ? groupN : perBar)));
      }
    }
  }
  const t = [], o = [], h = [], l = [], c = [], v = [], dq = [], delpct = [];
  const map = new Int32Array(n), first = [], last = [];
  const hasDq = b.dq && b.dq.length === n;
  let k = -1, key = null, sumDq = 0, dqOk = true, curV = 0;
  const closeBar = () => { if (k < 0) return; dq.push(hasDq && dqOk ? sumDq : NaN); delpct.push(hasDq && dqOk && curV > 0 ? (sumDq / curV) * 100 : NaN); };
  for (let i = 0; i < n; i++) {
    if (keyOf[i] !== key) {
      closeBar();
      key = keyOf[i]; k++;
      first.push(i); last.push(i);
      t.push(tg.kind === 'min' ? b.t[i] : dayOf(b.t[i]) === String(b.t[i]) ? b.t[i] : dayOf(b.t[i]));
      o.push(b.o[i]); h.push(b.h[i]); l.push(b.l[i]); c.push(b.c[i]);
      curV = Number.isFinite(b.v[i]) ? b.v[i] : 0; v.push(curV);
      sumDq = hasDq && Number.isFinite(b.dq[i]) ? b.dq[i] : 0; dqOk = hasDq && Number.isFinite(b.dq[i]);
    } else {
      last[k] = i;
      if (tg.kind !== 'min') t[k] = dayOf(b.t[i]);                // label of a day-or-longer bar = its last trading day
      if (b.h[i] > h[k] || Number.isNaN(h[k])) h[k] = b.h[i];
      if (b.l[i] < l[k] || Number.isNaN(l[k])) l[k] = b.l[i];
      c[k] = b.c[i];
      const vi = Number.isFinite(b.v[i]) ? b.v[i] : 0; v[k] += vi; curV += vi;
      if (hasDq && Number.isFinite(b.dq[i])) sumDq += b.dq[i]; else dqOk = false;
    }
    map[i] = k;
  }
  closeBar();
  const f64 = (a) => Float64Array.from(a);
  return { bars: { t, o: f64(o), h: f64(h), l: f64(l), c: f64(c), v: f64(v), dq: f64(dq), delpct: f64(delpct) }, map, first: Int32Array.from(first), last: Int32Array.from(last), nc: k + 1, same: false };
}

/** Base-length array -> array of compressed bars. mode: compressLast / Open / High / Low / Volume (sum). */
export function compressArray(arr, ctx, mode = 0) {
  const out = new Float64Array(ctx.nc).fill(NaN);
  for (let k = 0; k < ctx.nc; k++) {
    const a = ctx.first[k], z = ctx.last[k];
    switch (mode) {
      case 1: out[k] = arr[a]; break;
      case 2: { let m = NaN; for (let i = a; i <= z; i++) if (arr[i] > m || (Number.isNaN(m) && !Number.isNaN(arr[i]))) m = arr[i]; out[k] = m; break; }
      case 3: { let m = NaN; for (let i = a; i <= z; i++) if (arr[i] < m || (Number.isNaN(m) && !Number.isNaN(arr[i]))) m = arr[i]; out[k] = m; break; }
      case 4: { let s = 0, any = false; for (let i = a; i <= z; i++) if (!Number.isNaN(arr[i])) { s += arr[i]; any = true; } out[k] = any ? s : NaN; break; }
      default: out[k] = arr[z];
    }
  }
  return out;
}

/** Compressed array -> base-length array. expandLast (default): the value of a period appears on the period's LAST bar and holds until the next
 *  period's last bar (no look-ahead); expandFirst: from the period's first bar (a weekly high is then known on Monday); expandPoint: last bar only. */
export function expandArray(arr, ctx, mode = 0, nBase = ctx.map.length) {
  const out = new Float64Array(nBase).fill(NaN);
  for (let k = 0; k < ctx.nc; k++) {
    const a = ctx.first[k], z = ctx.last[k];
    for (let i = a; i <= z; i++) {
      if (mode === 1) out[i] = arr[k];
      else if (mode === 2) out[i] = i === z ? arr[k] : NaN;
      else out[i] = i === z ? arr[k] : (k > 0 ? arr[k - 1] : NaN);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------------------- interpreter glue
const PRICE_KEYS = ['open', 'o', 'high', 'h', 'low', 'l', 'close', 'c', 'volume', 'v', 'avg', 'oi', 'openint', 'openinterest', 'delivery', 'delpct', 'barcount'];

export function addTimeFrame(F, E, H) {
  const { S } = H;
  const cache = new Map();                                        // interval -> compression of the BASE bars
  const fcache = new Map();                                       // foreign bars -> { iv, ctx }
  const baseTf = () => E.opts.interval || 'D';
  const ctxOf = (iv) => {
    const key = String(iv);
    if (!cache.has(key)) {
      try { cache.set(key, compressBars(E.bars0, baseTf(), iv)); } catch (e) { E.fail(e.message); }
    }
    return cache.get(key);
  };
  const setConsts = (b, arrs) => {
    const c = E.consts, n = b.t.length;
    ['open', 'o'].forEach((k) => c.set(k, arrs.o)); ['high', 'h'].forEach((k) => c.set(k, arrs.h)); ['low', 'l'].forEach((k) => c.set(k, arrs.l));
    ['close', 'c'].forEach((k) => c.set(k, arrs.c)); ['volume', 'v'].forEach((k) => c.set(k, arrs.v));
    c.set('avg', Float64Array.from(arrs.h, (x, i) => (x + arrs.l[i]) / 2));
    c.set('oi', new Float64Array(n)); c.set('openint', new Float64Array(n)); c.set('openinterest', new Float64Array(n));
    c.set('delivery', b.dq ? Float64Array.from(b.dq) : new Float64Array(n).fill(NaN)); c.set('delpct', b.delpct ? Float64Array.from(b.delpct) : new Float64Array(n).fill(NaN));
    c.set('barcount', n);
  };
  E.tfIv = null;

  F.timeframerestore = () => {
    if (F.restorepricearrays) F.restorepricearrays();             // like AmiBroker: also resets SetForeign()
    if (E.tfSaved) {
      const s = E.tfSaved;
      E.bars = s.bars; E.n = s.n; E.O = s.O; E.H = s.H; E.Lw = s.Lw; E.C = s.C; E.V = s.V;
      for (const [k, v] of s.consts) { if (v === undefined) E.consts.delete(k); else E.consts.set(k, v); }
      E.tfSaved = null; E.tfIv = null;
    }
    return 0;
  };
  F.timeframeset = (a) => {
    const iv = S(a[0]);
    if (E.tfSaved) F.timeframerestore();                          // a second TimeFrameSet without Restore starts again from the base bars
    const ctx = ctxOf(iv);
    E.tfSaved = { bars: E.bars, n: E.n, O: E.O, H: E.H, Lw: E.Lw, C: E.C, V: E.V, consts: new Map(PRICE_KEYS.map((k) => [k, E.consts.get(k)])) };
    if (!ctx.arrs) ctx.arrs = { o: Float64Array.from(ctx.bars.o), h: Float64Array.from(ctx.bars.h), l: Float64Array.from(ctx.bars.l), c: Float64Array.from(ctx.bars.c), v: Float64Array.from(ctx.bars.v) };
    E.bars = ctx.bars; E.n = ctx.nc;
    E.O = ctx.arrs.o; E.H = ctx.arrs.h; E.Lw = ctx.arrs.l; E.C = ctx.arrs.c; E.V = ctx.arrs.v;
    setConsts(ctx.bars, ctx.arrs);
    E.tfIv = iv;
    return 0;
  };
  F.timeframecompress = (a) => {
    const arr = a[0], iv = S(a[1]), mode = a[2] === undefined ? 0 : S(a[2]);
    const ctx = ctxOf(iv);
    if (!isArr(arr)) return arr;
    const nb = E.bars0.t.length;
    if (arr.length !== nb) E.fail(`TimeFrameCompress: the array has ${arr.length} bars but the base time frame has ${nb}. Compress arrays while the formula is in its base time frame (after TimeFrameRestore).`);
    return compressArray(arr, ctx, mode);
  };
  F.timeframeexpand = (a) => {
    const arr = a[0], iv = S(a[1]), mode = a[2] === undefined ? 0 : S(a[2]);
    const ctx = ctxOf(iv);
    if (!isArr(arr)) return arr;
    if (arr.length !== ctx.nc) E.fail(`TimeFrameExpand: the array has ${arr.length} bars but the requested time frame has ${ctx.nc}. Pass an array made inside TimeFrameSet / TimeFrameCompress with the same interval.`);
    return expandArray(arr, ctx, mode, E.bars0.t.length);
  };
  F.timeframegetprice = (a) => {
    const field = String(a[0]).toUpperCase(), iv = S(a[1]), shift = a[2] === undefined ? 0 : S(a[2]), mode = a[3] === undefined ? 1 : S(a[3]);
    const ctx = ctxOf(iv), b = E.bars0;
    const src = { O: b.o, H: b.h, L: b.l, C: b.c, V: b.v }[field];
    let comp;
    if (field === 'I') comp = new Float64Array(ctx.nc);
    else if (!src) return E.fail('TimeFrameGetPrice: the first argument must be "O", "H", "L", "C", "V" or "I"');
    else comp = compressArray(Float64Array.from(src), ctx, { O: 1, H: 2, L: 3, C: 0, V: 4 }[field]);
    if (shift) {                                                  // Ref(): negative = past periods, positive = future periods
      const sh = new Float64Array(ctx.nc).fill(NaN);
      for (let k = 0; k < ctx.nc; k++) { const j = k + shift; if (j >= 0 && j < ctx.nc) sh[k] = comp[j]; }
      comp = sh;
    }
    return expandArray(comp, ctx, mode, b.t.length);
  };
  F.timeframemode = (a) => { if (a.length && S(a[0]) !== 0) E.fail('TimeFrameMode: only time-based bars are supported (tick, volume and range bars are not)'); return 0; };

  // foreign symbols follow the active time frame: Foreign("^NIFTY50","C") after TimeFrameSet(inWeekly) is the weekly index close
  E.tfForeign = (f) => {
    if (E.tfIv === null) return f;
    const hit = fcache.get(f);
    if (hit && hit.iv === E.tfIv) return hit.out;
    let out;
    try { out = compressBars(f, baseTf(), E.tfIv).bars; } catch (e) { E.fail(e.message); }
    fcache.set(f, { iv: E.tfIv, out });
    return out;
  };
  // Interval() reports the interval the formula is working in right now
  F.interval = () => (E.tfIv !== null ? E.tfIv : baseSeconds(baseTf()));
  return F;
}
