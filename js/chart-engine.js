/**
 * ChartEngine - one chart with several stacked panes (TradingView Lightweight Charts v5).
 * The chart is rebuilt from the sheet's pane list whenever something changes; that keeps the
 * code simple and means what you see always matches the saved layout.
 */
import { barsToArrays, sma, ema, rsi, macd, sourceArray, applyTransform } from './indicators.js';
import { paneTitle, overlayTitle } from './workspace.js';

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
      const ov = (p.overlays || []).map(o => `<span style="color:${o.color}">${overlayTitle(o)}</span>`).join(' ');
      div.innerHTML = `<span class="pane-label-name">${paneTitle(p)}</span>${ov ? ' ' + ov : ''} <span class="pane-label-dots">⋯</span>`;
      div.title = 'Tap to edit this pane';
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
