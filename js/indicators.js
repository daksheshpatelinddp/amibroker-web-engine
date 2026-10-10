// Pure calculation helpers. Every function takes and returns plain arrays.
// NaN means "no value here" (for example delivery before NSE published it).

export function sma(values, period) {
  const n = values.length;
  const out = new Array(n).fill(NaN);
  period = Math.floor(period);
  if (!(period >= 1)) return out;
  let sum = 0, nans = 0;
  for (let i = 0; i < n; i++) {
    const v = values[i];
    if (Number.isNaN(v)) nans++; else sum += v;
    if (i >= period) {
      const old = values[i - period];
      if (Number.isNaN(old)) nans--; else sum -= old;
    }
    if (i >= period - 1 && nans === 0) out[i] = sum / period;
  }
  return out;
}

// Exponential average, seeded with the simple average of the first `period` values.
// A gap (NaN) restarts it, so missing data never produces made-up numbers.
export function ema(values, period) {
  const n = values.length;
  const out = new Array(n).fill(NaN);
  period = Math.floor(period);
  if (!(period >= 1)) return out;
  const k = 2 / (period + 1);
  let prev = NaN, run = 0, seed = 0;
  for (let i = 0; i < n; i++) {
    const v = values[i];
    if (Number.isNaN(v)) { prev = NaN; run = 0; seed = 0; continue; }
    if (Number.isNaN(prev)) {
      run++; seed += v;
      if (run === period) { prev = seed / period; out[i] = prev; }
    } else {
      prev = v * k + prev * (1 - k);
      out[i] = prev;
    }
  }
  return out;
}

// Wilder's RSI
export function rsi(values, period = 14) {
  const n = values.length;
  const out = new Array(n).fill(NaN);
  period = Math.floor(period);
  if (!(period >= 1) || n <= period) return out;
  let gain = 0, loss = 0;
  for (let i = 1; i <= period; i++) {
    const d = values[i] - values[i - 1];
    gain += Math.max(d, 0); loss += Math.max(-d, 0);
  }
  let avgG = gain / period, avgL = loss / period;
  out[period] = avgL === 0 ? 100 : 100 - 100 / (1 + avgG / avgL);
  for (let i = period + 1; i < n; i++) {
    const d = values[i] - values[i - 1];
    avgG = (avgG * (period - 1) + Math.max(d, 0)) / period;
    avgL = (avgL * (period - 1) + Math.max(-d, 0)) / period;
    out[i] = avgL === 0 ? 100 : 100 - 100 / (1 + avgG / avgL);
  }
  return out;
}

export function macd(values, fast = 12, slow = 26, signal = 9) {
  const f = ema(values, fast), s = ema(values, slow);
  const line = values.map((_, i) => (Number.isNaN(f[i]) || Number.isNaN(s[i])) ? NaN : f[i] - s[i]);
  const sig = ema(line, signal);
  const hist = line.map((v, i) => (Number.isNaN(v) || Number.isNaN(sig[i])) ? NaN : v - sig[i]);
  return { line, signal: sig, hist };
}

// Rate of change in percent
export function roc(values, period = 12) {
  period = Math.floor(period);
  return values.map((v, i) => (i >= period && values[i - period] > 0) ? (v / values[i - period] - 1) * 100 : NaN);
}

// Rows from the data engines -> aligned arrays (sorted, one bar per date, real prices only)
export function barsToArrays(rows) {
  const seen = new Set();
  const list = [];
  for (const r of rows || []) {
    const t = String(r.date || '').slice(0, 10);
    if (!t || seen.has(t) || !(r.close > 0)) continue;
    seen.add(t);
    list.push({ t, r });
  }
  list.sort((a, b) => (a.t < b.t ? -1 : 1));
  const out = { t: [], o: [], h: [], l: [], c: [], v: [], dq: [], delpct: [] };
  for (const { t, r } of list) {
    out.t.push(t);
    out.o.push(r.open); out.h.push(r.high); out.l.push(r.low); out.c.push(r.close);
    const v = Number.isFinite(r.volume) ? r.volume : NaN;
    const dq = (r.delivery === undefined || r.delivery === null) ? NaN : Number(r.delivery);
    out.v.push(v);
    out.dq.push(Number.isFinite(dq) ? dq : NaN);
    out.delpct.push(Number.isFinite(dq) && v > 0 ? (dq / v) * 100 : NaN);
  }
  return out;
}

// The data series a pane or a custom line can be built from
export const SOURCES = {
  close: 'Close', open: 'Open', high: 'High', low: 'Low',
  volume: 'Volume', delivery: 'Delivery qty', delpct: 'Delivery %',
};

export function sourceArray(arrays, name) {
  switch (name) {
    case 'open': return arrays.o;
    case 'high': return arrays.h;
    case 'low': return arrays.l;
    case 'volume': return arrays.v;
    case 'delivery': return arrays.dq;
    case 'delpct': return arrays.delpct;
    default: return arrays.c;
  }
}

export function applyTransform(values, transform, period) {
  switch (transform) {
    case 'sma': return sma(values, period);
    case 'ema': return ema(values, period);
    case 'rsi': return rsi(values, period);
    case 'roc': return roc(values, period);
    default: return values.slice();
  }
}
