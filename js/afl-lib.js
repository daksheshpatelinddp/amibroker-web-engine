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
