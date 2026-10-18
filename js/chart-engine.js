/**
 * ChartEngine - one chart with several stacked panes (TradingView Lightweight Charts v5).
 * The chart is rebuilt from the sheet's pane list whenever something changes; that keeps the
 * code simple and means what you see always matches the saved layout.
 */
import { barsToArrays, sma, ema, rsi, macd, sourceArray, applyTransform } from './indicators.js';
import { paneTitle, overlayTitle } from './workspace.js';
import { aflEngine, colorToHex, shapeKind } from './afl-engine.js';
import { formulaStore } from './formula-store.js';
import { intervalName } from './timeframe.js';
import { isIntraday, frameMinutes, chartTime } from './intraday.js';
import { pseudoStore } from './pseudo-store.js';
import { CloudPrimitive, VapPrimitive } from './chart-primitives.js';
import { tradeMarkers, signalMarkers, tradeSpan } from './trade-view.js';

const COLORS = { up: '#22c55e', down: '#ef4444', grid: '#1e293b', border: '#334155', text: '#94a3b8', bg: '#020617' };
const DEFAULT_BARS_SHOWN = 45;       // a fresh chart opens on about 2 months of daily bars so every candle is readable; "Fit" shows everything
const DEFAULT_BARS_INTRADAY = 120;

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
    this.guiEvents = {};       // { paneId: [{id, code}] } clicks on on-chart controls, consumed by the next draw
    this.guiKnown = {};        // { paneId: [ids] } controls the formula created last time (for guiNew / guiExisting)
    this.onGuiEvent = null;    // (paneId, {id, code}) => void
    this.onGuiState = null;    // (paneId, state) => void
    this.triggers = {};        // { paneId: { buttonName: 1 } } set by a ParamTrigger button, consumed by the next draw
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
    // intraday bars carry 'YYYY-MM-DD HH:MM' labels; the chart needs a number for them
    this.intraday = isIntraday(sheet.interval);
    this.times = this.intraday ? this.arrays.t.map(chartTime) : this.arrays.t;
    if (this._foreignInterval !== (sheet.interval || 'D')) { this._foreignInterval = sheet.interval || 'D'; this.foreign = {}; this.foreignAsked = new Set(); this.foreignFailed = new Set(); }
    this.mainSeries = null;
    this.paneInfo = new Map();

    const chart = LWC.createChart(this.container, {
      autoSize: true,
      localization: { locale: 'en-IN' },   // fixed, so an odd browser language setting can never break the chart
      layout: { background: { color: COLORS.bg }, textColor: COLORS.text, fontSize: 11, panes: { separatorColor: COLORS.border, separatorHoverColor: '#475569' } },
      grid: { vertLines: { color: COLORS.grid }, horzLines: { color: COLORS.grid } },
      crosshair: { mode: LWC.CrosshairMode ? (this.crosshairOn === false ? LWC.CrosshairMode.Hidden : LWC.CrosshairMode.Normal) : 1,
        vertLine: { color: 'rgba(148,163,184,0.75)', width: 1, labelBackgroundColor: '#334155' }, horzLine: { color: 'rgba(148,163,184,0.75)', width: 1, labelBackgroundColor: '#334155' } },
      rightPriceScale: { borderColor: COLORS.border, scaleMargins: { top: 0.1, bottom: 0.08 } },
      timeScale: { borderColor: COLORS.border, timeVisible: this.intraday, secondsVisible: false, rightOffset: 4 },
    });
    this.chart = chart;
    this.firstVisible = prevRange ? Math.max(0, Math.floor(prevRange.from)) : Math.max(0, this.arrays.t.length - this.defaultBars());

    // remember the first series of every pane: the drawing tools use it to turn prices into pixels
    this.paneSeries = [];
    const origAdd = chart.addSeries;
    chart.addSeries = (...args) => { const sr = origAdd.apply(chart, args); if (!this.paneSeries[args[2]]) this.paneSeries[args[2]] = sr; return sr; };
    sheet.panes.forEach((pane, idx) => this._buildPane(chart, LWC, pane, idx));
    chart.addSeries = origAdd;

    const panes = chart.panes();
    sheet.panes.forEach((p, i) => { if (panes[i]) panes[i].setStretchFactor(p.weight || 1); });
    if (sheet.logScale) { try { chart.priceScale('right', 0).applyOptions({ mode: 1 }); } catch (e) { /* log scale not available */ } }   // View > Logarithmic scale

    // tap a candle = select it: its information stays in the header (and a line marks it) until you tap it again
    if (!keepRange || this.selected === null || this.selected === undefined || this.selected >= this.barCount) this.selected = null;
    if (chart.subscribeClick) chart.subscribeClick((param) => {
      if (!param || param.logical === undefined || param.logical === null || !param.point) return;
      if (this.suppressSelect && this.suppressSelect()) return;
      const i = Math.round(param.logical); if (i < 0 || i >= this.barCount) return;
      // price under the finger (price pane only): the crosshair is pinned there, so it stays on screen after the touch
      let price = NaN; if (!param.paneIndex) { try { const sr = this.paneSeries && this.paneSeries[0]; if (sr) price = sr.coordinateToPrice(param.point.y); } catch (e) { /* ignore */ } }
      let same = i === this.selected;
      if (same && this.crosshairOn !== false && Number.isFinite(price) && Number.isFinite(this.selPrice)) { try { const y0 = this.paneSeries[0].priceToCoordinate(this.selPrice); same = Math.abs(y0 - param.point.y) < 16; } catch (e) { /* keep */ } }
      this.select(same ? null : i, { price });
    });
    try { chart.timeScale().subscribeVisibleLogicalRangeChange(() => this._placeSel()); } catch (e) { /* ignore */ }
    chart.subscribeCrosshairMove((param) => {
      if (!this.onHover) return;
      if (!param || param.logical === undefined || param.logical === null || !param.point) { this.onHover(this.selected === null ? null : this.selected); return; }
      const i = Math.round(param.logical);
      this.onHover(i >= 0 && i < this.barCount ? i : null);
    });

    const n = this.barCount;
    if (n > 0) {
      try {
        if (prevRange) chart.timeScale().setVisibleLogicalRange(prevRange);
        else if (n > this.defaultBars() + 10) chart.timeScale().setVisibleLogicalRange({ from: n - this.defaultBars(), to: n + 4 });
        else chart.timeScale().fitContent();
      } catch (e) { chart.timeScale().fitContent(); }
    }
    try { this._drawTrades(LWC); } catch (e) { console.warn('Trade arrows failed:', e); }
    if (this.onRendered) { try { this.onRendered(); } catch (e) { console.warn('Drawing layer failed:', e); } }
    this._pin(); this._placeSel(); this._scheduleLabels();
    this.triggers = {}; this.guiEvents = {};      // a button press fires exactly once
    if (this.onFormulaErrors) {
      for (const [paneId, info] of this.paneInfo) if (info.errors.length) this.onFormulaErrors(paneId, info.errors);
    }
  }

  // ---- Buy / Sell arrows of backtest trades (set by tools > Analysis > trade list; see trade-view.js) ----
  _drawTrades(LWC) {
    const st = this.tradeState;
    if (!st || !st.symbol || !st.trades.length || !this.sheet || st.symbol !== this.sheet.symbol || !this.mainSeries || !LWC.createSeriesMarkers) return;
    const labels = this.arrays.t, t = this.times;
    const m = (st.kind === 'signals' ? signalMarkers : tradeMarkers)(labels, st.trades, { mode: st.mode, index: st.index }).map((x) => ({ time: t[x.idx], position: x.position, shape: x.shape, color: x.color, size: x.size, text: x.text }));
    LWC.createSeriesMarkers(this.mainSeries, m);
    if (st.focus) {
      st.focus = false;
      const span = tradeSpan(labels, st.trades[st.index] || st.trades[0]);
      if (span) { try { this.chart.timeScale().setVisibleLogicalRange(span); } catch (e) { /* ignore */ } }
    }
  }

  // ---- building one pane ----
  _buildPane(chart, LWC, pane, idx) {
    const a = this.arrays;
    const t = this.times;
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

  // ---- a pane driven by one or more AFL formulas (the pane's own formula + layers inserted into it) ----
  _foreignMap() {
    const m = {};
    for (const [k, v] of Object.entries(this.foreign || {})) m[k] = v;
    for (const nm of pseudoStore.names()) m[nm] = pseudoStore.get(nm);
    return m;
  }

  _buildAflPane(chart, LWC, pane, idx) {
    const refs = [{ key: pane.id, ref: pane.params, primary: true }, ...(pane.params.layers || []).map((l) => ({ key: l.id, ref: l }))];
    const shared = { first: null, nextColor: 0, markers: [], grids: [], anchorSeries: null, opts: null };
    const paneInfo = { errors: [], params: [], legend: [], notes: [], gui: [], layers: [] };
    this.paneInfo.set(pane.id, paneInfo);
    for (const r of refs) this._buildLayer(chart, LWC, pane, idx, r, shared, paneInfo);
    this._finishPane(chart, LWC, pane, idx, shared, paneInfo);
  }

  _futureTimes(k) {
    const t = this.times, out = []; if (!t.length || k <= 0) return out;
    if (this.intraday) { const step = frameMinutes(this.sheet.interval) * 60; for (let i = 1; i <= k; i++) out.push(t[t.length - 1] + step * i); return out; }
    const d = new Date(t[t.length - 1] + 'T00:00:00Z');
    while (out.length < k) { d.setUTCDate(d.getUTCDate() + 1); const w = d.getUTCDay(); if (w !== 0 && w !== 6) out.push(d.toISOString().slice(0, 10)); }
    return out;
  }

  _buildLayer(chart, LWC, pane, idx, { key, ref, primary }, shared, paneInfo) {
    const a = this.arrays, t = this.times, N = t.length;
    const info = { errors: [], params: [], legend: [], notes: [], key, formulaId: ref.formulaId };
    if (!primary) this.paneInfo.set(key, info);
    const f = formulaStore.get(ref.formulaId);
    if (!f) { info.errors.push('The formula for this pane was deleted. Tap the pane title to remove the pane or choose another formula.'); paneInfo.errors.push(...info.errors); return; }
    const sheet = this.sheet || {};
    const res = aflEngine.run(f.code, a, {
      symbol: sheet.symbol || '', formulaName: f.name, params: ref.values || {}, triggers: this.triggers[key] || {}, guiState: ref.gui || {},
      guiEvents: this.guiEvents[key] || [], guiKnown: this.guiKnown[key] || [], interval: sheet.interval || 'D', intervalName: intervalName(sheet.interval),
      priceStyle: sheet.priceStyle || 'candle', chartId: idx + 1, foreign: this._foreignMap(), firstVisible: this.firstVisible || 0, action: 1,
      lastBacktestFormula: this.lastBacktestFormula || '', baseIndex: this.baseIndex || 'NIFTY',
    });
    info.errors = res.errors; info.params = res.params; info.title = res.title; info.gui = res.gui || []; info.text = res.text; info.res = res;
    this.guiKnown[key] = info.gui.map((c) => c.id);
    if (res.guiState && JSON.stringify(res.guiState) !== JSON.stringify(ref.gui || {}) && this.onGuiState) this.onGuiState(key, res.guiState);
    if (primary) Object.assign(paneInfo, { params: res.params, title: res.title, text: res.text, res });
    paneInfo.errors.push(...res.errors); paneInfo.gui.push(...info.gui.map((c) => ({ ...c, _key: key })));
    paneInfo.layers.push(info);
    if (res.text && !paneInfo.notes.length) { /* text output is shown from the pane menu */ }
    for (const need of res.needSymbols || []) this._requestForeign(need);
    const missing = (res.needSymbols || []).filter((x) => !(this.foreign && this.foreign[x]) && !pseudoStore.has(x));
    if (missing.length) paneInfo.notes.push(`Needs data for: ${missing.join(', ')}. ${this.foreignFailed && missing.some((m) => this.foreignFailed.has(m)) ? 'It could not be loaded (check the symbol name).' : 'Loading...'}`);

    const PAL = ['#38bdf8', '#f59e0b', '#a78bfa', '#f472b6', '#34d399', '#f87171', '#fbbf24', '#e2e8f0'];
    const baseColor = (c) => {
      if (c instanceof Float64Array) { for (let i = c.length - 1; i >= 0; i--) { const h = colorToHex(c[i]); if (h) return h; } return PAL[shared.nextColor++ % PAL.length]; }
      return colorToHex(c) || PAL[shared.nextColor++ % PAL.length];
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
    // time of bar j after an XShift (positive = into the future)
    const maxShift = Math.max(0, ...res.plots.map((p) => Math.max(0, p.xshift || 0)));
    const fut = this._futureTimes(maxShift);
    const timeAt = (j) => (j < N ? t[j] : fut[j - N]);
    const series = (vals, shift, mk) => {
      const out = [];
      const k = shift || 0, from = Math.max(0, -k);
      for (let i = from; i < N; i++) { const j = i + k, tm = timeAt(j); if (tm === undefined) continue; out.push(mk(tm, i)); }
      return out;
    };

    const ordered = res.plots.map((p, k) => ({ p, k })).sort((x, y) => (x.p.zorder || 0) - (y.p.zorder || 0));
    ordered.forEach(({ p, k }) => {
      if (p.hidden || (p.noLine && p.kind === 'line' && !p.dots)) return;
      const lid = `${key}_${k}`;
      const sc = p.left ? { priceScaleId: 'left' } : {};
      const common = { priceLineVisible: false, lastValueVisible: !p.noLabel && p.kind !== 'hist', ...sc };
      if (p.ownScale) common.priceScaleId = `own_${lid}`;
      const limits = (p.minY !== undefined || p.maxY !== undefined || p.noRescale)
        ? { autoscaleInfoProvider: (orig) => { if (p.noRescale) return null; const o = orig(); if (!o) return o; return { ...o, priceRange: { minValue: p.minY !== undefined ? p.minY : o.priceRange.minValue, maxValue: p.maxY !== undefined ? p.maxY : o.priceRange.maxValue } }; } } : {};
      let s;
      if (p.kind === 'cloud') {
        const colors = Array.from({ length: N }, (_, i) => pointColor(p.color, i) || colorToHex(typeof p.color === 'number' ? p.color : -1) || '#94a3b8');
        const k0 = p.xshift || 0, top = new Float64Array(N + maxShift + 1).fill(NaN), bot = new Float64Array(N + maxShift + 1).fill(NaN), cc = [];
        for (let i = 0; i < N; i++) { const j = i + k0; if (j >= 0 && j < top.length) { top[j] = p.top[i]; bot[j] = p.bottom[i]; cc[j] = colors[i]; } }
        const times = Array.from({ length: N + fut.length }, (_, j) => timeAt(j));
        shared.cloudQueue = shared.cloudQueue || [];
        shared.cloudQueue.push({ times, top: top.subarray(0, times.length), bottom: bot.subarray(0, times.length), colors: cc, behind: (p.zorder || 0) < 0 });
        return;
      }
      if (p.kind === 'candle' || p.kind === 'bar') {
        const o = p.ohlc, scalar = typeof p.color === 'number' ? colorToHex(p.color) : null;
        const up = scalar || COLORS.up, down = scalar || COLORS.down;
        const data = series(null, p.xshift, (time, i) => {
          if (![o.c[i], o.o[i], o.h[i], o.l[i]].every(Number.isFinite)) return { time };
          const pt = { time, open: o.o[i], high: o.h[i], low: o.l[i], close: o.c[i] };
          const pc = pointColor(p.color, i);
          if (pc) { pt.color = pc; pt.wickColor = pc; pt.borderColor = pc; }
          return pt;
        });
        s = p.kind === 'candle'
          ? chart.addSeries(LWC.CandlestickSeries, { ...common, ...limits, lastValueVisible: true, priceLineVisible: true, upColor: up, downColor: down, borderVisible: false, wickUpColor: up, wickDownColor: down }, idx)
          : chart.addSeries(LWC.BarSeries, { ...common, ...limits, lastValueVisible: true, priceLineVisible: true, upColor: up, downColor: down }, idx);
        s.setData(data);
        if (!this.mainSeries) this.mainSeries = s;
      } else if (p.kind === 'hist') {
        const color = baseColor(p.color);
        s = chart.addSeries(LWC.HistogramSeries, { ...common, ...limits, color, priceFormat: format(p.data, p.name) }, idx);
        s.setData(series(null, p.xshift, (time, i) => {
          if (!Number.isFinite(p.data[i])) return { time };
          const pc = pointColor(p.color, i);
          return pc ? { time, value: p.data[i], color: pc } : { time, value: p.data[i] };
        }));
      } else if (p.kind === 'area' || p.kind === 'gradient') {
        const color = baseColor(p.color), g = p.kind === 'gradient' && p.gradient ? p.gradient : null;
        const top = g ? (colorToHex(g.top) || color) : color, bottom = g ? (colorToHex(g.bottom) || color) : color;
        s = chart.addSeries(LWC.AreaSeries, { ...common, ...limits, lineColor: p.kind === 'gradient' ? color : color, topColor: g ? top + 'aa' : color + '55', bottomColor: g ? bottom + '33' : color + '08', lineWidth: p.thick ? 3 : 2, priceFormat: format(p.data, p.name) }, idx);
        s.setData(series(null, p.xshift, (time, i) => (Number.isFinite(p.data[i]) ? { time, value: p.data[i] } : { time })));
      } else {
        const color = baseColor(p.color);
        s = chart.addSeries(LWC.LineSeries, {
          ...common, ...limits, color, lineWidth: p.thick ? 2 : 1, crosshairMarkerVisible: false, priceFormat: format(p.data, p.name),
          lineStyle: p.dashed ? 2 : 0, lineType: p.step ? 1 : 0,
          ...(p.dots ? { lineVisible: false, pointMarkersVisible: true, pointMarkersRadius: 2 } : {}),
        }, idx);
        s.setData(series(null, p.xshift, (time, i) => {
          if (!Number.isFinite(p.data[i])) return { time };
          const pc = pointColor(p.color, i);
          return pc ? { time, value: p.data[i], color: pc } : { time, value: p.data[i] };
        }));
      }
      if (p.ownScale) {
        try { s.priceScale().applyOptions({ scaleMargins: p.kind === 'hist' ? { top: 0.78, bottom: 0 } : { top: 0.1, bottom: 0.1 }, visible: false }); } catch (e) { /* ignore */ }
      }
      if (!shared.first && !p.ownScale && !p.noRescale) shared.first = s;
      shared.anchorSeries = shared.anchorSeries || s;
      const isOhlc = p.kind === 'candle' || p.kind === 'bar';
      if (p.name && !isOhlc && !p.noTitle && !(p.kind === 'hist' && p.ownScale)) paneInfo.legend.push({ name: p.name, color: baseColor(p.color) });
      if (shared.legendOwner === undefined) shared.legendOwner = true;
    });

    shared.grids.push(...res.grids);
    shared.vap = (shared.vap || []).concat(res.vap || []);
    if (res.options && res.options.chartoptions) shared.chartoptions = res.options.chartoptions;
    for (const sh of res.shapes) {
      for (let i = 0; i < N; i++) {
        const code = Math.round(sh.shapes[i]);
        if (!(code > 0)) continue;
        const kind = shapeKind(code), down = !!kind.down;
        const pos = sh.position === 'above' ? 'aboveBar' : sh.position === 'below' ? 'belowBar' : (down ? 'aboveBar' : 'belowBar');
        const col = colorToHex(sh.color instanceof Float64Array ? sh.color[i] : sh.color) || (down ? COLORS.down : COLORS.up);
        shared.markers.push(kind.text !== undefined
          ? { time: t[i], position: pos, shape: 'circle', color: col, text: kind.text, size: 0.5 }
          : { time: t[i], position: pos, shape: kind.shape, color: col, size: 1 });
      }
    }
    if (!res.plots.length && !res.shapes.length && !res.grids.length && !res.vap.length && !res.errors.length) {
      if (res.usesSignals || (res.vars && res.vars.positionscore)) info.notes.push('This formula has trading rules only (no chart). Run it from Tools > Analysis.');
      else if (res.filter || res.columns.length) info.notes.push('This formula is an Exploration / Scan. Run it from Tools > Analysis.');
      else if (res.text) info.notes.push('This formula writes text. Open the pane menu and choose "Text output".');
      else info.notes.push('This formula draws nothing on a chart.');
      paneInfo.notes.push(...info.notes);
    }
  }

  _finishPane(chart, LWC, pane, idx, shared, paneInfo) {
    const a = this.arrays, t = this.times;
    const anchor = () => {
      if (shared.first) return shared.first;
      if (shared.anchorSeries) return shared.anchorSeries;
      shared.first = chart.addSeries(LWC.LineSeries, { lineVisible: false, lastValueVisible: false, priceLineVisible: false, crosshairMarkerVisible: false }, idx);
      shared.first.setData(t.map((time, i) => (Number.isFinite(a.c[i]) ? { time, value: a.c[i] } : { time })));
      return shared.first;
    };
    const co = shared.chartoptions || [];
    const gridFlags = Number(co[2]) || 0;
    const grids = [...shared.grids];
    if (gridFlags & 1) grids.push({ level: 30, color: 15 }); if (gridFlags & 4) grids.push({ level: 70, color: 15 }); if (gridFlags & 2) grids.push({ level: 50, color: 15 }); if (gridFlags & 8) grids.push({ level: 50, color: 15 });
    for (const g of grids) {
      try { anchor().createPriceLine({ price: g.level, color: colorToHex(g.color) || '#475569', lineWidth: 1, lineStyle: 2, axisLabelVisible: false }); } catch (e) { /* ignore */ }
    }
    if ((Number(co[1]) || 0) & 4) { try { chart.priceScale('right', idx).applyOptions({ mode: 1 }); } catch (e) { /* log scale not available */ } }
    if (shared.markers.length) {
      const m = shared.markers.length > 4000 ? shared.markers.slice(-4000) : shared.markers;
      try { (LWC.createSeriesMarkers || (() => {}))(anchor(), m); } catch (e) { paneInfo.notes.push('Arrows could not be drawn: ' + e.message); }
    }
    for (const c of shared.cloudQueue || []) {
      try { anchor().attachPrimitive(new CloudPrimitive({ ...c })); } catch (e) { paneInfo.notes.push('Cloud could not be drawn: ' + e.message); }
    }
    for (const v of shared.vap || []) {
      try { anchor().attachPrimitive(new VapPrimitive({ times: t, high: a.h, low: a.l, volume: a.v, spec: v, color: colorToHex(v.color) || '#fbbf24' })); } catch (e) { paneInfo.notes.push('Volume-at-price could not be drawn: ' + e.message); }
    }
  }

  // other symbols a formula asked for (Foreign, SetForeign, PlotForeign, RelStrength...): load once, then redraw
  _requestForeign(sym) {
    this.foreign = this.foreign || {}; this.foreignAsked = this.foreignAsked || new Set(); this.foreignFailed = this.foreignFailed || new Set();
    if (this.foreign[sym] || this.foreignAsked.has(sym) || pseudoStore.has(sym) || !this.loadForeign) return;
    this.foreignAsked.add(sym);
    Promise.resolve(this.loadForeign(sym)).then((bars) => {
      if (bars && bars.t && bars.t.length) { this.foreign[sym] = bars; if (this.onForeignLoaded) this.onForeignLoaded(sym); }
      else { this.foreignFailed.add(sym); if (this.onForeignLoaded) this.onForeignLoaded(sym); }
    }).catch(() => { this.foreignFailed.add(sym); if (this.onForeignLoaded) this.onForeignLoaded(sym); });
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
      if (info && info.gui && info.gui.length) {
        const base = { left: Math.max(0, r.left - wrap.left), top: Math.max(0, r.top - wrap.top) };
        info.gui.forEach((def) => this.labels.appendChild(this._guiControl(def, p, info, base)));
      }
    });
  }


  // ---- on-chart GUI controls (GuiButton, GuiCheckBox, GuiSlider, GuiEdit, GuiRadio, GuiDateTime) ----
  _guiControl(def, pane, info, base) {
    const key = def._key || pane.id;
    const ref = key === pane.id ? pane.params : ((pane.params.layers || []).find((l) => l.id === key) || pane.params);
    const st = (ref.gui && ref.gui[def.id]) || {};
    const box = document.createElement('div');
    box.className = 'gui-ctl';
    box.style.left = `${base.left + def.x}px`;
    box.style.top = `${base.top + def.y}px`;
    box.style.width = `${Math.max(20, def.w)}px`;
    box.style.height = `${Math.max(16, def.h)}px`;
    const stop = (e) => e.stopPropagation();
    ['pointerdown', 'mousedown', 'touchstart', 'click', 'wheel'].forEach((ev) => box.addEventListener(ev, stop, { passive: true }));

    // remember what the user did, then tell the formula (only for the actions it asked to hear about)
    const act = (patch, code, others = {}) => {
      const all = JSON.parse(JSON.stringify(ref.gui || {}));
      for (const [id, pt] of Object.entries(others)) all[id] = { ...(all[id] || {}), ...pt };
      all[def.id] = { ...(all[def.id] || {}), ...patch };
      ref.gui = all;
      if (this.onGuiState) this.onGuiState(key, all);
      if ((def.flags & code) && this.onGuiEvent) this.onGuiEvent(key, { id: def.id, code });
    };
    const NOTIFY_CLICKED = 1, NOTIFY_HITRETURN = 8, NOTIFY_EDITCHANGE = 16;
    let input;
    switch (def.type) {
      case 'button': {
        input = document.createElement('button'); input.type = 'button'; input.textContent = def.text;
        input.onclick = () => act({}, NOTIFY_CLICKED);
        break;
      }
      case 'checkbox': case 'radio': {
        const lab = document.createElement('label'); lab.className = 'gui-row';
        const cb = document.createElement('input'); cb.type = def.type === 'radio' ? 'radio' : 'checkbox'; cb.checked = !!st.checked;
        cb.onchange = () => {
          const others = {};
          if (def.type === 'radio') for (const o of info.gui) if (o.type === 'radio' && o.group === def.group && o.id !== def.id) others[o.id] = { checked: 0 };
          act({ checked: cb.checked ? 1 : 0 }, NOTIFY_CLICKED, others);
          if (def.type === 'radio') this._scheduleLabels();
        };
        lab.appendChild(cb); lab.appendChild(document.createTextNode(' ' + def.text));
        input = lab; input._disable = cb;
        break;
      }
      case 'slider': {
        input = document.createElement('input'); input.type = 'range';
        input.min = def.min; input.max = def.max; input.step = def.step || 1;
        input.value = st.value !== undefined ? Math.min(def.max, Math.max(def.min, st.value)) : def.min;
        input.title = input.value;
        input.oninput = () => { input.title = input.value; };
        input.onchange = () => act({ value: Number(input.value) }, NOTIFY_EDITCHANGE);
        break;
      }
      case 'edit': {
        input = document.createElement('input'); input.type = 'text'; input.value = st.text !== undefined ? st.text : '';
        input.onchange = () => act({ text: input.value }, NOTIFY_EDITCHANGE);
        input.onkeydown = (e) => { if (e.key === 'Enter') act({ text: input.value }, NOTIFY_HITRETURN); };
        break;
      }
      case 'datetime': {
        input = document.createElement('input'); input.type = 'date';
        input.value = st.text || (this.arrays && this.arrays.t.length ? this.arrays.t[this.arrays.t.length - 1] : '');
        input.onchange = () => { if (input.value) act({ text: input.value }, NOTIFY_EDITCHANGE); };
        break;
      }
      default: input = document.createElement('span');
    }
    (input._disable || input).disabled = !def.enabled;
    box.appendChild(input);
    return box;
  }

  /** Select one candle (null = none): header information of that candle plus a thin line on it. */
  select(i, { price = NaN } = {}) {
    this.selected = i === null || i === undefined ? null : i; this.selPrice = this.selected === null ? NaN : price;
    this._pin(); this._placeSel(); if (this.onHover) this.onHover(this.selected);
  }
  /** Keeps the crosshair on the selected candle (a finger lifted from the screen would otherwise make it vanish). */
  _pin() {
    if (!this.chart) return;
    try {
      if (this.selected === null || this.selected === undefined || this.crosshairOn === false) { this.chart.clearCrosshairPosition && this.chart.clearCrosshairPosition(); return; }
      const sr = this.paneSeries && this.paneSeries[0] ? this.paneSeries[0] : this.mainSeries, a = this.arrays;
      const p = Number.isFinite(this.selPrice) ? this.selPrice : a.c[this.selected];
      if (this.chart.setCrosshairPosition && sr) this.chart.setCrosshairPosition(p, this.times[this.selected], sr);
    } catch (e) { /* older library: the dashed line still marks the candle */ }
  }
  _placeSel() {
    const ws = this.container && this.container.parentNode; if (!ws) return;
    if (!this.selLine) { this.selLine = document.createElement('div'); Object.assign(this.selLine.style, { position: 'absolute', top: '0', bottom: '0', width: '0', borderLeft: '1px dashed rgba(56,189,248,0.8)', pointerEvents: 'none', zIndex: '15', display: 'none' }); ws.appendChild(this.selLine); }
    let x = NaN; if (this.chart && this.selected !== null && this.selected !== undefined) { try { x = this.chart.timeScale().logicalToCoordinate(this.selected); } catch (e) { /* ignore */ } }
    if (x === null || x === undefined || !Number.isFinite(x)) { this.selLine.style.display = 'none'; return; }
    this.selLine.style.left = `${Math.round(x)}px`; this.selLine.style.display = 'block';
  }
  defaultBars() { return this.intraday ? DEFAULT_BARS_INTRADAY : DEFAULT_BARS_SHOWN; }
  /** Crosshair on / off (remembered by the caller). */
  setCrosshair(on) {
    this.crosshairOn = !!on;
    const LWC = window.LightweightCharts; if (!this.chart || !LWC || !LWC.CrosshairMode) return;
    try { this.chart.applyOptions({ crosshair: { mode: on ? LWC.CrosshairMode.Normal : LWC.CrosshairMode.Hidden } }); } catch (e) { /* ignore */ }
    this._pin();
    if (!on && this.onHover) this.onHover(this.selected === undefined ? null : this.selected);
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
