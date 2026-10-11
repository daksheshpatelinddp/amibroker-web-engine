/**
 * ChartEngine - one chart with several stacked panes (TradingView Lightweight Charts v5).
 * The chart is rebuilt from the sheet's pane list whenever something changes; that keeps the
 * code simple and means what you see always matches the saved layout.
 */
import { barsToArrays, sma, ema, rsi, macd, sourceArray, applyTransform } from './indicators.js';
import { paneTitle, overlayTitle } from './workspace.js';
import { aflEngine, colorToHex, shapeKind } from './afl-engine.js';
import { formulaStore } from './formula-store.js';

const COLORS = { up: '#22c55e', down: '#ef4444', grid: '#1e293b', border: '#334155', text: '#94a3b8', bg: '#020617' };
const DEFAULT_BARS_SHOWN = 250;   // a fresh chart opens on about one year; "Fit" shows everything

export class ChartEngine {
  constructor(containerId, labelsId) {
    this.container = document.getElementById(containerId);
    this.labels = document.getElementById(labelsId);
    this.chart = null;
    this.arrays = null;
    this.mainSeries = null;
    this.sheet = null;
    this.onHover = null;       // (barIndex | null) => void
    this.onPaneClick = null;   // (paneId) => void
    this.onFormulaErrors = null; // (paneId, errors[]) => void   called after a draw when a formula had problems
    this.paneInfo = new Map(); // paneId -> { errors, params, legend, notes } for formula panes
    this._labelTimer = null;
    if (this.container && typeof ResizeObserver !== 'undefined') {
      new ResizeObserver(() => this._scheduleLabels()).observe(this.container);
    }
    if (this.container) {
      // after dragging a divider between panes the label positions must follow
      ['pointerup', 'touchend', 'mouseup'].forEach(ev => this.container.addEventListener(ev, () => this._scheduleLabels()));
    }
  }

  init() { /* the chart is created when the first data arrives */ }

  get barCount() { return this.arrays ? this.arrays.t.length : 0; }

  barAt(i) {
    const a = this.arrays;
    if (!a || i < 0 || i >= a.t.length) return null;
    return { date: a.t[i], open: a.o[i], high: a.h[i], low: a.l[i], close: a.c[i], volume: a.v[i], delivery: a.dq[i],
             prevClose: i > 0 ? a.c[i - 1] : NaN };
  }

  /** Draws the sheet's panes for the given rows. keepRange = keep the zoom (used when only panes changed). */
  render(sheet, rows, { keepRange = false } = {}) {
    const LWC = window.LightweightCharts;
    if (!LWC) throw new Error('Chart library (LightweightCharts) did not load');
    if (!this.container) return;

    let prevRange = null;
    if (this.chart) {
      if (keepRange) { try { prevRange = this.chart.timeScale().getVisibleLogicalRange(); } catch (e) { /* ignore */ } }
      try { this.chart.remove(); } catch (e) { /* ignore */ }
      this.chart = null;
    }
    this.container.innerHTML = '';
    this.sheet = sheet;
    this.arrays = barsToArrays(rows);
    this.mainSeries = null;
    this.paneInfo = new Map();

    const chart = LWC.createChart(this.container, {
      autoSize: true,
      localization: { locale: 'en-IN' },   // fixed, so an odd browser language setting can never break the chart
      layout: { background: { color: COLORS.bg }, textColor: COLORS.text, fontSize: 11, panes: { separatorColor: COLORS.border, separatorHoverColor: '#475569' } },
      grid: { vertLines: { color: COLORS.grid }, horzLines: { color: COLORS.grid } },
      crosshair: { mode: LWC.CrosshairMode ? LWC.CrosshairMode.Normal : 1 },
      rightPriceScale: { borderColor: COLORS.border, scaleMargins: { top: 0.1, bottom: 0.08 } },
      timeScale: { borderColor: COLORS.border, timeVisible: false, rightOffset: 4 },
    });
    this.chart = chart;

    sheet.panes.forEach((pane, idx) => this._buildPane(chart, LWC, pane, idx));

    const panes = chart.panes();
    sheet.panes.forEach((p, i) => { if (panes[i]) panes[i].setStretchFactor(p.weight || 1); });

    chart.subscribeCrosshairMove((param) => {
      if (!this.onHover) return;
      if (!param || param.logical === undefined || param.logical === null || !param.point) { this.onHover(null); return; }
      const i = Math.round(param.logical);
      this.onHover(i >= 0 && i < this.barCount ? i : null);
    });

    const n = this.barCount;
    if (n > 0) {
      try {
        if (prevRange) chart.timeScale().setVisibleLogicalRange(prevRange);
        else if (n > DEFAULT_BARS_SHOWN + 50) chart.timeScale().setVisibleLogicalRange({ from: n - DEFAULT_BARS_SHOWN, to: n + 4 });
        else chart.timeScale().fitContent();
      } catch (e) { chart.timeScale().fitContent(); }
    }
    this._scheduleLabels();
    if (this.onFormulaErrors) {
      for (const [paneId, info] of this.paneInfo) if (info.errors.length) this.onFormulaErrors(paneId, info.errors);
    }
  }

