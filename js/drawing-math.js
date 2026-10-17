// Pure maths of the drawing tools (no DOM): time <-> bar position, regression channels and the values Study() gives to formulas.
// A drawing point is { t: seconds, p: price }. t is the bar label read as a date (intraday labels keep their clock time), so a drawing
// stays where it is when the time frame changes. Bar position ("x") is a fractional index into the bars on screen.

/** 'YYYY-MM-DD' or 'YYYY-MM-DD HH:MM' -> seconds (NaN if not a date) */
export function tsOfLabel(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?/.exec(String(s));
  return m ? Date.UTC(+m[1], +m[2] - 1, +m[3], m[4] ? +m[4] : 0, m[5] ? +m[5] : 0) / 1000 : NaN;
}

/** Maps seconds <-> bar position for the bars of the chart. Beyond the last bar the typical bar spacing is used. */
export function makeTimeMap(labels) {
  const n = labels.length, ts = new Float64Array(n);
  for (let i = 0; i < n; i++) ts[i] = tsOfLabel(labels[i]);
  let step = 86400;
  if (n > 2) { const d = []; for (let i = Math.max(1, n - 21); i < n; i++) if (ts[i] > ts[i - 1]) d.push(ts[i] - ts[i - 1]); d.sort((a, b) => a - b); if (d.length) step = d[d.length >> 1]; }
  const first = n > 1 && ts[1] > ts[0] ? ts[1] - ts[0] : step;
  return {
    n, ts, step,
    idxOfTime(T) {
      if (!n) return 0;
      if (T >= ts[n - 1]) return n - 1 + (T - ts[n - 1]) / step;
      if (T <= ts[0]) return (T - ts[0]) / first;
      let lo = 0, hi = n - 1;
      while (hi - lo > 1) { const m = (lo + hi) >> 1; if (ts[m] <= T) lo = m; else hi = m; }
      return lo + (T - ts[lo]) / (ts[lo + 1] - ts[lo]);
    },
    timeOfIdx(x) {
      if (!n) return 0;
      if (x >= n - 1) return ts[n - 1] + (x - (n - 1)) * step;
      if (x <= 0) return ts[0] + x * first;
      const i = Math.floor(x); return ts[i] + (x - i) * (ts[i + 1] - ts[i]);
    },
  };
}

/** Value at position x of the line through (x1,y1) and (x2,y2); log = straight in a logarithmic chart. */
export function lineAt(x, x1, y1, x2, y2, log = false) {
  if (x2 === x1) return y1;
  const f = (x - x1) / (x2 - x1);
  if (log && y1 > 0 && y2 > 0) return Math.exp(Math.log(y1) + (Math.log(y2) - Math.log(y1)) * f);
  return y1 + (y2 - y1) * f;
}

/** Linear regression of arr over bars i1..i2: { a, b } with y = a + b * i (i = bar index), plus the residual spread. */
export function regression(arr, i1, i2) {
  let n = 0, sx = 0, sy = 0, sxx = 0, sxy = 0;
  for (let i = i1; i <= i2; i++) { const y = arr[i]; if (!Number.isFinite(y)) continue; n++; sx += i; sy += y; sxx += i * i; sxy += i * y; }
  if (n < 2) return null;
  const den = n * sxx - sx * sx, b = den === 0 ? 0 : (n * sxy - sx * sy) / den, a = (sy - b * sx) / n;
  let se = 0, mean = sy / n, sd = 0;
  for (let i = i1; i <= i2; i++) { const y = arr[i]; if (!Number.isFinite(y)) continue; const r = y - (a + b * i); se += r * r; sd += (y - mean) * (y - mean); }
  return { a, b, n, stderr: n > 2 ? Math.sqrt(se / (n - 2)) : 0, stddev: Math.sqrt(sd / n) };
}

/** The three lines of a regression channel over bars i1..i2 of the bars { c, h, l }. mode: 'raff' | 'stderr' | 'stddev'. */
export function channel(bars, i1, i2, mode, mult = 2) {
  const n = bars.c.length;
  i1 = Math.max(0, Math.min(n - 1, Math.round(i1))); i2 = Math.max(0, Math.min(n - 1, Math.round(i2)));
  if (i2 < i1) [i1, i2] = [i2, i1];
  const r = regression(bars.c, i1, i2); if (!r) return null;
  let up, dn;
  if (mode === 'raff') {
    up = 0; dn = 0;
    for (let i = i1; i <= i2; i++) { const m = r.a + r.b * i; if (Number.isFinite(bars.h[i])) up = Math.max(up, bars.h[i] - m); if (Number.isFinite(bars.l[i])) dn = Math.max(dn, m - bars.l[i]); }
  } else { const w = (mode === 'stderr' ? r.stderr : r.stddev) * mult; up = w; dn = w; }
  return { a: r.a, b: r.b, up, dn, i1, i2 };
}

