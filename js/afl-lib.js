// AFL array function library. Pure functions on Float64Array (NaN = Null). No DOM.

export const isArr = (v) => v instanceof Float64Array;
export function newArr(n, v = NaN) { const a = new Float64Array(n); a.fill(v); return a; }
export function toArr(v, n) { return isArr(v) ? v : newArr(n, typeof v === 'number' ? v : NaN); }
const per = (p) => { p = Math.floor(Number(p)); return Number.isFinite(p) && p >= 1 ? p : NaN; };
const truthy = (x) => x !== 0 && !Number.isNaN(x);

export function ma(a, n) {
  n = per(n); const L = a.length, out = newArr(L);
  if (Number.isNaN(n)) return out;
  let sum = 0, run = 0;
  for (let i = 0; i < L; i++) {
    const v = a[i];
    if (Number.isNaN(v)) { run = 0; sum = 0; continue; }
    run++; sum += v;
    if (run > n) sum -= a[i - n];
    if (run >= n) out[i] = sum / n;
  }
  return out;
}

export function sum(a, n) {
  n = per(n); const L = a.length, out = newArr(L);
  if (Number.isNaN(n)) return out;
  let s = 0, run = 0;
  for (let i = 0; i < L; i++) {
    const v = a[i];
    if (Number.isNaN(v)) { run = 0; s = 0; continue; }
    run++; s += v;
    if (run > n) s -= a[i - n];
    if (run >= n) out[i] = s;
  }
  return out;
}

export function cum(a) {
  const out = newArr(a.length); let s = 0;
  for (let i = 0; i < a.length; i++) { if (Number.isNaN(a[i])) continue; s += a[i]; out[i] = s; }
  return out;
}

// Exponential average. AmiBroker style: starts from the first real value (no SMA seed).
function expAvg(a, k) {
  const out = newArr(a.length); let prev = NaN;
  for (let i = 0; i < a.length; i++) {
    const v = a[i];
    if (Number.isNaN(v)) { prev = NaN; continue; }
    prev = Number.isNaN(prev) ? v : prev + k * (v - prev);
    out[i] = prev;
  }
  return out;
}
export function ema(a, n) { n = per(n); return Number.isNaN(n) ? newArr(a.length) : expAvg(a, 2 / (n + 1)); }
export function wilders(a, n) { n = per(n); return Number.isNaN(n) ? newArr(a.length) : expAvg(a, 1 / n); }
export function wma(a, n) {
  n = per(n); const L = a.length, out = newArr(L);
  if (Number.isNaN(n)) return out;
  const den = n * (n + 1) / 2;
  for (let i = n - 1; i < L; i++) {
    let s = 0, ok = true;
    for (let j = 0; j < n; j++) { const v = a[i - j]; if (Number.isNaN(v)) { ok = false; break; } s += v * (n - j); }
    if (ok) out[i] = s / den;
  }
  return out;
}
export function dema(a, n) { const e1 = ema(a, n), e2 = ema(e1, n); return e1.map((v, i) => 2 * v - e2[i]); }
export function tema(a, n) {
  const e1 = ema(a, n), e2 = ema(e1, n), e3 = ema(e2, n);
  return e1.map((v, i) => 3 * v - 3 * e2[i] + e3[i]);
}

export function ref(a, k) {
  k = Math.trunc(Number(k)); const L = a.length, out = newArr(L);
  if (!Number.isFinite(k)) return out;
  // AFL: Ref(x,-1) is the PREVIOUS bar, Ref(x,1) looks one bar ahead
  for (let i = 0; i < L; i++) { const j = i + k; if (j >= 0 && j < L) out[i] = a[j]; }
  return out;
}

