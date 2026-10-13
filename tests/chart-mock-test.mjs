// Run: node tests/chart-mock-test.mjs  -- drives ChartEngine with a MOCK of Lightweight Charts (the real library cannot be
// downloaded in the test sandbox). It proves our code calls the chart API consistently for every built-in formula; it does not
// prove how the real library draws. Open the app in a browser to check the visuals.
import { makeBars } from './data.mjs';
const calls = { series: 0, prims: 0, markers: 0, priceLines: 0 };
const mkSeries = () => ({ setData(d) { if (!Array.isArray(d)) throw new Error('setData needs an array'); this.n = d.length; }, priceScale() { return { applyOptions() {} }; },
  createPriceLine() { calls.priceLines++; }, attachPrimitive(p) { calls.prims++; if (!p.paneViews) throw new Error('bad primitive'); p.attached({ chart: chartObj, series: this, requestUpdate() {} }); const v = p.paneViews()[0]; if (!v.zOrder() || !v.renderer().draw) throw new Error('bad pane view'); }, applyOptions() {} });
const chartObj = {
  addSeries(type, opts, pane) { if (!type) throw new Error('unknown series type'); if (typeof pane !== 'number') throw new Error('pane index'); calls.series++; return mkSeries(); },
  panes() { return Array.from({ length: 8 }, () => ({ setStretchFactor() {}, getHTMLElement() { return { getBoundingClientRect: () => ({ left: 0, top: 0 }) }; } })); },
  timeScale() { return { getVisibleLogicalRange: () => ({ from: 0, to: 100 }), setVisibleLogicalRange() {}, fitContent() {}, timeToCoordinate: () => 10, scrollToRealTime() {} }; },
  priceScale() { return { applyOptions() {} }; }, subscribeCrosshairMove() {}, remove() {},
};
const T = new Proxy({}, { get: (_, k) => String(k) });
globalThis.window = { LightweightCharts: { createChart: () => chartObj, CrosshairMode: { Normal: 0 }, createSeriesMarkers: () => { calls.markers++; }, LineSeries: 'L', CandlestickSeries: 'C', BarSeries: 'B', HistogramSeries: 'H', AreaSeries: 'A' } };
globalThis.document = { getElementById: () => ({ innerHTML: '', addEventListener() {}, getBoundingClientRect: () => ({ left: 0, top: 0 }), appendChild() {} }), createElement: () => ({ style: {}, appendChild() {}, addEventListener() {}, set innerHTML(v) {}, setAttribute() {} }), addEventListener() {} };
globalThis.ResizeObserver = class { observe() {} };
globalThis.requestAnimationFrame = (f) => 0; globalThis.cancelAnimationFrame = () => {};
globalThis.localStorage = { getItem: () => null, setItem() {} };

const { chartEngine } = await import('../js/chart-engine.js');
const { BUILTIN_FORMULAS } = await import('../js/builtin-formulas.js');
const bars = makeBars(700);
const rows = bars.t.map((d, i) => ({ symbol: 'X', date: d, open: bars.o[i], high: bars.h[i], low: bars.l[i], close: bars.c[i], volume: bars.v[i], delivery: bars.dq[i] }));
let fail = 0, n = 0;
chartEngine.loadForeign = async () => null;
for (const f of BUILTIN_FORMULAS) {
  if (f.kind === 'exploration') continue;
  n++;
  const sheet = { id: 's', symbol: 'X', interval: 'D', priceStyle: 'candle', panes: [{ id: 'p1', kind: 'afl', weight: 1, overlays: [], params: { formulaId: 'b:price', values: {}, layers: [{ id: 'l1', formulaId: f.id || 'b:' + f.key, values: {}, gui: {} }] } }] };
  try { chartEngine.render(sheet, rows); const info = chartEngine.paneInfo.get('p1'); const li = chartEngine.paneInfo.get('l1'); if (li && li.errors.length && !/Needs|deleted/.test(li.errors[0])) { fail++; console.log('FAIL', f.key, li.errors[0]); } }
  catch (e) { fail++; console.log('FAIL', f.key, e.stack.split('\n').slice(0, 3).join(' | ')); }
}
console.log(`${n} formulas rendered through the mock chart (${calls.series} series, ${calls.prims} primitives, ${calls.markers} marker sets); ${fail} failed`);
process.exit(fail ? 1 : 0);
