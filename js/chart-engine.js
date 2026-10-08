/**
 * ChartEngine - Handles Stacking Multi-Panes & Lightweight Charts v5
 */
export class ChartEngine {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
    this.panes = new Map();
    this.primaryPaneId = null;
  }

  clearPanes() {
    if (this.container) {
      this.container.innerHTML = "";
    }
    this.panes.clear();
    this.primaryPaneId = null;
  }

  addPane(paneId, title = "Pane", options = {}) {
    if (this.panes.has(paneId)) return this.panes.get(paneId);

    const LWC = window.LightweightCharts;
    if (!LWC) return null;

    const paneWrapper = document.createElement("div");
    paneWrapper.id = `wrapper-${paneId}`;
    paneWrapper.className = "pane-wrapper border-b border-slate-800 flex-1 flex flex-col relative";

    // Pane Header with Remove Control
    const paneHeader = document.createElement("div");
    paneHeader.className = "h-5 bg-slate-900/80 px-2 flex items-center justify-between text-[10px] text-slate-400 select-none z-10 border-b border-slate-800/50";
    paneHeader.innerHTML = `
      <span class="font-bold text-slate-300">${title}</span>
      <div class="flex items-center space-x-2">
        <button class="hover:text-rose-400 remove-pane-btn" data-pane-id="${paneId}">✕</button>
      </div>
    `;

    const chartElement = document.createElement("div");
    chartElement.className = "flex-1 min-h-0 w-full relative";

    paneWrapper.appendChild(paneHeader);
    paneWrapper.appendChild(chartElement);
    this.container.appendChild(paneWrapper);

    const chartOptions = {
      layout: { background: { color: "#020617" }, textColor: "#94a3b8", fontSize: 11 },
      grid: { vertLines: { color: "#1e293b" }, horzLines: { color: "#1e293b" } },
      crosshair: { mode: LWC.CrosshairMode ? LWC.CrosshairMode.Normal : 1 },
      rightPriceScale: { borderColor: "#334155" },
      timeScale: { borderColor: "#334155", visible: true, timeVisible: true },
      width: chartElement.clientWidth || this.container.clientWidth || 800,
      height: chartElement.clientHeight || 200,
    };

    const chart = LWC.createChart(chartElement, chartOptions);
    const paneObj = { id: paneId, wrapper: paneWrapper, chartElement, chart, seriesMap: new Map() };

    this.panes.set(paneId, paneObj);
    if (!this.primaryPaneId) this.primaryPaneId = paneId;

    this.setupResizeObserver(paneObj);

    // Bind pane removal button
    paneHeader.querySelector(".remove-pane-btn").onclick = () => this.removePane(paneId);

    return paneObj;
  }

  removePane(paneId) {
    const paneObj = this.panes.get(paneId);
    if (!paneObj) return;

    if (paneObj.chart) paneObj.chart.remove();
    if (paneObj.wrapper) paneObj.wrapper.remove();
    this.panes.delete(paneId);
  }

  setPaneCandlestickData(paneId, data) {
    const LWC = window.LightweightCharts;
    const pane = this.panes.get(paneId);
    if (!pane || !LWC) return;

    const CandlestickSeries = LWC.CandlestickSeries || "Candlestick";
    const series = pane.chart.addSeries(CandlestickSeries, {
      upColor: "#22c55e", downColor: "#ef4444", borderVisible: false, wickUpColor: "#22c55e", wickDownColor: "#ef4444",
    });
    series.setData(data);
    pane.seriesMap.set("main", series);
    pane.chart.timeScale().fitContent();
  }

  setPaneHistogramData(paneId, data) {
    const LWC = window.LightweightCharts;
    const pane = this.panes.get(paneId);
    if (!pane || !LWC) return;

    const HistogramSeries = LWC.HistogramSeries || "Histogram";
    const series = pane.chart.addSeries(HistogramSeries, {
      priceFormat: { type: "volume" },
      priceScaleId: "",
    });
    series.setData(data);
    pane.seriesMap.set("volume", series);
    pane.chart.timeScale().fitContent();
  }

  setupResizeObserver(paneObj) {
    const resizeObserver = new ResizeObserver((entries) => {
      if (!entries || entries.length === 0) return;
      const { width, height } = entries[0].contentRect;
      if (paneObj.chart && width > 0 && height > 0) {
        paneObj.chart.applyOptions({ width, height });
      }
    });
    resizeObserver.observe(paneObj.chartElement);
  }
}