// Highest / lowest over the last n bars. Fewer bars are used at the start of the data.
function extreme(a, n, isMax, wantBars) {
  n = per(n); const L = a.length, out = newArr(L);
  if (Number.isNaN(n)) return out;
  for (let i = 0; i < L; i++) {
    let best = NaN, at = -1;
    for (let j = Math.max(0, i - n + 1); j <= i; j++) {
      const v = a[j];
      if (Number.isNaN(v)) continue;
      if (Number.isNaN(best) || (isMax ? v >= best : v <= best)) { best = v; at = j; }
    }
    out[i] = wantBars ? (at < 0 ? NaN : i - at) : best;
  }
  return out;
}
export const hhv = (a, n) => extreme(a, n, true, false);
export const llv = (a, n) => extreme(a, n, false, false);
export const hhvBars = (a, n) => extreme(a, n, true, true);
export const llvBars = (a, n) => extreme(a, n, false, true);
export function cumExtreme(a, isMax) {
  const out = newArr(a.length); let best = NaN;
  for (let i = 0; i < a.length; i++) {
    const v = a[i];
    if (!Number.isNaN(v) && (Number.isNaN(best) || (isMax ? v > best : v < best))) best = v;
    out[i] = best;
  }
  return out;
}

export function roc(a, n) {
  n = per(n); const out = newArr(a.length);
  if (Number.isNaN(n)) return out;
  for (let i = n; i < a.length; i++) if (a[i - n] !== 0) out[i] = 100 * (a[i] / a[i - n] - 1);
  return out;
}

export function stdev(a, n) {
  n = per(n); const L = a.length, out = newArr(L);
  if (Number.isNaN(n)) return out;
  for (let i = n - 1; i < L; i++) {
    let s = 0, ok = true;
    for (let j = i - n + 1; j <= i; j++) { if (Number.isNaN(a[j])) { ok = false; break; } s += a[j]; }
    if (!ok) continue;
    const m = s / n; let q = 0;
    for (let j = i - n + 1; j <= i; j++) q += (a[j] - m) * (a[j] - m);
    out[i] = Math.sqrt(q / n);
  }
  return out;
}

function linreg(a, n, what) {
  n = per(n); const L = a.length, out = newArr(L);
  if (Number.isNaN(n) || n < 2) return out;
  const sx = n * (n - 1) / 2, sxx = (n - 1) * n * (2 * n - 1) / 6, den = n * sxx - sx * sx;
  for (let i = n - 1; i < L; i++) {
    let sy = 0, sxy = 0, ok = true;
    for (let j = 0; j < n; j++) { const v = a[i - n + 1 + j]; if (Number.isNaN(v)) { ok = false; break; } sy += v; sxy += j * v; }
    if (!ok) continue;
    const slope = (n * sxy - sx * sy) / den, icpt = (sy - slope * sx) / n;
    out[i] = what === 'slope' ? slope : what === 'icpt' ? icpt : icpt + slope * n;
  }
  return out;
}
export const linRegSlope = (a, n) => linreg(a, n, 'slope');
export const linRegIntercept = (a, n) => linreg(a, n, 'icpt');
export const tsf = (a, n) => linreg(a, n, 'tsf');

export function correlation(a, b, n) {
  n = per(n); const L = a.length, out = newArr(L);
  if (Number.isNaN(n)) return out;
  for (let i = n - 1; i < L; i++) {
    let sa = 0, sb = 0, ok = true;
    for (let j = i - n + 1; j <= i; j++) { if (Number.isNaN(a[j]) || Number.isNaN(b[j])) { ok = false; break; } sa += a[j]; sb += b[j]; }
    if (!ok) continue;
    const ma_ = sa / n, mb = sb / n; let c = 0, va = 0, vb = 0;
    for (let j = i - n + 1; j <= i; j++) { const x = a[j] - ma_, y = b[j] - mb; c += x * y; va += x * x; vb += y * y; }
    out[i] = va > 0 && vb > 0 ? c / Math.sqrt(va * vb) : NaN;
  }
  return out;
}