  // ---- building one pane ----
  _buildPane(chart, LWC, pane, idx) {
    const a = this.arrays;
    const t = a.t;
    const pts = (vals) => t.map((time, i) => (Number.isFinite(vals[i]) ? { time, value: vals[i] } : { time }));
    const line = (vals, color, opts = {}) => {
      const s = chart.addSeries(LWC.LineSeries, {
        color, lineWidth: 1, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false, ...opts,
      }, idx);
      s.setData(pts(vals));
      return s;
    };
    const overlays = (baseValues) => {
      for (const o of pane.overlays || []) {
        const vals = o.type === 'ema' ? ema(baseValues, o.period) : sma(baseValues, o.period);
        line(vals, o.color, { lineWidth: 2, title: overlayTitle(o) });
      }
    };
    const volumeFormat = { type: 'volume' };

    switch (pane.kind) {
      case 'price': {
        const s = chart.addSeries(LWC.CandlestickSeries, {
          upColor: COLORS.up, downColor: COLORS.down, borderVisible: false,
          wickUpColor: COLORS.up, wickDownColor: COLORS.down, priceLineVisible: true,
        }, idx);
        s.setData(t.map((time, i) => ({ time, open: a.o[i], high: a.h[i], low: a.l[i], close: a.c[i] })));
        if (!this.mainSeries) this.mainSeries = s;
        overlays(a.c);
        break;
      }
      case 'volume': {
        const s = chart.addSeries(LWC.HistogramSeries, { priceFormat: volumeFormat, priceLineVisible: false, lastValueVisible: false }, idx);
        s.setData(t.map((time, i) => (Number.isFinite(a.v[i])
          ? { time, value: a.v[i], color: a.c[i] >= a.o[i] ? '#22c55e88' : '#ef444488' } : { time })));
        overlays(a.v);
        break;
      }
      case 'delivery': {
        const s = chart.addSeries(LWC.HistogramSeries, { priceFormat: volumeFormat, color: '#14b8a699', priceLineVisible: false, lastValueVisible: false }, idx);
        s.setData(pts(a.dq));
        overlays(a.dq);
        break;
      }
      case 'delpct': {
        line(a.delpct, '#a78bfa', { lineWidth: 2, priceFormat: { type: 'price', precision: 1, minMove: 0.1 }, lastValueVisible: true });
        overlays(a.delpct);
        break;
      }
      case 'rsi': {
        const vals = rsi(a.c, pane.params.period || 14);
        const s = line(vals, '#f59e0b', { lineWidth: 2, priceFormat: { type: 'price', precision: 1, minMove: 0.1 }, lastValueVisible: true });
        [70, 30].forEach(p => s.createPriceLine({ price: p, color: '#475569', lineWidth: 1, lineStyle: 2, axisLabelVisible: false }));
        overlays(vals);
        break;
      }
      case 'macd': {
        const m = macd(a.c, pane.params.fast || 12, pane.params.slow || 26, pane.params.signal || 9);
        const h = chart.addSeries(LWC.HistogramSeries, { priceLineVisible: false, lastValueVisible: false }, idx);
        h.setData(t.map((time, i) => (Number.isFinite(m.hist[i]) ? { time, value: m.hist[i], color: m.hist[i] >= 0 ? '#22c55e88' : '#ef444488' } : { time })));
        line(m.line, '#38bdf8', { lineWidth: 2 });
        line(m.signal, '#f59e0b', { lineWidth: 1 });
        overlays(m.line);
        break;
      }
      case 'afl': this._buildAflPane(chart, LWC, pane, idx); break;
      case 'custom': {
        const vals = applyTransform(sourceArray(a, pane.params.source), pane.params.transform, pane.params.period);
        // volume-like data and their averages read better as 12.3M than as 12345678.00
        const quantity = (pane.params.source === 'volume' || pane.params.source === 'delivery') &&
          ['none', 'sma', 'ema'].includes(pane.params.transform || 'none');
        line(vals, '#38bdf8', { lineWidth: 2, lastValueVisible: true, ...(quantity ? { priceFormat: volumeFormat } : {}) });
        overlays(vals);
        break;
      }
      default: break;
    }
  }

