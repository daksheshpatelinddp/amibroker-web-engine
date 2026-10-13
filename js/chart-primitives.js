// Custom drawings for Lightweight Charts v5 (series primitives): shaded cloud between two lines, and Volume-at-Price.
// A primitive is attached to a series and draws on the pane canvas using the chart's own coordinate conversions.

function hexToRgba(hex, a) {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})/i.exec(hex || '');
  if (!m) return `rgba(148,163,184,${a})`;
  return `rgba(${parseInt(m[1], 16)},${parseInt(m[2], 16)},${parseInt(m[3], 16)},${a})`;
}

/** Cloud: fills between top[] and bottom[] for each bar, coloured per bar. */
export class CloudPrimitive {
  constructor({ times, top, bottom, colors, alpha = 0.35, behind = true }) {
    this.times = times; this.top = top; this.bottom = bottom; this.colors = colors; this.alpha = alpha; this.behind = behind;
    const self = this;
    this._view = {
      zOrder: () => (self.behind ? 'bottom' : 'top'),
      renderer: () => ({
        draw: (target) => target.useMediaCoordinateSpace((scope) => self._draw(scope.context)),
      }),
    };
  }
  attached({ chart, series, requestUpdate }) { this.chart = chart; this.series = series; this.request = requestUpdate; }
  detached() { this.chart = null; this.series = null; }
  updateAllViews() {}
  paneViews() { return [this._view]; }
  _draw(ctx) {
    if (!this.chart || !this.series) return;
    const ts = this.chart.timeScale(), n = this.times.length;
    const xs = new Array(n), yt = new Array(n), yb = new Array(n);
    for (let i = 0; i < n; i++) {
      xs[i] = ts.timeToCoordinate(this.times[i]);
      yt[i] = Number.isFinite(this.top[i]) ? this.series.priceToCoordinate(this.top[i]) : null;
      yb[i] = Number.isFinite(this.bottom[i]) ? this.series.priceToCoordinate(this.bottom[i]) : null;
    }
    const ok = (i) => xs[i] !== null && xs[i] !== undefined && yt[i] !== null && yb[i] !== null && yt[i] !== undefined && yb[i] !== undefined;
    let i = 0;
    while (i < n) {
      if (!ok(i)) { i++; continue; }
      let j = i; const col = this.colors[i];
      while (j + 1 < n && ok(j + 1) && this.colors[j + 1] === col) j++;
      // polygon from i..j (include one more point so neighbouring colours touch)
      const end = Math.min(n - 1, j + 1 < n && ok(j + 1) ? j + 1 : j);
      ctx.beginPath();
      ctx.moveTo(xs[i], yt[i]);
      for (let k = i + 1; k <= end; k++) ctx.lineTo(xs[k], yt[k]);
      for (let k = end; k >= i; k--) ctx.lineTo(xs[k], yb[k]);
      ctx.closePath();
      ctx.fillStyle = hexToRgba(col, this.alpha);
      ctx.fill();
      i = j + 1;
    }
  }
}

/** Volume at Price: horizontal bars at the left or right edge. segments = null (visible range) or array (1 = start of a new segment). */
export class VapPrimitive {
  constructor({ times, high, low, volume, spec, color }) {
    this.times = times; this.high = high; this.low = low; this.volume = volume; this.spec = spec; this.color = color;
    const side = (spec.flags & 1) ? 'right' : 'left', lines = !!(spec.flags & 2), behind = !!(spec.flags & 4);
    this.side = side; this.asLines = lines;
    const self = this;
    this._view = {
      zOrder: () => (behind ? 'bottom' : 'top'),
      renderer: () => ({ draw: (target) => target.useMediaCoordinateSpace((scope) => self._draw(scope.context, scope.mediaSize)) }),
    };
  }
  attached({ chart, series }) { this.chart = chart; this.series = series; }
  detached() { this.chart = null; this.series = null; }
  updateAllViews() {}
  paneViews() { return [this._view]; }
  _ranges() {
    const n = this.times.length, vr = this.chart.timeScale().getVisibleLogicalRange();
    const a = Math.max(0, Math.floor(vr ? vr.from : 0)), b = Math.min(n - 1, Math.ceil(vr ? vr.to : n - 1));
    const seg = this.spec.segments;
    if (!seg) return [[a, b]];
    const out = []; let start = 0;
    for (let i = 1; i <= n; i++) if (i === n || seg[i]) { if (i - 1 >= a && start <= b) out.push([start, i - 1]); start = i; }
    return out;
  }
  _draw(ctx, size) {
    if (!this.chart || !this.series) return;
    const ts = this.chart.timeScale(), lines = Math.max(10, Math.min(1000, this.spec.lines | 0 || 300));
    const widthPct = Math.max(1, Math.min(100, this.spec.width || 10)) / 100;
    for (const [a, b] of this._ranges()) {
      let lo = Infinity, hi = -Infinity;
      for (let i = a; i <= b; i++) { if (this.low[i] < lo) lo = this.low[i]; if (this.high[i] > hi) hi = this.high[i]; }
      if (!(hi > lo)) continue;
      const bins = new Float64Array(lines), step = (hi - lo) / lines; let mx = 0;
      for (let i = a; i <= b; i++) {
        const v = this.volume[i]; if (!(v > 0)) continue;
        const k0 = Math.min(lines - 1, Math.floor((this.low[i] - lo) / step)), k1 = Math.min(lines - 1, Math.floor((this.high[i] - lo) / step));
        const share = v / (k1 - k0 + 1);
        for (let k = k0; k <= k1; k++) bins[k] += share;
      }
      for (let k = 0; k < lines; k++) if (bins[k] > mx) mx = bins[k];
      if (!mx) continue;
      let x0, x1;
      if (this.spec.segments) { x0 = ts.timeToCoordinate(this.times[a]); x1 = ts.timeToCoordinate(this.times[b]); if (x0 == null || x1 == null) continue; }
      else { x0 = 0; x1 = size.width; }
      const maxW = (x1 - x0) * (this.spec.segments ? widthPct : widthPct * 3);
      ctx.fillStyle = hexToRgba(this.color, 0.45); ctx.strokeStyle = hexToRgba(this.color, 0.8);
      for (let k = 0; k < lines; k++) {
        if (!bins[k]) continue;
        const y1 = this.series.priceToCoordinate(lo + step * k), y2 = this.series.priceToCoordinate(lo + step * (k + 1));
        if (y1 == null || y2 == null) continue;
        const w = maxW * bins[k] / mx, top = Math.min(y1, y2), h = Math.max(1, Math.abs(y1 - y2) - 0.5);
        const x = this.side === 'right' ? x1 - w : x0;
        if (this.asLines) { ctx.beginPath(); ctx.moveTo(x, top + h / 2); ctx.lineTo(x + w, top + h / 2); ctx.stroke(); } else ctx.fillRect(x, top, w, h);
      }
    }
  }
}