// ---- price based indicators ----
export function trueRange(h, l, c) {
  const out = newArr(h.length);
  for (let i = 0; i < h.length; i++) {
    out[i] = i === 0 ? h[i] - l[i] : Math.max(h[i] - l[i], Math.abs(h[i] - c[i - 1]), Math.abs(l[i] - c[i - 1]));
  }
  return out;
}
export const atr = (h, l, c, n) => wilders(trueRange(h, l, c), n);

function dirMove(h, l) {
  const L = h.length, pdm = newArr(L, 0), mdm = newArr(L, 0);
  for (let i = 1; i < L; i++) {
    const up = h[i] - h[i - 1], dn = l[i - 1] - l[i];
    pdm[i] = up > dn && up > 0 ? up : 0;
    mdm[i] = dn > up && dn > 0 ? dn : 0;
  }
  return { pdm, mdm };
}
export function pdi(h, l, c, n) {
  const { pdm } = dirMove(h, l), a = atr(h, l, c, n), s = wilders(pdm, n);
  return s.map((v, i) => (a[i] > 0 ? 100 * v / a[i] : NaN));
}
export function mdi(h, l, c, n) {
  const { mdm } = dirMove(h, l), a = atr(h, l, c, n), s = wilders(mdm, n);
  return s.map((v, i) => (a[i] > 0 ? 100 * v / a[i] : NaN));
}
export function adx(h, l, c, n) {
  const p = pdi(h, l, c, n), m = mdi(h, l, c, n);
  const dx = p.map((v, i) => (v + m[i] > 0 ? 100 * Math.abs(v - m[i]) / (v + m[i]) : NaN));
  return wilders(dx, n);
}

export function cci(h, l, c, n) {
  n = per(n); const L = c.length, out = newArr(L);
  if (Number.isNaN(n)) return out;
  const tp = c.map((v, i) => (h[i] + l[i] + v) / 3), m = ma(tp, n);
  for (let i = n - 1; i < L; i++) {
    if (Number.isNaN(m[i])) continue;
    let d = 0;
    for (let j = i - n + 1; j <= i; j++) d += Math.abs(tp[j] - m[i]);
    d /= n;
    out[i] = d > 0 ? (tp[i] - m[i]) / (0.015 * d) : 0;
  }
  return out;
}

export function stochK(h, l, c, n, k) {
  const hh = hhv(h, n), ll = llv(l, n);
  const raw = c.map((v, i) => (hh[i] > ll[i] ? 100 * (v - ll[i]) / (hh[i] - ll[i]) : NaN));
  return per(k) > 1 ? ma(raw, k) : raw;
}

export function mfi(h, l, c, v, n) {
  n = per(n); const L = c.length, out = newArr(L);
  if (Number.isNaN(n)) return out;
  const tp = c.map((x, i) => (h[i] + l[i] + x) / 3);
  const pos = newArr(L, 0), neg = newArr(L, 0);
  for (let i = 1; i < L; i++) {
    const mf = tp[i] * v[i];
    if (tp[i] > tp[i - 1]) pos[i] = mf; else if (tp[i] < tp[i - 1]) neg[i] = mf;
  }
  const sp = sum(pos, n), sn = sum(neg, n);
  for (let i = 0; i < L; i++) if (!Number.isNaN(sp[i]) && !Number.isNaN(sn[i])) out[i] = sn[i] === 0 ? 100 : 100 - 100 / (1 + sp[i] / sn[i]);
  return out;
}

export function obv(c, v) {
  const out = newArr(c.length); let s = 0;
  for (let i = 0; i < c.length; i++) {
    if (i > 0) { if (c[i] > c[i - 1]) s += v[i]; else if (c[i] < c[i - 1]) s -= v[i]; }
    out[i] = s;
  }
  return out;
}