  // ---- a pane driven by an AFL formula ----
  _buildAflPane(chart, LWC, pane, idx) {
    const a = this.arrays, t = a.t;
    const info = { errors: [], params: [], legend: [], notes: [] };
    this.paneInfo.set(pane.id, info);
    const f = formulaStore.get(pane.params.formulaId);
    if (!f) { info.errors.push('The formula for this pane was deleted. Tap the pane title to remove the pane or choose another formula.'); return; }

    const res = aflEngine.run(f.code, a, { symbol: this.sheet ? this.sheet.symbol : '', params: pane.params.values || {} });
    info.errors = res.errors; info.params = res.params; info.title = res.title;

    const PALETTE = ['#38bdf8', '#f59e0b', '#a78bfa', '#f472b6', '#34d399', '#f87171', '#fbbf24', '#e2e8f0'];
    let nextColor = 0;
    const baseColor = (c) => {
      if (c instanceof Float64Array) { for (let i = c.length - 1; i >= 0; i--) { const h = colorToHex(c[i]); if (h) return h; } return PALETTE[nextColor++ % PALETTE.length]; }
      return colorToHex(c) || PALETTE[nextColor++ % PALETTE.length];
    };
    const pointColor = (c, i) => (c instanceof Float64Array ? colorToHex(c[i]) : null);
    const format = (data, name) => {
      let mx = 0;
      for (let i = 0; i < data.length; i++) { const v = Math.abs(data[i]); if (v > mx && Number.isFinite(v)) mx = v; }
      if (mx >= 1e5 || /volume|deliver/i.test(name || '')) return { type: 'volume' };
      if (mx < 1) return { type: 'price', precision: 4, minMove: 0.0001 };
      if (mx < 10) return { type: 'price', precision: 3, minMove: 0.001 };
      return { type: 'price', precision: 2, minMove: 0.01 };
    };

    let first = null;
    res.plots.forEach((p, k) => {
      if (p.noLine && p.kind === 'line' && !p.dots) return;
      const isOhlc = p.kind === 'candle' || p.kind === 'bar';
      const color = isOhlc ? (colorToHex(typeof p.color === 'number' ? p.color : -1) || '#94a3b8') : baseColor(p.color);
      const common = { priceLineVisible: false, lastValueVisible: !p.noLabel && p.kind !== 'hist' };
      if (p.ownScale) common.priceScaleId = `own_${pane.id}_${k}`;
      let s;
      if (p.kind === 'candle' || p.kind === 'bar') {
        const o = p.ohlc, scalar = typeof p.color === 'number' ? colorToHex(p.color) : null;
        const up = scalar || COLORS.up, down = scalar || COLORS.down;
        const data = t.map((time, i) => {
          if (!Number.isFinite(o.c[i]) || !Number.isFinite(o.o[i]) || !Number.isFinite(o.h[i]) || !Number.isFinite(o.l[i])) return { time };
          const pt = { time, open: o.o[i], high: o.h[i], low: o.l[i], close: o.c[i] };
          const pc = pointColor(p.color, i);
          if (pc) { pt.color = pc; pt.wickColor = pc; pt.borderColor = pc; }
          return pt;
        });
        s = p.kind === 'candle'
          ? chart.addSeries(LWC.CandlestickSeries, { ...common, lastValueVisible: true, priceLineVisible: true, upColor: up, downColor: down, borderVisible: false, wickUpColor: up, wickDownColor: down }, idx)
          : chart.addSeries(LWC.BarSeries, { ...common, lastValueVisible: true, priceLineVisible: true, upColor: up, downColor: down }, idx);
        s.setData(data);
        if (!this.mainSeries) this.mainSeries = s;
      } else if (p.kind === 'hist') {
        s = chart.addSeries(LWC.HistogramSeries, { ...common, color, priceFormat: format(p.data, p.name) }, idx);
        s.setData(t.map((time, i) => {
          if (!Number.isFinite(p.data[i])) return { time };
          const pc = pointColor(p.color, i);
          return pc ? { time, value: p.data[i], color: pc } : { time, value: p.data[i] };
        }));
      } else if (p.kind === 'area') {
        s = chart.addSeries(LWC.AreaSeries, { ...common, lineColor: color, topColor: color + '55', bottomColor: color + '08', lineWidth: p.thick ? 3 : 2, priceFormat: format(p.data, p.name) }, idx);
        s.setData(t.map((time, i) => (Number.isFinite(p.data[i]) ? { time, value: p.data[i] } : { time })));
      } else {
        s = chart.addSeries(LWC.LineSeries, {
          ...common, color, lineWidth: p.thick ? 2 : 1, crosshairMarkerVisible: false, priceFormat: format(p.data, p.name),
          lineStyle: p.dashed ? 2 : 0, lineType: p.step ? 1 : 0,
          ...(p.dots ? { lineVisible: false, pointMarkersVisible: true, pointMarkersRadius: 2 } : {}),
        }, idx);
        s.setData(t.map((time, i) => {
          if (!Number.isFinite(p.data[i])) return { time };
          const pc = pointColor(p.color, i);
          return pc ? { time, value: p.data[i], color: pc } : { time, value: p.data[i] };
        }));
      }
      if (p.ownScale) {
        try { s.priceScale().applyOptions({ scaleMargins: p.kind === 'hist' ? { top: 0.78, bottom: 0 } : { top: 0.1, bottom: 0.1 }, visible: false }); } catch (e) { /* ignore */ }
      }
      if (!first) first = s;
      if (p.name && !isOhlc && !(p.kind === 'hist' && p.ownScale)) info.legend.push({ name: p.name, color });
    });

    // horizontal grid lines, and arrows from PlotShapes
    const anchor = () => {
      if (first) return first;
      first = chart.addSeries(LWC.LineSeries, { lineVisible: false, lastValueVisible: false, priceLineVisible: false, crosshairMarkerVisible: false }, idx);
      first.setData(t.map((time, i) => (Number.isFinite(a.c[i]) ? { time, value: a.c[i] } : { time })));
      return first;
    };
    for (const g of res.grids) {
      try { anchor().createPriceLine({ price: g.level, color: colorToHex(g.color) || '#475569', lineWidth: 1, lineStyle: 2, axisLabelVisible: false }); } catch (e) { /* ignore */ }
    }
    const markers = [];
    for (const sh of res.shapes) {
      for (let i = 0; i < t.length; i++) {
        const code = Math.round(sh.shapes[i]);
        if (!(code > 0)) continue;
        const kind = shapeKind(code);
        const down = !!kind.down;
        const pos = sh.position === 'above' ? 'aboveBar' : sh.position === 'below' ? 'belowBar' : (down ? 'aboveBar' : 'belowBar');
        const col = colorToHex(sh.color instanceof Float64Array ? sh.color[i] : sh.color) || (down ? COLORS.down : COLORS.up);
        markers.push(kind.text !== undefined
          ? { time: t[i], position: pos, shape: 'circle', color: col, text: kind.text, size: 0.5 }
          : { time: t[i], position: pos, shape: kind.shape, color: col, size: 1 });
      }
    }
    if (markers.length) {
      const m = markers.length > 4000 ? markers.slice(-4000) : markers;
      try { (LWC.createSeriesMarkers || (() => {}))(anchor(), m); } catch (e) { info.notes.push('Arrows could not be drawn: ' + e.message); }
    }
    if (!res.plots.length && !markers.length && !res.grids.length && !res.errors.length) {
      info.notes.push('This formula draws nothing on a chart. It is meant for Scanner / Exploration.');
    }
  }

