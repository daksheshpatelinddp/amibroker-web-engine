// Run: node tests/chart-mock-test.mjs  -- drives ChartEngine with a MOCK of Lightweight Charts (the real library cannot be
// downloaded in the test sandbox). It proves our code calls the chart API consistently for every built-in formula; it does not
// prove how the real library draws. Open the app in a browser to check the visuals.
import { makeBars } from './data.mjs';
const calls = { series: 0, prims: 0, markers: 0, priceLines: 0 };
const mkSeries = () => ({ setData(d) { if (!Array.isArray(d)) throw new Error('setData needs an array'); this.n = d.length; if (d.length) globalThis.__tt = typeof d[0].time; }, priceScale() { return { applyOptions() {} }; },
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
// intraday frames: every formula again on 5-minute and 45-minute bars. The chart must get numeric times.
{
  const { buildFrame } = await import('../js/intraday.js');
  const day0 = Date.UTC(2026, 9, 1, 3, 45) / 1000, five = [];
  for (let d = 0; d < 12; d++) for (let i = 0; i < 75; i++) { const p = 100 + Math.sin((d * 75 + i) / 20) * 5 + i * 0.01; five.push({ t: day0 + d * 86400 + i * 300, o: p, h: p + 1, l: p - 1, c: p + 0.3, v: 1000 + i }); }
  for (const [tf, mins] of [['5m', 5], ['45m', 45], ['120m', 120]]) {
    const irows = buildFrame(five, mins, 'X'); let bad = 0, cnt = 0;
    for (const f of BUILTIN_FORMULAS) {
      if (f.kind === 'exploration') continue; cnt++;
      const sheet = { id: 's', symbol: 'X', interval: tf, priceStyle: 'candle', panes: [{ id: 'p1', kind: 'afl', weight: 1, overlays: [], params: { formulaId: 'b:price', values: {}, layers: [{ id: 'l1', formulaId: f.id || 'b:' + f.key, values: {}, gui: {} }] } }] };
      try { globalThis.__tt = ''; chartEngine.render(sheet, irows); const li = chartEngine.paneInfo.get('l1'); if (li && li.errors.length && !/Needs|deleted/.test(li.errors[0])) { bad++; console.log('FAIL', tf, f.key, li.errors[0]); } if (globalThis.__tt !== 'number') { bad++; console.log('FAIL', tf, f.key, 'time type', globalThis.__tt); } }
      catch (e) { bad++; console.log('FAIL', tf, f.key, e.stack.split('\n').slice(0, 3).join(' | ')); }
    }
    fail += bad; console.log(`${cnt} formulas on ${tf} bars (${irows.length} bars): ${bad} failed`);
  }
}
console.log(`${n} formulas rendered through the mock chart (${calls.series} series, ${calls.prims} primitives, ${calls.markers} marker sets); ${fail} failed`);
process.exit(fail ? 1 : 0);