export function rsiA(a, n) {
  n = per(n); const L = a.length, out = newArr(L);
  if (Number.isNaN(n)) return out;
  const up = newArr(L, 0), dn = newArr(L, 0);
  for (let i = 1; i < L; i++) {
    const d = a[i] - a[i - 1];
    if (Number.isNaN(d)) { up[i] = NaN; dn[i] = NaN; continue; }
    if (d > 0) up[i] = d; else dn[i] = -d;
  }
  const au = wilders(up, n), ad = wilders(dn, n);
  for (let i = n; i < L; i++) out[i] = ad[i] === 0 ? 100 : 100 - 100 / (1 + au[i] / ad[i]);
  return out;
}

export function psar(h, l, acc, mx) {
  const L = h.length, out = newArr(L);
  if (L < 2) return out;
  let bull = true, af = acc, ep = h[0], sar = l[0];
  out[0] = sar;
  for (let i = 1; i < L; i++) {
    sar = sar + af * (ep - sar);
    if (bull) {
      sar = Math.min(sar, l[i - 1], i >= 2 ? l[i - 2] : l[i - 1]);
      if (l[i] < sar) { bull = false; sar = ep; ep = l[i]; af = acc; }
      else if (h[i] > ep) { ep = h[i]; af = Math.min(af + acc, mx); }
    } else {
      sar = Math.max(sar, h[i - 1], i >= 2 ? h[i - 2] : h[i - 1]);
      if (h[i] > sar) { bull = true; sar = ep; ep = h[i]; af = acc; }
      else if (l[i] < ep) { ep = l[i]; af = Math.min(af + acc, mx); }
    }
    out[i] = sar;
  }
  return out;
}

// ---- logic / series helpers ----
export function cross(a, b) {
  const L = a.length, out = newArr(L, 0);
  for (let i = 1; i < L; i++) out[i] = (a[i] > b[i] && a[i - 1] <= b[i - 1]) ? 1 : 0;
  return out;
}
export function flip(a, b) {
  const out = newArr(a.length, 0); let s = 0;
  for (let i = 0; i < a.length; i++) { if (truthy(a[i])) s = 1; else if (truthy(b[i])) s = 0; out[i] = s; }
  return out;
}
export function barsSince(c) {
  const out = newArr(c.length); let last = -1;
  for (let i = 0; i < c.length; i++) { if (truthy(c[i])) last = i; if (last >= 0) out[i] = i - last; }
  return out;
}
export function valueWhen(c, a, n) {
  n = per(n) || 1; const out = newArr(c.length), hist = [];
  for (let i = 0; i < c.length; i++) {
    if (truthy(c[i])) hist.push(a[i]);
    if (hist.length >= n) out[i] = hist[hist.length - n];
  }
  return out;
}
export function sinceExtreme(c, a, n, isMax) {
  n = per(n) || 1; const out = newArr(c.length);
  const starts = []; // indexes where c was true
  for (let i = 0; i < c.length; i++) {
    if (truthy(c[i])) starts.push(i);
    if (starts.length >= n) {
      const from = starts[starts.length - n]; let best = NaN;
      for (let j = from; j <= i; j++) { const v = a[j]; if (!Number.isNaN(v) && (Number.isNaN(best) || (isMax ? v > best : v < best))) best = v; }
      out[i] = best;
    }
  }
  return out;
}