  // ---- small tappable titles over each pane ----
  _scheduleLabels() {
    if (this._labelTimer) cancelAnimationFrame(this._labelTimer);
    this._labelTimer = requestAnimationFrame(() => { this._labelTimer = requestAnimationFrame(() => this._layoutLabels()); });
  }

  _layoutLabels() {
    if (!this.labels) return;
    this.labels.innerHTML = '';
    if (!this.chart || !this.sheet) return;
    const wrap = this.labels.getBoundingClientRect();
    const panes = this.chart.panes();
    this.sheet.panes.forEach((p, i) => {
      const el = panes[i] && panes[i].getHTMLElement();
      if (!el) return;
      const r = el.getBoundingClientRect();
      const div = document.createElement('button');
      div.type = 'button';
      div.className = 'pane-label';
      div.style.left = `${Math.max(0, r.left - wrap.left) + 6}px`;
      div.style.top = `${Math.max(0, r.top - wrap.top) + 4}px`;
      const info = this.paneInfo.get(p.id);
      const esc = (x) => String(x).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
      let ov = (p.overlays || []).map(o => `<span style="color:${o.color}">${overlayTitle(o)}</span>`).join(' ');
      if (info && info.legend.length) ov = info.legend.slice(0, 6).map(l => `<span style="color:${l.color}">${esc(l.name)}</span>`).join(' ');
      const warn = info && info.errors.length ? ' <span style="color:#f87171" title="Formula problem">⚠</span>' : (info && info.notes.length ? ' <span style="color:#fbbf24">ⓘ</span>' : '');
      div.innerHTML = `<span class="pane-label-name">${esc(paneTitle(p))}</span>${ov ? ' ' + ov : ''}${warn} <span class="pane-label-dots">⋯</span>`;
      div.title = info && info.errors.length ? info.errors.join('\n') : (info && info.notes.length ? info.notes.join('\n') : 'Tap to edit this pane');
      div.addEventListener('click', (e) => { e.stopPropagation(); if (this.onPaneClick) this.onPaneClick(p.id); });
      this.labels.appendChild(div);
    });
  }

  // ---- view buttons ----
  fitAll() {
    if (!this.chart) return;
    try {
      this.chart.priceScale('right').applyOptions({ autoScale: true });
      this.chart.panes().forEach((_, i) => { try { this.chart.priceScale('right', i).applyOptions({ autoScale: true }); } catch (e) { /* ignore */ } });
      this.chart.timeScale().fitContent();
    } catch (e) { console.warn('fitAll failed', e); }
  }

  goLatest() {
    if (!this.chart) return;
    try {
      this.chart.panes().forEach((_, i) => { try { this.chart.priceScale('right', i).applyOptions({ autoScale: true }); } catch (e) { /* ignore */ } });
      this.chart.timeScale().scrollToRealTime();
    } catch (e) { console.warn('goLatest failed', e); }
  }
}

// app.js imports this singleton
export const chartEngine = new ChartEngine('chart-container', 'pane-labels');