/** The price levels a Fibonacci retracement draws, in order: [{ v, price, id, show }] (p1 = start of the move, p2 = end). */
export function fibRetrLevels(d) {
  const [p1, p2] = d.pts;
  return (d.levels || []).map((l) => ({ ...l, price: p2.p + (p1.p - p2.p) * l.v })).filter((l) => l.show && (!l.ext || d.showExt));
}
/** Fibonacci extension levels from three points: p3 + (p2 - p1) * level. */
export function fibExtLevels(d) {
  const [p1, p2, p3] = d.pts;
  return (d.levels || []).filter((l) => l.show).map((l) => ({ ...l, price: p3.p + (p2.p - p1.p) * l.v }));
}

function lineValues(n, x1, y1, x2, y2, { left = false, right = false, log = false } = {}) {
  const out = new Float64Array(n).fill(NaN), lo = Math.round(Math.min(x1, x2)), hi = Math.round(Math.max(x1, x2));
  for (let i = 0; i < n; i++) if ((i >= lo && i <= hi) || (left && i < lo) || (right && i > hi)) out[i] = lineAt(i, x1, y1, x2, y2, log);
  return out;
}

/**
 * What Study(id, chartId) can return for one drawing: [{ id, values: Float64Array(bars) }] with NaN where the line is not (yet) there.
 * bars = { t: labels, c, h, l }, tm = makeTimeMap(bars.t), log = the drawing is on a log chart.
 */
export function studiesOf(d, bars, tm, log = !!d.log) {
  const n = bars.t.length, out = [], X = (pt) => tm.idxOfTime(pt.t);
  if (!d.pts || !d.pts.length || !n) return out;
  const add = (id, values) => { if (id) out.push({ id: String(id).toUpperCase(), values }); };
  const [a, b, c] = d.pts;
  switch (d.type) {
    case 'trend': case 'arrow': case 'extended': case 'ray': {
      if (!b) break;
      const fwd = X(b) >= X(a), ray = d.type === 'ray' || d.type === 'extended';
      add(d.studyId, lineValues(n, X(a), a.p, X(b), b.p, { left: !!d.extL || d.type === 'extended' || (d.type === 'ray' && !fwd), right: !!d.extR || d.type === 'extended' || (d.type === 'ray' && fwd), log }));
      void ray; break;
    }
    case 'horizontal': add(d.studyId, new Float64Array(n).fill(a.p)); break;
    case 'parallel': {
      if (!b || !c) break;
      const o = { left: !!d.extL, right: !!d.extR, log };
      add(d.studyId, lineValues(n, X(a), a.p, X(b), b.p, o));
      const dx = X(b) - X(a), yAtC = lineAt(X(c), X(a), a.p, X(b), b.p, log), off = c.p - yAtC;
      add(d.studyId2, lineValues(n, X(a), a.p + off, X(b), b.p + off, o)); void dx; break;
    }
    case 'raff': case 'stderr': case 'stddev': {
      if (!b) break;
      const ch = channel(bars, X(a), X(b), d.type, Number(d.mult) || 2); if (!ch) break;
      const mk = (off) => { const v = new Float64Array(n).fill(NaN); for (let i = 0; i < n; i++) if ((i >= ch.i1 && i <= ch.i2) || (d.extR && i > ch.i2)) v[i] = ch.a + ch.b * i + off; return v; };
      add(d.studyId, mk(0)); add(d.studyIdUp, mk(ch.up)); add(d.studyIdDn, mk(-ch.dn)); break;
    }
    case 'fibRetr': {
      if (!b) break;
      const lo = Math.round(Math.min(X(a), X(b))), hi = Math.round(Math.max(X(a), X(b))) + Math.round(d.extFactor || 0);
      for (const l of fibRetrLevels(d)) { const v = new Float64Array(n).fill(NaN); for (let i = Math.max(0, lo); i <= Math.min(n - 1, hi); i++) v[i] = l.price; add(l.id, v); }
      break;
    }
    case 'fibExt': {
      if (!c) break;
      const x3 = Math.round(X(c)), hi = x3 + Math.round(d.extFactor || 0);
      for (const l of fibExtLevels(d)) { const v = new Float64Array(n).fill(NaN); for (let i = Math.max(0, x3); i <= Math.min(n - 1, hi); i++) v[i] = l.price; add(l.id, v); }
      break;
    }
    default: break;
  }
  return out;
}

/** Study(id, chartId): the first drawing with that Study ID on that chart that has values at a bar (later drawings fill the gaps). */
export function studyArray(drawings, id, chartId, bars, tm, scale = -1) {
  const n = bars.t.length, out = new Float64Array(n).fill(NaN), want = String(id || '').toUpperCase();
  if (!want) return out;
  for (const d of drawings || []) {
    if ((Number(d.chartId) || 1) !== (Number(chartId) || 1)) continue;
    for (const s of studiesOf(d, bars, tm, scale < 0 ? !!d.log : scale === 1)) {
      if (s.id !== want) continue;
      for (let i = 0; i < n; i++) if (Number.isNaN(out[i]) && !Number.isNaN(s.values[i])) out[i] = s.values[i];
    }
  }
  return out;
}