// ---- zig-zag family. A swing is "confirmed" once price has moved `pct` percent away from the extreme.
// Returns the confirmed peaks and troughs in the order they were confirmed:
//   { peaks:[{idx, val, at}], troughs:[...], pivots:[{idx,val}] }   (at = bar on which it became known)
export function swings(a, pct) {
  const L = a.length, peaks = [], troughs = [], pivots = [];
  pct = Number(pct);
  if (!(pct > 0) || L === 0) return { peaks, troughs, pivots };
  let start = 0; while (start < L && Number.isNaN(a[start])) start++;
  if (start >= L) return { peaks, troughs, pivots };
  let dir = 0, hi = a[start], hiI = start, lo = a[start], loI = start;
  pivots.push({ idx: start, val: a[start] });
  for (let i = start + 1; i < L; i++) {
    const v = a[i]; if (Number.isNaN(v)) continue;
    if (v > hi) { hi = v; hiI = i; }
    if (v < lo) { lo = v; loI = i; }
    if (dir >= 0 && v <= hi * (1 - pct / 100) && hiI >= loI) {          // fell far enough from the high: peak confirmed
      peaks.push({ idx: hiI, val: hi, at: i }); pivots.push({ idx: hiI, val: hi });
      dir = -1; lo = v; loI = i; hi = v; hiI = i;
    } else if (dir <= 0 && v >= lo * (1 + pct / 100) && loI >= hiI) {   // rose far enough from the low: trough confirmed
      troughs.push({ idx: loI, val: lo, at: i }); pivots.push({ idx: loI, val: lo });
      dir = 1; hi = v; hiI = i; lo = v; loI = i;
    }
  }
  return { peaks, troughs, pivots };
}

// Zig: straight lines between the confirmed pivots; the last leg runs to the final bar (so it can repaint, as in AmiBroker).
export function zig(a, pct) {
  const L = a.length, out = newArr(L), { pivots } = swings(a, pct);
  if (!pivots.length) return out;
  const pts = pivots.slice();
  let lastReal = L - 1; while (lastReal > 0 && Number.isNaN(a[lastReal])) lastReal--;
  if (pts[pts.length - 1].idx !== lastReal) pts.push({ idx: lastReal, val: a[lastReal] });
  for (let k = 0; k + 1 < pts.length; k++) {
    const p = pts[k], q = pts[k + 1];
    for (let i = p.idx; i <= q.idx; i++) out[i] = p.val + (q.val - p.val) * (i - p.idx) / Math.max(1, q.idx - p.idx);
  }
  return out;
}

// Peak / Trough / PeakBars / TroughBars: the n-th most recent confirmed swing, only using data known at each bar (no look-ahead).
export function swingSeries(a, pct, n, isPeak, wantBars) {
  n = Math.max(1, Math.floor(Number(n)) || 1);
  const L = a.length, out = newArr(L), s = swings(a, pct), list = isPeak ? s.peaks : s.troughs;
  let k = 0;                                     // how many swings are known so far
  for (let i = 0; i < L; i++) {
    while (k < list.length && list[k].at <= i) k++;
    if (k >= n) { const sw = list[k - n]; out[i] = wantBars ? i - sw.idx : sw.val; }
  }
  return out;
}

// ======================================================================= more AmiBroker indicators
export const linearReg = (a, n) => { const s = linRegSlope(a, n), i = linRegIntercept(a, n); return i.map((v, k) => v + s[k] * (per(n) - 1)); };

