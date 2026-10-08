/**
 * ChartEngine - Handles Multi-Pane Chart Stack & Lightweight Charts v5 Integration
 */
export class ChartEngine {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
    this.panes = new Map(); // Store pane instances: { id, chart, mainSeries, overlaySeries }
    this.primaryPaneId = "pane-main-price";
    this.symbol = "RELIANCE";
    this.interval = "D";
    this.syncingTime = false;
  }

  initChart() {
    if (!this.container) return;
    this.container.innerHTML = "";

    // Safely retrieve TradingView Lightweight Charts global (v5 compatible)
    const LWC = window.LightweightCharts;
    if (!LWC) {
      console.error("[ChartEngine] LightweightCharts library not found on window.");
      return;
    }

    // Build Main Price Pane
    this.createPane(this.primaryPaneId, { heightRatio: 0.7, showTimeScale: true });
  }

  createPane(paneId, options = {}) {
    const LWC = window.LightweightCharts;
    const paneElement = document.createElement("div");
    paneElement.id = paneId;
    paneElement.className = "w-full min-h-0 relative border-b border-slate-800 flex-1";
    this.container.appendChild(paneElement);

    const chartOptions = {
      layout: {
        background: { color: "#020617" },
        textColor: "#94a3b8",
        fontSize: 11,
      },
      grid: {
        vertLines: { color: "#1e293b" },
        horzLines: { color: "#1e293b" },
      },
      crosshair: {
        mode: LWC.CrosshairMode ? LWC.CrosshairMode.Normal : 1,
      },
      rightPriceScale: {
        borderColor: "#334155",
        scaleMargins: { top: 0.1, bottom: 0.1 },
      },
      timeScale: {
        borderColor: "#334155",
        visible: options.showTimeScale !== undefined ? options.showTimeScale : true,
        timeVisible: true,
        secondsVisible: false,
      },
      width: paneElement.clientWidth || this.container.clientWidth || 800,
      height: paneElement.clientHeight || 300,
    };

    const chart = LWC.createChart(paneElement, chartOptions);

    // FIX FOR V5: Use LWC.CandlestickSeries inside chart.addSeries(...)
    const CandlestickSeries = LWC.CandlestickSeries || "Candlestick";
    const mainSeries = chart.addSeries(CandlestickSeries, {
      upColor: "#22c55e",
      downColor: "#ef4444",
      borderVisible: false,
      wickUpColor: "#22c55e",
      wickDownColor: "#ef4444",
    });

    const paneObj = {
      id: paneId,
      element: paneElement,
      chart,
      mainSeries,
      indicators: new Map(),
    };

    this.panes.set(paneId, paneObj);
    this.setupResizeObserver(paneObj);
    this.bindCrosshairSync(paneObj);

    return paneObj;
  }

  setData(data) {
    const primary = this.panes.get(this.primaryPaneId);
    if (primary && primary.mainSeries) {
      primary.mainSeries.setData(data);
      primary.chart.timeScale().fitContent();
    }
  }

  setupResizeObserver(paneObj) {
    const resizeObserver = new ResizeObserver((entries) => {
      if (!entries || entries.length === 0) return;
      const { width, height } = entries[0].contentRect;
      if (paneObj.chart && width > 0 && height > 0) {
        paneObj.chart.applyOptions({ width, height });
      }
    });
    resizeObserver.observe(paneObj.element);
  }

  bindCrosshairSync(targetPane) {
    targetPane.chart.subscribeCrosshairMove((param) => {
      if (!param || !param.time) return;
      this.panes.forEach((pane) => {
        if (pane.id !== targetPane.id && pane.chart) {
          // Synchronize crosshair position across stacked panes
        }
      });
    });
  }

  setSymbolAndInterval(symbol, interval) {
    this.symbol = symbol;
    this.interval = interval;
    console.log(`[ChartEngine] Switched to Symbol: ${symbol}, Interval: ${interval}`);
  }
}