// AMA: out[i] = out[i-1] + k * (a[i] - out[i-1]); k may be a number or an array
export function ama(a, k) {
  const out = newArr(a.length); let prev = NaN;
  for (let i = 0; i < a.length; i++) {
    const kk = isArr(k) ? k[i] : k, v = a[i];
    if (Number.isNaN(v)) continue;
    prev = Number.isNaN(prev) ? v : prev + kk * (v - prev);
    out[i] = prev;
  }
  return out;
}
export function accDist(h, l, c, v) {
  const out = newArr(h.length); let s = 0;
  for (let i = 0; i < h.length; i++) { const r = h[i] - l[i]; s += r > 0 ? ((c[i] - l[i]) - (h[i] - c[i])) / r * v[i] : 0; out[i] = s; }
  return out;
}
export function chaikin(h, l, c, v, r1, r2) { const ad = accDist(h, l, c, v), a = ema(ad, r1), b = ema(ad, r2); return a.map((x, i) => x - b[i]); }
function volIndex(c, v, negative) {
  const out = newArr(c.length); let p = 100;
  for (let i = 0; i < c.length; i++) {
    if (i > 0 && c[i - 1] !== 0 && (negative ? v[i] < v[i - 1] : v[i] > v[i - 1])) p *= c[i] / c[i - 1];
    out[i] = p;
  }
  return out;
}
export const nvi = (c, v) => volIndex(c, v, true);
export const pvi = (c, v) => volIndex(c, v, false);
export function osc(a, f, s) { const x = ma(a, f), y = ma(a, s); return x.map((v, i) => (v ? 100 * (v - y[i]) / v : NaN)); }
export function rmi(c, p, m) {
  m = per(m) || 1; const L = c.length, up = newArr(L, 0), dn = newArr(L, 0);
  for (let i = m; i < L; i++) { const d = c[i] - c[i - m]; if (d > 0) up[i] = d; else dn[i] = -d; }
  const a = wilders(up, p), b = wilders(dn, p), out = newArr(L);
  for (let i = m; i < L; i++) out[i] = a[i] + b[i] > 0 ? 100 * a[i] / (a[i] + b[i]) : NaN;
  return out;
}
export function rwi(h, l, c, minP, maxP, which) {
  const L = h.length, tr = trueRange(h, l, c), out = newArr(L);
  minP = per(minP); maxP = per(maxP);
  for (let i = 0; i < L; i++) {
    let best = NaN;
    for (let n = minP; n <= maxP && i - n >= 0; n++) {
      let s = 0; for (let j = i - n + 1; j <= i; j++) s += tr[j];
      const atrN = s / n; if (!(atrN > 0)) continue;
      const hi = (h[i] - l[i - n]) / (atrN * Math.sqrt(n)), lo = (h[i - n] - l[i]) / (atrN * Math.sqrt(n));
      const v = which === 'hi' ? hi : which === 'lo' ? lo : Math.max(hi, lo);
      if (Number.isNaN(best) || v > best) best = v;
    }
    out[i] = best;
  }
  return out;
}
export function ultimate(h, l, c, r1, r2, r3) {
  const L = h.length, bp = newArr(L), tr = newArr(L);
  for (let i = 1; i < L; i++) { const lo = Math.min(l[i], c[i - 1]), hi = Math.max(h[i], c[i - 1]); bp[i] = c[i] - lo; tr[i] = hi - lo; }
  const avg = (k) => { const a = sum(bp, k), b = sum(tr, k); return a.map((v, i) => (b[i] > 0 ? v / b[i] : NaN)); };
  const a1 = avg(r1), a2 = avg(r2), a3 = avg(r3);
  return a1.map((v, i) => 100 * (4 * v + 2 * a2[i] + a3[i]) / 7);
}
export function trix(c, p) { return roc(ema(ema(ema(c, p), p), p), 1); }
export function relStrength(c, base) {
  const out = newArr(c.length); let k = NaN;
  for (let i = 0; i < c.length; i++) {
    const r = c[i] / base[i]; if (!Number.isFinite(r)) continue;
    if (Number.isNaN(k)) k = r; out[i] = 100 * r / k;
  }
  return out;
}
export function median(a, n) {
  n = per(n); const out = newArr(a.length); if (Number.isNaN(n)) return out;
  for (let i = n - 1; i < a.length; i++) { const w = Array.from(a.subarray(i - n + 1, i + 1)).sort((x, y) => x - y); out[i] = n % 2 ? w[(n - 1) / 2] : (w[n / 2 - 1] + w[n / 2]) / 2; }
  return out;
}
export function percentRank(a, n) {
  n = per(n); const out = newArr(a.length); if (Number.isNaN(n)) return out;
  for (let i = n - 1; i < a.length; i++) { let k = 0; for (let j = i - n + 1; j <= i; j++) if (a[j] < a[i]) k++; out[i] = 100 * k / (n - 1 || 1); }
  return out;
}
export function resampleHelper() {}
